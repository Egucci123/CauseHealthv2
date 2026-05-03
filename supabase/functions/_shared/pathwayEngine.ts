// supabase/functions/_shared/pathwayEngine.ts
//
// THE universal pathway engine. Single function — `runPathways()` — that:
//   1. Loops every condition the user has matched (via registry aliases).
//      For each, fires its declared `pathwayHints.requiredTests` and
//      `pathwayHints.requiredSupplements`. Adding a new condition with
//      its hints in conditionAliases.ts gets the same treatment for free.
//   2. Loops every medication-class the user is on. Fires the class's
//      declared `requiresTest` and `empiricalSupp`.
//   3. Loops every symptom the user reported above severity threshold.
//      Fires the symptom's declared workup tests (sex-specific extras
//      automatically applied).
//
// THIS REPLACES every hardcoded `if (hasIBD) ...inject calprotectin...,
// if (hasT2D) ...inject UACR...` block in the edge functions. Add a new
// condition = update the registry. The engine picks it up. Universal.
//
// Outputs into `plan.retest_timeline` and `plan.supplement_stack` via
// the canonical pushers from retestRegistry / supplementRegistry — which
// dedup by canonical key. Re-running the engine is idempotent.

import { CONDITION_REGISTRY, hasCondition, ConditionDef } from './conditionAliases.ts';
import { MEDICATION_REGISTRY, isOnMed, MedClassDef } from './medicationAliases.ts';
import { SYMPTOM_REGISTRY, getSymptom } from './symptomTestMap.ts';
import { pushRetestByKey } from './retestRegistry.ts';
import { pushSupplementByKey } from './supplementRegistry.ts';

export interface PathwayInput {
  conditionsLower: string;
  medsLower: string;
  symptomsTextWithSeverity: string;     // "fatigue (5/10), hair loss (8/10)"
  symptomsArray: Array<{ symptom?: string; severity?: number | null }>;
  sex: string | null;
  retestCadence: string;                // '12 weeks' or '6 months'
  // Plan parts the engine writes into.
  plan: {
    retest_timeline: any[];
    supplement_stack: any[];
  };
  // User's currently-active supplements text — combined with AI-generated
  // stack to suppress already-supplemented entries.
  alreadyTakingText: string;
}

export interface PathwayAuditEntry {
  source: 'condition' | 'medication' | 'symptom';
  sourceKey: string;     // e.g. 'hashimotos' or 'metformin' or 'fatigue'
  kind: 'test' | 'supplement';
  itemKey: string;       // e.g. 'thyroid_antibodies' or 'selenium'
  inserted: boolean;
}

export interface PathwayResult {
  conditionsMatched: string[];
  medClassesMatched: string[];
  symptomsMatched: string[];
  audit: PathwayAuditEntry[];
}

export function runPathways(input: PathwayInput): PathwayResult {
  const audit: PathwayAuditEntry[] = [];
  const conditionsMatched: string[] = [];
  const medClassesMatched: string[] = [];
  const symptomsMatched: string[] = [];

  // ── 1. Condition pathways ──────────────────────────────────────────────
  // Every Tier-1 condition the user has → push its declared tests + supps.
  // Add a new Tier-1 condition: add to CONDITION_REGISTRY, fill pathwayHints.
  // The engine loops over it automatically. ZERO edge-function code change.
  for (const def of CONDITION_REGISTRY as ConditionDef[]) {
    if (!hasCondition(input.conditionsLower, def.key)) continue;
    conditionsMatched.push(def.key);

    for (const testKey of def.pathwayHints?.requiredTests ?? []) {
      const inserted = pushRetestByKey(
        input.plan.retest_timeline,
        testKey,
        `Required for ${def.label}`,
        'c',
        input.retestCadence,
      );
      audit.push({ source: 'condition', sourceKey: def.key, kind: 'test', itemKey: testKey, inserted });
    }
    for (const suppKey of def.pathwayHints?.requiredSupplements ?? []) {
      const inserted = pushSupplementByKey(
        input.plan.supplement_stack,
        suppKey,
        input.alreadyTakingText,
      );
      audit.push({ source: 'condition', sourceKey: def.key, kind: 'supplement', itemKey: suppKey, inserted });
    }
  }

  // ── 2. Medication pathways ─────────────────────────────────────────────
  // For each med class the user is on: fire required monitoring tests +
  // empirical-allowed supplements. Same universal pattern.
  for (const def of MEDICATION_REGISTRY as MedClassDef[]) {
    if (!isOnMed(input.medsLower, def.key)) continue;
    medClassesMatched.push(def.key);

    for (const testKey of def.requiresTest ?? []) {
      const inserted = pushRetestByKey(
        input.plan.retest_timeline,
        testKey,
        `On ${def.label} — monitoring required`,
        'b',
        input.retestCadence,
      );
      audit.push({ source: 'medication', sourceKey: def.key, kind: 'test', itemKey: testKey, inserted });
    }
    for (const suppKey of def.empiricalSupp ?? []) {
      const inserted = pushSupplementByKey(
        input.plan.supplement_stack,
        suppKey,
        input.alreadyTakingText,
      );
      audit.push({ source: 'medication', sourceKey: def.key, kind: 'supplement', itemKey: suppKey, inserted });
    }
  }

  // ── 3. Symptom pathways ────────────────────────────────────────────────
  // For every symptom the user reported with severity >= the symptom's
  // threshold (default 4), fire the declared workup tests + sex-specific
  // extras. Same loop, no per-symptom code anywhere.
  for (const def of SYMPTOM_REGISTRY) {
    const minSev = def.minSeverity ?? 4;
    // The user must have at least one symptom matching this def's aliases
    // AT OR ABOVE the severity threshold. We check structured array first
    // so we honor severity properly.
    const matched = input.symptomsArray.find((s) => {
      const sev = typeof s.severity === 'number' ? s.severity : 0;
      const sympText = String(s.symptom ?? '');
      return sev >= minSev && def.aliases.some(re => re.test(sympText));
    });
    if (!matched) continue;
    symptomsMatched.push(def.key);

    const tests = [...def.tests];
    const lowerSex = (input.sex ?? '').toLowerCase();
    if (lowerSex === 'male' && def.maleAdds) tests.push(...def.maleAdds);
    if (lowerSex === 'female' && def.femaleAdds) tests.push(...def.femaleAdds);

    for (const testKey of tests) {
      const inserted = pushRetestByKey(
        input.plan.retest_timeline,
        testKey,
        `Symptom workup: ${def.label}`,
        'a',
        input.retestCadence,
      );
      audit.push({ source: 'symptom', sourceKey: def.key, kind: 'test', itemKey: testKey, inserted });
    }
  }

  return { conditionsMatched, medClassesMatched, symptomsMatched, audit };
}
