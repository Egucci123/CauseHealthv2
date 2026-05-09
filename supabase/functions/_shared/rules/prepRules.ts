// supabase/functions/_shared/rules/prepRules.ts
//
// Pre-analytical prep instructions (biotin, fasting, AM testosterone,
// cycle phase, recent illness, exercise). Wraps the existing
// `preAnalytical.ts` module — the deep logic stays there; this just
// adapts the input shape.

import { buildPrepInstructions as buildRaw } from '../preAnalytical.ts';
import type { TestOrder } from './testRules.ts';

export interface PrepInstructionFact {
  category: 'fasting' | 'medication' | 'supplement' | 'timing' | 'lifestyle' | 'cycle';
  triggeredByTest: string;
  instruction: string;
  importance: 'critical' | 'recommended';
  source: string;
}

interface Input {
  age: number | null;
  sex: 'male' | 'female' | null;
  medsLower: string;
  supplementsLower: string;
  conditionsLower: string;
  symptomsLower: string;
  tests: TestOrder[];
}

export function buildPrepInstructions(input: Input): PrepInstructionFact[] {
  const retestTimeline = input.tests.map(t => ({ marker: t.name, _key: t.key }));
  const meds = input.medsLower.split(/\s+/).filter(Boolean);
  const supps = input.supplementsLower.split(/\s+/).filter(Boolean);

  return buildRaw({
    retestTimeline,
    meds,
    supps,
    sex: input.sex ?? '',
    conditionsLower: input.conditionsLower,
  }) as PrepInstructionFact[];
}
