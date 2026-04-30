// supabase/functions/generate-wellness-plan/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isHealthyMode } from '../_shared/healthMode.ts';
import { GOAL_LABELS, formatGoals } from '../_shared/goals.ts';
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

    // Translate user's primary goals to readable labels for the prompt.
    // GOAL_LABELS lives in _shared/goals.ts.
    const userGoals: string[] = (profile?.primary_goals ?? []).filter((g: any) => typeof g === 'string');
    const goalsStr = formatGoals(userGoals);

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

    // ── Lifestyle context for meal/workout tailoring ──
    // Reads optional fields from profile.lifestyle (added via onboarding when
    // captured). Missing fields are shown as 'unknown' so the AI defaults to
    // 'busy adult, limited cooking time, fast-food-friendly upgrades' which is
    // the safest assumption for the median user.
    const lifestyle = (profile?.lifestyle ?? {}) as Record<string, any>;
    const workType = lifestyle.work_type ?? lifestyle.workType ?? 'unknown';      // blue_collar | desk | wfh | shift | retired | unemployed | unknown
    const hasKids  = lifestyle.has_kids ?? lifestyle.hasKids ?? 'unknown';        // true | false | unknown
    const cookTime = lifestyle.cooking_time ?? lifestyle.cookingTime ?? 'unknown'; // none | <15 | 15-30 | 30-60 | 60+ | unknown
    const dietType = lifestyle.dietType ?? lifestyle.diet_type ?? 'standard';     // standard | vegetarian | vegan | keto | paleo | mediterranean | gluten_free
    const lifestyleStr = [
      `WORK_TYPE: ${workType}`,
      `HAS_KIDS: ${hasKids}`,
      `COOKING_TIME_PER_DAY: ${cookTime}`,
      `DIET: ${dietType}`,
    ].join(' · ');

    // Send ALL lab values, tagged with status from the new range model
    // (healthy/watch/low/high/critical_*) so the AI knows what to act on.
    const allLabsStr = labValues.map((v: any) => {
      const flag = (v.optimal_flag ?? v.standard_flag ?? '').toUpperCase();
      const tag = flag && flag !== 'NORMAL' && flag !== 'HEALTHY' ? ` [${flag}]` : '';
      return `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Std: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'})${tag}`;
    }).join('\n') || 'No labs uploaded';

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

    // Determine optimization mode: if mostly healthy markers, switch to longevity protocol.
    // Threshold + flag set live in _shared/healthMode.ts.
    const isOptimizationMode = isHealthyMode(labValues);
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
1. SUPPLEMENT STACK: Maximum 7 supplements. Valid sourced_from values:
   - "lab_finding": specific lab value out of standard range OR on the curated Watch list (e.g. HbA1c 5.4-5.6, ApoB ≥90, hs-CRP ≥0.5, ferritin <50). The labStr will tag the status. Healthy values do NOT earn supplements.
   - "medication_depletion": user takes a drug with established nutrient-depleting effect (statin→CoQ10, metformin→B12, mesalamine→folate, etc.). why must name the medication.
   - "disease_mechanism": user has a CONFIRMED diagnosed condition with a well-evidenced supplement (UC→L-glutamine/curcumin/omega-3/S.boulardii; Hashimoto's→selenium; T2D→berberine; PCOS→inositol). Not for speculative conditions.
   - "optimization": longevity supplement when labs mostly optimal.
   Treatment-tier (lab_finding, medication_depletion, disease_mechanism) always ranks above optimization. Every realistic medication depletion not already supplemented MUST appear. Every diagnosed chronic condition with strong evidence supplements MUST have at least one disease_mechanism entry unless already supplementing.
   STRICT RANK 1..N: rank 1 = most important for the user's TOP GOALS, then by clinical severity. No gaps, no duplicates.
   Speculative/untested conditions → put the test in retest_timeline, not a supplement in the stack.
3. CONDITIONS — GROUND TRUTH RULE: Use the user's DIAGNOSED CONDITIONS list verbatim.
   - Never substitute related conditions (UC ≠ Crohn's, even though they share treatments).
   - MEDICATIONS DO NOT REVEAL DIAGNOSES. A prescription tells you what a doctor wrote, not what the patient has, what's active, or what's been ruled out. Many drugs treat multiple conditions. Never infer or rename a diagnosis based on what's in the meds list.
   - The only valid use of medications is to flag known nutrient depletions, lab interactions, or side effects — never to derive new diagnoses.
   Address each STATED condition with condition-specific lifestyle interventions.
4. PATTERN RECOGNITION: Connect abnormal values across organ systems to identify undiagnosed conditions. In the summary, flag every multi-marker pattern (e.g., elevated platelets + elevated RDW = possible iron deficiency or myeloproliferative process; low HDL + borderline glucose = metabolic syndrome risk). In retest_timeline, recommend testing to confirm or rule out each pattern. The goal is EARLY DETECTION.
5. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning.
6. FEMALE HORMONE RULE: Do NOT flag estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase and a single draw means nothing without knowing cycle day. Never build a supplement protocol around "estrogen dominance" from one blood draw.
7. Supplements must be safe and not interact with patient's medications.
8. RETEST TIMELINE — cadence branches by MODE:
   TREATMENT mode (something needs fixing): ONE comprehensive retest at week 12 — that's the protocol close-out. retest_at: '12 weeks'.
   OPTIMIZATION mode (mostly healthy): retest cadence is 6 MONTHS, not 12 weeks. retest_at: '6 months'.

   STRICT TRIAGE RULE — same as Clinical Prep. A marker may ONLY appear in retest_timeline if it directly tracks ONE of:
     (a) a symptom the patient actually reported, OR
     (b) a known depletion / side-effect from a medication they're currently taking, OR
     (c) an out-of-range OR Watch-tier marker on THIS lab draw, OR
     (d) an early-detection marker pattern matching this patient (e.g. Hashimoto's antibodies if TSH 2.5-4.5 + fatigue/hair loss; full iron panel if ferritin <50; PCOS panel if cycle issues; MASH/FIB-4 if ALT>25 + low platelets; etc.).
   If none of (a)-(d) applies, DO NOT include the test. No "while we're at it" baselines. No "good to confirm" tests. No "you don't have a baseline yet so let's add it" tests — those belong in Clinical Prep's standard-of-care baseline check, not in retest_timeline.
   For each retest_timeline entry, the why field MUST cite the specific trigger ("ALT 97 + triglycerides 327 → tracking NAFLD reversal" not "good to monitor liver"). If you can't cite a trigger, drop the test.
   Differential thinking: ask "if this comes back the same/different, does management change?" If no, drop it.

   IMPORTANT — UNIFORMITY WITH CLINICAL PREP: retest_timeline markers MUST match Clinical Prep's recommended tests. Don't introduce new test names. The user should see ONE coherent test list across both pages.
   GATE ON RARE STUFF: NEVER mention JAK2, ANA reflex, HLA-B27, multiple myeloma SPEP/UPEP, hereditary hemochromatosis genetics, MTHFR, pituitary MRI, Cushing's 24h cortisol anywhere in the plan unless the patient's markers genuinely meet the gate threshold. Server-side scrubber will strip leftover mentions, but don't generate them in the first place.
9. WRITING STYLE: Write like a knowledgeable friend, not a medical textbook. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Explain the WHY in plain English. Keep the action plan actionable — specific things to do, not vague clinical language.
10. GOAL-DRIVEN BRANCHING (HARD RULE — the plan structure CHANGES based on the user's PRIMARY goal, which is the FIRST goal in the goals list):
    The summary, today_actions, workouts, lifestyle_interventions, and action_plan phases must visibly branch around the primary goal. Don't sprinkle goal references — actually structure the plan around it.

    PRIMARY GOAL = LONGEVITY:
    - Workouts: 3 zone-2 cardio (40-60min) + 3 strength (compound lifts) + 1 mobility/recovery per week.
    - Today actions: zone-2 walk, protein target (1g/lb lean), sleep 7-9h.
    - Lifestyle: time-restricted eating 12-14h window, 30g fiber/day, weekly sauna, cold exposure.
    - Phase focus: metabolic health (1) → strength + VO2max (2) → maintenance + tracking (3).

    PRIMARY GOAL = ENERGY:
    - Workouts: lighter zone-2 only first 4 weeks, ramp into strength weeks 5-12. NO HIIT until baseline restored.
    - Today actions: morning sunlight, protein breakfast, no screens 1h before bed.
    - Lifestyle: prioritize sleep architecture (cool room, consistent wake time, magnesium glycinate at night), iron/B12 if labs flag, blood-sugar-stable meals.
    - Phase focus: restore foundation (1) → energy production (2) → resilience (3).

    PRIMARY GOAL = WEIGHT:
    - Workouts: 4 strength + 2-3 zone-2 (low-impact). Strength first.
    - Today actions: protein at every meal (1g/lb goal weight), 10-min walk after each meal, no liquid calories.
    - Lifestyle: time-restricted eating 14-16h, low-glycemic foods, resistance training is primary, cardio supportive.
    - Phase focus: insulin sensitivity (1) → muscle gain + recomp (2) → maintenance (3).

    PRIMARY GOAL = HORMONES:
    - Workouts: heavy compound strength 3x/week (testosterone optimization), zone-2 2x, no overtraining.
    - Today actions: sleep 8h, sun exposure, zinc-rich + cholesterol-rich meals.
    - Lifestyle: minimize stress, consistent sleep, body fat 12-18% men / 18-25% women, manage sleep apnea risks, alcohol <3 drinks/week.
    - Phase focus: testing + foundation (1) → optimization (2) → maintenance (3).

    PRIMARY GOAL = GUT_HEALTH:
    - Workouts: gentle zone-2 + yoga first 4 weeks, ramp normally after gut symptoms quiet.
    - Today actions: chew thoroughly, stop eating 3h before bed, food/symptom journal.
    - Lifestyle: 30g fiber from real food, fermented foods daily, identify trigger foods (low-FODMAP trial if relevant), reduce stress.
    - Phase focus: identify triggers (1) → repair barrier (2) → reintroduce + maintain (3).

    PRIMARY GOAL = OFF_MEDICATIONS:
    - Critical: NEVER recommend stopping medications. Emphasize working WITH the doctor toward reduction.
    - Today actions: lifestyle changes that improve the metabolic conditions driving the medication.
    - Lifestyle: aggressively address insulin resistance, BP, lipids — the conditions most amenable to reversal.
    - Phase focus: build habits (1) → measurable improvement (2) → revisit medication need with doctor (3).
    - medication_notes: give specific evidence-based natural alternatives for EACH med, framed as 'discuss with your doctor'.

    PRIMARY GOAL = HEART_HEALTH:
    - Workouts: 4 zone-2 cardio + 2 strength + flexibility.
    - Today actions: 30g fiber, omega-3 rich food, daily 30-min walk, BP at home weekly.
    - Lifestyle: Mediterranean-style eating, salt awareness, statin discussion (if not already on one and lab-warranted), sleep + stress.
    - Phase focus: lipid + inflammation (1) → cardio capacity (2) → maintenance (3).

    PRIMARY GOAL = HAIR_REGROWTH:
    - Today actions: protein at breakfast, scalp massage 5 min/day, sleep 8h, ferritin-rich food.
    - Lifestyle: address ferritin <50, full thyroid panel if not done, manage stress (cortisol disrupts cycle), zinc + biotin from food, no harsh treatments.
    - Phase focus: nutritional foundation (1) → scalp + cycle (2) → maintenance (3).

    PRIMARY GOAL = AUTOIMMUNE:
    - Workouts: gentle zone-2 + strength, NO overtraining (raises CRP).
    - Lifestyle: anti-inflammatory diet, identify food triggers, stress management, sleep is non-negotiable.
    - Phase focus: lower inflammation (1) → identify triggers (2) → maintain remission (3).

    PRIMARY GOAL = PAIN:
    - Workouts: gentle movement first, build strength carefully, daily mobility.
    - Lifestyle: anti-inflammatory diet, omega-3, magnesium, sleep, stress, weight if relevant.

    For EVERY goal: the summary MUST open with how the plan ties to the user's primary goal. The user should feel the plan was built around them.

11. MEALS — REALISTIC PROGRESSION + LIFESTYLE-TAILORED (CRITICAL — adherence beats perfection):

    LIFESTYLE BRANCHING (read LIFESTYLE_CONTEXT in the user message):
      - WORK_TYPE = blue_collar / shift / construction / driver / nurse / etc. → on the move all day, packed lunches, fast food on shift, no kitchen access. Phase 1 meals: gas-station-friendly upgrades (gas station: turkey jerky + apple + water; fast food: Chick-fil-A grilled chicken sandwich no bun + fruit cup; truck stop: hard-boiled eggs + banana). Phase 2: cooler meals — pre-cooked chicken + rice in a Pyrex, fruit, hard cheese. Phase 3: meal-prep Sundays. NO recipes that need a kitchen at lunch.
      - WORK_TYPE = wfh → has a kitchen at lunch. Phase 1 can include 5-min stovetop meals. Phase 2 introduces 15-min cooks. Phase 3 full recipes.
      - WORK_TYPE = desk / office → packed lunch from home OR cafeteria/quick-serve. Phase 1: build-your-own from a bag (rotisserie chicken + pre-washed greens + olive oil). Phase 2: simple meal prep. Phase 3: full meals.
      - WORK_TYPE = shift / nurse / overnight → rotating sleep, irregular meal timing. Phase 1 focuses on portable + protein-dense. Avoid "eat breakfast at 7am" framing.
      - HAS_KIDS = true → cooking time is fragmented. NO recipes that require >2 burners or constant attention. Sheet-pan, slow-cooker, instant-pot only after Phase 1. Phase 1 meals must be kid-edible too (the parent isn't cooking two meals).
      - COOKING_TIME = none / <15 → Phase 1 is grocery-store assembly only (no cooking). Phase 2: 5-15 min stovetop. Phase 3: 30 min max.
      - COOKING_TIME = 60+ → can include real recipes from Phase 1.
      - DIET = vegetarian / vegan / keto / etc. → all meals MUST honor the diet. No salmon for vegan. No oatmeal for keto. NEVER suggest a meal that breaks the user's stated diet.
      - WORK_TYPE = unknown → assume blue_collar/busy default (most realistic for the median user). Don't ask, just keep it grocery-store-basic.

    PROGRESSION ACROSS PHASES (regardless of work type):
    Most users start with poor diets — fast food, refined carbs, low protein, low vegetables. Jumping to "wild salmon + roasted asparagus + bone broth + grass-fed butter" feels alien and adherence collapses by week 2. Build the meals[] array as a PROGRESSION across phases:
    Most users start with poor diets — fast food, refined carbs, low protein, low vegetables. Jumping to "wild salmon + roasted asparagus + bone broth + grass-fed butter" feels alien and adherence collapses by week 2. The "perfect" meal that doesn't get eaten beats every metric of zero. Build the meals[] array as a PROGRESSION across phases:

    PHASE 1 (Weeks 1-4) — SWAPS, NOT REPLACEMENTS. Tag these meals with when including ":phase1" suffix is fine in the name. The user is not learning to cook from scratch in week 1.
      - "Upgrade your current meal" framing. Egg McMuffin → make the egg+cheese sandwich at home with whole-grain English muffin. Subway → Chipotle bowl with double protein. Cereal breakfast → Greek yogurt + berries + handful of nuts.
      - Ingredients should be groceries-store basic: chicken breast, eggs, ground beef, frozen vegetables, brown rice, oatmeal, peanut butter, bananas, apples, plain Greek yogurt, basic seasonings (salt, pepper, garlic, olive oil).
      - NO bone broth. NO grass-fed butter. NO ghee. NO wild Atlantic salmon. NO sea moss. NO microgreens. NO tahini-drizzled anything. These belong in Phase 3 if at all.
      - 2-3 meals max. Each one should take <10 min to make and be googleable on TikTok.

    PHASE 2 (Weeks 5-8) — INTRODUCE ONE NEW THING. Salmon is OK now (Costco frozen filets). Roasted vegetables OK. Quinoa OK. The patient has 4 weeks of routine; they can level up.
      - 2-3 meals. Slightly more ingredients (5-7 items vs phase 1's 3-5).
      - Still budget-grocery-store. Whole Foods is fine but not required.

    PHASE 3 (Weeks 9-12) — OPTIMAL. Salmon power bowls, kale-avocado salads, the meals you'd actually post on Instagram. Patient has built habits and tolerance.
      - 2-3 meals. Full-on clean.

    Each meal entry MUST include a "phase" field: 1, 2, or 3. Phase 1 meals come FIRST in the array. Total meals: 6-9 across all three phases.
    The why field should hint at the "why now" not the "why ever" — e.g. for phase 1 "Easiest swap from your current eggs+toast" beats "Choline supports liver repair pathways."

12. LIMITED-DATA MODE: If the user has NO lab values uploaded (only symptoms, conditions, medications, goals), still generate a useful plan based on:
    - Diagnosed conditions and known mechanisms
    - Medication-related nutrient depletions (lab-confirmed by virtue of the prescription)
    - User goals (longevity supplements, etc.)
    - Lifestyle interventions tailored to symptoms and goals
    - Recommend baseline lab work as the FIRST item in retest_timeline so the next regeneration can be more precise.
    Do NOT refuse to generate a plan due to missing labs — just frame supplements with clear "evidence" sourcing and recommend testing.`,
        messages: [{ role: 'user', content: `Create a comprehensive wellness plan addressing ALL lab findings.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
USER'S PRIMARY GOAL (the structural anchor for the plan — branch around this per rule 10): ${userGoals[0] ? (GOAL_LABELS[userGoals[0]] ?? userGoals[0]) : 'understand bloodwork'}
USER'S OTHER GOALS (secondary): ${goalsStr}
MODE: ${isOptimizationMode ? 'optimization' : 'treatment'}
${isOptimizationMode ? 'OPTIMIZATION CONTEXT: Patient labs are mostly healthy. Frame the plan around longevity optimization, not disease treatment. Phase names should be: "Build Foundation (Months 1-2)", "Optimize (Months 3-4)", "Sustain & Track (Months 5-6)". Retest cadence is 6 months, not 12 weeks — set retest_at on every retest_timeline entry to "6 months". Lifestyle interventions focus on longevity science: zone 2 cardio, resistance training, sleep optimization, cold/heat exposure, stress resilience, metabolic health, and proactive screening.' : ''}
DIAGNOSED CONDITIONS (GROUND TRUTH — never substitute these with related conditions; never call UC 'Crohn's' or vice versa; never infer a different diagnosis from medications): ${condStr}
MEDICATIONS: ${medsStr}
CURRENT SUPPLEMENTS (already taking — do NOT re-recommend; account for lab interactions and avoid stacking duplicates): ${suppsStr}
SYMPTOMS (for context only — do NOT supplement based on symptoms alone): ${sympStr}
LIFESTYLE_CONTEXT (drives meals + workout realism — see hard rule 11 below): ${lifestyleStr}

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

Return JSON: {"generated_at":"${new Date().toISOString()}","headline":"one 12-word verdict in plain English (e.g. 'Your iron is low — fix it and the fatigue lifts')","summary":"3 short sentences max — what's wrong, what we'll fix, how long it takes","today_actions":[{"emoji":"","action":"one verb-led sentence the user does TODAY (e.g. 'Eat a 3-egg breakfast')","why":"one short sentence","category":"eat|move|take|sleep|stress"}],"supplement_stack":[{"rank":1,"emoji":"💊","nutrient":"","form":"","dose":"","timing":"","why_short":"6-10 word reason in plain English","why":"1 sentence linking to a lab or symptom","priority":"critical|high|moderate","sourced_from":"lab_finding|disease_mechanism","evidence_note":""}],"meals":[{"emoji":"🥗","name":"meal name","when":"breakfast|lunch|dinner|snack","phase":1,"ingredients":["short list"],"why":"1 sentence — favor 'why now / why this swap' framing for phase 1, 'why this lab' for phase 3"}],"workouts":[{"emoji":"🏃","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","title":"e.g. 'Zone 2 walk'","duration_min":30,"description":"1 sentence","why":"1 sentence — which goal/lab this serves"}],"lifestyle_interventions":{"diet":[{"emoji":"🥗","intervention":"","rationale":"","priority":""}],"sleep":[{"emoji":"😴","intervention":"","rationale":"","priority":""}],"exercise":[{"emoji":"💪","intervention":"","rationale":"","priority":""}],"stress":[{"emoji":"🧘","intervention":"","rationale":"","priority":""}]},"action_plan":{"phase_1":{"name":"Stabilize (Weeks 1-4)","focus":"","actions":[]},"phase_2":{"name":"Optimize (Weeks 5-8)","focus":"","actions":[]},"phase_3":{"name":"Maintain (Weeks 9-12)","focus":"","actions":[]}},"retest_timeline":[{"marker":"","retest_at":"","why":""}],"medication_notes":[{"medication":"","organ_impact":"","depletions":"","monitoring":"","alternative":""}],"disclaimer":"Educational only. Talk to your doctor before changing anything."}

CRITICAL OUTPUT RULES:
- today_actions: EXACTLY 3 items — the most important things this user can do TODAY. Mix categories (one eat, one move, one take is ideal).
- meals: 5-7 meals tied to this user's specific abnormal labs and goals. Real food, not "anti-inflammatory diet."
- workouts: 3-5 workouts spanning a week, tailored to user's goals (longevity → zone 2 + lift, weight → resistance + walk, energy → easy cardio + sleep).` }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('[generate-wellness-plan] Anthropic API error', response.status, errBody);
      throw new Error(`Anthropic API ${response.status}: ${errBody.slice(0, 200)}`);
    }
    const aiRes = await response.json();
    const stopReason = aiRes.stop_reason;
    // Extract JSON. Strip code fences. Find the FIRST { and LAST } to handle
    // explanatory text the model may add before/after when given long prompts.
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      rawText = rawText.slice(firstBrace, lastBrace + 1);
    }
    let plan: any;
    try {
      plan = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[generate-wellness-plan] JSON parse failed', { stopReason, len: rawText.length, head: rawText.slice(0, 300), tail: rawText.slice(-300) });
      // If max_tokens hit, the JSON is likely truncated. Surface that clearly.
      if (stopReason === 'max_tokens') {
        throw new Error('Plan response was truncated (output too large). Try regenerating.');
      }
      throw new Error('Plan JSON parse failed: ' + String(parseErr));
    }

    // ── Rare-disease prose scrubber (mirrors analyze-labs / doctor-prep) ──
    // Strip any sentence naming JAK2 / SPEP / MTHFR / Cushing's / HLA-B27 /
    // hereditary hemochromatosis genetics / pituitary MRI / etc. when the
    // patient's markers don't meet the gate threshold. Keeps wellness plan
    // text non-alarming on borderline values.
    try {
      const rdCtx = extractRareDiseaseContext(labValues, age);
      const blocked = buildRareDiseaseBlocklist(rdCtx);
      const STRUCTURAL_KEYS = new Set(['nutrient', 'form', 'icd10', 'medication', 'supplement', 'food', 'movement']);
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
      plan = walk(plan);
    } catch (e) { console.error('[wellness-plan] scrub error:', e); }

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

    // ── Deterministic medication-depletion injector ──────────────────────
    // The AI ignores the prompt rule sometimes (it dropped CoQ10 even when
    // the user is on a statin). Don't trust the AI for this — scan the
    // medications list and force-inject any missing depletion supplements.
    type DepletionRule = { regex: RegExp; nutrient: string; matchInStack: RegExp; entry: any };
    const userSuppNames = (supps ?? []).map((s: any) => (s.name ?? '').toLowerCase()).join(' ');
    const depletionRules: DepletionRule[] = [
      {
        regex: /\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|pitavastatin|fluvastatin|crestor|lipitor|zocor)\b/i,
        nutrient: 'CoQ10',
        matchInStack: /\b(coq[\s-]?10|ubiquinol|ubiquinone|coenzyme\s*q)\b/i,
        entry: { emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel', dose: '100-200mg', timing: 'With breakfast (take with fat)', why_short: 'Statins block your body from making CoQ10', why: 'Statins (like atorvastatin) inhibit the same pathway your body uses to make CoQ10 — the energy molecule muscle and heart cells depend on. Replacing it cuts statin-related fatigue and muscle aches.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple RCTs support 100-200mg ubiquinol daily for statin users.' },
      },
      {
        regex: /\b(metformin|glucophage)\b/i,
        nutrient: 'Vitamin B12',
        matchInStack: /\b(b[\s-]?12|cobalamin|methylcobalamin)\b/i,
        entry: { emoji: '💊', nutrient: 'Vitamin B12 (Methylcobalamin)', form: 'Sublingual', dose: '500-1000mcg', timing: 'Morning, away from food', why_short: 'Metformin blocks B12 absorption over time', why: 'Metformin reduces B12 absorption in the gut. Subclinical B12 deficiency causes fatigue, brain fog, and nerve symptoms before serum levels drop. Methylcobalamin bypasses the absorption block.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Studies show 10-30% of long-term metformin users develop B12 deficiency.' },
      },
      {
        regex: /\b(omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole|prilosec|nexium|protonix)\b/i,
        nutrient: 'Vitamin B12 + Magnesium',
        matchInStack: /\b(b[\s-]?12|magnesium)\b/i,
        entry: { emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '200-400mg', timing: 'Evening', why_short: 'PPIs deplete magnesium and B12', why: 'PPIs (like omeprazole) suppress stomach acid, reducing absorption of magnesium, B12, calcium, and iron. Glycinate form is gentle on the gut.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'FDA black-box warning on PPI-induced hypomagnesemia.' },
      },
      {
        regex: /\b(mesalamine|sulfasalazine|asacol|pentasa|lialda|apriso)\b/i,
        nutrient: 'Methylfolate',
        matchInStack: /\b(folate|folic\s*acid|methylfolate|5-mthf)\b/i,
        entry: { emoji: '💊', nutrient: 'Methylfolate (5-MTHF)', form: 'Capsule', dose: '400-800mcg', timing: 'Morning with food', why_short: 'Mesalamine + UC both lower folate absorption', why: 'Mesalamine and sulfasalazine block folate absorption, and UC inflammation compounds the deficit. Methylfolate is the active form your body can use directly.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Sulfasalazine especially well-documented for inducing folate deficiency.' },
      },
      {
        regex: /\b(prednisone|prednisolone|methylprednisolone|dexamethasone)\b/i,
        nutrient: 'Vitamin D + Calcium',
        matchInStack: /\b(vitamin\s*d|calcium)\b/i,
        entry: { emoji: '💊', nutrient: 'Calcium + Vitamin D3', form: 'Tablet', dose: '500mg Ca + 2000 IU D3', timing: 'With dinner', why_short: 'Steroids leach bone minerals', why: 'Oral corticosteroids reduce calcium absorption and accelerate bone loss. Pairing calcium with D3 maintains bone density during treatment.', priority: 'critical', sourced_from: 'medication_depletion', evidence_note: 'ACR guidelines recommend Ca+D for any patient on >5mg prednisone for >3 months.' },
      },
      {
        regex: /\b(furosemide|lasix|torsemide|bumetanide|hydrochlorothiazide|hctz|chlorthalidone|spironolactone)\b/i,
        nutrient: 'Magnesium',
        matchInStack: /\bmagnesium\b/i,
        entry: { emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '300-400mg', timing: 'Evening', why_short: 'Diuretics flush magnesium out', why: 'Loop and thiazide diuretics increase urinary magnesium loss, often causing subclinical deficiency that worsens fatigue and BP control.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Routine supplementation recommended in cardiology guidelines.' },
      },
    ];

    if (Array.isArray(plan.supplement_stack)) {
      const stackText = plan.supplement_stack.map((s: any) => `${s.nutrient ?? ''} ${s.form ?? ''}`).join(' ').toLowerCase();
      for (const rule of depletionRules) {
        if (!rule.regex.test(medsStr)) continue;
        if (rule.matchInStack.test(stackText)) continue;
        if (rule.matchInStack.test(userSuppNames)) continue; // user already takes it
        plan.supplement_stack.push(rule.entry);
        console.log(`[wellness-plan] Injected ${rule.nutrient} for ${rule.regex.source} match`);
      }

      // ── Goal-stack injector (optimization mode only) ───────────────────
      // For users in optimization mode (mostly healthy), make sure the
      // canonical longevity / goal-tuned stack is present even if the AI
      // didn't include it. Same skip rule: if user already supplements it,
      // don't re-add. These are 'optimization' tier — always rank below
      // lab_finding / medication_depletion / disease_mechanism entries.
      type GoalStackEntry = { matchInStack: RegExp; entry: any };
      const baseLongevityStack: GoalStackEntry[] = [
        {
          matchInStack: /\bcreatine\b/i,
          entry: { emoji: '💪', nutrient: 'Creatine Monohydrate', form: 'Powder', dose: '5g', timing: 'Any time daily', why_short: 'Universal — strength, cognition, bone density', why: 'Creatine is one of the most studied supplements. Daily 5g supports muscle strength, cognitive function, and bone density. No loading required.', priority: 'optimize', sourced_from: 'optimization', evidence_note: '500+ RCTs across decades support 3-5g daily for healthy adults.' },
        },
        {
          matchInStack: /\b(omega[- ]?3|fish oil|epa|dha)\b/i,
          entry: { emoji: '🐟', nutrient: 'Omega-3 (EPA + DHA)', form: 'Softgel', dose: '2g combined EPA+DHA', timing: 'With food', why_short: 'CV protection, brain, anti-inflammatory', why: 'Omega-3s lower triglycerides, hs-CRP, and CV risk. Aim for 2g combined EPA+DHA daily from a third-party-tested fish oil or algal source.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'AHA recommends 1g+/day; longevity protocols target 2g+.' },
        },
        {
          matchInStack: /\bvitamin\s*d\b|cholecalciferol|d3/i,
          entry: { emoji: '☀️', nutrient: 'Vitamin D3 + K2', form: 'Softgel', dose: '2000-5000 IU D3 + 100mcg K2 MK-7', timing: 'With breakfast (fat-soluble)', why_short: 'Bone, immune, mood — most people are low', why: 'Vitamin D3 with K2 directs calcium to bones, not arteries. Target a blood level of 50-70 ng/mL with retesting after 8-12 weeks.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'Endocrine Society recommends 1500-2000 IU/day baseline.' },
        },
        {
          matchInStack: /\bmagnesium\b/i,
          entry: { emoji: '🌙', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '300-400mg elemental', timing: 'Evening (sleep aid)', why_short: 'Sleep, muscle, BP, blood sugar', why: 'Glycinate form is well-tolerated and supports sleep, muscle relaxation, blood pressure, and insulin sensitivity. Most adults are mildly deficient.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'NHANES data: ~50% of US adults below RDA.' },
        },
      ];
      const energyExtras: GoalStackEntry[] = [
        {
          matchInStack: /\b(b[\s-]?complex|methylated b)\b/i,
          entry: { emoji: '⚡', nutrient: 'Methylated B-Complex', form: 'Capsule', dose: '1 capsule', timing: 'Breakfast', why_short: 'Energy production + methylation', why: 'B-vitamins (especially methylfolate, methylcobalamin) drive cellular energy and one-carbon metabolism. The methylated form is more bioavailable.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'Standard for energy + cognitive optimization protocols.' },
        },
      ];
      const performanceExtras: GoalStackEntry[] = [
        {
          matchInStack: /\bashwagandha|withania/i,
          entry: { emoji: '🪨', nutrient: 'Ashwagandha (KSM-66)', form: 'Capsule', dose: '600mg', timing: 'Evening', why_short: 'Cortisol, recovery, sleep', why: 'KSM-66 ashwagandha lowers cortisol, improves sleep quality, and supports testosterone in men. Take 8-12 weeks for full effect.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'RCTs show 14-22% cortisol reduction and modest T improvements.' },
        },
      ];
      const heartExtras: GoalStackEntry[] = [
        {
          matchInStack: /\b(coq10|ubiquinol|coenzyme\s*q)\b/i,
          entry: { emoji: '❤️', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel', dose: '100mg', timing: 'Breakfast', why_short: 'Mitochondrial energy + heart support', why: 'CoQ10 supports cardiac muscle energy production. Especially relevant if on a statin or if heart-health is the goal.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'CV outcomes literature supports 100-200mg/day.' },
        },
      ];

      const primaryGoal = userGoals[0] ?? '';
      let goalStack: GoalStackEntry[] = [];
      if (isOptimizationMode || ['longevity', 'energy', 'heart_health', 'weight'].includes(primaryGoal)) {
        // Base longevity stack runs for all optimization-leaning paths
        goalStack = [...baseLongevityStack];
        if (primaryGoal === 'energy') goalStack.push(...energyExtras);
        if (primaryGoal === 'heart_health') goalStack.push(...heartExtras);
        if (['longevity', 'weight'].includes(primaryGoal)) goalStack.push(...performanceExtras);
      }

      const stackTextNow = () => plan.supplement_stack.map((s: any) => `${s.nutrient ?? ''} ${s.form ?? ''}`).join(' ').toLowerCase();
      for (const item of goalStack) {
        if (plan.supplement_stack.length >= 7) break;
        if (item.matchInStack.test(stackTextNow())) continue;
        if (item.matchInStack.test(userSuppNames)) continue; // already supplementing
        plan.supplement_stack.push(item.entry);
        console.log(`[wellness-plan] Goal-stack injected ${item.entry.nutrient} for primary goal "${primaryGoal}"`);
      }

      // Re-cap and re-rank after all injections
      const priorityRank = (p: string) => p === 'critical' ? 0 : p === 'high' ? 1 : p === 'moderate' ? 2 : 3;
      plan.supplement_stack = plan.supplement_stack
        .sort((a: any, b: any) => {
          const ar = typeof a.rank === 'number' ? a.rank : 999;
          const br = typeof b.rank === 'number' ? b.rank : 999;
          if (ar !== br) return ar - br;
          return priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize');
        })
        .slice(0, 7)
        .map((s: any, i: number) => ({ ...s, rank: i + 1 }));
    }

    // Keep old plans for history — don't delete
    await supabase.from('wellness_plans').insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
