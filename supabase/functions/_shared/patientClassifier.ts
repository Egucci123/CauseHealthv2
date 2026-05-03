// supabase/functions/_shared/patientClassifier.ts
//
// Severity-aware patient mode classifier.
//
// REPLACES the binary `isHealthyMode` (which counted "out of range" flags as
// a percentage of total markers — Nona Lynn had 4 critical-tier flags out of
// 81 markers = 5%, classified as "healthy"; the plan therefore set 6-month
// retest cadence and shipped only 2 supplements).
//
// New rule: ANY critical-tier flag → critical_treatment, regardless of the
// percentage. Mode determines retest cadence, supplement cap, phase tone,
// and required pre-flight items. Universal — works for every condition.

import { CONDITION_REGISTRY, hasCondition } from './conditionAliases.ts';

export type PatientMode =
  | 'critical_treatment'
  | 'treatment'
  | 'symptomatic'
  | 'optimization'
  | 'pristine';

export interface ClassifyInput {
  labValues: Array<{ optimal_flag?: string | null }>;
  symptoms: Array<{ symptom?: string; severity?: number | null }>;
  conditionsLower: string;
  symptomsLower: string;
}

export interface ClassifyResult {
  mode: PatientMode;
  isOptimization: boolean;
  reasons: string[];
  flags: {
    criticalCount: number;
    outOfRangeCount: number;
    chronicConditionCount: number;
    heavySymptomCount: number;
    moderateSymptomCount: number;
  };
  retestCap: number;
  retestCadence: '12 weeks' | '6 months';
}

const CRITICAL_FLAGS = new Set(['critical_high', 'critical_low']);
const OUT_OF_RANGE_FLAGS = new Set([
  'critical_high', 'critical_low',
  'high', 'low',
  'suboptimal_high', 'suboptimal_low',
  'deficient', 'elevated',
  'watch',
]);

export function classifyPatient(input: ClassifyInput): ClassifyResult {
  const reasons: string[] = [];

  let criticalCount = 0;
  let outOfRangeCount = 0;
  for (const v of input.labValues) {
    const f = (v.optimal_flag ?? '').toLowerCase();
    if (CRITICAL_FLAGS.has(f)) criticalCount++;
    if (OUT_OF_RANGE_FLAGS.has(f)) outOfRangeCount++;
  }

  // Chronic-dx detection — UNIVERSAL: every Tier-1 condition counts.
  // Adding a new Tier-1 condition to the registry → automatically counted.
  // No hardcoded list of "chronic conditions" anywhere in this function.
  let chronicConditionCount = 0;
  const chronicKeysHit: string[] = [];
  for (const def of CONDITION_REGISTRY) {
    if (def.tier === 1 && hasCondition(input.conditionsLower, def.key)) {
      chronicConditionCount++;
      chronicKeysHit.push(def.key);
    }
  }

  let heavySymptomCount = 0;
  let moderateSymptomCount = 0;
  for (const s of input.symptoms) {
    const sev = typeof s.severity === 'number' ? s.severity : 0;
    if (sev >= 6) heavySymptomCount++;
    else if (sev >= 4) moderateSymptomCount++;
  }

  let mode: PatientMode;
  if (criticalCount > 0) {
    mode = 'critical_treatment';
    reasons.push(`${criticalCount} critical-tier flag${criticalCount > 1 ? 's' : ''}`);
  } else if (outOfRangeCount > 0 && (outOfRangeCount / Math.max(1, input.labValues.length)) >= 0.10) {
    mode = 'treatment';
    reasons.push(`${outOfRangeCount}/${input.labValues.length} markers out of range`);
  } else if (chronicConditionCount >= 1) {
    mode = 'treatment';
    reasons.push(`chronic dx: ${chronicKeysHit.join(', ')}`);
  } else if (heavySymptomCount >= 3) {
    mode = 'treatment';
    reasons.push(`${heavySymptomCount} severity-6+ symptoms`);
  } else if (heavySymptomCount + moderateSymptomCount >= 3) {
    mode = 'symptomatic';
    reasons.push(`${heavySymptomCount + moderateSymptomCount} mid-tier+ symptoms but labs clean`);
  } else if (outOfRangeCount === 0 && heavySymptomCount === 0 && moderateSymptomCount === 0) {
    mode = 'pristine';
    reasons.push('all markers in range, no symptoms reported');
  } else {
    mode = 'optimization';
    reasons.push('limited findings — optimization tier');
  }

  let retestCap: number;
  let retestCadence: '12 weeks' | '6 months';
  switch (mode) {
    case 'critical_treatment': retestCap = 20; retestCadence = '12 weeks'; break;
    case 'treatment':          retestCap = 20; retestCadence = '12 weeks'; break;
    case 'symptomatic':        retestCap = 14; retestCadence = '12 weeks'; break;
    case 'optimization':       retestCap = 10; retestCadence = '6 months'; break;
    case 'pristine':           retestCap = 6;  retestCadence = '6 months'; break;
  }

  return {
    mode,
    isOptimization: mode === 'optimization' || mode === 'pristine',
    reasons,
    flags: {
      criticalCount, outOfRangeCount, chronicConditionCount,
      heavySymptomCount, moderateSymptomCount,
    },
    retestCap, retestCadence,
  };
}
