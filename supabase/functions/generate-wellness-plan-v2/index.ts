// supabase/functions/generate-wellness-plan-v2/index.ts
//
// CauseHealth Wellness Plan v2 — DETERMINISTIC + PARALLEL AI
// ==========================================================
// Architecture:
//   1. Load patient data (auth + DB).
//   2. Normalize labs / conditions / meds / symptoms into PatientInput.
//   3. buildPlan(input) → ClinicalFacts (deterministic, ~50ms).
//   4. Three PARALLEL AI calls (tool-use, length-capped):
//        Call A — narrative
//        Call B — supplement rationale + lifestyle
//        Call C — today actions + 3-phase plan
//   5. Merge ClinicalFacts + AI prose into the final plan shape (same
//      field names as v1 — frontend works without changes).
//   6. Save to wellness_plans table.
//
// Total wall-clock: ~10s (vs ~90s in v1). Cost: ~$0.04 (vs ~$0.40).
//
// The AI cannot invent tests, conditions, supplements, doses, or risk
// numbers — those are produced by the deterministic layer and the AI's
// tool-use schema does not contain those fields. Output regressions
// fixed once, by construction:
//   • CMP / CBC / Lipid Panel / etc. always present (rule-driven).
//   • No fake test names ("Fecal gut hs-CRP" is impossible).
//   • No standalone ALT/AST when CMP is in list (CMP wins; ALT not in registry as standalone).
//   • No "(b/c) Standard IBD monitoring" copy-paste why text.
//   • Voice consistency via 3 examples per prompt, not 50 rules.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPlan, type PatientInput, type ClinicalFacts, type LabValue } from '../_shared/buildPlan.ts';
import {
  NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_TOOL_SCHEMA,
  buildNarrativeUserMessage,
  type NarrativeOutput,
} from '../_shared/prompts/narrative.ts';
import {
  STACK_SYSTEM_PROMPT,
  STACK_TOOL_SCHEMA,
  buildStackUserMessage,
  type StackOutput,
} from '../_shared/prompts/stack.ts';
import {
  ACTION_PLAN_SYSTEM_PROMPT,
  ACTION_PLAN_TOOL_SCHEMA,
  buildActionPlanUserMessage,
  type ActionPlanOutput,
} from '../_shared/prompts/actionPlan.ts';
import { applyAllergyFilters } from '../_shared/safetyNet.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = 'claude-haiku-4-5-20251001';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ──────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  try {
    const { userId } = await req.json();
    if (!userId) {
      return json({ error: 'userId required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Load patient data in parallel
    const [profileRes, medsRes, symptomsRes, conditionsRes, suppsRes, drawRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const drawId = drawRes.data?.id ?? null;
    let labValues: any[] = [];
    if (drawId) {
      const { data } = await supabase.from('lab_values').select('*').eq('draw_id', drawId);
      labValues = data ?? [];
    }

    // 2. Normalize patient input
    const input = normalizePatientInput({
      profile,
      meds: medsRes.data ?? [],
      symptoms: symptomsRes.data ?? [],
      conditions: conditionsRes.data ?? [],
      supplements: suppsRes.data ?? [],
      labValues,
    });

    // 3. Run deterministic plan builder (~50ms)
    const facts = buildPlan(input);
    console.log(`[v2] facts built: ${facts.tests.length} tests, ${facts.conditions.length} conditions, ${facts.supplementCandidates.length} supps, ${facts.emergencyAlerts.length} alerts`);

    // 4. Three parallel AI calls
    const [narrativeRes, stackRes, actionRes] = await Promise.allSettled([
      callAnthropicTool<NarrativeOutput>({
        system: NARRATIVE_SYSTEM_PROMPT,
        user: buildNarrativeUserMessage(facts),
        tool: NARRATIVE_TOOL_SCHEMA,
      }),
      callAnthropicTool<StackOutput>({
        system: STACK_SYSTEM_PROMPT,
        user: buildStackUserMessage(facts),
        tool: STACK_TOOL_SCHEMA,
      }),
      callAnthropicTool<ActionPlanOutput>({
        system: ACTION_PLAN_SYSTEM_PROMPT,
        user: buildActionPlanUserMessage(facts),
        tool: ACTION_PLAN_TOOL_SCHEMA,
      }),
    ]);

    const narrative = settledOrFallback(narrativeRes, narrativeFallback(facts));
    const stack = settledOrFallback(stackRes, stackFallback(facts));
    const action = settledOrFallback(actionRes, actionFallback(facts));

    console.log(`[v2] AI calls finished in ${Date.now() - startTime}ms (narrative=${narrativeRes.status}, stack=${stackRes.status}, action=${actionRes.status})`);

    // 5. Merge into final plan (same shape as v1 for frontend compatibility)
    const plan = mergeIntoFinalPlan({ facts, narrative, stack, action, profile });

    // 6. Save
    const { error: insertErr } = await supabase
      .from('wellness_plans')
      .insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });
    if (insertErr) {
      console.error('[v2] insert failed:', insertErr);
      return json({ error: `Failed to save plan: ${insertErr.message ?? String(insertErr)}` }, 500);
    }

    console.log(`[v2] complete in ${Date.now() - startTime}ms`);
    return json(plan, 200);
  } catch (err) {
    console.error('[v2] error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePatientInput(args: {
  profile: any;
  meds: any[];
  symptoms: any[];
  conditions: any[];
  supplements: any[];
  labValues: any[];
}): PatientInput {
  const { profile, meds, symptoms, conditions, supplements, labValues } = args;

  const conditionsList = (conditions ?? []).map((c: any) => String(c?.name ?? '')).filter(Boolean);
  const medsList = (meds ?? []).map((m: any) => String(m?.name ?? '')).filter(Boolean);
  const supplementsList = (supplements ?? []).map((s: any) => String(s?.name ?? '')).filter(Boolean);
  const symptomsList = (symptoms ?? []).map((s: any) => ({
    name: String(s?.name ?? ''),
    severity: typeof s?.severity === 'number' ? s.severity : 0,
  }));

  const labs: LabValue[] = (labValues ?? []).map((l: any) => ({
    marker: String(l?.marker_name ?? ''),
    value: l?.value ?? null,
    unit: String(l?.unit ?? ''),
    flag: (l?.optimal_flag ?? l?.standard_flag ?? 'normal') as LabValue['flag'],
    refLow: l?.reference_low ?? null,
    refHigh: l?.reference_high ?? null,
    drawnAt: l?.created_at ?? null,
  }));

  // Build human-readable lab summary string used by regex matchers
  const labsLower = labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();

  return {
    age: profile?.age ?? null,
    sex: profile?.sex ?? null,
    conditionsList,
    conditionsLower: conditionsList.join(' ').toLowerCase(),
    medsList,
    medsLower: medsList.join(' ').toLowerCase(),
    symptomsList,
    symptomsLower: symptomsList.map(s => `${s.name} (${s.severity}/10)`).join(' ').toLowerCase(),
    supplementsList,
    supplementsLower: supplementsList.join(' ').toLowerCase(),
    labs,
    labsLower,
    isPregnant: !!profile?.is_pregnant,
    hasShellfishAllergy: /shellfish|fish/i.test(profile?.allergies ?? ''),
    hasSulfaAllergy: /sulfa/i.test(profile?.allergies ?? ''),
    freeText: String(profile?.free_text ?? ''),
  };
}

// ──────────────────────────────────────────────────────────────────────
// ANTHROPIC TOOL-USE WRAPPER
// ──────────────────────────────────────────────────────────────────────
async function callAnthropicTool<T>(args: {
  system: string;
  user: string;
  tool: any;
}): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 60_000); // 60s per call hard cap

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: [
          { type: 'text', cache_control: { type: 'ephemeral' }, text: args.system },
        ],
        messages: [{ role: 'user', content: args.user }],
        tools: [args.tool],
        tool_choice: { type: 'tool', name: args.tool.name },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 400)}`);
    }
    const json = await res.json();
    const block = (json?.content ?? []).find((c: any) => c?.type === 'tool_use' && c?.name === args.tool.name);
    if (!block) throw new Error(`No tool_use block in response (stop_reason=${json?.stop_reason})`);
    return block.input as T;
  } finally {
    clearTimeout(timeout);
  }
}

function settledOrFallback<T>(res: PromiseSettledResult<T>, fallback: T): T {
  if (res.status === 'fulfilled') return res.value;
  console.error('[v2] AI call failed, using fallback:', res.reason);
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────
// MERGE — combine ClinicalFacts + AI prose into the final plan shape
// ──────────────────────────────────────────────────────────────────────
function mergeIntoFinalPlan(args: {
  facts: ClinicalFacts;
  narrative: NarrativeOutput;
  stack: StackOutput;
  action: ActionPlanOutput;
  profile: any;
}): any {
  const { facts, narrative, stack, action, profile } = args;

  // Merge supplement_stack: deterministic candidate + AI rationale
  const stackByNutrient = new Map<string, StackOutput['supplement_notes'][number]>();
  for (const n of stack.supplement_notes) stackByNutrient.set(n.nutrient.toLowerCase(), n);

  const supplementStack = facts.supplementCandidates.map(c => {
    const note = stackByNutrient.get(c.nutrient.toLowerCase());
    return {
      emoji: c.emoji,
      nutrient: c.nutrient,
      form: c.form,
      dose: c.dose,
      timing: c.timing,
      why_short: c.whyShort,
      why: c.why,
      practical_note: note?.practical_note ?? '',
      evidence_note: note?.evidence_note ?? '',
      category: c.category,
      priority: c.priority,
      sourced_from: c.sourcedFrom,
      alternatives: c.alternatives,
    };
  });

  // Apply allergy + pregnancy filter as belt-and-suspenders
  const filteredStack = applyAllergyFilters(
    supplementStack,
    /shellfish|fish/i.test(profile?.allergies ?? '') ? ['shellfish'] : [],
    !!profile?.is_pregnant,
    /\b(warfarin|coumadin|eliquis|xarelto|apixaban|rivaroxaban)\b/i.test(facts.patient.meds.join(' ').toLowerCase()),
  ) as typeof supplementStack;

  // Merge suspected_conditions: deterministic fact + AI evidence/what_to_ask
  const proseByName = new Map<string, NarrativeOutput['condition_prose'][number]>();
  for (const p of narrative.condition_prose) proseByName.set(p.name.toLowerCase(), p);

  const suspectedConditions = facts.conditions.map(c => {
    const prose = proseByName.get(c.name.toLowerCase());
    return {
      name: c.name,
      category: c.category,
      confidence: c.confidence,
      evidence: prose?.evidence ?? c.evidence,
      confirmatory_tests: c.confirmatory_tests,
      icd10: c.icd10,
      what_to_ask_doctor: prose?.what_to_ask_doctor ?? c.what_to_ask_doctor,
    };
  });

  // retest_timeline = facts.tests, mapped to v1 shape
  const retestTimeline = facts.tests.map(t => ({
    marker: t.name,
    retest_at: '12 weeks',
    why: t.whyLong,
    why_short: t.whyShort,
    icd10: t.icd10,
    icd10_description: t.icd10Description,
    priority: t.priority,
    insurance_note: t.insuranceNote,
    specialist: t.specialist,
    emoji: t.emoji,
    _key: t.key,
  }));

  // Disclaimer — deterministic, never AI-written
  const disclaimer = "CauseHealth is a wellness and health-information service, not a medical provider. We do not diagnose, treat, prescribe, or replace professional medical care. The patterns and tests in this plan are general informational suggestions based on your data — they are not a diagnosis. Always consult your physician or pharmacist before starting any supplement, lifestyle change, or new medication, and before stopping or modifying any prescribed treatment. If you are experiencing a medical emergency, call 911 or your local emergency number.";

  return {
    // Hero / summary
    headline: narrative.headline,
    summary: narrative.summary,
    generated_at: new Date().toISOString(),

    // Action layer
    today_actions: action.today_actions,
    supplement_stack: filteredStack,
    eating_pattern: stack.eating_pattern,
    workouts: stack.workouts,
    lifestyle_interventions: stack.lifestyle_interventions,
    action_plan: action.action_plan,

    // Clinical layer
    retest_timeline: retestTimeline,
    suspected_conditions: suspectedConditions,
    symptoms_addressed: narrative.symptoms_addressed,

    // Safety
    emergency_alerts: facts.emergencyAlerts,
    crisis_alert: facts.crisisAlert,
    prep_instructions: facts.prepInstructions,
    suboptimal_flags: facts.suboptimalFlags,

    // Numbers
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,

    // Metadata
    citations: facts.citations,
    is_optimization_mode: facts.isOptimizationMode,
    disclaimer,

    // v2 flag (so the dashboard / debugger can see this came from v2)
    plan_version: 'v2',
  };
}

// ──────────────────────────────────────────────────────────────────────
// FALLBACKS — if an AI call fails, the plan still ships with defaults
// derived from FACTS so the user is never left with nothing.
// ──────────────────────────────────────────────────────────────────────
function narrativeFallback(facts: ClinicalFacts): NarrativeOutput {
  const topOutlier = facts.labs.outliers[0];
  return {
    headline: topOutlier ? `${topOutlier.marker} stands out — here is your plan.` : 'Your wellness plan is ready.',
    summary: `We pulled ${facts.tests.length} tests for your follow-up, ${facts.supplementCandidates.length} targeted supplements, and a 12-week structure. Bring the doctor-prep sheet to your PCP.`,
    symptoms_addressed: facts.patient.symptoms.map(s => ({
      symptom: s.name,
      how_addressed: 'See the supplement stack and lifestyle interventions for the targeted strategies tied to this symptom.',
    })),
    condition_prose: facts.conditions.map(c => ({
      name: c.name,
      evidence: c.evidence,
      what_to_ask_doctor: c.what_to_ask_doctor,
    })),
  };
}

function stackFallback(facts: ClinicalFacts): StackOutput {
  return {
    supplement_notes: facts.supplementCandidates.map(c => ({
      nutrient: c.nutrient,
      practical_note: 'Take as directed. Verify timing with your pharmacist if you take other meds.',
      evidence_note: 'Standard repletion dose with established efficacy.',
    })),
    eating_pattern: {
      name: 'Mediterranean',
      rationale: 'Default broadly applicable pattern — anti-inflammatory and cardio-protective.',
      emphasize: ['Leafy greens', 'Fatty fish 2x/week', 'Olive oil', 'Whole grains'],
      limit: ['Refined sugar', 'Processed meat', 'Refined grains'],
    },
    workouts: [],
    lifestyle_interventions: { diet: [], sleep: [], exercise: [], stress: [] },
  };
}

function actionFallback(facts: ClinicalFacts): ActionPlanOutput {
  return {
    today_actions: [
      { emoji: '💧', action: 'Drink 2-3 L of water today; track urine color (pale yellow = hydrated).', why: 'Hydration is the highest-leverage 24-hour change.', category: 'eat' },
      { emoji: '🛏️', action: 'Set a bedtime alarm for 10:30 PM tonight.', why: 'Sleep extension drives most lab improvements.', category: 'sleep' },
      { emoji: '☀️', action: 'Walk outdoors for 15 minutes between 6:30-8:00 AM.', why: 'Morning light resets circadian rhythm.', category: 'move' },
    ],
    action_plan: {
      phase_1: { name: 'Stabilize (Weeks 1-4)', focus: 'Lock in sleep, hydration, and the critical supplements.', actions: facts.supplementCandidates.slice(0, 5).map(s => `💊 Start ${s.nutrient} ${s.dose} ${s.timing.toLowerCase()}.`) },
      phase_2: { name: 'Optimize (Weeks 5-8)', focus: 'Add resistance training and refine nutrition.', actions: ['🏋️ Add bodyweight resistance training 2x/week.', '🥗 Add 2 leafy-green meals per week.'] },
      phase_3: {
        name: 'Maintain (Weeks 9-12)',
        focus: 'Retest at week 12 and bring results to your PCP.',
        actions: [
          `🧪 At week 12, order the retest panel: ${facts.tests.slice(0, 5).map(t => t.name).join(', ')}.`,
          '🩺 Schedule the PCP visit one week after the draw.',
        ],
      },
    },
  };
}
