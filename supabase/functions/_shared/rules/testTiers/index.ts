// supabase/functions/_shared/rules/testTiers/index.ts
//
// TIER COMBINER — gathers all tier-tagged indications into one
// flat list with `tier` field attached. Drop-in replacement for
// the monolithic TEST_INDICATIONS list when the consumer wants
// tier-aware grouping.

import type { TestIndication, TestTier } from './types.ts';
import { BASELINE_SHARED }   from './baseline-shared.ts';
import { BASELINE_MALE }     from './baseline-male.ts';
import { BASELINE_FEMALE }   from './baseline-female.ts';
import { IMAGING_INDICATIONS } from './imaging.ts';

export interface TieredIndication extends TestIndication {
  tier: TestTier;
}

function tag(arr: TestIndication[], tier: TestTier): TieredIndication[] {
  return arr.map(i => ({ ...i, tier }));
}

/** All baseline + imaging indications with tier field attached.
 *  Pattern-driven indications still live in testIndications.ts and
 *  carry tier='pattern' implicitly. */
export const TIERED_INDICATIONS: TieredIndication[] = [
  ...tag(BASELINE_SHARED,       'baseline'),
  ...tag(BASELINE_MALE,         'baseline'),
  ...tag(BASELINE_FEMALE,       'baseline'),
  ...tag(IMAGING_INDICATIONS,   'imaging'),
];
