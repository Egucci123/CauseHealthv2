// READ-ONLY rerun of Tim's exact profile through the current engine.
// His stored plan is NOT modified — this just dumps what the engine
// would generate today for the same input, so we can grade improvement.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}

// Tim's actual labs (16 markers — CMP + Total Bilirubin only, as uploaded)
const labs: LabValue[] = [
  lab('Albumin', 4.5, 'g/dL'),
  lab('Alkaline Phosphatase', 67, 'U/L'),
  lab('ALT', 37, 'U/L'),
  lab('Anion Gap', 9, 'mmol/L'),
  lab('AST', 37, 'U/L'),
  lab('Bilirubin Total', 1.3, 'mg/dL', 'high'),
  lab('Calcium', 9.7, 'mg/dL'),
  lab('Carbon Dioxide', 27, 'mmol/L'),
  lab('Chloride', 103, 'mmol/L'),
  lab('Creatinine', 1.29, 'mg/dL', 'high'),
  lab('GFR Estimate', 72, 'mL/min/1.73m2'),
  lab('Glucose', 94, 'mg/dL', 'watch'),
  lab('Potassium', 4.8, 'mmol/L'),
  lab('Protein Total', 7.5, 'g/dL'),
  lab('Sodium', 139, 'mmol/L'),
  lab('Urea Nitrogen', 14.8, 'mg/dL'),
];

const conditionsList = ['Anxiety', 'Depression', 'Psoriasis', 'Sleep Apnea (Obstructive)'];
const symptomsList = [
  'Gynecomastia — male breast tissue', 'Low testosterone symptoms', 'Sugar cravings',
  'Difficulty losing weight', 'Snoring', 'Unrefreshing sleep', 'Low energy',
  'Afternoon energy crash', 'Morning fatigue despite sleep', 'Mental exhaustion',
  'Difficulty concentrating', 'Depression', 'Anxiety', 'Low motivation', 'Irritability',
  'High blood pressure', 'Sleep apnea', 'Dry skin',
];

const input: PatientInput = {
  age: 41, sex: 'male',
  heightCm: 177.8, weightKg: 129.7, bmi: 41.0,
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
console.log('  TIM RE-RUN — engine output as of 2026-05-13-55');
console.log('  READ-ONLY: stored plan is NOT modified.');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('CHIEF COMPLAINT:');
console.log(`  ${trim(plan.chiefComplaint, 400)}\n`);

console.log('HPI:');
console.log(`  ${trim(plan.hpi, 800)}\n`);

console.log(`CONDITIONS DETECTED (${plan.conditions.length}):`);
for (const c of plan.conditions) {
  console.log(`  • ${c.name}`);
  console.log(`      ${trim(c.evidence, 320)}`);
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
  for (const p of pd) console.log(`  • ${p.name} — ${trim(p.description ?? '', 200)}`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
