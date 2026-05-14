// crossMarkerSanity.ts
// ──────────────────────────────────────────────────────────────────────
// Cross-marker arithmetic consistency checks. Catches OCR/AI extraction
// errors that are individually plausible but internally inconsistent.
//
// Each rule has a clinical basis — labs report values that obey known
// arithmetic identities (Friedewald formula, MCV/MCH/MCHC indices,
// protein fractions, differential counts). When measured values violate
// the identity by more than the per-rule tolerance, we attach a
// `sanity_warning` to every marker involved so the UI can prompt the
// user to verify against the source image.
//
// Tolerances are deliberately generous — real biological variation +
// rounding + analyzer drift means strict equality fails on ~20% of
// healthy patients. The goal is catching big OCR errors (decimal lost,
// wrong row read), not flagging routine lab variance.

import { canonicalKey } from './markerCanonical.ts';

interface MaybeLab {
  marker_name?: string;
  canonical_key?: string;
  value?: number | string | null;
  unit?: string | null;
  sanity_warning?: string;
}

/** Helper: find a row by canonical key. */
function find(values: MaybeLab[], key: string): MaybeLab | undefined {
  return values.find(v => (v.canonical_key ?? canonicalKey(v.marker_name ?? '')) === key);
}

/** Helper: numeric value or null. */
function num(v: MaybeLab | undefined): number | null {
  if (!v) return null;
  const n = Number(v.value);
  return Number.isFinite(n) ? n : null;
}

/** Append a sanity warning to a row, comma-separating if one already exists. */
function warn(v: MaybeLab, msg: string) {
  v.sanity_warning = v.sanity_warning ? `${v.sanity_warning} | ${msg}` : msg;
}

interface RuleCtx {
  values: MaybeLab[];
  get: (key: string) => MaybeLab | undefined;
  val: (key: string) => number | null;
}

interface SanityRule {
  name: string;
  /** Run the rule. Mutates the row(s) with sanity_warning if violated. */
  run: (ctx: RuleCtx) => void;
}

const RULES: SanityRule[] = [
  // ── (1) Hemoglobin × 3 ≈ Hematocrit (Rule of Three) ─────────────────
  // Clinical identity that holds for normal-shape RBCs. Tolerance ±3
  // absolute points to allow microcytosis / macrocytosis / dehydration.
  {
    name: 'hgb_x3_eq_hct',
    run: ({ val, get }) => {
      const hgb = val('hemoglobin');
      const hct = val('hematocrit');
      if (hgb == null || hct == null) return;
      const expected = hgb * 3;
      const delta = Math.abs(expected - hct);
      if (delta > 3) {
        const hgbRow = get('hemoglobin')!;
        const hctRow = get('hematocrit')!;
        const note = `Rule-of-three mismatch: Hgb ${hgb} × 3 = ${expected.toFixed(1)} but Hct = ${hct} (delta ${delta.toFixed(1)}). One of these values may have been misread.`;
        warn(hgbRow, note);
        warn(hctRow, note);
      }
    },
  },

  // ── (2) MCHC ≈ Hgb ÷ Hct × 100 ──────────────────────────────────────
  // MCHC is a calculated index. If the extracted MCHC disagrees with
  // (Hgb / Hct × 100) by > 2 g/dL, one of the three was misread.
  {
    name: 'mchc_from_hgb_hct',
    run: ({ val, get }) => {
      const hgb = val('hemoglobin');
      const hct = val('hematocrit');
      const mchc = val('mchc');
      if (hgb == null || hct == null || mchc == null || hct === 0) return;
      const calc = (hgb / hct) * 100;
      const delta = Math.abs(calc - mchc);
      if (delta > 2) {
        const note = `MCHC inconsistency: Hgb ${hgb} ÷ Hct ${hct} × 100 = ${calc.toFixed(1)} but reported MCHC = ${mchc} (delta ${delta.toFixed(1)}).`;
        warn(get('hemoglobin')!, note);
        warn(get('hematocrit')!, note);
        warn(get('mchc')!, note);
      }
    },
  },

  // ── (3) MCH ≈ Hgb × 10 ÷ RBC ────────────────────────────────────────
  // Same family as #2. ±3 pg tolerance.
  {
    name: 'mch_from_hgb_rbc',
    run: ({ val, get }) => {
      const hgb = val('hemoglobin');
      const rbc = val('rbc');
      const mch = val('mch');
      if (hgb == null || rbc == null || mch == null || rbc === 0) return;
      const calc = (hgb * 10) / rbc;
      const delta = Math.abs(calc - mch);
      if (delta > 3) {
        const note = `MCH inconsistency: Hgb ${hgb} × 10 ÷ RBC ${rbc} = ${calc.toFixed(1)} but reported MCH = ${mch} (delta ${delta.toFixed(1)}).`;
        warn(get('hemoglobin')!, note);
        warn(get('rbc')!, note);
        warn(get('mch')!, note);
      }
    },
  },

  // ── (4) MCV ≈ Hct × 10 ÷ RBC ────────────────────────────────────────
  // ±8 fL tolerance — RBC indices have more measurement noise.
  {
    name: 'mcv_from_hct_rbc',
    run: ({ val, get }) => {
      const hct = val('hematocrit');
      const rbc = val('rbc');
      const mcv = val('mcv');
      if (hct == null || rbc == null || mcv == null || rbc === 0) return;
      const calc = (hct * 10) / rbc;
      const delta = Math.abs(calc - mcv);
      if (delta > 8) {
        const note = `MCV inconsistency: Hct ${hct} × 10 ÷ RBC ${rbc} = ${calc.toFixed(1)} but reported MCV = ${mcv} (delta ${delta.toFixed(1)}).`;
        warn(get('hematocrit')!, note);
        warn(get('rbc')!, note);
        warn(get('mcv')!, note);
      }
    },
  },

  // ── (5) LDL ≤ Total Cholesterol − HDL (LDL cannot exceed non-HDL) ───
  // Hard physical constraint. Friedewald LDL = TC - HDL - TG/5.
  // If reported LDL > TC - HDL + 5 mg/dL slack, something is misread.
  {
    name: 'ldl_le_tc_minus_hdl',
    run: ({ val, get }) => {
      const tc = val('cholesterol_total');
      const hdl = val('hdl');
      const ldl = val('ldl');
      if (tc == null || hdl == null || ldl == null) return;
      const maxAllowed = tc - hdl;
      if (ldl > maxAllowed + 5) {
        const note = `LDL ${ldl} cannot exceed Total Chol ${tc} − HDL ${hdl} = ${maxAllowed} (LDL is a fraction of total). One of these values may have been misread.`;
        warn(get('cholesterol_total')!, note);
        warn(get('hdl')!, note);
        warn(get('ldl')!, note);
      }
    },
  },

  // ── (6) Friedewald check: LDL ≈ TC − HDL − TG/5 (when TG < 400) ─────
  // Only fires when triglycerides are available and < 400 (Friedewald
  // is unreliable above that). ±20 mg/dL tolerance (direct-LDL vs
  // calculated-LDL differ legitimately, esp. at high TG).
  {
    name: 'friedewald_consistency',
    run: ({ val, get }) => {
      const tc = val('cholesterol_total');
      const hdl = val('hdl');
      const tg = val('triglycerides');
      const ldl = val('ldl');
      if (tc == null || hdl == null || tg == null || ldl == null) return;
      if (tg >= 400) return; // Friedewald invalid above 400
      const friedewald = tc - hdl - tg / 5;
      const delta = Math.abs(friedewald - ldl);
      if (delta > 20) {
        const note = `LDL Friedewald check: TC ${tc} − HDL ${hdl} − TG/5 ${(tg/5).toFixed(0)} = ${friedewald.toFixed(0)} but reported LDL = ${ldl} (delta ${delta.toFixed(0)}). If the lab measured direct-LDL this can be normal; otherwise verify.`;
        warn(get('ldl')!, note);
      }
    },
  },

  // ── (7) ANC + ALC + AMC + AEC + ABC ≈ WBC ───────────────────────────
  // Sum of absolute differential counts ≈ total WBC. Tolerance ±15% of
  // WBC (real labs round + may omit basophils).
  {
    name: 'wbc_diff_sum',
    run: ({ val, get }) => {
      const wbc = val('wbc');
      const anc = val('anc');
      const alc = val('alc');
      const amc = val('amc');
      const aec = val('aec');
      const abc = val('abc');
      if (wbc == null) return;
      // Need at least ANC + ALC + AMC to meaningfully sum
      const parts = [anc, alc, amc, aec, abc].filter(p => p != null) as number[];
      if (parts.length < 3) return;
      const sum = parts.reduce((s, n) => s + n, 0);
      const tolerance = Math.max(wbc * 0.15, 0.5);
      const delta = Math.abs(sum - wbc);
      if (delta > tolerance) {
        const note = `Differential sum check: ANC+ALC+AMC+AEC+ABC = ${sum.toFixed(2)} but reported WBC = ${wbc.toFixed(2)} (delta ${delta.toFixed(2)}). One of the absolute counts may have been misread.`;
        warn(get('wbc')!, note);
        for (const k of ['anc','alc','amc','aec','abc']) {
          const r = get(k); if (r) warn(r, note);
        }
      }
    },
  },

  // ── (8) Differential % sum ≈ 100 ────────────────────────────────────
  // Neutrophils% + Lymphocytes% + Monocytes% + Eosinophils% + Basophils% ≈ 100.
  // Tolerance ±5%.
  {
    name: 'diff_pct_sum',
    run: ({ val, get }) => {
      const parts: { key: string; v: number | null }[] = [
        { key: 'neutrophils_pct', v: val('neutrophils_pct') },
        { key: 'lymphocytes_pct', v: val('lymphocytes_pct') },
        { key: 'monocytes_pct',   v: val('monocytes_pct')   },
        { key: 'eosinophils_pct', v: val('eosinophils_pct') },
        { key: 'basophils_pct',   v: val('basophils_pct')   },
      ];
      const present = parts.filter(p => p.v != null) as { key: string; v: number }[];
      // Need at least 3 of the 5 percentages to meaningfully sum (some
      // panels omit basophils / eosinophils).
      if (present.length < 4) return;
      const sum = present.reduce((s, p) => s + p.v, 0);
      // If we have all 5, expect ~100. If 4, expect 95-100. If 3, skip.
      const expected = present.length === 5 ? 100 : 97;
      if (Math.abs(sum - expected) > 5) {
        const note = `Differential % sum check: ${present.map(p => `${p.key}=${p.v}`).join(' + ')} = ${sum.toFixed(1)} (expected ~${expected}±5).`;
        for (const p of present) {
          const r = get(p.key); if (r) warn(r, note);
        }
      }
    },
  },

  // ── (9) Direct + Indirect Bilirubin ≈ Total Bilirubin ───────────────
  // Tolerance ±0.3 mg/dL (rounding + assay drift).
  {
    name: 'bilirubin_fractions',
    run: ({ val, get }) => {
      const total = val('bilirubin_total');
      const direct = val('bilirubin_direct');
      const indirect = val('bilirubin_indirect');
      if (total == null) return;
      // Need both direct AND indirect to sum
      if (direct == null || indirect == null) return;
      const sum = direct + indirect;
      if (Math.abs(sum - total) > 0.3) {
        const note = `Bilirubin fractions: Direct ${direct} + Indirect ${indirect} = ${sum.toFixed(2)} but Total = ${total} (delta ${Math.abs(sum-total).toFixed(2)}).`;
        warn(get('bilirubin_total')!, note);
        warn(get('bilirubin_direct')!, note);
        warn(get('bilirubin_indirect')!, note);
      }
    },
  },

  // ── (10) Albumin + Globulin ≈ Total Protein ─────────────────────────
  // Tolerance ±0.3 g/dL.
  {
    name: 'protein_fractions',
    run: ({ val, get }) => {
      const tp = val('protein_total');
      const alb = val('albumin');
      const glob = val('globulin');
      if (tp == null || alb == null || glob == null) return;
      const sum = alb + glob;
      if (Math.abs(sum - tp) > 0.3) {
        const note = `Protein fractions: Albumin ${alb} + Globulin ${glob} = ${sum.toFixed(2)} but Total Protein = ${tp} (delta ${Math.abs(sum-tp).toFixed(2)}).`;
        warn(get('protein_total')!, note);
        warn(get('albumin')!, note);
        warn(get('globulin')!, note);
      }
    },
  },

  // ── (11) Iron ÷ TIBC × 100 ≈ Transferrin Saturation ─────────────────
  // Tolerance ±5%.
  {
    name: 'tsat_from_iron_tibc',
    run: ({ val, get }) => {
      const iron = val('iron');
      const tibc = val('tibc');
      const tsat = val('tsat');
      if (iron == null || tibc == null || tsat == null || tibc === 0) return;
      const calc = (iron / tibc) * 100;
      if (Math.abs(calc - tsat) > 5) {
        const note = `Iron studies inconsistency: Iron ${iron} ÷ TIBC ${tibc} × 100 = ${calc.toFixed(1)}% but reported TSat = ${tsat}% (delta ${Math.abs(calc-tsat).toFixed(1)}).`;
        warn(get('iron')!, note);
        warn(get('tibc')!, note);
        warn(get('tsat')!, note);
      }
    },
  },

  // ── (12) Non-HDL Cholesterol ≈ TC − HDL ─────────────────────────────
  // Tolerance ±5 mg/dL.
  {
    name: 'non_hdl_consistency',
    run: ({ val, get }) => {
      const tc = val('cholesterol_total');
      const hdl = val('hdl');
      const nonHdl = val('non_hdl');
      if (tc == null || hdl == null || nonHdl == null) return;
      const calc = tc - hdl;
      if (Math.abs(calc - nonHdl) > 5) {
        const note = `Non-HDL check: TC ${tc} − HDL ${hdl} = ${calc} but reported Non-HDL = ${nonHdl}.`;
        warn(get('cholesterol_total')!, note);
        warn(get('hdl')!, note);
        warn(get('non_hdl')!, note);
      }
    },
  },
];

/**
 * Run all cross-marker sanity checks against a list of extracted lab values.
 * Mutates rows in-place by attaching `sanity_warning` to inconsistent values.
 * Returns the same array for chaining + a summary count of rules fired.
 */
export function crossMarkerSanity(values: any[]): { values: any[]; warningsFired: string[] } {
  const ctx: RuleCtx = {
    values: values as MaybeLab[],
    get: (key) => find(values as MaybeLab[], key),
    val: (key) => num(find(values as MaybeLab[], key)),
  };
  const fired: string[] = [];
  for (const rule of RULES) {
    const before = (values as MaybeLab[]).filter(v => v.sanity_warning).length;
    try { rule.run(ctx); }
    catch (e) { console.warn(`[sanity] rule ${rule.name} threw:`, (e as Error).message); }
    const after = (values as MaybeLab[]).filter(v => v.sanity_warning).length;
    if (after > before) fired.push(rule.name);
  }
  return { values, warningsFired: fired };
}
