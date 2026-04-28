// supabase/functions/generate-wellness-plan/index.ts
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
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose, duration_category, reason').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data; const meds = medsRes.data ?? []; const symptoms = symptomsRes.data ?? [];
    const conditions = conditionsRes.data ?? [];
    const supps = suppsRes.data ?? [];
    let labValues: any[] = []; let drawId: string | null = null;

    // Translate user's primary goals to readable labels for the prompt
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

    console.log('[wellness] userId:', userId);
    console.log('[wellness] latestDrawRes:', JSON.stringify(latestDrawRes.data), 'error:', latestDrawRes.error?.message);

    if (latestDrawRes.data) {
      drawId = latestDrawRes.data.id;
      const { data, error: lvErr } = await supabase.from('lab_values').select('*').eq('draw_id', drawId);
      console.log('[wellness] drawId:', drawId, 'lab_values count:', data?.length, 'error:', lvErr?.message);
      labValues = data ?? [];
    } else {
      // Fallback: try getting ANY lab values for this user
      const { data: allDraws } = await supabase.from('lab_draws').select('id, draw_date, processing_status').eq('user_id', userId);
      console.log('[wellness] No latest draw found. All draws for user:', JSON.stringify(allDraws));
      if (allDraws && allDraws.length > 0) {
        drawId = allDraws[0].id;
        const { data } = await supabase.from('lab_values').select('*').eq('draw_id', drawId);
        console.log('[wellness] Fallback drawId:', drawId, 'lab_values count:', data?.length);
        labValues = data ?? [];
      }
    }

    const medsStr = meds.map((m: any) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join(', ') || 'None';
    const sympStr = symptoms.map((s: any) => `${s.symptom} (${s.severity}/10)`).join(', ') || 'None';
    const condStr = conditions.map((c: any) => c.name).join(', ') || 'None reported';
    const suppsStr = supps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') || 'None';

    // Send ALL lab values
    const allLabsStr = labValues.map((v: any) =>
      `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Std: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'}) ${v.standard_flag && v.standard_flag !== 'normal' ? '[' + v.standard_flag.toUpperCase() + ']' : ''}`
    ).join('\n') || 'No labs uploaded';

    // Dynamically build "not tested" list based on what's commonly relevant
    // This covers nutrients, hormones, and inflammatory markers that are frequently missed
    const testedNames = labValues.map((v: any) => v.marker_name.toLowerCase());
    const commonlyRelevant = [
      'ferritin', 'iron', 'tibc', 'zinc', 'selenium', 'copper', 'folate', 'magnesium',
      'free t3', 'free t4', 'reverse t3', 'tpo', 'thyroglobulin',
      'homocysteine', 'hs-crp', 'crp', 'esr',
      'insulin', 'cortisol', 'dhea', 'testosterone', 'estradiol',
      'vitamin a', 'vitamin b12', 'vitamin d', 'coq10',
    ];
    const notTested = commonlyRelevant
      .filter(n => !testedNames.some(t => t.includes(n.toLowerCase().split(' ')[0])));
    const notTestedStr = notTested.join(', ');

    // Determine optimization mode: if most labs are optimal, switch to longevity protocol
    const abnormalCount = labValues.filter((v: any) => v.optimal_flag && v.optimal_flag !== 'optimal').length;
    const isOptimizationMode = labValues.length > 0 && (abnormalCount / labValues.length) < 0.25;
    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 10000,
        system: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — these apply to EVERY string in the JSON):
- 6th-grade reading level. No word over 3 syllables unless followed by a definition in parentheses.
- One sentence per bullet/field. Lead with a verb when it's an action ("Eat...", "Walk...", "Take...").
- No medical jargon. "Inflammation marker" not "hs-CRP". "Iron stores" not "ferritin level". "Stress hormone" not "cortisol".
- Users are tired, busy, and don't want to read. If a sentence isn't pulling weight, cut it.
- Every actionable item gets an "emoji" field — a single emoji that captures the action (🥗 food, 💪 strength, 🏃 cardio, 😴 sleep, 🧘 stress, 💊 supplement, 🧪 test, 🩺 doctor, 💧 hydration, ☀️ sun, 🥩 protein, 🐟 omega-3, 🥬 leafy greens, 🍓 antioxidants, 🚶 walk, 🏋️ lift, 🧠 brain, ❤️ heart, 🫁 lungs, 🦴 bone).
- Every "why" is one short sentence a 12-year-old understands.

HARD RULES — FOLLOW EXACTLY:
1. SUPPLEMENT STACK: Maximum 7 supplements. Read the MODE field in the user message. Three legitimate reasons a supplement enters the stack:
   - LAB-CONFIRMED DEFICIENCY ("lab_finding"): A specific lab value is outside optimal range and the supplement directly addresses it. why must reference the marker name and value.
   - MEDICATION-INDUCED DEPLETION ("medication_depletion"): The user is taking a medication with a well-established nutrient-depleting effect. The depletion is mechanistically certain even without a lab value (e.g., statin→CoQ10, metformin→B12, PPI→B12/Mg, mesalamine→folate, oral contraceptive→B6/folate/Mg/Zn, oral steroid→Ca/D, loop diuretic→Mg/K). why must name the medication and the depleted nutrient.
   - DISEASE-MECHANISM SUPPORT ("disease_mechanism"): The user has a CONFIRMED diagnosed condition (from the DIAGNOSED CONDITIONS list, not inferred) with a well-evidenced supplement that addresses the disease mechanism — not the symptoms. Examples: UC/Crohn's → L-glutamine, slippery elm, curcumin, omega-3, S. boulardii (gut barrier and inflammation); Hashimoto's → selenium; Type 2 diabetes → berberine, alpha-lipoic acid; PCOS → inositol; migraines → riboflavin/magnesium/CoQ10; restless legs → iron/magnesium. Do NOT use this for speculative conditions or symptoms alone.
   - If MODE is "optimization" and labs are mostly optimal, fill remaining slots with evidence-based longevity supplements ("optimization" sourced_from, "optimize" priority).
   Priority order in stack: critical > high > moderate > optimize. Treatment-tier supplements (lab_finding, medication_depletion, disease_mechanism) always rank above optimization. Each medication-induced depletion that is realistic and not already supplemented MUST appear in the stack. Each diagnosed chronic condition with strong evidence supplements MUST have at least one disease_mechanism supplement in the stack unless already in user's CURRENT SUPPLEMENTS.
   - CRITICAL: If a supplement would address a SPECULATIVE/UNTESTED condition (e.g., possible SIBO, possible celiac, possible insulin resistance with normal labs), put the recommended TEST in retest_timeline, NOT a supplement in the stack.
2. sourced_from: "lab_finding", "medication_depletion", "disease_mechanism", or "optimization". Never "symptom_pattern".
2a. STRICT RANKING (rank field, 1 = most important): Number every supplement 1, 2, 3... up to N (the count returned). The rank must reflect TWO factors in order: (a) alignment with the user's TOP GOALS, (b) clinical severity. Many users will only take the top 2-3 supplements — make sure rank 1 is the single most impactful one for the goals they picked. Within the same goal-alignment level, rank by severity: critical > high > moderate > optimize. Never skip rank numbers, never duplicate, never reorder mid-stack.
   Example for a user with goal=energy taking a statin with low B12 lab and UC: rank 1 = B12 (critical lab finding + energy goal), rank 2 = CoQ10 (statin depletion + energy/fatigue), rank 3 = L-glutamine (UC mechanism), etc.
   Example for goal=longevity with optimal labs: rank 1 = creatine 5g, rank 2 = omega-3 EPA/DHA 2g, rank 3 = vitamin D, etc.
3. CONDITIONS — GROUND TRUTH RULE: Use the user's DIAGNOSED CONDITIONS list verbatim.
   - Never substitute related conditions (UC ≠ Crohn's, even though they share treatments).
   - MEDICATIONS DO NOT REVEAL DIAGNOSES. A prescription tells you what a doctor wrote, not what the patient has, what's active, or what's been ruled out. Many drugs treat multiple conditions. Never infer or rename a diagnosis based on what's in the meds list.
   - The only valid use of medications is to flag known nutrient depletions, lab interactions, or side effects — never to derive new diagnoses.
   Address each STATED condition with condition-specific lifestyle interventions.
4. PATTERN RECOGNITION: Connect abnormal values across organ systems to identify undiagnosed conditions. In the summary, flag every multi-marker pattern (e.g., elevated platelets + elevated RDW = possible iron deficiency or myeloproliferative process; low HDL + borderline glucose = metabolic syndrome risk). In retest_timeline, recommend testing to confirm or rule out each pattern. The goal is EARLY DETECTION.
5. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning.
6. FEMALE HORMONE RULE: Do NOT flag estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase and a single draw means nothing without knowing cycle day. Never build a supplement protocol around "estrogen dominance" from one blood draw.
7. Supplements must be safe and not interact with patient's medications.
8. RETEST TIMELINE: Keep it simple. Recommend ONE comprehensive retest panel at the END of the 90-day protocol (week 12). List 5-8 key markers to recheck. Do NOT recommend retesting at weeks 2, 4, or 8 unless a value is clinically dangerous.
   IMPORTANT — UNIFORMITY WITH CLINICAL PREP: The retest_timeline markers MUST match the same markers the user's Clinical Prep document recommends as essential tests. Do NOT introduce new test names here that aren't in their abnormal labs. The user should see ONE coherent test list across both pages, not two competing ones.
   COMMON-BUT-MISSED — STILL FLAG THESE: PCOS panel (women with cycle/acne/insulin issues), Hashimoto's antibodies (TSH outside 1-2.5), full thyroid panel (TSH 2.5-4.5 with symptoms), low T panel (men with fatigue), perimenopause panel (women 35+ with cycle changes), full iron panel (ferritin <50 or hair loss), MMA + homocysteine (B12 <500), liver ultrasound (any ALT >25), celiac (GI symptoms or autoimmune), sleep apnea screening (snoring + fatigue + weight). These are common, missable conditions and belong in retest_timeline.
   GATE ONLY THE RARE STUFF: Do NOT recommend rare-disease screening (JAK2, ANA reflex, HLA-B27, multiple myeloma SPEP/UPEP, hereditary hemochromatosis genetics, MTHFR, pituitary MRI, Cushing's 24h cortisol) in retest_timeline. Those live in Clinical Prep's deeper-investigation section, gated until after the 90-day retest.
9. WRITING STYLE: Write like a knowledgeable friend, not a medical textbook. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Explain the WHY in plain English. Keep the action plan actionable — specific things to do, not vague clinical language.
10. GOAL TAILORING: The user provides up to 5 personal goals (energy, weight, hormones, longevity, etc.). The wellness plan MUST visibly reflect these:
    - The summary should reference how the plan addresses each top goal
    - Lifestyle interventions and action plan steps should prioritize what advances those goals
    - If user picks "longevity" → focus on metabolic health, sleep, zone 2 cardio, resistance training
    - If user picks "energy" → focus on iron, B12, thyroid, mitochondrial support, sleep architecture
    - If user picks "gut health" → focus on diet, fiber/prebiotics, food triggers, stress
    - If user picks "weight" → focus on insulin sensitivity, protein intake, resistance training
    - If user picks "hormones" → focus on cycle support (women), testosterone optimization (men), sleep, stress
    - If user picks "off_medications" → emphasize alternatives in medication_notes; provide natural substitutes for each medication where evidence-based
    - The plan should NOT feel generic — every section should connect back to what the user said they wanted.
11. LIMITED-DATA MODE: If the user has NO lab values uploaded (only symptoms, conditions, medications, goals), still generate a useful plan based on:
    - Diagnosed conditions and known mechanisms
    - Medication-related nutrient depletions (lab-confirmed by virtue of the prescription)
    - User goals (longevity supplements, etc.)
    - Lifestyle interventions tailored to symptoms and goals
    - Recommend baseline lab work as the FIRST item in retest_timeline so the next regeneration can be more precise.
    Do NOT refuse to generate a plan due to missing labs — just frame supplements with clear "evidence" sourcing and recommend testing.`,
        messages: [{ role: 'user', content: `Create a comprehensive wellness plan addressing ALL lab findings.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
USER'S TOP GOALS (priority order — your plan MUST be tailored around these): ${goalsStr}
MODE: ${isOptimizationMode ? 'optimization' : 'treatment'}
${isOptimizationMode ? 'OPTIMIZATION CONTEXT: Patient labs are mostly optimal. Frame the plan around longevity optimization, not disease treatment. Phase names should be: "Build Foundation (Weeks 1-4)", "Optimize (Weeks 5-8)", "Sustain & Track (Weeks 9-12)". Lifestyle interventions should focus on longevity science: zone 2 cardio, resistance training, sleep optimization, cold/heat exposure, stress resilience, metabolic health optimization, and proactive screening.' : ''}
DIAGNOSED CONDITIONS (GROUND TRUTH — never substitute these with related conditions; never call UC 'Crohn's' or vice versa; never infer a different diagnosis from medications): ${condStr}
MEDICATIONS: ${medsStr}
CURRENT SUPPLEMENTS (already taking — do NOT re-recommend; account for lab interactions and avoid stacking duplicates): ${suppsStr}
SYMPTOMS (for context only — do NOT supplement based on symptoms alone): ${sympStr}

MEDICATION-INDUCED NUTRIENT DEPLETIONS (must appear in supplement_stack as sourced_from "medication_depletion" if the user is on the drug AND not already supplementing):
- Statins (atorvastatin, rosuvastatin, simvastatin, etc.): deplete CoQ10 → 100-200mg ubiquinol/day. Also deplete vitamin K2 (mildly).
- Metformin: depletes B12 (often subclinically before serum drops) → 500-1000mcg methylcobalamin.
- PPIs (omeprazole, pantoprazole, esomeprazole, etc.): deplete B12, magnesium, calcium, iron → B12 + magnesium glycinate.
- Mesalamine / sulfasalazine: deplete folate (sulfasalazine especially) and B-vitamins → methylfolate 400-800mcg.
- Oral contraceptives: deplete B6, B12, folate, magnesium, zinc, vitamin C, selenium → B-complex with active forms + magnesium + zinc.
- Oral steroids (prednisone, prednisolone): deplete calcium, vitamin D, potassium, magnesium → calcium + D3 + magnesium; also probiotic for gut.
- Loop diuretics (furosemide, torsemide): deplete magnesium, potassium, B1 (thiamine), calcium, zinc → magnesium + B1.
- Thiazide diuretics (HCTZ): deplete magnesium, potassium, zinc, CoQ10 → magnesium + CoQ10.
- ACE inhibitors / ARBs: deplete zinc → zinc.
- Beta-blockers: deplete CoQ10, melatonin → CoQ10.
- SSRIs: deplete melatonin (subtle) — generally don't need supplementation, but flag.
- Levothyroxine: doesn't deplete but interacts with calcium/iron (4-hour spacing required).
- Antibiotics (any course): deplete probiotics → S. boulardii or multi-strain probiotic post-course.
- Gabapentin / Pregabalin: deplete folate, B1.

CONDITION-SPECIFIC SUPPLEMENT REQUIREMENTS (must appear in supplement_stack as "disease_mechanism" unless contraindicated or already supplementing):
- Ulcerative Colitis / Crohn's / IBD: gut barrier support — L-glutamine 5g/day OR slippery elm; anti-inflammatory — curcumin (with piperine) 500-1000mg/day; omega-3 EPA/DHA 2-3g/day; vitamin D (often deficient from malabsorption — push higher dose); S. boulardii probiotic 5-10B CFU/day. Recommend at least 2 of these.
- Hashimoto's / autoimmune thyroid: selenium 200mcg/day (well-evidenced for lowering TPO antibodies).
- Type 2 Diabetes / insulin resistance (lab-confirmed): berberine 500mg 2-3x/day OR alpha-lipoic acid 600mg/day; chromium 200-400mcg/day; magnesium.
- PCOS: myo-inositol + d-chiro-inositol (40:1 ratio) 4g/day; vitamin D; omega-3.
- Migraines (recurring): riboflavin (B2) 400mg/day; magnesium 400mg/day; CoQ10 100mg/day.
- Restless legs syndrome: iron (if ferritin <75); magnesium glycinate.
- Endometriosis: omega-3; curcumin; vitamin D; magnesium.
- Hypertension (essential): magnesium; potassium (food first); CoQ10 (especially if on beta-blocker/statin); omega-3.
- GERD on chronic PPI: B12; magnesium; zinc carnosine (gut healing).
- Osteoporosis / osteopenia: calcium 800-1000mg; vitamin D3 2000-5000 IU; vitamin K2 100-200mcg MK-7; magnesium.
- Major Depression / Anxiety: omega-3 EPA-dominant 1-2g; vitamin D; magnesium glycinate.
- Atrial fibrillation: magnesium taurate; CoQ10; omega-3.
- Heart failure: CoQ10 100-300mg; D-ribose; thiamine (loop diuretic depletion).
- Chronic kidney disease: avoid high-dose vitamin C, magnesium, potassium without nephrologist input — flag in disclaimer.
- Liver disease (NAFLD, hepatitis): NAC; milk thistle; omega-3; vitamin E (mixed tocopherols, NAFLD specifically).
- Dementia / mild cognitive impairment: omega-3 DHA-dominant; B-vitamins (esp B12, folate); vitamin D; creatine.

If a medication AND a condition both indicate the same supplement, list it once and note both reasons in the why field.

SUPPLEMENT-LAB INTERACTION KNOWLEDGE (use when interpreting labs and building stack):
- Biotin (>1mg/day): falsely alters TSH/T3/T4/Troponin/Vit D — pause 72hr before retest.
- Creatine: raises serum creatinine ~10–20% (artifact, not kidney damage); use cystatin-C for true GFR.
- Vitamin D3: raises 25-OH-D; if user already on D3, "low D" needs dose review, not new D.
- B12 supplementation: makes serum B12 unreliable; use MMA/homocysteine if concerned.
- Iron: raises ferritin/iron/sat — don't add iron without checking current ferritin.
- Niacin (≥500mg): raises HDL, lowers TG/LDL, can elevate ALT/uric acid/glucose.
- Omega-3 (≥2g EPA/DHA): lowers TG and CRP; thins blood — caution with anticoagulants.
- Berberine: lowers fasting glucose/A1c/LDL — overlaps with metformin effect.
- Magnesium: corrects suboptimal Mg, supports BP and insulin sensitivity.
- Vitamin K2: critical with warfarin (affects INR) — never recommend without MD.
- DHEA: raises DHEA-S, downstream estradiol/testosterone.
- TRT/testosterone: raises Hct (polycythemia risk), suppresses LH/FSH.
- Whey/high protein: raises BUN slightly (not kidney pathology).
- Curcumin: lowers CRP and ALT; mild blood thinner.
- TMG/methylfolate/B12: lowers homocysteine.
- Saw palmetto: can lower PSA (mask BPH/cancer detection).
- Ashwagandha: lowers cortisol; can raise T4 — caution in hyperthyroid.
- Vitamin C high-dose: can raise serum glucose readings on some glucometers.
If user is on a supplement that explains an "abnormal" lab (e.g., creatine→creatinine, biotin→TSH), call that out in summary instead of treating it as pathology.

ALL LAB VALUES:
${allLabsStr.slice(0, 4000)}

NUTRIENTS NOT TESTED (${isOptimizationMode ? 'recommend testing these for a complete optimization baseline' : 'do NOT recommend supplements for these'} — mention in ${isOptimizationMode ? 'retest_timeline' : 'disclaimer only'}):
${notTestedStr}

Return JSON: {"generated_at":"${new Date().toISOString()}","headline":"one 12-word verdict in plain English (e.g. 'Your iron is low — fix it and the fatigue lifts')","summary":"3 short sentences max — what's wrong, what we'll fix, how long it takes","today_actions":[{"emoji":"","action":"one verb-led sentence the user does TODAY (e.g. 'Eat a 3-egg breakfast')","why":"one short sentence","category":"eat|move|take|sleep|stress"}],"supplement_stack":[{"rank":1,"emoji":"💊","nutrient":"","form":"","dose":"","timing":"","why_short":"6-10 word reason in plain English","why":"1 sentence linking to a lab or symptom","priority":"critical|high|moderate","sourced_from":"lab_finding|disease_mechanism","evidence_note":""}],"meals":[{"emoji":"🥗","name":"meal name (e.g. 'Salmon power bowl')","when":"breakfast|lunch|dinner|snack","ingredients":["short list, 4-6 items"],"why":"1 sentence — which lab/goal this targets"}],"workouts":[{"emoji":"🏃","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","title":"e.g. 'Zone 2 walk'","duration_min":30,"description":"1 sentence","why":"1 sentence — which goal/lab this serves"}],"lifestyle_interventions":{"diet":[{"emoji":"🥗","intervention":"","rationale":"","priority":""}],"sleep":[{"emoji":"😴","intervention":"","rationale":"","priority":""}],"exercise":[{"emoji":"💪","intervention":"","rationale":"","priority":""}],"stress":[{"emoji":"🧘","intervention":"","rationale":"","priority":""}]},"action_plan":{"phase_1":{"name":"Stabilize (Weeks 1-4)","focus":"","actions":[]},"phase_2":{"name":"Optimize (Weeks 5-8)","focus":"","actions":[]},"phase_3":{"name":"Maintain (Weeks 9-12)","focus":"","actions":[]}},"retest_timeline":[{"marker":"","retest_at":"","why":""}],"medication_notes":[{"medication":"","organ_impact":"","depletions":"","monitoring":"","alternative":""}],"disclaimer":"Educational only. Talk to your doctor before changing anything."}

CRITICAL OUTPUT RULES:
- today_actions: EXACTLY 3 items — the most important things this user can do TODAY. Mix categories (one eat, one move, one take is ideal).
- meals: 5-7 meals tied to this user's specific abnormal labs and goals. Real food, not "anti-inflammatory diet."
- workouts: 3-5 workouts spanning a week, tailored to user's goals (longevity → zone 2 + lift, weight → resistance + walk, energy → easy cardio + sleep).` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    // Extract JSON from response — handle trailing text after the closing brace
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Find the last closing brace to handle any trailing text
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);
    const plan = JSON.parse(rawText);

    // Tag plan mode for frontend display
    plan.plan_mode = isOptimizationMode ? 'optimization' : 'treatment';

    // Normalize supplement_stack: cap at 7, sort by rank, renumber 1..N.
    // Many users take only top 2-3 — rank ordering must be reliable.
    if (plan.supplement_stack && Array.isArray(plan.supplement_stack)) {
      const priorityRank = (p: string) => p === 'critical' ? 0 : p === 'high' ? 1 : p === 'moderate' ? 2 : 3;
      // Sort first by rank if present, otherwise by priority. Stable sort preserves AI order within ties.
      plan.supplement_stack = [...plan.supplement_stack]
        .sort((a: any, b: any) => {
          const ar = typeof a.rank === 'number' ? a.rank : 999;
          const br = typeof b.rank === 'number' ? b.rank : 999;
          if (ar !== br) return ar - br;
          return priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize');
        })
        .slice(0, 7)
        .map((s: any, i: number) => ({ ...s, rank: i + 1 })); // force 1..N, no gaps or duplicates
    }

    // Validate before saving — never save corrupt/partial plans
    if (!plan.summary && !plan.supplement_stack) {
      return new Response(JSON.stringify({ error: 'Generated plan is incomplete' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!Array.isArray(plan.supplement_stack)) plan.supplement_stack = [];
    if (!Array.isArray(plan.today_actions)) plan.today_actions = [];
    if (!Array.isArray(plan.meals)) plan.meals = [];
    if (!Array.isArray(plan.workouts)) plan.workouts = [];
    if (!plan.headline) plan.headline = '';
    if (!plan.lifestyle_interventions) plan.lifestyle_interventions = { diet: [], sleep: [], exercise: [], stress: [] };
    if (!plan.action_plan) plan.action_plan = { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } };
    if (!Array.isArray(plan.retest_timeline)) plan.retest_timeline = [];
    if (!plan.generated_at) plan.generated_at = new Date().toISOString();

    // Keep old plans for history — don't delete
    await supabase.from('wellness_plans').insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
