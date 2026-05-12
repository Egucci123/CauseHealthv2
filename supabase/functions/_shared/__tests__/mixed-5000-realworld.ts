// MIXED 5,000 — REAL-WORLD POPULATION DISTRIBUTION
// =================================================
// 5,000 adults randomly assigned to one of THREE populations:
//   33% Healthy (no underlying, normal labs)
//   33% Textbook disease (one of 12 classical patterns)
//   34% Subtle close-call (one of 12 edge-of-normal patterns)
//
// Validates the engine works correctly across the FULL clinical
// spectrum in one pass — what a real day at the app would look like.
//
// Asserts:
//   • Healthy patients: 0 patterns fire (no false alarms)
//   • Disease patients: planted pattern caught (sensitivity)
//   • Subtle patients: planted pattern caught (close-call sensitivity)
//   • Sex-gating bulletproof across all 5,000
//   • No duplicates in tests / supps / conditions

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function mulberry32(seed: number) {
  let a = seed;
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function rint(lo: number, hi: number, rng: () => number): number { return Math.floor(rng() * (hi - lo + 1)) + lo; }
function rfloat(lo: number, hi: number, rng: () => number, dp = 1): number { return +((rng() * (hi - lo)) + lo).toFixed(dp); }
function pick<T>(arr: T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]; }

const HEALTHY_LABS = (rng: () => number): LabValue[] => [
  lab('Sodium', rfloat(136, 144, rng), 'mEq/L'),
  lab('Potassium', rfloat(3.7, 5.0, rng, 1), 'mEq/L'),
  lab('Creatinine', rfloat(0.7, 1.2, rng, 2), 'mg/dL'),
  lab('Glucose', rfloat(75, 95, rng), 'mg/dL'),
  lab('ALT', rfloat(10, 30, rng), 'U/L'),
  lab('Hemoglobin', rfloat(13.0, 16.5, rng, 1), 'g/dL'),
  lab('Total Cholesterol', rfloat(140, 195, rng), 'mg/dL'),
  lab('LDL', rfloat(60, 120, rng), 'mg/dL'),
  lab('HDL', rfloat(45, 75, rng), 'mg/dL'),
  lab('Triglycerides', rfloat(50, 140, rng), 'mg/dL'),
  lab('Hemoglobin A1c', rfloat(4.5, 5.3, rng, 1), '%'),
  lab('TSH', rfloat(0.5, 2.5, rng, 1), 'mIU/L'),
  lab('Vitamin D 25-hydroxy', rfloat(35, 70, rng), 'ng/mL'),
  lab('Ferritin', rfloat(50, 200, rng), 'ng/mL'),
];

type Category = 'healthy' | 'disease' | 'subtle';

interface DiseasePlant {
  id: string;
  expected: RegExp[];
  gen: (rng: () => number, sex: 'male'|'female') => { labs: LabValue[]; symptoms?: string[]; conditions?: string[] };
}

const DISEASE_PATTERNS: DiseasePlant[] = [
  { id:'hemochromatosis', expected:[/hemochromatos|iron overload/i], gen:(rng)=>({
    labs:[lab('Ferritin',rfloat(450,1200,rng),'ng/mL','high'),lab('Transferrin Saturation',rfloat(50,78,rng),'%','high'),lab('Iron',rfloat(180,260,rng),'µg/dL','high')]
  })},
  { id:'metabolic_syndrome', expected:[/insulin resistance|metabolic syndrome|prediab/i], gen:(rng)=>({
    labs:[lab('Hemoglobin A1c',rfloat(5.8,6.4,rng,1),'%','watch'),lab('Triglycerides',rfloat(180,320,rng),'mg/dL','high'),lab('HDL',rfloat(28,38,rng),'mg/dL','low'),lab('Glucose',rfloat(102,120,rng),'mg/dL','watch')]
  })},
  { id:'hashimoto', expected:[/hypothyroid|hashimoto|thyroid pattern/i], gen:(rng)=>({
    labs:[lab('TSH',rfloat(4.6,9.5,rng,1),'mIU/L','high')]
  })},
  { id:'graves', expected:[/hyperthyroid|graves/i], gen:(rng)=>({
    labs:[lab('TSH',rfloat(0.05,0.35,rng,2),'mIU/L','low')]
  })},
  { id:'nafld', expected:[/nafld|fatty liver|hepatic stress/i], gen:(rng)=>({
    labs:[lab('ALT',rfloat(55,110,rng),'U/L','high'),lab('AST',rfloat(45,90,rng),'U/L','high'),lab('Triglycerides',rfloat(180,280,rng),'mg/dL','high'),lab('Hemoglobin A1c',rfloat(5.5,6.2,rng,1),'%','watch')]
  })},
  { id:'cushing', expected:[/cushing|cortisol/i], gen:(rng)=>({
    labs:[lab('Cortisol - AM',rfloat(24,35,rng,1),'µg/dL','high')]
  })},
  { id:'cv_drift', expected:[/cholesterol|lipid|particle.*pattern|ldl|hypercholesterol/i], gen:(rng)=>({
    labs:[lab('Total Cholesterol',rfloat(230,290,rng),'mg/dL','high'),lab('LDL',rfloat(155,210,rng),'mg/dL','high'),lab('ApoB',rfloat(105,145,rng),'mg/dL','high')]
  })},
  { id:'iron_def_anemia', expected:[/iron deficien|anemia/i], gen:(rng)=>({
    labs:[lab('Hemoglobin',rfloat(9.5,11.5,rng,1),'g/dL','low'),lab('Ferritin',rfloat(4,18,rng,1),'ng/mL','low'),lab('MCV',rfloat(68,78,rng),'fL','low')]
  })},
  { id:'b12_deficient', expected:[/b12|cobalamin|pernicious/i], gen:(rng)=>({
    labs:[lab('B12',rfloat(120,200,rng),'pg/mL','low'),lab('MCV',rfloat(102,112,rng),'fL','high'),lab('MMA',rfloat(380,700,rng),'nmol/L','high')]
  })},
  { id:'ckd', expected:[/kidney|ckd|renal/i], gen:(rng)=>({
    labs:[lab('Creatinine',rfloat(1.6,2.4,rng,1),'mg/dL','high'),lab('eGFR',rfloat(35,58,rng),'mL/min','low'),lab('BUN',rfloat(28,48,rng),'mg/dL','high')]
  })},
  { id:'liver_acute', expected:[/liver|hepatic|nafld/i], gen:(rng)=>({
    labs:[lab('ALT',rfloat(120,280,rng),'U/L','high'),lab('AST',rfloat(80,200,rng),'U/L','high'),lab('Total Bilirubin',rfloat(1.5,3.5,rng,1),'mg/dL','high'),lab('GGT',rfloat(145,320,rng),'U/L','high')]
  })},
  { id:'prediabetes', expected:[/prediab|insulin resistance|metabolic/i], gen:(rng)=>({
    labs:[lab('Hemoglobin A1c',rfloat(5.7,6.3,rng,1),'%','watch'),lab('Glucose',rfloat(100,122,rng),'mg/dL','watch')]
  })},
];

const SUBTLE_PATTERNS: DiseasePlant[] = [
  { id:'subclinical_hypothyroid', expected:[/thyroid|hypothyroid|hashimoto|subclinical/i], gen:(rng)=>({
    labs:[lab('TSH',rfloat(2.6,4.4,rng,1),'mIU/L','watch')],
    symptoms:['Chronic fatigue','Brain fog','Cold intolerance'],
  })},
  { id:'early_prediabetes', expected:[/prediab|insulin resistance|metabolic/i], gen:(rng)=>({
    labs:[lab('Hemoglobin A1c',rfloat(5.6,5.7,rng,1),'%','watch')],
    symptoms:['Weight gain despite diet'],
  })},
  { id:'subtle_iron_deficiency', expected:[/iron deficien|anemia|hypochromic|early/i], gen:(rng,sex)=>({
    labs:[lab('Ferritin',rfloat(18,30,rng),'ng/mL','low'),lab('Hemoglobin',sex==='female'?rfloat(11.5,12.4,rng,1):rfloat(13.0,13.6,rng,1),'g/dL','low')],
    symptoms:['Chronic fatigue','Hair loss — no family history'],
  })},
  { id:'early_hemochromatosis', expected:[/hemochromatos|iron overload/i], gen:(rng)=>({
    labs:[lab('Ferritin',rfloat(280,380,rng),'ng/mL','high'),lab('Transferrin Saturation',rfloat(46,55,rng),'%','high')],
    symptoms:['Joint pain','Chronic fatigue'],
  })},
  { id:'functional_b12_low', expected:[/b12|cobalamin|pernicious|deficiency/i], gen:(rng)=>({
    labs:[lab('B12',rfloat(220,330,rng),'pg/mL'),lab('MMA',rfloat(280,420,rng),'nmol/L','high'),lab('Homocysteine',rfloat(11,15,rng,1),'µmol/L','high')],
    symptoms:['Chronic fatigue','Brain fog'],
  })},
  { id:'pre_nafld', expected:[/nafld|hepatic stress|fatty liver/i], gen:(rng)=>({
    labs:[lab('ALT',rfloat(38,52,rng),'U/L','high'),lab('Triglycerides',rfloat(150,185,rng),'mg/dL','high'),lab('Hemoglobin A1c',rfloat(5.4,5.7,rng,1),'%','watch')],
  })},
  { id:'subclinical_ckd', expected:[/ckd|kidney|renal/i], gen:(rng)=>({
    labs:[lab('Creatinine',rfloat(1.15,1.35,rng,2),'mg/dL'),lab('eGFR',rfloat(58,72,rng),'mL/min','low')],
  })},
  { id:'vit_d_insufficient', expected:[/vitamin d|deficien/i], gen:(rng)=>({
    labs:[lab('Vitamin D 25-hydroxy',rfloat(22,29,rng),'ng/mL','low')],
    symptoms:['Chronic fatigue'],
  })},
  { id:'borderline_hyperchol', expected:[/cholesterol|lipid|hyperchol|particle/i], gen:(rng)=>({
    labs:[lab('Total Cholesterol',rfloat(205,235,rng),'mg/dL'),lab('LDL',rfloat(132,152,rng),'mg/dL','high'),lab('ApoB',rfloat(92,108,rng),'mg/dL')],
  })},
  { id:'borderline_cortisol', expected:[/cortisol|cushing|adrenal/i], gen:(rng)=>({
    labs:[lab('Cortisol AM',rfloat(20.5,23.5,rng,1),'µg/dL','watch')],
    symptoms:['Chronic fatigue','Weight gain despite diet'],
  })},
  { id:'subclinical_hyperthyroid', expected:[/hyperthyroid|graves|thyroid pattern/i], gen:(rng)=>({
    labs:[lab('TSH',rfloat(0.30,0.42,rng,2),'mIU/L','low')],
    symptoms:['Heart palpitations'],
  })},
];

function makePatient(rng: () => number, category: Category): { input: PatientInput; planted: string|null; expected: RegExp[]|null } {
  const age = rint(25, 80, rng);
  const sex: 'male'|'female' = rng() < 0.5 ? 'male' : 'female';
  const heightCm = rint(155, 195, rng);
  const bmi = rfloat(22, 31, rng, 1);
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  let labs: LabValue[] = [];
  let symptoms: { name: string; severity: number }[] = [];
  let conditions: string[] = [];
  let planted: string|null = null;
  let expected: RegExp[]|null = null;

  if (category === 'healthy') {
    labs = rng() < 0.5 ? HEALTHY_LABS(rng) : [];
  } else if (category === 'disease') {
    const profile = pick(DISEASE_PATTERNS, rng);
    const gen = profile.gen(rng, sex);
    labs = gen.labs;
    symptoms = (gen.symptoms ?? []).map(name => ({ name, severity: 4 }));
    conditions = gen.conditions ?? [];
    planted = profile.id;
    expected = profile.expected;
  } else {
    const profile = pick(SUBTLE_PATTERNS, rng);
    const gen = profile.gen(rng, sex);
    labs = gen.labs;
    symptoms = (gen.symptoms ?? []).map(name => ({ name, severity: 3 }));
    conditions = gen.conditions ?? [];
    planted = profile.id;
    expected = profile.expected;
  }

  return {
    input: {
      age, sex, heightCm, weightKg, bmi,
      conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
      medsList: [], medsLower: '',
      symptomsList: symptoms,
      symptomsLower: symptoms.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
      supplementsList: [], supplementsLower: '',
      labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
      isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
      freeText: '',
    },
    planted,
    expected,
  };
}

// ── RUNNER ──────────────────────────────────────────────────────────
const N = 5000;
const seed = 1234;
const rng = mulberry32(seed);

const FEMALE_ONLY = [/pap smear|cervical/i, /\bamh\b/i, /female hormone panel/i, /pcos panel/i, /mammogram/i];
const MALE_ONLY = [/\bpsa\b/i];

let healthyPatients = 0, healthyFalseFires = 0;
let diseasePatients = 0, diseaseCaught = 0;
let subtlePatients = 0, subtleCaught = 0;
let sexLeaks = 0;
let dupTests = 0, dupSupps = 0, dupConds = 0;
const missedDiseases: Map<string, number> = new Map();
const missedSubtle: Map<string, number> = new Map();

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  MIXED 5000 REAL-WORLD AUDIT — ${N} adults`);
console.log(`  33% Healthy | 33% Textbook Disease | 34% Subtle Close-Call`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
for (let i = 0; i < N; i++) {
  const r = rng();
  const category: Category = r < 0.33 ? 'healthy' : r < 0.66 ? 'disease' : 'subtle';
  const { input: p, planted, expected } = makePatient(rng, category);
  const plan = buildPlan(p);

  // Universal safety
  for (const t of plan.tests) {
    if (p.sex === 'male'   && FEMALE_ONLY.some(re => re.test(t.name))) sexLeaks++;
    if (p.sex === 'female' && MALE_ONLY.some(re => re.test(t.name)))   sexLeaks++;
  }
  // Dup checks
  const testNames = plan.tests.map(t => t.name);
  if (testNames.length !== new Set(testNames).size) dupTests++;
  const suppNames = plan.supplementCandidates.map(s => s.nutrient);
  if (suppNames.length !== new Set(suppNames).size) dupSupps++;
  const condNames = plan.conditions.map(c => c.name);
  if (condNames.length !== new Set(condNames).size) dupConds++;

  // Category-specific
  if (category === 'healthy') {
    healthyPatients++;
    if (plan.conditions.length > 0) healthyFalseFires++;
  } else if (category === 'disease') {
    diseasePatients++;
    const hit = plan.conditions.some(c => expected!.some(re => re.test(c.name)));
    if (hit) diseaseCaught++;
    else missedDiseases.set(planted!, (missedDiseases.get(planted!) ?? 0) + 1);
  } else {
    subtlePatients++;
    const hit = plan.conditions.some(c => expected!.some(re => re.test(c.name)));
    if (hit) subtleCaught++;
    else missedSubtle.set(planted!, (missedSubtle.get(planted!) ?? 0) + 1);
  }
}
const elapsed = Date.now() - start;
console.log(`Ran ${N} in ${elapsed}ms (${(elapsed/N).toFixed(1)}ms/patient)\n`);

console.log(`──── POPULATION BREAKDOWN ────`);
console.log(`Healthy:               n=${String(healthyPatients).padStart(5)}`);
console.log(`Textbook disease:      n=${String(diseasePatients).padStart(5)}`);
console.log(`Subtle close-call:     n=${String(subtlePatients).padStart(5)}`);
console.log();

console.log(`──── HEALTHY POPULATION ────`);
console.log(`False pattern fires:  ${healthyFalseFires === 0 ? '✅ 0' : '❌ '+healthyFalseFires}`);
console.log(`(Healthy patients should produce 0 condition patterns)`);
console.log();

console.log(`──── DISEASE SENSITIVITY ────`);
const diseaseRate = diseasePatients > 0 ? (diseaseCaught/diseasePatients*100) : 0;
console.log(`${diseaseRate >= 95 ? '✅' : diseaseRate >= 80 ? '⚠️' : '❌'} ${diseaseCaught}/${diseasePatients} = ${diseaseRate.toFixed(1)}%`);
if (missedDiseases.size > 0) {
  console.log(`Missed pattern breakdown:`);
  for (const [id, n] of missedDiseases) console.log(`  • ${id}: ${n}x`);
}
console.log();

console.log(`──── SUBTLE / CLOSE-CALL SENSITIVITY ────`);
const subtleRate = subtlePatients > 0 ? (subtleCaught/subtlePatients*100) : 0;
console.log(`${subtleRate >= 95 ? '✅' : subtleRate >= 80 ? '⚠️' : '❌'} ${subtleCaught}/${subtlePatients} = ${subtleRate.toFixed(1)}%`);
if (missedSubtle.size > 0) {
  console.log(`Missed pattern breakdown:`);
  for (const [id, n] of missedSubtle) console.log(`  • ${id}: ${n}x`);
}
console.log();

console.log(`──── SAFETY INVARIANTS ────`);
console.log(`Sex-gate leaks:        ${sexLeaks === 0 ? '✅ 0' : '❌ '+sexLeaks}`);
console.log(`Duplicate tests:       ${dupTests === 0 ? '✅ 0' : '❌ '+dupTests}`);
console.log(`Duplicate supps:       ${dupSupps === 0 ? '✅ 0' : '❌ '+dupSupps}`);
console.log(`Duplicate conditions:  ${dupConds === 0 ? '✅ 0' : '❌ '+dupConds}`);

const allPass = healthyFalseFires === 0 && diseaseRate >= 95 && subtleRate >= 95 &&
                sexLeaks === 0 && dupTests === 0 && dupSupps === 0 && dupConds === 0;
console.log();
console.log(allPass ? `✅ MIXED REAL-WORLD AUDIT PASSES` : `❌ FAILURES DETECTED`);
Deno.exit(allPass ? 0 : 1);
