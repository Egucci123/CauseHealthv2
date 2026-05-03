// supabase/functions/_shared/testQualityFlagger.ts
//
// Layer D — test-quality flagger. UNIVERSAL rule: when a marker is "in range"
// but the test itself is unreliable for *this* patient's situation, surface
// the caveat and recommend the better test.
//
// Doctors usually look at ONE number and call it normal. CauseHealth's
// differentiator is knowing WHICH tests lie.
//
// Examples:
//   - Serum magnesium (only ~1% of body Mg is serum; RBC Mg is the truth)
//   - Serum ferritin during inflammation (acute-phase reactant — falsely high)
//   - TSH alone on thyroid replacement (need Free T4/T3/rT3 too)
//   - Serum B12 on metformin/PPI users (misses tissue deficiency — need MMA)
//   - Total T without SHBG + Free T (calculations differ from raw)
//
// Adding a flag = pushing one row to RULES. Universal coverage automatically.

import { isOnMed } from './medicationAliases.ts';
import { hasCondition } from './conditionAliases.ts';

export interface TestQualityFlag {
  /** Stable id. */
  key: string;
  /** Plain-English headline. */
  title: string;
  /** 1-2 sentence explanation of why the test is unreliable here. */
  detail: string;
  /** What was observed (marker + value). */
  evidence: string;
  /** Better test to ask for — registry keys to inject as retest entries. */
  betterTestKeys: string[];
  /** Severity for UI rendering. */
  severity: 'high' | 'moderate';
}

interface QualityRule {
  id: string;
  /** Marker patterns for the SUSPECT test (the one with the caveat). */
  suspectMarkerPatterns: RegExp[];
  /** Optional unit guard. */
  unitContains?: string;
  /** Conditions / meds / patient context that trigger the caveat. Each
   *  function receives the lab + meds context and returns true if rule fires. */
  triggers: (ctx: QualityCtx) => boolean;
  /** Headline + detail. */
  copy: { title: string; detail: string };
  /** Better test registry keys. */
  betterTestKeys: string[];
  severity: 'high' | 'moderate';
}

export interface QualityCtx {
  conditionsLower: string;
  medsLower: string;
  symptomsLower: string;
  age: number | null;
  sex: string | null;
  /** All lab values for this draw. */
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>;
  /** Whether hs-CRP / inflammation marker is elevated (used for ferritin caveat). */
  inflammationElevated: boolean;
}

const RULES: QualityRule[] = [
  // ── Serum magnesium — universally unreliable ─────────────────────────
  {
    id: 'serum_mg_unreliable',
    suspectMarkerPatterns: [/^magnesium$/i, /^serum magnesium/i],
    unitContains: 'mg/dl',
    triggers: () => true,    // ALWAYS — the test is intrinsically poor
    copy: {
      title: 'Serum magnesium is a poor test',
      detail: 'Only ~1% of body magnesium is in serum — the rest is intracellular. A "normal" serum Mg can mask significant deficiency. RBC magnesium reflects what\'s actually inside cells.',
    },
    betterTestKeys: ['rbc_magnesium'],
    severity: 'moderate',
  },

  // ── Serum ferritin during inflammation ───────────────────────────────
  {
    id: 'ferritin_during_inflammation',
    suspectMarkerPatterns: [/^ferritin\b/i],
    triggers: (ctx) => ctx.inflammationElevated,
    copy: {
      title: 'Ferritin is unreliable when inflammation is elevated',
      detail: 'Ferritin is an acute-phase reactant — chronic inflammation falsely raises it, hiding iron deficiency. With your inflammation marker elevated, the full iron panel (TIBC + transferrin saturation) is the truth.',
    },
    betterTestKeys: ['iron_panel'],
    severity: 'high',
  },

  // ── TSH alone on thyroid replacement ─────────────────────────────────
  {
    id: 'tsh_alone_on_replacement',
    suspectMarkerPatterns: [/^tsh\b/i, /^thyroid stimulating hormone/i],
    triggers: (ctx) => isOnMed(ctx.medsLower, 'thyroid_replacement'),
    copy: {
      title: 'TSH alone misses the picture on thyroid replacement',
      detail: 'TSH is a feedback signal — slow to change. On replacement, you need Free T4 + Free T3 + Reverse T3 to see whether the dose is converting properly. TSH "in range" while T4 is low-normal is common and explains lingering symptoms.',
    },
    betterTestKeys: ['thyroid_panel', 'reverse_t3', 'thyroid_antibodies'],
    severity: 'high',
  },

  // ── Serum B12 on metformin / PPI / vegetarian ────────────────────────
  {
    id: 'serum_b12_long_term_med',
    suspectMarkerPatterns: [/^vitamin b[-\s]?12$/i, /^b[-\s]?12$/i, /^cobalamin/i],
    triggers: (ctx) =>
      isOnMed(ctx.medsLower, 'metformin') ||
      isOnMed(ctx.medsLower, 'ppi') ||
      /vegetarian|vegan/i.test(ctx.conditionsLower),
    copy: {
      title: "Serum B12 lies when you're on metformin, a PPI, or vegetarian",
      detail: 'Serum B12 reflects the past few days of intake. Tissue deficiency shows up first on MMA + homocysteine. Long-term metformin / PPI users routinely show "normal" B12 with elevated MMA — that\'s the deficiency.',
    },
    betterTestKeys: ['vit_b12_workup'],
    severity: 'high',
  },

  // ── Total T without SHBG + Free T ────────────────────────────────────
  {
    id: 'total_t_without_shbg',
    suspectMarkerPatterns: [/^testosterone,?\s*total/i, /^total testosterone/i],
    triggers: (ctx) => {
      // Only fire if SHBG was NOT measured in this draw
      return !ctx.labValues.some(v => /^shbg\b/i.test(String(v.marker_name ?? '')));
    },
    copy: {
      title: 'Total testosterone alone misses bioavailable testosterone',
      detail: 'High SHBG binds testosterone and reduces what\'s actually available to your tissues. A "normal" total T with high SHBG can still produce low-T symptoms. Free T + SHBG complete the picture.',
    },
    betterTestKeys: ['testosterone_total_free', 'shbg'],
    severity: 'moderate',
  },

  // ── Creatinine in muscular patients ──────────────────────────────────
  {
    id: 'creatinine_in_muscular',
    suspectMarkerPatterns: [/^creatinine\b/i],
    triggers: (ctx) =>
      hasCondition(ctx.conditionsLower, 'ckd') ||
      /resistance training|weightlift|powerlift|bodybuild/i.test(ctx.conditionsLower) ||
      /creatine/i.test(ctx.medsLower),
    copy: {
      title: 'Creatinine over-estimates kidney damage in muscular patients',
      detail: 'Creatinine is produced by muscle tissue. People with high muscle mass — or anyone supplementing creatine — show artificially elevated serum creatinine. Cystatin C measures kidney function independent of muscle mass.',
    },
    betterTestKeys: ['cystatin_c_egfr'],
    severity: 'moderate',
  },
];

function readMarker(
  labValues: QualityCtx['labValues'],
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

export function detectTestQualityIssues(ctx: QualityCtx): TestQualityFlag[] {
  const out: TestQualityFlag[] = [];
  for (const r of RULES) {
    const m = readMarker(ctx.labValues, r.suspectMarkerPatterns, r.unitContains);
    if (!m) continue;
    if (!r.triggers(ctx)) continue;
    out.push({
      key: r.id,
      title: r.copy.title,
      detail: r.copy.detail,
      evidence: `${m.markerName} ${m.value} ${m.unit ?? ''}`,
      betterTestKeys: r.betterTestKeys,
      severity: r.severity,
    });
  }
  return out;
}
