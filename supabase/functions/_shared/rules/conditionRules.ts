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
  /** Stable key — same across lab analysis, wellness plan, doctor prep.
   * Routes by 'nafld' / 'osa' / 'hemoconcentration' / 'ir_dyslipidemia' / etc. */
  key: string;
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
  bmi: number | null;
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
  const filtered = raw.filter(c => c.confidence === 'high' || c.confidence === 'moderate');

  // BMI-driven evidence augmentation (universal). When BMI is ≥30 and a
  // BMI-sensitive condition fired (NAFLD / IR-dyslip / OSA), append BMI
  // to the evidence string and consider confidence escalation. Surfacing
  // BMI in the cards lets the patient see why the cards fired so strongly.
  const bmi = input.bmi;
  return filtered.map(c => {
    const augmented = augmentWithBmi(c, bmi);
    return {
      key: augmented.key ?? slugifyConditionName(augmented.name),
      name: augmented.name,
      category: augmented.category,
      confidence: augmented.confidence,
      evidence: augmented.evidence,
      confirmatory_tests: augmented.confirmatory_tests,
      icd10: augmented.icd10,
      what_to_ask_doctor: augmented.what_to_ask_doctor,
      source: 'deterministic' as const,
    };
  });
}

/** Last-resort slug if the backstop didn't stamp a key (e.g., AI-emitted
 * entries during legacy v1 path). Universal — produces a stable key from
 * the human-readable name. */
function slugifyConditionName(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')   // strip parenthetical
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown_condition';
}

function augmentWithBmi(
  c: SuspectedConditionEntry,
  bmi: number | null,
): SuspectedConditionEntry {
  if (bmi == null) return c;
  const isObese = bmi >= 30;
  const isOverweight = bmi >= 25;
  const isNafld = /nafld|fatty liver|nash/i.test(c.name);
  const isIRDyslip = /insulin resistance|metabolic syndrome|atherogenic dyslipid/i.test(c.name);
  const isOSA = /sleep apnea|osa/i.test(c.name);

  if (isNafld && isOverweight) {
    return {
      ...c,
      evidence: `${c.evidence} BMI ${bmi} (${isObese ? 'obese class — significantly raises NAFLD risk' : 'overweight — adds to NAFLD risk'}).`,
      confidence: isObese ? 'high' : c.confidence,
    };
  }
  if (isIRDyslip && isOverweight) {
    return {
      ...c,
      evidence: `${c.evidence} BMI ${bmi} (${isObese ? 'obese — central adiposity drives hyperinsulinemia' : 'overweight — adds to IR pattern'}).`,
      confidence: isObese ? 'high' : c.confidence,
    };
  }
  if (isOSA && isObese) {
    return {
      ...c,
      evidence: `${c.evidence} BMI ${bmi} (obese — strong independent OSA risk factor; STOP-BANG sensitivity rises sharply).`,
      confidence: 'high',  // OSA + obesity is a high-confidence pairing
    };
  }
  return c;
}
