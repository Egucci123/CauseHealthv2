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
1. SUPPLEMENT STACK: Maximum 7 supplements. Valid sourced_from values:
   - "lab_finding": specific lab value outside optimal range; why must cite the marker.
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
      // Re-cap and re-rank after injection
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
