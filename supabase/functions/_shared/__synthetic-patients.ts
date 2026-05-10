// supabase/functions/_shared/__synthetic-patients.ts
//
// SYNTHETIC PATIENT TEST HARNESS
// ==============================
// Runs the deterministic engine (buildPlan) on 5 synthetic patient
// profiles spanning the clinical spectrum:
//   1. Healthy 28yo female
//   2. Borderline 35yo male (watch-tier metabolic drift)
//   3. PCOS suspicion 26yo female
//   4. Postmenopausal 58yo female
//   5. Severe metabolic 52yo male (active disease pattern)
//
// Run:  deno run -A supabase/functions/_shared/__synthetic-patients.ts
//
// Validates: each profile produces clinically appropriate tests,
// conditions, supplements, alerts, and goal targets.

import { buildPlan, type PatientInput, type LabValue } from './buildPlan.ts';

function lab(marker: string, value: number, unit: string, flag: LabValue['flag'] = 'healthy'): LabValue {
  return { marker, value, unit, flag };
}

function makeInput(args: {
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  conditions: string[];
  meds: string[];
  symptoms: { name: string; severity: number }[];
  supplements: string[];
  labs: LabValue[];
}): PatientInput {
  const bmi = +(args.weightKg / Math.pow(args.heightCm / 100, 2)).toFixed(1);
  const labsLower = args.labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();
  return {
    age: args.age, sex: args.sex,
    heightCm: args.heightCm, weightKg: args.weightKg, bmi,
    conditionsList: args.conditions,
    conditionsLower: args.conditions.join(' ').toLowerCase(),
    medsList: args.meds,
    medsLower: args.meds.join(' ').toLowerCase(),
    symptomsList: args.symptoms,
    symptomsLower: args.symptoms.map(s => `${s.name} (${s.severity}/10)`).join(' ').toLowerCase(),
    supplementsList: args.supplements,
    supplementsLower: args.supplements.join(' ').toLowerCase(),
    labs: args.labs,
    labsLower,
    isPregnant: false,
    hasShellfishAllergy: false,
    hasSulfaAllergy: false,
    freeText: '',
  };
}

// ──────────────────────────────────────────────────────────────────────
// Patient 1: HEALTHY 28-year-old female
// ──────────────────────────────────────────────────────────────────────
const patient1 = makeInput({
  age: 28, sex: 'female', heightCm: 168, weightKg: 62,
  conditions: [],
  meds: [],
  symptoms: [],
  supplements: [],
  labs: [
    lab('ALT', 18, 'IU/L', 'healthy'),
    lab('AST', 21, 'IU/L', 'healthy'),
    lab('Triglycerides', 88, 'mg/dL', 'healthy'),
    lab('Cholesterol, Total', 178, 'mg/dL', 'healthy'),
    lab('LDL Cholesterol', 95, 'mg/dL', 'healthy'),
    lab('HDL Cholesterol', 62, 'mg/dL', 'healthy'),
    lab('Glucose, Serum', 84, 'mg/dL', 'healthy'),
    lab('Hemoglobin A1c', 5.0, '%', 'healthy'),
    lab('25-Hydroxy, Vitamin D', 38, 'ng/mL', 'healthy'),
    lab('TSH', 1.5, 'uIU/mL', 'healthy'),
    lab('Vitamin B12', 612, 'pg/mL', 'healthy'),
    lab('RBC', 4.4, 'x10E6/uL', 'healthy'),
    lab('Hemoglobin', 13.6, 'g/dL', 'healthy'),
    lab('Hematocrit', 41, '%', 'healthy'),
    lab('Albumin, Serum', 4.4, 'g/dL', 'healthy'),
    lab('Ferritin', 88, 'ng/mL', 'healthy'),
    lab('Creatinine, Serum', 0.78, 'mg/dL', 'healthy'),
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Patient 2: BORDERLINE 35-year-old male — watch-tier drift
// ──────────────────────────────────────────────────────────────────────
const patient2 = makeInput({
  age: 35, sex: 'male', heightCm: 178, weightKg: 84,
  conditions: [],
  meds: [],
  symptoms: [{ name: 'Chronic fatigue', severity: 4 }, { name: 'Difficulty losing weight', severity: 5 }],
  supplements: [],
  labs: [
    lab('ALT', 38, 'IU/L', 'watch'),
    lab('AST', 32, 'IU/L', 'healthy'),
    lab('Triglycerides', 158, 'mg/dL', 'watch'),
    lab('Cholesterol, Total', 215, 'mg/dL', 'watch'),
    lab('LDL Cholesterol', 138, 'mg/dL', 'watch'),
    lab('HDL Cholesterol', 42, 'mg/dL', 'watch'),
    lab('Glucose, Serum', 98, 'mg/dL', 'watch'),
    lab('Hemoglobin A1c', 5.5, '%', 'watch'),
    lab('25-Hydroxy, Vitamin D', 28, 'ng/mL', 'low'),
    lab('TSH', 2.6, 'uIU/mL', 'watch'),
    lab('Testosterone, Serum', 480, 'ng/dL', 'healthy'),
    lab('RBC', 5.2, 'x10E6/uL', 'healthy'),
    lab('Hemoglobin', 15.3, 'g/dL', 'healthy'),
    lab('Hematocrit', 45.8, '%', 'healthy'),
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Patient 3: PCOS SUSPICION 26-year-old female
// ──────────────────────────────────────────────────────────────────────
const patient3 = makeInput({
  age: 26, sex: 'female', heightCm: 165, weightKg: 78,
  conditions: [],
  meds: [],
  symptoms: [
    { name: 'Irregular cycle', severity: 7 },
    { name: 'Acne', severity: 6 },
    { name: 'Hirsutism', severity: 5 },
    { name: 'Difficulty losing weight', severity: 7 },
    { name: 'Mood swings', severity: 6 },
  ],
  supplements: [],
  labs: [
    lab('ALT', 28, 'IU/L', 'healthy'),
    lab('AST', 22, 'IU/L', 'healthy'),
    lab('Triglycerides', 142, 'mg/dL', 'healthy'),
    lab('Cholesterol, Total', 198, 'mg/dL', 'healthy'),
    lab('LDL Cholesterol', 115, 'mg/dL', 'healthy'),
    lab('HDL Cholesterol', 48, 'mg/dL', 'healthy'),
    lab('Glucose, Serum', 96, 'mg/dL', 'watch'),
    lab('Hemoglobin A1c', 5.6, '%', 'watch'),
    lab('25-Hydroxy, Vitamin D', 22, 'ng/mL', 'low'),
    lab('TSH', 1.8, 'uIU/mL', 'healthy'),
    lab('Hemoglobin', 13.0, 'g/dL', 'healthy'),
    lab('Ferritin', 28, 'ng/mL', 'low'),
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Patient 4: POSTMENOPAUSAL 58-year-old female
// ──────────────────────────────────────────────────────────────────────
const patient4 = makeInput({
  age: 58, sex: 'female', heightCm: 162, weightKg: 70,
  conditions: ['Osteopenia', 'Hypertension'],
  meds: ['lisinopril', 'hydrochlorothiazide'],
  symptoms: [
    { name: 'Joint stiffness', severity: 6 },
    { name: 'Fatigue', severity: 5 },
    { name: 'Hot flashes', severity: 4 },
  ],
  supplements: ['Vitamin D3'],
  labs: [
    lab('ALT', 24, 'IU/L', 'healthy'),
    lab('AST', 26, 'IU/L', 'healthy'),
    lab('Triglycerides', 168, 'mg/dL', 'watch'),
    lab('Cholesterol, Total', 232, 'mg/dL', 'watch'),
    lab('LDL Cholesterol', 145, 'mg/dL', 'watch'),
    lab('HDL Cholesterol', 56, 'mg/dL', 'healthy'),
    lab('Glucose, Serum', 102, 'mg/dL', 'watch'),
    lab('Hemoglobin A1c', 5.7, '%', 'high'),
    lab('25-Hydroxy, Vitamin D', 32, 'ng/mL', 'watch'),
    lab('TSH', 3.2, 'uIU/mL', 'watch'),
    lab('FSH', 78, 'mIU/mL', 'high'),
    lab('Calcium', 9.4, 'mg/dL', 'healthy'),
    lab('Albumin, Serum', 4.2, 'g/dL', 'healthy'),
    lab('Hemoglobin', 13.2, 'g/dL', 'healthy'),
    lab('Potassium, Serum', 3.9, 'mEq/L', 'healthy'),
  ],
});

// ──────────────────────────────────────────────────────────────────────
// Patient 5: SEVERE METABOLIC 52-year-old male — active disease
// ──────────────────────────────────────────────────────────────────────
const patient5 = makeInput({
  age: 52, sex: 'male', heightCm: 175, weightKg: 110,
  conditions: ['Type 2 Diabetes', 'High Cholesterol'],
  meds: ['metformin', 'atorvastatin', 'omeprazole'],
  symptoms: [
    { name: 'Chronic fatigue', severity: 8 },
    { name: 'Joint stiffness', severity: 6 },
    { name: 'Difficulty losing weight', severity: 9 },
    { name: 'Brain fog', severity: 7 },
    { name: 'Snoring', severity: 8 },
    { name: 'Waking during night', severity: 7 },
  ],
  supplements: [],
  labs: [
    lab('ALT', 78, 'IU/L', 'high'),
    lab('AST', 54, 'IU/L', 'high'),
    lab('GGT', 96, 'IU/L', 'high'),
    lab('Triglycerides', 412, 'mg/dL', 'critical_high'),
    lab('Cholesterol, Total', 248, 'mg/dL', 'high'),
    lab('LDL Cholesterol', 158, 'mg/dL', 'high'),
    lab('HDL Cholesterol', 32, 'mg/dL', 'low'),
    lab('VLDL Cholesterol', 82, 'mg/dL', 'critical_high'),
    lab('Glucose, Serum', 162, 'mg/dL', 'high'),
    lab('Hemoglobin A1c', 7.8, '%', 'high'),
    lab('25-Hydroxy, Vitamin D', 18, 'ng/mL', 'low'),
    lab('TSH', 1.9, 'uIU/mL', 'healthy'),
    lab('Vitamin B12', 245, 'pg/mL', 'low'),
    lab('Testosterone, Serum', 280, 'ng/dL', 'low'),
    lab('Hemoglobin', 17.2, 'g/dL', 'high'),
    lab('Hematocrit', 51.6, '%', 'high'),
    lab('RBC', 5.9, 'x10E6/uL', 'high'),
    lab('Albumin, Serum', 4.3, 'g/dL', 'healthy'),
    lab('Creatinine, Serum', 1.1, 'mg/dL', 'healthy'),
    lab('hs-CRP', 4.2, 'mg/L', 'high'),
  ],
});

// ──────────────────────────────────────────────────────────────────────
// REPORT
// ──────────────────────────────────────────────────────────────────────
const profiles: Array<[string, PatientInput]> = [
  ['1. HEALTHY 28F', patient1],
  ['2. BORDERLINE 35M', patient2],
  ['3. PCOS-suspicion 26F', patient3],
  ['4. POSTMENOPAUSAL 58F', patient4],
  ['5. SEVERE METABOLIC 52M', patient5],
];

console.log('━'.repeat(90));
console.log('SYNTHETIC PATIENT TEST RUN — deterministic engine output');
console.log('━'.repeat(90));

for (const [label, input] of profiles) {
  const facts = buildPlan(input);
  console.log('\n' + '═'.repeat(90));
  console.log(`${label}`);
  console.log(`  age=${input.age} sex=${input.sex} BMI=${input.bmi}  meds=[${input.medsList.join(', ')}]  conditions=[${input.conditionsList.join(', ')}]`);
  console.log(`  symptoms=${input.symptomsList.length}  labs=${input.labs.length}  outliers=${facts.labs.outliers.length}`);
  console.log('═'.repeat(90));

  console.log('\n📋 TESTS TO ORDER (' + facts.tests.length + '):');
  for (const t of facts.tests) {
    console.log(`   • [${t.priority.padEnd(8)}] ${t.name.slice(0, 60)}  →  ${t.specialist}`);
  }

  console.log('\n🔬 SUSPECTED CONDITIONS (' + facts.conditions.length + '):');
  for (const c of facts.conditions) {
    console.log(`   • [${c.confidence.toUpperCase().padEnd(8)}] ${c.name}  (${c.icd10})`);
    console.log(`        ${c.evidence.slice(0, 130)}`);
  }

  console.log('\n💊 SUPPLEMENT CANDIDATES (' + facts.supplementCandidates.length + '):');
  for (const s of facts.supplementCandidates) {
    console.log(`   • [${s.priority.padEnd(8)}] ${s.nutrient}  ${s.dose}  ${s.timing}  (${s.sourcedFrom})`);
  }

  console.log('\n💧 MED-DRIVEN DEPLETIONS (' + facts.depletions.length + '):');
  for (const d of facts.depletions) {
    console.log(`   • ${d.medsMatched.join(' / ')}  →  ${d.nutrient}  (${d.severity})`);
  }

  console.log('\n🎯 GOAL TARGETS (' + facts.goalTargets.length + '):');
  for (const g of facts.goalTargets) {
    console.log(`   • ${g.emoji} ${g.marker}: ${g.today} → ${g.goal} ${g.unit}  ${g.deltaText}`);
  }

  console.log('\n🚨 EMERGENCY ALERTS (' + facts.emergencyAlerts.length + '):');
  for (const a of facts.emergencyAlerts) {
    console.log(`   • ${a.marker} ${a.value} ${a.unit} [${a.threshold}]: ${a.message.slice(0, 100)}`);
  }

  console.log('\n📊 RISK CALCULATORS:');
  if (facts.riskCalculators.ascvd_10yr) console.log(`   • ASCVD 10-yr: ${facts.riskCalculators.ascvd_10yr.value}% (${facts.riskCalculators.ascvd_10yr.category})`);
  if (facts.riskCalculators.fib4) console.log(`   • FIB-4: ${facts.riskCalculators.fib4.value} (${facts.riskCalculators.fib4.category})`);
  if (facts.riskCalculators.homa_ir) console.log(`   • HOMA-IR: ${facts.riskCalculators.homa_ir.value} (${facts.riskCalculators.homa_ir.category})`);
  if (facts.riskCalculators.tg_hdl_ratio) console.log(`   • TG/HDL: ${facts.riskCalculators.tg_hdl_ratio.value} (${facts.riskCalculators.tg_hdl_ratio.category})`);

  console.log('\n💬 SYMPTOMS_ADDRESSED PROSE (' + facts.symptomsAddressed.length + '):');
  for (const s of facts.symptomsAddressed) {
    console.log(`   • ${s.symptom}: ${s.how_addressed.slice(0, 130)}...`);
  }

  console.log('\n🔧 MODE: ' + (facts.isOptimizationMode ? 'optimization' : 'treatment'));
}

console.log('\n' + '━'.repeat(90));
console.log('END');
console.log('━'.repeat(90));
