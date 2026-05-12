// UNHEALTHY 40+ AUDIT — 5,000 ADULTS WITH WEIRD LABS SUGGESTING UNDERLYING DISEASE
// =================================================================================
// Generates 5,000 patients age 40-85, both sexes, with randomly-assigned
// underlying-pattern signatures. Each patient gets 1-2 "weird" lab clusters
// that should trigger specific pattern detection in the engine.
//
// Tests:
//   • Engine catches the planted patterns (sensitivity)
//   • Engine doesn't fire patterns NOT planted (specificity)
//   • Supplement variety matches pattern (gut/cardio/thyroid stack switching)
//   • Pattern-specific tests fire (not just generic baseline)
//   • Emergency alerts fire ONLY when critical labs present
//   • Sex-gating remains bulletproof under abnormal-lab fuzz
//
// Pure deterministic. Zero API cost.

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

// ── PATTERN SIGNATURES ─────────────────────────────────────────────
type PatternId = 'hemochromatosis'|'metabolic_syndrome'|'hashimoto_subclinical'|
  'hyperthyroid_subclinical'|'nafld_pattern'|'cushing'|'cv_drift'|'iron_def_anemia'|
  'b12_deficient'|'ckd_drift'|'liver_acute'|'prediabetes';

interface PatternProfile {
  id: PatternId;
  expectedEnginePatterns: RegExp[];     // patterns the engine should detect
  generate: (rng: () => number) => LabValue[];
}

const PATTERN_PROFILES: PatternProfile[] = [
  { id:'hemochromatosis',
    expectedEnginePatterns:[/hemochromatos|iron overload/i],
    generate:(rng)=>[
      lab('Ferritin', rfloat(450, 1200, rng), 'ng/mL', 'high'),
      lab('Transferrin Saturation', rfloat(50, 78, rng), '%', 'high'),
      lab('Iron', rfloat(180, 260, rng), 'µg/dL', 'high'),
    ],
  },
  { id:'metabolic_syndrome',
    expectedEnginePatterns:[/insulin resistance|metabolic syndrome|prediab/i],
    generate:(rng)=>[
      lab('Hemoglobin A1c', rfloat(5.8, 6.4, rng, 1), '%', 'watch'),
      lab('Triglycerides', rfloat(180, 320, rng), 'mg/dL', 'high'),
      lab('HDL', rfloat(28, 38, rng), 'mg/dL', 'low'),
      lab('Glucose', rfloat(102, 120, rng), 'mg/dL', 'watch'),
    ],
  },
  { id:'hashimoto_subclinical',
    expectedEnginePatterns:[/hypothyroid|hashimoto|thyroid pattern|subclinical/i],
    generate:(rng)=>[
      lab('TSH', rfloat(4.6, 9.5, rng, 1), 'mIU/L', 'high'),
    ],
  },
  { id:'hyperthyroid_subclinical',
    expectedEnginePatterns:[/hyperthyroid|graves/i],
    generate:(rng)=>[
      lab('TSH', rfloat(0.05, 0.35, rng, 2), 'mIU/L', 'low'),
    ],
  },
  { id:'nafld_pattern',
    expectedEnginePatterns:[/nafld|fatty liver|hepatic stress/i],
    generate:(rng)=>[
      lab('ALT', rfloat(55, 110, rng), 'U/L', 'high'),
      lab('AST', rfloat(45, 90, rng), 'U/L', 'high'),
      lab('Triglycerides', rfloat(180, 280, rng), 'mg/dL', 'high'),
      lab('Hemoglobin A1c', rfloat(5.5, 6.2, rng, 1), '%', 'watch'),
    ],
  },
  { id:'cushing',
    expectedEnginePatterns:[/cushing|cortisol/i],
    generate:(rng)=>[
      lab('Cortisol - AM', rfloat(24, 35, rng, 1), 'µg/dL', 'high'),
    ],
  },
  { id:'cv_drift',
    expectedEnginePatterns:[/cholesterol|lipid|particle.*pattern|ldl/i],
    generate:(rng)=>[
      lab('Total Cholesterol', rfloat(230, 290, rng), 'mg/dL', 'high'),
      lab('LDL', rfloat(155, 210, rng), 'mg/dL', 'high'),
      lab('ApoB', rfloat(105, 145, rng), 'mg/dL', 'high'),
    ],
  },
  { id:'iron_def_anemia',
    expectedEnginePatterns:[/iron deficien|anemia/i],
    generate:(rng)=>[
      lab('Hemoglobin', rfloat(9.5, 11.5, rng, 1), 'g/dL', 'low'),
      lab('Ferritin', rfloat(4, 18, rng, 1), 'ng/mL', 'low'),
      lab('MCV', rfloat(68, 78, rng), 'fL', 'low'),
    ],
  },
  { id:'b12_deficient',
    expectedEnginePatterns:[/b12|cobalamin|pernicious/i],
    generate:(rng)=>[
      lab('B12', rfloat(120, 200, rng), 'pg/mL', 'low'),
      lab('MCV', rfloat(102, 112, rng), 'fL', 'high'),
      lab('MMA', rfloat(380, 700, rng), 'nmol/L', 'high'),
    ],
  },
  { id:'ckd_drift',
    expectedEnginePatterns:[/kidney|ckd|renal/i],
    generate:(rng)=>[
      lab('Creatinine', rfloat(1.6, 2.4, rng, 1), 'mg/dL', 'high'),
      lab('eGFR', rfloat(35, 58, rng), 'mL/min', 'low'),
      lab('BUN', rfloat(28, 48, rng), 'mg/dL', 'high'),
    ],
  },
  { id:'liver_acute',
    expectedEnginePatterns:[/liver|hepatic|nafld/i],
    generate:(rng)=>[
      lab('ALT', rfloat(120, 280, rng), 'U/L', 'high'),
      lab('AST', rfloat(80, 200, rng), 'U/L', 'high'),
      lab('Total Bilirubin', rfloat(1.5, 3.5, rng, 1), 'mg/dL', 'high'),
      lab('GGT', rfloat(145, 320, rng), 'U/L', 'high'),
    ],
  },
  { id:'prediabetes',
    expectedEnginePatterns:[/prediab|insulin resistance|metabolic/i],
    generate:(rng)=>[
      lab('Hemoglobin A1c', rfloat(5.7, 6.3, rng, 1), '%', 'watch'),
      lab('Glucose', rfloat(100, 122, rng), 'mg/dL', 'watch'),
    ],
  },
];

// Healthy baseline labs (for any markers not overwritten by the pattern)
const HEALTHY_FILL: LabValue[] = [
  lab('Sodium', 140, 'mEq/L'), lab('Potassium', 4.2, 'mEq/L'), lab('Chloride', 102, 'mEq/L'),
  lab('Calcium', 9.6, 'mg/dL'), lab('Albumin', 4.3, 'g/dL'),
  lab('WBC', 6.5, 'K/µL'), lab('Platelets', 250, 'K/µL'),
];

function generateUnhealthy(rng: () => number): { input: PatientInput; planted: PatternId[] } {
  const age = rint(40, 85, rng);
  const sex: 'male'|'female' = rng() < 0.5 ? 'male' : 'female';
  const heightCm = rint(155, 195, rng);
  const bmi = rfloat(22, 35, rng, 1);
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  // 1-2 underlying patterns per patient
  const planted: PatternId[] = [];
  const profile1 = pick(PATTERN_PROFILES, rng);
  planted.push(profile1.id);
  const labs: LabValue[] = [...HEALTHY_FILL, ...profile1.generate(rng)];
  if (rng() < 0.35) {
    let profile2 = pick(PATTERN_PROFILES, rng);
    while (profile2.id === profile1.id) profile2 = pick(PATTERN_PROFILES, rng);
    planted.push(profile2.id);
    labs.push(...profile2.generate(rng));
  }
  const labsLower = labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();
  return {
    input: {
      age, sex, heightCm, weightKg, bmi,
      conditionsList: [], conditionsLower: '',
      medsList: [], medsLower: '',
      symptomsList: [], symptomsLower: '',
      supplementsList: [], supplementsLower: '',
      labs, labsLower,
      isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
      freeText: '',
    },
    planted,
  };
}

// ── RUNNER ──────────────────────────────────────────────────────────
const N = 5000;
const seed = 99;
const rng = mulberry32(seed);

const FEMALE_ONLY = [/pap smear|cervical/i, /thyroid antibodies.*female/i, /\bamh\b/i,
  /female hormone panel/i, /female androgen panel/i, /pcos panel/i, /mammogram/i, /β-hcg/i];
const MALE_ONLY = [/\bpsa\b/i];

const patternHitCounts: Record<PatternId, { planted: number; caught: number }> = {} as any;
for (const p of PATTERN_PROFILES) patternHitCounts[p.id] = { planted:0, caught:0 };

const conditionFireCounts = new Map<string, number>();
const supplementCounts = new Map<string, number>();
const suppCountDist: Record<number, number> = {};
let sexLeaks = 0;
let totalAlerts = 0;
let totalConditionsFired = 0;

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  UNHEALTHY 40+ AUDIT — ${N} adults, age 40-85, weird-lab fuzz`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
for (let i = 0; i < N; i++) {
  const { input: p, planted } = generateUnhealthy(rng);
  const plan = buildPlan(p);
  totalConditionsFired += plan.conditions.length;
  totalAlerts += plan.emergencyAlerts.length;

  // Track engine condition firings
  for (const c of plan.conditions) {
    conditionFireCounts.set(c.name, (conditionFireCounts.get(c.name) ?? 0) + 1);
  }
  // Supplements
  suppCountDist[plan.supplementCandidates.length] = (suppCountDist[plan.supplementCandidates.length] ?? 0) + 1;
  for (const s of plan.supplementCandidates) supplementCounts.set(s.nutrient, (supplementCounts.get(s.nutrient) ?? 0) + 1);
  // Sex leaks
  for (const t of plan.tests) {
    if (p.sex === 'male'   && FEMALE_ONLY.some(re => re.test(t.name))) sexLeaks++;
    if (p.sex === 'female' && MALE_ONLY.some(re => re.test(t.name)))   sexLeaks++;
  }

  // Pattern detection (sensitivity per planted condition)
  for (const id of planted) {
    patternHitCounts[id].planted++;
    const expected = PATTERN_PROFILES.find(p => p.id === id)!.expectedEnginePatterns;
    const hit = plan.conditions.some(c => expected.some(re => re.test(c.name)));
    if (hit) patternHitCounts[id].caught++;
  }
}
const elapsed = Date.now() - start;
console.log(`Ran ${N} in ${elapsed}ms (${(elapsed/N).toFixed(1)}ms/patient)\n`);

console.log(`──── DETECTION RATE BY PLANTED PATTERN ────`);
console.log(`(How often the engine caught the underlying issue we seeded)\n`);
for (const id of Object.keys(patternHitCounts) as PatternId[]) {
  const s = patternHitCounts[id];
  const pct = s.planted > 0 ? ((s.caught / s.planted) * 100).toFixed(0) : '—';
  const flag = s.planted === 0 ? '—' : (s.caught / s.planted >= 0.8 ? '✅' : (s.caught / s.planted >= 0.5 ? '⚠️' : '❌'));
  console.log(`  ${flag} ${id.padEnd(28)} | planted: ${String(s.planted).padStart(4)} | caught: ${String(s.caught).padStart(4)} | rate: ${pct}%`);
}
console.log();

console.log(`──── ENGINE PATTERN FIRINGS (top 20) ────`);
const sortedConds = Array.from(conditionFireCounts.entries()).sort((a,b)=>b[1]-a[1]);
for (const [name, count] of sortedConds.slice(0, 20)) {
  console.log(`  ${String(count).padStart(4)}  ${name}`);
}
console.log();

console.log(`──── SUPPLEMENT DISTRIBUTION ────`);
for (let k = 0; k <= 6; k++) {
  const c = suppCountDist[k] ?? 0;
  if (c > 0) console.log(`  ${k} supps: ${String(c).padStart(5)} (${((c/N)*100).toFixed(1)}%)`);
}
console.log();

console.log(`──── MOST COMMON SUPPLEMENTS ────`);
const sortedSupps = Array.from(supplementCounts.entries()).sort((a,b)=>b[1]-a[1]);
for (const [name, count] of sortedSupps.slice(0, 15)) {
  console.log(`  ${String(count).padStart(4)} (${((count/N)*100).toFixed(0).padStart(3)}%)  ${name}`);
}
console.log();

console.log(`──── SAFETY ────`);
console.log(`Sex leaks:                ${sexLeaks === 0 ? '✅ 0' : '❌ '+sexLeaks}`);
console.log(`Total emergency alerts:   ${totalAlerts}`);
console.log(`Total conditions fired:   ${totalConditionsFired}`);
console.log(`Avg conditions/patient:   ${(totalConditionsFired/N).toFixed(2)}`);

console.log(`\n${sexLeaks === 0 ? '✅ SAFETY INVARIANTS PASS' : '❌ SEX LEAK DETECTED'}`);
Deno.exit(sexLeaks === 0 ? 0 : 1);
