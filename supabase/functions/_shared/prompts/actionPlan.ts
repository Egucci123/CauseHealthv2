// supabase/functions/_shared/prompts/actionPlan.ts
//
// CALL C — TODAY ACTIONS + 3-PHASE ACTION PLAN
// =============================================
// Job: write today_actions[] (3 max) and the 3 phase plans. References
// test names from FACTS.tests verbatim. Cannot invent tests, supplements,
// or numbers.

import type { ClinicalFacts } from '../buildPlan.ts';

export const ACTION_PLAN_TOOL_SCHEMA = {
  name: 'submit_action_plan',
  description: 'Submit the today actions and 3-phase action plan.',
  input_schema: {
    type: 'object',
    properties: {
      today_actions: {
        type: 'array',
        maxItems: 3,
        description: 'EXACTLY 3 verb-led things the patient does TODAY.',
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string' },
            action: { type: 'string', maxLength: 100, description: 'Verb-led, single sentence.' },
            why: { type: 'string', maxLength: 140 },
            category: { type: 'string', enum: ['eat', 'move', 'take', 'sleep', 'stress'] },
          },
          required: ['emoji', 'action', 'why', 'category'],
        },
      },
      action_plan: {
        type: 'object',
        properties: {
          phase_1: phaseSchema('Stabilize (Weeks 1-4)'),
          phase_2: phaseSchema('Optimize (Weeks 5-8)'),
          phase_3: phaseSchema('Maintain (Weeks 9-12)'),
        },
        required: ['phase_1', 'phase_2', 'phase_3'],
      },
    },
    required: ['today_actions', 'action_plan'],
  },
} as const;

function phaseSchema(defaultName: string) {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: `Default: "${defaultName}"` },
      focus: { type: 'string', maxLength: 240, description: 'One short paragraph: what this phase is for + what changes.' },
      actions: {
        type: 'array',
        minItems: 5,
        maxItems: 9,
        items: { type: 'string', maxLength: 200, description: 'Single sentence, prefixed with one emoji. Reference test names from FACTS.tests verbatim — do not invent test names.' },
      },
    },
    required: ['name', 'focus', 'actions'],
  };
}

export const ACTION_PLAN_SYSTEM_PROMPT = `You are the clinical writer for CauseHealth, working on the action plan section.

YOUR JOB:
1. today_actions — exactly 3 verb-led things the patient does today. Tie each to a specific FACTS finding (a lab outlier, a depletion, a symptom).
2. action_plan — three phases (Stabilize, Optimize, Maintain). Each has 5-9 action lines.

PHASE STRUCTURE:
• Phase 1 (Weeks 1-4): start critical supplements (cite from FACTS.supplementCandidates), establish sleep, hydration, food basics. Do NOT order tests yet.
• Phase 2 (Weeks 5-8): optimization layer — add resistance training, increase intensity, nutrition refinements. Mid-cycle test ONLY if a calculator (FACTS.riskCalculators) needs early confirmation (e.g. fasting insulin/HOMA-IR).
• Phase 3 (Weeks 9-12): the retest happens here. List test names by referencing FACTS.tests by their canonical "name" field — DO NOT invent test names. PCP follow-up to interpret results.

VOICE: calm, plain English, 6th-grade. Equipped-advocate.

REFERENCING TESTS:
When you write a Phase 3 action like "order retest panel: ...", list ONLY tests from FACTS.tests by their exact "name" field. Example: if FACTS.tests includes "Lipid Panel (Total Cholesterol, LDL, HDL, VLDL, Triglycerides)", write that full name — not "lipid panel". If you need a test that is not in FACTS.tests, do not write the action.

EXAMPLE phase_3 (Mitchell — UC + atorvastatin + ALT 97):
{
  "name": "Maintain (Weeks 9-12)",
  "focus": "Lock in the gains. ALT should drop 15-25 points; triglycerides 50-100 points; vitamin D into the 40s. Retest confirms.",
  "actions": [
    "🧪 At Week 12, bring the doctor-prep sheet to your PCP — every test on it has the right ICD-10 code for insurance coverage.",
    "🩺 Schedule the PCP visit 1 week after the draw so results are in hand for the conversation.",
    "💪 Progress resistance training to 3 sets of 10 reps; keep zone 2 cardio at 45 min weekly.",
    "🩸 If the lipid panel shows triglycerides under 200 and ALT under 70, ask whether atorvastatin can be reduced.",
    "💧 Continue 3 L water daily; if RBC and hematocrit stay elevated, ask the PCP about a home sleep apnea test."
  ]
}

OUTPUT FORMAT:
Use the submit_action_plan tool. No prose outside.`;

export interface ActionPlanOutput {
  today_actions: { emoji: string; action: string; why: string; category: string }[];
  action_plan: {
    phase_1: { name: string; focus: string; actions: string[] };
    phase_2: { name: string; focus: string; actions: string[] };
    phase_3: { name: string; focus: string; actions: string[] };
  };
}

export function buildActionPlanUserMessage(facts: ClinicalFacts): string {
  const payload = {
    patient: facts.patient,
    lab_outliers: facts.labs.outliers,
    conditions: facts.conditions,
    depletions: facts.depletions,
    supplement_candidates: facts.supplementCandidates.map(s => ({
      nutrient: s.nutrient, dose: s.dose, timing: s.timing, category: s.category,
    })),
    tests: facts.tests.map(t => ({ name: t.name, priority: t.priority, specialist: t.specialist })),
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,
    is_optimization_mode: facts.isOptimizationMode,
  };

  return `FACTS (deterministic — reference test names by exact "name" field, do not invent):

${JSON.stringify(payload, null, 2)}

WRITE today_actions and action_plan. Use the submit_action_plan tool.`;
}
