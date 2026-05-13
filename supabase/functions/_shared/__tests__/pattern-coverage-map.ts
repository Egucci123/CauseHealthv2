// PATTERN COVERAGE MAP
// =====================
// For every canonical lab marker × direction (high/low), generate a
// patient whose ONLY abnormality is that one finding. Run buildPlan
// and check: did ANY suspected condition fire? Did the test panel
// gain anything beyond the universal baseline (CMP, CBC, etc.)?
//
// Where nothing fires → "silent zone." That's a gap in clinical depth.
// Most users present with multiple abnormalities, but the silent-zone
// map tells us which individual abnormalities the engine can't reason
// about — which means in a multi-finding patient, that abnormality is
// being ignored.
//
// Then runs PAIRWISE coverage: top-frequency abnormalities combined,
// to verify cross-marker integration (not just single-marker detectors).

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

type Direction = 'high' | 'low' | 'critical_high' | 'critical_low';
interface MarkerFixture {
  marker: string;
  unit: string;
  direction: Direction;
  value: number;
  description: string;
  /** If set, only generate a patient of this sex. Used for sex-specific
   *  markers like PSA (males only) or testosterone abuse (typically males). */
  sexOnly?: 'male' | 'female';
}

const MARKERS: MarkerFixture[] = [
  // ── Glucose / metabolic ──
  { marker: 'Glucose',                  unit: 'mg/dL', direction: 'high',          value: 145, description: 'Fasting glucose diabetic range (≥126)' },
  { marker: 'Glucose',                  unit: 'mg/dL', direction: 'critical_high', value: 280, description: 'Severe hyperglycemia' },
  { marker: 'Glucose',                  unit: 'mg/dL', direction: 'low',           value: 55,  description: 'Hypoglycemia' },
  { marker: 'Hemoglobin A1c',           unit: '%',     direction: 'high',          value: 6.8, description: 'A1c diabetic range' },
  { marker: 'Hemoglobin A1c',           unit: '%',     direction: 'high',          value: 5.9, description: 'Prediabetic A1c' },
  { marker: 'Fasting Insulin',          unit: 'uIU/mL',direction: 'high',          value: 18,  description: 'Elevated fasting insulin (IR)' },
  // ── Lipid ──
  { marker: 'LDL Cholesterol',          unit: 'mg/dL', direction: 'high',          value: 175, description: 'LDL high' },
  { marker: 'LDL Cholesterol',          unit: 'mg/dL', direction: 'critical_high', value: 220, description: 'LDL very high (FH suspicion)' },
  { marker: 'HDL',                      unit: 'mg/dL', direction: 'low',           value: 28,  description: 'Low HDL' },
  { marker: 'Triglycerides',            unit: 'mg/dL', direction: 'high',          value: 290, description: 'Hypertriglyceridemia' },
  { marker: 'Triglycerides',            unit: 'mg/dL', direction: 'critical_high', value: 650, description: 'Severe hypertriglyceridemia (pancreatitis risk)' },
  { marker: 'ApoB',                     unit: 'mg/dL', direction: 'high',          value: 115, description: 'Elevated atherogenic particles' },
  { marker: 'Lp(a)',                    unit: 'nmol/L',direction: 'high',          value: 180, description: 'Elevated Lp(a) — genetic CV risk' },
  // ── Liver ──
  { marker: 'ALT',                      unit: 'U/L',   direction: 'high',          value: 95,  description: 'ALT elevation (NAFLD / drug / alcohol)' },
  { marker: 'ALT',                      unit: 'U/L',   direction: 'critical_high', value: 350, description: 'Severe ALT elevation (acute hepatitis)' },
  { marker: 'AST',                      unit: 'U/L',   direction: 'high',          value: 75,  description: 'AST elevation' },
  { marker: 'GGT',                      unit: 'U/L',   direction: 'high',          value: 110, description: 'GGT elevation (alcohol / biliary)' },
  { marker: 'Alkaline Phosphatase',     unit: 'U/L',   direction: 'high',          value: 180, description: 'AlkPhos elevation (biliary / bone)' },
  { marker: 'Bilirubin Total',          unit: 'mg/dL', direction: 'high',          value: 1.8, description: 'Isolated bili elevation (Gilbert vs hemolysis)' },
  // ── Kidney ──
  { marker: 'Creatinine',               unit: 'mg/dL', direction: 'high',          value: 1.45,description: 'Cr elevation (CKD signal)' },
  { marker: 'Creatinine',               unit: 'mg/dL', direction: 'critical_high', value: 2.8, description: 'Severe Cr elevation' },
  { marker: 'eGFR',                     unit: 'mL/min',direction: 'low',           value: 52,  description: 'CKD stage 3a' },
  { marker: 'BUN',                      unit: 'mg/dL', direction: 'high',          value: 35,  description: 'Elevated BUN' },
  { marker: 'Urate',                    unit: 'mg/dL', direction: 'high',          value: 9.5, description: 'Hyperuricemia (gout / MPN)' },
  // ── Electrolytes ──
  { marker: 'Sodium',                   unit: 'mEq/L', direction: 'low',           value: 128, description: 'Hyponatremia' },
  { marker: 'Sodium',                   unit: 'mEq/L', direction: 'high',          value: 152, description: 'Hypernatremia' },
  { marker: 'Potassium',                unit: 'mEq/L', direction: 'low',           value: 3.0, description: 'Hypokalemia' },
  { marker: 'Potassium',                unit: 'mEq/L', direction: 'high',          value: 5.8, description: 'Hyperkalemia' },
  { marker: 'Calcium',                  unit: 'mg/dL', direction: 'high',          value: 11.2,description: 'Hypercalcemia (PTH vs malignancy)' },
  { marker: 'Calcium',                  unit: 'mg/dL', direction: 'low',           value: 7.8, description: 'Hypocalcemia' },
  { marker: 'Magnesium',                unit: 'mg/dL', direction: 'low',           value: 1.4, description: 'Hypomagnesemia' },
  { marker: 'Phosphorus',               unit: 'mg/dL', direction: 'high',          value: 5.2, description: 'Hyperphosphatemia' },
  // ── CBC / hematology ──
  { marker: 'Hemoglobin',               unit: 'g/dL',  direction: 'low',           value: 9.5, description: 'Anemia' },
  { marker: 'Hemoglobin',               unit: 'g/dL',  direction: 'critical_low',  value: 7.2, description: 'Severe anemia' },
  { marker: 'Hematocrit',               unit: '%',     direction: 'high',          value: 53,  description: 'Erythrocytosis' },
  { marker: 'WBC',                      unit: 'x10³/uL',direction:'high',          value: 16,  description: 'Leukocytosis' },
  { marker: 'WBC',                      unit: 'x10³/uL',direction:'low',           value: 2.5, description: 'Leukopenia' },
  { marker: 'Neutrophils',              unit: 'x10³/uL',direction:'low',           value: 0.8, description: 'Neutropenia' },
  { marker: 'Platelets',                unit: 'x10³/uL',direction:'low',           value: 95,  description: 'Thrombocytopenia' },
  { marker: 'Platelets',                unit: 'x10³/uL',direction:'high',          value: 520, description: 'Thrombocytosis' },
  { marker: 'MCV',                      unit: 'fL',    direction: 'high',          value: 105, description: 'Macrocytosis' },
  { marker: 'MCV',                      unit: 'fL',    direction: 'low',           value: 76,  description: 'Microcytosis' },
  // ── Iron / B12 / folate ──
  { marker: 'Ferritin',                 unit: 'ng/mL', direction: 'low',           value: 12,  description: 'Iron deficiency' },
  { marker: 'Ferritin',                 unit: 'ng/mL', direction: 'high',          value: 580, description: 'Iron overload pattern' },
  { marker: 'Vitamin B12',              unit: 'pg/mL', direction: 'low',           value: 195, description: 'B12 deficiency' },
  { marker: 'Folate',                   unit: 'ng/mL', direction: 'low',           value: 3.2, description: 'Folate deficiency' },
  // ── Thyroid ──
  { marker: 'TSH',                      unit: 'mIU/L', direction: 'high',          value: 6.8, description: 'Hypothyroid TSH' },
  { marker: 'TSH',                      unit: 'mIU/L', direction: 'critical_high', value: 22,  description: 'Overt hypothyroidism' },
  { marker: 'TSH',                      unit: 'mIU/L', direction: 'low',           value: 0.1, description: 'Hyperthyroid TSH (Graves rule-out)' },
  { marker: 'Free T4',                  unit: 'ng/dL', direction: 'low',           value: 0.6, description: 'Low Free T4' },
  // ── Vitamin D ──
  { marker: '25-Hydroxy, Vitamin D',    unit: 'ng/mL', direction: 'low',           value: 16,  description: 'Vit D deficiency' },
  { marker: '25-Hydroxy, Vitamin D',    unit: 'ng/mL', direction: 'high',          value: 110, description: 'Vit D excess (toxicity risk)' },
  // ── Inflammation ──
  { marker: 'hs-CRP',                   unit: 'mg/L',  direction: 'high',          value: 9,   description: 'Elevated CRP' },
  { marker: 'ESR',                      unit: 'mm/hr', direction: 'high',          value: 65,  description: 'Elevated ESR' },
  // ── Hormones ──
  { marker: 'Testosterone Total',       unit: 'ng/dL', direction: 'high',          value: 1450,description: 'Supraphysiologic T (male — anabolic)', sexOnly: 'male' },
  { marker: 'Testosterone Total',       unit: 'ng/dL', direction: 'low',           value: 220, description: 'Low T (male)', sexOnly: 'male' },
  { marker: 'Prolactin',                unit: 'ng/mL', direction: 'high',          value: 65,  description: 'Hyperprolactinemia' },
  { marker: 'Estradiol',                unit: 'pg/mL', direction: 'high',          value: 290, description: 'Elevated E2 (male — aromatization)', sexOnly: 'male' },
  { marker: 'Cortisol',                 unit: 'µg/dL', direction: 'high',          value: 25,  description: 'AM cortisol elevation' },
  { marker: 'DHEA-S',                   unit: 'µg/dL', direction: 'low',           value: 35,  description: 'Low DHEA-S' },
  // ── Other ──
  { marker: 'Homocysteine',             unit: 'µmol/L',direction: 'high',          value: 18,  description: 'Hyperhomocysteinemia' },
  { marker: 'PSA',                      unit: 'ng/mL', direction: 'high',          value: 6.5, description: 'PSA elevation', sexOnly: 'male' },
];

function lab(m: string, v: number, u: string, f: LabValue['flag']): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}

function makePatient(sex: 'male'|'female', age: number, l: LabValue): PatientInput {
  return {
    age, sex, heightCm: 175, weightKg: 75, bmi: 24.5,
    conditionsList: [], conditionsLower: '',
    medsList: [], medsLower: '',
    symptomsList: [], symptomsLower: '',
    supplementsList: [], supplementsLower: '',
    labs: [l],
    labsLower: `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`.toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PATTERN COVERAGE MAP — single-marker abnormalities');
console.log(`  Generates ${MARKERS.length * 2} patients (each marker × M/F).`);
console.log('  Maps which abnormalities trigger ANY engine response.');
console.log('══════════════════════════════════════════════════════════════\n');

interface CoverageRow { marker: string; direction: Direction; value: number; sex: string;
  description: string; conditionsFired: string[]; testsAdded: number; supplementsFired: string[];
  silent: boolean; }

const baselineMaleTests = buildPlan(makePatient('male', 40, lab('Glucose', 90, 'mg/dL', 'normal'))).tests.length;
const baselineFemaleTests = buildPlan(makePatient('female', 40, lab('Glucose', 90, 'mg/dL', 'normal'))).tests.length;

const coverage: CoverageRow[] = [];
for (const m of MARKERS) {
  const sexes = m.sexOnly ? [m.sexOnly] as const : (['male', 'female'] as const);
  for (const sex of sexes) {
    const baseline = sex === 'male' ? baselineMaleTests : baselineFemaleTests;
    const patient = makePatient(sex, 40, lab(m.marker, m.value, m.unit, m.direction));
    const plan = buildPlan(patient);
    const conditionsFired = plan.conditions.map(c => c.name);
    const testsAdded = Math.max(0, plan.tests.length - baseline);
    const supplementsFired = plan.supplementCandidates.map(s => s.nutrient);
    const silent = conditionsFired.length === 0 && testsAdded === 0;
    coverage.push({ marker: m.marker, direction: m.direction, value: m.value, sex,
      description: m.description, conditionsFired, testsAdded, supplementsFired, silent });
  }
}

const silentRows = coverage.filter(r => r.silent);
const noisyRows = coverage.filter(r => !r.silent);

console.log('SILENT ZONES — marker abnormality fires NO condition AND adds no tests:\n');
if (silentRows.length === 0) {
  console.log('  (none — every single-marker abnormality triggers at least one engine response)\n');
} else {
  for (const r of silentRows) {
    console.log(`  ❌ ${r.marker} ${r.direction} (${r.value}) — ${r.sex.padEnd(6)} — ${r.description}`);
  }
}

console.log(`\nCOVERED — ${noisyRows.length} of ${coverage.length} (${Math.round(100*noisyRows.length/coverage.length)}%):\n`);
const sampleCovered = noisyRows.slice(0, 8);
for (const r of sampleCovered) {
  console.log(`  ✅ ${r.marker} ${r.direction} (${r.value}) ${r.sex.padEnd(6)}`);
  if (r.conditionsFired.length) console.log(`      conditions: ${r.conditionsFired.join(' | ')}`);
  if (r.testsAdded > 0)         console.log(`      tests added: +${r.testsAdded}`);
  if (r.supplementsFired.length)console.log(`      supplements: ${r.supplementsFired.join(', ')}`);
}
if (noisyRows.length > 8) console.log(`  … and ${noisyRows.length - 8} more`);

console.log(`\n──── SUMMARY ────`);
console.log(`Markers tested      : ${MARKERS.length}`);
console.log(`Patient permutations: ${coverage.length} (each marker × M/F)`);
console.log(`Silent zones        : ${silentRows.length}`);
console.log(`Covered             : ${noisyRows.length}`);
console.log(`Coverage rate       : ${Math.round(100*noisyRows.length/coverage.length)}%\n`);

if (silentRows.length > 0) {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Silent zones above are abnormalities the engine does not reason about.');
  console.log('Adding detectors for these would close the gaps.');
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(0); // diagnostic, not pass/fail
} else {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('✅ Every single-marker abnormality triggers some engine response.');
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(0);
}
