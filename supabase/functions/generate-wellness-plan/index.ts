// supabase/functions/generate-wellness-plan/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isHealthyMode } from '../_shared/healthMode.ts';
import { GOAL_LABELS, formatGoals } from '../_shared/goals.ts';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';
import { buildUniversalTestInjections } from '../_shared/testInjectors.ts';
import { selectMealCandidates, inferLabTargets } from '../_shared/foodSelector.ts';

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

    // ── Lifestyle context for universal AI tailoring ──
    // Pulls from BOTH:
    //   - profile.life_context (new working-class onboarding step — work, kids,
    //     food, healthcare access)
    //   - profile.lifestyle (existing sleep/diet/exercise/stress)
    // Missing fields show 'unknown' so the AI defaults to the safest assumption
    // for the median user (busy adult, limited time, fast-food friendly).
    // Universal context only — the AI uses these signals to tailor advice
    // organically (no hardcoded condition-specific or profile-specific logic).
    const lifestyle  = (profile?.lifestyle ?? {}) as Record<string, any>;
    const lifeCtx    = (profile?.life_context ?? {}) as Record<string, any>;
    const workType   = lifeCtx.workType ?? lifestyle.work_type ?? lifestyle.workType ?? 'unknown';
    const workSched  = lifeCtx.workSchedule ?? 'unknown';
    const hoursWk    = lifeCtx.hoursWorkedPerWeek ?? 'unknown';
    const kids       = lifeCtx.kidsAtHome ?? lifestyle.has_kids ?? 'unknown';
    const livingSit  = lifeCtx.livingSituation ?? 'unknown';
    const cookFreq   = lifeCtx.cookHomeFrequency ?? 'unknown';
    const cookTime   = lifeCtx.cookingTimeAvailable ?? lifestyle.cooking_time ?? 'unknown';
    // Multi-select meal patterns. Backwards compat: legacy single-string
    // typicalLunch is wrapped into an array. Comma-joined for the prompt.
    const breakfastArr: string[] = Array.isArray(lifeCtx.breakfastPatterns) ? lifeCtx.breakfastPatterns : [];
    const lunchArr: string[] = Array.isArray(lifeCtx.typicalLunches) && lifeCtx.typicalLunches.length > 0
      ? lifeCtx.typicalLunches
      : (typeof lifeCtx.typicalLunch === 'string' ? [lifeCtx.typicalLunch] : []);
    const dinnerArr: string[] = Array.isArray(lifeCtx.dinnerPatterns) ? lifeCtx.dinnerPatterns : [];
    const breakfastPatterns = breakfastArr.length > 0 ? breakfastArr.join(', ') : 'unknown';
    const lunch = lunchArr.length > 0 ? lunchArr.join(', ') : 'unknown';
    const dinnerPatterns = dinnerArr.length > 0 ? dinnerArr.join(', ') : 'unknown';
    const foodBudget = lifeCtx.weeklyFoodBudget ?? 'unknown';
    const eatOut     = Array.isArray(lifeCtx.eatOutPlaces) && lifeCtx.eatOutPlaces.length > 0
                         ? lifeCtx.eatOutPlaces.join(', ') : 'unknown';
    const insurance  = lifeCtx.insuranceType ?? 'unknown';
    const hasPCP     = lifeCtx.hasPCP ?? 'unknown';
    const lastPhys   = lifeCtx.lastPhysical ?? 'unknown';
    const dietType   = lifestyle.dietType ?? lifestyle.diet_type ?? 'standard';

    const lifestyleStr = [
      `WORK_TYPE: ${workType}`,
      `WORK_SCHEDULE: ${workSched}`,
      `HOURS_PER_WEEK: ${hoursWk}`,
      `KIDS_AT_HOME: ${kids}`,
      `LIVING_WITH: ${livingSit}`,
      `COOK_AT_HOME_FREQ_0_TO_10: ${cookFreq}`,
      `COOKING_TIME_PER_DAY: ${cookTime}`,
      `BREAKFAST_PATTERNS: ${breakfastPatterns}`,
      `LUNCH_PATTERNS: ${lunch}`,
      `DINNER_PATTERNS: ${dinnerPatterns}`,
      `WEEKLY_FOOD_BUDGET: ${foodBudget}`,
      `EATS_OUT_AT: ${eatOut}`,
      `INSURANCE: ${insurance}`,
      `HAS_PCP: ${hasPCP}`,
      `LAST_PHYSICAL: ${lastPhys}`,
      `DIET: ${dietType}`,
    ].join(' · ');

    // ── Food Playbook candidate selection ─────────────────────────────────
    // Pull top ~30 brand-specific meals from the curated library that match
    // this user's life_context + lab targets. AI picks 12-18 finalists from
    // these candidates and writes the lab-specific "why" per user. The
    // library ensures every output meal has a real brand/chain/SKU mention
    // and matches the user's actual eating patterns.
    const labTargets = inferLabTargets(labValues, symptoms);
    const mealCandidates = selectMealCandidates({
      workType: workType !== 'unknown' ? workType : undefined,
      hasKids: kids !== 'unknown' && kids !== '0',
      cookingTimeAvailable: cookTime !== 'unknown' ? cookTime : undefined,
      weeklyFoodBudget: foodBudget !== 'unknown' ? foodBudget : undefined,
      eatOutPlaces: Array.isArray(lifeCtx.eatOutPlaces) ? lifeCtx.eatOutPlaces : [],
      breakfastPatterns: breakfastArr,
      lunchPatterns: lunchArr,
      dinnerPatterns: dinnerArr,
      diet: dietType,
      labTargets,
    }, 30);
    console.log(`[wellness-plan] inferred lab targets: ${labTargets.join(', ')}`);
    console.log(`[wellness-plan] selected ${mealCandidates.length} meal candidates from playbook`);
    const mealCandidatesStr = mealCandidates.length > 0
      ? mealCandidates.map(m =>
          `- [${m.playbook}|${m.when}|phase${m.phase}|${m.prepMinutes}min] ${m.emoji} ${m.name} | ingredients: ${m.ingredients.slice(0, 5).join(', ')}${m.protein_g ? ` | ~${m.protein_g}g protein` : ''}`
        ).join('\n')
      : '(no candidates — fall back to your library knowledge using the playbook rules below)';

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
        model: 'claude-haiku-4-5-20251001', max_tokens: 14000,
        system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — these apply to EVERY string in the JSON):
- 6TH-GRADE READING LEVEL. PERIOD. If your friend who failed high school chemistry can't read it, you wrote it wrong.
- BREVITY IS A FEATURE, NOT A SUGGESTION. The user's friend reading this is tired, on lunch break, has 30 seconds. Long paragraphs make him close the tab.
- HARD CAPS:
    summary: 3 short sentences MAX (≤45 words total)
    symptoms_addressed.how_addressed: 30 WORDS MAX. Two short sentences. Cause + plan. Nothing more.
    retest_timeline.why: 25 WORDS MAX. One sentence. Trigger + what change to expect.
    supplement.why: 20 WORDS MAX. One sentence linking lab/symptom to fix.
    supplement.why_short: 6-10 words.
    supplement.practical_note: 25 WORDS MAX.
    today_actions.action / why: each ≤15 words.
    lifestyle_interventions.* rationale: ≤20 words each.
- NO LISTING dosages in why fields (they're already in the dose field).
- NO PERCENTAGE IMPROVEMENTS ("expect 50% improvement by week 4" — cut it. Patients don't read mechanisms.)
- NO JARGON. 6th-grade everywhere. Use plain English ("liver enzyme" not "ALT", "blood sugar" not "glucose", "iron stores" not "ferritin", "inflammation marker" not "hs-CRP"). The marker abbreviation may appear in PARENTHESES after the plain-English term ("your liver enzyme (ALT) is 97"). Never lead with the abbreviation. A deterministic scrubber catches anything you miss.
- LEAD WITH A VERB when it's an action ("Eat...", "Walk...", "Take...", "Skip..."). LEAD WITH THE FINDING when it's a why ("Vitamin D 24 — too low.").
- If a sentence doesn't pull its weight, CUT IT. Don't pad. Don't hedge. Don't qualify.
- Every actionable item gets an "emoji" field — a single emoji that captures the action (🥗 food, 💪 strength, 🏃 cardio, 😴 sleep, 🧘 stress, 💊 supplement, 🧪 test, 🩺 doctor, 💧 hydration, ☀️ sun, 🥩 protein, 🐟 omega-3, 🥬 leafy greens, 🍓 antioxidants, 🚶 walk, 🏋️ lift, 🧠 brain, ❤️ heart, 🫁 lungs, 🦴 bone).

CAUSEHEALTH IS NOT A LONGEVITY OR FUNCTIONAL-MEDICINE APP. We are a clinical-translation tool. We:
  1. Address symptoms with evidence-supported supplements (tied to a lab finding, medication depletion, or diagnosed condition)
  2. Recommend tests with a "DOCTOR CAN'T REJECT IT" bar: standard, insurance-covered, PCP-orderable, tied to a documented finding, with a specific ICD-10 code justifying coverage. If a PCP could reasonably refuse a test — drop it or rewrite the justification until it's bulletproof.
We do NOT recommend functional-medicine extras (GI-MAP, hair tissue mineral, organic acids, food sensitivity panels, micronutrient panels). We do NOT recommend longevity wishlists (NMR lipid, VO2 max, DEXA <50, comprehensive thyroid antibodies asymptomatic, advanced cardiology <35).
Test and supplement recommendations are anchored to a specific finding or evidence-based deficiency. No "optimization" stacks.

HARD RULES — FOLLOW EXACTLY:

1. SUPPLEMENT STACK — TEST-FIRST, SUPPLEMENT-SECOND, ONE PER CATEGORY.
   We do NOT recommend supplements based on theoretical deficiencies. A nutrient/supplement only enters supplement_stack when there is OBJECTIVE evidence the patient needs it.

   HARD CAP: ONE supplement per category. MAX. Pick the SINGLE highest-leverage supplement for each of the 6 categories that applies to this patient. If a category has no clear winner, leave it empty — DO NOT pad. A clean 4-supplement stack with one per category beats 7 with overlap.

   The 6 categories:
     1. sleep_stress       — sleep onset, mid-night waking, cortisol, anxiety
     2. gut_healing        — UC/IBD/IBS gut barrier, microbiome
     3. liver_metabolic    — ALT/AST elevation, lipids, blood sugar / insulin resistance, hepatoprotection (NEW: milk thistle, NAC, CoQ10 for statin)
     4. inflammation_cardio — omega-3 for TG/ApoB, hs-CRP-driven inflammation, joint
     5. nutrient_repletion — confirmed deficiencies (vitamin D 24, ferritin <30, B12 <300)
     6. condition_therapy  — diagnosis-specific evidence-based (PCOS inositol, Hashimoto's selenium IF TPO+, UC L-glutamine)

   "Best one per category" means: highest evidence × highest impact for THIS patient × safest profile. Don't list two "good" supplements for the same category — pick the better one and drop the other.

   Healthy patient with no chronic dx should land at 2-3 supplements total (likely just nutrient_repletion + one empirical exception).

   DO NOT include rank numbers in the displayed stack — the UI groups by category, not by rank.

   Valid sourced_from values:
   - "lab_finding": a SPECIFIC lab value out of standard range OR on the curated Watch list on THIS draw (e.g. ferritin 28, vitamin D 24, hs-CRP 0.8, HbA1c 5.5). Cite the marker and value in why. Healthy values do NOT earn supplements.
   - "disease_mechanism": user has a CONFIRMED diagnosed condition where the supplement has strong evidence as adjunct therapy (UC → curcumin / omega-3 / S. boulardii; Hashimoto's → selenium IF TPO+ confirmed; T2D → berberine; PCOS → inositol IF diagnosis confirmed; TRT → DHEA only if labs warrant). The diagnosis IS the evidence; no lab finding required.
   - "optimization": OFF BY DEFAULT. Only allowed if user's PRIMARY goal is "longevity" AND no out-of-range markers, no symptoms, no medication depletions to address. Even then, max 1-2 entries (omega-3 if dietary intake is low, vitamin D if sub-optimal but in standard range). NOT a longevity stack. NEVER NAD+ / NMN / Resveratrol / Spermidine / methylene blue / speculative anti-aging compounds.

   "medication_depletion" — TEST FIRST as the default, with narrow exceptions for empirical supplementation. The pattern:

   DEFAULT (test first, supplement when lab confirms):
     For most drug→nutrient depletions where the lab test is cheap, standard, and PCP-orderable, recommend the TEST in retest_timeline. Examples:
       - Metformin → B12 + MMA + homocysteine (don't auto-add B12 supplement)
       - Mesalamine → serum folate + RBC folate (don't auto-add folate)
       - PPI → Mg + B12 (don't auto-add Mg or B12)
       - SSRI → Na (BMP — already standard)
       - Levothyroxine → no auto-test, just note Fe interaction
     a) Add the relevant TEST to retest_timeline
     b) Once a future lab confirms deficiency, sourced_from becomes "lab_finding".

   EMPIRICAL SUPPLEMENTATION ALLOWED (no lab confirmation needed) when ALL THREE are true:
     1. The depletion / mechanism is near-universal in the relevant population (well-documented mainstream evidence)
     2. The supplement is broadly safe with no major interactions (safety profile = OTC/multi-decade evidence)
     3. The lab test is either impractical/expensive OR the supplement is so safe that test-first creates unnecessary friction

   APPROVED EMPIRICAL EXCEPTIONS (the ONLY ones — do not invent more):
     - statin → CoQ10 (Ubiquinol) 100-200mg/day · liver_metabolic · sourced_from medication_depletion
     - ALT >60 OR hepatotoxic med (statin/methotrexate/isoniazid/valproate/acetaminophen >3g) → Milk Thistle (Silymarin) 200-400mg/day · liver_metabolic
     - Sleep complaint → Magnesium Glycinate 200-400mg evening · sleep_stress
     - TG >150 OR low fish intake → Omega-3 EPA/DHA 1-2g/day · inflammation_cardio
     - Long-term metformin (>5yr) → B12 Methylcobalamin 500-1000mcg sublingual (prefer test-first if recent B12/MMA available) · nutrient_repletion
     - Long-term PPI (>2yr) → Magnesium Glycinate · sleep_stress

   STILL TEST-FIRST (cheap test changes the answer): Methylfolate (test serum + RBC folate); Berberine (test fasting insulin + HOMA-IR — A1c alone insufficient); Iron (ALWAYS test ferritin/iron/TIBC/sat — risk to heterozygous hemochromatosis carriers); B12 (add MMA test, don't auto-add unless long-term metformin); Curcumin (has interactions — prefer milk thistle for ALT elevation); Selenium for Hashimoto's (test TPO Ab first).

   IF the relevant lab IS on this draw AND shows deficiency, sourced_from becomes "lab_finding" with the medication named as the likely cause in why (no double-counting).

   PRACTICAL_NOTE — REQUIRED on every supplement, ONE short sentence combining (1) why this timing/form (absorption/GABA/circadian), (2) any interaction with the user's actual meds, (3) any avoid-caveat (empty stomach, with calcium, etc.). High-impact interactions to flag if relevant: berberine+statin (liver-processed, check with doctor); vitamin K2+warfarin (affects INR, MD only); St John's Wort+SSRI (serotonin syndrome — never combine); calcium/iron+levothyroxine (4hr apart); magnesium+antibiotic (2hr apart); curcumin+blood thinner (potentiation); DHEA+hormone cancer hx (avoid); saw palmetto+PSA monitoring (masks). If timing is generic ("with food"), still note why that form was chosen.
   Speculative supplements → put the test in retest_timeline, not a supplement.
3. CONDITIONS — GROUND TRUTH RULE: Use the user's DIAGNOSED CONDITIONS list verbatim.
   - Never substitute related conditions (UC ≠ Crohn's, even though they share treatments).
   - MEDICATIONS DO NOT REVEAL DIAGNOSES. A prescription tells you what a doctor wrote, not what the patient has, what's active, or what's been ruled out. Many drugs treat multiple conditions. Never infer or rename a diagnosis based on what's in the meds list.
   - The only valid use of medications is to flag known nutrient depletions, lab interactions, or side effects — never to derive new diagnoses.
   - **NO INFERENCE.** If a condition isn't in DIAGNOSED CONDITIONS, you cannot name it OR allude to it anywhere in the output. Talk about a medication's effects without naming the condition it treats. A scrubber catches stragglers.
   Address each STATED condition with condition-specific lifestyle interventions.
4. PATTERN RECOGNITION: Connect abnormal values across organ systems to identify undiagnosed conditions. In the summary, flag every multi-marker pattern (e.g., elevated platelets + elevated RDW = possible iron deficiency or myeloproliferative process; low HDL + borderline glucose = metabolic syndrome risk). In retest_timeline, recommend testing to confirm or rule out each pattern. The goal is EARLY DETECTION.
5. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning.

6a. SYMPTOMS_ADDRESSED — for EVERY symptom the user reported, include an entry in symptoms_addressed[] with:
    - symptom: the symptom name as the user logged it (verbatim if possible)
    - severity: their stated severity (1-10)
    - how_addressed: 1-2 sentences naming the SPECIFIC test added to retest_timeline (per the symptom-test map), supplement added to stack (only if a lab confirms — otherwise note 'pending lab result'), and lifestyle intervention.
    Tone: action-oriented and concrete. The user should see a clear thread from "I have joint pain" to "we added hs-CRP + vitamin D testing, the omega-3 supplement targets inflammation, and the 30-min walks reduce stiffness."
    If a symptom maps to a test that's already in the lab draw and is normal, say so ("TSH was tested and is optimal at 2.22 — fatigue is more likely from your low vitamin D and ferritin").
    If no clear cause exists yet, frame as: "tests added to find the cause" — never leave a symptom unaddressed.
6. FEMALE HORMONE RULE: Do NOT flag estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary by cycle phase and a single draw means nothing without knowing cycle day. Never build a supplement protocol around "estrogen dominance" from one blood draw.
7. Supplements must be safe and not interact with patient's medications.
8. RETEST TIMELINE — TWO MANDATORY CHECKS for EVERY patient (healthy or sick, any condition):
   CHECK 1 — WHAT THE LABS MISSED: For this patient's age and sex, compare what's in the lab values list against the standard-of-care baseline. Every test the doctor SHOULD have ordered for someone this age but didn't = goes in retest_timeline (trigger d).
   CHECK 2 — WHAT THE SYMPTOMS NEED: For every symptom the user logged, look up the symptom→test map. Every reported symptom MUST have its corresponding tests appear (trigger a) — even if labs look fine. Symptoms always need workup.
   These two checks run BEFORE the cap. The cap is a ceiling, not a target.

   CADENCE branches by MODE:
   TREATMENT mode (something needs fixing — any out-of-range marker, any chronic diagnosed condition like UC/Crohn's/Hashimoto's/Graves/T2D/RA/lupus/PCOS/CKD/HTN/CHF/etc., or multi-system pattern): COMPREHENSIVE retest at week 12 — this is the protocol close-out. Include ALL currently-abnormal markers, ALL tests triggered by symptoms, ALL medication-depletion tests, AND any standard-of-care baseline gaps. Multi-system patients should have 14-20 entries — be COMPREHENSIVE. retest_at: '12 weeks'. Hard-capped at 20. DO NOT undershoot.
   OPTIMIZATION mode (no out-of-range markers, no chronic conditions, no symptoms): cadence is 6 MONTHS, list is 4-7 entries (standard-of-care baseline gaps for age/sex). UP TO 10 if symptoms are present that warrant workup. retest_at: '6 months'.

   CONDITION-SPECIFIC TESTS (universal — layer on top of standard panels, not replace):
     IBD (UC/Crohn's): Fecal Calprotectin, Celiac Serology, Iron Panel, Vit D + B12 + Folate workups
     Hashimoto's: TSH+Free T3+Free T4, TPO Ab + Tg Ab if not done
     Graves: TSH+Free T3+Free T4 + TSI Ab
     T2D/prediabetes: A1c, Fasting Insulin + HOMA-IR, Lipid Panel, UACR, eGFR
     PCOS: Total+Free T, DHEA-S, LH:FSH, SHBG, Fasting Insulin + HOMA-IR
     Hypertension: BMP/CMP, UACR, Lipid Panel, A1c
     CKD: Cystatin C+eGFR, UACR, BMP, PTH, Vit D, Iron Panel
     CHF/CAD: Lipid + ApoB, hs-CRP, NT-proBNP if HF, A1c
     Lupus/RA/SLE: ESR+hs-CRP, ANA reflex (only if ANA+), CBC, CMP, UACR
     Osteoporosis: Calcium, Vit D, PTH, DEXA if 50+ or long-term steroids
     Mood disorders: TSH, Vit D, B12+MMA, hs-CRP
     Chronic fatigue: CBC, Ferritin, B12+MMA, Vit D, TSH, A1c, AM cortisol if HPA signs

   CONSOLIDATE INTO STANDARD PANELS — this is critical. Doctors order panels, not individual markers. Never list ALT, AST, bilirubin, glucose as four separate entries — they are ALL part of the CMP. Never list TG, LDL, total cholesterol, HDL as four entries — they are ALL the Lipid Panel. The retest list should reflect what the doctor will actually order.
   STANDARD PANEL GROUPINGS (use exactly these names; combine markers into ONE entry per panel):
     - "Lipid Panel" → covers Total Cholesterol, LDL (calc), HDL, Triglycerides, VLDL (calc), non-HDL
     - "Comprehensive Metabolic Panel (CMP)" → covers ALT, AST, ALP, Bilirubin (total + direct), Albumin, Total Protein, Glucose, BUN, Creatinine, eGFR, Sodium, Potassium, Chloride, CO2, Calcium
     - "Complete Blood Count (CBC) with Differential" → covers WBC, RBC, Hemoglobin, Hematocrit, MCV, MCH, MCHC, RDW, Platelets, Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils
     - "Iron Panel" → Serum Iron, TIBC, Ferritin, Transferrin Saturation, UIBC
     - "Thyroid Panel" → TSH, Free T3, Free T4 (only when triggered)
     - "Hashimoto's Antibodies" → TPO Ab, Thyroglobulin Ab (only when triggered)
     - "Vitamin B12 Workup" → Serum B12, MMA, Homocysteine
     - "Folate Workup" → Serum Folate, RBC Folate
     - "Testosterone Panel (Male)" → Total T, Free T, SHBG, Estradiol, LH, FSH (LH/FSH only if low T confirmed)
     - "PCOS Panel (Female)" → Total T, Free T, DHEA-S, LH:FSH, SHBG, Fasting Insulin
     - "Insulin Resistance Workup" → Fasting Insulin, HOMA-IR (calculated)
     - Single-test entries (no panel grouping needed): HbA1c, Vitamin D 25-OH, hs-CRP, ApoB, Lp(a), GGT, Uric Acid, PTH, Ionized Calcium

   The bar: ~14 panel orders covering ~50 markers — efficient + comprehensive, exactly how a doctor writes a lab order. Multi-system patients should see CMP + Lipid + HbA1c + CBC + Vit D + Iron Panel + Folate + B12 + hs-CRP + condition-specific tests + ApoB + Lp(a) baselines as appropriate.
   OPTIMIZATION mode (healthy): retest cadence 6 MONTHS, 3-5 entries (Watch markers + age/sex baseline gaps). retest_at: '6 months'.

   UNIVERSAL TRIAGE RULE (applies to EVERY entry, healthy or sick patient). A marker may ONLY appear in retest_timeline if it directly tracks ONE of:
     (a) a symptom the patient actually reported (the test investigates the cause)
     (b) a known depletion / side-effect from a medication they're currently taking (the test confirms or refutes depletion)
     (c) an out-of-range OR Watch-tier marker on THIS lab draw (the test re-measures it after the protocol)
     (d) a STANDARD-OF-CARE BASELINE TEST for the patient's age/sex that is MISSING from the draw (the doctor should have ordered it)
     (e) an early-detection marker pattern matching this patient (e.g. Hashimoto's antibodies if TSH 2.5-4.5 + fatigue/hair loss; full iron panel if ferritin <50; PCOS panel if cycle issues; etc.)

   If none of (a)-(e) applies, DO NOT include the test. No "while we're at it" longevity tests. No "good to confirm" tests with no specific trigger.

   STANDARD-OF-CARE BASELINE BY AGE/SEX (trigger (d) — recommend ONLY IF the test is NOT already in the lab values list):
     ALL adults (18+): lipid panel, HbA1c (every 3yr from 35), TSH at least once, vitamin D at least once, ferritin (esp menstruating women), hs-CRP once for CV risk, B12 once.
     35+: add ApoB and Lp(a) once-in-lifetime, fasting insulin if any IR signs.
     45+: add coronary calcium score once.
     50+: add DEXA (women), colorectal screening discussion.
     Women any age: iron panel if menstruating + symptoms.
     Men ANY AGE: total T + SHBG + estradiol — once-in-lifetime baseline (standard CauseHealth recommendation, regardless of age or symptoms).

   Tests EXPLICITLY NOT on the standard-of-care baseline (only include via triggers (a)/(b)/(c)/(e), never via (d)): Cortisol, AM Cortisol, DHEA-S, Zinc, Free Testosterone, SHBG, Homocysteine, MMA, Free T3, Free T4, Reverse T3, TPO antibodies, thyroglobulin antibodies, NMR lipid, GI-MAP, comprehensive stool, food sensitivity panels, organic acids, hair tissue mineral analysis, micronutrient panels.

   SYMPTOM → TEST MAPPING (trigger (a) — add the relevant test if missing from draw; ONE focused workup per symptom; never functional-medicine extras):
     Fatigue: CBC, Ferritin, Iron Panel, B12+MMA, Vit D, TSH, A1c, AM cortisol if HPA signs; men add T+SHBG
     Joint pain: hs-CRP, Vit D, Uric Acid (RF/anti-CCP only if >6wk inflammatory)
     Can't lose weight: Fasting Insulin+HOMA-IR, A1c, TSH (free T3/T4 if borderline), AM cortisol, T (men)
     Hair loss: Ferritin+Iron Panel, Vit D, TSH+TPO; women add free T+DHEA-S if androgen pattern
     Brain fog: B12+MMA, Vit D, TSH, Ferritin, A1c
     Low mood/depression: Vit D, B12, TSH, AM cortisol; men add T
     Sleep issues: Vit D, Ferritin, AM cortisol, A1c, TSH
     GI (bloating/gas/altered stool): CMP, Albumin, tTG-IgA+Total IgA (celiac)
     Acne: women → T/DHEA-S/Fasting Insulin (PCOS); men → liver + insulin
     Cold/heat intolerance: TSH, free T3, free T4, Ferritin
     Frequent urination/thirst: Fasting Glucose, A1c, BMP
     Palpitations: TSH, CMP, CBC
     Restless legs: Ferritin (>75 target), Iron Panel, B12
     Recurrent infections: Vit D, CBC w/ diff, Total IgA+IgG
     Poor recovery / can't build muscle: men → T+SHBG+Estradiol; Vit D, Ferritin

   For each retest_timeline entry, the why field MUST cite the specific trigger and which letter ("(c) ALT 97 → tracking NAFLD reversal" or "(d) Standard baseline for 28yo male — vitamin D not in this draw"). If you can't cite a trigger letter, drop the test.

   Differential thinking: ask "if this comes back the same/different, does management change?" If no, drop it.

   HEALTHY ASYMPTOMATIC PATIENT EXAMPLE: 28yo male strength training, glucose 94, TSH 2.22, lipids normal, no symptoms. Lab draw has lipid+glucose+TSH+CBC. Standard-of-care baseline gaps: vitamin D, A1c, B12. retest_timeline = those 3 + any Watch markers. NOT cortisol, zinc, free T, homocysteine, full thyroid antibodies, fasting insulin — those are NOT standard-of-care baselines for this patient.

   IMPORTANT — UNIFORMITY WITH CLINICAL PREP: retest_timeline markers MUST match Clinical Prep's tests_to_request. Same rule, same triggers, same trigger letters. The user should see ONE coherent test list across both pages.
   GATE ON RARE STUFF: NEVER mention JAK2, ANA reflex, HLA-B27, multiple myeloma SPEP/UPEP, hereditary hemochromatosis genetics, MTHFR, pituitary MRI, Cushing's 24h cortisol anywhere in the plan unless the patient's markers genuinely meet the gate threshold. Server-side scrubber will strip leftover mentions, but don't generate them in the first place.
9. WRITING STYLE: Write like a knowledgeable friend, not a medical textbook. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Explain the WHY in plain English. Keep the action plan actionable — specific things to do, not vague clinical language.
10. GOAL-DRIVEN BRANCHING (HARD RULE — the plan structure CHANGES based on the user's PRIMARY goal, the FIRST goal listed). The summary MUST open with how the plan ties to the primary goal. Workouts + today_actions + lifestyle_interventions + action_plan phases visibly branch by goal:

    longevity      → 3 zone-2 + 3 strength + 1 mobility/wk; protein 1g/lb; TRE 12-14h, 30g fiber, sauna, cold. Phases: metabolic (1) → strength+VO2max (2) → track (3).
    energy         → light zone-2 weeks 1-4, ramp strength weeks 5-12, no HIIT until baseline. Morning sun, protein breakfast, no screens 1h pre-bed, cool bedroom. Phases: foundation (1) → production (2) → resilience (3).
    weight         → 4 strength + 2-3 zone-2 low-impact; protein every meal, 10-min walk after meals, no liquid calories, TRE 14-16h. Phases: insulin sensitivity (1) → recomp (2) → maintenance (3).
    hormones       → heavy compound strength 3x + zone-2 2x; sleep 8h, sun exposure, zinc/cholesterol-rich meals, BF% 12-18%(M)/18-25%(F), alcohol <3/wk. Phases: foundation (1) → optimize (2) → maintain (3).
    gut_health     → gentle zone-2 + yoga weeks 1-4; chew thoroughly, stop eating 3h pre-bed, food/symptom journal, 30g fiber, fermented foods, low-FODMAP trial if relevant. Phases: triggers (1) → repair (2) → reintroduce (3).
    off_medications → NEVER recommend stopping meds; work WITH the doctor toward reduction. Lifestyle changes for insulin resistance / BP / lipids. Phases: habits (1) → improvement (2) → revisit (3).
    heart_health   → 4 zone-2 + 2 strength + flex; 30g fiber, omega-3 food, 30-min walk, home BP weekly, Mediterranean. Phases: lipid+inflammation (1) → cardio capacity (2) → maintain (3).
    hair_regrowth  → protein at breakfast, scalp massage 5min/day, sleep 8h, iron-rich food; address ferritin <50, full thyroid, stress, no harsh treatments. Phases: nutrition (1) → scalp+cycle (2) → maintain (3).
    autoimmune     → gentle zone-2 + strength, NO overtraining; anti-inflammatory diet, identify triggers, sleep non-negotiable. Phases: lower inflammation (1) → triggers (2) → remission (3).
    pain           → gentle movement, build strength carefully, daily mobility; anti-inflammatory diet, omega-3, magnesium, sleep, stress, weight if relevant.

11. MEALS — REALISTIC PROGRESSION + LIFESTYLE-TAILORED (CRITICAL — adherence beats perfection):

    LIFESTYLE BRANCHING (read LIFESTYLE_CONTEXT in the user message — universal, no condition assumptions):
      WORK_TYPE driver/shift/labor/service: on-the-move, no kitchen at lunch. Gas-station/fast-food/cooler meals in Phase 1. Meal-prep Sundays in Phase 3.
      WORK_TYPE desk/parent_home: kitchen access. Stovetop OK from Phase 1.
      WORK_SCHEDULE nights/rotating: avoid "breakfast at 7am" framing → "first meal of your day". Portable + protein-dense.
      KIDS_AT_HOME 1+: fragmented time. NO >2-burner recipes. Sheet-pan / slow-cooker / instant-pot only after Phase 1. Kid-edible meals (parent isn't cooking two).
      COOKING_TIME under_15: Phase 1 grocery-assembly only (no cooking). Phase 2: 5-15 min stovetop.
      COOKING_TIME 60_plus: real recipes OK from Phase 1.
      TYPICAL_LUNCH fast_food/gas_station: Phase 1 must be chain-order guides for EATS_OUT_AT chains. Real orders, not "make at home".
      TYPICAL_LUNCH packed: cold packable meals (no microwave needed).
      WEEKLY_FOOD_BUDGET under_50: Costco/store-brand only, no salmon/grass-fed. Frozen veg + chicken thighs + rice = $30/wk base.
      WEEKLY_FOOD_BUDGET 50_100: 1-2 fresh-fish meals/wk max from Phase 2+.
      DIET vegan/keto/vegetarian: NEVER suggest meals that break the diet.
      Unknown context: busy/blue-collar default — grocery-basic, fast-food-friendly.

    HEALTHCARE-ACCESS BRANCHING (universal):
      INSURANCE cash/unknown: cheapest-tier tests only (Quest/LabCorp direct-pay, Walmart/Costco). Avoid NMR, advanced lipid, expensive specialty.
      INSURANCE medicaid/medicare: standard PCP-orderable; ICD-10 justification critical.
      HAS_PCP none/rare: mention "find a PCP for retest" in Phase 1 if monitoring needed.
      LAST_PHYSICAL 2yr_plus/never: bias toward "first proper physical" framing — basic CBC + CMP + Lipid + A1c + TSH baseline.

    THE FOOD PLAYBOOK — bar = nutritionist + health-influencer who understands busy adults (not textbook). Adherence beats perfection: jumping straight to "wild salmon + bone broth" collapses by week 2. Build meals as a swap-then-level-up progression.

    BETTER-PATH RULE (CRITICAL): A little mayo is fine. A normal Wawa hoagie isn't a sin. Don't strip enjoyment for marginal gains. The bar is "meaningfully better than what they're eating now" — NOT "what a longevity podcaster would order." If a swap saves 200 cal or doubles protein, THAT'S the win. Pick the ONE swap that matters most and let the rest ride. We're putting people on a better path, not ruining their lives.

    PAIRING RULES (default smart swaps, no over-correction):
      DRINKS THAT PAIR WITH MEALS:
        ✅ ALWAYS OK: water, Diet Coke, Coke Zero, Diet Pepsi, Pepsi Zero, Sprite Zero, Diet Mountain Dew, sparkling water, unsweetened iced tea, black coffee, cold brew (no sugar), Diet Lemonade (Chick-fil-A), Celsius zero-sugar, LMNT/Liquid IV zero-sugar.
        ❌ NEVER suggest WITH a meal: regular soda (Coke, Pepsi, Sprite, Dr Pepper, Mountain Dew, Fanta, Mug Root Beer), sweet tea, sugary lemonade, milkshakes, frappuccinos, energy drinks with sugar, fruit-juice cocktails, chocolate milk except as protein shake.
      SIDES TO AVOID PAIRING (default these out — suggest healthier sides):
        ❌ Fast-food deep-fried fries (McD's fries, BK fries, Wendy's fries, Five Guys fries) — replace with side salad, baked potato, fruit, apple slices, side of black beans.
        ❌ Hash browns at fast-food (especially McD's) — replace with fruit cup OR add an extra protein item.
        ❌ Onion rings, mozzarella sticks, jalapeño poppers, fried pickles.
        ❌ Sugary breakfast pastries (donuts, cinnamon rolls, muffins) as a meal.
      OK IN MODERATION (don't strip these):
        ✅ Frozen sweet potato fries (oven-baked at home with kielbasa, sheet-pan style) — these are real food, just air-fryer them.
        ✅ Kettle chips occasionally with a sandwich (small bag, not the giant one).
        ✅ Pizza night with kids (limit to 2 slices, add a side salad).
        ✅ Bun on the burger / sandwich (the protein doubling is the win, not bun-removal).
      The point: avoid the worst pairings (regular soda + fries together is the universal "bad combo"), but don't make every meal feel like a punishment.

    PLAYBOOK NAMING — every meal must declare a playbook tag. The 12 playbooks are: convenience_store / fast_food / protein_bar_shake / crock_pot / sheet_pan / frozen_aisle / frozen_breakfast / low_cal_drink / mom_friendly / viral_hack / lunchbox_thermos / simple_home_cook. The MEAL_CANDIDATES list (in the user message) is pre-filtered for this user; pick from there and copy each candidate's playbook + phase + when fields verbatim. Don't re-categorize — a hot rotisserie chicken belongs in convenience_store (grab-and-go) or simple_home_cook, NOT frozen_aisle. Content validators will re-tag mismatches automatically.

    PLAN STRUCTURE — PER-PLAYBOOK GENERATION (the "Food Playbook"):

    The user has TOLD YOU which meal patterns they actually use via BREAKFAST_PATTERNS, LUNCH_PATTERNS, DINNER_PATTERNS (multi-select, up to 5 each). Generate 1-2 meals PER PATTERN they listed, not a generic phase progression. So if they said "fast_food + wawa_convenience + packed" for lunch, you give them 1-2 fast-food order ideas, 1-2 Wawa ideas, AND 1-2 packed-cooler ideas — total 3-6 lunch options across their actual lunch reality.

    Each meal entry MUST include:
      - "playbook" field — REQUIRED — ONE of: 'convenience_store' / 'fast_food' / 'protein_bar_shake' / 'crock_pot' / 'sheet_pan' / 'frozen_aisle' / 'frozen_breakfast' / 'low_cal_drink' / 'mom_friendly' / 'viral_hack' / 'lunchbox_thermos' / 'simple_home_cook'. Pick the playbook that best describes the meal's CATEGORY in real life. UI groups by playbook.
      - "phase" field — 1 (start here, easiest), 2 (level up after a few weeks), or 3 (optimal, real recipe). Within each playbook section, phase determines difficulty/ambition. Phase 1 should dominate.
      - "when" field — breakfast / lunch / dinner / snack
      - SPECIFIC brand / SKU / chain name. "Costco rotisserie chicken" beats "rotisserie chicken." "Banza chickpea pasta" beats "high-protein pasta." "Wawa egg white wrap" beats "convenience-store wrap."

    TARGETS PER PLAN — A FULL WEEK+ OF VARIETY (CRITICAL):

    The user does NOT want to regenerate every 3 days because they ran out of options. Generate enough breadth to cover 1-2 weeks of eating without repetition. PEOPLE DO NOT EAT THE SAME THING EVERY DAY.

    PER-PATTERN HARD MINIMUMS (NON-NEGOTIABLE):
      - For EVERY pattern the user listed in BREAKFAST_PATTERNS / LUNCH_PATTERNS / DINNER_PATTERNS, generate AT LEAST 3 meals from that playbook. If they listed 4 lunch patterns, give 12+ lunch meals (3 per pattern).
      - Example: user picked "fast_food + wawa_convenience + gas_station" for lunch → MINIMUM 9 lunch meals (3 fast-food chain orders + 3 Wawa-specific + 3 gas-station/7-Eleven/Sheetz).
      - If breakfast pattern = "skip" → still give 1-2 breakfast options labeled as "for the day you DO eat breakfast" — don't leave empty.

    CHAIN DIVERSITY:
      - If user has 3+ chains in EATS_OUT_AT, fast_food meals MUST cover at least 4 different chains. Don't stack 4 Chipotle ideas — rotate Chick-fil-A, Wendy's, Subway, McDonald's, Panera, Taco Bell, Dunkin, Five Guys, Burger King, Cracker Barrel.
      - HARD CHAIN CAP: maximum 3 meals from any single chain across the WHOLE plan. If candidates show 6 Wawa entries, you pick at most 3. Same rule for Sheetz, Chick-fil-A, 7-Eleven, Costco, Trader Joe's, every chain. If you exceed this you've failed the variety test.

    SLOT TARGETS:
      - 4-6 BREAKFAST options (or 1-2 if pattern is "skip").
      - 8-12 LUNCH options (the most-frequent meal type for most people).
      - 6-9 DINNER options.
      - 3-5 SNACK + DRINK options.
      - **TOTAL: 25-35 MEALS** (bumped from 21-30 to give the weekly spotlight rotation enough headroom across the 12-week journey).

    PHASE COVERAGE FOR WEEKLY PROGRESSION (REQUIRED):
    The /wellness page surfaces a "This Week's Focus" spotlight that rotates meals across weeks 1-12, gradually shifting from convenience (Phase 1) to home cooking (Phase 3). For the rotation to work, every plan MUST include enough variety across phases:
      - AT LEAST 6 Phase-1 meals (easy mode for weeks 1-3 — convenience_store, fast_food, frozen_breakfast, low_cal_drink, protein_bar_shake)
      - AT LEAST 8 Phase-2 meals (level up for weeks 4-6 — lunchbox_thermos, sheet_pan, frozen_aisle, viral_hack, mom_friendly)
      - AT LEAST 6 Phase-3 meals (home cook for weeks 7-12 — simple_home_cook, crock_pot, sheet_pan)
      - DINNER-SPECIFIC FLOOR: AT LEAST 4 Phase-2 dinners AND AT LEAST 4 Phase-3 dinners (sheet-pan, crock-pot, simple-home-cook). Without enough Phase-3 dinners the user has nothing to graduate to in weeks 7-12 — the spotlight becomes stale.
    Copy each candidate's phase tag verbatim from MEAL_CANDIDATES; do NOT invent phases.

    Pattern = "unknown" → default broad mix: 2 fast-food + 2 frozen + 2 convenience-store + 2 lunchbox + 2 protein-bar/shake.

    PATTERN → PLAYBOOK MAPPING (use this when picking which playbook a meal belongs to):
      breakfast: skip→— · fast_food→fast_food · gas_station→convenience_store · coffee_shop→fast_food · frozen_sandwich→frozen_breakfast · eggs_home→simple_home_cook · cereal→simple_home_cook · smoothie→low_cal_drink/viral_hack · protein_bar→protein_bar_shake
      lunch: fast_food→fast_food · gas_station→convenience_store · wawa_convenience→convenience_store · packed→lunchbox_thermos · cafeteria→fast_food · cooler_box→lunchbox_thermos · drive_thru_salad→fast_food · restaurant→simple_home_cook · skip→—
      dinner: cook_scratch→simple_home_cook · crock_pot→crock_pot · sheet_pan→sheet_pan · frozen_meal→frozen_aisle · takeout→fast_food · restaurant→simple_home_cook · kid_friendly→mom_friendly · snack_dinner→viral_hack/protein_bar_shake

    Forbidden generics (auto-scrubbed if generated): "yogurt + berries + nuts", "egg + whole-grain toast", "grilled chicken + rice + broccoli", "salmon + asparagus", "kale salad with chicken", plain "ground turkey chili", any meal without a brand/chain/SKU. The candidate list already filters these out — pick from there.

    PHASE TAG semantics (each meal carries phase 1/2/3 from its candidate):
      - Phase 1: easy swaps, real chain orders, grocery shortcuts, portable snacks. <5 min prep.
      - Phase 2: stock the freezer, level up orders, viral hacks, simple sheet-pan/one-pot. 10-15 min.
      - Phase 3: real recipes, 15-25 min, 6-10 ingredients. Still grocery-store basic.

    The why field is what makes the meal SMART for THIS user. Reference their specific lab or symptom or barrier in plain English. Example: "Cottage cheese protein helps your liver enzyme (97) repair while you sleep. Beats the morning bagel." Beats "Protein supports liver."

12. LIMITED-DATA MODE: If the user has NO lab values uploaded (only symptoms, conditions, medications, goals), still generate a useful plan based on:
    - Diagnosed conditions and known mechanisms
    - Medication-related nutrient depletions (lab-confirmed by virtue of the prescription)
    - User goals (longevity supplements, etc.)
    - Lifestyle interventions tailored to symptoms and goals
    - Recommend baseline lab work as the FIRST item in retest_timeline so the next regeneration can be more precise.
    Do NOT refuse to generate a plan due to missing labs — just frame supplements with clear "evidence" sourcing and recommend testing.` }],
        messages: [{ role: 'user', content: `Create a comprehensive wellness plan addressing ALL lab findings.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
USER'S PRIMARY GOAL (the structural anchor for the plan — branch around this per rule 10): ${userGoals[0] ? (GOAL_LABELS[userGoals[0]] ?? userGoals[0]) : 'understand bloodwork'}
USER'S OTHER GOALS (secondary): ${goalsStr}
MODE: ${isOptimizationMode ? 'optimization' : 'treatment'}
${isOptimizationMode ? `OPTIMIZATION CONTEXT: Patient labs are mostly healthy. Frame the plan around longevity optimization, not disease treatment. Phase names: "Build Foundation (Months 1-2)", "Optimize (Months 3-4)", "Sustain & Track (Months 5-6)". Retest cadence is 6 months, set retest_at: "6 months". Lifestyle interventions focus on longevity science: zone 2 cardio, resistance training, sleep optimization, cold/heat exposure, stress resilience, metabolic health.

CRITICAL — optimization mode does NOT relax the strict triage rule. For healthy patients with limited tested markers, retest_timeline should fill STANDARD-OF-CARE BASELINE GAPS — tests the doctor SHOULD have ordered for someone this age/sex but didn't:
  ALL adults (18+): lipid panel, A1c (every 3yr from 35), TSH at least once, vitamin D at least once, ferritin (esp menstruating women), hs-CRP once for CV risk, B12 once.
  35+: add ApoB and Lp(a) once-in-lifetime.
  45+: add coronary calcium score once.
  50+: add DEXA (women), colorectal screening discussion.
  Women any age: iron panel if menstruating + symptoms.
  Men 35+: total T + SHBG + estradiol once at baseline.

The algorithm: look at what's in the draw → compare to the age/sex baseline → recommend the MISSING ones, cap at 5.
DO NOT add cortisol, zinc, free testosterone, homocysteine, full thyroid antibodies, MMA, etc. UNLESS the patient has a specific symptom or marker that triggers it. Those are NOT standard-of-care baselines for an asymptomatic young adult.` : ''}
DIAGNOSED CONDITIONS (GROUND TRUTH — never substitute these with related conditions; never call UC 'Crohn's' or vice versa; never infer a different diagnosis from medications): ${condStr}
MEDICATIONS: ${medsStr}
CURRENT SUPPLEMENTS (already taking — do NOT re-recommend; account for lab interactions and avoid stacking duplicates): ${suppsStr}
SYMPTOMS (for context only — do NOT supplement based on symptoms alone): ${sympStr}
LIFESTYLE_CONTEXT (drives meals + workout realism — see hard rule 11 below): ${lifestyleStr}

INFERRED_LAB_TARGETS (the meals + supplements should hit these): ${labTargets.join(', ') || 'none flagged'}

MEAL_CANDIDATES — pre-filtered from CauseHealth's curated Food Playbook based on this user's life_context + labs. **Pick 21-30 finalists from THIS list** for the meals[] output (the user wants a full week+ of variety so they don't have to regenerate after 3 days). Use the candidate names verbatim in meals[].name, copy their playbook + phase + when fields, but write a personalized "why" sentence that links each meal to THIS user's specific lab values or symptoms (use plain English: 'liver enzyme' not 'ALT', '3-month blood sugar' not 'A1c'). Aim for BREADTH — span as many of the user's selected meal patterns as possible, ROTATE chains within fast_food (don't pick 4 Chipotle ideas; rotate Wendy's, Chick-fil-A, Subway, McDonald's, Dunkin, etc.), and cover EVERY playbook the user has signal for. If a candidate doesn't fit, skip it; you may invent supplemental meals only when candidates don't cover a slot, but every invented meal must follow the same brand-specific + playbook-tagged rules and will be subject to the same scrubbing rules. Candidates:
${mealCandidatesStr}

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

NUTRIENTS NOT TESTED (do NOT recommend supplements for these — mention in disclaimer only. Do NOT add them to retest_timeline as a 'baseline gap'. The strict triage rule still applies in optimization mode — a missing test only earns a retest_timeline entry if the patient has a symptom, medication depletion, or out-of-range marker that the test would investigate. Healthy patients with no triggers get a SHORT retest list focused on actual labs to track, not a longevity wishlist.):
${notTestedStr}

Return JSON: {"generated_at":"${new Date().toISOString()}","headline":"one 12-word verdict in plain English (e.g. 'Your iron is low — fix it and the fatigue lifts')","summary":"3 short sentences max — what's wrong, what we'll fix, how long it takes","today_actions":[{"emoji":"","action":"one verb-led sentence the user does TODAY (e.g. 'Eat a 3-egg breakfast')","why":"one short sentence","category":"eat|move|take|sleep|stress"}],"supplement_stack":[{"emoji":"💊","nutrient":"","form":"","dose":"","timing":"","why_short":"6-10 word reason in plain English","why":"1 sentence linking to a lab or symptom","practical_note":"REQUIRED — 1 short sentence covering: WHY this timing (absorption / fat-soluble / GABA / circadian), interaction warnings with this user's actual medications, and any 'avoid taking with X' or 'take on empty stomach' caveats. Keep it ONE sentence.","category":"REQUIRED — ONE of: 'sleep_stress' / 'gut_healing' / 'liver_metabolic' / 'inflammation_cardio' / 'nutrient_repletion' / 'condition_therapy'. Pick the supplement's PRIMARY purpose for this patient. Use 'liver_metabolic' for liver enzyme elevation, lipid/cholesterol, blood sugar / insulin resistance, or hepatoprotective supplements (milk thistle, NAC, TUDCA). 'inflammation_cardio' is for heart-rhythm + inflammation markers (omega-3 for ApoB/TG when liver is fine; turmeric for joint inflammation only). When in doubt, the LIVER goes in liver_metabolic.","alternatives":"REQUIRED — array of 1-2 EQUIVALENT alternative options the user can pick instead, formatted as objects {name, form, note}. Examples: Magnesium Glycinate primary -> alternatives: [{name:'Magnesium Threonate', form:'Capsule', note:'Better for cognition + sleep; pricier'}, {name:'Magnesium Citrate', form:'Powder', note:'Cheaper, mild laxative effect'}]. Saccharomyces boulardii primary -> alternatives: [{name:'Visbiome (multi-strain)', form:'Capsule', note:'Most-studied multi-strain UC probiotic; needs refrigeration'}, {name:'VSL#3', form:'Sachets', note:'Higher CFU count; more expensive'}]. Omega-3 primary -> alternatives: [{name:'Algae-based DHA/EPA', form:'Softgel', note:'Vegan option, no fish burps'}, {name:'Liquid fish oil', form:'Liquid', note:'Easier to dose 2-3g; cheaper per gram'}]. Give the user real choice between EQUIVALENT options (different form/source/price/brand) — never alternatives that solve a different problem.","priority":"critical|high|moderate","sourced_from":"lab_finding|disease_mechanism","evidence_note":""}],"meals":[{"emoji":"🥗","name":"meal name (MUST include specific brand/chain/SKU — e.g. 'Costco rotisserie + Uncle Ben’s rice + bagged Caesar')","when":"breakfast|lunch|dinner|snack","phase":1,"playbook":"REQUIRED — ONE of: 'convenience_store' / 'fast_food' / 'protein_bar_shake' / 'crock_pot' / 'sheet_pan' / 'frozen_aisle' / 'frozen_breakfast' / 'low_cal_drink' / 'mom_friendly' / 'viral_hack' / 'lunchbox_thermos' / 'simple_home_cook'","ingredients":["short list with brand names where useful"],"why":"1 sentence — link to user's specific lab or symptom or barrier. Reference labs by plain English (e.g. 'liver enzyme' not 'ALT')."}],"workouts":[{"emoji":"🏃","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","title":"e.g. 'Zone 2 walk'","duration_min":30,"description":"1 sentence","why":"1 sentence — which goal/lab this serves"}],"lifestyle_interventions":{"diet":[{"emoji":"🥗","intervention":"","rationale":"","priority":""}],"sleep":[{"emoji":"😴","intervention":"","rationale":"","priority":""}],"exercise":[{"emoji":"💪","intervention":"","rationale":"","priority":""}],"stress":[{"emoji":"🧘","intervention":"","rationale":"","priority":""}]},"action_plan":{"phase_1":{"name":"Stabilize (Weeks 1-4)","focus":"","actions":[]},"phase_2":{"name":"Optimize (Weeks 5-8)","focus":"","actions":[]},"phase_3":{"name":"Maintain (Weeks 9-12)","focus":"","actions":[]}},"symptoms_addressed":[{"symptom":"","severity":7,"how_addressed":"MAX 30 WORDS. Two short sentences max. 6th-grade reading level. Format: '[plain-English cause]. [What we're doing about it].' Example: 'Mostly your low vitamin D (24) plus iron loss from UC. We added vitamin D, an iron test, and folate. Hair grows slow — give it 12 weeks.' DO NOT list dosages, percentage improvements, mechanisms, or jargon. Just: cause + plan."}],"retest_timeline":[{"marker":"","retest_at":"","why":""}],"disclaimer":"Educational only. Talk to your doctor before changing anything."}

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
      // Truncation-salvage path (mirrors doctor-prep). If max_tokens hit, the
      // JSON ran out mid-string. Trim the trailing partial property and
      // close any open arrays / objects so we still ship a usable plan
      // instead of failing the whole generation.
      if (stopReason === 'max_tokens') {
        try {
          let salvaged = rawText.replace(/,\s*$/, '').replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '');
          // Balance brackets
          const openBraces = (salvaged.match(/\{/g) || []).length - (salvaged.match(/\}/g) || []).length;
          const openBrackets = (salvaged.match(/\[/g) || []).length - (salvaged.match(/\]/g) || []).length;
          for (let i = 0; i < openBrackets; i++) salvaged += ']';
          for (let i = 0; i < openBraces; i++) salvaged += '}';
          plan = JSON.parse(salvaged);
          console.log('[generate-wellness-plan] Salvaged truncated JSON');
        } catch {
          throw new Error('Plan response was truncated and could not be salvaged. Try regenerating — usually succeeds on second attempt.');
        }
      } else {
        throw new Error('Plan JSON parse failed: ' + String(parseErr));
      }
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

    // ── Inference-language scrubber (locked-in chat rule) ──────────────
    // Two layers:
    //   1. Generic inference phrases ("inferred from", "not listed but", etc.)
    //   2. Condition names the user did NOT list — if the user didn't say UC,
    //      the plan cannot mention UC, IBD, Crohn's anywhere. Universal —
    //      builds the forbidden list dynamically from condStr.
    try {
      const INFERENCE_PHRASES = /\b(inferred from|not listed but|likely have|likely autoimmune|appears to have|implied by your meds|your meds suggest|given the medication|based on your medication|suggests you have|must have)\b/i;
      // Build dynamic forbidden-condition list. If the user has UC in their
      // conditions, "UC" is OK. If not, the AI cannot mention UC anywhere.
      const userCondText = (condStr ?? '').toLowerCase();
      const forbiddenConditionPatterns: RegExp[] = [];
      const conditionAliases: { pattern: RegExp; testStr: string }[] = [
        { pattern: /\b(ulcerative colitis|\bUC\b|inflammatory bowel|\bIBD\b)/i, testStr: 'ulcerative colitis|inflammatory bowel|ibd' },
        { pattern: /\b(crohn|crohn's)\b/i, testStr: "crohn" },
        { pattern: /\b(hashimoto|hashimoto's|autoimmune thyroid|thyroiditis)\b/i, testStr: 'hashimoto|autoimmune thyroid|thyroiditis' },
        { pattern: /\b(graves|graves' disease|hyperthyroid)\b/i, testStr: 'graves|hyperthyroid' },
        { pattern: /\b(type 2 diabet|t2d|\bt2dm\b|diabetes mellitus type 2)\b/i, testStr: 'type 2 diabet|t2d' },
        { pattern: /\b(\bPCOS\b|polycystic ovar)\b/i, testStr: 'pcos|polycystic ovar' },
        { pattern: /\b(rheumatoid arthritis|\bRA\b)\b/i, testStr: 'rheumatoid arthritis' },
        { pattern: /\b(lupus|\bSLE\b|systemic lupus)\b/i, testStr: 'lupus|sle' },
        { pattern: /\b(celiac|celiac disease)\b/i, testStr: 'celiac' },
        { pattern: /\b(multiple sclerosis|\bMS\b)\b/i, testStr: 'multiple sclerosis' },
        { pattern: /\b(psoriasis|psoriatic)\b/i, testStr: 'psoriasis|psoriatic' },
        { pattern: /\b(osteoporosis|osteopenia)\b/i, testStr: 'osteoporosis|osteopenia' },
      ];
      for (const c of conditionAliases) {
        // If none of this condition's alias terms appear in the user's listed conditions, forbid the AI from mentioning it
        const userMentioned = c.testStr.split('|').some(term => userCondText.includes(term));
        if (!userMentioned) forbiddenConditionPatterns.push(c.pattern);
      }
      const namesUnstatedCondition = (s: string) => forbiddenConditionPatterns.some(p => p.test(s));
      const STRUCTURAL_KEYS_INF = new Set(['nutrient', 'form', 'icd10', 'medication', 'supplement', 'food', 'movement', 'category', 'priority', 'sourced_from', 'when']);
      const dropInference = (text: string): string => {
        if (typeof text !== 'string' || !text) return text;
        const sentences = text.split(/(?<=[.!?])\s+/);
        const kept = sentences.filter(s => !INFERENCE_PHRASES.test(s) && !namesUnstatedCondition(s));
        return kept.join(' ').trim();
      };
      const walkInf = (val: any, key?: string): any => {
        if (typeof val === 'string') {
          if (key && STRUCTURAL_KEYS_INF.has(key)) return val;
          return dropInference(val);
        }
        if (Array.isArray(val)) return val.map(v => walkInf(v, key));
        if (val && typeof val === 'object') {
          const out: any = {};
          for (const k of Object.keys(val)) out[k] = walkInf(val[k], k);
          return out;
        }
        return val;
      };
      plan = walkInf(plan);
    } catch (e) { console.error('[wellness-plan] inference-scrub error:', e); }

    // ── Jargon scrubber (locked-in rule: 6th-grade everywhere) ──────────
    // Backstop for the AI dropping into clinical-speak even when the prompt
    // forbids it. Replaces medical terms with plain English. Universal —
    // applies to every string in the JSON. Skips structural keys (nutrient
    // names, ICD-10 codes) where the proper name is required.
    try {
      // Order matters: longer/more-specific patterns first.
      const JARGON_MAP: [RegExp, string][] = [
        [/\bcompensatory erythropoiesis\b/gi, 'high red blood cell count'],
        [/\bpolycythemia(?:\s+pattern)?\b/gi, 'high red blood cell count'],
        [/\bhepatic steatosis\b/gi, 'fatty liver'],
        [/\bNAFLD\b/g, 'fatty liver'],
        [/\bMAFLD\b/g, 'fatty liver'],
        [/\bhepatotoxicity\b/gi, 'liver stress from medication'],
        [/\bdrug-induced liver injury\b/gi, 'liver stress from medication'],
        [/\bileal disease\b/gi, 'trouble absorbing nutrients'],
        [/\bmalabsorption\b/gi, 'trouble absorbing nutrients'],
        [/\bhyperuricemia\b/gi, 'high uric acid'],
        [/\bmyopathy\b/gi, 'muscle damage'],
        [/\bcalprotectin\b/gi, 'gut inflammation marker'],
        [/\bcardiovascular risk\b/gi, 'heart risk'],
        [/\bCV risk\b/g, 'heart risk'],
        [/\batherogenic\b/gi, 'plaque-forming'],
        [/\bSTOP-BANG questionnaire\b/gi, 'sleep questionnaire'],
        [/\bSTOP-BANG\b/g, 'sleep questionnaire'],
        [/\bsubclinical\b/gi, 'early-stage'],
        [/\bconstellation (of symptoms|screams)\b/gi, 'pattern of'],
        [/\bnon-invasive\b/gi, 'no needles'],
        [/\bmacrocytic anemia\b/gi, 'low B12'],
        [/\bmicrocytic anemia\b/gi, 'low iron'],
        // Marker abbreviations only when STANDALONE (preserve "ALT 97" style)
        [/\bhs-?CRP\b/g, 'inflammation marker'],
        [/\bC-reactive protein\b/gi, 'inflammation marker'],
      ];
      const STRUCTURAL_KEYS_J = new Set(['nutrient', 'form', 'icd10', 'medication', 'supplement', 'food', 'movement', 'category', 'priority', 'sourced_from', 'when', 'marker', 'test_name']);
      const dropJargon = (text: string): string => {
        if (typeof text !== 'string' || !text) return text;
        let out = text;
        for (const [re, repl] of JARGON_MAP) out = out.replace(re, repl);
        return out;
      };
      const walkJ = (val: any, key?: string): any => {
        if (typeof val === 'string') {
          if (key && STRUCTURAL_KEYS_J.has(key)) return val;
          return dropJargon(val);
        }
        if (Array.isArray(val)) return val.map(v => walkJ(v, key));
        if (val && typeof val === 'object') {
          const out: any = {};
          for (const k of Object.keys(val)) out[k] = walkJ(val[k], k);
          return out;
        }
        return val;
      };
      plan = walkJ(plan);
    } catch (e) { console.error('[wellness-plan] jargon-scrub error:', e); }

    // Tag plan mode for frontend display
    plan.plan_mode = isOptimizationMode ? 'optimization' : 'treatment';

    // Normalize supplement_stack: cap at 7, sort by rank, renumber 1..N.
    // Many users take only top 2-3 — rank ordering must be reliable.
    if (plan.supplement_stack && Array.isArray(plan.supplement_stack)) {
      // Filter supplements with sourced_from = medication_depletion. Default
      // rule is test-first (medications trigger tests, not blind supplementation),
      // but a narrow allow-list permits empirical supplementation where the
      // depletion is universal AND testing is impractical AND the supplement
      // is safe + inexpensive. Currently allowed: CoQ10/ubiquinol (statin
      // patients), B12 (long-term metformin), magnesium glycinate (long-term
      // PPI). Anything else gets dropped.
      const empiricalAllowed = /coq10|ubiquinol|coenzyme\s*q10|^b[\s-]?12|cobalamin|magnesium\s+glycinate/i;
      const beforeFilterCount = plan.supplement_stack.length;
      plan.supplement_stack = plan.supplement_stack.filter((s: any) => {
        const src = (s?.sourced_from ?? '').toLowerCase();
        if (src !== 'medication_depletion' && src !== 'medication-depletion') return true;
        const nutrient = String(s?.nutrient ?? '').trim();
        if (empiricalAllowed.test(nutrient)) {
          // Allowed empirical supplementation — keep
          return true;
        }
        console.log(`[wellness-plan] Dropped medication_depletion supplement "${nutrient}" — not on empirical-allowed list, should be a test recommendation instead`);
        return false;
      });
      if (beforeFilterCount !== plan.supplement_stack.length) {
        console.log(`[wellness-plan] supplement_stack filtered ${beforeFilterCount} -> ${plan.supplement_stack.length}`);
      }

      const priorityRank = (p: string) => p === 'critical' ? 0 : p === 'high' ? 1 : p === 'moderate' ? 2 : 3;
      // Sort first by rank if present, otherwise by priority. Stable sort preserves AI order within ties.
      plan.supplement_stack = [...plan.supplement_stack]
        .sort((a: any, b: any) => {
          const ar = typeof a.rank === 'number' ? a.rank : 999;
          const br = typeof b.rank === 'number' ? b.rank : 999;
          if (ar !== br) return ar - br;
          return priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize');
        })
        .slice(0, 10)
        .map((s: any, i: number) => ({ ...s, rank: i + 1 })); // force 1..N, no gaps or duplicates
    }

    // Validate before saving — never save corrupt/partial plans
    if (!plan.summary && !plan.supplement_stack) {
      return new Response(JSON.stringify({ error: 'Generated plan is incomplete' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!Array.isArray(plan.supplement_stack)) plan.supplement_stack = [];
    if (!Array.isArray(plan.today_actions)) plan.today_actions = [];
    if (!Array.isArray(plan.meals)) plan.meals = [];

    // ── Meal scrubber + playbook content validator (locked-in rule) ──
    // 4 layers:
    //   1. Forbidden generic templates (lazy defaults) — drop outright
    //   2. Brand/chain/SKU specificity gate — meal must name one
    //   3. Playbook content match — frozen_aisle MUST mention frozen,
    //      convenience_store MUST mention Wawa/7-Eleven/etc, crock_pot MUST
    //      mention crock-pot/slow-cooker. Mismatches get re-categorized to
    //      a guess based on content, or dropped if no clean fit.
    try {
      const FORBIDDEN_PATTERNS: RegExp[] = [
        /^\s*\d?\-?egg\s+(scramble|breakfast|with|and)\s+(toast|bread|whole)/i,
        /^\s*greek\s+yogurt\s*\+\s*berries\s*\+\s*(nuts|granola|almonds)/i,
        /^\s*greek\s+yogurt\s+(parfait|with\s+berries\s+and\s+granola)/i,
        /^\s*grilled\s+chicken\s*\+?\s*(rice|brown\s+rice)\s*\+?\s*(broccoli|steamed\s+broccoli)/i,
        /^\s*salmon\s*\+?\s*(sweet\s+potato|asparagus)\s*\+?\s*(broccoli|lemon)/i,
        /^\s*(grilled\s+)?salmon\s*\+\s*asparagus(\s*\+\s*lemon)?\s*$/i,
        /^\s*kale\s+salad\s+(with|\+)\s+grilled\s+chicken/i,
        /^\s*(ground\s+turkey\s+chili|turkey\s+chili)(\s+\(.*?\))?$/i,
        /^\s*chicken\s+breast\s*\+\s*(rice|quinoa)\s*\+\s*(vegetables|broccoli)/i,
      ];
      const SPECIFICITY_KEYWORDS = /\b(costco|kirkland|trader\s*joe|aldi|walmart|target\s+market|whole\s+foods|wawa|7-?eleven|sheetz|cumberland|pilot|love'?s|truck\s*stop|chick-?fil-?a|chipotle|wendy|mcdonald|subway|taco\s+bell|dunkin|starbucks|panera|burger\s+king|cracker\s+barrel|olive\s+garden|five\s+guys|aunt\s+millie|banza|premier\s+protein|quest\s+bar|built\s+bar|barebells|jimmy\s+dean|stouffer|halo\s+top|halo|olipop|poppi|liquid\s+iv|lmnt|cabot|uncle\s+ben|minute\s+rice|rao|dave's\s+killer|ezekiel|sara\s+lee|birds\s+eye|cuties|kerrygold|fage|chobani|oikos|two\s+good|fairlife|bragg'?s|kodiak|aunt\s+jemima|tattooed\s+chef|mama\s+cozzi|owyn|ratio|core\s+power|athletic\s+greens|bloom|nutribullet|crock\s*pot|instant\s*pot|slow\s*cooker|sheet[-\s]?pan|one[-\s]?pan|one[-\s]?skillet|dutch\s+oven|air[-\s]?fryer|babybel|boar'?s\s+head|mission|kettle\s+chips|pyrex|gas\s+station|convenience\s+store|hard[-\s]?boiled\s+egg|jerky|frozen)\b/i;

      // Per-playbook content-match validators. Each playbook key maps to a
      // regex that the meal name+ingredients MUST match. Mismatch = re-categorize
      // (or drop if we can't find a better playbook).
      const PLAYBOOK_VALIDATORS: Record<string, RegExp> = {
        convenience_store: /\b(wawa|7-?eleven|sheetz|cumberland|pilot|love'?s|truck\s*stop|gas\s+station|convenience\s+store|hoagie|big\s+bite|hot[- ]case)\b/i,
        fast_food: /\b(chick-?fil-?a|chipotle|wendy|mcdonald|subway|taco\s+bell|dunkin|starbucks|panera|burger\s+king|cracker\s+barrel|olive\s+garden|five\s+guys|jersey\s+mike|jimmy\s+john|raising\s+cane|kfc|popeyes|arby|sonic|culver|in[- ]n[- ]out|whataburger|drive[- ]thru)\b/i,
        protein_bar_shake: /\b(quest\s+bar|premier\s+protein|kirkland\s+protein|built\s+bar|barebells|fairlife|owyn|ratio|core\s+power|two\s+good|protein\s+bar|protein\s+shake|kirkland\s+bar)\b/i,
        crock_pot: /\b(crock\s*pot|slow\s*cooker|instant\s*pot|pressure\s*cooker|set[- ]and[- ]forget)\b/i,
        sheet_pan: /\b(sheet[-\s]?pan|one[-\s]?pan|one[-\s]?skillet|skillet|dutch\s+oven|air[-\s]?fryer\s+(?!burger)|wok|stir[-\s]?fry)\b/i,
        frozen_aisle: /\b(frozen|freezer|microwaveable|microwave\s+bag|thaw|air[-\s]?fryer|salmon\s+burger|frozen\s+meatball|banza|orange\s+chicken|riced\s+cauliflower|protein\s+pizza|mama\s+cozzi|tattooed\s+chef|stouffer|birds\s+eye)\b/i,
        frozen_breakfast: /\b(jimmy\s+dean|frozen\s+(breakfast|sandwich|burrito|waffle)|eggwich|aunt\s+millie|kodiak|aunt\s+jemima|make[- ]ahead|muffin\s+tin|tattooed\s+chef|kirkland\s+breakfast)\b/i,
        low_cal_drink: /\b(coffee|cold\s+brew|matcha|tea|sparkling|seltzer|olipop|poppi|liquid\s+iv|lmnt|electrolyte|mocktail|shake\s+(blended|in)|protein\s+(iced|coffee|shake)|acv|apple\s+cider\s+vinegar|collagen|greens|athletic\s+greens|bloom|core\s+power|fairlife|drink|smoothie|kombucha)\b/i,
        mom_friendly: /\b(kid|family|together|same\s+plate|mom|mama|kiddo|whole\s+family|toddler|little\s+ones)\b/i,
        viral_hack: /\b(cottage\s+cheese|tiktok|viral|chia\s+pudding|yogurt\s+bark|frozen\s+banana|dense\s+bean|whipped|nutribullet|blender|hack|trend|protein\s+ice\s+cream)\b/i,
        lunchbox_thermos: /\b(thermos|cooler|pyrex|lunchbox|dashboard|portable|cold\s+pack|bento|hot[- ]hold|construction|driver|trucker|shift\s+work)\b/i,
        simple_home_cook: /\b(\d+\s*min|recipe|saute|sear|roast|bake|pan[- ]?fry|stew|fajita|stir[-\s]?fry|bowl|powerful|brown\s+rice|quinoa|salmon|chicken\s+thigh|flank|beef\s+stew|kebab|skillet|skewer)\b/i,
      };

      // Re-classify a meal if its declared playbook doesn't match content.
      // Try each playbook validator and pick the best match.
      const reclassify = (name: string, ingredients: string): string | null => {
        const haystack = `${name} ${ingredients}`;
        for (const [pb, re] of Object.entries(PLAYBOOK_VALIDATORS)) {
          if (re.test(haystack)) return pb;
        }
        return null;
      };

      const before = plan.meals.length;
      plan.meals = plan.meals
        .map((m: any) => {
          const name = String(m?.name ?? '').trim();
          if (!name) return null;
          const ingredients = Array.isArray(m?.ingredients) ? m.ingredients.join(' ') : '';
          const haystack = `${name} ${ingredients}`;
          // 1. Forbidden generic templates → drop
          if (FORBIDDEN_PATTERNS.some(p => p.test(name))) {
            console.log(`[wellness-plan] dropped forbidden meal: ${name}`);
            return null;
          }
          // 2. Brand-specificity gate → drop
          if (!SPECIFICITY_KEYWORDS.test(haystack)) {
            console.log(`[wellness-plan] dropped non-specific meal: ${name}`);
            return null;
          }
          // 3. Playbook content validator → re-classify or drop
          const declaredPlaybook = typeof m?.playbook === 'string' ? m.playbook : null;
          if (declaredPlaybook && PLAYBOOK_VALIDATORS[declaredPlaybook]) {
            const matches = PLAYBOOK_VALIDATORS[declaredPlaybook].test(haystack);
            if (!matches) {
              const guess = reclassify(name, ingredients);
              if (guess) {
                console.log(`[wellness-plan] re-classified meal "${name}" from ${declaredPlaybook} -> ${guess}`);
                return { ...m, playbook: guess };
              } else {
                console.log(`[wellness-plan] dropped playbook-mismatch meal: ${name} (declared: ${declaredPlaybook})`);
                return null;
              }
            }
          } else if (!declaredPlaybook) {
            // No playbook declared → try to assign one
            const guess = reclassify(name, ingredients);
            if (guess) return { ...m, playbook: guess };
          }
          return m;
        })
        .filter((m: any) => m !== null);
      if (plan.meals.length !== before) {
        console.log(`[wellness-plan] meal scrub: ${before} -> ${plan.meals.length}`);
      }
    } catch (e) { console.error('[wellness-plan] meal-scrub error:', e); }

    // ── Meal padder (deterministic, locked-in rule) ────────────────────
    // The AI keeps undershooting the 21-meal target. If we end up below 21,
    // pad from the unused candidates automatically — they were already
    // pre-filtered by the selector for this user's life_context. Padded
    // meals get a varied "why" so the playbook doesn't read like a template.
    try {
      const TARGET_MIN = 21;
      if (Array.isArray(plan.meals) && plan.meals.length < TARGET_MIN && Array.isArray(mealCandidates)) {
        // Build a signature key for each meal that strips trailing "+ drink"
        // additions and punctuation, so "Wawa wrap + black coffee" and
        // "Wawa wrap" dedup to the same entry.
        const sig = (s: string) =>
          String(s)
            .toLowerCase()
            .replace(/\s*\+\s*[^+]+(coffee|tea|water|sparkling|seltzer|diet|coke|sprite|lemonade|celsius|cold brew)[^+]*$/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        const usedSigs = new Set(plan.meals.map((m: any) => sig(m.name)));
        const unused = mealCandidates.filter(c => {
          const candSig = sig(c.name);
          if (usedSigs.has(candSig)) return false;
          return true;
        });

        // Balance across playbooks — group unused candidates by playbook
        // and round-robin pick from each so we don't dump 11 convenience-
        // store entries while frozen-aisle/drink-swaps sit at 1.
        const byPlaybook: Record<string, any[]> = {};
        for (const c of unused) {
          const pb = c.playbook ?? 'other';
          (byPlaybook[pb] ??= []).push(c);
        }
        const playbookKeys = Object.keys(byPlaybook);
        const need = TARGET_MIN - plan.meals.length;
        const picked: any[] = [];
        let pi = 0;
        while (picked.length < need && playbookKeys.some(k => byPlaybook[k].length > 0)) {
          const key = playbookKeys[pi % playbookKeys.length];
          const next = byPlaybook[key].shift();
          if (next) picked.push(next);
          pi++;
        }

        // Vary the "why" copy by what targets the meal hits + its prep style.
        // Beats stamping every padded meal with "Quick win matched to your life".
        const buildWhy = (c: any): string => {
          const t = new Set(c.targets ?? []);
          const prepText = c.prepMinutes === 0 ? 'no prep' : `${c.prepMinutes} min total`;
          const protein = c.protein_g ? `${c.protein_g}g protein` : null;
          // Pick the strongest signal first
          if (t.has('anti_inflammatory') && t.has('high_protein')) return `Anti-inflammatory + ${protein ?? 'high protein'}, ${prepText}.`;
          if (t.has('liver_support')) return `Easy on the liver, ${protein ? protein + ', ' : ''}${prepText}.`;
          if (t.has('low_carb') && protein) return `Steady-energy option — ${protein}, ${prepText}.`;
          if (t.has('high_protein') && protein) return `${protein} for satiety + muscle, ${prepText}.`;
          if (t.has('high_fiber')) return `Gut + cholesterol-friendly fiber, ${prepText}.`;
          if (t.has('hydrating')) return `Hydration win, ${prepText}.`;
          if (protein) return `${protein}, ${prepText} — fits a busy day.`;
          return `Simple add — ${prepText}.`;
        };

        const padded = picked.map(c => ({
          emoji: c.emoji,
          name: c.name,
          when: c.when,
          phase: c.phase,
          playbook: c.playbook,
          ingredients: c.ingredients,
          why: buildWhy(c),
        }));
        if (padded.length > 0) {
          plan.meals.push(...padded);
          console.log(`[wellness-plan] meal padder: AI returned ${plan.meals.length - padded.length}, padded to ${plan.meals.length} (round-robin across ${playbookKeys.length} playbooks)`);
        }
      }
    } catch (e) { console.error('[wellness-plan] meal-padder error:', e); }

    if (!Array.isArray(plan.workouts)) plan.workouts = [];
    if (!plan.headline) plan.headline = '';
    if (!plan.lifestyle_interventions) plan.lifestyle_interventions = { diet: [], sleep: [], exercise: [], stress: [] };
    if (!plan.action_plan) plan.action_plan = { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } };
    if (!Array.isArray(plan.retest_timeline)) plan.retest_timeline = [];
    if (!Array.isArray(plan.symptoms_addressed)) plan.symptoms_addressed = [];

    // ── DETERMINISTIC RETEST INJECTOR ─────────────────────────────────────
    // Mirror of the doctor-prep test injector. Hard-coded backstops for
    // textbook standard-of-care tests the AI sometimes drops:
    //   - hs-CRP (autoimmune disease, joint pain, inflammation tracking)
    //   - CBC with Differential (any abnormal CBC marker)
    // Same logic, same triggers, ensures wellness-plan retest_timeline
    // mirrors doctor-prep tests_to_request for the same patient.
    try {
      const has = (pattern: RegExp) =>
        plan.retest_timeline.some((t: any) =>
          pattern.test(`${t?.marker ?? ''} ${t?.why ?? ''}`)
        );

      // Conditions are sourced ONLY from the user's explicit onboarding input.
      // Never infer a diagnosis from medications — if the user didn't add
      // their condition in Step 2 (Diagnoses), the AI doesn't get to assume.
      const conditionsLower = (condStr ?? '').toLowerCase();
      const symptomsLower = (sympStr ?? '').toLowerCase();
      const labsLower = (allLabsStr ?? '').toLowerCase();

      const hasUC = /\b(ulcerative colitis|crohn|ibd|inflammatory bowel)\b/.test(conditionsLower);
      const hasAutoimmune = hasUC || /\b(hashimoto|graves|lupus|sle|ra|rheumatoid|psoriasis|ms|multiple sclerosis|celiac|t1d|type 1 diabetes)\b/.test(conditionsLower);
      const hasJointPain = /\b(joint pain|joint stiffness|arthralg|stiff)/.test(symptomsLower);
      const hasFatigueOrInflam = /\b(fatigue|tired|exhaust|low energy|brain fog|hair loss|hair thin|joint)/.test(symptomsLower);

      const cbcAbnormal = /\b(rbc|hematocrit|hct|hemoglobin|hgb|wbc|white blood|platelet|mcv|mch|rdw)\b[^\n]*\[(low|high|critical)/i.test(labsLower);

      if ((hasAutoimmune || hasJointPain || hasFatigueOrInflam) && !has(/\b(hs[- ]?crp|c[- ]?reactive protein|inflammation marker)\b/i)) {
        const trigger = hasUC ? 'UC inflammation tracking + CV risk'
          : hasAutoimmune ? 'autoimmune inflammation tracking'
          : 'symptom-driven inflammation marker';
        plan.retest_timeline.push({
          marker: 'High-Sensitivity C-Reactive Protein (hs-CRP)',
          retest_at: '12 weeks',
          why: `(a)/(e) ${trigger} — standard inflammation marker for autoimmune activity and CV risk. Universally covered; routine for UC/IBD monitoring.`,
        });
        console.log('[wellness-plan] Injected hs-CRP retest — missed by AI');
      }

      if (cbcAbnormal && !has(/\bcbc\b|complete blood count|differential/i)) {
        plan.retest_timeline.push({
          marker: 'Complete Blood Count (CBC) with Differential',
          retest_at: '12 weeks',
          why: '(c) Existing draw shows abnormal CBC values — re-measure to confirm trend and rule out hemoconcentration. Routine standard of care.',
        });
        console.log('[wellness-plan] Injected CBC retest — missed by AI');
      }

      // Medication-depletion test injections — these are required tests the AI
      // sometimes drops despite the universal triage rule (b). Documented
      // pharmacology + universal insurance coverage = no excuse to miss them.
      const medsLower = (medsStr ?? '').toLowerCase();
      const onMesalamine = /\b(mesalamine|sulfasalazine|asacol|pentasa|lialda|apriso)\b/.test(medsLower);
      const onMetformin = /\b(metformin|glucophage)\b/.test(medsLower);
      const onPPI = /\b(omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole|prilosec|nexium|protonix)\b/.test(medsLower);
      const onStatin = /\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|pitavastatin|fluvastatin|crestor|lipitor|zocor)\b/.test(medsLower);

      if ((onMesalamine || onMetformin || onPPI) && !has(/\bb[\s-]?12\b|cobalamin|methylmalonic|\bmma\b|homocysteine/i)) {
        const med = onMesalamine ? 'mesalamine' : onMetformin ? 'metformin' : 'PPI';
        plan.retest_timeline.push({
          marker: 'Vitamin B12 Workup (Serum B12 + MMA + Homocysteine)',
          retest_at: '12 weeks',
          why: `(b) On ${med} — known to impair B12 absorption over time. Serum B12 alone misses tissue deficiency; MMA and homocysteine are the sensitive markers. Add to retest, treat if confirmed low.`,
        });
        console.log(`[wellness-plan] Injected B12 workup — ${med} depletion missed by AI`);
      }

      if (onMesalamine && !has(/\bfolate\b|folic\s*acid|methylfolate|5-mthf/i)) {
        plan.retest_timeline.push({
          marker: 'Folate Workup (Serum + RBC Folate)',
          retest_at: '12 weeks',
          why: '(b) Mesalamine + UC inflammation impair folate absorption. Serum folate reflects recent intake; RBC folate reflects 3-month stores (gold standard). Confirm methylfolate dosing is adequate.',
        });
        console.log('[wellness-plan] Injected folate workup — mesalamine depletion missed by AI');
      }

      if (onStatin && /\b(muscle|aches|cramp|weakness|myalg)/.test(symptomsLower) && !has(/creatine kinase|\bck\b|^ck\b/i)) {
        plan.retest_timeline.push({
          marker: 'Creatine Kinase (CK)',
          retest_at: '12 weeks',
          why: '(b) On a statin + reports muscle/aches symptoms — CK rules out statin-induced myopathy/rhabdomyolysis. Standard monitoring; <$15 covered.',
        });
        console.log('[wellness-plan] Injected CK — statin + muscle symptoms missed by AI');
      }

      // Iron panel injection: hair loss + UC/IBD/menstruating women combo
      const hasHairLoss = /\bhair (loss|thin|fall)/.test(symptomsLower);
      const sex = (profile?.sex ?? '').toLowerCase();
      const ageNum = age ?? 99;
      const isMenstruatingFemale = sex === 'female' && ageNum >= 12 && ageNum <= 55;
      if ((hasHairLoss || hasUC || isMenstruatingFemale) && !has(/iron panel|ferritin|tibc|transferrin sat/i)) {
        const trigger = hasHairLoss && hasUC ? 'hair loss + UC malabsorption'
          : hasHairLoss ? 'hair loss'
          : hasUC ? 'UC malabsorption'
          : 'menstruating + symptoms';
        plan.retest_timeline.push({
          marker: 'Iron Panel (Serum Iron, TIBC, Ferritin, Transferrin Saturation)',
          retest_at: '12 weeks',
          why: `(a)/(b) ${trigger} — full iron panel rules out functional iron deficiency that ferritin alone may miss. Standard of care for hair loss workup; $15 covered.`,
        });
        console.log(`[wellness-plan] Injected iron panel — ${trigger} missed by AI`);
      }

      // ── Universal condition-specific injectors ────────────────────────
      // Apply to ANY chronic condition, not just UC. Each fires when the
      // matching diagnosis is in the conditions list. Standard-of-care
      // tests for that condition that the AI sometimes drops.
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

      if (hasIBD && !has(/calprotectin/i)) {
        plan.retest_timeline.push({
          marker: 'Fecal Calprotectin',
          retest_at: '12 weeks',
          why: '(c) IBD disease-activity marker. Standard care for any UC/Crohn\'s patient — gastros order this every 3-6 months. Universally covered.',
        });
      }
      if (hasIBD && !has(/celiac|tissue transglutaminase|tTG/i)) {
        plan.retest_timeline.push({
          marker: 'Celiac Serology (tTG-IgA + Total IgA)',
          retest_at: '12 weeks',
          why: '(d) IBD patients have ~3x higher celiac risk. Standard rule-out at baseline. Covered with K90.0.',
        });
      }
      if ((hasHashimotos || hasGraves) && !has(/free t[34]|tsh|thyroid panel/i)) {
        plan.retest_timeline.push({
          marker: 'Thyroid Panel (TSH + Free T3 + Free T4)',
          retest_at: '12 weeks',
          why: '(c) Diagnosed thyroid disease — track replacement adequacy or hyperthyroid control. Standard quarterly for any thyroid condition.',
        });
      }
      if (hasT2D && !has(/uacr|albumin\/creatinine|microalbumin/i)) {
        plan.retest_timeline.push({
          marker: 'Urine Albumin/Creatinine Ratio (UACR)',
          retest_at: '12 weeks',
          why: '(d) Diabetes/prediabetes — early kidney impact marker. ADA recommends annually; catches kidney damage before serum creatinine moves.',
        });
      }
      if (hasPCOS && !has(/dhea-s|dhea sulfate/i)) {
        plan.retest_timeline.push({
          marker: 'PCOS Hormone Panel (Total T + Free T + DHEA-S + LH:FSH + SHBG + Fasting Insulin)',
          retest_at: '12 weeks',
          why: '(c) Diagnosed PCOS — track androgen + insulin sensitivity response to protocol. Standard quarterly monitoring.',
        });
      }
      if ((hasHTN || hasT2D || hasCAD) && !has(/uacr|microalbumin/i) && !hasT2D) {
        plan.retest_timeline.push({
          marker: 'Urine Albumin/Creatinine Ratio (UACR)',
          retest_at: '12 weeks',
          why: '(d) Hypertension or CV disease — early kidney impact screening. Standard annual care.',
        });
      }
      if (hasCKD && !has(/cystatin/i)) {
        plan.retest_timeline.push({
          marker: 'Cystatin C + eGFR',
          retest_at: '12 weeks',
          why: '(c) Diagnosed CKD — Cystatin C is more sensitive than creatinine for kidney function tracking, especially in muscular patients.',
        });
      }
      if ((hasLupus || hasRA) && !has(/esr/i)) {
        plan.retest_timeline.push({
          marker: 'ESR (Sedimentation Rate)',
          retest_at: '12 weeks',
          why: '(c) Diagnosed lupus/RA — ESR + hs-CRP together track autoimmune disease activity. Standard quarterly.',
        });
      }
      if (hasOsteo && !has(/\bpth\b|parathyroid/i)) {
        plan.retest_timeline.push({
          marker: 'PTH (Parathyroid Hormone) + Ionized Calcium',
          retest_at: '12 weeks',
          why: '(c) Diagnosed osteoporosis/osteopenia — rule out hyperparathyroidism as bone-loss cause. Standard workup.',
        });
      }

      // ── UNIVERSAL TEST PAIRINGS (shared module — same rules in doctor-prep) ──
      const universalTests = buildUniversalTestInjections({
        age,
        sex: profile?.sex ?? null,
        conditionsLower,
        symptomsLower,
        labsLower,
        medsLower,
      });
      for (const u of universalTests) {
        // Skip if this test (or close variant) is already in the list
        const nameRegex = new RegExp(u.name.split('(')[0].trim().split(/\s+/)[0], 'i');
        if (plan.retest_timeline.some((t: any) => nameRegex.test(t?.marker ?? ''))) continue;
        // Push the FULL injected-test structure so doctor-prep can read this
        // verbatim and use it as its tests_to_request without going through
        // its own AI call. Wellness plan is the single source of truth for tests.
        plan.retest_timeline.push({
          marker: u.name,
          retest_at: '12 weeks',
          why: u.whyLong,
          why_short: u.whyShort,
          icd10: u.icd10,
          icd10_description: u.icd10Description,
          priority: u.priority,
          insurance_note: u.insuranceNote,
          emoji: '🧪',
        });
        console.log(`[wellness-plan] Universal-injected: ${u.name}`);
      }

      // Re-cap after all injectors
      // Drop empty / malformed entries before any capping. The AI sometimes
      // emits a placeholder object {marker:"", why:""} that rendered as a
      // blank card (icon + no text) in the UI.
      const beforeFilter = plan.retest_timeline.length;
      plan.retest_timeline = plan.retest_timeline.filter((r: any) => {
        const marker = String(r?.marker ?? '').trim();
        return marker.length > 0;
      });
      if (beforeFilter !== plan.retest_timeline.length) {
        console.log(`[wellness-plan] dropped ${beforeFilter - plan.retest_timeline.length} empty retest entries`);
      }
      if (plan.retest_timeline.length > 20) {
        console.log(`[wellness-plan] post-injector cap: ${plan.retest_timeline.length} -> 20`);
        plan.retest_timeline = plan.retest_timeline.slice(0, 20);
      }
    } catch (e) { console.error('[wellness-plan] retest-injector error:', e); }
    // Differential cap by mode:
    //   Treatment mode (any out-of-range, chronic condition, multi-system) → 20
    //   Optimization mode (mostly healthy) → 10
    // Higher ceiling for treatment lets UC/IBD/Hashimoto's/CKD/etc. patients
    // get the full standard-of-care comprehensive panel. Lower ceiling for
    // healthy patients prevents longevity wishlist drift.
    const isOptMode = plan.plan_mode === 'optimization' || isOptimizationMode;
    const retestCap = isOptMode ? 10 : 20;
    if (plan.retest_timeline.length > retestCap) {
      console.log(`[wellness-plan] capping retest_timeline ${plan.retest_timeline.length} -> ${retestCap} (${isOptMode ? 'optimization' : 'treatment'} mode)`);
      plan.retest_timeline = plan.retest_timeline.slice(0, retestCap);
    }
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
        entry: { emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel', dose: '100-200mg', timing: 'With breakfast (take with fat)', why_short: 'Statins block your body from making CoQ10', why: 'Statins (like atorvastatin) inhibit the same pathway your body uses to make CoQ10 — the energy molecule muscle and heart cells depend on. Replacing it cuts statin-related fatigue and muscle aches.', practical_note: 'Take with the fattiest meal of the day — CoQ10 is fat-soluble and absorption drops 50%+ on an empty stomach. Ubiquinol is the absorbable form (vs. ubiquinone). Safe alongside atorvastatin.', category: 'liver_metabolic', alternatives: [{ name: 'CoQ10 (Ubiquinone)', form: 'Capsule', note: 'Cheaper but ~50% less bioavailable; needs higher dose (200-400mg)' }, { name: 'PQQ + CoQ10 combo', form: 'Capsule', note: 'PQQ supports mitochondrial production; pricier' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple RCTs support 100-200mg ubiquinol daily for statin users.' },
      },
      {
        regex: /\b(metformin|glucophage)\b/i,
        nutrient: 'Vitamin B12',
        matchInStack: /\b(b[\s-]?12|cobalamin|methylcobalamin)\b/i,
        entry: { emoji: '💊', nutrient: 'Vitamin B12 (Methylcobalamin)', form: 'Sublingual', dose: '500-1000mcg', timing: 'Morning, away from food', why_short: 'Metformin blocks B12 absorption over time', why: 'Metformin reduces B12 absorption in the gut. Subclinical B12 deficiency causes fatigue, brain fog, and nerve symptoms before serum levels drop. Methylcobalamin bypasses the absorption block.', practical_note: 'Sublingual (under the tongue) absorbs through cheek tissue — bypasses the metformin blockade in the gut. Take in the morning, away from food and coffee. Energizing for some people, so avoid late evening.', category: 'nutrient_repletion', alternatives: [{ name: 'Adenosylcobalamin (B12)', form: 'Sublingual', note: 'Active mitochondrial form; some prefer for energy' }, { name: 'B12 Liquid drops', form: 'Liquid', note: 'Easier to titrate dose; same absorption' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Studies show 10-30% of long-term metformin users develop B12 deficiency.' },
      },
      {
        regex: /\b(omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole|prilosec|nexium|protonix)\b/i,
        nutrient: 'Vitamin B12 + Magnesium',
        matchInStack: /\b(b[\s-]?12|magnesium)\b/i,
        entry: { emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '200-400mg', timing: 'Evening', why_short: 'PPIs deplete magnesium and B12', why: 'PPIs (like omeprazole) suppress stomach acid, reducing absorption of magnesium, B12, calcium, and iron. Glycinate form is gentle on the gut.', practical_note: 'Bedtime — activates GABA pathways for calming sleep. Take 2hrs apart from any antibiotic (cipro, doxy) and 4hrs apart from levothyroxine if on it. Glycinate form avoids the laxative effect of magnesium oxide/citrate.', category: 'sleep_stress', alternatives: [{ name: 'Magnesium Threonate', form: 'Capsule', note: 'Crosses blood-brain barrier; better for cognition + sleep' }, { name: 'Magnesium Citrate', form: 'Powder', note: 'Cheaper; has mild laxative effect (avoid if loose stools)' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'FDA black-box warning on PPI-induced hypomagnesemia.' },
      },
      // Mesalamine/sulfasalazine → folate testing (TEST-FIRST). The supplement
      // does NOT auto-inject; instead we ensure a folate panel is in
      // retest_timeline (handled by retest-injector below). This satisfies
      // the test-first rule: serum folate + RBC folate are cheap and standard.
      // Universal: applies to ANY 5-ASA user.
      // ALT > 60 OR hepatotoxic medication → Milk Thistle (silymarin) — empirical
      // exception (30+ years safety data, no significant interactions, broad
      // hepatoprotective evidence). Universal across patient profiles.
      {
        regex: /\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|pitavastatin|fluvastatin|methotrexate|isoniazid|valproate|valproic|crestor|lipitor|zocor)\b/i,
        nutrient: 'Milk Thistle',
        matchInStack: /\b(milk\s*thistle|silymarin|silybin)\b/i,
        entry: { emoji: '🌿', nutrient: 'Milk Thistle (Silymarin)', form: 'Capsule (standardized 80% silymarin)', dose: '200-400mg daily', timing: 'With breakfast (with food for absorption)', why_short: 'Liver protection on hepatotoxic meds', why: 'Hepatotoxic medications (statins, methotrexate, isoniazid) stress the liver over time. Silymarin protects hepatocytes and supports detox pathways with 30+ years of safety evidence.', practical_note: 'With breakfast or any meal containing fat. Standardized to 80% silymarin is the studied form. Safe long-term — no significant drug interactions even alongside multiple liver-processed meds. May mildly lower blood sugar; monitor if diabetic.', category: 'liver_metabolic', alternatives: [{ name: 'NAC (N-Acetyl-Cysteine)', form: 'Capsule', note: 'Glutathione precursor; complementary liver support; can stack with milk thistle' }, { name: 'TUDCA', form: 'Capsule', note: 'Bile-acid liver protective; targets bile-flow issues; pricier' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple meta-analyses support silymarin for drug-induced and chronic liver injury.' },
      },
      {
        regex: /\b(prednisone|prednisolone|methylprednisolone|dexamethasone)\b/i,
        nutrient: 'Vitamin D + Calcium',
        matchInStack: /\b(vitamin\s*d|calcium)\b/i,
        entry: { emoji: '💊', nutrient: 'Calcium + Vitamin D3', form: 'Tablet', dose: '500mg Ca + 2000 IU D3', timing: 'With dinner', why_short: 'Steroids leach bone minerals', why: 'Oral corticosteroids reduce calcium absorption and accelerate bone loss. Pairing calcium with D3 maintains bone density during treatment.', practical_note: 'With dinner so the fat helps D3 absorb. CRITICAL: take 4hrs apart from any thyroid medication (levothyroxine) and iron supplement — calcium blocks both. Citrate form absorbs better than carbonate if you have low stomach acid.', priority: 'critical', sourced_from: 'medication_depletion', evidence_note: 'ACR guidelines recommend Ca+D for any patient on >5mg prednisone for >3 months.' },
      },
      {
        regex: /\b(furosemide|lasix|torsemide|bumetanide|hydrochlorothiazide|hctz|chlorthalidone|spironolactone)\b/i,
        nutrient: 'Magnesium',
        matchInStack: /\bmagnesium\b/i,
        entry: { emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '300-400mg', timing: 'Evening', why_short: 'Diuretics flush magnesium out', why: 'Loop and thiazide diuretics increase urinary magnesium loss, often causing subclinical deficiency that worsens fatigue and BP control.', practical_note: 'Bedtime — activates GABA pathways for calming sleep. Take 2hrs apart from antibiotics. Glycinate is gentle on the gut; oxide/citrate forms cause loose stools.', priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Routine supplementation recommended in cardiology guidelines.' },
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

      // ── DISEASE-MECHANISM SUPPLEMENT INJECTOR ──────────────────────────
      // Backstop for the AI dropping evidence-based condition-specific
      // supplements (UC → L-glutamine + S. boulardii + butyrate; Hashimoto's
      // → selenium; T2D → berberine; PCOS → inositol; etc.). Each entry
      // includes practical_note timing + interaction guidance.
      type DiseaseRule = { conditionRegex: RegExp; matchInStack: RegExp; entry: any };
      // Conditions sourced ONLY from explicit onboarding input. No inference
      // from medications — if the user didn't enter their condition in Step 2,
      // the disease-mechanism injector won't fire.
      const conditionsLowerForInjector = (condStr ?? '').toLowerCase();
      const diseaseMechanismRules: DiseaseRule[] = [
        // ── IBD: gut-barrier repair triad ──────────────────────────────
        {
          conditionRegex: /\b(ulcerative colitis|crohn|ibd|inflammatory bowel|indeterminate colitis)\b/i,
          matchInStack: /\bl[\s-]?glutamine\b/i,
          entry: { emoji: '🛡️', nutrient: 'L-Glutamine', form: 'Powder (mix in water)', dose: '5g daily', timing: 'Morning, empty stomach', why_short: 'Gut barrier repair for UC', why: 'L-glutamine is the primary fuel for intestinal cells; well-evidenced for IBD mucosal healing.', practical_note: 'Morning on empty stomach with water — competes with food for absorption. Tasteless powder, easy to dose. Safe long-term; no interactions with mesalamine/ustekinumab.', category: 'gut_healing', alternatives: [{ name: 'L-Glutamine capsules', form: 'Capsule', note: 'Convenient travel/work option; slightly more expensive per gram' }, { name: 'GI Restore powder (glutamine + zinc carnosine + DGL)', form: 'Powder blend', note: 'Combo product; saves on stack count if budget allows' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple clinical trials show benefit in UC mucosal healing.' },
        },
        {
          conditionRegex: /\b(ulcerative colitis|crohn|ibd|inflammatory bowel|indeterminate colitis)\b/i,
          matchInStack: /\bs\.?\s*boulardii|saccharomyces|probiotic|visbiome|vsl/i,
          entry: { emoji: '🦠', nutrient: 'Saccharomyces boulardii (Probiotic)', form: 'Capsule, refrigerated or shelf-stable', dose: '500mg (5 billion CFU) twice daily', timing: 'With breakfast and dinner', why_short: 'Strain-specific UC remission support', why: 'S. boulardii is the most-studied probiotic for IBD remission maintenance; reduces flare frequency.', practical_note: 'With meals — survives stomach acid better. Safe with ustekinumab (yeast-based, not bacteria, so no immunosuppression concern). If on antibiotic, take 2hrs apart. Discontinue if severe immunocompromise (rare).', category: 'gut_healing', alternatives: [{ name: 'Visbiome (multi-strain)', form: 'Capsule, refrigerated', note: 'Most-studied multi-strain UC probiotic; pricier; needs refrigeration' }, { name: 'VSL#3', form: 'Sachets', note: 'Higher CFU count (450 billion); used in clinical UC trials' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs in UC and Crohn\'s remission maintenance.' },
        },
        {
          conditionRegex: /\b(ulcerative colitis|crohn|ibd|inflammatory bowel|indeterminate colitis)\b/i,
          matchInStack: /\bbutyrate|tributyrin\b/i,
          entry: { emoji: '⚡', nutrient: 'Butyrate (Tributyrin SR)', form: 'Capsule (sustained-release)', dose: '500-1000mg twice daily', timing: 'With breakfast and dinner', why_short: 'Colonocyte fuel + barrier repair', why: 'Butyrate is the primary energy source for colon cells; sustained-release form delivers to lower GI where UC inflammation sits.', practical_note: 'With meals — fat aids absorption. Tributyrin SR > sodium butyrate (less odor, better delivery). Safe with all UC meds. May cause mild flatulence first 1-2 weeks.', category: 'gut_healing', alternatives: [{ name: 'Sodium Butyrate', form: 'Capsule', note: 'Cheaper but smelly; less targeted to lower GI' }, { name: 'Calcium-Magnesium Butyrate', form: 'Capsule', note: 'Buffered form; gentler on stomach but lower absorption' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Direct mucosal energy substrate; supported in UC remission protocols.' },
        },
        // ── Hashimoto's: selenium for TPO reduction ─────────────────────
        {
          conditionRegex: /\b(hashimoto|autoimmune thyroid|chronic thyroiditis)\b/i,
          matchInStack: /\bselenium\b/i,
          entry: { emoji: '🦋', nutrient: 'Selenium (Selenomethionine)', form: 'Capsule', dose: '200mcg daily', timing: 'With breakfast', why_short: 'Lowers TPO antibodies in Hashimoto\'s', why: 'Selenomethionine reduces thyroid peroxidase antibodies and supports T4-to-T3 conversion.', practical_note: 'With breakfast — selenomethionine absorbs better than other forms. Do NOT exceed 400mcg/day (toxicity). Safe with levothyroxine.', category: 'condition_therapy', alternatives: [{ name: 'Brazil nuts (1-2 daily)', form: 'Whole food', note: 'Each nut has ~70-100mcg selenium; cheapest option' }, { name: 'Selenium Yeast', form: 'Capsule', note: 'Multiple forms blended; some prefer for absorption' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Meta-analyses show TPO Ab reduction with 200mcg selenium for 3-6 months.' },
        },
        // ── T2D / prediabetes: berberine ────────────────────────────────
        {
          conditionRegex: /\b(type 2 diabet|t2d|t2dm|diabetes mellitus type 2|prediabet|insulin resistance)\b/i,
          matchInStack: /\bberberine\b/i,
          entry: { emoji: '🌿', nutrient: 'Berberine HCl', form: 'Capsule', dose: '500mg three times daily with meals', timing: 'With breakfast, lunch, dinner', why_short: 'Comparable to metformin for glucose control', why: 'Berberine activates AMPK, lowers fasting glucose, A1c, triglycerides, and LDL. Comparable to metformin in head-to-head studies.', practical_note: 'With each meal — short half-life requires 3x/day dosing. Can cause GI upset first 1-2 weeks; start at 500mg once daily and ramp. AVOID with statin if liver enzymes elevated (both processed by liver — discuss with doctor). Pregnancy: do not take.', category: 'condition_therapy', alternatives: [{ name: 'Berberine Phytosome (sustained release)', form: 'Capsule', note: 'Once-daily dosing; 5x more bioavailable; pricier' }, { name: 'Dihydroberberine', form: 'Capsule', note: 'Better absorbed metabolite of berberine; gentler on GI' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs show comparable efficacy to metformin for fasting glucose and A1c.' },
        },
        // ── PCOS: inositol ──────────────────────────────────────────────
        {
          conditionRegex: /\b(pcos|polycystic ovar)\b/i,
          matchInStack: /\binositol\b/i,
          entry: { emoji: '🌸', nutrient: 'Myo-inositol + D-chiro-inositol (40:1 ratio)', form: 'Powder or capsule', dose: '4g myo-inositol + 100mg D-chiro daily, split into 2 doses', timing: 'Morning and evening with meals', why_short: 'PCOS-specific insulin sensitization', why: 'The 40:1 myo:D-chiro ratio mimics the natural ratio in healthy ovarian tissue; restores ovulation and insulin sensitivity in PCOS.', practical_note: 'Split into 2 doses with meals. Effects build over 3 months. Safe in pregnancy (commonly recommended for PCOS-related fertility). No interactions with metformin.', category: 'condition_therapy', alternatives: [{ name: 'Myo-inositol only (4g)', form: 'Powder', note: 'Cheaper; nearly as effective for most PCOS cases' }, { name: 'Ovasitol packets (40:1)', form: 'Single-serve packets', note: 'Pre-measured doses; convenient; pricier per gram' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs for PCOS insulin sensitivity and ovulation.' },
        },
        // ── Osteoporosis: vitamin K2 routing ────────────────────────────
        {
          conditionRegex: /\b(osteoporosis|osteopenia)\b/i,
          matchInStack: /\bvitamin\s*k2|menaquinone|mk-?7/i,
          entry: { emoji: '🦴', nutrient: 'Vitamin K2 (MK-7)', form: 'Softgel', dose: '180mcg daily', timing: 'With dinner (pair with vitamin D + fatty meal)', why_short: 'Routes calcium to bone, away from arteries', why: 'K2 activates osteocalcin (binds calcium to bone) and matrix-Gla protein (prevents arterial calcification). Standard pairing with vitamin D and calcium.', practical_note: 'With dinner alongside vitamin D — fat-soluble. CRITICAL: do NOT take if on warfarin (affects INR; check with doctor). Safe with NOACs (apixaban, rivaroxaban) but inform doctor.', category: 'condition_therapy', alternatives: [{ name: 'Vitamin K2 (MK-4)', form: 'Capsule', note: 'Shorter-acting; usually 3x/day dosing; more research backing for bone' }, { name: 'D3 + K2 combo softgel', form: 'Softgel', note: 'Combines two daily supps into one; saves stack count' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Strong evidence for bone density and arterial calcification reduction.' },
        },
      ];

      for (const rule of diseaseMechanismRules) {
        if (!rule.conditionRegex.test(conditionsLowerForInjector)) continue;
        if (rule.matchInStack.test(stackText)) continue;
        if (rule.matchInStack.test(userSuppNames)) continue;
        plan.supplement_stack.push(rule.entry);
        console.log(`[wellness-plan] Injected disease-mechanism: ${rule.entry.nutrient}`);
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
          entry: { emoji: '⚡', nutrient: 'Methylated B-Complex', form: 'Capsule', dose: '1 capsule', timing: 'Breakfast', why_short: 'Energy production + methylation', why: 'B-vitamins (especially methylfolate, methylcobalamin) drive cellular energy and one-carbon metabolism. The methylated form is more bioavailable.', practical_note: 'Morning with breakfast — energizing, taking late causes insomnia. Bright yellow urine for 24hrs is normal (riboflavin/B2 excretion). Take 2hrs apart from levothyroxine if applicable.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'Standard for energy + cognitive optimization protocols.' },
        },
      ];
      const performanceExtras: GoalStackEntry[] = [
        {
          matchInStack: /\bashwagandha|withania/i,
          entry: { emoji: '🪨', nutrient: 'Ashwagandha (KSM-66)', form: 'Capsule', dose: '600mg', timing: 'Evening', why_short: 'Cortisol, recovery, sleep', why: 'KSM-66 ashwagandha lowers cortisol, improves sleep quality, and supports testosterone in men. Take 8-12 weeks for full effect.', practical_note: 'Evening — lowers cortisol for sleep. AVOID if on thyroid medication or hyperthyroid (can raise T4). Pause 2 weeks before any surgery (mildly affects bleeding). Pregnancy / breastfeeding: do not take.', priority: 'optimize', sourced_from: 'optimization', evidence_note: 'RCTs show 14-22% cortisol reduction and modest T improvements.' },
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
        if (plan.supplement_stack.length >= 5) break;
        if (item.matchInStack.test(stackTextNow())) continue;
        if (item.matchInStack.test(userSuppNames)) continue; // already supplementing
        plan.supplement_stack.push(item.entry);
        console.log(`[wellness-plan] Goal-stack injected ${item.entry.nutrient} for primary goal "${primaryGoal}"`);
      }

      // No legacy slice here — the final 1-per-category dedup below handles
      // the cap. Removing the old slice(0,5) was critical: it sorted by AI-
      // assigned rank (which heavily favored critical-priority lab findings)
      // and cut off disease-mechanism injectors like UC gut-healing
      // (L-glutamine, S. boulardii) that legitimately belonged in the stack.
    }

    // Final dedup: ONE supplement per category. The UI groups by category, so
    // duplicates within a category overwhelm the user (statin patient ended
    // up with 7 supplements; user explicitly asked for 1 per category, the
    // single best one). Sort each category's candidates by priority, keep
    // the top one, drop the rest. Rank field stripped — UI doesn't display it.
    if (Array.isArray(plan.supplement_stack)) {
      const priorityRank = (p: string) => p === 'critical' ? 0 : p === 'high' ? 1 : p === 'moderate' ? 2 : 3;
      const byCategory = new Map<string, any[]>();
      const uncategorized: any[] = [];
      for (const supp of plan.supplement_stack) {
        const cat = supp?.category;
        if (typeof cat === 'string' && cat.length > 0) {
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(supp);
        } else {
          uncategorized.push(supp);
        }
      }
      const winners: any[] = [];
      for (const [cat, candidates] of byCategory) {
        const best = candidates.sort((a, b) => priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize'))[0];
        winners.push(best);
        if (candidates.length > 1) {
          console.log(`[wellness-plan] category=${cat} had ${candidates.length} candidates, kept ${best?.nutrient ?? '?'}`);
        }
      }
      // Uncategorized supplements (AI failure) — keep up to 1 as fallback
      if (uncategorized.length > 0) {
        winners.push(uncategorized.sort((a, b) => priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize'))[0]);
      }
      // Final order: critical first, then high, then moderate. Strip rank field.
      plan.supplement_stack = winners
        .sort((a, b) => priorityRank(a.priority ?? 'optimize') - priorityRank(b.priority ?? 'optimize'))
        .map((s) => { const { rank: _drop, ...rest } = s; return rest; });
      console.log(`[wellness-plan] supplement_stack final size: ${plan.supplement_stack.length}`);
    }

    // Keep old plans for history — don't delete
    await supabase.from('wellness_plans').insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
