// HEALTHY-POPULATION FULL AUDIT — TESTS + SUPPLEMENTS + PATTERNS + ANALYSIS
// =========================================================================
// Extends healthy-5000.ts to audit EVERY engine output dimension for
// healthy adults: tests, supplements, patterns, conditions, depletions,
// emergency alerts, expected findings, lab outliers, suboptimal flags,
// risk calculators, goal targets, symptoms addressed.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string): LabValue {
  return { marker: m, value: v, unit: u, flag: 'normal' };
}
function mulberry32(seed: number) {
  let a = seed;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function rint(lo: number, hi: number, rng: () => number): number { return Math.floor(rng() * (hi - lo + 1)) + lo; }
function rfloat(lo: number, hi: number, rng: () => number, dp = 1): number { return +((rng() * (hi - lo)) + lo).toFixed(dp); }

const HEALTHY_LAB_TEMPLATES: Array<{ marker: string; unit: string; lo: number; hi: number; dp?: number }> = [
  { marker:'Sodium', unit:'mEq/L', lo:136, hi:144 },
  { marker:'Potassium', unit:'mEq/L', lo:3.7, hi:5.0, dp:1 },
  { marker:'Chloride', unit:'mEq/L', lo:98, hi:106 },
  { marker:'Creatinine', unit:'mg/dL', lo:0.7, hi:1.2, dp:2 },
  { marker:'BUN', unit:'mg/dL', lo:8, hi:20 },
  { marker:'Glucose', unit:'mg/dL', lo:75, hi:95 },
  { marker:'Calcium', unit:'mg/dL', lo:8.8, hi:10.2, dp:1 },
  { marker:'Albumin', unit:'g/dL', lo:3.8, hi:4.8, dp:1 },
  { marker:'ALT', unit:'U/L', lo:10, hi:30 },
  { marker:'AST', unit:'U/L', lo:10, hi:30 },
  { marker:'Alkaline Phosphatase', unit:'U/L', lo:50, hi:115 },
  { marker:'Total Bilirubin', unit:'mg/dL', lo:0.3, hi:1.0, dp:2 },
  { marker:'WBC', unit:'K/µL', lo:4.5, hi:10.5, dp:1 },
  { marker:'Platelets', unit:'K/µL', lo:160, hi:380 },
  { marker:'Hemoglobin', unit:'g/dL', lo:13.0, hi:16.5, dp:1 },
  { marker:'Hematocrit', unit:'%', lo:38, hi:48 },
  { marker:'MCV', unit:'fL', lo:82, hi:98 },
  { marker:'Total Cholesterol', unit:'mg/dL', lo:140, hi:195 },
  { marker:'LDL', unit:'mg/dL', lo:60, hi:120 },
  { marker:'HDL', unit:'mg/dL', lo:45, hi:75 },
  { marker:'Triglycerides', unit:'mg/dL', lo:50, hi:140 },
  { marker:'Hemoglobin A1c', unit:'%', lo:4.5, hi:5.3, dp:1 },
  { marker:'TSH', unit:'mIU/L', lo:0.5, hi:2.5, dp:1 },
  { marker:'Vitamin D 25-hydroxy', unit:'ng/mL', lo:30, hi:75 },
  { marker:'Ferritin', unit:'ng/mL', lo:50, hi:200 },
];

function healthyLabs(rng: () => number): LabValue[] {
  return HEALTHY_LAB_TEMPLATES.map(t => lab(t.marker, rfloat(t.lo, t.hi, rng, t.dp ?? 0), t.unit));
}

function generateHealthy(rng: () => number): PatientInput {
  const age = rint(18, 90, rng);
  const sex: 'male'|'female' = rng() < 0.5 ? 'male' : 'female';
  const heightCm = rint(155, 195, rng);
  const bmi = rfloat(19, 26.5, rng, 1);
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  const labs = rng() < 0.5 ? healthyLabs(rng) : [];
  return {
    age, sex, heightCm, weightKg, bmi,
    conditionsList: [], conditionsLower: '',
    medsList: [], medsLower: '',
    symptomsList: [], symptomsLower: '',
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
    freeText: '',
  };
}

const N = 5000;
const seed = 42;
const rng = mulberry32(seed);

const FEMALE_ONLY = [/pap smear|cervical/i, /thyroid antibodies.*female/i, /\bamh\b/i,
  /female hormone panel/i, /female androgen panel/i, /pcos panel/i, /mammogram/i, /β-hcg/i];
const MALE_ONLY = [/\bpsa\b/i];

// Aggregates
const supplementCounts = new Map<string, number>();
const conditionCounts = new Map<string, number>();
const supplementCountDist: Record<number, number> = {};
const ageBandSupps: Record<string, { count: number; suppSum: number }> = {};

let totalAlerts = 0;
let totalCrisis = 0;
let totalDepletions = 0;
let totalSuboptimal = 0;
let totalExpectedFindings = 0;
let totalLabOutliers = 0;
let totalGoalTargets = 0;
let totalSymptomsAddressed = 0;
let sexLeaks = 0;
let patternFalseFires = 0;
const violations: string[] = [];

const ageBand = (age: number): string => {
  if (age < 30) return '18-29';
  if (age < 45) return '30-44';
  if (age < 65) return '45-64';
  return '65+';
};

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  HEALTHY-POPULATION FULL AUDIT — ${N} adults`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
for (let i = 0; i < N; i++) {
  const p = generateHealthy(rng);
  const plan = buildPlan(p);
  const band = `${p.sex} ${ageBand(p.age)}`;

  // Supplements
  const suppCount = plan.supplementCandidates.length;
  supplementCountDist[suppCount] = (supplementCountDist[suppCount] ?? 0) + 1;
  for (const s of plan.supplementCandidates) {
    supplementCounts.set(s.nutrient, (supplementCounts.get(s.nutrient) ?? 0) + 1);
  }
  if (!ageBandSupps[band]) ageBandSupps[band] = { count:0, suppSum:0 };
  ageBandSupps[band].count++;
  ageBandSupps[band].suppSum += suppCount;

  // Conditions / patterns
  for (const c of plan.conditions) {
    conditionCounts.set(c.name, (conditionCounts.get(c.name) ?? 0) + 1);
  }
  patternFalseFires += plan.conditions.length;

  // Sex leaks
  for (const t of plan.tests) {
    if (p.sex === 'male'   && FEMALE_ONLY.some(re => re.test(t.name))) sexLeaks++;
    if (p.sex === 'female' && MALE_ONLY.some(re => re.test(t.name)))   sexLeaks++;
  }

  // All other engine outputs
  totalAlerts += plan.emergencyAlerts.length;
  if (plan.crisisAlert) totalCrisis++;
  totalDepletions += plan.depletions.length;
  totalSuboptimal += plan.suboptimalFlags.length;
  totalExpectedFindings += plan.expectedFindings.length;
  totalLabOutliers += plan.labs.outliers.length;
  totalGoalTargets += plan.goalTargets.length;
  totalSymptomsAddressed += plan.symptomsAddressed.length;

  // Invariant — any depletion is suspicious (no meds → no depletion)
  if (plan.depletions.length > 0) {
    if (violations.length < 5) violations.push(`#${i} ${p.sex} ${p.age}y healthy fired depletion: ${plan.depletions.map(d=>d.nutrient).join(', ')}`);
  }
  // Invariant — no emergency alerts for healthy person
  if (plan.emergencyAlerts.length > 0) {
    if (violations.length < 5) violations.push(`#${i} ${p.sex} ${p.age}y healthy fired ALERT: ${plan.emergencyAlerts.map(a=>(a as any).label ?? 'alert').join(', ')}`);
  }
}
const elapsed = Date.now() - start;

console.log(`Ran ${N} in ${elapsed}ms (${(elapsed/N).toFixed(1)}ms/patient)\n`);

console.log(`──── PATTERNS / CONDITIONS (should be 0 for healthy) ────`);
console.log(`Total pattern fires:    ${patternFalseFires === 0 ? '✅ 0' : '❌ '+patternFalseFires}`);
if (conditionCounts.size > 0) {
  for (const [name, count] of conditionCounts) console.log(`  ❌ ${count}x  ${name}`);
}
console.log();

console.log(`──── DEPLETIONS (should be 0 — no meds) ────`);
console.log(`Total depletions:       ${totalDepletions === 0 ? '✅ 0' : '❌ '+totalDepletions}`);
console.log();

console.log(`──── EMERGENCY / CRISIS ALERTS (should be 0) ────`);
console.log(`Emergency alerts:       ${totalAlerts === 0 ? '✅ 0' : '❌ '+totalAlerts}`);
console.log(`Crisis alerts:          ${totalCrisis === 0 ? '✅ 0' : '❌ '+totalCrisis}`);
console.log();

console.log(`──── LAB ANALYSIS OUTLIERS (healthy labs → 0 outliers) ────`);
const noLabs = N / 2; // ~50% have no labs at all
const withLabs = N - noLabs;
console.log(`Total lab outliers:     ${totalLabOutliers} (across ~${withLabs} patients with labs)`);
console.log(`Suboptimal flags:       ${totalSuboptimal}`);
console.log(`Expected findings:      ${totalExpectedFindings} (no diagnosed conditions → should be ~0)`);
console.log();

console.log(`──── SUPPLEMENTS — distribution ────`);
for (const k of [0,1,2,3,4,5,6]) {
  const c = supplementCountDist[k] ?? 0;
  console.log(`  ${k} supps: ${String(c).padStart(5)} (${((c/N)*100).toFixed(1)}%)`);
}
console.log();

console.log(`──── SUPPLEMENTS BY AGE BAND ────`);
const orderedBands = ['female 18-29','female 30-44','female 45-64','female 65+','male 18-29','male 30-44','male 45-64','male 65+'];
for (const band of orderedBands) {
  const s = ageBandSupps[band];
  if (!s) continue;
  console.log(`  ${band.padEnd(15)} | n=${String(s.count).padEnd(4)} | mean supps=${(s.suppSum/s.count).toFixed(2)}`);
}
console.log();

console.log(`──── MOST COMMON SUPPLEMENTS (healthy population) ────`);
const sortedSupps = Array.from(supplementCounts.entries()).sort((a,b)=>b[1]-a[1]);
for (const [name, count] of sortedSupps.slice(0, 15)) {
  console.log(`  ${String(count).padStart(5)} (${((count/N)*100).toFixed(0).padStart(3)}%)  ${name}`);
}
console.log();

console.log(`──── GOAL TARGETS + SYMPTOMS ADDRESSED ────`);
console.log(`Total goal targets:     ${totalGoalTargets} (healthy → no targets to set)`);
console.log(`Symptoms addressed:     ${totalSymptomsAddressed} (no symptoms reported → should be 0)`);
console.log();

console.log(`──── SEX LEAKS ────`);
console.log(`Total leaks:            ${sexLeaks === 0 ? '✅ 0' : '❌ '+sexLeaks}`);
console.log();

if (violations.length) {
  console.log(`──── VIOLATIONS SAMPLE ────`);
  for (const v of violations) console.log(`  ${v}`);
  console.log();
}

const finalOK = patternFalseFires === 0 && totalDepletions === 0 && totalAlerts === 0 &&
                totalCrisis === 0 && sexLeaks === 0;
console.log(finalOK ? `✅ ALL CLINICAL INVARIANTS PASS ACROSS ${N} HEALTHY ADULTS` : `❌ FAILURES DETECTED`);
Deno.exit(finalOK ? 0 : 1);
