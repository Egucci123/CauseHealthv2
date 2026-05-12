// supabase/functions/_shared/prompts/actionPlan.ts
//
// CALL C — TODAY ACTIONS + 3-PHASE ACTION PLAN
// =============================================
// Job: write today_actions[] (3 max) and the 3 phase plans. References
// test names from FACTS.tests verbatim. Cannot invent tests, supplements,
// or numbers.

import type { ClinicalFacts } from '../buildPlan.ts';
import { CAUSEHEALTH_CONSTITUTION_SHORT } from './_constitution.ts';

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

export const ACTION_PLAN_SYSTEM_PROMPT = `${CAUSEHEALTH_CONSTITUTION_SHORT}

You are the clinical writer for CauseHealth, working on the action plan section.

YOUR JOB:
1. today_actions — exactly 3 verb-led things the patient does today. Each card is ONE thing — one behavior OR one supplement, never two combined. Tie each to a specific FACTS finding (a lab outlier, a depletion, a symptom). Compliance studies show split cards lift adherence 15-20% over bundled ones.
2. action_plan — three phases (Stabilize, Optimize, Maintain). Each has 5-9 action lines.

TODAY_ACTIONS — STRICT:
• ONE thing per card. Never "Start CoQ10 and methylfolate" — that's two cards.
• Pick the 3 highest-leverage Day-1 moves. Typical mix: ONE hydration / sleep / behavior anchor + ONE most-critical supplement + ONE other (second supplement OR a lifestyle anchor like "set bedtime").
• If FACTS has 5+ supplements, pick the SINGLE most critical one for Day 1 (the one tied to the highest-priority outlier or a depletion). The rest start in Phase 1.

PHASE STRUCTURE:
• Phase 1 (Weeks 1-4): start critical supplements (cite from FACTS.supplementCandidates), establish sleep, hydration, food basics. NO test orders.
• Phase 2 (Weeks 5-8): optimization layer — add resistance training, increase intensity, nutrition refinements, gut healing. NO test orders. (No mid-cycle retest — patient gets ONE retest at Week 12.)
• Phase 3 (Weeks 9-12): the SINGLE retest happens here. PCP follow-up to interpret results.

RETEST TIMING — STRICT: There is exactly ONE retest event, at Week 12. Do not split it. Do not order any test in Phase 1 or Phase 2. All labs and imaging are reviewed together at the Week-12 PCP visit.

VOICE: calm, plain English, 6th-grade. Equipped-advocate.

VERB CHOICE — STRICT:
Phase 1 is the START of the program. NEVER use "Continue" / "Maintain" / "Keep doing" in Phase 1 actions — the patient hasn't started yet. Use "Start" / "Drink" / "Take" / "Set" / "Begin." Phase 2 may use "Continue" for a Phase-1 action you want to carry forward. Phase 3 is the only phase where "Maintain" / "Continue" / "Lock in" are appropriate as primary verbs.

REFERENCING SUPPLEMENTS — STRICT RULES (read this twice):
1. NEVER mention a supplement that is not in FACTS.supplementCandidates. The supplement list is curated by the deterministic rules engine — it deliberately holds back supplements that need a lab result first (e.g., methylfolate when folate has not been tested). Trust the engine.
2. If a depletion is in FACTS.depletions but the corresponding supplement is NOT in FACTS.supplementCandidates, that means the engine is waiting on a test result. Do NOT recommend the supplement. Instead, frame the action as: "When [Test Name] result comes back, ask your PCP whether [supplement-class] repletion is needed."
3. When you DO write a supplement action, reference the supplement by its exact "nutrient" field from FACTS.supplementCandidates. Do not invent variants, dose ranges, or forms.
4. Examples:
   ✓ "💊 Start CoQ10 (Ubiquinol) 100-200mg with breakfast." — CoQ10 is in FACTS.supplementCandidates
   ✗ "🧬 Start Folate (methylfolate or folinic acid) at dose matched to Mesalamine depletion." — FORBIDDEN if methylfolate not in FACTS.supplementCandidates

REFERENCING TESTS — STRICT RULES (read this twice):
1. NEVER list more than ONE test name in a single action sentence. ZERO is preferred. Reference the full panel as "the doctor-prep sheet" or "the retest panel" as a UNIT — full stop, no parenthetical list. Examples:
   ✓ "🧪 At Week 12, draw the full retest panel — your doctor-prep sheet has the exact list with ICD-10 codes for insurance."
   ✗ "🧪 At Week 12, draw the full retest panel — your doctor-prep sheet has the exact list (CMP, CBC, Lipid Panel, A1c, ...)." ← FORBIDDEN. The list is on the test card already.
   ✗ "🧪 At Week 12, order CMP, CBC, Lipid Panel, A1c, hs-CRP, ..." ← FORBIDDEN.
2. NEVER tell the patient to ORDER a test that is already in FACTS.tests. Those tests are already on the order sheet from Day 1. If you reference a specific test in Phase 3, frame it as REVIEWING the result, not ordering. Example: "🩻 At Week 12, review the Liver Ultrasound results with your PCP" — NOT "Ask PCP to order Liver Ultrasound at Week 12 if not done yet."
3. If you reference a specific test by name (to anchor a contingent decision like "if A1c drops below 5.4..."), use the exact "name" field from FACTS.tests verbatim — do not invent variants. Use ONE test name per sentence maximum.

EXAMPLE phase_3 (Mitchell — UC + atorvastatin + ALT 97):
{
  "name": "Maintain (Weeks 9-12)",
  "focus": "Lock in the gains. ALT should drop 15-25 points; triglycerides 50-100 points; vitamin D into the 40s. Retest confirms.",
  "actions": [
    "🧪 At Week 12, draw the full retest panel — your doctor-prep sheet has the exact list with ICD-10 codes for insurance.",
    "🩺 Schedule the PCP visit 1 week after the draw so results are in hand for the conversation.",
    "🩻 Review the Liver Ultrasound results with your PCP — they should reflect the lifestyle work of the last 12 weeks.",
    "💪 Progress resistance training to 3 sets of 10 reps; keep zone 2 cardio at 45 min weekly.",
    "🩸 If the lipid panel shows triglycerides under 200 and ALT under 70, ask whether atorvastatin can be reduced.",
    "💧 Continue 3 L water daily; if RBC and hematocrit stay elevated, ask about a home sleep apnea test (HSAT)."
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
    // Markers whose flag is expected because of a known active condition.
    // The headline / immediate_actions / 90-day plan MUST NOT call these
    // out as needing attention. They are known and benign for this patient.
    expected_findings: facts.expectedFindings,
  };

  return `FACTS (deterministic — reference test names by exact "name" field, do not invent):

${JSON.stringify(payload, null, 2)}

EXPECTED-FINDING RULE (universal):
When a marker appears in EXPECTED_FINDINGS, do NOT headline it as "needs
attention." Do NOT include it in immediate_actions or 90-day priorities.
If you reference it anywhere in plan prose, reference the explaining
condition (e.g. "Your bilirubin remains in the expected range for your
Gilbert syndrome"). The whole wellness plan must read as if this marker
is already accounted for — because it is.

EVIDENCE GROUNDING:
NEVER cite a marker value not present in FACTS.lab_outliers. If a marker
isn't in FACTS, don't reference it.

SYMPTOM SEVERITY SCALE:
FACTS.patient.symptoms severity is 1–5, not 1–10. Always render with the
correct denominator.

WRITE today_actions and action_plan. Use the submit_action_plan tool.`;
}
