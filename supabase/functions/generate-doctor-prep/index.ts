// supabase/functions/generate-doctor-prep/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';
import { buildUniversalTestInjections } from '../_shared/testInjectors.ts';
import { isHealthyMode } from '../_shared/healthMode.ts';
import { GOAL_LABELS, formatGoals } from '../_shared/goals.ts';

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
        model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
        system: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — apply to EVERY string in the JSON):
- 6TH-GRADE READING LEVEL. PERIOD. The user's friend who failed high school chemistry must be able to read it.
- BREVITY IS A FEATURE. Reading on a lunch break, has 30 seconds. Long paragraphs = closes the tab.
- HARD CAPS:
    chief_complaint: 1 sentence, ≤15 words.
    hpi: 2-3 short sentences, ≤60 words total.
    executive_summary[]: each bullet ≤20 words.
    tell_doctor[].headline: 6-10 words. tell_doctor[].detail: ≤20 words.
    tests_to_request[].why_short: 6-10 words. tests_to_request[].clinical_justification: ≤25 words, just trigger + what it rules out.
    questions_to_ask[].question: ≤25 words. questions_to_ask[].why: ≤15 words.
    discussion_points[]: ≤25 words each. lead with the ask.
    functional_medicine_note: 2 sentences max, ≤40 words.
- NO PERCENTAGE IMPROVEMENTS, NO MECHANISMS, NO LISTING dosages in why fields.
- NO JARGON. 6th-grade everywhere. Plain English ("liver enzyme" not "ALT", "blood sugar" not "glucose", "iron stores" not "ferritin"). Marker abbreviation in PARENTHESES only ("liver enzyme (ALT) is 97").
- Lead with a verb when action ("Tell your doctor...", "Ask for..."). Lead with the finding when why.
- Every card gets a one-emoji "emoji" field.
- If a sentence doesn't pull its weight, CUT IT. Don't pad. Don't hedge.

CRITICAL RULES:
1. RANGE MODEL — three states, treat them differently. Each lab in the labs section is tagged with its flag.
   - HEALTHY (within standard, not on Watch list) → DO NOT add to lab_summary.urgent_findings. Mention only as part of a pattern.
   - WATCH (within standard, on Watch list — HbA1c 5.4-5.6, ApoB ≥90, hs-CRP ≥0.5, fasting glucose 95-99, ferritin <50, vitamin D 30-40, etc.) → add to lab_summary.urgent_findings with calm tone. The point is lifestyle adjustment + 3-month retest, not rare-disease screening.
   - LOW / HIGH / CRITICAL_* (out of standard) → urgent_findings. Each gets a clinical note + tests_to_request entry if a specific test would investigate.
   The Watch list is curated. Do NOT add markers to it. Functional-medicine "optimal" ranges are deliberately not the trigger — many users will be high-normal on ALT/MCV/RDW/TSH/etc. and that is clinically fine.

2. PATTERN RECOGNITION: Multi-marker patterns are the highest-value finding even when individual markers look OK. Each pattern goes in executive_summary AND a discussion_point. Examples:
   - Triglycerides high + glucose high-normal + HDL low + waist gain → insulin resistance pattern → fasting insulin + HOMA-IR + ApoB.
   - ALT out of range + triglycerides high + weight gain → NAFLD pattern → liver ultrasound + GGT.
   - Hair loss + fatigue + ferritin <50 → functional iron deficiency → full iron panel.
   - 3+ Watch or out-of-range values clustering in one organ system → escalate that system.

CAUSEHEALTH IS NOT A LONGEVITY OR FUNCTIONAL-MEDICINE APP. We are a clinical-translation tool. We help patients:
  1. Identify what their bloodwork actually shows
  2. Connect their reported symptoms to potential causes (lab abnormality, medication side effect, nutrient depletion)
  3. Walk into their next appointment with a test list a PCP CANNOT REASONABLY REFUSE.
We do NOT recommend functional-medicine extras (GI-MAP, hair tissue mineral analysis, organic acids urine test, food sensitivity panels, micronutrient panels). We do NOT recommend longevity wishlists (NMR lipid, VO2 max, DEXA before age 50, comprehensive thyroid antibody panels in asymptomatic patients, advanced cardiology unless 35+ with risk factors).

THE BAR: every test in tests_to_request must clear the "DOCTOR CAN'T REJECT IT" test:
  - Standard, insurance-covered, primary-care-orderable diagnostic
  - Tied to a documented finding (out-of-range marker, reported symptom, current medication's known depletion, or standard-of-care baseline gap for age/sex)
  - Has a SPECIFIC ICD-10 code that justifies coverage under the documented finding
  - Is a test the doctor orders every day for similar patients
If a PCP could reasonably look at a test and say "I won't order that" or "your insurance won't cover it" — DROP IT or rewrite the justification until it's bulletproof. The patient should walk out with every test ordered, not back-and-forth-arguing.

3. WHEN TO RECOMMEND TESTS (tests_to_request) — STRICT TRIAGE RULE:
   A test may ONLY appear in tests_to_request if it directly investigates ONE of:
     (a) a symptom the patient actually reported, OR
     (b) a known depletion / side-effect from a medication they're currently taking, OR
     (c) an out-of-range, Watch-tier, OR EARLY-DETECTION marker pattern on THIS lab draw (see list below), OR
     (d) a STANDARD-OF-CARE BASELINE TEST for this patient's age/sex that is MISSING from the draw (see list below).
   If none of (a)/(b)/(c)/(d) applies, DO NOT include the test. No "while we're at it" screening beyond the standard-of-care baseline. The triage rule is universal — it applies in HEALTHY MODE too. A healthy patient gets FEWER tests, not a longevity wishlist.
   For each test, the clinical_justification MUST cite the specific trigger:
     - For (a): "Patient reports [symptom]"
     - For (b): "On [medication] — known to deplete [nutrient] / cause [side effect]"
     - For (c): "[Marker] = [value] [flag] — [pattern]"
     - For (d): "Standard-of-care baseline for [age]yo [sex] — not in this lab draw"
   If you can't cite a trigger, drop the test. Differential thinking: before adding a test, ask "if this comes back abnormal, does management change?" If no, drop it.

   STANDARD-OF-CARE BASELINE BY AGE/SEX (trigger (d) — recommend ONLY IF the test is NOT already present in the lab values list shown to you. Check the LAB VALUES list before suggesting):
   ALL ADULTS (18+):
     - Lipid panel (total cholesterol, LDL, HDL, triglycerides) — every 4–6 years per AHA, more often if elevated
     - HbA1c — every 3 years from age 35 (ADA), or any age with risk factors (BMI >25, family hx, IR signs)
     - TSH — at least once in adulthood; recheck every 5y or when symptoms change. ESPECIALLY for women.
     - Vitamin D (25-OH) — at least once; deficiency is endemic. Repeat if <30.
     - Ferritin — especially menstruating women, vegetarians, endurance athletes, GI symptoms.
     - hs-CRP — once in adulthood for cardiovascular risk stratification (AHA).
     - Vitamin B12 — once in adulthood; mandatory if vegetarian, on metformin, on PPI, or >50.
   AGE 35+ (add):
     - ApoB — modern primary cardiovascular risk marker (preferred over LDL alone per recent AHA/ESC guidance).
     - Lp(a) — ONCE in a lifetime. Genetic CV risk, doesn't change. Most adults have never had it.
     - Fasting insulin — if any insulin-resistance signs (waist circumference, A1c >5.4, family hx).
     - Free T3 + Free T4 — if TSH borderline or thyroid symptoms.
   AGE 45+ (add):
     - Coronary artery calcium score (CAC) — once, if any ASCVD risk factors. Outperforms LDL for risk.
     - PSA (men) — discuss with doctor; not universal but standard to consider.
   AGE 50+ (add):
     - DEXA scan referral (women) — bone density baseline at menopause.
     - Colorectal screening discussion (FIT test or colonoscopy referral).
   WOMEN-SPECIFIC at any age:
     - Iron panel (serum iron, TIBC, ferritin, transferrin sat) if menstruating + ANY fatigue/hair issues.
     - HPV screening / pelvic exam discussion (refer, don't test in this context).
   MEN-SPECIFIC 35+:
   MEN-SPECIFIC ANY AGE:
     - Total testosterone + SHBG + estradiol — once-in-lifetime baseline. Standard CauseHealth recommendation regardless of age or symptoms. Cheap, insurance-typically-covered, and gives the user a baseline to compare future draws against. Frame as "baseline for trend tracking" not "you have low T."

   When trigger (d) fires, frame the clinical_justification as: "Standard baseline for [age]yo [sex] — not present in this draw. Common gap that USPSTF / AHA / ADA recommends for routine evaluation." Tone: matter-of-fact, not alarmist.

   SYMPTOM → STANDARD-OF-CARE TEST MAPPING (trigger (a) — ONE focused workup per symptom; never functional-medicine extras):
     Fatigue: CBC, Ferritin + Iron Panel, B12+MMA, Vit D, TSH, A1c, AM cortisol if HPA signs; men add T+SHBG
     Joint pain: hs-CRP, Vit D, Uric Acid; ESR+RF+anti-CCP only if persistent inflammatory >6wk
     Can't lose weight: Fasting Insulin+HOMA-IR, A1c, TSH (free T3/T4 if borderline), AM cortisol, T (men)
     Hair loss: Ferritin+Iron Panel, Vit D, TSH+TPO; women add free T+DHEA-S if androgen pattern
     Brain fog: B12+MMA, Vit D, TSH, Ferritin, A1c
     Low mood: Vit D, B12, TSH, AM cortisol if other stress; men add T
     Sleep issues: Vit D, Ferritin (RLS), AM cortisol, A1c, TSH
     GI symptoms: CMP, Albumin, tTG-IgA+Total IgA, H. pylori if epigastric pain
     Acne: women → T+Free T+DHEA-S+Fasting Insulin (PCOS); men → liver + insulin (NAFLD-acne)
     Cold/heat intolerance: TSH, free T3, free T4, Ferritin
     Frequent urination/thirst: Fasting Glucose, A1c, BMP
     Palpitations: TSH, CMP, CBC
     Restless legs: Ferritin (>75 target), Iron Panel, B12
     Recurrent infections: Vit D, CBC w/ diff, Total IgA+IgG
     Poor recovery: men → T+SHBG+Estradiol; Vit D, Ferritin

   EARLY-DETECTION MARKER PATTERNS (trigger (c) — within-range but clinically meaningful; cite value in clinical_justification):
     Ferritin <50: full Iron Panel (esp. with fatigue/hair loss/RLS/menstruating female)
     B12 <500 + (fatigue/brain fog/neuropathy): MMA + homocysteine
     MCV >92 no anemia: B12, folate, MMA
     MCV <82 no anemia: Iron Panel + hemoglobin electrophoresis
     A1c 5.4–5.6 OR glucose 95–99 OR TG high + HDL low: Fasting Insulin + HOMA-IR
     ApoB ≥90: ApoB + Lp(a) once-in-lifetime
     hs-CRP ≥0.5: repeat in 3mo + investigate source if persistent
     ALT >25 + high TG or weight gain: liver ultrasound + GGT (NAFLD)
     TSH 2.5–4.5 + hypothyroid sx: Free T3/T4 + TPO Ab + Tg Ab (Hashimoto's screen)
     TSH <1.0 + sx: Free T3/T4 + TSI Ab (Graves' screen)
     Total T <500 in symptomatic male: Free T, SHBG, Estradiol, LH, FSH
     Premenopausal female + cycle/acne/hirsutism/IR signs: PCOS panel (T+Free T+DHEA-S+LH:FSH+Fasting Insulin+SHBG)
     Female 35–50 + cycle changes/hot flashes: AMH + FSH + Estradiol (perimenopause)
     Vitamin D 30–40: recheck in 3mo; <30 always retest
     Uric Acid >6 (F) or >7 (M) young patient: lifestyle + recheck
     Calcium >10.0 repeated: PTH + Ionized Calcium (hyperparathyroidism)
     Globulin >3.0: A/G ratio + total protein; investigate if >3.5 with anemia/bone pain
     GI sx + iron def or low albumin: Celiac Panel (tTG-IgA + Total IgA)
     Snoring + daytime fatigue + HTN + IR: sleep questionnaire + sleep study

   AUTOIMMUNE/ENDOCRINE PATTERNS (commonly missed — surface when triggers match):
     Hashimoto's: TSH 2.5–4.5 + fatigue/weight gain/cold/hair loss/family hx → TPO Ab + Tg Ab. Also if patient has another autoimmune dx.
     Graves': TSH <1.0 + heat intolerance/palpitations → Free T3/T4 + TSI Ab.
     Pernicious anemia: B12 <500 + MCV >95 OR autoimmune hx → Intrinsic Factor Ab + Parietal Cell Ab + MMA + homocysteine.
     Sjögren's: dry eyes/mouth/joint pain + ANA+ OR existing autoimmune → SSA(Ro)+SSB(La) Ab + rheumatology.
     LADA (mislabeled T2D in lean adults): rising A1c + lean + age 25–55 + family hx T1D → GAD-65 + IA-2 Ab + C-peptide.
     Addison's: chronic fatigue + salt cravings + low Na + high K + skin hyperpigmentation → AM cortisol + ACTH + stim test.
     PBC: female + ALP DISPROPORTIONATELY high vs AST/ALT + itching → AMA + GGT.
     Autoimmune hepatitis: ALT/AST high + female + ANA+ OR ASMA → ASMA + anti-LKM + IgG.
     Hemolytic anemia: anemia + elevated indirect bilirubin + LDH → Haptoglobin + reticulocyte + smear + Coombs.
     Early CKD: eGFR 60–89 sustained OR proteinuria → UACR + Cystatin C + nephrology if dropping.
     MASH/fibrotic NAFLD risk: ALT/AST high + low-normal platelets + age 40+ → FIB-4 score + FibroScan if >1.45.
     EBV reactivation: persistent fatigue >6mo + elevated lymph/mono + adenopathy → EBV panel (VCA-IgG/IgM, EBNA-1).

   WEIRD-CASE PATTERNS (presentations doctors dismiss when single numbers look fine — fire only when the cluster matches):
     Lean PCOS: premenopausal female + cycle irregularity + ANY androgen elevation regardless of BMI → full PCOS panel.
     T4→T3 conversion (low-T3): hypothyroid sx + TSH/Free T4 in range + (Free T3 low-normal OR Reverse T3 >250) → Free T3 + Reverse T3 + selenium + ferritin.
     Subclinical hemochromatosis: transferrin sat >45% any ferritin → iron panel repeat + HFE genetics.
     MGUS surveillance: globulin 3.0–3.5 + age >50 → annual SPEP + free light chains. Monitoring framing.
     Functional B12: B12 500–800 + (vegetarian/metformin/PPI/fatigue/neuropathy) → MMA + homocysteine.
     Hidden Lp(a): normal LDL + family hx early MI/stroke → Lp(a) once-in-lifetime.
     ADHD/RLS-iron: ferritin <75 + cognitive/sleep/mood → optimize to >100 BEFORE stimulants.
     POTS: palpitations + standing lightheadedness + fatigue + (female 15–45 OR post-viral) → 10-min orthostatic stand test + cardiology.
     Autoimmune neutropenia: WBC <4.0 sustained + recurrent infections → CBC repeat + ANA + B12 + folate.
     SIBO/IMO: persistent bloating + post-meal gas + symptoms worse on prebiotic foods → lactulose breath test.

   Use these patterns ONLY when a marker on THIS draw OR a symptom on file matches the cluster. Don't fish on healthy patients.
4. AGE AND SEX CONTEXT: Always consider the patient's age and sex when evaluating findings. A value that is "normal" for a 50-year-old male may be concerning in an 18-year-old female. Apply age/sex-appropriate clinical reasoning.

FEMALE HORMONE RULE: Do NOT interpret estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase. A single blood draw cannot diagnose "estrogen dominance" without knowing cycle day. Note this limitation if discussing these values.

GOAL-DRIVEN TAILORING: The user provides their personal goals. Discussion points, patient questions, and tests_to_request must visibly connect to these. If primary goal is "energy" — one discussion point addresses energy-relevant findings. If "longevity" — focus on metabolic optimization and preventive screening. The functional_medicine_note must tie the patient's biggest finding back to their stated goals.

HEALTHY MODE (when MODE=healthy is passed in the user message — patient's labs are mostly within standard range, no urgent findings):
The patient is using the appointment to confirm they're on the right track and address the 1-2 Watch markers. The TONE changes; the test-recommendation RULE does NOT.
- chief_complaint: lead with "Wellness check-in" or "Optimization-focused visit" — not a complaint.
- hpi: describe the patient's strengths (markers in range, lifestyle effort) and the 1-2 Watch markers worth addressing. No alarmist tone.
- executive_summary: 1) what's working well, 2) the 1-2 Watch markers + the specific lifestyle adjustments to address them.
- tests_to_request: STILL goes through the strict triage rule (a)/(b)/(c)/(d). For healthy patients, the dominant trigger should be (d) STANDARD-OF-CARE BASELINE GAP — only tests on the standard-of-care list (earlier in this prompt) that the doctor did not order. NOT a longevity wishlist. NOT every advanced marker.
   The healthy-patient algorithm:
     1. Look at the lab draw. What's there?
     2. Compare against the standard-of-care baseline for the patient's age/sex. What's MISSING?
     3. Recommend the missing baseline tests, cap at 5.
     4. STOP.
   Example: 28yo male with lipid panel + glucose + TSH + CBC tested. Vitamin D, A1c, B12 are standard-of-care baselines that are missing → recommend those 3. Cortisol, zinc, free testosterone, homocysteine, fasting insulin, full thyroid antibodies are NOT standard-of-care baselines for an asymptomatic 28yo — DO NOT recommend them.
   Tests triggered by genuine symptoms (even if labs are normal) are also allowed under trigger (a).
- discussion_points: framed as "I want to confirm I'm on track and address X" — not "I have these problems."
- patient_questions: 2-3 questions tied to the actual Watch markers or symptoms.
- functional_medicine_note: celebrate the strengths first, then the 1-2 things to optimize.
- The Patient Visit Guide PDF will share these tests verbatim — keep it short and specific so the patient doesn't walk into the appointment with a wishlist of 10 tests their PCP will reject.

LIMITED-DATA MODE: If the user has NO lab values uploaded (only symptoms, conditions, medications, goals), generate a SCREENING-FOCUSED clinical prep:
- executive_summary should say "Based on your symptoms and history, here's what to ask for at your visit" rather than referencing labs
- tests_to_request becomes the BASELINE PANEL the doctor should order (CMP, CBC, lipid panel, TSH, vitamin D, hs-CRP, ferritin, A1c) — tailored to the user's symptoms and goals
- advanced_screening can include condition-specific tests based on symptoms alone (celiac if GI symptoms, HLA-B27 if joint pain + IBD, etc.)
- discussion_points focus on getting the right tests ordered
- DO NOT pretend you have lab data you don't have

FORMAT: executive_summary (3-5 bullets in plain English), HPI (3-5 sentences), ROS (1-2 sentences/system), discussion_points (5-8 items, 1-2 sentences each — lead with the ask, explain WHY in simple terms anyone can understand), patient_questions (3-5 plain language questions to literally read to your doctor), functional_medicine_note (2-3 sentences).

WRITING STYLE: Write like you're explaining to a smart friend, not a medical textbook. Instead of "hepatocellular dysfunction" say "your liver enzymes suggest it's working harder than it should." Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Keep discussion points SHORT — the patient needs to scan this in the waiting room, not read an essay.

TESTS — TWO SEPARATE LISTS:

1. tests_to_request (the COMPLETE list of bloodwork to address at the next visit — should be IDENTICAL in scope to the Wellness Plan's retest_timeline):
   - This list MUST cover BOTH:
       (i) RE-MEASURE: every currently-abnormal marker on this draw (out-of-range OR Watch-tier). At the visit, the patient asks the doctor to re-order these alongside any new tests.
       (ii) NEW TESTS: tests not on the current draw that are triggered by symptoms (a), medication depletions (b), or standard-of-care baseline gaps (d).
   - The clinical reality: when a patient walks into their doctor's office, they ask for ONE comprehensive panel — not "retests" vs "new tests" as separate buckets. tests_to_request must contain ALL of them combined; this matches the Wellness Plan's single unified retest_timeline list.
   - MAXIMUM 14 tests for treatment-mode patients with multi-system issues; 5-7 for healthy patients. Be COMPREHENSIVE for sick patients — 5-test panels on someone with UC + dyslipidemia + low T + insulin resistance leave the patient back at the doctor in 6 weeks for round two. If fewer triggers exist, return fewer.
   - When the draw is BARE-BONES (under ~30 markers, no ApoB/Lp(a)/A1c/vitamin D/ferritin/TSH/B12), prioritize trigger (d) baseline gaps so the patient walks out of the next visit with a complete workup.
   - ONE focused workup per row. Do NOT bundle across organ systems.
   - CONSOLIDATE into STANDARD PANELS. Doctors order panels, not individual markers. ALT, AST, bilirubin, glucose, calcium are ALL part of the CMP — never list them as separate entries. Same for lipid panel and CBC. Use these standard panel names:
       - "Comprehensive Metabolic Panel (CMP)" → covers ALT, AST, ALP, Bilirubin (total + direct), Albumin, Total Protein, Glucose, BUN, Creatinine, eGFR, Sodium, Potassium, Chloride, CO2, Calcium
       - "Lipid Panel" → Total Cholesterol, LDL, HDL, Triglycerides, VLDL, non-HDL
       - "Complete Blood Count (CBC) with Differential" → WBC, RBC, Hemoglobin, Hematocrit, MCV, MCH, MCHC, RDW, Platelets, Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils
       - "Iron Panel" → Serum Iron, TIBC, Ferritin, Transferrin Saturation, UIBC
       - "Vitamin B12 Workup" → Serum B12, MMA, Homocysteine
       - "Folate Workup" → Serum Folate, RBC Folate
       - "Testosterone Panel (Male)" → Total T, Free T, SHBG, Estradiol; add LH/FSH only if low T confirmed
       - "PCOS Panel (Female)" → Total T, Free T, DHEA-S, LH:FSH, SHBG, Fasting Insulin
       - "Thyroid Panel" → TSH, Free T3, Free T4 (only when triggered)
       - "Hashimoto's Antibodies" → TPO Ab, Thyroglobulin Ab (only when triggered)
       - "Insulin Resistance Workup" → Fasting Insulin, HOMA-IR
       - Single-test entries: HbA1c, Vitamin D 25-OH, hs-CRP, ApoB, Lp(a), GGT, Uric Acid, PTH, Ionized Calcium
   The patient should walk out with ~10-14 lab orders covering 30-50 individual values, not 30 separate entries the doctor has to mentally group.
   - clinical_justification: ONE SENTENCE that NAMES the trigger letter and the specific finding. Examples:
       "(c) Triglycerides 327 critical-high — re-measure to confirm response to omega-3 + diet."
       "(a) Reports fatigue + hair loss + (c) ferritin not on draw — full iron panel rules out functional iron deficiency."
       "(d) Standard baseline for 28yo male — Lp(a) is a once-in-lifetime CV risk marker not in this draw."
       "(b) On atorvastatin — recheck ALT (currently 97) to confirm liver recovery on lipid protocol."
   - Each test gets the MOST SPECIFIC ICD-10 code. No lazy reuse.
   - Tier as urgent/high/moderate based on the trigger severity, not on the test itself.

   The OUTPUT of this list must mirror the Wellness Plan's retest_timeline: same test names, same triggers, same priorities. The user should see ONE coherent list across both pages, just framed differently (retest tracking vs visit prep).

PLACEMENT RULES (which list a test belongs in):

   ABSOLUTE BLOCKLIST — these tests CAN NEVER go in tests_to_request. They ALWAYS go in advanced_screening, UNLESS the patient hits the hard urgent threshold listed:
     - JAK2 V617F → tests_to_request ONLY when platelets >450 OR (RBC >6.0 AND Hct >54). Borderline-high RBC/Hct is NOT enough.
     - Erythropoietin level → same rule as JAK2, only when JAK2 is justified.
     - Celiac panel (tTG-IgA, total IgA) → tests_to_request ONLY when persistent malabsorption symptoms >90 days OR low albumin + iron deficiency + GI symptoms.
     - HLA-B27 → tests_to_request ONLY when persistent inflammatory back pain >90 days unresponsive to lifestyle. Joint pain + IBD on day 1 goes to advanced_screening, NOT essential.
     - ANA reflex panel (anti-dsDNA, anti-Sm, anti-Ro/La, anti-Scl-70) → tests_to_request ONLY when ANA is already positive on this draw. Otherwise advanced_screening.
     - Multiple myeloma panel (SPEP, UPEP, free light chains) → tests_to_request ONLY when globulin >3.5 AND patient under 40, OR persistent hypercalcemia, OR unexplained anemia + bone pain.
     - Hereditary hemochromatosis genetics → advanced_screening unless ferritin >300 with elevated transferrin saturation >45%.
     - MTHFR genetics → advanced_screening always (controversial clinical utility).
     - Pituitary MRI → advanced_screening unless prolactin >100.
     - 24h urinary cortisol (Cushing's screening) → advanced_screening unless multiple Cushing's stigmata.
     - Flow cytometry / hematology specialty workups → advanced_screening unless absolute counts are critical.
   The default day-1 test list should feel ROUTINE: lipid NMR, fasting insulin, iron panel, vitamin D recheck, liver ultrasound, thyroid panel, basic celiac IF GI symptoms, hsCRP. Things a primary care doctor orders without raising eyebrows.
   - Liver workup with elevated ALT/AST → ICD-10 should be R74.0 (abnormal liver function tests), NOT R19.00 (abdominal mass) for any liver-related test or imaging.
   - Insurance Note should mention specific common scenarios: "usually covered under abnormal LFTs," "may need prior auth for specialty panels," "out-of-pocket cost ~$X if not covered."

2. advanced_screening — DEFAULT TO EMPTY ARRAY [].
   Do NOT populate this from the prompt. The post-processor moves any blocklisted rare-disease tests here automatically. Your job is to NOT generate them in the first place. Return [] unless a specific marker on THIS draw hits a hard urgent threshold (platelets >450, calcium >10.5, prolactin >100, ferritin >300 + transferrin sat >45%, globulin >3.5 with anemia/bone pain). Even then, maximum 1 entry.

ICD-10: Use most specific code. Corrections applied post-generation.

Be concise. Scannable in 3 minutes.`,
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
${allLabsStr.slice(0, 4000)}

Return JSON:
{"generated_at":"${new Date().toISOString()}","document_date":"${new Date().toISOString().split('T')[0]}","headline":"one 12-word verdict — the single most important thing for this visit","executive_summary":["3-5 plain English bullets, 1 sentence each"],"chief_complaint":"one sentence","hpi":"2-3 sentences in plain English","pmh":"","medications":[{"name":"","dose":"","notable_depletion":""}],"review_of_systems":{"constitutional":"","cardiovascular":"","gastrointestinal":"","endocrine":""},"lab_summary":{"draw_date":"","lab_name":"","urgent_findings":[{"emoji":"🚨","marker":"","value":"","flag":"","clinical_note":"plain English, 1 sentence"}],"other_abnormal":[{"emoji":"⚠️","marker":"","value":"","flag":""}]},"tell_doctor":[{"emoji":"💬","headline":"6-10 word headline of what to tell the doctor","detail":"1 sentence plain-English context"}],"tests_to_request":[{"emoji":"🧪","test_name":"","why_short":"6-10 word reason in plain English","clinical_justification":"1 sentence","icd10_primary":"","icd10_description":"","priority":"urgent|high|moderate","insurance_note":""}],"advanced_screening":[{"emoji":"🔬","test_name":"","why_short":"6-10 word reason","clinical_justification":"1 sentence — why this rare condition needs ruling out","icd10_primary":"","icd10_description":"","priority":"high|moderate","insurance_note":"may require specialist referral"}],"questions_to_ask":[{"emoji":"❓","question":"the exact plain-language question to read aloud","why":"1 sentence why it matters"}],"discussion_points":["1-2 sentences, lead with the ask"],"patient_questions":["plain language fallback list"],"functional_medicine_note":"2-3 sentences in plain English"}

CRITICAL OUTPUT RULES (for the new card-stack UI):
- tell_doctor: 3-5 cards. The most important things this patient must mention (chief complaint, key symptoms, key abnormal lab in lay terms).
- tests_to_request: keep the existing rules — max 14 for multi-system treatment-mode patients (5-7 for healthy), one workup per row, must mirror the Wellness Plan retest_timeline.
- questions_to_ask: 3-5 plain-language questions the patient can literally read aloud at the visit.
- Every card has an emoji and a short headline so it's scannable in 2 seconds.` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    const stopReason = aiRes.stop_reason ?? 'unknown';
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);
    let doc;
    try { doc = JSON.parse(rawText); } catch {
      // Try salvaging truncated JSON (max_tokens hit)
      if (stopReason === 'max_tokens') {
        try {
          let salvaged = rawText.replace(/,\s*$/, '').replace(/,\s*"[^"]*"?\s*$/, '');
          const openBraces = (salvaged.match(/\{/g) || []).length - (salvaged.match(/\}/g) || []).length;
          const openBrackets = (salvaged.match(/\[/g) || []).length - (salvaged.match(/\]/g) || []).length;
          for (let i = 0; i < openBrackets; i++) salvaged += ']';
          for (let i = 0; i < openBraces; i++) salvaged += '}';
          doc = JSON.parse(salvaged);
          console.log('[doctor-prep] Salvaged truncated JSON');
        } catch { throw new Error('Failed to parse AI response — output was truncated'); }
      } else { throw new Error('Failed to parse AI response as JSON'); }
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

      const hasUC = /\b(ulcerative colitis|crohn|ibd|inflammatory bowel)\b/.test(conditionsLower);
      const hasAutoimmune = hasUC || /\b(hashimoto|graves|lupus|sle|ra|rheumatoid|psoriasis|ms|multiple sclerosis|celiac|t1d|type 1 diabetes)\b/.test(conditionsLower);
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
      const onMesalamine = /\b(mesalamine|sulfasalazine|asacol|pentasa|lialda|apriso)\b/.test(medsLower);
      const onMetformin = /\b(metformin|glucophage)\b/.test(medsLower);
      const onPPI = /\b(omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole|prilosec|nexium|protonix)\b/.test(medsLower);
      const onStatin = /\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|pitavastatin|fluvastatin|crestor|lipitor|zocor)\b/.test(medsLower);

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
      const hasIBD = /\b(ulcerative colitis|crohn|ibd|inflammatory bowel|indeterminate colitis)\b/.test(conditionsLower);
      const hasHashimotos = /\b(hashimoto|autoimmune thyroid|chronic thyroiditis)\b/.test(conditionsLower);
      const hasGraves = /\b(graves|hyperthyroid)\b/.test(conditionsLower);
      const hasT2D = /\b(type 2 diabet|t2d|t2dm|diabetes mellitus type 2|prediabet)\b/.test(conditionsLower);
      const hasPCOS = /\b(pcos|polycystic ovar)\b/.test(conditionsLower);
      const hasHTN = /\b(hypertension|htn|high blood pressure)\b/.test(conditionsLower);
      const hasCKD = /\b(ckd|chronic kidney|kidney disease|renal disease)\b/.test(conditionsLower);
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
        }));
        console.log(`[doctor-prep] Sourced tests_to_request from wellness plan (${doc.tests_to_request.length} tests)`);
      } else {
        console.log(`[doctor-prep] No recent wellness plan — using AI-generated + injected tests_to_request (${doc.tests_to_request.length} tests)`);
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
    if (!doc.review_of_systems) doc.review_of_systems = {};
    if (!doc.lab_summary) doc.lab_summary = { draw_date: '', lab_name: '', urgent_findings: [], other_abnormal: [] };
    if (!doc.generated_at) doc.generated_at = new Date().toISOString();
    if (!doc.document_date) doc.document_date = new Date().toISOString().split('T')[0];

    await supabase.from('doctor_prep_documents').insert({ user_id: userId, document_data: doc });
    return new Response(JSON.stringify(doc), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
