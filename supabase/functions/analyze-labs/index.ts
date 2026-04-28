// supabase/functions/analyze-labs/index.ts
// Deploy with: supabase functions deploy analyze-labs
// Requires: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Parse the body BEFORE the try block so drawId is in scope of the catch.
  // Otherwise on any error we can't mark the draw as 'failed' and the user
  // sees the spinner forever.
  let drawId: string | undefined;
  let userId: string | undefined;
  try {
    const body = await req.json();
    drawId = body?.drawId;
    userId = body?.userId;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (!drawId || !userId) return new Response(JSON.stringify({ error: 'drawId and userId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [{ data: labValues }, { data: profile }, { data: meds }, { data: symptoms }, { data: conditionsData }] = await Promise.all([
      supabase.from('lab_values').select('*').eq('draw_id', drawId),
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('name, icd10').eq('user_id', userId).eq('is_active', true),
    ]);
    const conditions = conditionsData ?? [];
    const condStr = conditions.length > 0
      ? conditions.map((c: any) => `${c.name}${c.icd10 ? ` (${c.icd10})` : ''}`).join(', ')
      : 'None reported';

    if (!labValues?.length) return new Response(JSON.stringify({ error: 'No lab values found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Load supplements separately (own table)
    const { data: suppsData } = await supabase.from('user_supplements').select('name, dose, duration_category').eq('user_id', userId).eq('is_active', true);
    const supps: any[] = suppsData ?? [];

    // Build lab string. For very large panels (90+ markers), prioritize abnormal
    // values first so the AI focuses on what matters and never runs out of tokens
    // before it gets to the urgent stuff. Optimal-only markers get a compact summary.
    const PRIORITY_FLAGS = new Set(['urgent', 'monitor', 'deficient', 'elevated', 'suboptimal_low', 'suboptimal_high']);
    const isAbnormal = (v: any) => {
      const f = (v.optimal_flag ?? v.standard_flag ?? '').toLowerCase();
      return f && f !== 'optimal' && f !== 'normal';
    };
    const fmt = (v: any) => `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Std: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'})${v.optimal_flag ? ` [${v.optimal_flag.toUpperCase()}]` : ''}`;
    const abnormal = labValues.filter(isAbnormal);
    const optimal = labValues.filter((v: any) => !isAbnormal(v));
    const labStr = [
      `## ABNORMAL OR SUBOPTIMAL (${abnormal.length}) — ANALYZE EACH OF THESE`,
      ...abnormal.map(fmt),
      '',
      `## WITHIN OPTIMAL RANGE (${optimal.length}) — list for completeness, don't elaborate`,
      ...optimal.map(fmt),
    ].join('\n');
    void PRIORITY_FLAGS; // reserved for future targeting
    const medsStr = (meds ?? []).map((m: any) => m.name).join(', ');
    const sympStr = (symptoms ?? []).map((s: any) => `${s.symptom} (${s.severity}/10)`).join(', ');
    const suppsStr = supps.length > 0 ? supps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') : 'None reported';
    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;

    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 120000); // 120s — Supabase allows up to 150s
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        signal: apiController.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 10000,
          system: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — every string in JSON):
- 6th-grade reading level. No medical word without a 3-word definition right after.
- 1 sentence per field. Lead with the headline, not the wind-up.
- "Inflammation marker" not "hs-CRP". "Iron stores" not "ferritin". "Stress hormone" not "cortisol".
- Every priority_finding gets an "emoji" field (single emoji visual anchor).
- Every priority_finding gets a "headline" max 10 words, plain English.

CRITICAL RULES:
1. Flag EVERY value outside optimal range as a priority finding — do not skip any.
2. PATTERN RECOGNITION: Connect abnormal values across organ systems. Look for multi-marker patterns (e.g., elevated platelets + elevated RDW = iron deficiency; low HDL + borderline glucose = metabolic syndrome). Each pattern goes in the "patterns" array.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE. MANDATORY follow-ups (apply ALL that match):
   CORE PATTERNS:
   - Platelets >450 → JAK2 V617F + peripheral smear (rule out essential thrombocythemia/MPN).
   - Platelets >300 with elevated RDW or fatigue → iron panel + JAK2 if persistent.
   - RDW >13 → iron panel + B12/folate + reticulocyte count.
   - Glucose >90 → fasting insulin + HOMA-IR (insulin resistance hides behind 'normal' glucose).
   - HbA1c >5.4 → fasting insulin + HOMA-IR even if glucose normal.
   - TSH >2.5 OR <1.0 → free T3 + free T4 + TPO + thyroglobulin antibodies.
   - ALT >25 → liver ultrasound + hepatitis panel + GGT (NAFLD starts well before 'abnormal').
   - AST/ALT ratio >2 → screen for alcoholic liver disease + macrocytic anemia.
   - Triglyceride/HDL ratio >3.5 → strongest insulin resistance predictor; order fasting insulin + HOMA-IR + ApoB.
   - Vitamin D <40 → repletion + recheck 8 weeks.
   - Homocysteine >8 → B12/folate/B6 + consider MTHFR.
   - hs-CRP >1 → full inflammatory workup + autoimmune screening.
   - WBC >10 → differential + infection/inflammation workup.
   - 3+ suboptimal values across organ systems → autoimmune + celiac + metabolic screening.
   - Ferritin <30 even with normal Hgb → functional iron deficiency (causes hair loss/fatigue/brain fog).
   - Low HDL (<50F/<40M) in young adult → insulin resistance + ApoB.
   - MCV >92 without anemia → B12/folate or alcohol/liver disease.
   - MCV <82 without anemia → iron deficiency or thalassemia trait → hemoglobin electrophoresis.
   - MCH/MCV mismatch (low MCV with normal MCH) → thalassemia trait screening (often missed).
   - Elevated globulin >3.0 → SPEP/UPEP for paraprotein (myeloma screening, especially in young adults).
   - Globulin >3.5 in patient under 40 → urgent SPEP + free light chains.
   - Calcium >10 (especially repeated) → PTH + vitamin D + 24h urine calcium (hyperparathyroidism).
   - Calcium variability across draws → repeat with PTH simultaneously.
   - Low CO2 <23 → metabolic acidosis workup (renal tubular acidosis, chronic diarrhea, malabsorption).
   - Polyuria/dilute urine + low specific gravity (<1.005) → diabetes insipidus screening.
   - Eosinophils >5% or absolute >0.5 → parasitic stool studies + IgE + atopic disease workup.
   - Lymphocytes >40% with absolute >4.0 → flow cytometry if persistent (CLL screening), check EBV/CMV.
   - Reverse T3 elevation (when tested) → assess for chronic stress, illness, or thyroid hormone resistance.
   - Positive ANA → reflex panel (anti-dsDNA, anti-Sm, anti-Ro/La, anti-Scl-70, anti-Jo-1).
   - Bilirubin 1.0-1.5 with normal liver enzymes → fractionate (Gilbert syndrome vs hemolysis).
   - Uric acid >6 (F) or >7 (M) in young adult → metabolic syndrome screening + consider lifestyle.
   - Elevated RBC + hematocrit at upper limit + bilirubin elevated → secondary polycythemia vs MPN (JAK2 + EPO level).
   No "within normal limits" dismissals.
4. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning.
5. FEMALE HORMONE RULE: Do NOT interpret estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless the value is extreme (e.g., FSH >40, estradiol <10 or >500, progesterone >30). These hormones vary dramatically by menstrual cycle phase. Do NOT build clinical narratives like "estrogen dominance" from a single blood draw without knowing cycle day.
6. EARLY DETECTION is the primary goal — find what a 12-minute doctor appointment would miss.
7. Write headlines and explanations in plain English. Instead of "hepatocellular dysfunction" say "your liver is working harder than it should." Keep explanations to 1-2 sentences max.
8. Frame as educational information for discussion with a healthcare provider.

9. COMMON-BUT-MISSED CONDITIONS (CATCH AGGRESSIVELY in missing_tests):
   These are 1–10% prevalence conditions that 12-min appointments routinely miss. Surface them when ANY suggestive pattern is present:
   - PCOS workup (women): testosterone + DHEA-S + LH:FSH + fasting insulin + SHBG + free androgen index. Trigger: irregular cycles, acne, hirsutism, weight gain, hair thinning, insulin resistance markers in a woman of reproductive age.
   - Hashimoto's: TPO + thyroglobulin antibodies. Trigger: TSH outside 1.0-2.5, OR fatigue+weight changes+hair loss.
   - Subclinical hypothyroidism: Free T3 + Free T4 + reverse T3. Trigger: TSH 2.5-4.5 with symptoms.
   - Low testosterone (men): total T + free T + SHBG + estradiol + LH/FSH. Trigger: men with fatigue, weight gain, low libido, OR T <500.
   - Perimenopause (women 35-50): FSH + estradiol + progesterone + AMH. Trigger: irregular cycles, hot flashes, mood/sleep changes.
   - Adrenal/HPA-axis: AM cortisol + DHEA-S + ACTH. Trigger: chronic stress fatigue, salt cravings, anxiety.
   - Functional iron deficiency: full iron panel. Trigger: ferritin <50 OR hair loss/fatigue/restless legs (especially menstruating women).
   - True B12 status: MMA + homocysteine. Trigger: B12 <500, fatigue, brain fog, neuropathy.
   - NAFLD: liver ultrasound + GGT. Trigger: ALT >25, especially with high triglycerides or insulin resistance.
   - Celiac: tTG-IgA + total IgA. Trigger: GI symptoms, iron deficiency, low albumin, family history, autoimmune disease.
   - SIBO: lactulose breath test. Trigger: persistent bloating, post-meal gas, IBS-like symptoms.
   - Sleep apnea: STOP-BANG + sleep study. Trigger: snoring, daytime fatigue, hypertension, weight, insulin resistance.
   - Endometriosis (women): pelvic ultrasound + GYN. Trigger: pelvic pain, heavy bleeding, infertility.
   These get flagged on day 1, not gated.

10. LIFESTYLE-FIRST GATE FOR RARE DISEASES (CRITICAL):
   The default user is overwhelmed. Do NOT scare them with rare-disease screening on day 1.
   Borderline-upper-normal values do NOT qualify as "queue for rare-disease screening." Just put those markers in retest_timeline like routine retests. Don't trigger JAK2 on RBC 5.96, don't trigger celiac on a single GI complaint, don't trigger ANA reflex on a single elevated marker.
   ApoB and lipid NMR are MAINSTREAM cardiology essentials, NOT rare-disease screening — those belong in missing_tests when lipids are abnormal.
   ABSOLUTE BLOCKLIST — these tests CAN NEVER appear in missing_tests unless the patient hits the hard urgent threshold:
     - JAK2 V617F → only when platelets >450 OR (RBC >6.0 AND Hct >54). Borderline-high RBC/Hct (e.g., 5.96 / 51.4) is NOT enough.
     - Erythropoietin level → same rule as JAK2.
     - Celiac panel (tTG-IgA) → only when persistent malabsorption symptoms or low albumin + iron deficiency + GI symptoms.
     - HLA-B27 → only with persistent inflammatory back pain >90 days unresponsive to lifestyle.
     - ANA reflex panel → only when ANA already positive on this draw.
     - Multiple myeloma panel (SPEP/UPEP/free light chains) → only with globulin >3.5 AND age <40, OR persistent hypercalcemia.
     - Hereditary hemochromatosis genetics → only with ferritin >300 AND transferrin saturation >45%.
     - MTHFR genetics → never in missing_tests (controversial utility).
     - Pituitary MRI → only with prolactin >100.
     - 24h urinary cortisol → only with multiple Cushing's stigmata.
     - Flow cytometry → only with critically abnormal absolute counts.
   Default missing_tests should feel ROUTINE for a primary care doctor: lipid NMR, fasting insulin, iron panel, vitamin D recheck, liver ultrasound, thyroid panel (Free T3/T4 + TPO), hsCRP, basic celiac IF GI symptoms. Rare-disease screening is the SECOND visit's job, not the first.`,
        messages: [{ role: 'user', content: `Analyze these labs:\n\nPatient: ${age ? `${age}yo ` : ''}${profile?.sex ?? 'unknown'}\nDIAGNOSED CONDITIONS (GROUND TRUTH — never substitute related conditions; UC ≠ Crohn's; never infer different diagnoses from medications): ${condStr}\nMedications: ${medsStr || 'None'}\nSupplements: ${suppsStr}\nSymptoms: ${sympStr || 'None'}\n\nLab Results:\n${labStr}\n\nSUPPLEMENT-LAB INTERACTION KNOWLEDGE (use when interpreting labs):\n- Biotin (B7) >5mg/day: falsely alters TSH, Free T3, Free T4, troponin. Patient should stop 48-72h before thyroid/cardiac labs.\n- Creatine: raises serum creatinine 0.1-0.3 mg/dL artificially. Do NOT diagnose kidney dysfunction without other markers (cystatin C). eGFR also falsely lowered.\n- Vitamin D3 supplementation: 25-OH vitamin D >50 reflects supplementation, not endogenous status.\n- Vitamin B12 / methylcobalamin: serum B12 dramatically elevated (often >2000) once supplementing. Use methylmalonic acid (MMA) for true status.\n- Iron supplements: raise serum iron, ferritin, iron saturation. Draw labs at trough.\n- Niacin (B3) high-dose: raises HDL 15-35%, lowers triglycerides 20-50%, lowers LDL, can elevate ALT and uric acid.\n- Omega-3 / fish oil 2-4g: lowers triglycerides 20-50%, lowers hs-CRP, mildly raises HDL.\n- Berberine: lowers fasting glucose, A1c, triglycerides, LDL.\n- Vitamin K2: lowers INR — interferes with warfarin monitoring.\n- DHEA: raises DHEA-S, testosterone, estradiol.\n- TRT/Testosterone: raises Hct/Hgb (polycythemia risk), suppresses LH/FSH, raises estradiol.\n- Whey/protein supplements: mildly raise BUN and creatinine.\n- Curcumin: lowers hs-CRP, mildly lowers ALT.\n- TMG / methylfolate / B12: lower homocysteine.\n- Saw palmetto: mildly lowers PSA — be aware in cancer screening.\n- Ashwagandha: lowers cortisol, may modulate thyroid.\n- Vitamin C high-dose: can falsely lower glucose readings on some assays.\n\nIf the patient takes any supplement that affects an abnormal lab marker, NOTE this in the explanation. DO NOT diagnose pathology that may be artifact (especially elevated creatinine on creatine, B12 on supplementation, thyroid markers on biotin).\n\nReturn JSON: { "score_headline": "one 12-word verdict in plain English", "priority_findings": [{ "emoji": "", "marker": "", "value": "", "flag": "urgent|monitor|optimal", "headline": "max 10 words plain English", "explanation": "1 sentence plain English, no jargon", "what_to_do": "1 short verb-led sentence" }], "patterns": [{ "emoji": "", "pattern_name": "plain English", "severity": "critical|high|medium", "markers_involved": [], "description": "1 sentence", "likely_cause": "1 sentence" }], "medication_connections": [{ "medication": "", "lab_finding": "", "connection": "" }], "supplement_connections": [{ "supplement": "", "lab_finding": "", "connection": "" }], "missing_tests": [{ "emoji": "🧪", "test_name": "", "why_needed": "1 sentence plain English", "icd10": "", "priority": "urgent|high|moderate" }], "immediate_actions": [{ "emoji": "", "action": "verb-led 1 sentence" }], "summary": "3 short sentences plain English" }` }],
        }),
      });
    } catch (e: any) {
      clearTimeout(apiTimeout);
      if (e?.name === 'AbortError') {
        await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
        return new Response(JSON.stringify({ error: 'Analysis timed out — please retry from your lab detail page' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw e;
    }
    clearTimeout(apiTimeout);

    if (!response.ok) {
      await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
      return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiRes = await response.json();
    const rawText = aiRes.content?.[0]?.text ?? '';
    const stopReason = aiRes.stop_reason ?? 'unknown';
    console.log(`[analyze-labs] stop_reason=${stopReason}, output_length=${rawText.length}`);
    let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lb = cleaned.lastIndexOf('}');
    if (lb > 0) cleaned = cleaned.slice(0, lb + 1);
    let analysis;
    try { analysis = JSON.parse(cleaned); } catch (parseErr) {
      console.error(`[analyze-labs] Parse failed. stop_reason=${stopReason}, first 500 chars:`, cleaned.slice(0, 500));
      // If truncated (max_tokens hit), try to salvage by closing open arrays/objects
      if (stopReason === 'max_tokens') {
        try {
          // Close any open arrays and objects
          let salvaged = cleaned;
          // Count open brackets
          const openBraces = (salvaged.match(/\{/g) || []).length - (salvaged.match(/\}/g) || []).length;
          const openBrackets = (salvaged.match(/\[/g) || []).length - (salvaged.match(/\]/g) || []).length;
          // Remove trailing comma and incomplete values
          salvaged = salvaged.replace(/,\s*$/, '').replace(/,\s*"[^"]*"?\s*$/, '');
          for (let i = 0; i < openBrackets; i++) salvaged += ']';
          for (let i = 0; i < openBraces; i++) salvaged += '}';
          analysis = JSON.parse(salvaged);
          console.log('[analyze-labs] Salvaged truncated JSON successfully');
        } catch {
          await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
          return new Response(JSON.stringify({ error: 'Parse failed — AI output was truncated' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
        return new Response(JSON.stringify({ error: `Parse failed: ${String(parseErr)}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Ensure panel_gaps array exists
    if (!Array.isArray(analysis.panel_gaps)) analysis.panel_gaps = [];

    // ── HARD POST-FILTER: scrub rare-disease screening from missing_tests when ──
    // ── the user's labs don't hit the urgent threshold. Belt-and-suspenders for ──
    // ── prompt drift. The AI keeps suggesting JAK2 etc. for borderline values.   ──
    {
      const findVal = (patterns: string[]): number | null => {
        for (const v of labValues) {
          const n = (v.marker_name ?? '').toLowerCase();
          if (patterns.some(p => n.includes(p))) {
            const num = Number(v.value);
            if (!Number.isNaN(num)) return num;
          }
        }
        return null;
      };
      const platelets = findVal(['platelet']);
      const rbc = findVal(['rbc', 'red blood cell']);
      const hct = findVal(['hematocrit', 'hct']);
      const ana = findVal(['ana ', 'anti-nuclear']);
      const globulin = findVal(['globulin']);
      const calcium = findVal(['calcium']);
      const ferritin = findVal(['ferritin']);
      const transferrinSat = findVal(['transferrin saturation', 'iron sat']);
      const prolactin = findVal(['prolactin']);
      const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31_557_600_000) : 99;

      // Age-aware thresholds. Reactive thrombocytosis / hyperferritinemia
      // are common in older patients (chronic disease, infection).
      // Same numbers in a young patient are more likely to reflect
      // primary disease and warrant earlier workup.
      const hgbVal = findVal(['hemoglobin', 'hgb']);
      const isYoung = age < 40;
      const isMidAge = age < 50;
      const allowJak2 =
        (platelets ?? 0) > 600 ||
        (isYoung && (platelets ?? 0) > 450) ||
        (isMidAge && (platelets ?? 0) > 500) ||
        ((rbc ?? 0) > 6.0 && (hct ?? 0) > 54) ||
        (isYoung && (rbc ?? 0) > 5.7 && (hct ?? 0) > 51) ||
        ((hgbVal ?? 0) > 17 && (hct ?? 0) > 52);
      const allowAnaReflex = (ana ?? 0) > 0;
      const allowMyeloma =
        (globulin ?? 0) > 5 ||
        ((globulin ?? 0) > 3.5 && isYoung) ||
        (calcium ?? 0) > 11.5;
      const allowHemochromGenetics =
        ((ferritin ?? 0) > 300 && (transferrinSat ?? 0) > 50) ||
        (isYoung && (ferritin ?? 0) > 200 && (transferrinSat ?? 0) > 45);
      const allowPituitaryMri = (prolactin ?? 0) > 100;
      const allowCalciumPth = (calcium ?? 0) > 11;

      const blockedPatterns: { pattern: RegExp; allow: boolean; label: string }[] = [
        { pattern: /\bjak2\b|v617f|erythropoietin|\bepo\b\s*level|peripheral\s+(blood\s+)?smear|myeloproliferative/i, allow: allowJak2, label: 'JAK2/EPO/peripheral smear' },
        { pattern: /\bana\b\s*reflex|anti-?dsdna|anti-?sm|anti-?ro|anti-?la|anti-?scl|anti-?jo/i, allow: allowAnaReflex, label: 'ANA reflex panel' },
        { pattern: /spep|upep|free\s+light\s+chain|multiple\s+myeloma/i, allow: allowMyeloma, label: 'Myeloma panel' },
        { pattern: /hereditary\s+hemochromatosis|hfe\s+gene/i, allow: allowHemochromGenetics, label: 'Hemochromatosis genetics' },
        { pattern: /pituitary\s+mri|sella\s+mri/i, allow: allowPituitaryMri, label: 'Pituitary MRI' },
        { pattern: /24-?hour\s+urinary\s+cortisol|cushing/i, allow: false, label: "Cushing's screening" },
        { pattern: /\bmthfr\b/i, allow: false, label: 'MTHFR' },
        { pattern: /hla-?b27/i, allow: false, label: 'HLA-B27 (gate to advanced_screening)' },
      ];

      const filterTests = (arr: any[] | undefined) => {
        if (!Array.isArray(arr)) return arr;
        return arr.filter((t: any) => {
          const name = `${t?.test_name ?? ''} ${t?.test ?? ''} ${t?.why_needed ?? ''} ${t?.clinical_justification ?? ''}`;
          for (const rule of blockedPatterns) {
            if (rule.pattern.test(name) && !rule.allow) {
              console.log(`[analyze-labs] Stripped blocked test "${t.test_name ?? t.test}" (${rule.label}) — does not meet urgent threshold`);
              return false;
            }
          }
          // Also dedupe: if same test_name appears twice in arr, drop later occurrences
          return true;
        }).filter((t: any, i: number, src: any[]) => {
          const k = (t?.test_name ?? t?.test ?? '').toLowerCase().trim();
          if (!k) return true;
          return src.findIndex((x: any) => (x?.test_name ?? x?.test ?? '').toLowerCase().trim() === k) === i;
        });
      };

      analysis.missing_tests = filterTests(analysis.missing_tests);
      // Filter the human-readable summary too — strip sentences that mention JAK2/etc when not allowed
      if (typeof analysis.summary === 'string') {
        for (const rule of blockedPatterns) {
          if (rule.allow) continue;
          // Drop sentences that mention the blocked test
          analysis.summary = analysis.summary.split(/(?<=[.!?])\s+/).filter((s: string) => !rule.pattern.test(s)).join(' ').trim();
        }
      }
    }

    // ── Plain-English pass ────────────────────────────────────────────────
    // Force 6th-grade reading level on every user-facing string. The model
    // sometimes slips jargon in despite the prompt; this guarantees it gets
    // rewritten before save. Doctor Prep is generated by a separate function
    // so we don't strip clinical terms there.
    const JARGON_REPLACEMENTS: [RegExp, string][] = [
      [/\bpolycythemia\b/gi, 'too many red blood cells'],
      [/\berythrocytosis\b/gi, 'too many red blood cells'],
      [/\bhemolysis\b/gi, 'red blood cells breaking down'],
      [/\bhemolytic\b/gi, 'red-cell-breakdown'],
      [/\bglobulins?\b/gi, 'blood proteins'],
      [/\bbone marrow\b/gi, 'where your blood is made'],
      [/\bbile metabolism\b/gi, 'how your liver clears waste'],
      [/\bbiliary\b/gi, 'bile-related'],
      [/\bhepatocellular\b/gi, 'liver-cell'],
      [/\bhepatic\b/gi, 'liver'],
      [/\bcholestasis\b/gi, 'slow bile flow'],
      [/\bnephropathy\b/gi, 'kidney problem'],
      [/\bproteinuria\b/gi, 'protein in your urine'],
      [/\bhematuria\b/gi, 'blood in your urine'],
      [/\bdyslipidemia\b/gi, 'unhealthy cholesterol pattern'],
      [/\bhyperlipidemia\b/gi, 'high cholesterol'],
      [/\bhyperglycemia\b/gi, 'high blood sugar'],
      [/\bhypoglycemia\b/gi, 'low blood sugar'],
      [/\bhyperkalemia\b/gi, 'high potassium'],
      [/\bhypokalemia\b/gi, 'low potassium'],
      [/\bhyponatremia\b/gi, 'low sodium'],
      [/\bhypernatremia\b/gi, 'high sodium'],
      [/\bhypercalcemia\b/gi, 'high calcium'],
      [/\bhypocalcemia\b/gi, 'low calcium'],
      [/\bhyperthyroid(ism)?\b/gi, 'overactive thyroid'],
      [/\bhypothyroid(ism)?\b/gi, 'underactive thyroid'],
      [/\bsubclinical\b/gi, 'mild, early'],
      [/\bidiopathic\b/gi, 'no clear cause yet'],
      [/\bautoimmune\b/gi, 'immune system attacking your body'],
      [/\binsulin resistance\b/gi, 'your body ignoring insulin'],
      [/\bmetabolic syndrome\b/gi, 'a cluster of belly-fat, blood sugar, and cholesterol problems'],
      [/\bischemia\b/gi, 'low blood flow'],
      [/\binflammation marker\b/gi, 'sign of inflammation'],
      [/\bmalabsorption\b/gi, "your gut not absorbing nutrients well"],
      [/\bUC[- ]related\b/gi, 'colitis-related'],
      [/\bUC[- ]driven\b/gi, 'colitis-driven'],
      [/\bIBD\b/g, 'inflammatory bowel disease'],
      [/\bGI\b/g, 'gut'],
      [/\bRBC\b/g, 'red blood cells'],
      [/\bWBC\b/g, 'white blood cells'],
      [/\bMCV\b/g, 'red cell size'],
      [/\bMCH\b/g, 'red cell hemoglobin'],
      [/\bRDW\b/g, 'red cell variation'],
      [/\bLDL\b/g, 'bad cholesterol'],
      [/\bHDL\b/g, 'good cholesterol'],
      [/\bApoB\b/g, 'cholesterol particle count'],
      [/\bLp\(a\)\b/g, 'genetic cholesterol'],
      [/\bHbA1c\b/gi, '3-month blood sugar average'],
      [/\bA1C\b/g, '3-month blood sugar average'],
      [/\bTSH\b/g, 'thyroid hormone'],
      [/\bDifferential diagnosis\b/gi, 'possible causes'],
      [/\betiology\b/gi, 'cause'],
      [/\bclinical correlation\b/gi, 'context'],
      [/\bworkup\b/gi, 'follow-up tests'],
    ];
    const plainify = (s: string): string => {
      let out = s;
      for (const [re, replacement] of JARGON_REPLACEMENTS) out = out.replace(re, replacement);
      return out;
    };
    const walkAndPlainify = (obj: any): any => {
      if (typeof obj === 'string') return plainify(obj);
      if (Array.isArray(obj)) return obj.map(walkAndPlainify);
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const k of Object.keys(obj)) result[k] = walkAndPlainify(obj[k]);
        return result;
      }
      return obj;
    };
    analysis = walkAndPlainify(analysis);

    await supabase.from('lab_draws').update({ analysis_result: analysis, processing_status: 'complete' }).eq('id', drawId);

    // Generate priority alerts from analysis findings
    if (analysis.priority_findings && Array.isArray(analysis.priority_findings)) {
      // Clear old alerts for this draw
      await supabase.from('priority_alerts').delete().eq('draw_id', drawId);
      const alerts = analysis.priority_findings.map((f: any) => ({
        user_id: userId,
        draw_id: drawId,
        status: f.flag === 'urgent' ? 'urgent' : f.flag === 'monitor' ? 'monitor' : 'optimal',
        title: f.headline || f.marker,
        description: f.explanation || null,
        source: f.marker || null,
        action_label: 'View Lab Detail',
        action_path: `/labs/${drawId}`,
        dismissed: false,
      }));
      if (alerts.length > 0) {
        await supabase.from('priority_alerts').insert(alerts);
      }
    }

    // Log detections — track every value outside optimal that standard labs call "normal"
    if (labValues && labValues.length > 0) {
      const detections = labValues
        .filter((v: any) => v.optimal_flag && v.optimal_flag !== 'optimal' && (!v.standard_flag || v.standard_flag === 'normal'))
        .map((v: any) => ({
          user_id: userId,
          detection_type: 'suboptimal_within_standard',
          marker_name: v.marker_name,
          value: v.value,
          optimal_high: v.optimal_high,
          standard_high: v.standard_high,
          condition_flagged: analysis.priority_findings?.find((f: any) => f.marker?.toLowerCase().includes(v.marker_name?.toLowerCase()))?.headline || null,
          test_recommended: analysis.missing_tests?.[0]?.test_name || null,
          severity: v.optimal_flag === 'deficient' || v.optimal_flag === 'elevated' ? 'critical' : v.optimal_flag === 'suboptimal_low' || v.optimal_flag === 'suboptimal_high' ? 'moderate' : 'moderate',
          was_within_standard_range: true,
        }));
      if (detections.length > 0) {
        await supabase.from('detections').delete().eq('user_id', userId);
        await supabase.from('detections').insert(detections);
      }
    }

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[analyze-labs] failed for draw', drawId, '-', String(err));
    // Mark draw as failed so it doesn't stay stuck in "processing"
    try {
      if (drawId) {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await sb.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
      }
    } catch (markErr) {
      console.error('[analyze-labs] could not mark draw failed', markErr);
    }
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
