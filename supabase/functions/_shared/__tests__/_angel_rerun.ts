// READ-ONLY rerun of Angel's exact profile through the current engine.
// Does NOT touch his stored plan. Just dumps what the engine WOULD generate
// today for the same labs — so we can grade the improvement.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}

// Angel's actual labs as pulled from the DB read-only audit:
const labs: LabValue[] = [
  lab('Alanina aminotransferasa (ALT/GPT)', 105, 'U/L', 'critical_high'),
  lab('Aspartato aminotransferasa (AST/GOT)', 56, 'U/L', 'critical_high'),
  lab('Colesterol HDL', 37, 'mg/dL', 'low'),
  lab('Creatinina', 1.35, 'mg/dL', 'high'),
  lab('Hematocrito', 50.8, '%', 'high'),
  lab('Leucocitos', 15.3, 'x10³/mm³', 'critical_high'),
  lab('Linfocitos %', 15.3, '%', 'low'),
  lab('Monocitos', 1.2, 'x10³/mm³', 'high'),
  lab('Neutrófilos', 11.6, 'x10³/mm³', 'critical_high'),
  lab('Testosterona total', 13.8, 'ng/mL', 'critical_high'),
  lab('Vitamina D 25OH (calcidiol)', 104.2, 'ng/mL', 'high'),
  lab('Hormona estimulante del tiroides (TSH)', 2.99, 'mU/L', 'watch'),
  // Normals (truncated — only the abnormal + a few representative normals)
  lab('Colesterol LDL', 77, 'mg/dL'),
  lab('Triglicéridos', 62, 'mg/dL'),
  lab('Hemoglobina', 16.8, 'g/dL'),
  lab('Hemoglobina A1c (NGSP)', 4.7, '%'),
  lab('Ferritina', 148, 'ng/mL'),
  lab('Hierro', 73, 'µg/dL'),
  lab('Magnesio', 2.1, 'mg/dL'),
  lab('Potasio', 3.9, 'mEq/L'),
  lab('PSA (Antígeno prostático específico)', 0.58, 'ng/mL'),
];

const input: PatientInput = {
  age: 58, sex: 'male',
  heightCm: 175, weightKg: 80, bmi: 27,
  conditionsList: [], conditionsLower: '',
  medsList: [], medsLower: '',
  symptomsList: [], symptomsLower: '',
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
console.log('  ANGEL RE-RUN — engine output as of 2026-05-13-54');
console.log('  READ-ONLY: stored plan is NOT modified.');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('CHIEF COMPLAINT:');
console.log(`  ${trim(plan.chiefComplaint, 400)}\n`);

console.log('HPI:');
console.log(`  ${trim(plan.hpi, 600)}\n`);

console.log(`CONDITIONS DETECTED (${plan.conditions.length}):`);
for (const c of plan.conditions) {
  console.log(`  • ${c.name}`);
  console.log(`      ${trim(c.evidence, 320)}`);
}

console.log(`\nTESTS RECOMMENDED (${plan.tests.length}):`);
for (const t of plan.tests) console.log(`  • ${t.name}`);

console.log(`\nDISCUSSION POINTS (${plan.discussionPoints.length}):`);
for (const d of plan.discussionPoints) console.log(`  • ${trim(d, 320)}`);

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

if ((plan as any).emergencyAlerts?.length) {
  console.log(`\nEMERGENCY ALERTS:`);
  for (const a of (plan as any).emergencyAlerts) console.log(`  • ${trim(a.message ?? String(a), 240)}`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
