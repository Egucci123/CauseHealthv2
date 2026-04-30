// supabase/functions/analyze-symptoms/index.ts
// Deploy: supabase functions deploy analyze-symptoms
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const [symptomsRes, medsRes, suppsRes, conditionsRes, profileRes, latestDrawRes] = await Promise.all([
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
      supabase.from('conditions').select('name, icd10').eq('user_id', userId).eq('is_active', true),
      supabase.from('profiles').select('sex, date_of_birth').eq('id', userId).single(),
      supabase.from('lab_draws').select('id').eq('user_id', userId).eq('processing_status', 'complete').order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const symptoms = symptomsRes.data ?? []; const meds = medsRes.data ?? [];
    const supps = suppsRes.data ?? [];
    const conditions = conditionsRes.data ?? [];
    const suppsStr = supps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') || 'None';
    const condStr = conditions.length > 0
      ? conditions.map((c: any) => `${c.name}${c.icd10 ? ` (ICD-10: ${c.icd10})` : ''}`).join(', ')
      : 'None reported';
    if (symptoms.length === 0) return new Response(JSON.stringify({ error: 'No symptoms to analyze' }), { status: 400, headers: corsHeaders });

    let labValues: any[] = [];
    if (latestDrawRes.data) { const { data } = await supabase.from('lab_values').select('marker_name, value, unit, optimal_flag').eq('draw_id', latestDrawRes.data.id).neq('optimal_flag', 'optimal'); labValues = data ?? []; }

    const profile = profileRes.data;
    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;
    const sex = profile?.sex ?? 'unknown';

    const sympStr = symptoms.map((s: any) => `${s.symptom} (severity: ${s.severity}/10, category: ${s.category})`).join('\n');
    const medsStr = meds.map((m: any) => m.name).join(', ') || 'None';
    const labStr = labValues.map((v: any) => `${v.marker_name}: ${v.value} ${v.unit} [${v.optimal_flag}]`).join('\n') || 'No abnormal findings';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
        system: `You are CauseHealth AI. Return ONLY valid JSON.

VOICE RULES (CRITICAL — every string in the JSON):
- 6th-grade reading level. No medical jargon without plain-English definition.
- One sentence per field max. Use words a 12-year-old understands.
- "Stress hormone" not "cortisol". "Inflammation" not "hs-CRP". "Thyroid is sluggish" not "hypothyroidism."
- Every pattern + autoimmune flag gets an "emoji" field as visual anchor.
- Add a "body_systems" array to each pattern (subset of: brain, heart, gut, hormones, energy, immune, blood, liver, kidney, joints, skin) so we can highlight a body diagram.

CAUSEHEALTH IS NOT A LONGEVITY OR FUNCTIONAL-MEDICINE APP. We are a clinical-translation tool. Every test must clear the "DOCTOR CAN'T REJECT IT" bar:
  - Standard, insurance-covered, primary-care-orderable diagnostic
  - Tied to a documented symptom, medication depletion, out-of-range marker, or standard-of-care baseline gap for age/sex
  - Specific ICD-10 code that justifies coverage
If a PCP could reasonably refuse — drop the test or rewrite the justification.
We do NOT recommend GI-MAP, hair tissue mineral, organic acids, food sensitivity, micronutrient panels, NMR lipid (unless lipids abnormal), VO2 max, DEXA <50, comprehensive thyroid antibodies in asymptomatic patients, or advanced cardiology <35.

CRITICAL RULES:
1. SEX-SPECIFIC RANGES: Use sex-appropriate reference ranges. NEVER use male testosterone ranges (e.g., 300-1000 ng/dL) for a female patient. For females: testosterone 15-70 ng/dL, free T 0.5-5.0 pg/mL, estradiol varies by cycle.
2. FEMALE HORMONES: Do NOT call estradiol, progesterone, FSH, or LH abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary dramatically by cycle phase.
3. PRIORITY ACTIONS: Maximum 4 actions total — the highest-leverage next steps. Do NOT generate 8-10 actions. Pick the most important.
4. TESTS — UNIVERSAL TRIAGE RULE. A test may ONLY appear in suggested_tests if it directly investigates ONE of:
   (a) a symptom the patient actually reported
   (b) a known depletion / side-effect from a current medication
   (c) an out-of-range / Watch-tier marker on this lab draw
   (d) a STANDARD-OF-CARE BASELINE TEST for the patient's age/sex that is MISSING from the draw
   (e) an early-detection marker pattern matching this patient

   NOT standard-of-care baseline (only via (a)/(b)/(c)/(e), never (d)): Cortisol, DHEA-S, Zinc, Free Testosterone, Homocysteine, MMA, Free T3, Free T4, Reverse T3, TPO/Tg antibodies, NMR lipid, GI-MAP, food sensitivity panels, organic acids, hair tissue mineral analysis.

   SYMPTOM → STANDARD-OF-CARE TEST MAPPING (trigger (a) for the listed symptoms — add the relevant baseline test if missing):
     Fatigue → CBC, ferritin, iron panel, B12+MMA, vitamin D, TSH, A1c, AM cortisol if HPA signs; men add total T+SHBG.
     Joint pain → hs-CRP, vitamin D, uric acid (RF/anti-CCP only if >6wk inflammatory).
     Can't lose weight → fasting insulin+HOMA-IR, A1c, TSH, AM cortisol, total T (men).
     Hair loss → ferritin+iron panel, vitamin D, TSH+TPO.
     Brain fog → B12+MMA, vitamin D, TSH, ferritin.
     Low mood → vitamin D, B12, TSH, AM cortisol; men add total T.
     Sleep issues → vitamin D, ferritin, AM cortisol, A1c, TSH.
     GI symptoms → CMP, albumin, tTG-IgA+total IgA.
     Acne → women: PCOS panel; men: liver panel + insulin.
     Cold/heat intolerance → TSH, free T3, free T4, ferritin.
     Palpitations → TSH, CMP, CBC.
     Restless legs → ferritin >75, iron panel, B12.
     Recurrent infections → vitamin D, CBC w/ differential, total IgA+IgG.
     Poor recovery → men: total T+SHBG; vitamin D, ferritin.
   ONE focused workup per symptom. No bundling. No functional-medicine extras.

   No "while we're at it" tests, no longevity wishlists. If you can't cite a trigger letter, drop it. One focused workup per entry — same organ system only. Do NOT bundle. Maximum 4 tests per pattern.
5. WRITING STYLE: Plain English. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Instead of "hepatocellular dysfunction" say "your liver is working harder than it should." Each "explanation" and "likely_mechanism" should be 1-2 sentences max — not paragraphs.
6. DO NOT speculate about conditions the patient has no evidence for. Only flag autoimmune conditions with supporting symptoms AND lab clues.
7. Frame as educational. Always recommend discussing with a healthcare provider.

7a. CONDITIONS — GROUND TRUTH RULE (CRITICAL):
   The user's DIAGNOSED CONDITIONS list in the user message is canonical. You MUST:
   - Use those EXACT condition names. UC is NEVER Crohn's. Hashimoto's is NEVER 'hypothyroidism' unless that's also stated.
   - Match ICD-10 codes to the stated diagnosis. UC = K51.x. Crohn's = K50.x. Never swap.
   - MEDICATIONS DO NOT REVEAL DIAGNOSES. A prescription tells you what a doctor wrote, not what the patient has, what's active, or what's been ruled out. Most drugs treat multiple conditions. Never infer or rename a diagnosis based on what's in the meds list. The user has Mesalamine because their doctor prescribed it for THEIR stated condition — not because of yours.
   - In autoimmune_flags, the user's stated conditions get "CONFIRMED — already in your medical history." Don't re-flag them.
   - Related conditions (enteropathic arthritis as a complication of UC, secondary hyperparathyroidism in vit D deficiency, etc.) must be labeled POSSIBLE / TO RULE OUT — never CONFIRMED.

8. COMMON-BUT-MISSED CONDITIONS (CATCH AGGRESSIVELY in suggested_tests):
   These are 1-10% prevalence, routinely missed. Surface them when patterns suggest them:
   - PCOS (women): testosterone + DHEA-S + LH:FSH + fasting insulin + SHBG. Trigger: irregular cycles, acne, hirsutism, weight gain, hair thinning, insulin resistance.
   - Hashimoto's: TPO + thyroglobulin antibodies. Trigger: TSH outside 1.0-2.5, thyroid symptoms, family history.
   - Subclinical hypothyroidism: Free T3 + Free T4 + reverse T3. Trigger: TSH 2.5-4.5 with symptoms.
   - Low T (men): total + free T + SHBG + estradiol + LH/FSH. Trigger: fatigue, weight gain, low libido in men — OR no testosterone test on record at any age (standard CauseHealth baseline for all men).
   - Perimenopause (women 35-50): FSH + estradiol + progesterone + AMH. Trigger: cycle/mood/sleep changes.
   - Adrenal/HPA-axis: AM cortisol + DHEA-S + ACTH. Trigger: chronic stress fatigue, salt cravings, anxiety.
   - Functional iron deficiency: full iron panel. Trigger: ferritin <50, hair loss, fatigue (esp menstruating women).
   - B12 status: MMA + homocysteine. Trigger: B12 <500, fatigue, brain fog, neuropathy.
   - NAFLD: liver ultrasound + GGT. Trigger: ALT >25.
   - Celiac: tTG-IgA + total IgA. Trigger: GI symptoms, iron deficiency, autoimmune disease.
   - SIBO: lactulose breath test. Trigger: persistent bloating, post-meal gas, IBS-like.
   - Sleep apnea: STOP-BANG. Trigger: snoring, daytime fatigue, weight, hypertension.
   - Endometriosis (women): pelvic ultrasound + GYN. Trigger: pelvic pain, heavy bleeding, infertility.
   These get flagged on day 1.

9. LIFESTYLE-FIRST GATE FOR RARE DISEASES (CRITICAL):
   Default users are overwhelmed and lazy — do NOT scare them with rare-disease screening on day 1. Most abnormal labs in young adults improve with 90 days of lifestyle change.
   Borderline-upper-normal values do NOT trigger rare-disease screening. RBC 5.96 / Hct 51.4 is NOT a JAK2 case.
   ApoB / lipid NMR are MAINSTREAM cardiology essentials, not rare-disease — they belong in suggested_tests when lipids are abnormal.
   ABSOLUTE BLOCKLIST — these tests CAN NEVER appear in suggested_tests unless the patient hits the hard urgent threshold:
     - JAK2 V617F → only when platelets >450 OR (RBC >6.0 AND Hct >54).
     - Celiac panel → only with persistent malabsorption + iron deficiency + GI symptoms.
     - HLA-B27 → only with persistent inflammatory back pain >90 days unresponsive to lifestyle.
     - ANA reflex → only when ANA already positive.
     - Myeloma panel (SPEP/UPEP) → only with globulin >3.5 + age <40 or persistent hypercalcemia.
     - Hereditary hemochromatosis genetics → only with ferritin >300 + sat >45%.
     - MTHFR genetics → never.
     - Pituitary MRI → only with prolactin >100.
     - 24h urinary cortisol → only with multiple Cushing's stigmata.
   Default suggested_tests should be ROUTINE PCP-orderable: lipid NMR, fasting insulin, iron panel, thyroid (Free T3/T4 + TPO), vitamin D, liver ultrasound, hsCRP, basic celiac IF GI symptoms. Rare-disease screening is the SECOND visit's job.`,
        messages: [{ role: 'user', content: `Analyze symptoms for root causes.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${sex}

DIAGNOSED CONDITIONS (TREAT AS GROUND TRUTH — NEVER substitute, rename, or replace these with related conditions): ${condStr}

SYMPTOMS:
${sympStr}

MEDICATIONS: ${medsStr}
SUPPLEMENTS (factor into root-cause reasoning — e.g., creatine raises creatinine artifact, biotin distorts thyroid labs, niacin can cause flushing/elevated liver enzymes, ashwagandha lowers cortisol, B12 supplementation can mask deficiency symptoms): ${suppsStr}

ABNORMAL LABS:
${labStr}

Return ONLY valid JSON: { "headline": "one 12-word verdict in plain English", "symptom_connections": [{ "emoji": "", "symptom": "", "severity": 7, "root_causes": [{ "cause": "", "type": "lab_finding|medication_depletion|autoimmune|lifestyle|unknown", "confidence": "high|moderate|low", "evidence": "1 sentence plain English", "lab_marker": null }], "interventions": [] }], "patterns": [{ "emoji": "", "pattern_name": "plain English (e.g. 'Tired and hormones off')", "body_systems": ["brain","hormones","energy"], "confidence": "high|moderate|low", "severity": "critical|high|moderate", "symptoms_involved": [], "explanation": "1 sentence plain English", "likely_mechanism": "1 sentence — no jargon", "suggested_tests": ["one focused test per entry"], "icd10_codes": [] }], "autoimmune_flags": [{ "emoji": "", "condition": "", "supporting_symptoms": [], "supporting_labs": [], "confidence": "", "next_step": "1 sentence" }], "priority_actions": [{ "emoji": "", "action": "verb-led 1 sentence", "urgency": "immediate|this_week|this_month", "rationale": "1 sentence why" }], "summary": "3 short sentences connecting the dots" }` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);
    let result = JSON.parse(rawText);

    // ── Rare-disease prose scrubber (mirrors analyze-labs / doctor-prep) ──
    // Even with explicit prompt rules, the AI sometimes inserts JAK2 / SPEP /
    // MTHFR / Cushing's / etc. into root-cause explanations or pattern text.
    // Strip any sentence that names one when the patient's markers don't meet
    // the gate threshold. Same source-of-truth as the labs/doctor-prep gates.
    try {
      const ctx = extractRareDiseaseContext(labValues, age);
      const blocked = buildRareDiseaseBlocklist(ctx);
      const STRUCTURAL_KEYS = new Set(['icd10', 'icd10_codes', 'symptom', 'condition', 'lab_marker']);
      const stripSentences = (text: string): string => {
        if (typeof text !== 'string' || !text) return text;
        const sentences = text.split(/(?<=[.!?])\s+/);
        const kept = sentences.filter(s => {
          for (const rule of blocked) {
            if (rule.allow) continue;
            if (rule.pattern.test(s)) return false;
          }
          return true;
        });
        return kept.join(' ').trim();
      };
      const walk = (val: any, key?: string): any => {
        if (typeof val === 'string') {
          if (key && STRUCTURAL_KEYS.has(key)) return val;
          return stripSentences(val);
        }
        if (Array.isArray(val)) return val.map(v => walk(v, key));
        if (val && typeof val === 'object') {
          const out: any = {};
          for (const k of Object.keys(val)) out[k] = walk(val[k], k);
          return out;
        }
        return val;
      };
      result = walk(result);
      // Drop top-level entries that got fully erased so they don't render as empty cards
      for (const k of ['symptom_connections', 'patterns', 'autoimmune_flags', 'priority_actions']) {
        if (Array.isArray(result[k])) {
          result[k] = result[k].filter((entry: any) =>
            entry && Object.values(entry).some(v => typeof v === 'string' ? v.length > 0 : (Array.isArray(v) ? v.length > 0 : !!v))
          );
        }
      }
    } catch (e) { console.error('[analyze-symptoms] scrub error:', e); }

    // Hard cap on suggested_tests across all patterns — backstop against
    // longevity-wishlist regressions. Tests beyond the cap are dropped from
    // the LATEST patterns first, preserving the most-clinically-relevant ones.
    if (Array.isArray(result.patterns)) {
      let total = 0;
      for (const p of result.patterns) {
        if (Array.isArray(p?.suggested_tests)) {
          if (p.suggested_tests.length > 4) p.suggested_tests = p.suggested_tests.slice(0, 4);
          total += p.suggested_tests.length;
        }
      }
      if (total > 8) {
        console.log(`[analyze-symptoms] capping suggested_tests across patterns: total ${total} -> 8`);
        // Trim from the end of the patterns array
        let remaining = 8;
        for (const p of result.patterns) {
          if (!Array.isArray(p?.suggested_tests)) continue;
          if (remaining >= p.suggested_tests.length) { remaining -= p.suggested_tests.length; continue; }
          p.suggested_tests = p.suggested_tests.slice(0, Math.max(0, remaining));
          remaining = 0;
        }
      }
    }

    await supabase.from('symptom_analyses').insert({ user_id: userId, analysis_data: result });
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
