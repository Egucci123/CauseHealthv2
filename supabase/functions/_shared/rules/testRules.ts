// supabase/functions/_shared/rules/testRules.ts
//
// DETERMINISTIC TEST LIST BUILDER
// ===============================
// Pure function. Input: patient context. Output: ordered list of
// canonical TestOrder entries. NO AI INVOLVEMENT — the AI cannot add to,
// remove from, or rename anything in this list.
//
// All rules live in one place: `_shared/testInjectors.ts` →
// `applyUniversalRules()`. To add a new test pairing, edit that function.
// To add a new test entirely, also add an entry to retestRegistry.ts.
//
// This file is the canonical entry point — buildPlan() calls only this.

import { buildUniversalTestInjectionRequests, type InjectionContext } from '../testInjectors.ts';
import { getRetest, specialistForKey, type Specialist } from '../retestRegistry.ts';

export interface TestOrder {
  key: string;                       // canonical registry key
  name: string;                      // canonical display name
  whyShort: string;                  // 6-15 words for UI
  whyLong: string;                   // trigger letter prepended
  trigger: 'a' | 'b' | 'c' | 'd' | 'e';
  icd10: string;
  icd10Description: string;
  priority: 'urgent' | 'high' | 'moderate';
  specialist: Specialist;
  insuranceNote: string;
  emoji: string;
}

export function buildTestList(ctx: InjectionContext): TestOrder[] {
  const requests = buildUniversalTestInjectionRequests(ctx);
  const out: TestOrder[] = [];
  const seen = new Set<string>();

  for (const req of requests) {
    if (seen.has(req.key)) continue;
    const def = getRetest(req.key);
    if (!def) {
      console.warn(`[testRules] Unknown registry key: ${req.key} — dropped`);
      continue;
    }
    seen.add(req.key);
    out.push({
      key: req.key,
      name: def.canonical,
      whyShort: req.whyShort,
      whyLong: `(${req.trigger}) ${req.whyShort}`,
      trigger: req.trigger,
      icd10: def.icd10,
      icd10Description: def.icd10Description,
      priority: def.defaultPriority,
      specialist: specialistForKey(def.key),
      insuranceNote: def.insuranceNote,
      emoji: '🧪',
    });
  }

  // Sort: urgent first, then high, then moderate. Within tier, preserve
  // injection order (which already prioritizes baseline → conditional).
  const order = { urgent: 0, high: 1, moderate: 2 };
  out.sort((a, b) => order[a.priority] - order[b.priority]);

  return out;
}
