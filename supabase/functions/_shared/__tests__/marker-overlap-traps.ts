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
