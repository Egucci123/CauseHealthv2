// supabase/functions/synthetic-patient-test/index.ts
//
// TEMPORARY TEST HARNESS — runs buildPlan() on 5 synthetic patients
// and returns the deterministic facts report. Used for QA only.
// DELETE AFTER LAUNCH.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildPlan, type PatientInput, type LabValue } from '../_shared/buildPlan.ts';

function lab(marker: string, value: number, unit: string, flag: LabValue['flag'] = 'healthy'): LabValue {
  return { marker, value, unit, flag };
}

function makeInput(args: any): PatientInput {
  const bmi = +(args.weightKg / Math.pow(args.heightCm / 100, 2)).toFixed(1);
  const labsLower = args.labs.map((l: any) => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();
  return {
    age: args.age, sex: args.sex,
    heightCm: args.heightCm, weightKg: args.weightKg, bmi,
    conditionsList: args.conditions ?? [],
    conditionsLower: (args.conditions ?? []).join(' ').toLowerCase(),
    medsList: args.meds ?? [],
    medsLower: (args.meds ?? []).join(' ').toLowerCase(),
    symptomsList: args.symptoms ?? [],
    symptomsLower: (args.symptoms ?? []).map((s: any) => `${s.name} (${s.severity}/10)`).join(' ').toLowerCase(),
    supplementsList: args.supplements ?? [],
    supplementsLower: (args.supplements ?? []).join(' ').toLowerCase(),
    labs: args.labs,
    labsLower,
    isPregnant: false,
    hasShellfishAllergy: false,
    hasSulfaAllergy: false,
    freeText: '',
  };
}

const profiles: Array<[string, any]> = [
  ['1. HEALTHY 28F', {
    age: 28, sex: 'female', heightCm: 168, weightKg: 62,
    conditions: [], meds: [], symptoms: [], supplements: [],
    labs: [
      lab('ALT', 18, 'IU/L'), lab('AST', 21, 'IU/L'),
      lab('Triglycerides', 88, 'mg/dL'), lab('Cholesterol, Total', 178, 'mg/dL'),
      lab('LDL Cholesterol', 95, 'mg/dL'), lab('HDL Cholesterol', 62, 'mg/dL'),
      lab('Glucose, Serum', 84, 'mg/dL'), lab('Hemoglobin A1c', 5.0, '%'),
      lab('25-Hydroxy, Vitamin D', 38, 'ng/mL'), lab('TSH', 1.5, 'uIU/mL'),
      lab('Vitamin B12', 612, 'pg/mL'), lab('RBC', 4.4, 'x10E6/uL'),
      lab('Hemoglobin', 13.6, 'g/dL'), lab('Hematocrit', 41, '%'),
      lab('Albumin, Serum', 4.4, 'g/dL'), lab('Ferritin', 88, 'ng/mL'),
      lab('Creatinine, Serum', 0.78, 'mg/dL'),
    ],
  }],
  ['2. BORDERLINE 35M', {
    age: 35, sex: 'male', heightCm: 178, weightKg: 84,
    conditions: [], meds: [],
    symptoms: [{ name: 'Chronic fatigue', severity: 4 }, { name: 'Difficulty losing weight', severity: 5 }],
    supplements: [],
    labs: [
      lab('ALT', 38, 'IU/L', 'watch'), lab('AST', 32, 'IU/L'),
      lab('Triglycerides', 158, 'mg/dL', 'watch'), lab('Cholesterol, Total', 215, 'mg/dL', 'watch'),
      lab('LDL Cholesterol', 138, 'mg/dL', 'watch'), lab('HDL Cholesterol', 42, 'mg/dL', 'watch'),
      lab('Glucose, Serum', 98, 'mg/dL', 'watch'), lab('Hemoglobin A1c', 5.5, '%', 'watch'),
      lab('25-Hydroxy, Vitamin D', 28, 'ng/mL', 'low'),
      lab('TSH', 2.6, 'uIU/mL', 'watch'), lab('Testosterone, Serum', 480, 'ng/dL'),
      lab('RBC', 5.2, 'x10E6/uL'), lab('Hemoglobin', 15.3, 'g/dL'),
      lab('Hematocrit', 45.8, '%'),
    ],
  }],
  ['3. PCOS-suspicion 26F', {
    age: 26, sex: 'female', heightCm: 165, weightKg: 78,
    conditions: [], meds: [],
    symptoms: [
      { name: 'Irregular cycle', severity: 7 }, { name: 'Acne', severity: 6 },
      { name: 'Hirsutism', severity: 5 }, { name: 'Difficulty losing weight', severity: 7 },
      { name: 'Mood swings', severity: 6 },
    ],
    supplements: [],
    labs: [
      lab('ALT', 28, 'IU/L'), lab('AST', 22, 'IU/L'),
      lab('Triglycerides', 142, 'mg/dL'), lab('Cholesterol, Total', 198, 'mg/dL'),
      lab('LDL Cholesterol', 115, 'mg/dL'), lab('HDL Cholesterol', 48, 'mg/dL'),
      lab('Glucose, Serum', 96, 'mg/dL', 'watch'), lab('Hemoglobin A1c', 5.6, '%', 'watch'),
      lab('25-Hydroxy, Vitamin D', 22, 'ng/mL', 'low'),
      lab('TSH', 1.8, 'uIU/mL'),
      lab('Hemoglobin', 13.0, 'g/dL'), lab('Ferritin', 28, 'ng/mL', 'low'),
    ],
  }],
  ['4. POSTMENOPAUSAL 58F', {
    age: 58, sex: 'female', heightCm: 162, weightKg: 70,
    conditions: ['Osteopenia', 'Hypertension'],
    meds: ['lisinopril', 'hydrochlorothiazide'],
    symptoms: [
      { name: 'Joint stiffness', severity: 6 }, { name: 'Fatigue', severity: 5 },
      { name: 'Hot flashes', severity: 4 },
    ],
    supplements: ['Vitamin D3'],
    labs: [
      lab('ALT', 24, 'IU/L'), lab('AST', 26, 'IU/L'),
      lab('Triglycerides', 168, 'mg/dL', 'watch'), lab('Cholesterol, Total', 232, 'mg/dL', 'watch'),
      lab('LDL Cholesterol', 145, 'mg/dL', 'watch'), lab('HDL Cholesterol', 56, 'mg/dL'),
      lab('Glucose, Serum', 102, 'mg/dL', 'watch'), lab('Hemoglobin A1c', 5.7, '%', 'high'),
      lab('25-Hydroxy, Vitamin D', 32, 'ng/mL', 'watch'),
      lab('TSH', 3.2, 'uIU/mL', 'watch'), lab('FSH', 78, 'mIU/mL', 'high'),
      lab('Calcium', 9.4, 'mg/dL'), lab('Albumin, Serum', 4.2, 'g/dL'),
      lab('Hemoglobin', 13.2, 'g/dL'), lab('Potassium, Serum', 3.9, 'mEq/L'),
    ],
  }],
  ['5. SEVERE METABOLIC 52M', {
    age: 52, sex: 'male', heightCm: 175, weightKg: 110,
    conditions: ['Type 2 Diabetes', 'High Cholesterol'],
    meds: ['metformin', 'atorvastatin', 'omeprazole'],
    symptoms: [
      { name: 'Chronic fatigue', severity: 8 }, { name: 'Joint stiffness', severity: 6 },
      { name: 'Difficulty losing weight', severity: 9 }, { name: 'Brain fog', severity: 7 },
      { name: 'Snoring', severity: 8 }, { name: 'Waking during night', severity: 7 },
    ],
    supplements: [],
    labs: [
      lab('ALT', 78, 'IU/L', 'high'), lab('AST', 54, 'IU/L', 'high'),
      lab('GGT', 96, 'IU/L', 'high'),
      lab('Triglycerides', 412, 'mg/dL', 'critical_high'),
      lab('Cholesterol, Total', 248, 'mg/dL', 'high'),
      lab('LDL Cholesterol', 158, 'mg/dL', 'high'), lab('HDL Cholesterol', 32, 'mg/dL', 'low'),
      lab('VLDL Cholesterol', 82, 'mg/dL', 'critical_high'),
      lab('Glucose, Serum', 162, 'mg/dL', 'high'),
      lab('Hemoglobin A1c', 7.8, '%', 'high'),
      lab('25-Hydroxy, Vitamin D', 18, 'ng/mL', 'low'),
      lab('TSH', 1.9, 'uIU/mL'),
      lab('Vitamin B12', 245, 'pg/mL', 'low'),
      lab('Testosterone, Serum', 280, 'ng/dL', 'low'),
      lab('Hemoglobin', 17.2, 'g/dL', 'high'),
      lab('Hematocrit', 51.6, '%', 'high'), lab('RBC', 5.9, 'x10E6/uL', 'high'),
      lab('Albumin, Serum', 4.3, 'g/dL'), lab('Creatinine, Serum', 1.1, 'mg/dL'),
      lab('hs-CRP', 4.2, 'mg/L', 'high'),
    ],
  }],
];

serve(async () => {
  const reports: any[] = [];
  for (const [label, args] of profiles) {
    const input = makeInput(args);
    const facts = buildPlan(input);
    reports.push({
      patient: label,
      profile: {
        age: input.age, sex: input.sex, bmi: input.bmi,
        meds: input.medsList, conditions: input.conditionsList,
        symptoms: input.symptomsList.length, labs: input.labs.length,
      },
      tests: facts.tests.map(t => ({ name: t.name, priority: t.priority, specialist: t.specialist })),
      conditions: facts.conditions.map(c => ({ name: c.name, confidence: c.confidence, evidence: c.evidence })),
      supplements: facts.supplementCandidates.map(s => ({ nutrient: s.nutrient, dose: s.dose, priority: s.priority, source: s.sourcedFrom })),
      depletions: facts.depletions.map(d => ({ med: d.medsMatched.join(' / '), nutrient: d.nutrient, severity: d.severity })),
      goal_targets: facts.goalTargets,
      emergency_alerts: facts.emergencyAlerts.map(a => `${a.marker} ${a.value} [${a.threshold}]`),
      risk_calculators: facts.riskCalculators,
      symptoms_addressed_count: facts.symptomsAddressed.length,
      mode: facts.isOptimizationMode ? 'optimization' : 'treatment',
      outliers: facts.labs.outliers.length,
    });
  }
  return new Response(JSON.stringify(reports, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
