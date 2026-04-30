// supabase/functions/analyze-labs/index.ts
// Deploy with: supabase functions deploy analyze-labs
// Requires: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';

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

    // ── CONCURRENCY GUARD ──────────────────────────────────────────────
    // If two callers fire at once (retry + auto-trigger before client guard,
    // or a retry while a previous call is still in flight), the second one
    // would race the first on lab_draws/priority_alerts writes and crash with
    // HTTP 500. Check current state first: if the draw is already 'complete'
    // with an analysis, it's a duplicate call — return success idempotently.
    const { data: currentDraw } = await supabase
      .from('lab_draws')
      .select('processing_status, analysis_result, updated_at')
      .eq('id', drawId)
      .single();
    if (currentDraw?.processing_status === 'complete' && currentDraw?.analysis_result) {
      // Only consider it a duplicate if completion happened in the last 60s.
      // Otherwise this might be a legitimate re-run on an old draw.
      const updatedAt = currentDraw.updated_at ? new Date(currentDraw.updated_at).getTime() : 0;
      if (Date.now() - updatedAt < 60_000) {
        return new Response(JSON.stringify({ ...currentDraw.analysis_result, _idempotent: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

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

    // Build lab string. Group by status: out-of-range first (the AI's
    // priority), then watch-tier, then healthy (compact). The flags here
    // come from the new range model — see labUploadStore.computeFlag.
    const isOutOfRange = (f: string) => ['low', 'high', 'critical_low', 'critical_high', 'deficient', 'elevated'].includes(f);
    const isWatch = (f: string) => ['watch', 'suboptimal_low', 'suboptimal_high'].includes(f);
    const fmt = (v: any) => `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Std: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'})${v.optimal_flag ? ` [${v.optimal_flag.toUpperCase()}]` : ''}`;
    const outOfRange = labValues.filter((v: any) => isOutOfRange((v.optimal_flag ?? v.standard_flag ?? '').toLowerCase()));
    const watch = labValues.filter((v: any) => isWatch((v.optimal_flag ?? '').toLowerCase()));
    const healthy = labValues.filter((v: any) => !isOutOfRange((v.optimal_flag ?? v.standard_flag ?? '').toLowerCase()) && !isWatch((v.optimal_flag ?? '').toLowerCase()));
    const labStr = [
      `## OUT OF STANDARD RANGE (${outOfRange.length}) — flag each as priority_finding with flag:"urgent"`,
      ...outOfRange.map(fmt),
      '',
      `## WATCH (${watch.length}) — within standard range but on the Watch list (HbA1c 5.4-5.6, ApoB ≥90, hs-CRP ≥0.5, fasting glucose 95-99, ferritin <50, etc.). Flag as priority_finding with flag:"monitor". One sentence each — no alarm.`,
      ...watch.map(fmt),
      '',
      `## HEALTHY (${healthy.length}) — within standard range, not on Watch list. DO NOT list these as priority_findings. Mention only if relevant to a pattern.`,
      ...healthy.map(fmt),
    ].join('\n');
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
- Inside HEADLINE, EXPLANATION, and WHAT_TO_DO fields use lay terms ("bad cholesterol", "iron stores", "stress hormone").
- BUT the "marker" field MUST be the EXACT marker name as it appears in the lab values list above (e.g. "LDL Cholesterol Calc", "RBC", "AST (SGOT)", "25-Hydroxy Vitamin D"). Copy it verbatim. The UI matches priority_findings to lab cards by this name — if you paraphrase ("bad cholesterol" or "red blood cells") the analysis won't appear under the correct marker card and the user will see lab values without explanations.
- EVERY out-of-range marker in the labs MUST have its own priority_finding entry with the exact marker name. Do not skip any.
- Every priority_finding gets an "emoji" field (single emoji visual anchor).
- Every priority_finding gets a "headline" max 10 words, plain English.

CRITICAL RULES:
1. RANGE MODEL — three states, treat them differently:
   - HEALTHY (within standard range, not on Watch list) → DO NOT add to priority_findings. Mention only if part of a pattern.
   - WATCH (within standard range, on Watch list — labStr will tag these) → priority_finding with flag:"monitor". One calm sentence. No alarm. The point is to track trend and adjust lifestyle, not order rare-disease screening.
   - OUT OF RANGE (low/high/critical_*) → priority_finding with flag:"urgent". Each gets full headline + explanation + what_to_do.
   The Watch list is curated — don't add markers to it. If a marker is healthy, leave it alone. Functional-medicine "optimal" ranges are deliberately not the trigger — many users will be high-normal on ALT/MCV/RDW/TSH/etc. and that's clinically fine.

2. PATTERN RECOGNITION: Connect markers across organ systems. Multi-marker patterns are the highest-value finding even when individual markers look OK. Each pattern goes in the "patterns" array.
   - Triglycerides high + glucose high-normal + HDL low + waist gain = insulin resistance pattern → recommend fasting insulin + HOMA-IR.
   - ALT out of range + triglycerides high + weight gain = NAFLD pattern → recommend liver ultrasound + GGT.
   - Hair loss + fatigue + ferritin <50 = functional iron deficiency → full iron panel.
   - 3+ Watch-tier or out-of-range values clustering in one system → escalate that system in patterns.

CAUSEHEALTH IS NOT A LONGEVITY OR FUNCTIONAL-MEDICINE APP. We are a clinical-translation tool. Tests we recommend must be:
  - Standard, insurance-covered, primary-care-orderable diagnostics
  - Tied to either an out-of-range marker, a reported symptom, a medication depletion, or a standard-of-care baseline the doctor missed for the patient's age/sex
We do NOT recommend GI-MAP, hair tissue mineral, organic acids, food sensitivity, micronutrient panels, NMR lipid (unless lipids abnormal), VO2 max, DEXA <50, comprehensive thyroid antibodies in asymptomatic patients, or advanced cardiology <35.

3. WHEN TO RECOMMEND FOLLOW-UP TESTS (missing_tests array) — UNIVERSAL TRIAGE RULE:
   A test may ONLY appear in missing_tests if it directly investigates ONE of:
     (a) a symptom the patient actually reported
     (b) a known depletion / side-effect from a current medication
     (c) an out-of-range OR Watch-tier marker on THIS draw
     (d) a STANDARD-OF-CARE BASELINE TEST for the patient's age/sex that is MISSING from the draw
     (e) an early-detection marker pattern matching this patient (Hashimoto's, PCOS, NAFLD, etc.)

   If none of (a)-(e) applies, DO NOT include the test. No "while we're at it". No longevity wishlists. No "good to confirm".

   STANDARD-OF-CARE BASELINE BY AGE/SEX (trigger (d) — only if MISSING from draw):
     ALL adults (18+): lipid panel, A1c (35+ every 3yr), TSH once, vitamin D once, ferritin (menstruating women), hs-CRP once, B12 once.
     35+: ApoB and Lp(a) once-in-lifetime.
     45+: coronary calcium once.
     50+: DEXA (women), colorectal screening.
     Women any age: iron panel if menstruating + symptoms.
     Men ANY AGE: total T + SHBG + estradiol — once-in-lifetime baseline (standard CauseHealth recommendation, regardless of age or symptoms).

   NOT standard-of-care baseline (only via triggers (a)/(b)/(c)/(e), never (d)): Cortisol, DHEA-S, Zinc, Free Testosterone, Homocysteine, MMA, Free T3, Free T4, Reverse T3, TPO/Tg antibodies, NMR lipid, GI-MAP, food sensitivity panels, organic acids, hair tissue mineral analysis.

   For each test, why_needed MUST name the trigger letter and the specific finding ("(a) Reports fatigue + (c) ferritin 28" or "(d) Standard baseline for 28yo — vitamin D not in this draw"). If you can't cite a letter, drop it.
   Differential thinking: if the result wouldn't change management, drop the test.
   Maximum 5 tests per analysis.

4. AGE / SEX context: apply age- and sex-appropriate reasoning. For premenopausal females, do NOT flag estradiol, progesterone, FSH, or LH as abnormal unless extreme (FSH >40, estradiol <10 or >500, progesterone >30) — these vary by cycle phase.

5. EARLY DETECTION is the primary goal — find what a 12-minute appointment misses.

6. COMMON-BUT-MISSED CONDITIONS — surface in missing_tests when the trigger pattern is present:
   - PCOS workup (women): testosterone + DHEA-S + LH:FSH + fasting insulin + SHBG. Trigger: irregular cycles, acne, hirsutism, weight gain, hair thinning.
   - Hashimoto's: TPO + thyroglobulin antibodies. Trigger: TSH outside 1.0-2.5, OR fatigue+weight changes+hair loss.
   - Subclinical hypothyroidism: Free T3 + Free T4 + reverse T3. Trigger: TSH 2.5-4.5 with symptoms.
   - Low testosterone (men): total T + free T + SHBG + estradiol + LH/FSH. Trigger: fatigue, weight gain, low libido, OR T <500.
   - Perimenopause (women 35-50): FSH + estradiol + progesterone + AMH. Trigger: irregular cycles, hot flashes, mood/sleep changes.
   - Adrenal/HPA-axis: AM cortisol + DHEA-S + ACTH. Trigger: chronic stress fatigue, salt cravings, anxiety.
   - Functional iron deficiency: full iron panel. Trigger: ferritin <50 OR hair loss/fatigue/restless legs.
   - True B12 status: MMA + homocysteine. Trigger: B12 <500, fatigue, brain fog, neuropathy.
   - NAFLD: liver ultrasound + GGT. Trigger: ALT out of range with high triglycerides or insulin resistance.
   - Celiac: tTG-IgA + total IgA. Trigger: persistent GI symptoms, iron deficiency, low albumin, autoimmune disease.
   - Sleep apnea: STOP-BANG + sleep study. Trigger: snoring, daytime fatigue, hypertension, weight.

7. RARE-DISEASE GATE: borderline-upper-normal values do NOT trigger rare-disease screening. ApoB and lipid NMR are MAINSTREAM cardiology essentials and belong in missing_tests when lipids are abnormal. Server-side post-filter (in _shared/rareDiseaseGate.ts) strips JAK2/ANA reflex/SPEP-UPEP/HLA-B27/MTHFR/Pituitary MRI/Cushing's screening when activation thresholds aren't met — but you should still avoid suggesting them unless the underlying lab pattern clearly warrants it. Default missing_tests should feel ROUTINE for a primary care doctor.`,
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

    // panel_gaps removed — Tier 1/2/3 baseline lists were retired in favor
    // of the AI's tests_to_request array filtered by the strict triage rule.
    delete analysis.panel_gaps;

    // ── HARD POST-FILTER: scrub rare-disease screening from missing_tests when ──
    // ── the user's labs don't hit the urgent threshold. Belt-and-suspenders for ──
    // ── prompt drift. The AI keeps suggesting JAK2 etc. for borderline values.   ──
    // Thresholds shared with generate-doctor-prep — see _shared/rareDiseaseGate.ts.
    {
      const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31_557_600_000) : 99;
      const ctx = extractRareDiseaseContext(labValues, age);
      const blockedPatterns = buildRareDiseaseBlocklist(ctx);
      // Cushing/MTHFR/HLA-B27 are 'always blocked' inside the helper. We also need
      // calcium-PTH allowance for any future use; keep the variable here for symmetry.
      const allowCalciumPth = (ctx.calcium ?? 0) > 11;

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
      // Hard cap — even if AI ignores the prompt's max-5, never ship more
      // than 6 to avoid the 10-test longevity-wishlist regression.
      if (Array.isArray(analysis.missing_tests) && analysis.missing_tests.length > 6) {
        console.log(`[analyze-labs] capping missing_tests ${analysis.missing_tests.length} -> 6`);
        analysis.missing_tests = analysis.missing_tests.slice(0, 6);
      }
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
    // Keys whose values are STRUCTURAL identifiers used by the UI to pair
    // analyses to lab cards. These must NOT be plainified — replacing "LDL"
    // with "bad cholesterol" inside f.marker turns "LDL Cholesterol Calc"
    // into "bad cholesterol Cholesterol Calc" and breaks the lookup, leaving
    // out-of-range cards with no clinical analysis subsection.
    const STRUCTURAL_KEYS = new Set([
      'marker', 'marker_name', 'test_name', 'icd10', 'icd10_primary',
      'icd10_secondary', 'icd10_description', 'icd10_secondary_description',
      'medication', 'supplement', 'lab_finding',
    ]);
    const walkAndPlainify = (obj: any, parentKey?: string): any => {
      if (typeof obj === 'string') {
        if (parentKey && STRUCTURAL_KEYS.has(parentKey)) return obj;
        return plainify(obj);
      }
      if (Array.isArray(obj)) return obj.map(item => walkAndPlainify(item, parentKey));
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const k of Object.keys(obj)) result[k] = walkAndPlainify(obj[k], k);
        return result;
      }
      return obj;
    };
    analysis = walkAndPlainify(analysis);

    // ── Rare-disease prose scrubber ─────────────────────────────────────
    // Same pattern as doctor-prep: even when the AI mentions JAK2 / SPEP /
    // Cushing's / etc. in priority_finding explanations or what_to_do, strip
    // the offending sentences if the patient's markers don't meet the gate
    // thresholds. Otherwise the AI scares the user with names of rare
    // diseases ("if RBC stays high, screen for JAK2") on borderline values.
    try {
      const rdCtx = extractRareDiseaseContext(labValues, age);
      const blocked = buildRareDiseaseBlocklist(rdCtx);
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
      const scrubProse = (val: any, key?: string): any => {
        if (typeof val === 'string') {
          if (key && STRUCTURAL_KEYS.has(key)) return val;
          return stripSentences(val);
        }
        if (Array.isArray(val)) return val.map(v => scrubProse(v, key));
        if (val && typeof val === 'object') {
          const out: any = {};
          for (const k of Object.keys(val)) out[k] = scrubProse(val[k], k);
          return out;
        }
        return val;
      };
      analysis = scrubProse(analysis);
      // Drop any priority_finding whose explanation/what_to_do got entirely
      // erased by the scrubber (was 100% blocked rare-disease text).
      if (Array.isArray(analysis.priority_findings)) {
        analysis.priority_findings = analysis.priority_findings.filter((f: any) =>
          (f?.headline?.length ?? 0) > 0 || (f?.explanation?.length ?? 0) > 0
        );
      }
    } catch (e) { console.error('[analyze-labs] scrub error:', e); }

    // ── Trend-watch injector (deterministic) ────────────────────────────
    // Catch single-draw signals that don't meet rare-disease thresholds
    // but warrant follow-up. Avoids alarming patients with named diagnoses
    // while still capturing the trajectory pattern that actually catches
    // ET, polycythemia, etc. — which is rising over time, not one number.
    if (!Array.isArray(analysis.priority_findings)) analysis.priority_findings = [];
    const trendFindings: any[] = [];
    const findValTrend = (patterns: string[]): { value: number; marker: string } | null => {
      for (const v of labValues) {
        const n = (v.marker_name ?? '').toLowerCase();
        if (patterns.some(p => n.includes(p))) {
          const num = Number(v.value);
          if (!Number.isNaN(num)) return { value: num, marker: v.marker_name };
        }
      }
      return null;
    };
    const ageT = age;

    // Platelets in upper-normal band, young patient
    const pltT = findValTrend(['platelet']);
    if (pltT && ageT < 40 && pltT.value > 350 && pltT.value <= 450) {
      const already = (analysis.priority_findings as any[]).some((f: any) =>
        (f.marker ?? '').toLowerCase().includes('platelet')
      );
      if (!already) {
        trendFindings.push({
          emoji: '🔄',
          marker: pltT.marker,
          value: `${pltT.value}`,
          flag: 'monitor',
          headline: 'Platelets at the top of normal — recheck in 3 months',
          explanation: `Your platelets are ${pltT.value}, near the top of the normal range. For your age, the trend matters more than the single number — recheck in 3 months and compare. If it's climbing, your doctor may want to investigate further.`,
          what_to_do: 'Repeat CBC in 3 months and bring both results to your doctor.',
        });
      }
    }

    // RBC/Hct upper-normal in young patient (without hitting JAK2 gate)
    const rbcT = findValTrend(['rbc', 'red blood cell']);
    const hctT = findValTrend(['hematocrit', 'hct']);
    if (rbcT && hctT && ageT < 40 && rbcT.value > 5.5 && rbcT.value <= 5.7 && hctT.value > 49 && hctT.value <= 51) {
      const already = (analysis.priority_findings as any[]).some((f: any) => {
        const m = (f.marker ?? '').toLowerCase();
        return m.includes('hct') || m.includes('hematocrit') || m.includes('rbc');
      });
      if (!already) {
        trendFindings.push({
          emoji: '🔄',
          marker: 'Red Blood Cells & Hematocrit',
          value: `RBC ${rbcT.value}, Hct ${hctT.value}%`,
          flag: 'monitor',
          headline: 'Red blood cells at top of normal — track the trend',
          explanation: `RBC ${rbcT.value} and hematocrit ${hctT.value}% are at the upper end of normal. Could be hydration status, sleep apnea, or just your baseline — but for your age, a 3-month repeat tells us if it's stable or climbing.`,
          what_to_do: 'Hydrate well, repeat CBC in 3 months, and tell your doctor if you snore or wake unrefreshed.',
        });
      }
    }

    if (trendFindings.length) {
      analysis.priority_findings.push(...trendFindings);
    }

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

    // Log detections — track Watch-tier markers that standard labs call "normal".
    // These are clinically meaningful signals the user's PCP wouldn't flag.
    if (labValues && labValues.length > 0) {
      const watchFlags = new Set(['watch', 'suboptimal_low', 'suboptimal_high']);
      const outOfRangeFlags = new Set(['low', 'high', 'critical_low', 'critical_high', 'deficient', 'elevated']);
      const detections = labValues
        .filter((v: any) => v.optimal_flag && (watchFlags.has(v.optimal_flag) || outOfRangeFlags.has(v.optimal_flag)) && (!v.standard_flag || v.standard_flag === 'normal'))
        .map((v: any) => ({
          user_id: userId,
          detection_type: 'watch_within_standard',
          marker_name: v.marker_name,
          value: v.value,
          optimal_high: v.optimal_high,
          standard_high: v.standard_high,
          condition_flagged: analysis.priority_findings?.find((f: any) => f.marker?.toLowerCase().includes(v.marker_name?.toLowerCase()))?.headline || null,
          test_recommended: analysis.missing_tests?.[0]?.test_name || null,
          severity: ['critical_low', 'critical_high', 'deficient', 'elevated'].includes(v.optimal_flag) ? 'critical' : 'moderate',
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
