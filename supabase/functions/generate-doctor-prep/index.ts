// supabase/functions/generate-doctor-prep/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';
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
- 6th-grade reading level. No medical jargon without a plain-English definition right after.
- One sentence per bullet. Lead with a verb when it's an action ("Tell your doctor...", "Ask for...").
- Replace clinician language with what a 12-year-old understands: "stress hormone" not "cortisol", "iron stores" not "ferritin".
- Every card item gets a one-emoji "emoji" field as a visual anchor.
- Users scan, they don't read. If a sentence isn't pulling weight, cut it.

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

3. WHEN TO RECOMMEND TESTS (tests_to_request) — STRICT TRIAGE RULE:
   A test may ONLY appear in tests_to_request if it directly investigates ONE of:
     (a) a symptom the patient actually reported, OR
     (b) a known depletion / side-effect from a medication they're currently taking, OR
     (c) an out-of-range, Watch-tier, OR EARLY-DETECTION marker pattern on THIS lab draw (see list below).
   If none of (a)/(b)/(c) applies, DO NOT include the test. No "while we're at it" screening. No "good to know" baseline tests. No proactive optimization tests unless the patient is in HEALTHY MODE.
   For each test, the clinical_justification MUST cite the specific symptom, medication, or marker that triggered it (e.g., "Patient reports fatigue + hair loss + ferritin 28" not "comprehensive screening"). If you can't cite a trigger, drop the test.
   Differential thinking: before adding a test, ask "if this comes back abnormal, does management change?" If no, drop it.

   EARLY-DETECTION MARKER PATTERNS (these count as trigger (c) — values "within range" but clinically meaningful, especially in young or symptomatic patients. Catch these aggressively. Always cite the specific value in clinical_justification):
   - Ferritin <50 even with normal hemoglobin → functional iron deficiency. Order full iron panel (serum iron, TIBC, ferritin, transferrin sat). Trigger any time ferritin <50, ESPECIALLY with fatigue / hair loss / restless legs / menstruating female.
   - Serum B12 <500 (low end of "normal") with fatigue, brain fog, neuropathy, or depression → MMA + homocysteine to confirm tissue B12 status.
   - MCV >92 without anemia → early B12/folate deficiency, alcohol, or liver. Order B12, folate, MMA.
   - MCV <82 without anemia → iron deficiency or thalassemia trait. Iron panel + hemoglobin electrophoresis.
   - HbA1c 5.4–5.6 OR fasting glucose 95–99 OR triglycerides high + HDL low → insulin resistance pattern. Fasting insulin + HOMA-IR.
   - ApoB ≥90 → cardiovascular risk pattern. Order ApoB + Lp(a) (once-in-lifetime).
   - hs-CRP ≥0.5 → subclinical inflammation. Repeat hs-CRP in 3 months + investigate source if persistent.
   - ALT >25 (even within "range") + high triglycerides or weight gain → NAFLD pattern. Liver ultrasound + GGT.
   - TSH 2.5–4.5 (within range, not optimal) + fatigue / weight gain / cold intolerance / hair loss → Free T3, Free T4, TPO antibodies, thyroglobulin antibodies (Hashimoto's screen).
   - TSH <1.0 + symptoms → Free T3, Free T4, TSI antibodies (Graves' screen).
   - Total testosterone <500 in symptomatic male → free T, SHBG, estradiol, LH, FSH.
   - Premenopausal female with irregular cycles, acne, hirsutism, weight gain, OR insulin resistance markers → PCOS workup (total + free testosterone, DHEA-S, LH:FSH, fasting insulin, SHBG).
   - Female 35–50 with irregular cycles, hot flashes, sleep changes → AMH + FSH + estradiol (perimenopause).
   - Vitamin D 30–40 → recheck in 3 months after supplementation; <30 always retest.
   - Uric acid >6 (female) or >7 (male) in young patient → gout / metabolic syndrome / kidney stone risk. Lifestyle counseling + recheck.
   - Calcium >10.0 repeated → PTH + ionized calcium (primary hyperparathyroidism).
   - Globulin >3.0 → albumin/globulin ratio + total protein context. Investigate if >3.5 with anemia or bone pain.
   - Persistent GI symptoms (bloating, gas, alt-stool) + iron deficiency or low albumin → celiac panel (tTG-IgA + total IgA).
   - Snoring / daytime fatigue / hypertension / insulin resistance pattern → STOP-BANG + sleep study referral.

   AUTOIMMUNE / ENDOCRINE PATTERNS (commonly missed for years — surface when triggers match):
   - Hashimoto's (autoimmune hypothyroid): TSH 2.5–4.5 + fatigue/weight gain/cold/hair loss/family hx → TPO antibodies + thyroglobulin antibodies. Also if patient has another autoimmune dx (UC, T1D, vitiligo).
   - Graves' / autoimmune hyperthyroid: TSH <1.0 + heat intolerance / weight loss / palpitations / anxiety → Free T3, Free T4, TSI antibodies.
   - Pernicious anemia: B12 <500 + macrocytic indices (MCV >95) OR autoimmune hx → intrinsic factor antibodies + parietal cell antibodies + MMA + homocysteine.
   - Sjögren's syndrome: dry eyes / dry mouth / joint pain + (positive ANA on this draw OR existing autoimmune dx) → SSA (Ro) + SSB (La) antibodies + rheumatology referral.
   - LADA / late-onset type 1 diabetes (commonly mislabeled as T2D in lean adults): rising HbA1c + lean body type + age 25–55 + family hx of T1D or autoimmunity → GAD-65 antibodies + IA-2 antibodies + C-peptide.
   - Adrenal insufficiency (Addison's): chronic fatigue + salt cravings + low Na + high K + low BP + skin hyperpigmentation → AM serum cortisol + ACTH (and consider ACTH stim test).
   - Primary biliary cholangitis (PBC): female + ALP elevated DISPROPORTIONATELY to AST/ALT + fatigue / itching → AMA antibody + GGT.
   - Autoimmune hepatitis: ALT/AST elevated + female + (positive ANA OR ASMA) → ASMA + anti-LKM antibodies + IgG level.
   - Hemolytic anemia: anemia + elevated indirect bilirubin + elevated LDH → haptoglobin + reticulocyte count + peripheral smear + direct Coombs test.
   - Chronic kidney disease (early): eGFR 60–89 sustained, OR any proteinuria → urine albumin-to-creatinine ratio (UACR) + cystatin C + nephrology referral if eGFR drops.
   - MASH / fibrotic NAFLD risk: ALT/AST elevated + low-normal platelets + age 40+ → FIB-4 score (calculable from age/AST/ALT/platelets) + FibroScan / hepatology referral if FIB-4 >1.45.
   - EBV reactivation / chronic fatigue: persistent fatigue >6 months + elevated lymphocytes or monocytes + low-grade lymphadenopathy → EBV panel (VCA-IgG, VCA-IgM, EBNA-1).

   Do NOT use this list to fish for tests on healthy patients. Use it when a marker on this draw or a symptom on file matches one of the patterns above. The pattern itself IS the trigger.
4. AGE AND SEX CONTEXT: Always consider the patient's age and sex when evaluating findings. A value that is "normal" for a 50-year-old male may be concerning in an 18-year-old female. Apply age/sex-appropriate clinical reasoning.

FEMALE HORMONE RULE: Do NOT interpret estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase. A single blood draw cannot diagnose "estrogen dominance" without knowing cycle day. Note this limitation if discussing these values.

GOAL-DRIVEN TAILORING: The user provides their personal goals. Discussion points, patient questions, and tests_to_request must visibly connect to these. If primary goal is "energy" — one discussion point addresses energy-relevant findings. If "longevity" — focus on metabolic optimization and preventive screening. The functional_medicine_note must tie the patient's biggest finding back to their stated goals.

HEALTHY MODE (when MODE=healthy is passed in the user message — patient's labs are mostly within standard range, no urgent findings):
This patient is using the appointment to ADD advanced markers, not to address disease. Reframe everything:
- chief_complaint: lead with "Optimization-focused visit" or similar — not a complaint.
- hpi: describe the patient's strengths (markers in range, lifestyle effort) and the 1-2 Watch markers worth addressing. No alarmist tone.
- executive_summary: 1) what's working well, 2) the 1-2 Watch markers (specific lifestyle adjustments to push them down), 3) the 2-3 advanced tests to add this visit.
- tests_to_request: lean PROACTIVE — ApoB, Lp(a) (once-in-lifetime), full thyroid (Free T3/T4 + TPO if not done), homocysteine, advanced lipid (NMR), DEXA referral, VO2 max consultation, coronary calcium score (if 35+), 24-hr ambulatory BP if family hx.
- discussion_points: framed as "I want to add these markers to my baseline" not "I have these problems." Tone is collaborative, not adversarial.
- patient_questions: "What's my ApoB target?" "Should I get a DEXA at my age?" "When does Lp(a) need to be checked?" — proactive optimization questions.
- functional_medicine_note: celebrate the strengths first, then the 2-3 things to optimize next.
- The Patient Visit Guide PDF will be generated separately with healthy-mode framing — make sure your discussion_points support a "you're doing great, here's what to push next" tone.

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
   - MAXIMUM 5 tests. If fewer triggers exist, return fewer. An empty list is acceptable if nothing is wrong.
   - ONE focused workup per row. Do NOT bundle across organ systems.
   - A logical "test_name" combines tests of the SAME organ system (e.g., "Iron panel" = serum iron + TIBC + ferritin + transferrin sat).
   - clinical_justification: ONE SENTENCE that NAMES the trigger ("Reports hair loss + fatigue; ferritin 28 [LOW]") and what you're ruling out. No vague "comprehensive workup" language.
   - Each test gets the MOST SPECIFIC ICD-10 code. No lazy reuse.
   - Tier as urgent/high/moderate based on the trigger severity, not on the test itself.

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
DIAGNOSED CONDITIONS (GROUND TRUTH — use these exact names; UC is NOT Crohn's; do NOT infer a different diagnosis from medications): ${condStr}
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
      const isMidAge = ctx.age < 50;
      const jak2Triggered =
        (ctx.platelets ?? 0) > 600 ||
        (isYoung && (ctx.platelets ?? 0) > 450) ||
        (isMidAge && (ctx.platelets ?? 0) > 500) ||
        ((ctx.rbc ?? 0) > 6.0 && (ctx.hct ?? 0) > 54) ||
        (isYoung && (ctx.rbc ?? 0) > 5.7 && (ctx.hct ?? 0) > 51) ||
        ((ctx.hgb ?? 0) > 17 && (ctx.hct ?? 0) > 52);
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
