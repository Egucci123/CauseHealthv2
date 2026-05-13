// READ-ONLY rerun of Marisa's exact profile through the current engine.
// Her stored plan is NOT modified.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal', sl: number | null = null, sh: number | null = null): LabValue {
  return { marker: m, value: v, unit: u, flag: f, standard_low: sl, standard_high: sh } as any;
}

const labs: LabValue[] = [
  lab('Albumin', 4.6, 'g/dL', 'normal', 4, 5),
  lab('Alkaline Phosphatase', 57, 'IU/L', 'normal', 44, 121),
  lab('ALT (SGPT)', 12, 'IU/L', 'normal', 0, 32),
  lab('Apolipoprotein A-1', 167, 'mg/dL', 'normal', 116, 209),
  lab('Apolipoprotein B', 77, 'mg/dL', 'normal', 0, 90),
  lab('AST (SGOT)', 19, 'IU/L', 'normal', 0, 40),
  lab('Bilirubin, Total', 1.8, 'mg/dL', 'critical_high', 0, 1.2),
  lab('BUN', 9, 'mg/dL', 'normal', 6, 20),
  lab('Calcium', 9.4, 'mg/dL', 'normal', 8.7, 10.2),
  lab('Cholesterol, Total', 180, 'mg/dL', 'normal', 100, 199),
  lab('Cortisol - AM', 21.3, 'ug/dL', 'high', 6.2, 19.4),
  lab('Creatinine', 0.71, 'mg/dL', 'normal', 0.57, 1.0),
  lab('DHEA-Sulfate', 263, 'ug/dL', 'normal', 84.8, 378),
  lab('eGFR', 120, 'mL/min/1.73', 'normal', 59, 999),
  lab('Estradiol', 168, 'pg/mL', 'high', 12.5, 166),
  lab('Folate (Folic Acid), Serum', 17.4, 'ng/mL', 'normal', 3, 999),
  lab('Free Testosterone', 1.5, 'pg/mL', 'normal', 0, 4.2),
  lab('FSH', 2.8, 'mIU/mL', 'low', 3.5, 12.5),
  lab('Glucose', 86, 'mg/dL', 'normal', 70, 99),
  lab('HDL Cholesterol', 78, 'mg/dL', 'normal', 39, 999),
  lab('Hematocrit', 39.8, '%', 'normal', 34, 46.6),
  lab('Hemoglobin', 13.1, 'g/dL', 'normal', 11.1, 15.9),
  lab('Hemoglobin A1c', 4.8, '%', 'normal', 4.8, 5.6),
  lab('Insulin', 6, 'uIU/mL', 'normal', 2.6, 24.9),
  lab('LDL Cholesterol', 91, 'mg/dL', 'normal', 0, 99),
  lab('LH', 5.4, 'mIU/mL', 'normal', 2.4, 12.6),
  lab('Lipoprotein (a)', 9, 'nmol/L', 'normal', 0, 75),
  lab('Magnesium', 2, 'mg/dL', 'normal', 1.6, 2.3),
  lab('MCV', 89, 'fL', 'normal', 79, 97),
  lab('Platelets', 193, 'x10E3/uL', 'normal', 150, 450),
  lab('Potassium', 4, 'mmol/L', 'normal', 3.5, 5.2),
  lab('Progesterone', 12, 'ng/mL', 'normal', 0.1, 12),
  lab('Prolactin', 53.4, 'ng/mL', 'critical_high', 4.8, 33.4),
  lab('Sodium', 136, 'mmol/L', 'normal', 134, 144),
  lab('T4, Free (Direct)', 1.33, 'ng/dL', 'normal', 0.82, 1.77),
  lab('Testosterone', 43, 'ng/dL', 'normal', 13, 71),
  lab('Triglycerides', 54, 'mg/dL', 'normal', 0, 149),
  lab('Triiodothyronine (T3), Free', 2.7, 'pg/mL', 'normal', 2, 4.4),
  lab('TSH', 3.02, 'uIU/mL', 'normal', 0.45, 4.5),
  lab('Uric Acid', 3.6, 'mg/dL', 'normal', 2.6, 6.2),
  lab('Vitamin B12', 947, 'pg/mL', 'normal', 232, 1245),
  lab('Vitamin D, 25-Hydroxy', 78.8, 'ng/mL', 'normal', 30, 100),
  lab('WBC', 5.6, 'x10E3/uL', 'normal', 3.4, 10.8),
  lab('C-Reactive Protein, Cardiac', 0.26, 'mg/L', 'normal', 0, 3),
];

const conditionsList = ['Gilbert syndrome'];
const symptomsList = [
  'Alternating bowel habits', 'Brain fog', 'Chronic fatigue',
  'Difficulty concentrating', 'Mood swings',
];

const input: PatientInput = {
  age: 27, sex: 'female',
  heightCm: 160.02, weightKg: 54.43, bmi: 21.3,
  conditionsList,
  conditionsLower: conditionsList.join(' ').toLowerCase(),
  medsList: [], medsLower: '',
  symptomsList: symptomsList.map(name => ({ name, severity: 5 })),
  symptomsLower: symptomsList.join(' ').toLowerCase(),
  supplementsList: [], supplementsLower: '',
  labs,
  labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
  isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
};

function trim(s: string, max = 320): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

const plan = buildPlan(input);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  MARISA RE-RUN — engine output as of 2026-05-13-56');
console.log('  27yo female, Gilbert syndrome, 5 systemic symptoms.');
console.log('  Key flags: Prolactin 53.4 (CRIT HIGH 1.6× ULN) + FSH 2.8 (LOW)');
console.log('             + Cortisol AM 21.3 (HIGH) + Estradiol 168 (HIGH)');
console.log('             + Bili 1.8 (consistent w/ known Gilbert)');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('CHIEF COMPLAINT:');
console.log(`  ${trim(plan.chiefComplaint, 400)}\n`);

console.log('HPI:');
console.log(`  ${trim(plan.hpi, 800)}\n`);

console.log(`CONDITIONS DETECTED (${plan.conditions.length}):`);
for (const c of plan.conditions) {
  console.log(`  • ${c.name}`);
  console.log(`      ${trim(c.evidence, 380)}`);
}

console.log(`\nTESTS RECOMMENDED (${plan.tests.length}):`);
for (const t of plan.tests) console.log(`  • ${t.name}`);

console.log(`\nDISCUSSION POINTS (${plan.discussionPoints.length}):`);
for (const d of plan.discussionPoints) console.log(`  • ${trim(d, 360)}`);

console.log(`\nSUPPLEMENT CANDIDATES (${plan.supplementCandidates.length}):`);
for (const s of plan.supplementCandidates) {
  const why = (s as any).whyShort || (s as any).why || '';
  const dose = (s as any).dose ? ` [${(s as any).dose}]` : '';
  console.log(`  • ${s.nutrient}${dose}  — ${trim(why, 200)}`);
}

const pd = (plan as any).patternDescriptions;
if (Array.isArray(pd) && pd.length) {
  console.log(`\nMULTI-MARKER PATTERNS (${pd.length}):`);
  for (const p of pd) console.log(`  • ${p.name} — ${trim(p.description ?? '', 220)}`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
