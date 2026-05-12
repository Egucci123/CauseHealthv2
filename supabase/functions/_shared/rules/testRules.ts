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
import type { TestTier } from '../testIndications.ts';

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
  /** Tier classification — baseline / preventive / pattern / specialist
   *  / imaging. Used by doctor prep to group tests into sections. */
  tier?: TestTier;
}

export function buildTestList(ctx: InjectionContext): TestOrder[] {
  const requests = buildUniversalTestInjectionRequests(ctx);
  const out: TestOrder[] = [];
  const seen = new Set<string>();
  const seenNormalizedName = new Set<string>();

  // Normalize for display-name dedup. Two registry keys with the same
  // canonical name (e.g., dexa_female_65_or_risk vs dexa_if_long_term)
  // would otherwise both render as "DEXA Scan (Bone Density)" in the
  // patient's test list. Lower + strip parentheticals + collapse
  // whitespace gives the comparison key.
  const normalizeName = (s: string): string =>
    s.toLowerCase()
      .replace(/\([^)]*\)/g, ' ')      // strip parentheticals
      .replace(/[^a-z0-9]+/g, ' ')     // non-alphanumeric → space
      .replace(/\s+/g, ' ')
      .trim();

  for (const req of requests) {
    if (seen.has(req.key)) continue;
    const def = getRetest(req.key);
    if (!def) {
      console.warn(`[testRules] Unknown registry key: ${req.key} — dropped`);
      continue;
    }
    // Second dedup layer — display-name. Catches synonym registry keys.
    const normName = normalizeName(def.canonical);
    if (seenNormalizedName.has(normName)) continue;
    seen.add(req.key);
    seenNormalizedName.add(normName);
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
      tier: req.tier,
    });
  }

  // Sort: urgent first, then high, then moderate. Within tier, preserve
  // injection order (which already prioritizes baseline → conditional).
  const order = { urgent: 0, high: 1, moderate: 2 };
  out.sort((a, b) => order[a.priority] - order[b.priority]);

  return out;
}
