// supabase/functions/generate-doctor-prep/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const [profileRes, medsRes, symptomsRes, conditionsRes, suppsRes, latestDrawRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId).order('severity', { ascending: false }),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose, duration_category, reason').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id, draw_date, lab_name').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
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

    const allLabsStr = labValues.map((v: any) =>
      `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Ref: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'}) ${v.standard_flag && v.standard_flag !== 'normal' ? '[' + v.standard_flag.toUpperCase() + ']' : ''}`
    ).join('\n') || 'No labs';

    // Goals → readable labels for prompt tailoring
    const GOAL_LABELS: Record<string, string> = {
      understand_labs: 'Understand my bloodwork',
      energy: 'Fix my energy and brain fog',
      off_medications: 'Reduce my medications',
      hair_regrowth: 'Regrow my hair',
      heart_health: 'Improve heart health',
      gut_health: 'Fix my gut',
      weight: 'Lose weight',
      hormones: 'Balance my hormones',
      doctor_prep: 'Prepare for a doctor visit',
      longevity: 'Longevity and prevention',
      autoimmune: 'Manage autoimmune disease',
      pain: 'Reduce pain',
    };
    const userGoals: string[] = (profile?.primary_goals ?? []).filter((g: any) => typeof g === 'string');
    const goalsStr = userGoals.length > 0
      ? userGoals.map((g) => GOAL_LABELS[g] ?? g).join(', ')
      : 'Not specified';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
        system: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — apply to EVERY string in the JSON):
- 6th-grade reading level. No medical jargon without a plain-English definition right after.
- One sentence per bullet. Lead with a verb when it's an action ("Tell your doctor...", "Ask for...").
- Replace clinician language with what a 12-year-old understands: "stress hormone" not "cortisol", "iron stores" not "ferritin".
- Every card item gets a one-emoji "emoji" field as a visual anchor.
- Users scan, they don't read. If a sentence isn't pulling weight, cut it.

CRITICAL RULES:
1. EVERY lab value outside optimal range MUST be addressed. Do NOT skip ANY abnormal finding, even if it seems unrelated to the chief complaint. Every monitor/urgent value gets a discussion point and test recommendation.
2. PATTERN RECOGNITION: Look for multi-marker patterns that point to specific undiagnosed conditions. Connect abnormal values across organ systems. Examples of patterns to detect (apply universally, not just these):
   - Elevated platelets + elevated RDW + fatigue → iron deficiency anemia, chronic inflammation, or myeloproliferative disorder — order iron panel, peripheral smear, JAK2 if persistent
   - Elevated globulin + low albumin → chronic infection, autoimmune disease, or liver dysfunction
   - Low HDL + elevated triglycerides + borderline glucose → metabolic syndrome / insulin resistance
   - Elevated liver enzymes + elevated bilirubin → hepatotoxicity, hemolysis, or biliary disease
   - Low CO2 + low chloride → metabolic acidosis, chronic diarrhea, or renal tubular issue
   - Elevated WBC + elevated RDW + fatigue → occult infection, stress response, or hematologic process
   Flag EVERY pattern you find in the executive_summary and dedicate a discussion_point to each. The goal is EARLY DETECTION — find what the doctor's 12-minute appointment will miss.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE TO IGNORE. If a value exceeds optimal range, it requires investigation even if the standard lab report says "normal." This is what CauseHealth exists for. MANDATORY follow-up rules (apply to ALL patients):
   - Platelets >300 → peripheral smear + JAK2 V617F mutation (myeloproliferative screening)
   - RDW >13 → iron panel + B12/folate + reticulocyte count (early anemia/deficiency detection)
   - Fasting glucose >90 → fasting insulin + HOMA-IR (insulin resistance often hides behind "normal" glucose)
   - TSH >2.5 OR <1.0 → free T3 + free T4 + TPO + thyroglobulin antibodies (subclinical thyroid disease)
   - ALT >25 → liver ultrasound + hepatitis panel (fatty liver disease starts well before "abnormal" range)
   - Vitamin D <40 → repletion protocol + recheck in 8 weeks
   - Homocysteine >8 → B12/folate/B6 + consider MTHFR (cardiovascular and neurologic risk)
   - hs-CRP >1 → full inflammatory workup + autoimmune screening
   - WBC >10 → differential + infection/inflammation workup
   - Any combination of 3+ suboptimal values across different organ systems → screen for autoimmune disease, celiac, and metabolic syndrome regardless of chief complaint
   ADDITIONAL EARLY DETECTION RULES:
   - AST/ALT ratio >2 → screen for alcoholic liver disease + macrocytic anemia panel (often missed when both enzymes are within standard range)
   - Triglyceride/HDL ratio >3.5 → strongest insulin resistance predictor; order fasting insulin + HOMA-IR + ApoB even if A1c is normal
   - HbA1c >5.4 → fasting insulin + HOMA-IR (catches insulin resistance before glucose rises)
   - MCH/MCV mismatch (low MCV with relatively normal MCH) → thalassemia trait screening (commonly missed in non-anemic patients)
   - Globulin >3.5 in patient under 40 → urgent SPEP + UPEP + free light chains (multiple myeloma screening, even if albumin normal)
   - Eosinophils >5% or absolute count >0.5 → parasitic stool studies + IgE + atopic disease workup
   - Lymphocytes >40% with absolute count >4.0 (persistent across draws) → flow cytometry to rule out CLL; also check EBV/CMV serologies
   - Reverse T3 elevation (when measured) → assess chronic stress, illness, or thyroid hormone resistance
   - Polyuria + urine specific gravity <1.005 → diabetes insipidus screening (water deprivation test if confirmed)
   - Calcium variability >0.4 mg/dL across draws → repeat with simultaneous PTH (hyperparathyroidism)
   - Elevated RBC + hematocrit at upper limit + bilirubin elevated → secondary polycythemia vs primary MPN: order JAK2 V617F + erythropoietin level
   - Positive ANA → reflex panel: anti-dsDNA, anti-Sm, anti-Ro/La, anti-Scl-70, anti-Jo-1, complement C3/C4
   YOUNG ADULT EARLY DETECTION (under 30 — these are commonly missed for YEARS):
   - Ferritin <30 even with normal hemoglobin → functional iron deficiency (causes fatigue, hair loss, brain fog LONG before anemia shows)
   - Low HDL (<50 female, <40 male) in teens/20s → early metabolic syndrome, NOT "just genetics" — test insulin
   - Elevated MCV (>92) without anemia → early B12 or folate deficiency, alcohol use, or liver disease
   - Low MCV (<82) without anemia → iron deficiency or thalassemia trait — test iron panel + hemoglobin electrophoresis
   - Elevated lymphocytes or monocytes even "within range" → chronic viral infection (EBV, CMV), autoimmune activation
   - ALP elevated in a young adult who's done growing → liver or bone disease, NOT just "normal growth"
   - Bilirubin 1.0-1.2 "high normal" + fatigue → Gilbert syndrome (benign but explains symptoms) or early hemolysis
   - Protein/albumin ratio abnormal (elevated globulin >3.0) → chronic infection, autoimmune disease, or early multiple myeloma screening
   - Calcium >10.0 repeatedly → primary hyperparathyroidism (missed for decades in young patients)
   - Low CO2 (<23) + low chloride → chronic metabolic acidosis, renal tubular acidosis, or chronic diarrhea/malabsorption
   - Uric acid >6 in young female or >7 in young male → gout risk, metabolic syndrome, kidney stone risk — lifestyle intervention NOW
   - ANY unexplained weight gain + fatigue + normal TSH in young female → ALWAYS check free T3, free T4, TPO antibodies, fasting insulin, cortisol, and celiac panel
   No "within normal limits" dismissals. Ever.
4. AGE AND SEX CONTEXT: Always consider the patient's age and sex when evaluating findings. A value that is "normal" for a 50-year-old male may be concerning in an 18-year-old female. Apply age/sex-appropriate clinical reasoning.

FEMALE HORMONE RULE: Do NOT interpret estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase. A single blood draw cannot diagnose "estrogen dominance" without knowing cycle day. Note this limitation if discussing these values.

GOAL-DRIVEN TAILORING: The user provides their personal goals (energy, longevity, hormones, weight, etc.). The discussion points, patient questions, and tests_to_request should visibly connect to these goals. If a user's top goal is "energy" — at minimum one discussion point should address energy-relevant findings (iron, B12, thyroid, sleep). If "longevity" — focus on metabolic optimization and preventive screening even when current labs look fine. The functional_medicine_note must explicitly tie the patient's biggest finding back to their stated goals.

LIMITED-DATA MODE: If the user has NO lab values uploaded (only symptoms, conditions, medications, goals), generate a SCREENING-FOCUSED clinical prep:
- executive_summary should say "Based on your symptoms and history, here's what to ask for at your visit" rather than referencing labs
- tests_to_request becomes the BASELINE PANEL the doctor should order (CMP, CBC, lipid panel, TSH, vitamin D, hs-CRP, ferritin, A1c) — tailored to the user's symptoms and goals
- advanced_screening can include condition-specific tests based on symptoms alone (celiac if GI symptoms, HLA-B27 if joint pain + IBD, etc.)
- discussion_points focus on getting the right tests ordered
- DO NOT pretend you have lab data you don't have

FORMAT: executive_summary (3-5 bullets in plain English), HPI (3-5 sentences), ROS (1-2 sentences/system), discussion_points (5-8 items, 1-2 sentences each — lead with the ask, explain WHY in simple terms anyone can understand), patient_questions (3-5 plain language questions to literally read to your doctor), functional_medicine_note (2-3 sentences).

WRITING STYLE: Write like you're explaining to a smart friend, not a medical textbook. Instead of "hepatocellular dysfunction" say "your liver enzymes suggest it's working harder than it should." Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Keep discussion points SHORT — the patient needs to scan this in the waiting room, not read an essay.

TESTS — TWO SEPARATE LISTS:

1. tests_to_request (ESSENTIAL — what the doctor should definitely order at this visit):
   - MAXIMUM 6 tests. Pick the most clinically important ones based on the patient's abnormal labs.
   - ONE focused workup per row. Do NOT bundle across organ systems (bad: "CMP + Hep panel + ASMA + AMA". good: "Hepatitis viral panel" alone, "Autoimmune liver antibodies" only if separately warranted).
   - A logical "test_name" combines tests of the SAME organ system (e.g., "Iron panel" can include serum iron + TIBC + ferritin + transferrin saturation because they're all iron-related).
   - clinical_justification: ONE SENTENCE in plain English. Lead with what's abnormal and what you're ruling out.
   - Each test gets the MOST SPECIFIC ICD-10 code for THAT test. No lazy reuse.
   - Tier as urgent/high/moderate.

PLACEMENT RULES (which list a test belongs in):

   COMMON-BUT-MISSED CONDITIONS (CATCH THESE AGGRESSIVELY in tests_to_request — these are ROUTINELY missed by 12-min appointments and should be surfaced when ANY suggestive pattern is present):
   - PCOS workup (premenopausal women) — total + free testosterone, DHEA-S, LH:FSH ratio, fasting insulin, SHBG, free androgen index. Trigger: irregular cycles, acne, hirsutism/excess hair, weight gain, hair thinning, infertility, or any insulin resistance markers in a woman of reproductive age.
   - Hashimoto's / autoimmune thyroiditis — TPO antibodies + thyroglobulin antibodies. Trigger: TSH >2.5 OR <1.0, OR fatigue + weight changes + hair loss, OR family history of thyroid/autoimmune.
   - Subclinical hypothyroidism — Free T3, Free T4, reverse T3. Trigger: TSH 2.5–4.5 (within "normal" but not optimal), cold intolerance, fatigue, weight gain, brain fog.
   - Low testosterone in men — total T, free T, SHBG, estradiol, LH/FSH. Trigger: men with fatigue, weight gain, low libido, depression, or testosterone <500.
   - Perimenopause workup (women 35–50) — FSH, estradiol, progesterone, AMH. Trigger: irregular cycles, hot flashes, mood changes, sleep disruption, weight gain.
   - Adrenal/HPA-axis dysregulation — AM serum cortisol, DHEA-S, ACTH. Trigger: chronic stress + fatigue, salt cravings, blood sugar instability, anxiety. (NOT Cushing's screening — that's still gated.)
   - Functional iron deficiency — full iron panel (serum iron, TIBC, ferritin, transferrin saturation). Trigger: hair loss, fatigue, restless legs, OR ferritin <50 even with normal hemoglobin. Especially in menstruating women.
   - True B12 status — methylmalonic acid (MMA) + homocysteine. Trigger: fatigue, brain fog, neuropathy, depression, OR serum B12 <500 (low end of "normal").
   - NAFLD workup — liver ultrasound + GGT. Trigger: any ALT >25, especially with high triglycerides or insulin resistance.
   - Celiac screening — tTG-IgA + total IgA. Trigger: GI symptoms (bloating, gas, diarrhea, constipation), iron deficiency, low albumin, family history, OR autoimmune disease (UC, type 1 diabetes, Hashimoto's).
   - SIBO — lactulose breath test. Trigger: persistent bloating, post-meal gas, IBS-like symptoms.
   - Sleep apnea screening — STOP-BANG questionnaire + sleep study referral. Trigger: snoring, daytime fatigue, hypertension, weight, or any insulin resistance pattern.
   - Endometriosis workup (women) — pelvic ultrasound + GYN referral. Trigger: pelvic pain, painful periods, heavy bleeding, infertility.
   These conditions are COMMON (1–10% prevalence), highly treatable, and should be flagged on day 1 when any suggestive pattern exists. Do NOT gate them.

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

2. advanced_screening (RESERVED FOR DEEPER INVESTIGATION — gated UI):
   DEFAULT: EMPTY ARRAY. 90% of users should see ZERO entries here. Stop trying to be thorough — this is the "you're scaring the user" list.
   ONLY populate when:
     a) A value is genuinely urgent (use the hard thresholds in the blocklist below). Mark priority="urgent". Borderline-upper-normal does NOT qualify — RBC 5.96 with Hct 51.4 is NOT a JAK2 case. Don't queue it for "if it stays elevated" either — just put the marker in retest_timeline like every other lab to recheck.
     b) The user has a HIGHLY SPECIFIC symptom + lab pattern that maps to one rare condition (e.g., persistent unexplained pelvic pain + heavy bleeding → endometriosis workup; recurrent infections + low IgG → immunodeficiency workup). Generic "if labs stay abnormal at 90 days" is NOT a justification.
   ApoB, lipid NMR, advanced lipid testing → these are MAINSTREAM cardiology essentials, not rare-disease screening. They go in tests_to_request, not advanced_screening.
   Maximum 2 entries. Often 0 is correct.
   - These tests are GATED in the UI until the patient's 90-day retest. They are shown ONLY if marked urgent (genuine red flags) OR if the user manually unlocks them.
   - DO NOT spam this list. The lifestyle-first philosophy is: most abnormal labs improve with 90 days of clean diet, movement, sleep, and targeted supplementation. Rare-disease screening is the SECOND visit, not the first.
   - INCLUDE here ONLY:
     a) Tests with genuine red-flag urgency on THIS patient's labs (e.g., platelets >450 → JAK2; calcium >10.5 → PTH; persistent unexplained polycythemia → JAK2+EPO). Mark these priority="urgent" so they bypass the gate.
     b) Reserved next-step tests if the same markers stay abnormal after the 90-day retest (e.g., celiac panel if GI symptoms persist; ANA reflex if multi-system inflammation persists; HLA-B27 if joint pain persists). Mark these priority="high" or "moderate" so they remain gated.
   - Maximum 3 entries. Quality over quantity.
   - Each entry's why_short MUST explain why this test is for AFTER the 90-day retest, not now (e.g., "If joint pain persists after 90 days, rule out spondyloarthropathy").
   - DO NOT include speculative screening for conditions the patient has no markers for.

ICD-10: Use most specific code. Corrections applied post-generation.

Be concise. Scannable in 3 minutes.`,
        messages: [{ role: 'user', content: `Generate clinical visit prep document.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
USER'S TOP GOALS (their stated reasons for using this app — your discussion points and tests should connect to these): ${goalsStr}
DIAGNOSED CONDITIONS: ${condStr}
MEDICATIONS:\n${medsStr}
CURRENT SUPPLEMENTS (consider lab interactions when interpreting findings — e.g., creatine→creatinine artifact, biotin→TSH/T3/T4 interference, B12→masks deficiency, niacin→HDL/ALT, TRT→Hct/LH/FSH, vitamin K2→INR with warfarin): ${suppsStr}
SYMPTOMS:\n${sympStr}
LAB DATE: ${latestDraw?.draw_date ?? 'unknown'} LAB: ${latestDraw?.lab_name ?? 'unknown'}

ALL LAB VALUES:
${allLabsStr.slice(0, 4000)}

Return JSON:
{"generated_at":"${new Date().toISOString()}","document_date":"${new Date().toISOString().split('T')[0]}","headline":"one 12-word verdict — the single most important thing for this visit","executive_summary":["3-5 plain English bullets, 1 sentence each"],"chief_complaint":"one sentence","hpi":"2-3 sentences in plain English","pmh":"","medications":[{"name":"","dose":"","notable_depletion":""}],"review_of_systems":{"constitutional":"","cardiovascular":"","gastrointestinal":"","endocrine":""},"lab_summary":{"draw_date":"","lab_name":"","urgent_findings":[{"emoji":"🚨","marker":"","value":"","flag":"","clinical_note":"plain English, 1 sentence"}],"other_abnormal":[{"emoji":"⚠️","marker":"","value":"","flag":""}]},"tell_doctor":[{"emoji":"💬","headline":"6-10 word headline of what to tell the doctor","detail":"1 sentence plain-English context"}],"tests_to_request":[{"emoji":"🧪","test_name":"","why_short":"6-10 word reason in plain English","clinical_justification":"1 sentence","icd10_primary":"","icd10_description":"","priority":"urgent|high|moderate","insurance_note":""}],"advanced_screening":[{"emoji":"🔬","test_name":"","why_short":"6-10 word reason","clinical_justification":"1 sentence — why this rare condition needs ruling out","icd10_primary":"","icd10_description":"","priority":"high|moderate","insurance_note":"may require specialist referral"}],"questions_to_ask":[{"emoji":"❓","question":"the exact plain-language question to read aloud","why":"1 sentence why it matters"}],"discussion_points":["1-2 sentences, lead with the ask"],"patient_questions":["plain language fallback list"],"functional_medicine_note":"2-3 sentences in plain English"}

CRITICAL OUTPUT RULES (for the new card-stack UI):
- tell_doctor: 3-5 cards. The most important things this patient must mention (chief complaint, key symptoms, key abnormal lab in lay terms).
- tests_to_request: keep the existing rules — max 6, one workup per row.
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

    // Validate required fields before saving — never save corrupt/partial documents
    if (!doc.chief_complaint && !doc.hpi && !doc.executive_summary) {
      return new Response(JSON.stringify({ error: 'Generated document is incomplete — missing required fields' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Ensure arrays are arrays, not undefined
    if (!Array.isArray(doc.tests_to_request)) doc.tests_to_request = [];
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
