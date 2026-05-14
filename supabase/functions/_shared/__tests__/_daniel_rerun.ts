// READ-ONLY rerun of Daniel's profile through current engine.
// His stored plan is NOT modified.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal', sl: number | null = null, sh: number | null = null): LabValue {
  return { marker: m, value: v, unit: u, flag: f, standard_low: sl, standard_high: sh } as any;
}

const labs: LabValue[] = [
  // Abnormals
  lab('% SATURATION', 12, '%', 'critical_low', 20, 48),
  lab('FERRITIN', 29, 'ng/mL', 'low', 38, 380),
  lab('FOLATE, SERUM', 19.1, 'ng/mL', 'normal', 3.4, 20),  // corrected range, this is normal
  lab('IRON, TOTAL', 42, 'mcg/dL', 'low', 50, 195),
  lab('LDL-CHOLESTEROL', 106, 'mg/dL', 'high', 0, 100),
  lab('MCH', 26.7, 'pg', 'low', 27, 33),
  // CBC normals
  lab('HEMOGLOBIN', 13.5, 'g/dL', 'normal', 13.2, 17.1),
  lab('HEMATOCRIT', 41.4, '%', 'normal', 39.4, 51.1),
  lab('WBC', 6.7, 'Thousand/uL', 'normal', 3.8, 10.8),
  lab('PLATELETS', 294, 'Thousand/uL', 'normal', 140, 400),
  lab('MCV', 82, 'fL', 'normal', 81.4, 101.7),
  lab('MCHC', 32.6, 'g/dL', 'normal', 31.6, 35.4),
  lab('RBC', 5.05, 'Million/uL', 'normal', 4.2, 5.8),
  lab('RDW', 13, '%', 'normal', 11, 15),
  // CMP normals
  lab('GLUCOSE', 95, 'mg/dL', 'normal', 70, 99),
  lab('BUN', 14, 'mg/dL', 'normal', 6, 20),
  lab('CREATININE', 1.0, 'mg/dL', 'normal', 0.74, 1.35),
  lab('SODIUM', 140, 'mmol/L', 'normal', 134, 144),
  lab('POTASSIUM', 4.3, 'mmol/L', 'normal', 3.5, 5.2),
  lab('CHLORIDE', 103, 'mmol/L', 'normal', 96, 106),
  lab('CARBON DIOXIDE', 27, 'mmol/L', 'normal', 20, 32),
  lab('CALCIUM', 9.9, 'mg/dL', 'normal', 8.6, 10.3),
  lab('ALBUMIN', 4.7, 'g/dL', 'normal', 3.6, 5.1),
  lab('PROTEIN, TOTAL', 7.8, 'g/dL', 'normal', 6.1, 8.1),
  lab('ALT', 15, 'U/L', 'normal', 9, 46),
  lab('AST', 11, 'U/L', 'normal', 10, 40),
  lab('ALKALINE PHOSPHATASE', 49, 'U/L', 'normal', 36, 130),
  lab('BILIRUBIN, TOTAL', 0.6, 'mg/dL', 'normal', 0.2, 1.2),
  // Lipid
  lab('CHOLESTEROL, TOTAL', 179, 'mg/dL', 'normal', 0, 200),
  lab('HDL CHOLESTEROL', 56, 'mg/dL', 'normal', 40, 999),
  lab('TRIGLYCERIDES', 76, 'mg/dL', 'normal', 0, 150),
  // Hormones
  lab('TESTOSTERONE, TOTAL, MS', 291, 'ng/dL', 'watch', 250, 1100),
  lab('TESTOSTERONE, FREE', 41.3, 'pg/mL', 'normal', 35, 155),
  lab('ESTRADIOL', 30, 'pg/mL', 'normal', 0, 39),
  lab('FSH', 1.8, 'mIU/mL', 'normal', 1.4, 12.8),
  lab('LH', 4.7, 'mIU/mL', 'normal', 1.5, 9.3),
  lab('DHEA SULFATE', 407, 'mcg/dL', 'normal', 74, 617),
  // Thyroid + others
  lab('TSH', 1.27, 'mIU/L', 'normal', 0.4, 4.5),
  lab('T3, FREE', 3.6, 'pg/mL', 'normal', 2.3, 4.2),
  lab('VITAMIN D, 25-OH', 42, 'ng/mL', 'normal', 30, 100),
  lab('VITAMIN B12', 466, 'pg/mL', 'normal', 200, 1100),
  lab('METHYLMALONIC ACID', 77, 'nmol/L', 'normal', 55, 335),
  lab('HOMOCYSTEINE', 7.6, 'umol/L', 'normal', 0, 12.9),
  lab('HEMOGLOBIN A1c', 5.2, '%', 'normal', 0, 5.7),
  lab('C-REACTIVE PROTEIN', 3, 'mg/L', 'normal', 0, 8),
];

const conditionsList = ['Anxiety', 'GERD / Acid Reflux'];
const medsList = ['Omeprazole'];
const symptomsList = [
  'Acid reflux', 'Acne', 'Afternoon energy crash', 'Alternating bowel habits',
  'Anxiety', 'Back pain', 'Bloating', 'Brain fog', 'Difficulty concentrating',
  'Heart palpitations', 'Heartburn', 'Increased hunger', 'Inflammation',
  'Joint pain', 'Joint stiffness', 'Low motivation', 'Mental exhaustion',
  'Morning fatigue despite sleep', 'Receding hairline', 'Shortness of breath',
  'Unrefreshing sleep',
];

const input: PatientInput = {
  age: 29, sex: 'male',
  heightCm: 182.88, weightKg: 83.91, bmi: 25.1,
  conditionsList,
  conditionsLower: conditionsList.join(' ').toLowerCase(),
  medsList,
  medsLower: medsList.join(' ').toLowerCase(),
  symptomsList: symptomsList.map(name => ({ name, severity: 5 })),
  symptomsLower: symptomsList.join(' ').toLowerCase(),
  supplementsList: [], supplementsLower: '',
  labs,
  labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
  isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
};

function trim(s: string, max = 360): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

const plan = buildPlan(input);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  DANIEL RE-RUN — engine output as of 2026-05-14-65');
console.log('  29yo male, BMI 25.1, GERD + Anxiety on Omeprazole');
console.log('  Key flags: Ferritin 29 LOW + Iron 42 LOW + Iron Sat 12 CRIT LOW');
console.log('             + MCH 26.7 LOW + Total T 291 LOW + LDL 106 HIGH');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('CHIEF COMPLAINT:');
console.log(`  ${trim(plan.chiefComplaint, 400)}\n`);

console.log('HPI:');
console.log(`  ${trim(plan.hpi, 600)}\n`);

console.log(`CONDITIONS DETECTED (${plan.conditions.length}):`);
for (const c of plan.conditions) {
  console.log(`  • ${c.name}`);
  console.log(`      ${trim(c.evidence, 500)}`);
}

console.log(`\nTESTS RECOMMENDED (${plan.tests.length}):`);
for (const t of plan.tests) console.log(`  • ${t.name}`);

console.log(`\nDISCUSSION POINTS (${plan.discussionPoints.length}):`);
for (const d of plan.discussionPoints) console.log(`  • ${trim(d, 400)}`);

console.log(`\nSUPPLEMENT CANDIDATES (${plan.supplementCandidates.length}):`);
for (const s of plan.supplementCandidates) {
  const why = (s as any).whyShort || (s as any).why || '';
  const dose = (s as any).dose ? ` [${(s as any).dose}]` : '';
  console.log(`  • ${s.nutrient}${dose}  — ${trim(why, 220)}`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
