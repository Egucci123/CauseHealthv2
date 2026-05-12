// supabase/functions/_shared/prompts/stack.ts
//
// CALL B — SUPPLEMENT STACK + LIFESTYLE WRITER
// =============================================
// Job: take ClinicalFacts.supplementCandidates (already deterministic —
// names, doses, timing, category) and write the practical_note +
// evidence_note prose. Plus eating_pattern, workouts, lifestyle.
// Cannot invent supplements. Cannot change doses or timing.

import type { ClinicalFacts } from '../buildPlan.ts';
import { CAUSEHEALTH_CONSTITUTION_SHORT } from './_constitution.ts';

export const STACK_TOOL_SCHEMA = {
  name: 'submit_stack_lifestyle',
  description: 'Submit the supplement rationale prose and lifestyle interventions.',
  input_schema: {
    type: 'object',
    properties: {
      supplement_notes: {
        type: 'array',
        description: 'For EACH supplement in FACTS.supplementCandidates (in order), write practical_note + evidence_note. Do NOT skip any. Do NOT add new supplements.',
        items: {
          type: 'object',
          properties: {
            nutrient: { type: 'string', description: 'Must match FACTS.supplementCandidates[i].nutrient exactly.' },
            practical_note: {
              type: 'string',
              maxLength: 280,
              description: 'ONE sentence: WHY this timing (absorption / fat-soluble / GABA / circadian) + interaction warnings with this user actual meds + any "avoid taking with X" caveats.',
            },
            evidence_note: {
              type: 'string',
              maxLength: 200,
              description: 'ONE sentence: what trial / mechanism / typical response time supports this dose. Cite specific magnitude where you can.',
            },
          },
          required: ['nutrient', 'practical_note', 'evidence_note'],
        },
      },
      eating_pattern: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'ONE of: Mediterranean, Lower-Glycemic Mediterranean, Anti-Inflammatory, IBD-Friendly Modified, DASH-Mediterranean Hybrid, Plant-Forward.' },
          rationale: { type: 'string', maxLength: 200 },
          emphasize: { type: 'array', items: { type: 'string' }, maxItems: 6 },
          limit: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['name', 'rationale', 'emphasize', 'limit'],
      },
      workouts: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string' },
            day: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
            title: { type: 'string' },
            duration_min: { type: 'integer', minimum: 5, maximum: 120 },
            description: { type: 'string', maxLength: 140 },
            why: { type: 'string', maxLength: 140 },
          },
          required: ['emoji', 'day', 'title', 'duration_min', 'description', 'why'],
        },
      },
      lifestyle_interventions: {
        type: 'object',
        properties: {
          diet: { type: 'array', items: lifestyleItemSchema(), maxItems: 5 },
          sleep: { type: 'array', items: lifestyleItemSchema(), maxItems: 5 },
          exercise: { type: 'array', items: lifestyleItemSchema(), maxItems: 5 },
          stress: { type: 'array', items: lifestyleItemSchema(), maxItems: 5 },
        },
        required: ['diet', 'sleep', 'exercise', 'stress'],
      },
    },
    required: ['supplement_notes', 'eating_pattern', 'workouts', 'lifestyle_interventions'],
  },
} as const;

function lifestyleItemSchema() {
  return {
    type: 'object',
    properties: {
      emoji: { type: 'string' },
      intervention: { type: 'string', maxLength: 120 },
      rationale: { type: 'string', maxLength: 140 },
      priority: { type: 'string', enum: ['critical', 'high', 'moderate'] },
    },
    required: ['emoji', 'intervention', 'rationale', 'priority'],
  };
}

export const STACK_SYSTEM_PROMPT = `${CAUSEHEALTH_CONSTITUTION_SHORT}

You are the clinical writer for CauseHealth, working on the supplements and lifestyle section.

YOUR JOB:
1. supplement_notes — write practical_note + evidence_note for EVERY supplement in FACTS.supplementCandidates (do not skip, do not add). Names, doses, timing, and category are LOCKED.
2. eating_pattern — pick the best fit from the allowed list, write rationale + emphasize/limit lists.
3. workouts — 4-6 workouts spread Mon-Sun, calibrated to the patient's labs and conditions.
4. lifestyle_interventions — diet/sleep/exercise/stress, 2-4 items per bucket, each tied to a specific finding from FACTS.

VOICE: calm, plain English, 6th-grade. Equipped-advocate. No alarmism.

PRACTICAL_NOTE TEMPLATE (one sentence covers all three):
   "Take with [timing reason] — [interaction with patient's actual meds from FACTS.patient.meds] — [absorption / form caveat]."

EVIDENCE_NOTE TEMPLATE (one sentence):
   "[Mechanism or trial] — [typical response magnitude] in [typical timeframe]."

EXAMPLE supplement_notes entry (CoQ10 for atorvastatin user):
{
  "nutrient": "CoQ10 (Ubiquinol)",
  "practical_note": "Take with the fattiest meal of the day — atorvastatin doesn't interact, but CoQ10 is fat-soluble and absorption drops 50% on an empty stomach.",
  "evidence_note": "Statin-induced CoQ10 depletion drives muscle pain and fatigue — repletion at 100-200mg shows benefit in 4-8 weeks (Caso 2007, Skarlovnik 2014)."
}

OUTPUT FORMAT:
Use the submit_stack_lifestyle tool. No prose outside the tool call.`;

export interface StackOutput {
  supplement_notes: { nutrient: string; practical_note: string; evidence_note: string }[];
  eating_pattern: { name: string; rationale: string; emphasize: string[]; limit: string[] };
  workouts: { emoji: string; day: string; title: string; duration_min: number; description: string; why: string }[];
  lifestyle_interventions: {
    diet: { emoji: string; intervention: string; rationale: string; priority: string }[];
    sleep: { emoji: string; intervention: string; rationale: string; priority: string }[];
    exercise: { emoji: string; intervention: string; rationale: string; priority: string }[];
    stress: { emoji: string; intervention: string; rationale: string; priority: string }[];
  };
}

export function buildStackUserMessage(facts: ClinicalFacts): string {
  // 2026-05-12-28: Most top supplements now have canned practicalNote +
  // evidenceNote in the SUPPLEMENT_BASE registry. The AI only needs to
  // fill in for supplements WITHOUT canned notes (the long tail).
  // Filter the payload so the AI sees only what it needs to write.
  const suppsNeedingNotes = facts.supplementCandidates.filter(s =>
    !(s as any).practicalNote || !(s as any).evidenceNote
  );

  const payload = {
    patient: facts.patient,
    lab_outliers: facts.labs.outliers,
    conditions: facts.conditions,
    depletions: facts.depletions,
    // Full stack — AI sees all so it can reference for eating_pattern + workouts
    supplement_candidates: facts.supplementCandidates,
    // Subset needing AI-generated notes — usually 0-2 supplements
    supplements_needing_notes: suppsNeedingNotes.map(s => ({
      key: s.key, nutrient: s.nutrient, dose: s.dose, timing: s.timing,
    })),
    is_optimization_mode: facts.isOptimizationMode,
  };

  return `FACTS (deterministic — do not invent or modify supplements):

${JSON.stringify(payload, null, 2)}

IMPORTANT — SUPPLEMENT NOTES POLICY:
Most supplements in FACTS.supplement_candidates already have canned
practicalNote + evidenceNote (pre-written in the engine registry).
For those, DO NOT write new notes — they will be used verbatim.

You only write supplement_notes for entries in FACTS.supplements_needing_notes.
If that array is EMPTY, return supplement_notes: [].

For eating_pattern + workouts + lifestyle_interventions, write as usual.

Use the submit_stack_lifestyle tool.`;
}
