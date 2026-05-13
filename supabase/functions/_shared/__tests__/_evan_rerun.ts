// READ-ONLY rerun of Evan's profile (evan@edgemechpros.com) through engine.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal', sl: number | null = null, sh: number | null = null): LabValue {
  return { marker: m, value: v, unit: u, flag: f, standard_low: sl, standard_high: sh } as any;
}

const labs: LabValue[] = [
  // Abnormal first
  lab('25-Hydroxy, Vitamin D', 24, 'ng/mL', 'low', 30, 100),
  lab('ALT (SGPT)', 97, 'IU/L', 'critical_high', 0, 44),
  lab('AST (SGOT)', 48, 'IU/L', 'high', 0, 40),
  lab('Bilirubin, Total', 1.4, 'mg/dL', 'high', 0, 1.2),
  lab('Cholesterol, Total', 269, 'mg/dL', 'critical_high', 100, 199),
  lab('Hematocrit', 51.4, '%', 'high', 37.5, 51),
  lab('LDL Cholesterol', 166, 'mg/dL', 'critical_high', 0, 99),
  lab('RBC', 5.96, 'x10E6/uL', 'high', 4.14, 5.8),
  lab('Triglycerides', 327, 'mg/dL', 'critical_high', 0, 149),
  lab('VLDL Cholesterol', 41, 'mg/dL', 'high', 5, 40),
  // Watch / borderline
  lab('Glucose, Serum', 98, 'mg/dL', 'watch', 70, 99),
  lab('Hemoglobin A1c', 5.5, '%', 'watch', 4.8, 5.6),
  lab('Testosterone, Serum', 496, 'ng/dL', 'watch', 264, 916),
  lab('C-Reactive Protein, Quant', 1, 'mg/L', 'watch', 0, 10),
  // Normals (representative)
  lab('Albumin, Serum', 5.1, 'g/dL', 'normal', 4.3, 5.2),
  lab('Alkaline Phosphatase, S', 90, 'IU/L', 'normal', 47, 123),
  lab('BUN', 13, 'mg/dL', 'normal', 6, 20),
  lab('Calcium, Serum', 10, 'mg/dL', 'normal', 8.7, 10.2),
  lab('Creatinine, Serum', 0.99, 'mg/dL', 'normal', 0.76, 1.27),
  lab('eGFR', 106, 'mL/min/1.73m2', 'normal', 59, null),
  lab('HDL Cholesterol', 62, 'mg/dL', 'normal', 39, null),
  lab('Hemoglobin', 17.5, 'g/dL', 'normal', 13, 17.7),
  lab('MCV', 86, 'fL', 'normal', 79, 97),
  lab('Platelets', 263, 'x10E3/uL', 'normal', 150, 450),
  lab('Potassium, Serum', 4.4, 'mEq/L', 'normal', 3.5, 5.2),
  lab('Sodium, Serum', 137, 'mEq/L', 'normal', 134, 144),
  lab('TSH', 1.93, 'uIU/mL', 'normal', 0.45, 4.5),
  lab('Vitamin B12', 586, 'pg/mL', 'normal', 232, 1245),
  lab('WBC', 7.2, 'x10E3/uL', 'normal', 3.4, 10.8),
];

const conditionsList = ['High Cholesterol (Hyperlipidemia)', 'Ulcerative Colitis (UC)'];
const medsList = ['Atorvastatin', 'Mesalamine', 'Ustekinumab'];
const symptomsList = [
  'Afternoon energy crash', 'Bloating', 'Brain fog', 'Difficulty falling asleep',
  'Difficulty losing weight', 'Diffuse hair thinning', 'Gas', 'Joint pain',
  'Joint stiffness', 'Slow metabolism', 'Waking during night',
];

const input: PatientInput = {
  age: 28, sex: 'male',
  heightCm: 187.96, weightKg: 104.33, bmi: 29.5,
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

function trim(s: string, max = 320): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

const plan = buildPlan(input);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  EVAN RE-RUN — engine output as of 2026-05-13-57');
console.log('  28yo M, BMI 29.5, UC + Hyperlipidemia on Atorvastatin + Mesalamine + Ustekinumab');
console.log('  Key flags: ALT 97 + AST 48 + TC 269 + LDL 166 + TG 327 + Hct 51.4 + RBC 5.96 + Vit D 24');
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
  console.log(`  • ${s.nutrient}${dose}  — ${trim(why, 220)}`);
}

const dep = (plan as any).depletions;
if (Array.isArray(dep) && dep.length) {
  console.log(`\nMEDICATION DEPLETIONS (${dep.length}):`);
  for (const d of dep) console.log(`  • ${d.medClass ?? d.med_class ?? '?'} → ${d.nutrient ?? '?'} — ${trim(d.mechanism ?? '', 180)}`);
}

const pd = (plan as any).patternDescriptions;
if (Array.isArray(pd) && pd.length) {
  console.log(`\nMULTI-MARKER PATTERNS (${pd.length}):`);
  for (const p of pd) console.log(`  • ${p.name} — ${trim(p.description ?? '', 220)}`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
