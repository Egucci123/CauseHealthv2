// crossMarkerSanity.test.ts — verify each cross-marker arithmetic rule.
// Each case: build a small set of lab rows, run crossMarkerSanity, then
// assert which rules fired (or didn't).

import { crossMarkerSanity } from "../crossMarkerSanity.ts";
import { canonicalize } from "../markerCanonical.ts";

function row(name: string, value: number) {
  const c = canonicalize(name);
  return {
    marker_name: name,
    value,
    canonical_key: c?.key,
    canonical_name: c?.canonical,
  };
}

interface T {
  name: string;
  rows: any[];
  expectFire: string[];      // rule names expected to fire
  expectNotFire?: string[];  // rule names that should NOT fire on this data
}

const TESTS: T[] = [
  // ── (1) Hgb*3 ≈ Hct ──
  {
    name: "Hgb*3 ≈ Hct holds for normal patient",
    rows: [row('Hemoglobin', 14.0), row('Hematocrit', 42.0)],
    expectFire: [], expectNotFire: ['hgb_x3_eq_hct'],
  },
  {
    name: "Hgb*3 ≠ Hct: misread (Hgb 14, Hct 30)",
    rows: [row('Hemoglobin', 14.0), row('Hematocrit', 30.0)],
    expectFire: ['hgb_x3_eq_hct'],
  },

  // ── (2) MCHC from Hgb / Hct ──
  {
    name: "MCHC consistent with Hgb / Hct × 100",
    rows: [row('Hemoglobin', 14.0), row('Hematocrit', 42.0), row('MCHC', 33.3)],
    expectFire: [], expectNotFire: ['mchc_from_hgb_hct'],
  },
  {
    name: "MCHC inconsistent with Hgb / Hct (Hgb 14, Hct 42 implies MCHC ~33.3, reported 28)",
    rows: [row('Hemoglobin', 14.0), row('Hematocrit', 42.0), row('MCHC', 28.0)],
    expectFire: ['mchc_from_hgb_hct'],
  },

  // ── (3) MCH ≈ Hgb*10 / RBC ──
  {
    name: "MCH consistent with Hgb*10 / RBC",
    rows: [row('Hemoglobin', 14.0), row('RBC', 4.7), row('MCH', 29.8)],
    expectFire: [], expectNotFire: ['mch_from_hgb_rbc'],
  },
  {
    name: "MCH inconsistent (Hgb 14, RBC 4.7 → expect 29.8, reported 50)",
    rows: [row('Hemoglobin', 14.0), row('RBC', 4.7), row('MCH', 50)],
    expectFire: ['mch_from_hgb_rbc'],
  },

  // ── (4) MCV ≈ Hct*10 / RBC ──
  {
    name: "MCV consistent with Hct*10 / RBC",
    rows: [row('Hematocrit', 42.0), row('RBC', 4.7), row('MCV', 89.4)],
    expectFire: [], expectNotFire: ['mcv_from_hct_rbc'],
  },
  {
    name: "MCV inconsistent (Hct 42, RBC 4.7 → expect 89.4, reported 130)",
    rows: [row('Hematocrit', 42.0), row('RBC', 4.7), row('MCV', 130)],
    expectFire: ['mcv_from_hct_rbc'],
  },

  // ── (5) LDL ≤ TC − HDL ──
  {
    name: "LDL within bounds (TC 200, HDL 50, LDL 130)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('LDL', 130)],
    expectFire: [], expectNotFire: ['ldl_le_tc_minus_hdl'],
  },
  {
    name: "LDL exceeds TC − HDL (TC 200, HDL 50, LDL 180 — physically impossible)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('LDL', 180)],
    expectFire: ['ldl_le_tc_minus_hdl'],
  },

  // ── (6) Friedewald consistency ──
  {
    name: "Friedewald holds (TC 200, HDL 50, TG 100 → LDL ~130, reported 128)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('Triglycerides', 100), row('LDL', 128)],
    expectFire: [], expectNotFire: ['friedewald_consistency'],
  },
  {
    name: "Friedewald violated (TC 200, HDL 50, TG 100 → LDL ~130, reported 30)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('Triglycerides', 100), row('LDL', 30)],
    expectFire: ['friedewald_consistency'],
  },
  {
    name: "Friedewald skipped when TG ≥ 400 (invalid above that)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('Triglycerides', 500), row('LDL', 30)],
    expectFire: [], expectNotFire: ['friedewald_consistency'],
  },

  // ── (7) WBC differential sum ──
  {
    name: "WBC ≈ sum of absolute counts",
    rows: [row('WBC', 7.0), row('Absolute Neutrophils', 4.2), row('Absolute Lymphocytes', 2.0), row('Absolute Monocytes', 0.7)],
    expectFire: [], expectNotFire: ['wbc_diff_sum'],
  },
  {
    name: "WBC sum mismatch (WBC 7, parts sum to 12.0)",
    rows: [row('WBC', 7.0), row('Absolute Neutrophils', 8.0), row('Absolute Lymphocytes', 3.0), row('Absolute Monocytes', 1.0)],
    expectFire: ['wbc_diff_sum'],
  },

  // ── (8) Differential % sum ≈ 100 ──
  {
    name: "Differential % sum to 100",
    rows: [
      row('Neutrophils %', 60), row('Lymphocytes %', 30),
      row('Monocytes %', 7), row('Eosinophils %', 2), row('Basophils %', 1),
    ],
    expectFire: [], expectNotFire: ['diff_pct_sum'],
  },
  {
    name: "Differential % sum off (60+30+7+2+1 = 100; force it to 80)",
    rows: [
      row('Neutrophils %', 50), row('Lymphocytes %', 20),
      row('Monocytes %', 5), row('Eosinophils %', 4), row('Basophils %', 1),
    ],
    expectFire: ['diff_pct_sum'],
  },

  // ── (9) Bilirubin fractions ──
  {
    name: "Bilirubin Direct + Indirect ≈ Total",
    rows: [row('Bilirubin Total', 1.0), row('Bilirubin Direct', 0.3), row('Bilirubin Indirect', 0.7)],
    expectFire: [], expectNotFire: ['bilirubin_fractions'],
  },
  {
    name: "Bilirubin fractions inconsistent (0.3+0.7=1.0 but total=2.5)",
    rows: [row('Bilirubin Total', 2.5), row('Bilirubin Direct', 0.3), row('Bilirubin Indirect', 0.7)],
    expectFire: ['bilirubin_fractions'],
  },

  // ── (10) Protein fractions ──
  {
    name: "Albumin + Globulin ≈ Total Protein",
    rows: [row('Protein, Total', 7.0), row('Albumin', 4.5), row('Globulin', 2.5)],
    expectFire: [], expectNotFire: ['protein_fractions'],
  },
  {
    name: "Protein fractions inconsistent (4.5+2.5=7.0 but TP=9.0)",
    rows: [row('Protein, Total', 9.0), row('Albumin', 4.5), row('Globulin', 2.5)],
    expectFire: ['protein_fractions'],
  },

  // ── (11) TSat from Iron / TIBC ──
  {
    name: "TSat consistent with Iron / TIBC",
    rows: [row('Iron', 100), row('Iron Binding Capacity', 300), row('Transferrin Saturation', 33)],
    expectFire: [], expectNotFire: ['tsat_from_iron_tibc'],
  },
  {
    name: "TSat inconsistent (Iron 100, TIBC 300 → 33% but reported 70%)",
    rows: [row('Iron', 100), row('Iron Binding Capacity', 300), row('Transferrin Saturation', 70)],
    expectFire: ['tsat_from_iron_tibc'],
  },

  // ── (12) Non-HDL ≈ TC − HDL ──
  {
    name: "Non-HDL consistent (TC 200 − HDL 50 = 150, reported 148)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('Non-HDL Cholesterol', 148)],
    expectFire: [], expectNotFire: ['non_hdl_consistency'],
  },
  {
    name: "Non-HDL inconsistent (TC 200 − HDL 50 = 150, reported 200)",
    rows: [row('Cholesterol, Total', 200), row('HDL', 50), row('Non-HDL Cholesterol', 200)],
    expectFire: ['non_hdl_consistency'],
  },

  // ── Healthy panel: no rules should fire ──
  {
    name: "Healthy patient, no inconsistencies anywhere",
    rows: [
      row('Hemoglobin', 14.0), row('Hematocrit', 42.0),
      row('RBC', 4.7), row('MCV', 89), row('MCH', 29.8), row('MCHC', 33.3),
      row('WBC', 7.0), row('Absolute Neutrophils', 4.2), row('Absolute Lymphocytes', 2.0), row('Absolute Monocytes', 0.7), row('Absolute Eosinophils', 0.08), row('Absolute Basophils', 0.02),
      row('Neutrophils %', 60), row('Lymphocytes %', 29), row('Monocytes %', 8), row('Eosinophils %', 2), row('Basophils %', 1),
      row('Cholesterol, Total', 180), row('HDL', 55), row('Triglycerides', 100), row('LDL', 105),
      row('Bilirubin Total', 0.6), row('Bilirubin Direct', 0.2), row('Bilirubin Indirect', 0.4),
      row('Protein, Total', 7.0), row('Albumin', 4.4), row('Globulin', 2.6),
      row('Iron', 100), row('Iron Binding Capacity', 300), row('Transferrin Saturation', 33),
    ],
    expectFire: [],
  },
];

let pass = 0, fail = 0;
for (const t of TESTS) {
  const { values, warningsFired } = crossMarkerSanity(t.rows);
  // Reset sanity_warning for next test (test rows are fresh anyway).
  void values;
  const firedSet = new Set(warningsFired);
  const missing = t.expectFire.filter(r => !firedSet.has(r));
  const extra = t.expectNotFire?.filter(r => firedSet.has(r)) ?? [];
  // Also reject any UNEXPECTED firings on healthy/clean cases
  const unexpected = (t.expectFire.length === 0)
    ? warningsFired.filter(r => !(t.expectNotFire ?? []).includes(r))
    : [];
  if (missing.length === 0 && extra.length === 0 && unexpected.length === 0) {
    console.log(`  ✅ ${t.name}`);
    pass++;
  } else {
    console.log(`  ❌ ${t.name}`);
    if (missing.length) console.log(`     missing fires: ${missing.join(', ')}`);
    if (extra.length) console.log(`     unexpected fires: ${extra.join(', ')}`);
    if (unexpected.length) console.log(`     surprise fires: ${unexpected.join(', ')}`);
    fail++;
  }
}

console.log(`\n======================================================`);
console.log(`  CROSS-MARKER SANITY — ${pass} pass / ${fail} fail`);
console.log(`======================================================`);
if (fail) Deno.exit(1);
