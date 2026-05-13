// MARKER OVERLAP TRAPS — regression tests for "marker A's regex
// accidentally matches marker B" landmines.
//
// The Hgb=A1c bug (5.5 g/dL fatal anemia from A1c 5.5%) was caused by
// /^hemoglobin\b/i matching both "Hemoglobin" and "Hemoglobin A1c".
// Same family of bugs lurks for any marker whose name is a prefix of
// another marker. This file fires synthetic inputs designed to TRIGGER
// each known overlap and asserts the engine doesn't crossmatch.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function input(opts: { age: number; sex: 'male'|'female'; labs: LabValue[] }): PatientInput {
  return {
    age: opts.age, sex: opts.sex, heightCm: 175, weightKg: 75, bmi: 24.5,
    conditionsList: [], conditionsLower: '', medsList: [], medsLower: '',
    symptomsList: [], symptomsLower: '',
    supplementsList: [], supplementsLower: '',
    labs: opts.labs,
    labsLower: opts.labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

const TRAPS: Array<{
  id: string;
  description: string;
  input: PatientInput;
  /** Patterns that MUST NOT appear in the generated conditions list. */
  mustNotMatchCondition: RegExp[];
  /** Patterns that MUST appear (the actual underlying issue, if any). */
  mustMatchCondition?: RegExp[];
}> = [
  // ── TRAP 1: Hemoglobin A1c value ≠ Hemoglobin value ──────────────────
  // Athletic male, A1c 5.5%, real Hgb 14.2 g/dL. Engine must NOT report
  // anemia. (The original Tim-class bug — Hgb 5.5 g/dL is fatal.)
  {
    id: 'hgb_vs_a1c_athletic_male',
    description: 'A1c 5.5% listed BEFORE Hgb 14.2 — must not pull A1c as Hgb',
    input: input({
      age: 28, sex: 'male',
      labs: [
        lab('Hemoglobin A1c', 5.5, '%'),
        lab('Hemoglobin', 14.2, 'g/dL'),
        lab('Ferritin', 28, 'ng/mL', 'low'),
      ],
    }),
    mustNotMatchCondition: [/hgb 5\.5|hemoglobin 5\.5/i],
    mustMatchCondition: [/iron deficiency/i], // ferritin 28 alone should still flag IDA
  },

  // ── TRAP 2: Glucose tolerance test ≠ fasting glucose ─────────────────
  // Patient had an OGTT (2-hr post-load Glucose 180 — entirely normal
  // post-load result). Engine must NOT flag as diabetes because fasting
  // glucose isn't measured. Listed OGTT-first to trigger first-match.
  {
    id: 'glucose_tolerance_vs_fasting',
    description: 'OGTT 2-hr Glucose 180 listed BEFORE basic Glucose 88 — must not flag T2D',
    input: input({
      age: 35, sex: 'female',
      labs: [
        lab('Glucose Tolerance Test, 2-hr post 75g', 180, 'mg/dL'),
        lab('Glucose', 88, 'mg/dL'),
        lab('Hemoglobin A1c', 5.3, '%'),
      ],
    }),
    mustNotMatchCondition: [/type 2 diabetes \(undiagnosed\)/i],
  },

  // ── TRAP 3: Iron Saturation ≠ Serum Iron ─────────────────────────────
  // Iron saturation 27% (normal) listed first. Serum iron also normal.
  // Plus ferritin high. Iron overload pattern should still recognize
  // the ferritin signal but must NOT mistake 27% for a high serum iron.
  {
    id: 'iron_saturation_vs_serum_iron',
    description: 'Iron Saturation 27% before serum Iron 85 — must not pull saturation as iron value',
    input: input({
      age: 45, sex: 'male',
      labs: [
        lab('Iron Saturation', 27, '%'),
        lab('Iron Binding Capacity, Total (TIBC)', 310, 'µg/dL'),
        lab('Iron', 85, 'µg/dL'),
        lab('Ferritin', 580, 'ng/mL', 'high'),
      ],
    }),
    mustNotMatchCondition: [/iron \d{1,2}\s*µg.*?(?:>175|elevated)/i],
  },

  // ── TRAP 4: VLDL Cholesterol ≠ LDL Cholesterol (real Evan-case bug) ───
  // The `/ldl chol/i` substring matched "VLDL Cholesterol" because it has
  // no anchors. Engine then reported "LDL 41" when actual LDL was 166.
  // Universal — applies to any user with both LDL and VLDL on their panel.
  {
    id: 'ldl_vs_vldl_substring_match',
    description: 'VLDL Cholesterol 41 listed BEFORE LDL Cholesterol 166 — engine must not pull VLDL value as LDL',
    input: input({
      age: 28, sex: 'male',
      labs: [
        // Order matters: VLDL first to provoke the substring-match bug
        lab('VLDL Cholesterol', 41, 'mg/dL', 'high'),
        lab('Cholesterol, Total', 269, 'mg/dL', 'critical_high'),
        lab('LDL Cholesterol', 166, 'mg/dL', 'critical_high'),
        lab('HDL Cholesterol', 62, 'mg/dL'),
        lab('Triglycerides', 327, 'mg/dL', 'critical_high'),
      ],
    }),
    // Statin not at goal would have evidence including "LDL ##" — assert
    // the value mentioned is NOT 41. Match the wrong-value pattern explicitly.
    mustNotMatchCondition: [/\bLDL\s*41\b|LDL\s*41\s*mg/i],
  },

  // ── TRAP 5: VLDL on a user with statin — statin_not_at_goal must use real LDL ─
  {
    id: 'ldl_vs_vldl_with_statin',
    description: 'Patient on atorvastatin with VLDL 41 + LDL 166 — statin_not_at_goal must read LDL 166, not 41',
    input: {
      ...input({
        age: 28, sex: 'male',
        labs: [
          lab('VLDL Cholesterol', 41, 'mg/dL', 'high'),
          lab('LDL Cholesterol', 166, 'mg/dL', 'critical_high'),
          lab('Triglycerides', 327, 'mg/dL', 'critical_high'),
        ],
      }),
      medsList: ['Atorvastatin'], medsLower: 'atorvastatin',
    },
    mustNotMatchCondition: [/\bLDL\s*41\b|LDL\s*41\s*mg/i],
    mustMatchCondition: [/LDL\s*166/i],
  },

  // ── TRAP 6: Neutrophil % ≠ Neutrophil Absolute count (real Evan-case bug) ─
  // Detector treated "Neutrophils 59 %" (the percentage) as if it were the
  // absolute neutrophil count (which has units like ×10³/uL). 59 > 10
  // threshold → fired false leukocytosis on a perfectly healthy CBC.
  {
    id: 'neutrophil_percent_vs_absolute',
    description: 'Neutrophils 59 % (normal) + Neutrophils (Absolute) 4.3 — must NOT fire leukocytosis',
    input: input({
      age: 28, sex: 'male',
      labs: [
        // Percentage first to provoke the bug
        lab('Neutrophils', 59, '%'),
        lab('Neutrophils (Absolute)', 4.3, 'x10E3/uL'),
        lab('WBC', 7.2, 'x10E3/uL'),
        lab('Lymphocytes (Absolute)', 2.0, 'x10E3/uL'),
        lab('Lymphocytes %', 28, '%'),
      ],
    }),
    mustNotMatchCondition: [/leukocyt|stress.?leukogram|leukocytic/i],
  },

  // ── TRAP 7: Genuine leukocytosis still fires when absolute IS elevated ──
  // Inverse of TRAP 6 — make sure the fix didn't break real detection.
  {
    id: 'genuine_neutrophil_leukocytosis',
    description: 'Neutrophils (Absolute) 12.1 — must STILL fire leukocytosis',
    input: input({
      age: 28, sex: 'male',
      labs: [
        lab('Neutrophils', 75, '%'),                  // % also high but irrelevant
        lab('Neutrophils (Absolute)', 12.1, 'x10E3/uL', 'high'),
        lab('WBC', 16, 'x10E3/uL', 'high'),
        lab('Lymphocytes %', 15, '%', 'low'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/leukocyt|stress.?leukogram/i],
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  PROACTIVE SWEEP — every confusable-name pair I could think of
  //  Each test puts the confuser BEFORE the target in labs array order to
  //  exercise the worst-case for mark()'s first-match-wins behavior.
  // ═══════════════════════════════════════════════════════════════════════

  // ── HDL vs Non-HDL ───────────────────────────────────────────────────
  {
    id: 'hdl_vs_non_hdl',
    description: 'Non-HDL Cholesterol 148 (high) listed before HDL 38 — must not flag the HDL pattern using non-HDL value',
    input: input({
      age: 45, sex: 'male',
      labs: [
        lab('Non-HDL Cholesterol', 148, 'mg/dL', 'high'),
        lab('HDL Cholesterol', 38, 'mg/dL', 'low'),
        lab('LDL Cholesterol', 110, 'mg/dL'),
        lab('Triglycerides', 180, 'mg/dL'),
      ],
    }),
    mustNotMatchCondition: [/\bHDL\s*148/i, /HDL\s*148\s*mg/i],
    mustMatchCondition: [/low hdl|HDL\s*38/i],
  },

  // ── Cholesterol Total vs HDL/LDL/VLDL ────────────────────────────────
  {
    id: 'cholesterol_total_vs_others',
    description: 'HDL/LDL/VLDL Cholesterol listed before Total Cholesterol — total cholesterol matching must not pick HDL value',
    input: input({
      age: 50, sex: 'male',
      labs: [
        lab('HDL Cholesterol', 38, 'mg/dL', 'low'),
        lab('LDL Cholesterol', 170, 'mg/dL', 'high'),
        lab('VLDL Cholesterol', 45, 'mg/dL', 'high'),
        lab('Cholesterol, Total', 280, 'mg/dL', 'critical_high'),
      ],
    }),
    // Total cholesterol shouldn't be misrepresented anywhere in conditions
    mustNotMatchCondition: [/Total\s+Cholesterol\s*38|Total\s+Cholesterol\s*45|Total\s+Cholesterol\s*170/i],
  },

  // ── MCH vs MCHC ───────────────────────────────────────────────────────
  // Both start with "MCH" — bare `/mch/i` matches both. We DON'T explicitly
  // detect on these but verify no detector pulls MCHC value as MCH.
  {
    id: 'mch_vs_mchc',
    description: 'MCHC 34 listed before MCH 29 — pattern detection must not confuse them',
    input: input({
      age: 30, sex: 'female',
      labs: [
        lab('MCHC', 34, 'g/dL'),
        lab('MCH', 29, 'pg'),
        lab('MCV', 88, 'fL'),
        lab('Hemoglobin', 13.0, 'g/dL'),
        lab('Ferritin', 50, 'ng/mL'),
      ],
    }),
    // Should produce a clean plan with no bogus anemia subtype call-outs
    mustNotMatchCondition: [],
  },

  // ── Free T3 vs Reverse T3 vs Total T3 ────────────────────────────────
  {
    id: 'free_t3_vs_reverse_t3_vs_total_t3',
    description: 'Reverse T3 high listed before Free T3 low — detectors must pull correct values',
    input: input({
      age: 38, sex: 'female',
      labs: [
        lab('Reverse T3', 28, 'ng/dL', 'high'),
        lab('Triiodothyronine (T3), Free', 1.9, 'pg/mL', 'low'),
        lab('Triiodothyronine (T3)', 95, 'ng/dL'),
        lab('TSH', 2.5, 'mIU/L'),
        lab('Free T4', 1.1, 'ng/dL'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/reverse t3|free t3|conversion|sick euthyroid/i],
  },

  // ── Free T4 vs Total T4 ──────────────────────────────────────────────
  {
    id: 'free_t4_vs_total_t4',
    description: 'Total T4 in range listed before Free T4 low — central hypothyroid detector must pick Free T4',
    input: input({
      age: 45, sex: 'female',
      labs: [
        lab('Thyroxine (T4)', 7.2, 'ug/dL'),
        lab('Free T4', 0.6, 'ng/dL', 'low'),
        lab('TSH', 1.2, 'mIU/L'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/central hypothyroid|free t4.*non-elevated tsh/i],
  },

  // ── B12 (serum) vs Active B12 / Holotranscobalamin ───────────────────
  // Active B12 (holotranscobalamin) is a different test — we don't have a
  // detector for it. Trap verifies serum B12 detector doesn't grab Active.
  {
    id: 'b12_serum_vs_active',
    description: 'Active B12 listed before serum B12 low — B12 deficiency detector must pull serum value',
    input: input({
      age: 60, sex: 'female',
      labs: [
        lab('Active B12 (Holotranscobalamin)', 35, 'pmol/L'),
        lab('Vitamin B12', 190, 'pg/mL', 'low'),
        lab('Methylmalonic Acid', 0.5, 'umol/L'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/b12 deficien|low b12/i],
  },

  // ── Cortisol AM vs PM ────────────────────────────────────────────────
  {
    id: 'cortisol_am_vs_pm',
    description: 'Cortisol PM listed before Cortisol AM — AM cortisol detector must pull AM value',
    input: input({
      age: 42, sex: 'female',
      labs: [
        lab('Cortisol PM', 14, 'ug/dL'),
        lab('Cortisol - AM', 3.0, 'ug/dL', 'low'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/cortisol|adrenal insuffic|addison/i],
  },

  // ── Bilirubin Total vs Direct vs Indirect ────────────────────────────
  {
    id: 'bilirubin_total_vs_direct',
    description: 'Direct Bilirubin in range listed before Total — Gilbert detector must pull Total',
    input: input({
      age: 28, sex: 'female',
      labs: [
        lab('Bilirubin Direct', 0.2, 'mg/dL'),
        lab('Bilirubin Total', 1.5, 'mg/dL', 'high'),
        lab('ALT', 22, 'U/L'),
        lab('AST', 24, 'U/L'),
        lab('Alkaline Phosphatase', 60, 'U/L'),
      ],
    }),
    mustNotMatchCondition: [],
    mustMatchCondition: [/gilbert|isolated hyperbilirubinem/i],
  },

  // ── Apolipoprotein A vs Apolipoprotein B ─────────────────────────────
  {
    id: 'apo_a_vs_apo_b',
    description: 'Apo A-1 listed before Apo B — ApoB detector must pull ApoB value',
    input: input({
      age: 50, sex: 'male',
      labs: [
        lab('Apolipoprotein A-1', 130, 'mg/dL'),
        lab('Apolipoprotein B', 115, 'mg/dL', 'high'),
        lab('LDL Cholesterol', 95, 'mg/dL'),
      ],
    }),
    // ApoB > 100 + LDL borderline → ApoB high should still fire correctly
    mustNotMatchCondition: [/ApoB\s*130|apolipoprotein b\s*130/i],
  },

  // ── Calcium Total vs Ionized Calcium ─────────────────────────────────
  {
    id: 'calcium_total_vs_ionized',
    description: 'Ionized Calcium listed before Calcium Total — hypercalcemia must pull total value',
    input: input({
      age: 65, sex: 'female',
      labs: [
        lab('Ionized Calcium', 1.4, 'mmol/L'),
        lab('Calcium', 11.5, 'mg/dL', 'high'),
        lab('PTH', 35, 'pg/mL'),
      ],
    }),
    // Hypercalcemia detector fires on Ca > 10.5 — must pull Ca value 11.5 not the ionized 1.4
    mustNotMatchCondition: [/Calcium\s*1\.4/i],
  },

  // ── Lymphocyte % vs Absolute ─────────────────────────────────────────
  {
    id: 'lymphocyte_percent_vs_absolute',
    description: 'Lymphocytes 25% (normal) + Absolute 1.8 — must not confuse for either lymphopenia or lymphocytosis',
    input: input({
      age: 35, sex: 'male',
      labs: [
        lab('Lymphocytes', 25, '%'),
        lab('Lymphocytes (Absolute)', 1.8, 'x10E3/uL'),
        lab('WBC', 7.2, 'x10E3/uL'),
        lab('Neutrophils (Absolute)', 4.3, 'x10E3/uL'),
      ],
    }),
    mustNotMatchCondition: [/leukocytos|leukopen/i],
  },

  // ── Monocyte / Eosinophil / Basophil %/absolute ──────────────────────
  {
    id: 'cbc_diff_all_percentages_normal',
    description: 'Healthy adult with all CBC differential % markers present — engine must not fire any false-high pattern',
    input: input({
      age: 30, sex: 'female',
      labs: [
        lab('Neutrophils', 60, '%'),
        lab('Lymphocytes', 30, '%'),
        lab('Monocytes', 7, '%'),
        lab('Eosinophils', 2, '%'),
        lab('Basophils', 1, '%'),
        lab('WBC', 6.5, 'x10E3/uL'),
        lab('Neutrophils (Absolute)', 3.9, 'x10E3/uL'),
        lab('Lymphocytes (Absolute)', 2.0, 'x10E3/uL'),
        lab('Monocytes (Absolute)', 0.5, 'x10E3/uL'),
        lab('Eosinophils (Absolute)', 0.1, 'x10E3/uL'),
        lab('Basophils (Absolute)', 0.05, 'x10E3/uL'),
      ],
    }),
    // No CBC pattern should fire — all numbers normal
    mustNotMatchCondition: [/leukocytos|leukopen|neutropen|thrombocyto|hemolysi/i],
  },
];

let totalChecks = 0, totalFailures = 0;
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  MARKER OVERLAP TRAPS — regression test');
console.log(`  ${TRAPS.length} synthetic traps for "regex matches wrong marker" bugs.`);
console.log('══════════════════════════════════════════════════════════════\n');

for (const t of TRAPS) {
  const plan = buildPlan(t.input);
  const conditionsBlob = plan.conditions.map(c => `${c.name} :: ${c.evidence}`).join(' || ');
  const failures: string[] = [];

  for (const re of t.mustNotMatchCondition) {
    totalChecks++;
    if (re.test(conditionsBlob)) {
      totalFailures++;
      failures.push(`     ❌ MUST NOT match ${re} — found in conditions: ${conditionsBlob.slice(0, 300)}…`);
    }
  }
  for (const re of (t.mustMatchCondition ?? [])) {
    totalChecks++;
    if (!re.test(conditionsBlob)) {
      totalFailures++;
      failures.push(`     ❌ MUST match ${re} — but missing. Conditions: [${plan.conditions.map(c => c.name).join(', ')}]`);
    }
  }

  if (failures.length === 0) {
    console.log(`✅ ${t.id.padEnd(40)} — ${t.description}`);
  } else {
    console.log(`❌ ${t.id.padEnd(40)} — ${t.description}`);
    for (const f of failures) console.log(f);
  }
}

console.log(`\n──── SUMMARY ────`);
console.log(`Total checks: ${totalChecks}`);
console.log(`Passed:       ${totalChecks - totalFailures}`);
console.log(`Failures:     ${totalFailures}`);
console.log();
if (totalFailures === 0) {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('✅ All overlap traps cleared.');
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(0);
} else {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`❌ ${totalFailures} overlap leaks — marker regex is matching the wrong analyte.`);
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(1);
}
