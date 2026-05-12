// Debug: simulate edgemech's exact lab values through buildPlan
import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

const labs: LabValue[] = [
  { marker: '25-Hydroxy, Vitamin D', value: 24, unit: 'ng/mL', flag: 'low' },
  { marker: 'ALT (SGPT)', value: 97, unit: 'IU/L', flag: 'high' },
  { marker: 'AST (SGOT)', value: 48, unit: 'IU/L', flag: 'high' },
  { marker: 'Bilirubin, Total', value: 1.4, unit: 'mg/dL', flag: 'high' },
  { marker: 'Cholesterol, Total', value: 269, unit: 'mg/dL', flag: 'high' },
  { marker: 'Glucose, Serum', value: 98, unit: 'mg/dL', flag: 'watch' },
  { marker: 'HDL Cholesterol', value: 41, unit: 'mg/dL', flag: 'watch' },
  { marker: 'Hematocrit', value: 51.4, unit: '%', flag: 'high' },
  { marker: 'Hemoglobin', value: 17.5, unit: 'g/dL', flag: 'normal' },
  { marker: 'Hemoglobin A1c', value: 5.5, unit: '%', flag: 'watch' },
  { marker: 'LDL Cholesterol Calc', value: 166, unit: 'mg/dL', flag: 'high' },
  { marker: 'RBC', value: 5.96, unit: 'x10E6/uL', flag: 'high' },
  { marker: 'Testosterone, Serum', value: 496, unit: 'ng/dL', flag: 'watch' },
  { marker: 'Triglycerides', value: 327, unit: 'mg/dL', flag: 'high' },
  { marker: 'VLDL Cholesterol Calc', value: 62, unit: 'mg/dL', flag: 'high' },
  { marker: 'Vitamin B12', value: 586, unit: 'pg/mL', flag: 'normal' },
];

const input: PatientInput = {
  age: 32, sex: 'male', heightCm: 178, weightKg: 95, bmi: 30,
  conditionsList: [], conditionsLower: '',
  medsList: [], medsLower: '',
  symptomsList: [], symptomsLower: '',
  supplementsList: [], supplementsLower: '',
  labs, labsLower: labs.map(l => `${l.marker}: ${l.value} [${l.flag}]`).join('\n').toLowerCase(),
  isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
};

const plan = buildPlan(input);

console.log('═══════════════ EDGEMECH SIMULATION ═══════════════');
console.log(`\nConditions (${plan.conditions.length}):`);
for (const c of plan.conditions) console.log(`  • ${c.name} [${c.confidence}]`);
console.log(`\nSupplement candidates (${plan.supplementCandidates.length}):`);
for (const s of plan.supplementCandidates) {
  console.log(`  • [${s.priority}/${s.category}] ${s.nutrient} ${s.dose} — ${s.sourcedFrom} — ${s.whyShort?.slice(0,60)}`);
}
console.log(`\nAll outliers seen by rules engine:`);
for (const o of plan.labs.outliers) console.log(`  • ${o.marker} ${o.value} [${o.flag}] rank=${o.severityRank}`);
