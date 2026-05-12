// supabase/functions/_shared/rules/supplementRules.ts
//
// DETERMINISTIC SUPPLEMENT CANDIDATE BUILDER
// ==========================================
// Thin wrapper around the data-driven registry in
// `./supplementIndications.ts`. Adding coverage for a new pattern =
// ADD ONE ROW to INDICATIONS. No code edits to this file. No new
// if-statements. No engine modification.
//
// The matcher applies pregnancy + allergy contraindications, dedups by
// supplement key, sorts by priority + source, and caps at top-N.
// Foundational baseline (Vit D + Omega-3 + Mg) fires only when no
// indication produced anything — so a healthy adult never sees an
// empty stack.

import type { DepletionFact } from './depletionRules.ts';
import type { LabOutlierFact } from '../buildPlan.ts';
import { evaluateIndications, type EvaluateInput } from './supplementIndications.ts';

export interface SupplementCandidate {
  /** Stable cross-surface key. Same supplement → same key on lab analysis,
   *  wellness plan, doctor prep. */
  key: string;
  emoji: string;
  nutrient: string;
  form: string;
  dose: string;
  timing: string;
  whyShort: string;
  why: string;
  category: 'sleep_stress' | 'gut_healing' | 'liver_metabolic' | 'inflammation_cardio' | 'nutrient_repletion' | 'condition_therapy';
  priority: 'critical' | 'high' | 'moderate';
  sourcedFrom: 'lab_finding' | 'medication_depletion' | 'disease_mechanism' | 'symptom_pattern';
  alternatives: { name: string; form: string; note: string }[];
  /** Canned "when/how to take + interactions + absorption" note.
   *  Pre-written per supplement, deterministic. AI no longer generates. */
  practicalNote?: string;
  /** Canned "mechanism + typical response time + magnitude" note.
   *  Pre-written per supplement, deterministic. AI no longer generates. */
  evidenceNote?: string;
}

interface Input {
  age: number | null;
  sex: 'male' | 'female' | null;
  depletions: DepletionFact[];
  outliers: LabOutlierFact[];
  conditionsLower: string;
  symptomsLower: string;
  supplementsLower: string;
  isPregnant: boolean;
  hasShellfishAllergy: boolean;
  hasSulfaAllergy: boolean;
}

/**
 * Build supplement candidates from a patient input. Universal across
 * every user pattern. Returns up to 6 candidates sorted by priority +
 * source. The full pipeline:
 *
 *   1. Iterate INDICATIONS in ./supplementIndications.ts
 *   2. Match each indication's triggers against the input
 *   3. Apply gates (sex / age)
 *   4. Apply pregnancy / allergy contraindications (per supplement)
 *   5. Dedup by supplement key
 *   6. If empty → emit foundational baseline (Vit D + Omega-3 + Mg)
 *   7. Sort by priority (critical > high > moderate) then by source
 *      (medication_depletion > lab_finding > disease_mechanism > symptom_pattern)
 *   8. Slice to top-N (default 6)
 */
export function buildSupplementCandidates(input: Input): SupplementCandidate[] {
  const evalInput: EvaluateInput = {
    age: input.age,
    sex: input.sex,
    outliers: input.outliers,
    symptomsLower: input.symptomsLower,
    conditionsLower: input.conditionsLower,
    medsLower: '',                   // not used yet by any registry trigger
    depletions: input.depletions,    // medication triggers consume this
    isPregnant: input.isPregnant,
    hasShellfishAllergy: input.hasShellfishAllergy,
  };
  // 2026-05-12-30: bumped topN 6 -> 8. The previous cap of 6 with
  // MAX_PER_CATEGORY=3 was cap-cutting genuinely-needed lab-driven
  // supplements (milk_thistle / vit_d3) for patients with multi-pattern
  // profiles (UC + statin + lipids + ALT 97 + Vit D 24 edgemech case).
  // With topN=8, MAX_PER_CATEGORY auto-scales to 4 so 1:1 outlier-driven
  // supplements get to land alongside disease-mechanism supplements.
  return evaluateIndications(evalInput, { topN: 8 });
}
