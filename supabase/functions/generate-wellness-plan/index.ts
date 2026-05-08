// supabase/functions/generate-wellness-plan/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GOAL_LABELS, formatGoals, goalBranchFor } from '../_shared/goals.ts';
import { buildRareDiseaseBlocklist, extractRareDiseaseContext } from '../_shared/rareDiseaseGate.ts';
import { buildUniversalTestInjections } from '../_shared/testInjectors.ts';
import { hasCondition, detectConditions, conditionTestPanelsFor } from '../_shared/conditionAliases.ts';
import { isOnMed } from '../_shared/medicationAliases.ts';
import { classifyPatient } from '../_shared/patientClassifier.ts';
import { runAdequacyChecks, runSelfSupplementChecks } from '../_shared/replacementTherapyChecks.ts';
import { runPathways } from '../_shared/pathwayEngine.ts';
import { pushRetestByKey, finalizeRetestTimeline, RETEST_REGISTRY } from '../_shared/retestRegistry.ts';
import { detectAlreadyOptimal, applyAlreadyOptimalScrub } from '../_shared/alreadyOptimalFilter.ts';
import { detectTestQualityIssues } from '../_shared/testQualityFlagger.ts';
import { buildCausalChain, renderChainForPrompt } from '../_shared/causalChainBuilder.ts';
import { buildPredictedChanges, renderPredictionsForPrompt } from '../_shared/predictiveOutcomes.ts';
import { synthesizeAcrossSpecialties, renderSynthesisForPrompt } from '../_shared/specialtySynthesizer.ts';
import { buildAudit } from '../_shared/auditLog.ts';
import { detectLabPatterns } from '../_shared/labPatternRegistry.ts';
import { runSuspectedConditionsBackstop } from '../_shared/suspectedConditionsBackstop.ts';
import { detectCriticalFindings } from '../_shared/criticalFindingsBackstop.ts';
import { screenInteractions } from '../_shared/drugInteractionEngine.ts';
import { computeProgressDeltas, renderPriorDrawForPrompt, type ProgressSummary } from '../_shared/longitudinalDelta.ts';
import { attachWhys } from '../_shared/testRationale.ts';
import { buildSupplementLabInteractionBlock, buildDrugInteractionFlags } from '../_shared/supplementLabInteractions.ts';

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

    // ── REGEN CAP: 3 per unique lab dataset (universal) ─────────────────
    // Cap is 3 generations per UNIQUE set of lab values, not per draw_id.
    // Why: a user could otherwise game the cap by deleting their lab draw
    // and re-uploading the identical labs to get a fresh 3.
    //
    // We hash the (sorted) lab values for the current draw, find any prior
    // draws by this user in the last 14 days with the same hash, and sum
    // the wellness_plans across them. If >= 3, block.
    //
    // Different lab values (family member, friend, genuine retest) always
    // produce a different hash → fresh count. Only literal re-upload of
    // identical numbers is caught.
    const draftDrawId = latestDrawRes.data?.id ?? null;
    if (draftDrawId) {
      // Helper: stable hash of lab values for this draw
      const hashLabs = async (drawId: string): Promise<string> => {
        const { data: vals } = await supabase
          .from('lab_values')
          .select('marker_name, value, unit')
          .eq('draw_id', drawId);
        if (!vals?.length) return '';
        // Sort by marker_name, then build canonical string. Round numeric
        // values to 2 decimals to avoid float-noise false negatives.
        const canonical = [...vals]
          .sort((a, b) => String(a.marker_name ?? '').localeCompare(String(b.marker_name ?? '')))
          .map(v => {
            const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
            const rounded = Number.isFinite(num) ? num.toFixed(2) : String(v.value ?? '');
            return `${String(v.marker_name ?? '').trim().toLowerCase()}|${rounded}|${String(v.unit ?? '').trim().toLowerCase()}`;
          })
          .join(';');
        const bytes = new TextEncoder().encode(canonical);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      const currentHash = await hashLabs(draftDrawId);
      const PER_DATASET_CAP = 2;
      let totalPlans = 0;

      if (currentHash) {
        // Find all draws by this user in last 14 days
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentDraws } = await supabase
          .from('lab_draws')
          .select('id, draw_date')
          .eq('user_id', userId)
          .gte('draw_date', fourteenDaysAgo.slice(0, 10));

        // Hash each recent draw and collect ones matching the current hash
        const matchingDrawIds: string[] = [];
        for (const d of recentDraws ?? []) {
          if (d.id === draftDrawId) continue;
          const h = await hashLabs(d.id);
          if (h && h === currentHash) matchingDrawIds.push(d.id);
        }
        matchingDrawIds.push(draftDrawId);

        // Sum plans across all matching draws
        const { count } = await supabase
          .from('wellness_plans')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('draw_id', matchingDrawIds)
          .eq('generation_status', 'complete');
        totalPlans = count ?? 0;
      } else {
        // Fallback: no values yet. Cap by draw_id only.
        const { count } = await supabase
          .from('wellness_plans')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('draw_id', draftDrawId)
          .eq('generation_status', 'complete');
        totalPlans = count ?? 0;
      }

      if (totalPlans >= PER_DATASET_CAP) {
        return new Response(JSON.stringify({
          error: `You've used all ${PER_DATASET_CAP} generations for these lab values. Upload genuinely new labs (different values) to generate a fresh plan.`,
          code: 'REGEN_LIMIT_REACHED',
          limit: PER_DATASET_CAP,
          used: totalPlans,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[wellness-plan] regen check passed: ${totalPlans}/${PER_DATASET_CAP} used for this lab dataset`);
    }

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

    // ── LONGITUDINAL: fetch prior draw + compute progress deltas ─────────
    // Universal: works for any patient, any markers, any condition. When
    // there's no prior draw (first-time user), `progressSummary` stays null
    // and the rest of the pipeline behaves exactly as before. When there
    // IS a prior draw, the AI gets a structured comparison block + the
    // plan persists `progress_summary` for the UI to render the "from /
    // through / to" progress card.
    let progressSummary: ProgressSummary | null = null;
    let priorLabValues: any[] = [];
    let priorDrawId: string | null = null;
    let priorDrawDate: string | null = null;
    if (drawId) {
      // Find the most recent draw for this user that ISN'T the current one.
      // We sort by draw_date desc, then created_at desc as tiebreaker — so
      // two draws on the same day fall back to creation order.
      const { data: allDraws } = await supabase
        .from('lab_draws')
        .select('id, draw_date, created_at')
        .eq('user_id', userId)
        .order('draw_date', { ascending: false })
        .order('created_at', { ascending: false });
      const priorDraw = (allDraws ?? []).find((d: any) => d.id !== drawId);
      if (priorDraw) {
        priorDrawId = priorDraw.id;
        priorDrawDate = priorDraw.draw_date;
        const { data: priorVals } = await supabase
          .from('lab_values')
          .select('marker_name, value, unit, optimal_flag, standard_flag')
          .eq('draw_id', priorDrawId);
        priorLabValues = priorVals ?? [];
        if (priorLabValues.length > 0 && labValues.length > 0) {
          progressSummary = computeProgressDeltas(
            labValues,
            priorLabValues,
            String(priorDrawDate ?? new Date().toISOString().slice(0, 10)),
            String(latestDrawRes.data?.draw_date ?? new Date().toISOString().slice(0, 10)),
          );
          console.log(`[wellness] longitudinal: prior=${priorDrawDate}, ${progressSummary.movements.length} markers compared, ${progressSummary.rollup.improved} improved / ${progressSummary.rollup.worsened} worsened / ${progressSummary.rollup.stable} stable`);
        }
      } else {
        console.log('[wellness] longitudinal: first draw for this user — no prior comparison');
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

    // (Pivot May 2026: removed meal-candidate selection. The plan no longer
    // generates specific meals — it generates a *dietary pattern* the user
    // should follow, plus links out to trusted recipe sites. This drops 360
    // meals worth of curation noise and stops the app from pretending to be
    // a meal planner. See eating_pattern in the JSON output schema.)

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

    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;

    // ── Severity-aware patient classification ─────────────────────────────
    // Replaces the old `isHealthyMode` which counted out-of-range markers as
    // a percentage. Nona Lynn had 4 critical-tier flags out of 81 markers
    // (~5%) and was classified "healthy" — wrong. New rule: ANY critical
    // flag → critical_treatment regardless of percentage. Universal across
    // every condition because we count critical flags + ANY Tier-1 dx.
    const classification = classifyPatient({
      labValues,
      symptoms: symptoms as any,
      conditionsLower: (condStr ?? '').toLowerCase(),
      symptomsLower: (sympStr ?? '').toLowerCase(),
    });
    const isOptimizationMode = classification.isOptimization;
    console.log(`[wellness-plan] mode=${classification.mode} reasons="${classification.reasons.join(' | ')}" flags=${JSON.stringify(classification.flags)}`);

    // ── Replacement-therapy adequacy (universal, data-driven) ─────────────
    // 7 rules covering thyroid replacement, TRT, insulin/sulfonylurea,
    // metformin/SGLT2/GLP1, ACE/ARB, diuretics, statin. Adding a new drug
    // class adequacy check is editing the RULES array — universal coverage
    // for every patient on the matching class.
    const adequacyFlags = runAdequacyChecks({
      medsLower: (medsStr ?? '').toLowerCase(),
      labValues,
      age,
      sex: profile?.sex ?? null,
    });
    const userSuppText = (supps ?? []).map((s: any) => `${s.name ?? ''} ${s.dose ?? ''}`).join(' ');
    adequacyFlags.push(...runSelfSupplementChecks(userSuppText, labValues, age, profile?.sex ?? null));
    console.log(`[wellness-plan] adequacy flags: ${adequacyFlags.map(f => `${f.key}(${f.severity})`).join(', ') || 'none'}`);

    // ── Already-optimal detection (Layer B) ──────────────────────────────
    // Universal: for every marker in OPTIMAL_THRESHOLDS, if user is at goal,
    // suppress related supplements + retests + tell the AI to skip them.
    // The Nona Lynn case: omega-3 index 7.9 → don't recommend omega-3.
    // Same logic applies to vit D, B12, A1c, ferritin, etc. for every user.
    const optimalCtx = {
      age,
      sex: profile?.sex ?? null,
      conditionsLower: (condStr ?? '').toLowerCase(),
    };
    const alreadyOptimal = detectAlreadyOptimal(labValues, optimalCtx);
    console.log(`[wellness-plan] already-optimal: ${alreadyOptimal.optimalKeys.join(', ') || 'none'}`);

    // ── Test-quality flagger (Layer D) ────────────────────────────────────
    // Flag tests that are unreliable for this user's situation. Universal —
    // serum Mg always, ferritin during inflammation, TSH alone on
    // replacement, serum B12 on metformin/PPI/vegetarian, total T without
    // SHBG, creatinine in muscular patients. Adding a row to RULES applies
    // to every patient automatically.
    const inflammationElevated = labValues.some((v: any) => {
      const name = String(v.marker_name ?? '').toLowerCase();
      const flag = (v.optimal_flag ?? '').toLowerCase();
      return /(hs[-\s]?crp|c[-\s]?reactive)/i.test(name) && (flag === 'high' || flag === 'critical_high');
    });
    const qualityFlags = detectTestQualityIssues({
      conditionsLower: (condStr ?? '').toLowerCase(),
      medsLower: (medsStr ?? '').toLowerCase(),
      symptomsLower: (sympStr ?? '').toLowerCase(),
      age,
      sex: profile?.sex ?? null,
      labValues,
      inflammationElevated,
    });
    console.log(`[wellness-plan] test-quality flags: ${qualityFlags.map(f => f.key).join(', ') || 'none'}`);

    // ── Causal chain (Layer A) ────────────────────────────────────────────
    // Universal: declarative graph of root causes → intermediates → outcomes.
    // Walk the graph for THIS patient → produce the layered cascade narrative.
    // Synthesis no specialist would build (Endo sees TSH, Cardio sees LDL,
    // Gyn sees FSH — none see the chain).
    const causalChain = buildCausalChain({
      conditionsLower: (condStr ?? '').toLowerCase(),
      medsLower: (medsStr ?? '').toLowerCase(),
      symptomsLower: (sympStr ?? '').toLowerCase(),
      age,
      sex: profile?.sex ?? null,
      labValues,
      adequacyKeys: adequacyFlags.map(f => f.key),
      sleepHours: (profile?.lifestyle as any)?.sleepHours ?? null,
    });
    console.log(`[wellness-plan] causal chain: ${causalChain.nodes.length} nodes, ${causalChain.edges.length} edges, top=[${causalChain.topInterventions.map(n => n.key).join(',')}]`);

    // ── Predicted outcomes (Layer E) ──────────────────────────────────────
    // Falsifiable forecasts. Computed pre-AI from adequacy flags + causal
    // chain roots so the AI can reference them in the summary. Universal —
    // adding a new effect = pushing one row to EFFECTS in predictiveOutcomes.
    const predictions = buildPredictedChanges({
      adequacyKeys: adequacyFlags.map(f => f.key),
      causalRootKeys: causalChain.topInterventions.map(n => n.key),
      supplementKeys: [],   // pathway engine fills these post-AI; we re-run after for completeness
    });
    console.log(`[wellness-plan] predicted changes: ${predictions.length} markers projected`);

    // ── Cross-specialty synthesis (Layer F) ───────────────────────────────
    // Tag every finding with its specialty silo and surface what no single
    // specialist would catch. Universal — adding a specialty mapping for a
    // new condition is one line.
    const detectedConditionKeys = detectConditions((condStr ?? '').toLowerCase());
    const synthesis = synthesizeAcrossSpecialties({
      adequacyFlags,
      causalChain,
      conditionKeys: detectedConditionKeys,
    });
    console.log(`[wellness-plan] specialty synthesis: ${synthesis.specialtyCount} specialties (${synthesis.specialties.join(',')})`);

    // ── Lab-pattern detection for prompt context ──────────────────────────
    // Forces the AI to explicitly address every detected pattern in the
    // headline + summary + today_actions. Pathway engine separately fires
    // their declared tests + supplements (universal — see labPatternRegistry).
    const detectedLabPatterns = detectLabPatterns(labValues);
    const labPatternsForPrompt = detectedLabPatterns.length > 0
      ? `LAB-VALUE PATTERNS detected — your headline + summary MUST explicitly address each one (the user pays $19 to see what their doctor's "your labs are mostly fine" missed):\n` +
        detectedLabPatterns.map(p => `  - ${p.label} [${p.evidence}]: addressed via ${(p.requiredSupplements ?? []).join(' + ') || 'lifestyle alone'}; track via ${(p.requiredTests ?? []).join(' + ') || 'follow-up panel'}`).join('\n')
      : '';
    console.log(`[wellness-plan] lab patterns: ${detectedLabPatterns.map(p => p.key).join(', ') || 'none'}`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        // 14K — known-good ceiling for wellness plan generation. Previous
        // bump to 24K was unblocking on dense panels but introduced
        // generation failures (Haiku-side request handling), so reverting
        // until we can validate higher caps with synthetic tests. Salvage
        // path still handles truncation if it ever hits.
        model: 'claude-haiku-4-5-20251001', max_tokens: 14000,
        system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: `You are CauseHealth AI. Return ONLY valid JSON.

GLOBAL VOICE RULES (CRITICAL — apply to EVERY string in the JSON):
- 6TH-GRADE READING LEVEL. If your friend who failed high school chemistry can't read it, rewrite.
- BREVITY MANDATORY. HARD CAPS:
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
     3. liver_metabolic    — ALT/AST elevation, lipids, blood sugar / insulin resistance, hepatoprotection (milk thistle, NAC, TUDCA). CoQ10 is NOT liver — it's mitochondrial/cardio.
     4. inflammation_cardio — omega-3 for TG/ApoB, hs-CRP-driven inflammation, joint
     5. nutrient_repletion — confirmed deficiencies (vitamin D 24, ferritin <30, B12 <300)
     6. condition_therapy  — diagnosis-specific evidence-based (PCOS inositol, Hashimoto's selenium IF TPO+, UC L-glutamine)

   "Best one per category" means: highest evidence × highest impact for THIS patient × safest profile. Don't list two "good" supplements for the same category — pick the better one and drop the other.

   Healthy patient with no chronic dx should land at 2-3 supplements total (likely just nutrient_repletion + one empirical exception).

   DO NOT include rank numbers in the displayed stack — the UI groups by category, not by rank.

   Valid sourced_from values:
   - "lab_finding": a SPECIFIC lab value out of standard range OR on the curated Watch list on THIS draw (e.g. ferritin 28, vitamin D 24, hs-CRP 0.8, HbA1c 5.5). Cite the marker and value in why. Healthy values do NOT earn supplements.
   - "disease_mechanism": user has a CONFIRMED diagnosed condition where the supplement has strong evidence as adjunct therapy (UC → curcumin / omega-3 / S. boulardii; Hashimoto's → selenium IF TPO+ confirmed; T2D → berberine; PCOS → inositol IF diagnosis confirmed; TRT → DHEA only if labs warrant). The diagnosis IS the evidence; no lab finding required.
   - "medication_depletion": user is on a drug whose well-documented depletion fires an approved empirical (statin → CoQ10, long-term metformin → B12, long-term PPI → Mg/B12). MUST cite the medication in why. Do NOT use this source if there's no medication.
   - "empirical": symptom pattern + universally-safe supplement + universally-prevalent deficiency + no lab confirmation yet. The supplement is recommended on the strength of the symptom cluster alone (see APPROVED EMPIRICAL list below). Frame in why as "based on your symptom cluster — confirm with lab when convenient" so the user knows this isn't a confirmed deficiency response.
   - "optimization": OFF BY DEFAULT. Only allowed if user's PRIMARY goal is "longevity" AND no out-of-range markers, no symptoms, no medication depletions to address. Even then, max 1-2 entries (omega-3 if dietary intake is low, vitamin D if sub-optimal but in standard range). NOT a longevity stack. NEVER NAD+ / NMN / Resveratrol / Spermidine / methylene blue / speculative anti-aging compounds.

   TEST-FIRST DEFAULT (universal): for any nutrient where the lab test is cheap, standard, and PCP-orderable, recommend the TEST in retest_timeline FIRST. Empirical supplementation is allowed only for the approved exceptions below — do NOT invent additional empirical recommendations outside this list.

   APPROVED EMPIRICAL EXCEPTIONS — MUST-FIRE when triggers met:
   For each rule below, evaluate against this patient. If the trigger is met, the supplement MUST appear in supplement_stack (subject only to the per-category cap). Do not shift an empirical to test-first when the trigger is already met — the rule below decided test-first vs empirical was already adjudicated. Only drop an empirical if (a) a higher-priority same-category supplement also fires (per the priority order: lab_finding > medication_depletion > disease_mechanism > empirical), or (b) the supplement would collide with the user's existing stack at full dose (in which case, note "already at adequate dose" and skip rather than drop a different empirical for it).

   Each rule below:

   ── Medication-driven (sourced_from: medication_depletion) ──
     1. STATIN → CoQ10 (Ubiquinol) 100-200mg/day · category inflammation_cardio (CoQ10 is mitochondrial/cardio, NOT a liver supplement; routes to "Medication Depletions" section at render time via sourced_from)
     2. ALT >60 OR hepatotoxic med (statin/methotrexate/isoniazid/valproate/acetaminophen >3g) → Milk Thistle (Silymarin) 200-400mg/day · category liver_metabolic
     3. Long-term METFORMIN (>5yr) → B12 Methylcobalamin 500-1000mcg sublingual (prefer test-first if recent B12/MMA available) · category nutrient_repletion
     4. Long-term PPI (>2yr) → Magnesium Glycinate 200-400mg evening · category sleep_stress

   ── Lab-pattern-driven (sourced_from: empirical) ──
     5. TG >150 → Omega-3 EPA/DHA 1-2g/day · category inflammation_cardio · sourced_from lab_finding (cite TG value).
        Note: low fish intake / borderline LDL / mild LDL elevation alone do NOT trigger lab_finding for omega-3 — that's a symptom/lifestyle case which goes in #9 below as empirical.
     6. ALT >60 with no other liver clue + no statin → NAC 600-1200mg/day (alt to milk thistle) · category liver_metabolic

   ── Symptom-driven (sourced_from: empirical) — fire only if symptom-cluster threshold met ──
     7. SLEEP COMPLAINT (sleep onset, mid-night waking, sleep difficulty rated 4+/10, OR insomnia in conditions) → Magnesium Glycinate 200-400mg evening · category sleep_stress
     8. ANXIETY OR SLEEP-ONSET DIFFICULTY (anxiety 4+/10, sleep onset >30min, OR mind-racing) AND no SSRI/MAOI/serotonergic med → L-Theanine 100-200mg evening · category sleep_stress (alternative to mag if mag already covered)
     9. JOINT PAIN OR MUSCLE ACHES (joint pain 4+/10 OR muscle pain 4+/10) AND no fish-oil overlap → Omega-3 EPA/DHA 2g/day · category inflammation_cardio
     10. FATIGUE + BRAIN FOG + MOOD CLUSTER (≥3 of: fatigue 4+/10, brain fog 4+/10, depression/low mood 4+/10, poor memory 4+/10) AND no recent B12/folate/D labs in panel → B-Complex (methylated, with B12, folate, B6) 1 capsule/day · category nutrient_repletion · "Symptom cluster fits B-vitamin / methylation insufficiency — empirical based on the pattern; order B12 + MMA + serum folate + 25-OH-D when convenient to confirm and tailor."
     11. UNIVERSAL VITAMIN D EMPIRICAL (sourced_from: empirical) — fire when 25-OH-D NOT in panel AND any of: age 40+, BMI 30+, joint pain 4+/10, mood 4+/10, fatigue 4+/10, autoimmune dx, recurrent infections, dark skin, limited-sun lifestyle (winter / latitude / indoor work). Recommend Vitamin D3 2000-5000 IU/day with food · category nutrient_repletion · "70%+ of US adults are sub-optimal for vitamin D; symptom pattern fits insufficiency. Confirm with 25-OH-D test (target 30-50 ng/mL) — adjust dose when result returns."
     12. ACNE 3+/10 OR RECURRENT INFECTIONS OR HYPOGONADISM RISK (without zinc lab) → Zinc Picolinate 15-25mg/day with food · category nutrient_repletion · "Universal-safety dose under 40mg. Confirm with serum zinc + RBC zinc when convenient." (Skip if user is on copper-balancing IUD or has Wilson's-related labs.)

   STILL TEST-FIRST (cheap test changes the answer): Methylfolate alone (test serum + RBC folate); Berberine (test fasting insulin + HOMA-IR — A1c alone insufficient); Iron (ALWAYS test ferritin/iron/TIBC/sat — risk to heterozygous hemochromatosis carriers); B12 standalone outside the cluster trigger above (add MMA test); Curcumin (interactions); Selenium for Hashimoto's (TPO Ab first); DHEA (always test).

   STACK SIZE: a healthy young patient with multi-symptom complaint typically lands at 3-5 supplements (1-2 sleep_stress, 1 nutrient_repletion B-complex or D3, 1 inflammation_cardio omega-3 if joint/muscle/TG fires, 1 condition_therapy if a dx applies). NEVER more than 5 unless the patient has multiple confirmed lab deficiencies. If the cap forces a choice, prioritize: lab_finding > medication_depletion > disease_mechanism > empirical > optimization.

   ALTERNATIVES — only list TRUE alternatives (different form of same molecule, e.g., Magnesium Glycinate ↔ Magnesium Threonate; Methylcobalamin ↔ Hydroxocobalamin). Do NOT list a different molecule as an alternative (e.g., L-Glycine is NOT an alternative to Magnesium Glycinate). If you can't list a true alternative, leave alternatives as []. Max 2 alternatives per supplement.

   IF the relevant lab IS on this draw AND shows deficiency, sourced_from becomes "lab_finding" with the medication named as the likely cause in why (no double-counting).

   PRACTICAL_NOTE — REQUIRED on every supplement, ONE short sentence combining (1) why this timing/form (absorption/GABA/circadian), (2) any interaction with the user's actual meds (see DRUG-INTERACTION FLAGS in user message for the flags relevant to THIS patient's meds), (3) any avoid-caveat (empty stomach, with calcium, etc.). If timing is generic ("with food"), still note why that form was chosen.
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

   CONDITION-SPECIFIC TESTS — if the user has a diagnosed condition that requires a workup beyond the standard panels, add the relevant condition-specific tests. The user message lists the panels triggered by THIS patient's diagnosed conditions under "CONDITION-SPECIFIC TESTS"; layer those on top of the standard panels, do not replace.

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
10. GOAL-DRIVEN BRANCHING (HARD RULE — the plan structure CHANGES based on the user's PRIMARY goal, the FIRST goal listed). The summary MUST open with how the plan ties to the primary goal. Workouts + today_actions + lifestyle_interventions + action_plan phases must follow the goal-specific tilt provided in the user message under "PRIMARY GOAL TILT".

11. EATING PATTERN — THE DIET, NOT THE MEALS:
    CauseHealth tells the user WHAT KIND of eater to be, not what to cook tonight. We are not a meal planner. Output a single dietary pattern tied to their labs/conditions/goals. The frontend appends a static set of trusted recipe site links so the user finds actual recipes off-platform.

    HEALTHCARE-ACCESS BRANCHING (still relevant for retest cost guidance):
      INSURANCE cash/unknown: cheapest-tier tests only (Quest/LabCorp direct-pay, Walmart/Costco). Avoid NMR, advanced lipid, expensive specialty.
      INSURANCE medicaid/medicare: standard PCP-orderable; ICD-10 justification critical.
      HAS_PCP none/rare: mention "find a PCP for retest" in Phase 1 if monitoring needed.
      LAST_PHYSICAL 2yr_plus/never: bias toward "first proper physical" framing — basic CBC + CMP + Lipid + A1c + TSH baseline.

    EATING_PATTERN OUTPUT — required object with these fields:
      - name: short label of the pattern. Use one of: "Mediterranean (anti-inflammatory)", "Low-glycemic + high-protein", "Anti-inflammatory plant-forward", "DASH (blood-pressure focused)", "Mediterranean + low-FODMAP" (IBS/UC), "TLC (lipid-lowering)", "Whole-food balanced", "Higher-protein lower-carb (insulin resistance)". Pick the ONE that best targets this user's primary lab pattern. Don't invent new names.
      - rationale: 1-2 plain-English sentences linking the pattern to THIS user's specific lab findings. Example: "Your liver enzyme (94) and triglycerides (210) point to insulin resistance. A Mediterranean pattern with lower refined carbs cuts liver fat fastest." 30 words MAX.
      - emphasize: array of 4-6 SHORT food categories to lean into, plain English. Examples: ["fatty fish 2x/week", "leafy greens daily", "olive oil as primary fat", "berries", "lentils + beans", "nuts (small handful)"]. NO brand names. NO recipes.
      - limit: array of 3-5 SHORT categories to cut back, plain English. Examples: ["sugary drinks", "white bread + pastries", "deep-fried foods", "alcohol >3/week", "processed lunch meats"].

    NO meals[] in the output. NO chain orders. NO recipes. NO playbooks. NO phase progression. NO weekly meal spotlight. Frontend handles outbound recipe links separately.

    The user's logged food patterns (BREAKFAST_PATTERNS / LUNCH_PATTERNS / DINNER_PATTERNS) are CONTEXT for tone only — if they said "fast_food + skip breakfast", note that limiting deep-fried items applies to their fast-food orders, but never list specific orders.

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
PRIMARY GOAL TILT (apply this to workouts / today_actions / lifestyle_interventions / action_plan phases): ${goalBranchFor(userGoals[0])}
USER'S OTHER GOALS (secondary): ${goalsStr}
MODE: ${classification.mode} (reasons: ${classification.reasons.join('; ')})
RETEST_CADENCE: ${classification.retestCadence}

${adequacyFlags.length > 0 ? `REPLACEMENT-THERAPY / SELF-SUPPLEMENT ADEQUACY FLAGS — these MUST appear in your headline + summary + today_actions. The user pays $19 for the app to catch what their doctor missed; do not bury these:
${adequacyFlags.map(f => `  - [${f.severity.toUpperCase()}] ${f.title} — ${f.evidence}. ${f.detail}`).join('\n')}
HEADLINE MUST MENTION: ${adequacyFlags.filter(f => f.headlineMustMention).map(f => f.headlineMustMention).join(' AND ') || '(none)'}
TODAY_ACTIONS MUST INCLUDE: ${adequacyFlags.map(f => `"${f.todayAction}"`).filter(Boolean).join(' AND ') || '(none)'}
` : ''}
${alreadyOptimal.promptNotes.length > 0 ? `ALREADY-AT-GOAL FACTS (DO NOT WASTE A SLOT RECOMMENDING SOMETHING THE USER IS ALREADY HITTING):
${alreadyOptimal.promptNotes.map(n => `  - ${n}`).join('\n')}
` : ''}
${qualityFlags.length > 0 ? `TEST-QUALITY CAVEATS — these tests appear "in range" but the test itself is unreliable for THIS patient. Mention each in the summary so the user knows to ask for the better test:
${qualityFlags.map(f => `  - ${f.title} — ${f.detail} (you saw: ${f.evidence})`).join('\n')}
` : ''}
${causalChain.nodes.length > 0 ? renderChainForPrompt(causalChain) + '\n' : ''}
${predictions.length > 0 ? renderPredictionsForPrompt(predictions) + '\n' : ''}
${synthesis.specialtyCount >= 2 ? renderSynthesisForPrompt(synthesis) + '\n' : ''}
${labPatternsForPrompt}
${isOptimizationMode ? `OPTIMIZATION CONTEXT: Patient labs are mostly healthy. Frame around longevity optimization, not disease treatment. Phase names: "Build Foundation (Months 1-2)", "Optimize (Months 3-4)", "Sustain & Track (Months 5-6)". Retest cadence is 6 months (retest_at: "6 months"). Apply the standard-of-care baseline rule + triage rule + exclusions defined in the system prompt — no relaxation, no longevity wishlists. Cap retest_timeline at 5 entries.` : ''}
DIAGNOSED CONDITIONS (GROUND TRUTH — never substitute these with related conditions; never call UC 'Crohn's' or vice versa; never infer a different diagnosis from medications): ${condStr}
${conditionTestPanelsFor(detectedConditionKeys)}MEDICATIONS: ${medsStr}
DRUG-INTERACTION FLAGS (for PRACTICAL_NOTE field on each supplement):${buildDrugInteractionFlags(medsStr) || ' (none triggered for this patient\'s meds)'}
CURRENT SUPPLEMENTS (already taking — do NOT re-recommend; account for lab interactions and avoid stacking duplicates): ${suppsStr}
SYMPTOMS (for context only — do NOT supplement based on symptoms alone): ${sympStr}
LIFESTYLE_CONTEXT (drives meals + workout realism — see hard rule 11 below): ${lifestyleStr}

${buildSupplementLabInteractionBlock(suppsStr)}

${renderPriorDrawForPrompt(progressSummary)}

ALL LAB VALUES:
${allLabsStr.slice(0, 10000)}

NUTRIENTS NOT TESTED (do NOT recommend supplements for these — mention in disclaimer only. Do NOT add them to retest_timeline as a 'baseline gap'. The strict triage rule still applies in optimization mode — a missing test only earns a retest_timeline entry if the patient has a symptom, medication depletion, or out-of-range marker that the test would investigate. Healthy patients with no triggers get a SHORT retest list focused on actual labs to track, not a longevity wishlist.):
${notTestedStr}

Return JSON: {"generated_at":"${new Date().toISOString()}","headline":"HARD CAP 9 words / 60 characters. Plain English verdict, NEVER more than 9 words. Renders on a phone hero card — long sentences blow up the card. Examples: 'Your iron is low — fatigue will lift.' (8 words) / 'Sleep first — labs will follow.' (6) / 'Hashimoto's hides behind your TSH.' (5)","summary":"3 short sentences max — what's wrong, what we'll fix, how long it takes","today_actions":[{"emoji":"","action":"one verb-led sentence the user does TODAY (e.g. 'Eat a 3-egg breakfast')","why":"one short sentence","category":"eat|move|take|sleep|stress"}],"supplement_stack":[{"emoji":"💊","nutrient":"","form":"","dose":"","timing":"","why_short":"6-10 word reason in plain English","why":"1 sentence linking to a lab or symptom","practical_note":"REQUIRED — 1 short sentence covering: WHY this timing (absorption / fat-soluble / GABA / circadian), interaction warnings with this user's actual medications, and any 'avoid taking with X' or 'take on empty stomach' caveats. Keep it ONE sentence.","category":"REQUIRED — ONE of: 'sleep_stress' / 'gut_healing' / 'liver_metabolic' / 'inflammation_cardio' / 'nutrient_repletion' / 'condition_therapy'. Pick the supplement's PRIMARY purpose for this patient.","alternatives":"REQUIRED — array of 1-2 EQUIVALENT alternative options the user can pick instead, formatted as objects {name, form, note}.","priority":"critical|high|moderate","sourced_from":"lab_finding|disease_mechanism","evidence_note":""}],"eating_pattern":{"name":"ONE of the approved pattern names","rationale":"1-2 plain-English sentences linking this pattern to THIS user's labs (max 30 words)","emphasize":["4-6 short food categories to lean into, no brands"],"limit":["3-5 short categories to cut back, no brands"]},"workouts":[{"emoji":"🏃","day":"Mon|Tue|Wed|Thu|Fri|Sat|Sun","title":"e.g. 'Zone 2 walk'","duration_min":30,"description":"1 sentence","why":"1 sentence — which goal/lab this serves"}],"lifestyle_interventions":{"diet":[{"emoji":"🥗","intervention":"","rationale":"","priority":""}],"sleep":[{"emoji":"😴","intervention":"","rationale":"","priority":""}],"exercise":[{"emoji":"💪","intervention":"","rationale":"","priority":""}],"stress":[{"emoji":"🧘","intervention":"","rationale":"","priority":""}]},"action_plan":{"phase_1":{"name":"Stabilize (Weeks 1-4)","focus":"","actions":[]},"phase_2":{"name":"Optimize (Weeks 5-8)","focus":"","actions":[]},"phase_3":{"name":"Maintain (Weeks 9-12)","focus":"","actions":[]}},"symptoms_addressed":[{"symptom":"","severity":7,"how_addressed":"MAX 30 WORDS. Two short sentences max. 6th-grade reading level. Format: '[plain-English cause]. [What we're doing about it].'"}],"retest_timeline":[{"marker":"","retest_at":"","why":"","specialist":"pcp|gi|hepatology|cardiology|endocrinology|sleep_medicine|rheumatology|nephrology|hematology|functional|imaging|mental_health"}],"suspected_conditions":[{"name":"plain-English condition name","category":"endocrine|cardiovascular|hematology|gi|kidney|autoimmune|reproductive|neuro|musculoskeletal|metabolic|respiratory|mental_health|infectious|oncology|nutritional|other","confidence":"high|moderate|low","evidence":"1 sentence citing the SPECIFIC labs / symptoms / meds / demographics that fit the pattern","confirmatory_tests":["array of plain-English tests"],"icd10":"primary ICD-10 code","what_to_ask_doctor":"1 short sentence the user can read aloud"}],"multi_marker_patterns":[{"name":"plain-English pattern name (e.g. 'Atherogenic dyslipidemia pattern', 'Iron deficiency hidden by inflammation', 'Macrocytic anemia signature', 'Methylation impairment')","category":"endocrine|cardiovascular|hematology|gi|kidney|autoimmune|reproductive|neuro|musculoskeletal|metabolic|respiratory|mental_health|infectious|oncology|nutritional|other","evidence":"1 sentence citing the EXACT marker values that comprise the pattern","clinical_significance":"1 sentence on what this pattern means for THIS patient's health","confirmatory_action":"the next step — usually a specific test or rule-out workup"}],"medication_depletions":[{"medication":"the specific drug from the patient's medication list","nutrient_depleted":"vitamin/mineral/cofactor depleted","mechanism":"1-sentence pharmacology — why this drug depletes this nutrient","symptoms_to_watch":"comma-separated symptoms patient should watch for, drawn from THEIR reported symptoms when applicable","intervention":"the supplement OR test-first decision (per APPROVED EMPIRICAL EXCEPTIONS rule)","retest_marker":"the lab marker that confirms the depletion (added to retest_timeline)"}],"critical_findings_ai":[{"finding":"the urgent-action finding","severity":"critical|high","why_urgent":"1 sentence — why this needs action this week","action":"specific action the user should take this week (e.g. 'Email PCP today about ALT 187')"}],"predicted_changes_ai":[{"intervention":"the change you're recommending","marker":"specific lab marker expected to move","direction":"up|down","magnitude":"approximate change with units (e.g. '-0.4 mg/L', '-15 mg/dL', '+0.3 ng/mL')","timeframe_weeks":12,"confidence":"high|moderate|low","evidence":"1 sentence with effect-size citation if known"}],"already_at_goal_ai":[{"marker":"the marker name","value":"observed value with units","optimal_target":"why we consider this at-goal (the range)","note":"1 sentence — what we're NOT recommending because of this"}],"test_quality_caveats_ai":[{"marker":"the test/marker that's unreliable here","why_unreliable":"1 sentence on why this test fails for THIS patient","better_test":"the test that would actually answer the question"}],"disclaimer":"Educational only. Talk to your doctor before changing anything."}

CRITICAL OUTPUT RULES:
- today_actions: EXACTLY 3 items — the most important things this user can do TODAY. Mix categories (one eat, one move, one take is ideal).
- eating_pattern: ONE pattern object (NOT an array). Pick the single best dietary pattern for this user's labs.
- workouts: 3-5 workouts spanning a week, tailored to user's goals (longevity → zone 2 + lift, weight → resistance + walk, energy → easy cardio + sleep).

RETEST_TIMELINE ROUTING — UNIVERSAL RULE: default everything to "pcp" UNLESS one of the criteria below applies. A good PCP can order nearly every blood test we recommend (ApoB, Lp(a), Free T3, Reverse T3, MMA, RBC magnesium, AM cortisol, hormone panels, autoimmune workup) when given the right ICD-10 — we provide that. Sending users to 12 specialists creates copay sticker shock and isn't how patients use the system.

ONLY route OUT of "pcp" for:
  - "imaging"       : non-blood studies that need separate orders — liver ultrasound, FibroScan, CAC score, sleep study (HSAT/polysomnography), DEXA, mammogram, EKG, abdominal US, pelvic US
  - "functional"    : tests genuinely hard to get covered even with good ICD-10 — DUTCH cortisol panel, organic acids, comprehensive stool analysis, food sensitivity (IgG4) panels
  - "mental_health" : PHQ-9, GAD-7 screening tools
  - "gi"            : tests that fold into an EXISTING gastroenterology follow-up (no extra copay since patient is already being seen). UNIVERSAL TRIGGER: patient has GI dx (UC / Crohn's / IBS / celiac / chronic IBD) on conditions list → route fecal calprotectin, celiac serology, AND any test that is a direct workup of that dx (iron panel for IBD blood loss; folate/B12 for IBD malabsorption) to "gi". For non-GI patients, those tests stay in "pcp".

UNIVERSAL CONDITION-FOLLOW-UP RULE: For ANY chronic condition on the patient's diagnosed list, if a test directly monitors or workups that condition AND the patient is being followed by that specialty, route to the existing specialty visit (no extra copay). Examples:
  - GI dx + nutritional/inflammation tests → "gi"
  - Cardiac dx + advanced lipid/cardiac markers → still "pcp" (PCP orders most lipid markers; cardiology is for procedural/imaging)
  - Endocrine dx (diabetes, thyroid disorder) + monitoring tests → "pcp" (endocrinologist not in routine cycle)

Everything else → "pcp". Trust the PCP. The insurance_note tells the user how to advocate if the PCP pushes back — escalate doesn't mean "go to specialist," it means "ask harder with this code."

REASONING MODE — open-ended, first-principles, like a sharp internist with time:
Deterministic engines fire as a backstop for high-prevalence cases. YOUR job is the long tail they don't catch. Reason from the data picture, not from a checklist. Cover every body system implicitly — endocrine, cardio, GI, hepatic, renal, heme, autoimmune, MSK, repro, neuro, respiratory, infectious, oncology rule-outs, nutritional. Don't constrain yourself.

For EACH of these arrays, fill in OPEN-ENDED. Empty array if nothing fits. No padding.
  • multi_marker_patterns — every multi-marker cluster you see (atherogenic, IR, IDA-masked-by-inflammation, hemochromatosis, macro/microcytic, myeloproliferative, OSA signature, methylation, AST>ALT+GGT, etc. — but ALSO anything else the data shows)
  • medication_depletions — every drug → every nutrient depletion + reported symptom of that deficiency. Not constrained to the 35-drug registry
  • critical_findings_ai — any urgent (this-week) finding worth headlining
  • predicted_changes_ai — for each intervention, predicted lab change at retest with confidence + (if known) effect-size cite
  • already_at_goal_ai — every marker already optimal, so we don't waste recommendations
  • test_quality_caveats_ai — any test unreliable for THIS patient's situation (acute illness, biotin, timing, etc.)
  • suspected_conditions — TRUE DIFFERENTIAL DIAGNOSIS (hidden conditions only). The most-valuable section of the plan. List ONLY hidden conditions the patient DOES NOT know they have. STRICT QUALITY BAR:

    HARD EXCLUSIONS — DO NOT include these (they belong in OTHER fields):
    1. CONFIRMED LAB FINDINGS — "Vitamin D deficiency" when D=24 ng/mL is measured. Already in lab summary + we recommend D3. NOT a hidden condition.
    2. CONFIRMED LIPID PATTERNS — "Atherogenic dyslipidemia" when LDL+TG are already shown out-of-range on the lipid panel. The lipid panel IS the finding. Don't restate it as a "possible condition."
    3. DRUG DEPLETIONS — "Mesalamine-induced folate/B12 deficiency." That's medication_depletions[]. Not a differential.
    4. EXISTING DIAGNOSES — "Active UC" when UC is already on conditions list. That's monitoring an existing dx, not a differential. Skip it.
    5. DUPLICATES — If two entries share the same root finding (polycythemia + sleep apnea both citing Hct), pick the upstream one. Polycythemia secondary to sleep apnea = ONE entry: sleep apnea, with "+ secondary polycythemia" in the evidence.
    6. CONTRADICTIONS — Gilbert with elevated ALT (Gilbert needs normal LFTs). Hypothyroid with TSH 1.93 (dead-center optimal). Check evidence supports entry.
    7. "TEST WASN'T DONE" ENTRIES — That's a retest_timeline reason, not a differential.
    8. SELF-REPORTED BEHAVIORS — sleep deprivation, alcohol use, smoking, lack of exercise, dietary patterns, stress. These are USER-REPORTED behaviors, not hidden conditions for the doctor to investigate. Talk about them in summary / today_actions / lifestyle_interventions instead. The differential list is for HIDDEN clinical conditions only — things the doctor needs to test FOR, not behaviors the user is already aware of.

    HARD INCLUSIONS — these ARE proper differentials:
    - Hidden conditions where the data fits but the diagnosis is missing (NAFLD on hepatic+metabolic pattern; insulin resistance despite normal A1c; sleep apnea on polycythemia+symptoms; hemochromatosis if iron pattern fits; PCOS on hyperandrogenism; subclinical Hashimoto's if TPO+ or TSH>2.5; FH if LDL>190 family hx; multiple myeloma rule-out if unexplained globulin + age 60+; statin-induced myopathy on CK + symptoms; Cushing's on hyperandrogenism + cortisol clues)

    CAP AT 5 — better 5 strong unknowns than 10 mixed quality. If you have more than 5 candidates, drop the weakest. The doctor reads 4-5 and engages; reads 10 and dismisses.

    INTENSITY CALIBRATION — the user reads this list and gets either "informed" or "alarmed":
    1. SIMPLER EXPLANATION FIRST — if a borderline finding has a benign / mechanical / lifestyle explanation (dehydration, recent exercise, supplement artifact, OTC med, lab timing, normal stress response), THAT is the primary differential. Disease entries are rule-outs only after the simpler explanation has been excluded. Example: Hgb 17.3 + albumin 5.2 + creatinine 1.25 in a 28yo who exercises = hemoconcentration FIRST; absolute erythrocytosis only if hydration trial fails.
    2. NO PARALLEL PILE-ON — if one root-cause hypothesis (sleep deprivation, hemoconcentration, insulin resistance, hypothyroidism) plausibly explains the entire symptom + lab picture, do NOT also list 2-3 alternative root causes for the same picture. List the strongest single hypothesis with its rule-outs in confirmatory_tests. The user shouldn't read 4 different "what's wrong with me" theories.
    3. DOWNSTREAM EFFECTS ARE NOT SEPARATE CONDITIONS — if "Sleep apnea" causes "secondary erythrocytosis" causes "elevated MPV", that's ONE entry (sleep apnea) with the cascade described in evidence. Not three.
    4. CONFIDENCE TIER — High confidence requires (a) multiple confirming markers AND (b) symptoms that fit AND (c) no simpler explanation. A borderline single marker in a young healthy patient is moderate or low — never high. Calling something "high confidence" without those three is overcalling.
    5. TONE — "rule-out", "consider", "screen for" — never "you have", "you're at risk for", or imply a diagnosis. The user is the patient, not the doctor; the framing should be "things worth your doctor's time" not "things you should worry about tonight".

For each suspected_condition: confidence (high/moderate/low), 1-sentence evidence string citing SPECIFIC values + symptoms, confirmatory_tests (what the doctor should order to confirm), primary ICD-10, what_to_ask_doctor (the literal sentence to say at the visit).

UNIVERSAL RULE — every confirmatory_test MUST include WHY the test matters:
For each test in confirmatory_tests, attach a "why" field (1-2 sentences) answering: what does this test ADD beyond what the current bloodwork shows? The user is rightly skeptical — if their existing labs already strongly suggest the condition, they want to know why another test is needed. Cover ONE OR MORE of these reasons explicitly:
  (a) QUANTIFICATION — gives a real number for severity (e.g., "HOMA-IR puts a number on how severe the IR is — guides intervention intensity from diet alone vs. metformin vs. GLP-1")
  (b) STAGING — distinguishes early vs late-stage of the same condition (e.g., "fasting insulin distinguishes compensated IR (high insulin, normal glucose, pancreas winning) from late-stage IR (insulin dropping while glucose creeps up — pancreas failing). Same A1c, completely different urgency.")
  (c) TREATMENT-UNLOCK — the number is what insurance/the doctor needs to actually prescribe a treatment (e.g., "HOMA-IR > 2.5 documented in the chart is what gets metformin or GLP-1 covered. Without it, the diagnosis is hand-wavy.")
  (d) TRACKING BASELINE — measures intervention response faster than existing labs (e.g., "fasting insulin moves in 4-6 weeks; A1c lags 3 months. Without a starting number you can't measure if your intervention is working.")
  (e) DIFFERENTIAL — distinguishes the suspected condition from a near-mimic (e.g., "anti-TPO distinguishes Hashimoto's from non-autoimmune subclinical hypothyroidism — same TSH, completely different long-term trajectory and treatment.")
  (f) SAFETY — rules out a more dangerous mimic (e.g., "free T4 + TSH together rules out central hypothyroidism (pituitary problem) which TSH alone misses.")

Each "why" must be SPECIFIC to this patient's data, not generic. Don't say "to confirm" — explain what changes.

Schema for confirmatory_tests:
  [{ "test": "Fasting insulin", "why": "Quantifies IR via HOMA-IR (insulin × glucose / 405). Your TG/HDL ratio of 8 already screams IR, but HOMA-IR gives a real number that decides whether diet alone is enough or you need metformin. Also distinguishes compensated IR (your pancreas working overtime) from β-cell burnout starting." }, ...]

CRITICAL FORMAT RULES for confirmatory_tests (these have produced bugs in the past — get them right):
  1. The "test" field MUST be the literal test name as it appears on a lab order — e.g., "Fasting insulin", "TPO Antibodies", "ApoB", "Home Sleep Apnea Test (HSAT)". NEVER leave it empty. NEVER bury the test name inside the "why" field with an empty "test". If you don't have a specific test to recommend, drop the entry entirely.
  2. The "why" field is the rationale ONLY — it does NOT need to repeat the test name. Start with the reason ("Quantifies…", "Distinguishes…", "Rules out…").
  3. Every entry must be a {test, why} object — never a bare string.

UNIVERSAL RULE — NEVER assert values for tests you weren't given:
If a marker isn't in the patient's lab panel, you do NOT know its value. Do NOT write things like "hsCRP is likely elevated" or "ferritin is probably <30" or "inflammation marker likely high" as if you measured them. The patient will read these as actual results. Frame untested markers ONLY as predictions or recommendations:
  ✅ ALLOWED: "predicted hsCRP elevation pending test", "ferritin not in panel — order to confirm", "we expect cortisol to normalize once sleep extends"
  ❌ FORBIDDEN: "hsCRP likely elevated", "ferritin probably low", "inflammation marker is high", "your cortisol is flattened"
This rule applies to EVERY field — multi_marker_patterns evidence, today_actions why, supplement_stack evidence_note, suspected_conditions evidence, summary, headline. Untested = predicted, never asserted.

CALIBRATION (applies to ALL arrays): Healthy patient with clean labs → 0-2 entries each. Multi-issue patient → 4-7 well-evidenced entries (NOT 13 weakly-evidenced). Don't pad, don't skip. Better than a doctor = catching what 12 minutes can't see, with the evidence to back it up.` }],
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

    // (plan.plan_mode is set after the post-flight adequacy block below
    // using the severity-aware classifier — replaces the old binary mode.)

    // Normalize supplement_stack: cap at 7, sort by rank, renumber 1..N.
    // Many users take only top 2-3 — rank ordering must be reliable.
    if (plan.supplement_stack && Array.isArray(plan.supplement_stack)) {
      // Filter supplements with sourced_from = medication_depletion. Default
      // rule is test-first (medications trigger tests, not blind supplementation),
      // but a narrow allow-list permits empirical supplementation where the
      // depletion is universal AND testing is impractical AND the supplement
      // is safe + inexpensive AND has a clear evidence base for the specific
      // medication.
      //
      // Allowed empirical supplementation:
      //   - CoQ10/ubiquinol — statin patients (statins block CoQ10 synthesis)
      //   - B12 — long-term metformin / PPI patients (impaired absorption)
      //   - Magnesium Glycinate — PPI / diuretic / steroid patients (renal wasting)
      //   - Milk Thistle (silymarin) — statin / hepatotoxic-med patients
      //     (30+ years safety data; protective on hepatocytes; no major interactions)
      //   - Calcium + D3 — steroid patients (ACR guidelines mandate this for
      //     anyone on >5mg prednisone for >3 months — NOT optional, it's standard of care)
      //   - Vitamin D3 — steroid patients (steroid-induced D deficiency,
      //     same ACR guidelines)
      const empiricalAllowed = /coq10|ubiquinol|coenzyme\s*q10|^b[\s-]?12|cobalamin|magnesium\s+glycinate|milk\s*thistle|silymarin|silybin|calcium\s*[+\s]\s*vitamin\s*d|calcium\s*[+\s]\s*d3|vitamin\s*d3?\b/i;
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

    // ── DRUG INTERACTION SCREENING (SAFETY-CRITICAL) ─────────────────────
    // Cross-check every supplement against the user's medication list.
    // 'block' severity removes the supplement entirely.
    // 'caution' severity keeps it but appends a warning to practical_note.
    // Audit trail in plan._audit.interactions so we can see what fired.
    try {
      if (Array.isArray(plan.supplement_stack) && plan.supplement_stack.length > 0) {
        const supplementNames = plan.supplement_stack.map((s: any) => s?.nutrient ?? s?.name ?? '').filter(Boolean);
        const screen = screenInteractions(supplementNames, (medsStr ?? '').toLowerCase());
        if (screen.findings.length > 0) {
          console.log(`[wellness-plan] interaction screen: ${screen.findings.length} finding(s), ${screen.blockedSupplements.length} blocked, ${screen.cautionSupplements.length} caution`);
          // Remove blocked
          if (screen.blockedSupplements.length > 0) {
            const blockedSet = new Set(screen.blockedSupplements.map(s => s.toLowerCase()));
            plan.supplement_stack = plan.supplement_stack.filter((s: any) => {
              const name = String(s?.nutrient ?? s?.name ?? '').toLowerCase();
              return !blockedSet.has(name);
            });
          }
          // Caution: append to practical_note
          if (screen.cautionSupplements.length > 0) {
            const cautionMap = new Map(screen.cautionSupplements.map(c => [c.name.toLowerCase(), c.warning]));
            plan.supplement_stack = plan.supplement_stack.map((s: any) => {
              const name = String(s?.nutrient ?? s?.name ?? '').toLowerCase();
              const warning = cautionMap.get(name);
              if (!warning) return s;
              const note = String(s.practical_note ?? '');
              return {
                ...s,
                practical_note: note.includes(warning) ? note : `${note}\n\n⚠ INTERACTION: ${warning}`,
                interaction_caution: warning,
              };
            });
          }
          // Surface findings to top-level for UI rendering
          plan.interaction_warnings = screen.findings.map(f => ({
            supplement: f.supplement,
            medication: f.medication,
            severity: f.severity,
            warning: f.userWarning,
          }));
        }
        (plan._audit ??= {}).interactions = {
          totalFindings: screen.findings.length,
          blocked: screen.blockedSupplements,
          caution: screen.cautionSupplements.map(c => c.name),
          rules: screen.findings.map(f => ({ key: f.key, supplement: f.supplement, severity: f.severity })),
        };
      }
    } catch (e) {
      console.error('[wellness-plan] interaction screen error:', e);
    }

    // ── DISCLAIMER (deterministic — never let the AI wing this) ──────────
    // Same wording on every plan, every user, every time. Lawyer-blessable
    // boilerplate — do not let the AI rewrite it case-by-case.
    plan.disclaimer = "CauseHealth is a wellness and health-information service, not a medical provider. We do not diagnose, treat, prescribe, or replace professional medical care. The patterns and tests in this plan are general informational suggestions based on your data — they are not a diagnosis. Always consult your physician or pharmacist before starting any supplement, lifestyle change, or new medication, and before stopping or modifying any prescribed treatment. If you are experiencing a medical emergency, call 911 or your local emergency number.";

    // Validate before saving — never save corrupt/partial plans
    if (!plan.summary && !plan.supplement_stack) {
      return new Response(JSON.stringify({ error: 'Generated plan is incomplete' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!Array.isArray(plan.supplement_stack)) plan.supplement_stack = [];
    if (!Array.isArray(plan.today_actions)) plan.today_actions = [];
    if (!Array.isArray(plan.retest_timeline)) plan.retest_timeline = [];
    if (!Array.isArray(plan.suspected_conditions)) plan.suspected_conditions = [];
    if (!Array.isArray(plan.multi_marker_patterns)) plan.multi_marker_patterns = [];
    if (!Array.isArray(plan.medication_depletions)) plan.medication_depletions = [];
    if (!Array.isArray(plan.critical_findings_ai)) plan.critical_findings_ai = [];
    if (!Array.isArray(plan.predicted_changes_ai)) plan.predicted_changes_ai = [];
    if (!Array.isArray(plan.already_at_goal_ai)) plan.already_at_goal_ai = [];
    if (!Array.isArray(plan.test_quality_caveats_ai)) plan.test_quality_caveats_ai = [];

    // ── LONGITUDINAL: persist the deterministic progress summary ─────────
    // The AI used this data to reason (via the prompt block); we attach OUR
    // version to the plan so the UI renders deterministic deltas, not AI
    // fabricated numbers. Empty/null when this is the user's first draw.
    if (progressSummary) {
      plan.progress_summary = progressSummary;
      console.log(`[wellness-plan] progress_summary attached: ${progressSummary.movements.length} movements, ${progressSummary.rollup.improved} improved / ${progressSummary.rollup.worsened} worsened`);
    }

    // ── Source attribution on every AI-produced array ────────────────────
    // Tag each entry with source: 'ai' so the UI/audit can distinguish
    // AI-reasoned items from deterministic-backstop items.
    plan.multi_marker_patterns = plan.multi_marker_patterns.filter((p: any) => p?.name).map((p: any) => ({ ...p, source: p.source ?? 'ai' }));
    plan.medication_depletions = plan.medication_depletions.filter((d: any) => d?.medication).map((d: any) => ({ ...d, source: d.source ?? 'ai' }));
    plan.critical_findings_ai = plan.critical_findings_ai.filter((c: any) => c?.finding).map((c: any) => ({ ...c, source: c.source ?? 'ai' }));
    plan.predicted_changes_ai = plan.predicted_changes_ai.filter((p: any) => p?.intervention).map((p: any) => ({ ...p, source: p.source ?? 'ai' }));
    plan.already_at_goal_ai = plan.already_at_goal_ai.filter((a: any) => a?.marker).map((a: any) => ({ ...a, source: a.source ?? 'ai' }));
    plan.test_quality_caveats_ai = plan.test_quality_caveats_ai.filter((t: any) => t?.marker).map((t: any) => ({ ...t, source: t.source ?? 'ai' }));
    console.log(`[wellness-plan] universal AI domains: patterns=${plan.multi_marker_patterns.length} depletions=${plan.medication_depletions.length} critical=${plan.critical_findings_ai.length} predictions=${plan.predicted_changes_ai.length} atgoal=${plan.already_at_goal_ai.length} testqual=${plan.test_quality_caveats_ai.length}`);

    // ── Critical findings: deterministic backstop (UNIVERSAL) ───────────────
    // The AI does open-ended urgency reasoning. The backstop fires on hard
    // clinical thresholds (ADA / KDIGO / ACC-AHA / NCCN) regardless of what
    // the AI returned. De-duped against AI entries by marker name.
    const detCritical = detectCriticalFindings(labValues);
    if (detCritical.length > 0) {
      const aiCriticalLower = plan.critical_findings_ai
        .map((c: any) => String(c.finding ?? '').toLowerCase())
        .join(' | ');
      const novel = detCritical.filter(d => !aiCriticalLower.includes(String(d.marker).toLowerCase()));
      for (const d of novel) {
        plan.critical_findings_ai.push({
          finding: `${d.marker} ${d.value}${d.unit ? ' ' + d.unit : ''} (${d.threshold})`,
          severity: d.severity,
          rationale: d.rationale,
          source: 'deterministic',
        });
      }
      if (novel.length > 0) console.log(`[wellness-plan] critical-findings backstop fired: ${novel.map(n => n.marker).join(', ')}`);
    }

    // ── Suspected conditions: AI + deterministic backstop (UNIVERSAL) ──────
    // The AI did open-ended differential diagnosis (universal — can find any
    // condition the data fits, including the long tail). The backstop fires
    // for ~16 must-not-miss high-prevalence cases (Hashimoto's, PCOS,
    // prediabetes, NAFLD, iron-deficiency anemia, B12 deficiency, hemochrom,
    // sleep apnea, postmenopause, low T male, vit D deficiency, atherogenic
    // dyslipidemia, FH rule-out, polymyalgia rheumatica, multiple myeloma
    // rule-out — independent of what the AI returned). Skips anything the AI
    // already raised or the user already has on their dx list.
    // Tag the AI's entries first.
    plan.suspected_conditions = plan.suspected_conditions
      .filter((c: any) => c && c.name)
      .map((c: any) => ({ ...c, source: c.source ?? 'ai' }));
    const backstopEntries = runSuspectedConditionsBackstop({
      age,
      sex: profile?.sex ?? null,
      conditionsLower: (condStr ?? '').toLowerCase(),
      symptomsLower: (sympStr ?? '').toLowerCase(),
      medsLower: (medsStr ?? '').toLowerCase(),
      labValues,
      aiSuspectedConditions: plan.suspected_conditions,
    });
    if (backstopEntries.length > 0) {
      plan.suspected_conditions.push(...backstopEntries);
      console.log(`[wellness-plan] suspected backstop fired: ${backstopEntries.map(e => e.name).join(', ')}`);
    }

    // ── Linked-alternates suppression (universal) ────────────────────────
    // Some backstops fire a "simpler / cheaper / more common" explanation
    // for the same finding the AI raised as a more dramatic differential.
    // When that happens, the simpler one wins and the dramatic AI entry
    // is suppressed — otherwise the user reads 2 explanations for the
    // same lab picture and gets alarmed.
    //
    // Rule format: if a deterministic entry whose name matches `triggerRe`
    // is present, drop AI entries whose names match any of `suppressRe`.
    // Add new pairs here whenever an AI hypothesis duplicates a backstop's
    // simpler-first take.
    // Linked-alternates suppression. Each rule says: when an entry whose
    // name matches `triggerRe` is present, suppress entries whose name
    // matches any of `suppressRe`. Optionally `requiresEvidenceMatch`
    // narrows the suppression to only entries whose evidence string cites
    // the same finding — so independent diagnoses (real OSA based on
    // snoring + BMI 35) survive while AI-inferred-from-RBC diagnoses
    // (Mitchell case) get suppressed.
    const ALTERNATES: { triggerRe: RegExp; suppressRe: RegExp[]; requiresEvidenceMatch?: RegExp }[] = [
      // Hemoconcentration / dehydration suppresses absolute erythrocytosis,
      // polycythemia, AND OSA-as-cause-of-RBC-elevation — simpler
      // explanation for the same RBC-line pattern. Sleep apnea entries
      // are only suppressed if the evidence cites RBC/Hgb/Hct (i.e. the
      // AI invoked OSA specifically because of the RBC pattern). Sleep
      // apnea raised on independent grounds (snoring, BMI, Epworth)
      // survives.
      {
        triggerRe: /hemoconcentr|dehydrat|underhydrat/i,
        suppressRe: [
          /erythrocytosis/i,
          /polycythemia/i,
          /high red blood cell count/i,
          /high hemoglobin/i,
          /high hematocrit/i,
          /sleep apnea/i,
        ],
        // OSA entries are suppressed only when invoked for the RBC pattern.
        // Standalone OSA diagnoses (snoring, BMI 35, Epworth) survive.
        requiresEvidenceMatch: /\b(rbc|hct|hgb|hemoglobin|hematocrit|red blood cell|chronic hypoxemia|hypoxemia)\b/i,
      },
      // (Add future linked alternates here as new backstops land.)
    ];
    {
      const before = plan.suspected_conditions.length;
      // Trigger can be EITHER a deterministic backstop OR an AI entry — if
      // any entry's name matches the trigger, the suppression fires on
      // alternative-explanation entries that aren't the trigger itself.
      const suppressedSet = new Set<string>();
      for (const alt of ALTERNATES) {
        const triggerEntry = plan.suspected_conditions.find((c: any) => alt.triggerRe.test(String(c.name ?? '')));
        if (!triggerEntry) continue;
        for (const c of plan.suspected_conditions) {
          if (c === triggerEntry) continue;
          if (c.source === 'deterministic') continue;
          if (!alt.suppressRe.some(re => re.test(String(c.name ?? '')))) continue;
          // If this rule requires the suppressed entry's evidence to cite
          // the shared finding, only suppress if it does. Lets standalone
          // diagnoses survive when their evidence is independent.
          if (alt.requiresEvidenceMatch && !alt.requiresEvidenceMatch.test(String(c.evidence ?? ''))) continue;
          suppressedSet.add(String(c.name));
        }
      }
      if (suppressedSet.size > 0) {
        plan.suspected_conditions = plan.suspected_conditions.filter(
          (c: any) => !suppressedSet.has(String(c.name)),
        );
        console.log(`[wellness-plan] linked-alternates suppressed ${before - plan.suspected_conditions.length} AI entries: ${[...suppressedSet].join(', ')}`);
      }
    }

    // ── Self-reported behaviors are NOT differentials (universal scrub) ──
    // The user reports sleep difficulty / alcohol / smoking / poor diet —
    // those drive symptoms but they're not "hidden conditions" the doctor
    // needs to investigate. They belong in summary + today_actions, not in
    // the differential list. Mitchell case: AI raised "Chronic sleep
    // deprivation" as a high-confidence suspected_condition. Scrub it.
    {
      const BEHAVIOR_RE = /^(chronic )?sleep deprivation\b|behavioral insomnia|^poor sleep hygiene|^alcohol use\b|^smoking\b|^sedentary\b|^poor diet\b|^stress\b|^sleep loss\b/i;
      const before = plan.suspected_conditions.length;
      plan.suspected_conditions = plan.suspected_conditions.filter(
        (c: any) => !BEHAVIOR_RE.test(String(c.name ?? '').trim()),
      );
      const dropped = before - plan.suspected_conditions.length;
      if (dropped > 0) console.log(`[wellness-plan] dropped ${dropped} self-reported-behavior entries from suspected_conditions`);
    }

    // ── Promote confirmatory_tests → retest_timeline (universal) ────────
    // When a suspected_condition fires (deterministic OR AI), every test
    // in its confirmatory_tests must also appear in retest_timeline so it
    // shows up in Doctor Prep. Otherwise the user sees the test in the
    // Possible Conditions card but the doctor doesn't see it on the prep
    // sheet. Mitchell case: Subclinical Hashimoto's listed Free T4, Free
    // T3, Reverse T3, TPO, TgAb as confirmatory tests — none made it to
    // the retest list, so the doctor visit didn't include the full thyroid
    // workup.
    //
    // Skip if a similar marker is already in retest_timeline (case-
    // insensitive substring match against existing markers).
    if (!Array.isArray(plan.retest_timeline)) plan.retest_timeline = [];
    {
      // Resolve test name → canonical entry from RETEST_REGISTRY when
      // possible. If a confirmatory test ('Free T4') matches the registry
      // key 'thyroid_panel', we promote with the canonical name 'Thyroid
      // Panel (TSH + Free T4 + Free T3)' so the user sees the consolidated
      // workup, not 5 separate thyroid lines.
      const seenKeys = new Set<string>();
      const existingMarkerLower = new Set<string>();
      for (const r of plan.retest_timeline) {
        const m = String(r.marker ?? '').toLowerCase().trim();
        if (m) existingMarkerLower.add(m);
        // Pre-seed seenKeys from existing entries so we don't double-promote
        for (const def of RETEST_REGISTRY) {
          if (def.aliases.some((re: RegExp) => re.test(String(r.marker ?? '')))) {
            seenKeys.add(def.key);
            break;
          }
        }
      }
      const promotions: any[] = [];
      const promoted: string[] = [];
      for (const c of plan.suspected_conditions) {
        const tests = Array.isArray(c.confirmatory_tests) ? c.confirmatory_tests : [];
        for (const t of tests) {
          const testName = (typeof t === 'string' ? t : t?.test ?? '').trim();
          if (!testName) continue;
          // Skip non-lab items (interventions, questionnaires, etc.)
          if (/\btrial\b|\bdiary\b|\blog\b|\bquestionnaire\b|circumference|mallampati|spo2/i.test(testName)) continue;
          // Resolve to canonical registry entry if possible
          let canonicalName = testName;
          let canonicalKey: string | undefined;
          for (const def of RETEST_REGISTRY) {
            if (def.aliases.some((re: RegExp) => re.test(testName))) {
              canonicalName = def.canonical;
              canonicalKey = def.key;
              break;
            }
          }
          // Dedup by registry key when one exists
          if (canonicalKey && seenKeys.has(canonicalKey)) continue;
          // Substring fallback dedup for tests not in registry
          const lowerCanonical = canonicalName.toLowerCase();
          let alreadyCovered = false;
          for (const existing of existingMarkerLower) {
            if (existing.includes(lowerCanonical) || lowerCanonical.includes(existing)) { alreadyCovered = true; break; }
          }
          if (alreadyCovered) continue;

          if (canonicalKey) seenKeys.add(canonicalKey);
          existingMarkerLower.add(lowerCanonical);
          promotions.push({
            marker: canonicalName,
            retest_at: '12 weeks',
            why: `(b) Confirmatory workup for ${c.name} — see Possible Conditions for the rationale.`,
            specialist: 'pcp',
            // High priority — confirmatory tests for active suspicions are
            // more important than standard-of-care baseline gaps.
            priority: 'high',
          });
          promoted.push(canonicalName);
        }
      }
      // PREPEND promoted tests so they survive the cap in finalize. They're
      // tied to a specific differential, not a "while we're at it" baseline.
      if (promotions.length > 0) {
        plan.retest_timeline = [...promotions, ...plan.retest_timeline];
        console.log(`[wellness-plan] promoted ${promoted.length} confirmatory_tests to retest_timeline (top): ${promoted.join(', ')}`);
      }
    }

    // ── Placeholder-leak scrub (universal) ──────────────────────────────
    // The prompt uses generic stand-ins like "inflammation marker" as
    // examples. The AI sometimes literally inserts those phrases as if
    // they were real test/marker names ("inflammation marker (inflammation
    // marker) not yet tested"). Scrub them and replace with proper test
    // names where possible.
    const PLACEHOLDER_FIXES: Array<[RegExp, string]> = [
      [/\binflammation marker\s*\(inflammation marker\)\s*/gi, 'hs-CRP '],
      [/\binflammation markers?\b/gi, 'hs-CRP'],
    ];
    function scrubPlaceholders(s: any): any {
      if (typeof s !== 'string') return s;
      let out = s;
      for (const [re, repl] of PLACEHOLDER_FIXES) out = out.replace(re, repl);
      return out;
    }
    function scrubDeep(obj: any): any {
      if (Array.isArray(obj)) return obj.map(scrubDeep);
      if (obj && typeof obj === 'object') {
        const next: any = {};
        for (const k of Object.keys(obj)) next[k] = scrubDeep(obj[k]);
        return next;
      }
      return scrubPlaceholders(obj);
    }
    // Recurse over EVERY field in the plan, including workouts,
    // action_plan, symptoms_addressed, lifestyle_interventions, etc.
    // Skips the _audit and _classification metadata blocks (internal,
    // never user-facing).
    for (const key of Object.keys(plan)) {
      if (key.startsWith('_')) continue;
      plan[key] = scrubDeep(plan[key]);
    }

    // ── Universal: every confirmatory_test gets a clinical "why" ─────────
    // The user's question — "if my labs already show this, why do I need
    // ANOTHER test?" — has to be answered for EVERY test we recommend.
    // AI prompt requires it for AI entries; backstop entries are plain
    // string[]. Post-process normalizes both into {test, why} via the
    // rationale library.
    //
    // BUG GUARD (Mitchell case): the AI sometimes returns
    //   { "test": "", "why": "..." }
    // — putting the test name inside the prose of why and leaving test
    // empty. That renders as a blank box. Drop any such entry; we'd
    // rather show 1 well-formed test than 3 with a blank.
    plan.suspected_conditions = plan.suspected_conditions.map((c: any) => {
      if (!Array.isArray(c.confirmatory_tests)) return c;
      const upgraded = c.confirmatory_tests
        .map((t: any) => {
          if (typeof t === 'string') {
            const trimmed = t.trim();
            if (!trimmed) return null;
            return attachWhys([trimmed])[0];
          }
          if (t && typeof t === 'object') {
            const testName = String(t.test ?? '').trim();
            if (!testName) return null;  // drop empty-test entries
            return {
              test: testName,
              why: String(t.why ?? '').trim() || attachWhys([testName])[0].why,
            };
          }
          return null;
        })
        .filter((t: any) => t !== null);
      return { ...c, confirmatory_tests: upgraded };
    });

    // ── DEDUP + CAP suspected_conditions (universal) ─────────────────────
    // The AI sometimes lists the same condition twice with different framings
    // (e.g. "Sleep apnea (secondary polycythemia)" + "Secondary polycythemia
    // from sleep apnea" — same finding) and sometimes pads with weak entries
    // when given a long-tail patient. Enforce: dedup by ICD-10 root + name
    // similarity, sort by confidence, cap at 7. Doctors stop reading after 5-7.
    {
      const before = plan.suspected_conditions.length;
      // Dedup: collapse entries that share the same ICD-10 root (first 3 chars)
      // OR have nearly-identical names. Keep the higher-confidence one.
      const confRank: Record<string, number> = { high: 0, moderate: 1, low: 2 };
      const sorted = [...plan.suspected_conditions].sort((a: any, b: any) => {
        const ar = confRank[(a.confidence ?? 'low').toLowerCase()] ?? 3;
        const br = confRank[(b.confidence ?? 'low').toLowerCase()] ?? 3;
        if (ar !== br) return ar - br;
        // Tiebreak: deterministic backstop entries before AI (they're vetted)
        return (a.source === 'deterministic' ? 0 : 1) - (b.source === 'deterministic' ? 0 : 1);
      });
      const seenIcd = new Set<string>();
      const seenNameRoot = new Set<string>();
      const deduped: any[] = [];
      for (const c of sorted) {
        const icd = String(c.icd10 ?? '').slice(0, 3).toUpperCase();
        // Crude name root: first 4 alpha chars, lowercased — collapses variants
        // like "polycythemia" / "polycythaemia" / "secondary polycythemia"
        const nameNorm = String(c.name ?? '').toLowerCase().replace(/[^a-z]/g, '');
        const nameRoot = nameNorm.slice(0, 6);
        if (icd && seenIcd.has(icd)) continue;
        if (nameRoot && seenNameRoot.has(nameRoot)) continue;
        if (icd) seenIcd.add(icd);
        if (nameRoot) seenNameRoot.add(nameRoot);
        deduped.push(c);
      }
      // Cap at 5 — universal cap, applies to every patient. A doctor reads
      // 4-5 differentials and engages; reads 10 and dismisses. Better one
      // strong list every patient takes seriously than a kitchen-sink list.
      plan.suspected_conditions = deduped.slice(0, 5);
      const dropped = before - plan.suspected_conditions.length;
      if (dropped > 0) {
        console.log(`[wellness-plan] suspected_conditions: ${before} -> ${plan.suspected_conditions.length} (dropped ${dropped} via dedup/cap)`);
      }
    }
    console.log(`[wellness-plan] suspected_conditions total: ${plan.suspected_conditions.length} (ai=${plan.suspected_conditions.filter((c: any) => c.source === 'ai').length}, det=${plan.suspected_conditions.filter((c: any) => c.source === 'deterministic').length})`);

    // ── Adequacy flags: post-flight injection (universal) ────────────────
    // Surface every adequacy flag (thyroid under-replaced, TRT polycythemia,
    // glycemic uncontrolled, BP-med electrolyte issues, statin liver, DHEA
    // not converting, etc.) as: top-level `adequacy_flags`, today_actions,
    // and required retest entries via the canonical registry.
    if (adequacyFlags.length > 0) {
      plan.adequacy_flags = adequacyFlags.map(f => ({
        key: f.key, severity: f.severity, title: f.title,
        detail: f.detail, evidence: f.evidence,
      }));
      const existingActionsLower = plan.today_actions.map((a: any) => String(a?.action ?? '').toLowerCase()).join(' | ');
      for (const f of adequacyFlags) {
        if (!f.todayAction) continue;
        const topicHook = f.key.toLowerCase().split('_')[0];
        if (existingActionsLower.includes(topicHook)) continue;
        plan.today_actions.unshift({
          emoji: f.severity === 'critical' ? '🚨' : '⚠️',
          action: f.todayAction,
          why: `${f.title} — ${f.evidence}.`,
          category: 'take',
          _adequacy_key: f.key,
        });
        console.log(`[wellness-plan] Adequacy: injected today_action for ${f.key}`);
      }
      if (plan.today_actions.length > 3) plan.today_actions = plan.today_actions.slice(0, 3);

      for (const f of adequacyFlags) {
        for (const testKey of f.retestKeysToInject) {
          const inserted = pushRetestByKey(
            plan.retest_timeline,
            testKey,
            `${f.title} (${f.evidence}) — confirm response in 6-12 weeks`,
            'b',
            classification.retestCadence,
          );
          if (inserted) console.log(`[wellness-plan] Adequacy: injected ${testKey} for ${f.key}`);
        }
      }
    }

    // Stamp the plan with classification for client + audit.
    plan.plan_mode = classification.mode;
    plan._classification = {
      mode: classification.mode,
      reasons: classification.reasons,
      flags: classification.flags,
      retest_cap: classification.retestCap,
      retest_cadence: classification.retestCadence,
    };
    plan.already_at_goal = alreadyOptimal.audit;     // shown in UI as "What's already working"
    plan.causal_chain = causalChain;                  // Layer A render data for the cascade view
    // Re-build predictions post-pathway-engine so injected supplements are included.
    plan.predicted_changes = buildPredictedChanges({
      adequacyKeys: adequacyFlags.map(f => f.key),
      causalRootKeys: causalChain.topInterventions.map(n => n.key),
      supplementKeys: plan.supplement_stack.map((s: any) => s?._key).filter(Boolean),
    });
    plan.specialty_synthesis = synthesis;
    // Audit log appended at the very end (after pathway engine runs) so it
    // captures the final state of all deterministic layers.

    // (Pivot May 2026: meal scrubber + meal padder + meal-related validators
    // removed alongside meals[] in the output. App is no longer a meal planner.)
    /* MEAL_SCRUBBER_DELETED_BLOCK_START
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
    MEAL_SCRUBBER_DELETED_BLOCK_END */

    // Eating pattern fallback — empty object if AI dropped it.
    if (!plan.eating_pattern || typeof plan.eating_pattern !== 'object') {
      plan.eating_pattern = { name: '', rationale: '', emphasize: [], limit: [] };
    }

    // Drop legacy meals[] if the AI emitted it from a stale prompt.
    if (Array.isArray(plan.meals)) delete plan.meals;

    if (!Array.isArray(plan.workouts)) plan.workouts = [];
    if (!plan.headline) plan.headline = '';

    // ── Headline length safety net (universal) ───────────────────────────
    // The hero card on the wellness plan page renders the headline as a
    // single line (truncates with leading-tight). Long AI-generated
    // headlines balloon the card on mobile. Cap at 9 words / 70 chars.
    // If the AI ignores the cap, truncate at the first sentence break,
    // then by word count, then by char.
    if (typeof plan.headline === 'string' && plan.headline.length > 70) {
      const original = plan.headline;
      // Try first sentence break (em-dash, period, semicolon)
      const sentenceEnd = original.search(/[—–.;]\s/);
      let truncated = sentenceEnd > 20 && sentenceEnd < 70 ? original.slice(0, sentenceEnd + 1).trim() : original;
      // Word cap
      const words = truncated.split(/\s+/);
      if (words.length > 9) truncated = words.slice(0, 9).join(' ').replace(/[,;:]$/, '') + '.';
      // Final char cap with ellipsis if still over
      if (truncated.length > 70) truncated = truncated.slice(0, 67).trimEnd() + '...';
      if (truncated !== original) {
        console.log(`[wellness-plan] headline truncated: "${original}" -> "${truncated}"`);
        plan.headline = truncated;
      }
    }
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
    // pathwayResult declared at outer scope so the audit log block (which
    // runs after this) can reference it. Default-empty so audit doesn't
    // crash if this whole try-block throws.
    let pathwayResult: ReturnType<typeof runPathways> = {
      conditionsMatched: [], medClassesMatched: [], symptomsMatched: [],
      labPatternsMatched: [], audit: [],
    };
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

      const medsLower = (medsStr ?? '').toLowerCase();

      // ── Lab-pattern injectors (truly universal — driven by lab values, not condition keys) ──
      // The two lab-driven injections that don't fit a condition/med/symptom
      // pathway: any abnormal CBC marker → re-test the CBC; demographic iron-panel
      // for menstruating women regardless of stated condition. Everything else
      // (condition-specific, med-specific, symptom-specific) is handled by the
      // universal pathway engine below.
      const cbcAbnormal = /\b(rbc|hematocrit|hct|hemoglobin|hgb|wbc|white blood|platelet|mcv|mch|rdw)\b[^\n]*\[(low|high|critical)/i.test(labsLower);
      if (cbcAbnormal) {
        pushRetestByKey(plan.retest_timeline, 'cbc',
          'Existing draw shows abnormal CBC values — re-measure to confirm trend',
          'c', classification.retestCadence);
      }
      // Menstruating-female iron-panel demographic injection (universal).
      const sex = (profile?.sex ?? '').toLowerCase();
      const ageNum = age ?? 99;
      const isMenstruatingFemale = sex === 'female' && ageNum >= 12 && ageNum <= 55;
      if (isMenstruatingFemale) {
        pushRetestByKey(plan.retest_timeline, 'iron_panel',
          'Menstruating-female demographic — iron panel rules out functional deficiency that ferritin alone may miss',
          'd', classification.retestCadence);
      }

      // ── UNIVERSAL PATHWAY ENGINE ──────────────────────────────────────
      // Replaces ~80 lines of hardcoded `if (hasIBD) ... if (hasT2D) ...`
      // blocks. Single function loops every Tier-1 condition the user has,
      // every drug class they're on, every reported symptom — and fires
      // their declared pathway tests + supplements via canonical registries.
      //
      // Adding a new condition / drug class / symptom = one registry edit,
      // no edge-function code change. Universal coverage flows from
      // declarative data, not bespoke if-blocks.
      const alreadyTakingForEngine = [
        ...plan.supplement_stack.map((s: any) => `${s?.nutrient ?? ''} ${s?.form ?? ''}`),
        ...((supps ?? []).map((s: any) => s?.name ?? '')),
      ].join(' ').toLowerCase();
      pathwayResult = runPathways({
        conditionsLower,
        medsLower,
        symptomsTextWithSeverity: symptomsLower,
        symptomsArray: (symptoms ?? []) as any,
        labValues,                    // for lab-pattern detection (CRP, LDL-P, etc.)
        sex: profile?.sex ?? null,
        retestCadence: classification.retestCadence,
        plan: { retest_timeline: plan.retest_timeline, supplement_stack: plan.supplement_stack },
        alreadyTakingText: alreadyTakingForEngine,
      });
      console.log(`[wellness-plan] pathway engine fired: conditions=[${pathwayResult.conditionsMatched.join(',')}] meds=[${pathwayResult.medClassesMatched.join(',')}] symptoms=[${pathwayResult.symptomsMatched.join(',')}] labPatterns=[${pathwayResult.labPatternsMatched.join(',')}]`);

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
    // ── Test-quality flagger POST-flight (Layer D) ───────────────────────
    // Push the better-test recommendations into the retest_timeline (deduped
    // by canonical key) and stamp the flags on the plan for UI rendering.
    if (qualityFlags.length > 0) {
      plan.test_quality_flags = qualityFlags.map(f => ({
        key: f.key, severity: f.severity, title: f.title,
        detail: f.detail, evidence: f.evidence, betterTestKeys: f.betterTestKeys,
      }));
      for (const f of qualityFlags) {
        for (const k of f.betterTestKeys) {
          pushRetestByKey(plan.retest_timeline, k, `Better test: ${f.title}`, 'e', classification.retestCadence);
        }
      }
    }

    // ── Already-optimal POST-flight scrub (Layer B) ──────────────────────
    // Even after the prompt note, the AI sometimes recommends a supplement
    // for a marker the user is already at goal on. Scrub deterministically.
    const scrub = applyAlreadyOptimalScrub(plan, alreadyOptimal);
    if (scrub.suppressedSupplements.length > 0 || scrub.suppressedRetests.length > 0) {
      console.log(`[wellness-plan] already-optimal scrub: dropped supps=[${scrub.suppressedSupplements.join(',')}] retests=[${scrub.suppressedRetests.join(',')}]`);
    }

    // Cap retest_timeline using the severity-aware classifier output.
    // critical_treatment / treatment → 20, symptomatic → 14, optimization →
    // 10, pristine → 6. finalizeRetestTimeline() also dedups by canonical
    // key (so DHEA-S can't appear twice).
    //
    // We pass labValues so the finalize step can suppress retests for
    // markers ALREADY measured in this draw at healthy tier. Universal
    // tracking-not-screening principle: if Lp(a) just came back normal,
    // don't re-recommend it. If folate was just measured optimal, drop
    // it. The retest list should be focused on what's still unresolved
    // or actively being tracked — not a re-screen of the whole panel.
    plan.retest_timeline = finalizeRetestTimeline(plan.retest_timeline, classification.retestCap, labValues);
    console.log(`[wellness-plan] retest_timeline finalized to ${plan.retest_timeline.length} entries (cap=${classification.retestCap}, mode=${classification.mode})`);
    if (!plan.generated_at) plan.generated_at = new Date().toISOString();

    // ── CATEGORY NORMALIZATION ──────────────────────────────────────────
    // Before the per-category dedup, normalize each supplement's category
    // against the canonical registry. The AI sometimes ignores the prompt's
    // category rule (e.g., tags CoQ10 as liver_metabolic despite explicit
    // inflammation_cardio instruction). Without this pass, the wrong-category
    // supplement occupies a slot and forces correct supplements to be dropped
    // by dedup (statin user gets CoQ10 in liver_metabolic, milk thistle dies).
    //
    // We match by the supplement's nutrient name against each registry entry's
    // alreadyTakingPatterns. First match wins. If nothing matches, leave the
    // AI's category alone (could be a supplement we don't have in registry).
    if (Array.isArray(plan.supplement_stack)) {
      try {
        const { SUPPLEMENT_REGISTRY } = await import('../_shared/supplementRegistry.ts');
        for (const supp of plan.supplement_stack) {
          const name = String(supp?.nutrient ?? '');
          if (!name) continue;
          for (const def of SUPPLEMENT_REGISTRY) {
            if (def.alreadyTakingPatterns.some((re: RegExp) => re.test(name))) {
              if (supp.category !== def.entry.category) {
                console.log(`[wellness-plan] category normalization: '${name}' ${supp.category} → ${def.entry.category}`);
                supp.category = def.entry.category;
              }
              break;
            }
          }
        }
      } catch (e) { console.warn('[wellness-plan] category normalization failed:', e); }
    }

    // Final dedup: ONE supplement per EFFECTIVE category. Effective category
    // matches what the UI renders by — if sourced_from === 'medication_depletion'
    // we treat the supplement as its own 'medication_depletion' bucket
    // (which is the renderer's pseudo-category). Otherwise we use the
    // pharmacological category. This prevents CoQ10 (med-depletion, mapped
    // category inflammation_cardio) from competing with Omega-3 (lab-finding,
    // inflammation_cardio) in dedup — both survive because they're in
    // different effective buckets.
    if (Array.isArray(plan.supplement_stack)) {
      const priorityRank = (p: string) => p === 'critical' ? 0 : p === 'high' ? 1 : p === 'moderate' ? 2 : 3;
      const effectiveCat = (supp: any): string | null => {
        // Mirror the renderer's routing exactly:
        // - liver_metabolic supplements ALWAYS stay in the liver bucket
        //   (they help the liver regardless of trigger source)
        // - else medication_depletion-sourced → its own bucket
        // - else use the pharmacological category
        if (supp?.category === 'liver_metabolic') return 'liver_metabolic';
        if (supp?.sourced_from === 'medication_depletion') return 'medication_depletion';
        const c = supp?.category;
        return typeof c === 'string' && c.length > 0 ? c : null;
      };
      const byCategory = new Map<string, any[]>();
      const uncategorized: any[] = [];
      for (const supp of plan.supplement_stack) {
        const cat = effectiveCat(supp);
        if (cat) {
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
    // ── Audit log (final) ─────────────────────────────────────────────────
    // Captures every deterministic layer's outputs so future debugging /
    // regression analysis has full visibility into what fired and why.
    plan._audit = buildAudit({
      classification,
      adequacyFlags,
      alreadyOptimal,
      qualityFlags,
      causalChain,
      predictions: plan.predicted_changes ?? [],
      specialtySynthesis: synthesis,
      pathwayResult,
      labCount: labValues.length,
      suspectedConditions: plan.suspected_conditions ?? [],
      multiMarkerPatterns: plan.multi_marker_patterns ?? [],
      medicationDepletions: plan.medication_depletions ?? [],
      criticalFindingsAi: plan.critical_findings_ai ?? [],
      predictedChangesAi: plan.predicted_changes_ai ?? [],
      alreadyAtGoalAi: plan.already_at_goal_ai ?? [],
      testQualityCaveatsAi: plan.test_quality_caveats_ai ?? [],
    });

    // Persist the plan. Supabase JS client returns {data, error} rather than
    // throwing — without this check, a save failure would still return a 200
    // with the plan body, and the next refetch would show the user's stale
    // prior plan. We log + 500 instead so the UI can surface a real error.
    const { error: insertErr } = await supabase
      .from('wellness_plans')
      .insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });
    if (insertErr) {
      console.error('[wellness-plan] insert failed:', insertErr);
      return new Response(
        JSON.stringify({ error: `Failed to save plan: ${insertErr.message ?? String(insertErr)}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
