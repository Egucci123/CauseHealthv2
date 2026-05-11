// supabase/functions/_shared/alreadyOptimalFilter.ts
//
// Layer B — already-optimal filter. Universal rule: don't recommend a
// supplement / test / intervention if the user's relevant lab is already
// at goal.
//
// The Nona Lynn case: her omega-3 index was 7.9% (top of optimal).
// The plan recommended omega-3 anyway — wasted slot, wrong signal.
//
// Same pattern fixes vitamin D, B12, ferritin, magnesium, iron, etc.
// universally for every patient. Add a row to the OPTIMAL_THRESHOLDS
// table → the filter applies for every patient with that marker.
//
// Used in two places:
//   1. PRE-flight: feed the prompt the list of "already at goal" so the
//      AI never recommends them
//   2. POST-flight: scrub any matching supplement that snuck through,
//      and skip retest entries that are duplicative (marker is already
//      well within range — no value re-measuring in 12 weeks)

import { hasCondition } from './conditionAliases.ts';

export interface OptimalThreshold {
  /** Stable id. */
  key: string;
  /** Marker name patterns for lookup. */
  markerPatterns: RegExp[];
  /** Optional unit guard (e.g. ng/mL for vitamin D — refuse to fire if mismatch). */
  unitContains?: string;
  /** Range that counts as "already optimal" for this user — function returns
   *  the [min, max] given age + sex + conditions. Allows context-aware bounds. */
  optimalRange: (ctx: OptimalCtx) => [number | null, number | null];
  /** Supplement registry keys to suppress when this marker is at goal. */
  suppressSupplements?: string[];
  /** Retest registry keys to skip when at goal AND no critical reason to recheck. */
  suppressRetests?: string[];
  /** Plain-English message to inject into the prompt for the AI to honor. */
  noteForPrompt: string;
}

export interface OptimalCtx {
  age: number | null;
  sex: string | null;
  conditionsLower: string;
}

/**
 * Universal table. Adding a row covers every patient automatically.
 * Each marker is its own row — clear, auditable, easy to extend.
 */
export const OPTIMAL_THRESHOLDS: OptimalThreshold[] = [
  {
    key: 'omega_3_index',
    markerPatterns: [/omega[-\s]?3 (index|total)?/i, /^omega-3\b/i],
    unitContains: '%',
    optimalRange: () => [8, 12],
    suppressSupplements: ['omega_3'],
    suppressRetests: ['omega_3_index_retest'],
    noteForPrompt: 'Omega-3 index ≥ 8% — already at goal. DO NOT recommend omega-3 supplementation.',
  },
  {
    key: 'vitamin_d_25oh',
    markerPatterns: [/^vitamin d\b/i, /25[-\s]?(oh|hydroxy)/i, /25.?hydroxy.?vitamin/i],
    unitContains: 'ng/ml',
    // For most adults: 50-80 ng/mL is optimal. Postmenopausal women with
    // autoimmune dx: target upper end (60-80). Young healthy: 40-60 fine.
    optimalRange: (ctx) => {
      const lo = hasCondition(ctx.conditionsLower, 'osteoporosis') || hasCondition(ctx.conditionsLower, 'menopause_postmenopause') ? 60 : 50;
      return [lo, 100];
    },
    suppressSupplements: ['vit_d_3'],
    noteForPrompt: 'Vitamin D ≥ 50 ng/mL (or ≥ 60 if osteoporosis / postmenopausal) — already at goal. DO NOT auto-prescribe D3.',
  },
  {
    key: 'serum_b12',
    markerPatterns: [/(?:vitamin|vit\.?)\s*b[-\s]?12/i, /\bb[-\s]?12\b/i, /cobalamin/i, /serum\s*b[-\s]?12/i],
    unitContains: 'pg/ml',
    optimalRange: () => [500, 2000],
    suppressSupplements: ['b12_methyl'],
    suppressRetests: ['vit_b12'],
    noteForPrompt: 'Serum B12 ≥ 500 pg/mL — already at goal. DO NOT auto-prescribe B12 unless MMA or homocysteine is elevated (test-first rule).',
  },
  {
    key: 'ferritin_premenopausal_female',
    markerPatterns: [/^ferritin\b/i],
    unitContains: 'ng/ml',
    optimalRange: (ctx) => {
      const f = (ctx.sex ?? '').toLowerCase() === 'female';
      const ageNum = ctx.age ?? 50;
      // Premenopausal women: ferritin >75 (RLS), >50 (hair), >30 (deficiency line)
      // We define "already optimal" as ≥80 to leave room for hair + RLS targets.
      if (f && ageNum < 50) return [80, 250];
      // Men + post-menopausal women: 50–250 is fine
      return [50, 250];
    },
    noteForPrompt: 'Ferritin already in optimal range for age/sex — DO NOT recommend iron unless TIBC / sat / RBC indices show functional deficiency.',
  },
  {
    key: 'serum_magnesium_caveat',
    // Note: serum Mg is a poor marker. Even when "in range" we DON'T
    // suppress magnesium recommendations, because RBC Mg may show
    // intracellular deficiency. So this entry has NO suppressSupplements —
    // just a prompt note explaining the caveat.
    markerPatterns: [/^magnesium$/i, /serum magnesium/i],
    unitContains: 'mg/dl',
    optimalRange: () => [2.0, 2.5],
    noteForPrompt: 'Serum magnesium "in range" is unreliable — only ~1% of body Mg is serum. RBC magnesium is the better test. Continue to consider magnesium supplementation when sleep / muscle / anxiety symptoms are present.',
  },
  {
    key: 'glucose_a1c',
    markerPatterns: [/hemoglobin\s*a1c/i, /\ba1c\b/i, /hba1c/i, /hgba1c/i, /glycated\s*hemoglobin/i],
    unitContains: '%',
    optimalRange: () => [4.0, 5.6],
    suppressSupplements: ['berberine'],
    noteForPrompt: 'A1c < 5.7 — already at goal. DO NOT recommend berberine or insulin-resistance protocols unless a different marker (TG, fasting insulin) is out of range.',
  },
  {
    key: 'free_t4_on_replacement',
    markerPatterns: [/^t4,? free/i, /^free\W*t4/i, /^ft4\b/i],
    unitContains: 'ng/dl',
    optimalRange: () => [1.4, 1.8],     // upper-half target on replacement
    noteForPrompt: 'Free T4 ≥ 1.4 ng/dL — within optimal-on-replacement range. (However, TSH-on-replacement is the dominant adequacy signal — check that flag.)',
  },
];

export interface AlreadyOptimalResult {
  /** Marker keys that fired the filter. */
  optimalKeys: string[];
  /** Supplement keys to suppress. */
  suppressSupplementKeys: Set<string>;
  /** Retest keys to suppress. */
  suppressRetestKeys: Set<string>;
  /** Plain-English notes for the prompt. */
  promptNotes: string[];
  /** Audit entries — what we matched and why. */
  audit: Array<{ key: string; markerName: string; value: number; range: [number | null, number | null] }>;
}

function readMarker(
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null }>,
  patterns: RegExp[],
  unitContains?: string,
): { value: number; unit: string | null; markerName: string } | null {
  for (const v of labValues) {
    const name = String(v.marker_name ?? '');
    if (!patterns.some(re => re.test(name))) continue;
    if (unitContains && !(v.unit ?? '').toLowerCase().includes(unitContains.toLowerCase())) continue;
    const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
    if (Number.isFinite(num)) return { value: num, unit: v.unit ?? null, markerName: name };
  }
  return null;
}

export function detectAlreadyOptimal(
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null }>,
  ctx: OptimalCtx,
): AlreadyOptimalResult {
  const result: AlreadyOptimalResult = {
    optimalKeys: [],
    suppressSupplementKeys: new Set(),
    suppressRetestKeys: new Set(),
    promptNotes: [],
    audit: [],
  };

  for (const t of OPTIMAL_THRESHOLDS) {
    const m = readMarker(labValues, t.markerPatterns, t.unitContains);
    if (!m) continue;
    const [min, max] = t.optimalRange(ctx);
    const inRange =
      (min == null || m.value >= min) &&
      (max == null || m.value <= max);
    if (!inRange) continue;

    result.optimalKeys.push(t.key);
    result.audit.push({ key: t.key, markerName: m.markerName, value: m.value, range: [min, max] });
    (t.suppressSupplements ?? []).forEach(k => result.suppressSupplementKeys.add(k));
    (t.suppressRetests ?? []).forEach(k => result.suppressRetestKeys.add(k));
    result.promptNotes.push(t.noteForPrompt);
  }
  return result;
}

/** Apply post-flight: drop supplements + retests whose canonical key is in
 *  suppress sets. Returns the count dropped per category. */
export function applyAlreadyOptimalScrub(
  plan: { supplement_stack: any[]; retest_timeline: any[] },
  res: AlreadyOptimalResult,
): { suppressedSupplements: string[]; suppressedRetests: string[] } {
  const suppressedSupplements: string[] = [];
  const suppressedRetests: string[] = [];

  if (res.suppressSupplementKeys.size > 0) {
    plan.supplement_stack = plan.supplement_stack.filter((s: any) => {
      if (s?._key && res.suppressSupplementKeys.has(s._key)) {
        suppressedSupplements.push(s._key);
        return false;
      }
      // Also catch by free-text nutrient name → key heuristic
      const nutrientText = String(s?.nutrient ?? '').toLowerCase();
      // Check each suppressed key's known phrase aliases (loose — these are
      // safe-to-drop, not safety-critical)
      for (const k of res.suppressSupplementKeys) {
        const aliasMatch =
          (k === 'omega_3' && /omega[-\s]?3|fish oil|epa|dha|algal/.test(nutrientText)) ||
          (k === 'vit_d_3' && /vitamin d3?\b|cholecalciferol/.test(nutrientText)) ||
          (k === 'b12_methyl' && /\bb[-\s]?12\b|cobalamin/.test(nutrientText)) ||
          (k === 'berberine' && /berberine/.test(nutrientText));
        if (aliasMatch) {
          suppressedSupplements.push(k);
          return false;
        }
      }
      return true;
    });
  }

  if (res.suppressRetestKeys.size > 0) {
    plan.retest_timeline = plan.retest_timeline.filter((r: any) => {
      if (r?._key && res.suppressRetestKeys.has(r._key)) {
        suppressedRetests.push(r._key);
        return false;
      }
      return true;
    });
  }

  return { suppressedSupplements, suppressedRetests };
}
