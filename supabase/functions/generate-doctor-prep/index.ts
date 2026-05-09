// supabase/functions/generate-doctor-prep/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';
import { buildUniversalTestInjections } from '../_shared/testInjectors.ts';
import { isHealthyMode } from '../_shared/healthMode.ts';
import { GOAL_LABELS, formatGoals } from '../_shared/goals.ts';
import { hasCondition } from '../_shared/conditionAliases.ts';
import { isOnMed } from '../_shared/medicationAliases.ts';
import { checkRegenCap, regenLimitError } from '../_shared/regenCap.ts';
import { runMedicationAlternativesEngine } from '../_shared/medicationAlternativesEngine.ts';

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
    const [profileRes, medsRes, symptomsRes, conditionsRes, suppsRes, latestDrawRes, latestPlanRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId).order('severity', { ascending: false }),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose, duration_category, reason').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id, draw_date, lab_name').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
      // Pull latest wellness plan — its retest_timeline becomes our single
      // source of truth for tests_to_request when present + recent.
      supabase.from('wellness_plans').select('plan_data, created_at, draw_id').eq('user_id', userId).eq('generation_status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data; const meds = medsRes.data ?? []; const symptoms = symptomsRes.data ?? [];
    const conditions = conditionsRes.data ?? []; const latestDraw = latestDrawRes.data;

    // ── Regen cap: 2 doctor preps per lab dataset (universal) ───────────
    if (latestDraw?.id) {
      const cap = await checkRegenCap(supabase, userId, latestDraw.id, 'doctor_prep');
      if (!cap.allowed) {
        return new Response(
          JSON.stringify(regenLimitError('doctor_prep', cap.used, cap.cap)),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      console.log(`[doctor-prep] regen check passed: ${cap.used}/${cap.cap}`);

      // ── IDEMPOTENCY WINDOW: 30-second dedup ────────────────────────────
      // If a doctor-prep was created for this user in the last 30 seconds,
      // return it instead of generating a new one. Prevents double-fire
      // (regen-click + realtime invalidation triggering two parallel runs
      // that each consume a regen slot).
      const thirtySecAgo = new Date(Date.now() - 30_000).toISOString();
      const { data: recentDoc } = await supabase
        .from('doctor_prep_documents')
        .select('id, document_data, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtySecAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentDoc?.document_data) {
        console.log(`[doctor-prep] idempotency: returning existing doc from ${recentDoc.created_at} (within 30s window)`);
        return new Response(JSON.stringify(recentDoc.document_data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    const supps = suppsRes.data ?? [];
    const suppsStr = supps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') || 'None';
    let labValues: any[] = [];
    if (latestDraw) { const { data } = await supabase.from('lab_values').select('*').eq('draw_id', latestDraw.id); labValues = data ?? []; }

    const age = profile?.date_of_birth ? new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : null;
    const medsStr = meds.map((m: any) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('\n') || 'None';
    const sympStr = symptoms.slice(0, 10).map((s: any) => `${s.symptom} - Severity: ${s.severity}/10`).join('\n') || 'None';
    const condStr = conditions.map((c: any) => c.name).join(', ') || 'None reported';

    // Tag each lab with its flag from the new range model
    // (healthy/watch/low/high/critical_*) so the AI prioritizes correctly.
    const allLabsStr = labValues.map((v: any) => {
      const flag = (v.optimal_flag ?? v.standard_flag ?? '').toUpperCase();
      const tag = flag && flag !== 'NORMAL' && flag !== 'HEALTHY' ? ` [${flag}]` : '';
      return `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Ref: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'})${tag}`;
    }).join('\n') || 'No labs';

    // Goals → readable labels for prompt tailoring. Lives in _shared/goals.ts.
    const userGoals: string[] = (profile?.primary_goals ?? []).filter((g: any) => typeof g === 'string');
    const goalsStr = formatGoals(userGoals);

    // Universal life-context for tailoring (insurance type, PCP access,
    // last physical, work realities). NOT used to gate clinical decisions —
    // only to tailor framing of the doctor-prep document (e.g. emphasize
    // baseline workup if no PCP, prefer cheap tests if cash-pay).
    const lifeCtx = (profile?.life_context ?? {}) as Record<string, any>;
    const insurance  = lifeCtx.insuranceType ?? 'unknown';
    const hasPCP     = lifeCtx.hasPCP ?? 'unknown';
    const lastPhys   = lifeCtx.lastPhysical ?? 'unknown';
    const workType   = lifeCtx.workType ?? 'unknown';
    const lifeCtxStr = `INSURANCE: ${insurance} · HAS_PCP: ${hasPCP} · LAST_PHYSICAL: ${lastPhys} · WORK_TYPE: ${workType}`;

    // Healthy-mode detection — same threshold as wellness plan.
    // Lives in _shared/healthMode.ts.
    const isHealthy = isHealthyMode(labValues);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        // 14K — bumped from 10K because the always-track-all-baselines rule
        // expanded tests_to_request to ~16-22 entries, each with full ICD-10 +
        // insurance_note + clinical_justification. Plus possible_conditions +
        // discussion_points + tell_doctor + questions_to_ask. Output was
        // truncating mid-array on dense patients, completeness gate rejecting,
        // and the UI bouncing back to empty state. 14K leaves headroom.
        model: 'claude-haiku-4-5-20251001', max_tokens: 14000,
        system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: `You are CauseHealth AI. Return ONLY valid JSON. CauseHealth is a clinical-translation tool — we help patients walk into a doctor visit knowing what to say and what to ask for. We do NOT diagnose, do NOT push longevity wishlists, do NOT push functional-medicine extras. Every recommendation must be a routine PCP-orderable insurance-covered test that a doctor cannot reasonably refuse.

═══ VOICE (apply to every string) ═══
- 6th-grade reading level. Plain English. Marker abbreviation in parens only ("liver enzyme (ALT) is 97").
- Reading on a lunch break — 30 seconds to scan.
- Lead with the verb on action lines ("Tell your doctor…", "Ask for…"), lead with the finding on why-lines.
- One emoji per card.
- Hard caps:
    chief_complaint ≤15 words. hpi 2-3 sentences ≤60 words. executive_summary[] ≤20 words each.
    tell_doctor[].headline 6-10 words, .detail ≤20 words.
    tests_to_request[].why_short 6-10 words, .clinical_justification ≤25 words.
    questions_to_ask[].question ≤25 words, .why ≤15 words.
    discussion_points[] ≤25 words. functional_medicine_note 2 sentences ≤40 words.
- No mechanisms, no percentage improvements, no dosages in why fields. If a sentence doesn't pull weight, cut it.

═══ RANGE MODEL (3 states) ═══
HEALTHY (in standard, not on Watch list) → don't put in urgent_findings.
WATCH (in standard, on curated Watch list — HbA1c 5.4-5.6, ApoB ≥90, hs-CRP ≥0.5, fasting glucose 95-99, ferritin <50, vitamin D 30-40) → urgent_findings, calm tone, 3-month retest.
LOW/HIGH/CRITICAL (out of standard) → urgent_findings + clinical note.
Do NOT add markers to Watch on your own. Functional-medicine "optimal" ranges are NOT triggers — high-normal ALT/MCV/RDW/TSH is fine.

═══ PATTERN RECOGNITION ═══
Multi-marker patterns are higher value than single numbers. Each pattern → executive_summary + a discussion_point. Examples: TG high + glucose high-normal + HDL low + waist gain → IR pattern. ALT out of range + TG high + weight gain → NAFLD. Hair loss + fatigue + ferritin <50 → functional iron def. Three or more values clustering in one organ system → escalate that system.

═══ TESTS_TO_REQUEST ═══
Triage rule — a test may only appear if it investigates ONE of:
  (a) a reported symptom
  (b) a known depletion / side-effect from a current medication
  (c) an out-of-range / Watch / early-detection marker pattern on THIS draw
  (d) a standard-of-care baseline for this patient's age/sex (INCLUDE EVEN IF in the draw — retest tracks change after protocol)
  (e) an early-detection cluster pattern
If none of (a)-(e) applies, drop it. No "while we're at it" tests.

EVERY clinical_justification MUST start with the trigger letter in parens (the UI parses it for folder routing):
  "(a) Patient reports [symptom]…"
  "(b) On [medication] — known to deplete [nutrient]…"
  "(c) [Marker] = [value] [flag] — [pattern]…"
  "(d) Standard baseline for [age]yo [sex] — [in draw / not in draw]…"
  "(e) [Pattern] cluster — [what it suggests]…"

Standard-of-care baseline for any adult (trigger d) — CMP, CBC w/ diff, Lipid Panel, ApoB, Lp(a) once-in-lifetime, HbA1c, hs-CRP, TSH, Vitamin D, Vitamin B12, Folate, Ferritin. Add per context: Free T3/T4 + TPO/Tg Ab if TSH borderline + thyroid sx. Iron Panel for menstruating females or hair loss. Total T + SHBG + Estradiol for any adult male asking for thorough labs (NOT longevity — modern PCP standard for hypogonadism screening). GGT + liver ultrasound when ALT/AST elevated. CK universally for any patient on a statin. Fasting Insulin + HOMA-IR for IR signs. UACR for diabetes / HTN / CV disease.

AM cortisol — order ONLY with classic Cushing's stigmata (striae + central obesity + moon face + HTN) or Addison's stigmata (salt cravings + hyperpigmentation + orthostatic hypotension + low Na). Plain fatigue/sleep/stress complaints do NOT meet the bar.

CONSOLIDATE into standard panels — doctors order panels, not single markers. Use names like:
  "Comprehensive Metabolic Panel (CMP)" — covers ALT/AST/ALP/Bilirubin/Albumin/Total Protein/Glucose/BUN/Creatinine/eGFR/Na/K/Cl/CO2/Ca
  "Complete Blood Count (CBC) with Differential" — covers WBC/RBC/Hgb/Hct/MCV/MCH/MCHC/RDW/Platelets/diff
  "Lipid Panel" — Total/LDL/HDL/TG/VLDL/non-HDL
  "Iron Panel" — Serum Iron/TIBC/Ferritin/Transferrin Sat/UIBC
  "Vitamin B12 Workup" — Serum B12 + MMA + Homocysteine
  "Folate Workup" — Serum + RBC Folate
  "Testosterone Panel (Male)" — Total T + Free T + SHBG + Estradiol
  "PCOS Panel (Female)" — Total T + Free T + DHEA-S + LH:FSH + SHBG + Fasting Insulin
  "Thyroid Panel" — TSH + Free T3 + Free T4
  "Hashimoto's Antibodies" — TPO + Tg Ab
  "Insulin Resistance Workup" — Fasting Insulin + HOMA-IR
  Single entries: HbA1c, Vitamin D 25-OH, hs-CRP, ApoB, Lp(a), GGT, Uric Acid, PTH, Ionized Calcium
Patient walks out with ~10-14 panel orders covering 30-50 individual values — never 30 separate entries.

Cap: max 14 tests for multi-system treatment patients, 5-7 for healthy. ICD-10 must be the most specific code; corrections applied post-generation. R74.0 (abnormal LFTs) for any liver workup, never R19.0/R19.00.

═══ ABSOLUTE BLOCKLIST (advanced_screening or drop entirely) ═══
JAK2 V617F, EPO, hereditary hemochromatosis genetics, MTHFR, pituitary MRI, 24h urinary cortisol, ANA reflex panel, multiple myeloma panel (SPEP/UPEP/free light chains), HLA-B27, flow cytometry. These NEVER go in tests_to_request unless the patient hits the hard threshold (post-processor enforces). Default to NOT generating them. advanced_screening defaults to []; max 1 entry only when a marker hits a hard urgent threshold (platelets >450, calcium >10.5, prolactin >100, ferritin >300 + transferrin sat >45%, globulin >3.5 with anemia/bone pain).

═══ FEMALE HORMONE CAVEAT ═══
Don't interpret estradiol/progesterone/FSH/LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). Single draw can't diagnose "estrogen dominance." Note the cycle-day limitation if discussing.

═══ DIAGNOSED CONDITIONS GROUND TRUTH ═══
The DIAGNOSED CONDITIONS list in the user message is verbatim ground truth. Never name or allude to a condition not on it. Talk about med effects without naming the condition the med treats. A scrubber catches stragglers.

═══ HEALTHY MODE (when MODE=healthy) ═══
Tone shifts to optimization; the test rule does NOT.
- chief_complaint: "Wellness check-in" / "Optimization-focused visit"
- hpi: strengths first, then 1-2 Watch markers
- executive_summary: what's working + Watch markers + lifestyle adjustments
- tests_to_request: dominant trigger is (d) baseline gap. Cap at 5. NOT a longevity wishlist.
- discussion_points: "I want to confirm I'm on track and address X"

═══ LIMITED-DATA MODE (no labs uploaded) ═══
- executive_summary: "Based on your symptoms and history, here's what to ask for"
- tests_to_request: standard adult baseline panel tailored to symptoms (CMP/CBC/Lipid/TSH/Vit D/hs-CRP/Ferritin/A1c) + symptom-specific adds
- Don't pretend to have lab data you don't have

═══ MEDICATION_ALTERNATIVES — STRICT TRIGGER ═══
Empty array unless ALL true for a drug on the patient's list:
  1. The med is causing/contributing to a MEASURED finding in this patient (not theoretical)
  2. A real pharmaceutical alternative exists with same/better efficacy + meaningfully better profile for THIS patient
  3. Recommendation is supported by current guidelines or strong evidence
reason_to_consider must cite the specific patient finding. Don't include alternatives just because they exist.

═══ GOAL TAILORING ═══
The user's stated goals (energy / longevity / weight / etc.) must visibly connect to discussion_points and patient_questions. functional_medicine_note ties biggest finding back to stated goals.

Be concise. Scannable in 3 minutes.` }],
        messages: [{ role: 'user', content: `Generate clinical visit prep document.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
MODE: ${isHealthy ? 'healthy — apply HEALTHY MODE rules (proactive/optimization framing, no alarmism)' : 'standard'}
USER'S TOP GOALS (their stated reasons for using this app — your discussion points and tests should connect to these): ${goalsStr}
DIAGNOSED CONDITIONS (GROUND TRUTH — verbatim names only; never infer a condition from a medication. If a condition isn't in this list, don't name or allude to it anywhere — talk about med effects without naming the condition the med treats. A scrubber catches stragglers): ${condStr}
MEDICATIONS:\n${medsStr}
CURRENT SUPPLEMENTS (consider lab interactions when interpreting findings — e.g., creatine→creatinine artifact, biotin→TSH/T3/T4 interference, B12→masks deficiency, niacin→HDL/ALT, TRT→Hct/LH/FSH, vitamin K2→INR with warfarin): ${suppsStr}
SYMPTOMS:\n${sympStr}
LIFE_CONTEXT (universal — tailor test selection + framing, not clinical decisions): ${lifeCtxStr}
  - If INSURANCE = cash → prefer cheapest panels (Quest direct-pay, Walmart). Skip expensive specialty unless triggered by an out-of-range marker.
  - If HAS_PCP = none / rare → frame "find a PCP for ongoing monitoring" in the doctor-prep document.
  - If LAST_PHYSICAL = 2yr_plus / never AND no major findings → bias tests_to_request toward a baseline physical workup (CBC + CMP + lipid + HbA1c + TSH).
  - If WORK_TYPE = driver / shift / labor → mention DOT physical or fitness-for-duty considerations only when relevant (don't volunteer if patient hasn't indicated a need).
LAB DATE: ${latestDraw?.draw_date ?? 'unknown'} LAB: ${latestDraw?.lab_name ?? 'unknown'}

ALL LAB VALUES:
${allLabsStr.slice(0, 10000)}

Return JSON:
{"generated_at":"${new Date().toISOString()}","document_date":"${new Date().toISOString().split('T')[0]}","headline":"one 12-word verdict — the single most important thing for this visit","executive_summary":["3-5 plain English bullets, 1 sentence each"],"chief_complaint":"one sentence","hpi":"2-3 sentences in plain English","pmh":"","medications":[{"name":"","dose":"","notable_depletion":""}],"review_of_systems":{"constitutional":"","cardiovascular":"","gastrointestinal":"","endocrine":""},"lab_summary":{"draw_date":"","lab_name":"","urgent_findings":[{"emoji":"🚨","marker":"","value":"","flag":"","clinical_note":"plain English, 1 sentence"}],"other_abnormal":[{"emoji":"⚠️","marker":"","value":"","flag":""}]},"tell_doctor":[{"emoji":"💬","headline":"6-10 word headline of what to tell the doctor","detail":"1 sentence plain-English context"}],"tests_to_request":[{"emoji":"🧪","test_name":"","why_short":"6-10 word reason in plain English","clinical_justification":"1 sentence","icd10_primary":"","icd10_description":"","priority":"urgent|high|moderate","insurance_note":""}],"advanced_screening":[{"emoji":"🔬","test_name":"","why_short":"6-10 word reason","clinical_justification":"1 sentence — why this rare condition needs ruling out","icd10_primary":"","icd10_description":"","priority":"high|moderate","insurance_note":"may require specialist referral"}],"questions_to_ask":[{"emoji":"❓","question":"the exact plain-language question to read aloud","why":"1 sentence why it matters"}],"discussion_points":["1-2 sentences, lead with the ask"],"patient_questions":["plain language fallback list"],"functional_medicine_note":"2-3 sentences in plain English","medication_alternatives":[{"current_medication":"the drug from the patient's medication list","reason_to_consider":"1 sentence — what specific finding in THIS patient's labs/symptoms warrants considering an alternative (e.g. 'ALT 97 elevated above goal on atorvastatin; PCSK9i / pitavastatin / bempedoic acid don't share atorvastatin's hepatic burden').","pharmaceutical_alternatives":[{"name":"specific drug name","reason":"1 sentence — why this is potentially better for THIS patient (less hepatic, no CoQ10 depletion, doesn't deplete folate, etc.)"}],"natural_alternatives":[{"name":"specific intervention","reason":"1 sentence — evidence + magnitude (e.g. 'red yeast rice + omega-3 + dietary changes — 20-30% LDL reduction in adherent patients, no liver burden')"}]}]}

CRITICAL OUTPUT RULES (for the new card-stack UI):
- tell_doctor: 3-5 cards. The most important things this patient must mention (chief complaint, key symptoms, key abnormal lab in lay terms).
- tests_to_request: keep the existing rules — max 14 for multi-system treatment-mode patients (5-7 for healthy), one workup per row, must mirror the Wellness Plan retest_timeline.
- questions_to_ask: 3-5 plain-language questions the patient can literally read aloud at the visit.
- Every card has an emoji and a short headline so it's scannable in 2 seconds.

MEDICATION_ALTERNATIVES — STRICT TRIGGER. Empty array unless the bar is met.
Only populate when ALL of these are true for a SPECIFIC drug on the patient's list:
  1. The current med is causing or contributing to a MEASURED finding in this patient (not theoretical) — e.g. ALT 97 on atorvastatin, low B12 on long-term metformin, low folate on long-term mesalamine, persistent muscle pain on statin.
  2. There exists a real pharmaceutical alternative with the SAME or BETTER efficacy for this patient's indication AND a meaningfully better side-effect / depletion profile for THIS patient's specific concern. Not "different brand of statin" — "rosuvastatin has lower hepatic-enzyme elevation rate than atorvastatin" or "pitavastatin doesn't deplete CoQ10 like atorvastatin".
  3. The recommendation is genuinely supported by current guidelines or strong clinical evidence — not internet folklore.
DO NOT include alternatives just because they exist. The doctor only wants to see this if it would change their prescribing decision.

Examples of HIGH-BAR alternatives (worth including when triggers met):
- atorvastatin → rosuvastatin (lower ALT elevation rate); pitavastatin (no CoQ10 depletion); ezetimibe (add-on for LDL not at goal); bempedoic acid (statin-intolerant); PCSK9i (severe / familial hypercholesterolemia)
- mesalamine → balsalazide / olsalazine (alternative 5-ASA delivery); biologic step-up (if disease control inadequate, not "for less folate depletion")
- metformin → SGLT2i / GLP-1 (better cardiovascular outcomes if CV risk; not just "B12 friendly"); only suggest for B12 reasons if measured deficiency despite supplementation
- SSRI → SNRI / bupropion (specific symptom mismatch); not just "different SSRI"
- PPI → H2 blocker (long-term; if Mg / B12 / fracture concern measured); risk-benefit is patient-specific

natural_alternatives: only when there's evidence-supported magnitude, not vague wellness suggestions. Cite expected effect size when known (LDL -20%, hs-CRP -0.4 mg/L, etc.).

reason_to_consider must cite the SPECIFIC patient finding that triggers this entry.` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    const stopReason = aiRes.stop_reason ?? 'unknown';
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);

    // ── HARD STOP: max_tokens truncation = ALWAYS reject ────────────────
    // If AI was cut off mid-output, sections are missing even if salvage
    // could parse it. Refuse to save partials. User gets a clean retry.
    if (stopReason === 'max_tokens') {
      console.error('[doctor-prep] REJECTED: stop_reason=max_tokens — output was truncated');
      return new Response(JSON.stringify({
        error: 'Doctor prep was cut off mid-output. This won\'t count against your regen cap — try again.',
        code: 'INCOMPLETE_GENERATION',
        stop_reason: 'max_tokens',
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── DETERMINISTIC TEXT-CLEAN (pre-parse) ──────────────────────────────
    // Same scrubbers as analyze-labs + wellness-plan. Catches the fragment
    // and hallucinated test-name patterns that prompt rules don't fully
    // suppress.
    rawText = rawText
      .replace(/early your body ignoring insulin/gi, 'early signs your body is ignoring insulin')
      .replace(/your body ignoring insulin/gi, 'your body is ignoring insulin')
      .replace(/\bdysbiotic dysbiosis\b/gi, 'dysbiosis')
      .replace(/\bfecal gut hs[- ]?CRP\b/gi, 'Fecal Calprotectin')
      .replace(/\bfecal hs[- ]?CRP\b/gi, 'Fecal Calprotectin')
      .replace(/\bgut hs[- ]?CRP\b/gi, 'Fecal Calprotectin');

    let doc;
    try { doc = JSON.parse(rawText); } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    // ── ICD-10 CORRECTION MAP — runs after AI, zero tokens, deterministic ────
    try {
      const fixes = {
        'E11.9': ['R73.03', 'Prediabetes'], 'E11.65': ['R73.03', 'Prediabetes'],
        'E89.0': ['E06.3', 'Autoimmune thyroiditis'],
        'Z13.1': ['K90.0', 'Celiac disease'], 'Z13.3': ['K90.0', 'Celiac disease'],
        'Z13.0': ['D64.9', 'Anemia, unspecified'],
        'T36.0X5A': ['K71.9', 'Toxic liver disease'], 'T36.0X5D': ['K71.9', 'Toxic liver disease'],
        'E78.5': ['E78.2', 'Mixed hyperlipidemia'], 'E78.9': ['E78.2', 'Mixed hyperlipidemia'],
        'F39': ['R41.82', 'Altered mental status'], 'F06.7': ['R41.82', 'Altered mental status'],
        'D45': ['D75.1', 'Secondary polycythemia'],
        'M79.3': ['M79.1', 'Myalgia'], 'R52': ['M25.50', 'Joint pain, unspecified'],
        'E55.0': ['E55.9', 'Vitamin D deficiency'], 'D50.0': ['D50.9', 'Iron deficiency anemia'],
        'D51.0': ['D51.9', 'B12 deficiency anemia'], 'D52.0': ['D52.9', 'Folate deficiency anemia'],
        'K50.00': ['K50.90', 'Crohn disease, unspecified'], 'K51.00': ['K51.90', 'Ulcerative colitis, unspecified'],
        'E04.9': ['E06.3', 'Autoimmune thyroiditis'], 'E01.8': ['E03.9', 'Hypothyroidism'],
        'E66.01': ['E66.9', 'Obesity, unspecified'],
        'R53.1': ['R53.83', 'Other fatigue'], 'G93.3': ['R53.83', 'Other fatigue'],
        'L65.1': ['L65.9', 'Nonscarring hair loss'], 'L63.9': ['L65.9', 'Nonscarring hair loss'],
        'R19.00': ['R74.0', 'Abnormal liver function tests'], 'R19.0': ['R74.0', 'Abnormal liver function tests'],
        'R19.8': ['R74.0', 'Abnormal liver function tests'], 'K76.9': ['K76.0', 'Fatty (change of) liver, NEC'],
        'R74.8': ['R74.0', 'Abnormal liver function tests'],
        'B19.9': ['B19.20', 'Unspecified viral hepatitis without coma'],
        'M45.9': ['M45.9', 'Ankylosing spondylitis of unspecified sites'],
        'D75.1': ['D75.1', 'Secondary polycythemia'],
        'E83.10': ['E83.119', 'Hemochromatosis, unspecified'],
        'E61.8': ['E63.9', 'Nutritional deficiency, unspecified'],
      };
      const fixIcd = (testList: any[]) => {
        if (!testList) return;
        for (const t of testList) {
          const f1 = fixes[t.icd10_primary];
          if (f1) { t.icd10_primary = f1[0]; t.icd10_description = f1[1]; }
          if (t.icd10_secondary) {
            const f2 = fixes[t.icd10_secondary];
            if (f2) { t.icd10_secondary = f2[0]; t.icd10_secondary_description = f2[1]; }
          }
        }
      };
      fixIcd(doc.tests_to_request);
      fixIcd(doc.advanced_screening);
    } catch (e) { console.error('ICD-10 correction error:', e); }

    // ── HARD POST-FILTER: move blocked tests from tests_to_request to advanced_screening ──
    // ── unless the patient hits the explicit urgent threshold. Belt-and-suspenders for AI drift. ──
    // Thresholds shared with analyze-labs — see _shared/rareDiseaseGate.ts.
    try {
      const ctx = extractRareDiseaseContext(labValues, age);
      const isYoung = ctx.age < 40;
      const blockedPatterns = buildRareDiseaseBlocklist(ctx);

      // Rare-disease tests NEVER appear as test cards anywhere — not in
      // tests_to_request, not in advanced_screening. When the threshold IS
      // met (rule.allow === true), the deterministic injector below adds a
      // calm "concern to raise with doctor" line to discussion_points
      // instead. When the threshold is NOT met, the test is dropped
      // entirely. Either way: no test card.
      const matchesRareDiseasePattern = (t: any) => {
        const name = `${t?.test_name ?? ''} ${t?.why_short ?? ''} ${t?.clinical_justification ?? ''}`;
        return blockedPatterns.some(rule => rule.pattern.test(name));
      };

      if (Array.isArray(doc.tests_to_request)) {
        doc.tests_to_request = doc.tests_to_request.filter((t: any) => {
          if (matchesRareDiseasePattern(t)) {
            console.log(`[doctor-prep] Dropped rare-disease test "${t.test_name}" from tests_to_request`);
            return false;
          }
          return true;
        });
      }
      if (Array.isArray(doc.advanced_screening)) {
        doc.advanced_screening = doc.advanced_screening.filter((t: any) => {
          if (matchesRareDiseasePattern(t)) {
            console.log(`[doctor-prep] Dropped rare-disease test "${t.test_name}" from advanced_screening`);
            return false;
          }
          return true;
        });
      }

      // ── Scrub blocked terms from PROSE fields ────────────────────────
      // Even when we filter the test arrays, the AI mentions JAK2 / SPEP /
      // Cushing's / etc. inside discussion_points, clinical_note, the
      // executive summary, and the functional medicine note. That's how
      // they leak into the patient PDF and scare the patient. Strip any
      // sentence containing a blocked term unless its activation
      // threshold was met.
      const stripSentences = (text: string): string => {
        if (typeof text !== 'string' || !text) return text;
        const sentences = text.split(/(?<=[.!?])\s+/);
        const kept = sentences.filter(s => {
          for (const rule of blockedPatterns) {
            if (rule.allow) continue;
            if (rule.pattern.test(s)) return false;
          }
          return true;
        });
        return kept.join(' ').trim();
      };

      // Apply to every prose field that the patient/doctor will read.
      if (Array.isArray(doc.executive_summary)) {
        doc.executive_summary = doc.executive_summary.map((s: any) => typeof s === 'string' ? stripSentences(s) : s).filter((s: any) => typeof s !== 'string' || s.length > 0);
      }
      if (typeof doc.functional_medicine_note === 'string') doc.functional_medicine_note = stripSentences(doc.functional_medicine_note);
      if (typeof doc.chief_complaint === 'string') doc.chief_complaint = stripSentences(doc.chief_complaint);
      if (typeof doc.hpi === 'string') doc.hpi = stripSentences(doc.hpi);

      if (Array.isArray(doc.discussion_points)) {
        doc.discussion_points = doc.discussion_points
          .map((p: any) => typeof p === 'string' ? stripSentences(p) : p)
          .filter((p: any) => typeof p !== 'string' || p.length > 0);
      }
      if (Array.isArray(doc.patient_questions)) {
        doc.patient_questions = doc.patient_questions
          .map((p: any) => typeof p === 'string' ? stripSentences(p) : p)
          .filter((p: any) => typeof p !== 'string' || p.length > 0);
      }
      if (Array.isArray(doc.tell_doctor)) {
        doc.tell_doctor = doc.tell_doctor.map((t: any) => ({
          ...t,
          headline: typeof t?.headline === 'string' ? stripSentences(t.headline) : t?.headline,
          detail: typeof t?.detail === 'string' ? stripSentences(t.detail) : t?.detail,
        })).filter((t: any) => (t?.headline?.length ?? 0) > 0 || (t?.detail?.length ?? 0) > 0);
      }
      if (Array.isArray(doc.questions_to_ask)) {
        doc.questions_to_ask = doc.questions_to_ask.map((q: any) => ({
          ...q,
          question: typeof q?.question === 'string' ? stripSentences(q.question) : q?.question,
          why: typeof q?.why === 'string' ? stripSentences(q.why) : q?.why,
        })).filter((q: any) => (q?.question?.length ?? 0) > 0);
      }
      if (doc.lab_summary?.urgent_findings && Array.isArray(doc.lab_summary.urgent_findings)) {
        doc.lab_summary.urgent_findings = doc.lab_summary.urgent_findings.map((f: any) => ({
          ...f,
          clinical_note: typeof f?.clinical_note === 'string' ? stripSentences(f.clinical_note) : f?.clinical_note,
        }));
      }

      // ── Trend-watch injector ─────────────────────────────────────────
      // High-normal values in young patients warrant 3-month re-check
      // without naming a rare disease. Catches the pattern (climbing
      // trajectory) that actually surfaces ET/PV — not a single number.
      if (!Array.isArray(doc.discussion_points)) doc.discussion_points = [];
      if (isYoung && (ctx.platelets ?? 0) > 350 && (ctx.platelets ?? 0) <= 450) {
        doc.discussion_points.push(`Platelets are ${ctx.platelets} — at the top of normal for someone your age. Ask for a repeat CBC in 3 months. If platelets are climbing across two draws, that's the signal worth investigating, not the single number.`);
      }
      if (isYoung && (ctx.rbc ?? 0) > 5.5 && (ctx.rbc ?? 0) <= 5.7 && (ctx.hct ?? 0) > 49 && (ctx.hct ?? 0) <= 51) {
        doc.discussion_points.push(`Red blood cells (${ctx.rbc}) and hematocrit (${ctx.hct}%) are at the top of normal. Could be hydration, sleep quality, or baseline. Ask your doctor for a repeat CBC in 3 months and screen for sleep apnea (STOP-BANG) if you snore or wake unrefreshed.`);
      }

      // ── Rare-disease threshold injector ───────────────────────────────
      // When markers actually hit the rare-disease threshold, surface it
      // ONLY as a "concern to raise with your doctor" line — no test card,
      // no executive summary entry, no scary clinical_note. Doctor decides
      // the workup; we just flag the pattern. Calm tone, names the
      // condition to rule out so the patient can repeat it at the visit.
      // JAK2 / MPN injector — must use the SAME thresholds as buildRareDiseaseBlocklist
      // (single source of truth in _shared/rareDiseaseGate.ts). Previously had a
      // stale inline copy with the old 'isYoung && rbc>5.7 && hct>51' soft path
      // that fired on borderline values like RBC 5.96 / Hct 51.4 in a 29yo with
      // normal platelets — exactly the false positive Evan saw on his prep.
      const isMidAge = ctx.age < 50;
      const jak2Triggered =
        (ctx.platelets ?? 0) > 600 ||
        (isYoung && (ctx.platelets ?? 0) > 450) ||
        (isMidAge && (ctx.platelets ?? 0) > 500) ||
        ((ctx.rbc ?? 0) > 6.0 && (ctx.hct ?? 0) > 54) ||
        ((ctx.hgb ?? 0) > 17.5 && (ctx.hct ?? 0) > 53);
      if (jak2Triggered) {
        doc.discussion_points.push(`Concern to raise with your doctor: platelets ${ctx.platelets ?? '—'}, hemoglobin ${ctx.hgb ?? '—'}, hematocrit ${ctx.hct ?? '—'}, RBC ${ctx.rbc ?? '—'}. This combination can sometimes point to a myeloproliferative process (essential thrombocythemia or polycythemia vera). Your doctor may want to repeat the CBC, check an EPO level, and consider a JAK2 V617F test to rule it out.`);
      }
      if ((ctx.globulin ?? 0) > 5 || ((ctx.globulin ?? 0) > 3.5 && isYoung) || (ctx.calcium ?? 0) > 11.5) {
        doc.discussion_points.push(`Concern to raise with your doctor: globulin ${ctx.globulin ?? '—'} g/dL, calcium ${ctx.calcium ?? '—'} mg/dL. Persistently elevated globulin or calcium can occasionally signal a plasma-cell or parathyroid issue. Your doctor may want SPEP/UPEP/free light chains and a PTH level to rule it out.`);
      }
      if (((ctx.ferritin ?? 0) > 300 && (ctx.transferrinSat ?? 0) > 50) || (isYoung && (ctx.ferritin ?? 0) > 200 && (ctx.transferrinSat ?? 0) > 45)) {
        doc.discussion_points.push(`Concern to raise with your doctor: ferritin ${ctx.ferritin ?? '—'} with transferrin saturation ${ctx.transferrinSat ?? '—'}%. Elevated iron stores with high saturation can suggest hereditary hemochromatosis. Your doctor may want HFE gene testing and a hepatology consult.`);
      }
      if ((ctx.prolactin ?? 0) > 100) {
        doc.discussion_points.push(`Concern to raise with your doctor: prolactin ${ctx.prolactin} ng/mL. A level above 100 warrants a pituitary MRI to rule out a prolactinoma. Confirm the result with a repeat morning draw before imaging.`);
      }
      if ((ctx.ana ?? 0) > 0) {
        doc.discussion_points.push(`Concern to raise with your doctor: positive ANA. This isn't a diagnosis on its own — your doctor may want an ANA reflex panel (anti-dsDNA, anti-Sm, anti-Ro/La, anti-Scl-70) plus a rheumatology consult if symptoms support it.`);
      }
    } catch (e) { console.error('[doctor-prep] post-filter error:', e); }

    // ── Text-quality pass: collapse doubled words ("depletes depletes" → "depletes")
    // and fix the recurring "ASH" → "AST" typo from the model. Cheap, deterministic.
    try {
      const cleanText = (s: any): any => {
        if (typeof s !== 'string') return s;
        return s
          .replace(/\b(\w+)\s+\1\b/gi, '$1')           // doubled word
          .replace(/\bASH\b/g, 'AST')                  // common transcription typo
          .replace(/\s{2,}/g, ' ')
          .trim();
      };
      const walk = (val: any): any => {
        if (typeof val === 'string') return cleanText(val);
        if (Array.isArray(val)) return val.map(walk);
        if (val && typeof val === 'object') {
          const out: any = {};
          for (const k of Object.keys(val)) out[k] = walk(val[k]);
          return out;
        }
        return val;
      };
      doc = walk(doc);
    } catch (e) { console.error('[doctor-prep] text-clean error:', e); }

    // Validate required fields before saving — never save corrupt/partial documents
    if (!doc.chief_complaint && !doc.hpi && !doc.executive_summary) {
      return new Response(JSON.stringify({ error: 'Generated document is incomplete — missing required fields' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Ensure arrays are arrays, not undefined
    if (!Array.isArray(doc.tests_to_request)) doc.tests_to_request = [];

    // ── DETERMINISTIC TEST INJECTOR ──────────────────────────────────────
    // The AI is probabilistic and sometimes drops obvious tests when its
    // candidate list gets long. Same backstop pattern as the CoQ10 injector
    // for supplements: enforce critical tests post-AI based on hard rules.
    //
    // Rules below are textbook standard-of-care triggers. A clinician would
    // never miss them. The AI sometimes does. So we hard-code.
    try {
      const has = (pattern: RegExp) =>
        doc.tests_to_request.some((t: any) =>
          pattern.test(`${t?.test_name ?? ''} ${t?.why_short ?? ''}`)
        );

      // Conditions sourced ONLY from explicit onboarding input — never inferred
      // from medications. If the user didn't add UC in Step 2, the AI doesn't
      // assume it from a mesalamine prescription.
      const conditionsLower = condStr.toLowerCase();
      const symptomsLower = sympStr.toLowerCase();
      const labsLower = allLabsStr.toLowerCase();

      // Conditions/meds delegated to canonical registry (May 2026 refactor).
      // "Hypothyroidism" now matches the Hashimoto's path (Nona fix flows through here too).
      const hasUC = hasCondition(conditionsLower, 'ibd');
      const hasAutoimmune = hasUC
        || hasCondition(conditionsLower, 'hashimotos')
        || hasCondition(conditionsLower, 'graves')
        || hasCondition(conditionsLower, 'lupus')
        || hasCondition(conditionsLower, 'ra')
        || hasCondition(conditionsLower, 'psoriasis')
        || hasCondition(conditionsLower, 'ms')
        || hasCondition(conditionsLower, 'celiac')
        || hasCondition(conditionsLower, 'sjogrens')
        || hasCondition(conditionsLower, 'long_covid');
      const hasJointPain = /\b(joint pain|joint stiffness|arthralg|stiff)/.test(symptomsLower);
      const hasFatigueOrInflam = /\b(fatigue|tired|exhaust|low energy|brain fog|hair loss|hair thin|joint)/.test(symptomsLower);

      // Detect any abnormal CBC marker — RBC, Hct, Hgb, WBC, platelets out of standard range
      const cbcAbnormal = /\b(rbc|hematocrit|hct|hemoglobin|hgb|wbc|white blood|platelet|mcv|mch|rdw)\b[^\n]*\[(low|high|critical)/i.test(labsLower);

      // hs-CRP injector: UC / autoimmune / joint pain / fatigue all warrant it
      // and it's a $5 test with universal insurance coverage. No reason to miss.
      if ((hasAutoimmune || hasJointPain || hasFatigueOrInflam) && !has(/\b(hs[- ]?crp|c[- ]?reactive protein|inflammation marker)\b/i)) {
        const trigger = hasUC ? 'UC inflammation tracking'
          : hasAutoimmune ? 'autoimmune inflammation tracking'
          : 'symptom-driven inflammation marker';
        doc.tests_to_request.push({
          emoji: '🔥',
          test_name: 'High-Sensitivity C-Reactive Protein (hs-CRP)',
          why_short: trigger,
          clinical_justification: `(a)/(e) ${trigger} — hs-CRP is the standard inflammation marker for autoimmune disease activity and cardiovascular risk. Routine for UC/IBD monitoring; insurance covered under the autoimmune diagnosis or symptom code.`,
          icd10_primary: hasUC ? 'K51.90' : 'R79.89',
          icd10_description: hasUC ? 'Ulcerative colitis, unspecified' : 'Other specified abnormal findings of blood chemistry',
          priority: 'high',
          insurance_note: 'Universally covered; ~$5–15 out-of-pocket if denied.',
        });
        console.log('[doctor-prep] Injected hs-CRP — autoimmune/symptom trigger missed by AI');
      }

      // CBC with Differential injector: any CBC marker abnormal -> retest CBC
      if (cbcAbnormal && !has(/\bcbc\b|complete blood count|differential/i)) {
        doc.tests_to_request.push({
          emoji: '🩸',
          test_name: 'Complete Blood Count (CBC) with Differential',
          why_short: 'Re-measure abnormal CBC values',
          clinical_justification: `(c) Existing draw shows abnormal CBC values — re-measure to confirm trend and rule out hemoconcentration vs. erythrocytosis. Routine standard of care.`,
          icd10_primary: 'R71.8',
          icd10_description: 'Other abnormality of red blood cells',
          priority: 'moderate',
          insurance_note: 'Universally covered; bundled into routine bloodwork.',
        });
        console.log('[doctor-prep] Injected CBC — abnormal CBC marker missed by AI');
      }

      // Medication-depletion test injectors — mirror wellness-plan exactly
      // so both pages produce the same list for the same patient.
      const medsLower = (medsStr ?? '').toLowerCase();
      const onMesalamine = isOnMed(medsLower, 'mesalamine_5asa');
      const onMetformin = isOnMed(medsLower, 'metformin');
      const onPPI = isOnMed(medsLower, 'ppi');
      const onStatin = isOnMed(medsLower, 'statin');

      if ((onMesalamine || onMetformin || onPPI) && !has(/\bb[\s-]?12\b|cobalamin|methylmalonic|\bmma\b|homocysteine/i)) {
        const med = onMesalamine ? 'mesalamine' : onMetformin ? 'metformin' : 'PPI';
        doc.tests_to_request.push({
          emoji: '🧬',
          test_name: 'Vitamin B12 Workup (Serum B12 + MMA + Homocysteine)',
          why_short: `${med} can deplete B12; check tissue status`,
          clinical_justification: `(b) On ${med} — known to impair B12 absorption over time. Serum B12 alone misses tissue deficiency; MMA and homocysteine are the sensitive markers. Standard care for any patient on long-term ${med}.`,
          icd10_primary: 'E53.8',
          icd10_description: 'Other specified vitamin B deficiencies',
          priority: 'high',
          insurance_note: 'Standard panel under medication-related deficiency code; $30–60 covered.',
        });
        console.log(`[doctor-prep] Injected B12 workup — ${med} depletion missed by AI`);
      }

      if (onMesalamine && !has(/\bfolate\b|folic\s*acid|methylfolate|5-mthf/i)) {
        doc.tests_to_request.push({
          emoji: '🌿',
          test_name: 'Folate Workup (Serum + RBC Folate)',
          why_short: 'Mesalamine depletes folate; check stores',
          clinical_justification: `(b) Mesalamine + UC inflammation impair folate absorption (FDA black box on sulfasalazine). Serum folate reflects intake; RBC folate is gold standard for tissue stores. Standard of care for any IBD patient on a 5-ASA agent.`,
          icd10_primary: 'E53.8',
          icd10_description: 'Folate deficiency, unspecified (E53.8 covers the broader B-vitamin deficiency code)',
          priority: 'high',
          insurance_note: 'Universally covered under medication-related deficiency.',
        });
        console.log('[doctor-prep] Injected folate workup — mesalamine depletion missed by AI');
      }

      if (onStatin && /\b(muscle|aches|cramp|weakness|myalg)/.test(symptomsLower) && !has(/creatine kinase|\bck\b/i)) {
        doc.tests_to_request.push({
          emoji: '💪',
          test_name: 'Creatine Kinase (CK)',
          why_short: 'Statin + muscle aches → rule out myopathy',
          clinical_justification: `(b) On a statin + reports muscle/aches symptoms — CK rules out statin-induced myopathy or rhabdomyolysis. Standard monitoring per cardiology guidelines.`,
          icd10_primary: 'M62.82',
          icd10_description: 'Rhabdomyolysis (rule-out)',
          priority: 'high',
          insurance_note: 'Universally covered when statin + muscle symptoms documented.',
        });
        console.log('[doctor-prep] Injected CK — statin + muscle symptoms missed by AI');
      }

      // Iron panel injector
      const hasHairLoss = /\bhair (loss|thin|fall)/.test(symptomsLower);
      const sex = (profile?.sex ?? '').toLowerCase();
      const ageNum = age ?? 99;
      const isMenstruatingFemale = sex === 'female' && ageNum >= 12 && ageNum <= 55;
      if ((hasHairLoss || hasUC || isMenstruatingFemale) && !has(/iron panel|ferritin|tibc|transferrin sat/i)) {
        const trigger = hasHairLoss && hasUC ? 'hair loss + UC malabsorption'
          : hasHairLoss ? 'hair loss'
          : hasUC ? 'UC malabsorption'
          : 'menstruating + symptoms';
        doc.tests_to_request.push({
          emoji: '🩸',
          test_name: 'Iron Panel (Serum Iron, TIBC, Ferritin, Transferrin Saturation)',
          why_short: `Rule out iron deficiency from ${trigger}`,
          clinical_justification: `(a)/(b) ${trigger} — full iron panel rules out functional iron deficiency that ferritin alone may miss. Standard of care for hair loss workup; common gap in IBD patients on 5-ASA agents.`,
          icd10_primary: 'D50.9',
          icd10_description: 'Iron deficiency anemia, unspecified',
          priority: 'high',
          insurance_note: 'Universally covered; ~$15 out-of-pocket if denied.',
        });
        console.log(`[doctor-prep] Injected iron panel — ${trigger} missed by AI`);
      }

      // ── Universal condition-aware injectors (any chronic dx) ─────────
      // All delegated to canonical registry — alias edits propagate everywhere.
      const hasIBD = hasCondition(conditionsLower, 'ibd');
      const hasHashimotos = hasCondition(conditionsLower, 'hashimotos');
      const hasGraves = hasCondition(conditionsLower, 'graves');
      const hasT2D = hasCondition(conditionsLower, 't2d');
      const hasPCOS = hasCondition(conditionsLower, 'pcos');
      const hasHTN = hasCondition(conditionsLower, 'hypertension');
      const hasCKD = hasCondition(conditionsLower, 'ckd');
      const hasCAD = /\b(cad|coronary|heart failure|chf|heart disease|atherosclerosis)\b/.test(conditionsLower);
      const hasLupus = /\b(lupus|sle|systemic lupus)\b/.test(conditionsLower);
      const hasRA = /\b(\bra\b|rheumatoid|psoriatic arthritis)\b/.test(conditionsLower);
      const hasOsteo = /\b(osteoporosis|osteopenia)\b/.test(conditionsLower);

      const inject = (entry: any, name: string) => {
        if (!has(new RegExp(name.split('(')[0].trim().replace(/\s+/g, '\\s*'), 'i'))) {
          doc.tests_to_request.push(entry);
        }
      };

      if (hasIBD) {
        inject({ emoji: '🩹', test_name: 'Fecal Calprotectin', why_short: 'IBD disease activity tracker', clinical_justification: '(c) IBD diagnosed — calprotectin is the standard disease-activity marker. Gastros order every 3-6 months for UC/Crohn\'s.', icd10_primary: 'K51.90', icd10_description: 'Ulcerative colitis, unspecified', priority: 'high', insurance_note: 'Universally covered with IBD diagnosis.' }, 'calprotectin');
        inject({ emoji: '🌾', test_name: 'Celiac Serology (tTG-IgA + Total IgA)', why_short: 'Rule out celiac (3x risk in IBD)', clinical_justification: '(d) IBD patients have 3x celiac prevalence. Standard rule-out at baseline.', icd10_primary: 'K90.0', icd10_description: 'Celiac disease', priority: 'moderate', insurance_note: 'Covered with IBD or hair loss + iron deficiency.' }, 'celiac');
      }
      if (hasHashimotos || hasGraves) {
        inject({ emoji: '🦋', test_name: 'Thyroid Panel (TSH + Free T3 + Free T4)', why_short: 'Track thyroid replacement / activity', clinical_justification: '(c) Diagnosed thyroid disease — quarterly TSH + Free T3/T4 standard.', icd10_primary: hasHashimotos ? 'E06.3' : 'E05.90', icd10_description: hasHashimotos ? 'Autoimmune thyroiditis' : 'Thyrotoxicosis, unspecified', priority: 'high', insurance_note: 'Universally covered with thyroid dx.' }, 'thyroid panel|free t[34]');
      }
      if (hasT2D || hasHTN || hasCAD) {
        inject({ emoji: '🫘', test_name: 'Urine Albumin/Creatinine Ratio (UACR)', why_short: 'Early kidney impact screen', clinical_justification: `(d) Diagnosed ${hasT2D ? 'diabetes' : hasHTN ? 'hypertension' : 'CV disease'} — early kidney damage marker. ADA/AHA recommend annually.`, icd10_primary: 'R80.9', icd10_description: 'Proteinuria, unspecified', priority: 'moderate', insurance_note: 'Covered with diabetes or hypertension.' }, 'uacr|albumin/creatinine|microalbumin');
      }
      if (hasPCOS) {
        inject({ emoji: '🌸', test_name: 'PCOS Hormone Panel (Total T + Free T + DHEA-S + LH:FSH + SHBG + Fasting Insulin)', why_short: 'Track PCOS hormone + insulin response', clinical_justification: '(c) Diagnosed PCOS — quarterly androgen + insulin tracking is standard.', icd10_primary: 'E28.2', icd10_description: 'Polycystic ovarian syndrome', priority: 'high', insurance_note: 'Covered with PCOS dx.' }, 'pcos hormone|dhea-s');
      }
      if (hasCKD) {
        inject({ emoji: '🫘', test_name: 'Cystatin C + eGFR', why_short: 'More sensitive kidney tracker', clinical_justification: '(c) Diagnosed CKD — Cystatin C is more accurate than creatinine, especially for muscular patients.', icd10_primary: 'N18.9', icd10_description: 'Chronic kidney disease, unspecified', priority: 'high', insurance_note: 'Covered with CKD dx.' }, 'cystatin');
      }
      if (hasLupus || hasRA) {
        inject({ emoji: '🔥', test_name: 'ESR (Sedimentation Rate)', why_short: 'Autoimmune activity tracker', clinical_justification: '(c) Diagnosed lupus/RA — ESR + hs-CRP together track autoimmune flares.', icd10_primary: hasLupus ? 'M32.9' : 'M06.9', icd10_description: hasLupus ? 'Lupus, unspecified' : 'Rheumatoid arthritis, unspecified', priority: 'moderate', insurance_note: 'Universally covered with autoimmune dx.' }, 'esr|sedimentation');
      }
      if (hasOsteo) {
        inject({ emoji: '🦴', test_name: 'PTH (Parathyroid Hormone) + Ionized Calcium', why_short: 'Rule out hyperparathyroidism', clinical_justification: '(c) Diagnosed osteoporosis — PTH rules out hyperparathyroid bone loss.', icd10_primary: 'M81.0', icd10_description: 'Age-related osteoporosis', priority: 'moderate', insurance_note: 'Covered with osteoporosis dx.' }, 'pth|parathyroid');
      }

      // ── UNIVERSAL TEST PAIRINGS (shared module — same rules in wellness-plan) ──
      const universalTests = buildUniversalTestInjections({
        age,
        sex: profile?.sex ?? null,
        conditionsLower,
        symptomsLower,
        labsLower,
        medsLower,
      });
      for (const u of universalTests) {
        const nameRegex = new RegExp(u.name.split('(')[0].trim().split(/\s+/)[0], 'i');
        if (doc.tests_to_request.some((t: any) => nameRegex.test(t?.test_name ?? ''))) continue;
        doc.tests_to_request.push({
          emoji: '🧪',
          test_name: u.name,
          why_short: u.whyShort,
          clinical_justification: u.whyLong,
          icd10_primary: u.icd10,
          icd10_description: u.icd10Description,
          priority: u.priority,
          insurance_note: u.insuranceNote,
        });
        console.log(`[doctor-prep] Universal-injected: ${u.name}`);
      }

      // ── WELLNESS PLAN AS SOURCE OF TRUTH ─────────────────────────────
      // If a recent wellness plan exists for this draw, OVERRIDE
      // tests_to_request with its retest_timeline. Doctor prep and wellness
      // plan now show the EXACT same test list, period. The AI-generated
      // tests_to_request and the deterministic injectors run as fallback for
      // cases where no wellness plan exists yet.
      const latestPlan = latestPlanRes?.data;
      const planRetest = (latestPlan?.plan_data as any)?.retest_timeline;
      const planDrawMatches = !!latestPlan && (!latestPlan.draw_id || latestPlan.draw_id === latestDraw?.id);
      const planFresh = !!latestPlan?.created_at && (Date.now() - new Date(latestPlan.created_at).getTime()) < 14 * 24 * 60 * 60 * 1000; // 14 days
      if (Array.isArray(planRetest) && planRetest.length > 0 && planDrawMatches && planFresh) {
        // Map wellness plan retest_timeline format → doctor prep tests_to_request format.
        // Newer wellness plans store the rich fields (icd10, priority, insurance_note);
        // older entries only have { marker, retest_at, why } — fall back gracefully.
        doc.tests_to_request = planRetest.map((t: any) => ({
          emoji: t.emoji ?? '🧪',
          test_name: t.marker ?? '',
          why_short: t.why_short ?? (t.why ? t.why.slice(0, 60) : ''),
          clinical_justification: t.why ?? '',
          icd10_primary: t.icd10 ?? t.icd10_primary ?? '',
          icd10_description: t.icd10_description ?? '',
          priority: t.priority ?? 'moderate',
          insurance_note: t.insurance_note ?? 'Discuss with doctor; covered with documented finding.',
          // Preserve specialist routing so PDFs + UI can group by venue
          // (PCP / GI / Imaging / Functional / Mental Health). Falls back
          // to 'pcp' if the wellness plan didn't tag it.
          specialist: t.specialist ?? 'pcp',
        }));
        console.log(`[doctor-prep] Sourced tests_to_request from wellness plan (${doc.tests_to_request.length} tests)`);
      } else {
        console.log(`[doctor-prep] No recent wellness plan — using AI-generated + injected tests_to_request (${doc.tests_to_request.length} tests)`);
      }

      // ── POSSIBLE CONDITIONS (differential) ──────────────────────────────
      // Separate from tests_to_request (baseline gap-fill). This list is
      // the differential-diagnosis ask: patterns the data fits that the
      // user hasn't been diagnosed with. Each entry carries its own
      // confirmatory_tests and "what to ask your doctor" prompt.
      const planSuspected = (latestPlan?.plan_data as any)?.suspected_conditions;
      if (Array.isArray(planSuspected) && planSuspected.length > 0 && planDrawMatches && planFresh) {
        doc.possible_conditions = planSuspected
          .filter((c: any) => c && typeof c.name === 'string' && c.name.trim().length > 0)
          .map((c: any) => ({
            name: c.name,
            category: c.category ?? 'other',
            confidence: c.confidence ?? 'low',
            evidence: c.evidence ?? '',
            confirmatory_tests: Array.isArray(c.confirmatory_tests) ? c.confirmatory_tests : [],
            icd10: c.icd10 ?? '',
            what_to_ask_doctor: c.what_to_ask_doctor ?? '',
            source: c.source === 'deterministic' ? 'deterministic' : 'ai',
          }));
        console.log(`[doctor-prep] Sourced possible_conditions from wellness plan (${doc.possible_conditions.length})`);
      } else if (!Array.isArray(doc.possible_conditions)) {
        doc.possible_conditions = [];
      }

      // Differential cap by mode
      const isOptMode = isHealthy;
      const testCap = isOptMode ? 10 : 20;
      if (doc.tests_to_request.length > testCap) {
        console.log(`[doctor-prep] capping tests_to_request ${doc.tests_to_request.length} -> ${testCap} (${isOptMode ? 'optimization' : 'treatment'} mode)`);
        doc.tests_to_request = doc.tests_to_request.slice(0, testCap);
      }
    } catch (e) { console.error('[doctor-prep] test-injector error:', e); }
    if (!Array.isArray(doc.advanced_screening)) doc.advanced_screening = [];
    if (!Array.isArray(doc.medications)) doc.medications = [];
    if (!Array.isArray(doc.discussion_points)) doc.discussion_points = [];
    if (!Array.isArray(doc.executive_summary)) doc.executive_summary = [];
    if (!Array.isArray(doc.patient_questions)) doc.patient_questions = [];
    if (!Array.isArray(doc.tell_doctor)) doc.tell_doctor = [];
    if (!Array.isArray(doc.questions_to_ask)) doc.questions_to_ask = [];
    if (!doc.headline) doc.headline = '';
    if (!Array.isArray(doc.medication_alternatives)) doc.medication_alternatives = [];
    if (!Array.isArray(doc.possible_conditions)) doc.possible_conditions = [];

    // ── Deterministic medication alternatives (universal backstop) ───────
    // The AI prompt asks for these but underfires on textbook cases (e.g.
    // atorvastatin + ALT > 60). The engine fires deterministically for the
    // highest-prevalence cases (statin + ALT, statin + myalgia, metformin
    // + measured B12 deficiency, long-term PPI + measured Mg/B12 low).
    // Merges with whatever the AI returned, deduped by current_medication.
    {
      const labCtx = labValues.map((v: any) => ({
        marker_name: v.marker_name,
        value: v.value,
        optimal_flag: v.optimal_flag,
        standard_flag: v.standard_flag,
      }));
      const merged = runMedicationAlternativesEngine(
        {
          medsLower: (medsStr ?? '').toLowerCase(),
          conditionsLower: (condStr ?? '').toLowerCase(),
          symptomsLower: (sympStr ?? '').toLowerCase(),
          labValues: labCtx,
        },
        doc.medication_alternatives,
      );
      if (merged.length !== doc.medication_alternatives.length) {
        console.log(`[doctor-prep] med-alternatives engine added ${merged.length - doc.medication_alternatives.length} entry/entries`);
      }
      doc.medication_alternatives = merged;
    }

    // ── DISCLAIMER (deterministic) ─────────────────────────────────────
    // Same wording on every doctor-prep doc. Treat as legal boilerplate.
    (doc as any).disclaimer = "This document is patient-prepared by CauseHealth, a wellness information service. It is not a medical record, not a diagnosis, and not medical advice. The suggested tests and possible conditions are general informational pattern-matches on the patient's lab data — clinical judgment, history, and exam are the physician's responsibility. CauseHealth is not a healthcare provider and does not replace professional medical care.";
    if (!doc.review_of_systems) doc.review_of_systems = {};
    if (!doc.lab_summary) doc.lab_summary = { draw_date: '', lab_name: '', urgent_findings: [], other_abnormal: [] };
    // ALWAYS overwrite — Haiku hallucinates the year (returns 2025 for a 2026
    // plan because of training-data freshness). Server-set dates only.
    doc.generated_at = new Date().toISOString();
    doc.document_date = new Date().toISOString().split('T')[0];

    // ── COMPLETENESS GATE ─────────────────────────────────────────────
    // Reject half-written prep BEFORE inserting. Mirrors the wellness plan
    // gate. If salvage produced a partial doc missing core fields, 500 it
    // and tell the user to retry without losing a cap slot.
    const missing: string[] = [];
    if (!doc.headline || typeof doc.headline !== 'string' || doc.headline.trim().length < 5) missing.push('headline');
    if (!Array.isArray(doc.tests_to_request)) missing.push('tests_to_request');
    if (!Array.isArray(doc.executive_summary) && !Array.isArray(doc.tell_doctor)) missing.push('executive_summary or tell_doctor');
    if (!doc.chief_complaint || typeof doc.chief_complaint !== 'string') missing.push('chief_complaint');
    if (missing.length > 0) {
      console.error('[doctor-prep] completeness gate REJECTED — missing:', missing);
      return new Response(JSON.stringify({
        error: `Doctor prep generation produced incomplete output. Missing: ${missing.join(', ')}. This won't count against your regen cap — try again.`,
        code: 'INCOMPLETE_GENERATION',
        missing_fields: missing,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('doctor_prep_documents').insert({
      user_id: userId,
      document_data: doc,
      draw_id: latestDraw?.id ?? null,
    });
    return new Response(JSON.stringify(doc), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
