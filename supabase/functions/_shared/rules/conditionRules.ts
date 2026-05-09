// supabase/functions/_shared/rules/conditionRules.ts
//
// DETERMINISTIC SUSPECTED-CONDITION DETECTOR
// ==========================================
// Wraps the proven `suspectedConditionsBackstop.ts` rule library and
// returns SuspectedConditionFact[] — the canonical wellness-plan
// "Possible Conditions" list, FROM RULES ONLY (no AI involvement).
//
// The narrative AI later writes prose evidence + what_to_ask_doctor for
// each entry, but the entries themselves are immutable.

import { runSuspectedConditionsBackstop, type SuspectedConditionEntry } from '../suspectedConditionsBackstop.ts';
import type { LabValue } from '../buildPlan.ts';

export interface SuspectedConditionFact {
  name: string;
  category: SuspectedConditionEntry['category'];
  confidence: 'high' | 'moderate';
  evidence: string;
  confirmatory_tests: string[];
  icd10: string;
  what_to_ask_doctor: string;
  source: 'deterministic';
}

interface Input {
  age: number | null;
  sex: 'male' | 'female' | null;
  labs: LabValue[];
  conditionsLower: string;
  symptomsLower: string;
  medsLower: string;
}

export function buildConditionList(input: Input): SuspectedConditionFact[] {
  // Map our LabValue → backstop's labValues shape
  const labValues = input.labs.map(l => ({
    marker_name: l.marker,
    value: l.value,
    unit: l.unit,
    optimal_flag: l.flag,
  }));

  const raw = runSuspectedConditionsBackstop({
    age: input.age,
    sex: input.sex,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    medsLower: input.medsLower,
    labValues,
    aiSuspectedConditions: [], // pure deterministic — no AI input
  });

  // Drop low-confidence entries — wellness plan is for high+moderate only.
  return raw
    .filter(c => c.confidence === 'high' || c.confidence === 'moderate')
    .map(c => ({
      name: c.name,
      category: c.category,
      confidence: c.confidence,
      evidence: c.evidence,
      confirmatory_tests: c.confirmatory_tests,
      icd10: c.icd10,
      what_to_ask_doctor: c.what_to_ask_doctor,
      source: 'deterministic' as const,
    }));
}
