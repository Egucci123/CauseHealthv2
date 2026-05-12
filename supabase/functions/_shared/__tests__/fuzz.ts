// LAYER 6 — PROPERTY-BASED FUZZ
// =============================
// Generates 1,000 random patients with random valid inputs.
// For each, asserts UNIVERSAL INVARIANTS — properties that must
// hold for every output regardless of input. Catches combinatorial
// bugs that hand-written scenarios miss.
//
// Pure deterministic. Zero API cost.
//
// Run: deno run -A __tests__/fuzz.ts

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

// ── RANDOM GENERATORS ───────────────────────────────────────────────
function pick<T>(arr: T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]; }
function maybe<T>(p: number, rng: () => number, fn: () => T): T | null { return rng() < p ? fn() : null; }
function rint(lo: number, hi: number, rng: () => number): number { return Math.floor(rng() * (hi - lo + 1)) + lo; }
function rfloat(lo: number, hi: number, rng: () => number, dp = 1): number { return +((rng() * (hi - lo)) + lo).toFixed(dp); }

// Seeded RNG for reproducible runs
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

const CONDITIONS_POOL = [
  '', '', '',  // empty = no condition
  'type 2 diabetes', 'hypertension', 'hashimoto thyroiditis', 'GERD',
  'asthma', 'rheumatoid arthritis', 'family history coronary artery disease',
  'osteoporosis', 'chronic kidney disease', 'fatty liver disease',
  'depression', 'anxiety disorder', 'gilbert syndrome',
  'inflammatory bowel disease', 'psoriasis', 'gout', 'sleep apnea',
];
const MEDS_POOL = [
  '', '', '', '',
  'metformin 500mg', 'metformin 1000mg BID', 'atorvastatin 20mg',
  'lisinopril 10mg', 'levothyroxine 75mcg', 'omeprazole 40mg',
  'sertraline 50mg', 'fluoxetine 20mg', 'prednisone 5mg daily',
  'methotrexate 15mg weekly', 'gabapentin 300mg TID',
  'aspirin 81mg', 'warfarin 5mg', 'tamsulosin 0.4mg',
  'amlodipine 10mg', 'losartan 50mg', 'hydrochlorothiazide 25mg',
];
const SYMPTOMS_POOL = [
  'Chronic fatigue','Low energy','Brain fog','Anxiety','Depression',
  'Bloating','Acid reflux','Joint pain','Muscle pain','Headaches',
  'Low libido','Erectile dysfunction','Heart palpitations',
  'Hot flashes','Night sweats','Irregular periods','Acne',
  'Hair loss — no family history','Weight gain despite diet',
  'Sugar cravings','Cold intolerance','Heat intolerance',
  'Difficulty falling asleep','Waking during night',
  'Dizziness on standing','Shortness of breath','Constipation',
  'Diarrhea','Abdominal pain','Reduced exercise tolerance',
];

// Lab generator — picks 0-10 random markers with plausible values
const LAB_TEMPLATES: Array<{ marker: string; unit: string; range: [number, number]; lowFlag: number; highFlag: number }> = [
  { marker:'Glucose', unit:'mg/dL', range:[70, 250], lowFlag:70, highFlag:125 },
  { marker:'Hemoglobin A1c', unit:'%', range:[4.5, 11.0], lowFlag:4.0, highFlag:6.5 },
  { marker:'Hemoglobin', unit:'g/dL', range:[8.0, 18.0], lowFlag:12.0, highFlag:18.0 },
  { marker:'WBC', unit:'K/µL', range:[2.0, 20.0], lowFlag:4.0, highFlag:11.0 },
  { marker:'Platelets', unit:'K/µL', range:[80, 600], lowFlag:150, highFlag:450 },
  { marker:'MCV', unit:'fL', range:[70, 110], lowFlag:80, highFlag:100 },
  { marker:'TSH', unit:'mIU/L', range:[0.01, 15.0], lowFlag:0.4, highFlag:4.5 },
  { marker:'Vitamin D 25-hydroxy', unit:'ng/mL', range:[5, 100], lowFlag:30, highFlag:100 },
  { marker:'LDL', unit:'mg/dL', range:[40, 250], lowFlag:40, highFlag:130 },
  { marker:'HDL', unit:'mg/dL', range:[20, 90], lowFlag:40, highFlag:90 },
  { marker:'Triglycerides', unit:'mg/dL', range:[40, 400], lowFlag:40, highFlag:150 },
  { marker:'Total Cholesterol', unit:'mg/dL', range:[120, 320], lowFlag:120, highFlag:200 },
  { marker:'ALT', unit:'U/L', range:[10, 150], lowFlag:10, highFlag:35 },
  { marker:'AST', unit:'U/L', range:[10, 150], lowFlag:10, highFlag:35 },
  { marker:'GGT', unit:'U/L', range:[10, 200], lowFlag:10, highFlag:50 },
  { marker:'Creatinine', unit:'mg/dL', range:[0.5, 4.0], lowFlag:0.6, highFlag:1.3 },
  { marker:'Ferritin', unit:'ng/mL', range:[5, 500], lowFlag:30, highFlag:300 },
  { marker:'B12', unit:'pg/mL', range:[100, 1500], lowFlag:300, highFlag:1500 },
  { marker:'Prolactin', unit:'ng/mL', range:[2, 80], lowFlag:2, highFlag:25 },
  { marker:'Testosterone', unit:'ng/dL', range:[100, 1200], lowFlag:300, highFlag:1000 },
];

function randomLab(rng: () => number): LabValue {
  const t = pick(LAB_TEMPLATES, rng);
  const value = rfloat(t.range[0], t.range[1], rng, 1);
  let flag: LabValue['flag'] = 'normal';
  if (value < t.lowFlag) flag = value < t.lowFlag * 0.8 ? 'critical_low' : 'low';
  else if (value > t.highFlag) flag = value > t.highFlag * 1.4 ? 'critical_high' : 'high';
  return { marker: t.marker, value, unit: t.unit, flag };
}

function generatePatient(rng: () => number, sex: 'male' | 'female'): PatientInput {
  const age = rint(18, 90, rng);
  const heightCm = rint(150, 200, rng);
  const weightKg = rint(45, 140, rng);
  const conditions = Array.from({ length: rint(0, 4, rng) }, () => pick(CONDITIONS_POOL, rng)).filter(Boolean);
  const meds = Array.from({ length: rint(0, 5, rng) }, () => pick(MEDS_POOL, rng)).filter(Boolean);
  const symptomNames = Array.from(new Set(Array.from({ length: rint(0, 7, rng) }, () => pick(SYMPTOMS_POOL, rng))));
  const symptoms = symptomNames.map(name => ({ name, severity: 4 }));
  const labs = Array.from({ length: rint(0, 10, rng) }, () => randomLab(rng));
  const isPregnant = sex === 'female' && age >= 18 && age <= 45 && rng() < 0.05;
  return {
    age, sex, heightCm, weightKg,
    bmi: +(weightKg / Math.pow(heightCm / 100, 2)).toFixed(1),
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant, hasShellfishAllergy: rng() < 0.1, hasSulfaAllergy: rng() < 0.05,
    freeText: '',
  };
}

// ── UNIVERSAL INVARIANTS ────────────────────────────────────────────
// Each invariant returns null if OK, or an error string if violated.
type Invariant = (p: PatientInput, plan: ReturnType<typeof buildPlan>) => string | null;

const FEMALE_ONLY_TESTS = [
  /pap smear|cervical/i, /thyroid antibodies.*female baseline/i, /\bamh\b/i,
  /female hormone panel|estradiol.*progester/i, /\bfemale androgen panel\b/i,
  /pcos panel/i, /mammogram/i, /β-hcg|beta.?hcg.*pregnancy/i,
];
const MALE_ONLY_TESTS = [
  /testosterone panel.*male|comprehensive male hormonal/i,
  /\bpsa\b/i,
];
const PREGNANCY_CONTRAINDICATED = [
  /red yeast rice/i, /berberine/i, /vitamin a.*retinol/i, /st\.? john'?s wort/i,
  /\bdong quai\b/i, /\bblack cohosh\b/i,
];

const INVARIANTS: Array<{ name: string; check: Invariant }> = [
  // Output shape
  { name:'tests is array', check:(_,p)=> Array.isArray(p.tests) ? null : 'tests not array' },
  { name:'conditions is array', check:(_,p)=> Array.isArray(p.conditions) ? null : 'conditions not array' },
  { name:'supplementCandidates is array', check:(_,p)=> Array.isArray(p.supplementCandidates) ? null : 'supps not array' },

  // Counts within bounds
  { name:'test count ≤ 25', check:(_,p)=> p.tests.length <= 25 ? null : `tests=${p.tests.length}` },
  { name:'supplement count ≤ 6', check:(_,p)=> p.supplementCandidates.length <= 6 ? null : `supps=${p.supplementCandidates.length}` },

  // Field integrity
  { name:'every test has name', check:(_,p)=> {
    const bad = p.tests.find(t => !t.name || typeof t.name !== 'string');
    return bad ? `test missing name: ${JSON.stringify(bad).slice(0,80)}` : null;
  }},
  { name:'every test has ICD-10', check:(_,p)=> {
    const bad = p.tests.find(t => !t.icd10 || typeof t.icd10 !== 'string');
    return bad ? `test missing icd10: ${bad.name}` : null;
  }},
  { name:'every test has priority', check:(_,p)=> {
    const valid = new Set(['urgent','high','moderate','low']);
    const bad = p.tests.find(t => !valid.has((t as any).priority));
    return bad ? `test bad priority: ${bad.name} priority=${(bad as any).priority}` : null;
  }},
  { name:'every supplement has nutrient name', check:(_,p)=> {
    const bad = p.supplementCandidates.find(s => !s.nutrient || typeof s.nutrient !== 'string' || s.nutrient === 'undefined');
    return bad ? `supp missing nutrient: ${JSON.stringify(bad).slice(0,80)}` : null;
  }},
  { name:'every condition has confidence', check:(_,p)=> {
    const valid = new Set(['high','moderate']);
    const bad = p.conditions.find(c => !valid.has(c.confidence));
    return bad ? `condition bad confidence: ${bad.name}` : null;
  }},

  // No NaN / undefined in output strings
  { name:'no "undefined" in test names', check:(_,p)=> {
    const bad = p.tests.find(t => /undefined|NaN|\[object/i.test(t.name));
    return bad ? `bad test name: "${bad.name}"` : null;
  }},
  { name:'no "undefined" in supplement names', check:(_,p)=> {
    const bad = p.supplementCandidates.find(s => /undefined|NaN/i.test(s.nutrient));
    return bad ? `bad supp name: "${s.nutrient}"` : null;
  }},

  // Sex gating
  { name:'male patient gets 0 female-only tests', check:(p,plan)=> {
    if (p.sex !== 'male') return null;
    const leak = plan.tests.find(t => FEMALE_ONLY_TESTS.some(re => re.test(t.name)));
    return leak ? `male got female test: ${leak.name}` : null;
  }},
  { name:'female patient gets 0 male-only tests', check:(p,plan)=> {
    if (p.sex !== 'female') return null;
    const leak = plan.tests.find(t => MALE_ONLY_TESTS.some(re => re.test(t.name)));
    return leak ? `female got male test: ${leak.name}` : null;
  }},

  // Pregnancy contraindications
  { name:'pregnant patient gets 0 contraindicated supps', check:(p,plan)=> {
    if (!p.isPregnant) return null;
    const bad = plan.supplementCandidates.find(s => PREGNANCY_CONTRAINDICATED.some(re => re.test(s.nutrient)));
    return bad ? `pregnant got contraindicated: ${bad.nutrient}` : null;
  }},

  // Depletion captures (only when meds are present that match known classes)
  { name:'metformin user → B12 depletion', check:(p,plan)=> {
    if (!/metformin/i.test(p.medsLower)) return null;
    const has = plan.depletions.find(d => /B12|cobalamin/i.test(d.nutrient));
    return has ? null : 'metformin without B12 depletion';
  }},
  { name:'statin user → CoQ10 depletion captured', check:(p,plan)=> {
    if (!/atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin/i.test(p.medsLower)) return null;
    const has = plan.depletions.find(d => /coq10|ubiquinol/i.test(d.nutrient));
    return has ? null : 'statin without CoQ10 depletion';
  }},

  // ICD-10 format
  { name:'every test ICD-10 is valid format', check:(_,p)=> {
    const bad = p.tests.find(t => !/^[A-Z]\d{2}(\.\d+)?$/.test(t.icd10));
    return bad ? `bad ICD-10: ${bad.name} → "${bad.icd10}"` : null;
  }},

  // Pattern → ICD-10 consistency
  { name:'every condition has ICD-10', check:(_,p)=> {
    const bad = p.conditions.find(c => !c.icd10);
    return bad ? `condition missing icd10: ${bad.name}` : null;
  }},

  // Critical-lab → emergency alert wiring
  { name:'critical_high/low lab → some response', check:(p,plan)=> {
    const hasCritical = p.labs.some(l => l.flag === 'critical_high' || l.flag === 'critical_low');
    if (!hasCritical) return null;
    const hasResponse = plan.emergencyAlerts.length > 0 || plan.labs.outliers.some(o => /critical/.test(o.flag));
    return hasResponse ? null : 'critical lab present but no alert and no critical outlier';
  }},
];

// ── RUNNER ──────────────────────────────────────────────────────────
// N can be overridden via --n=<count> CLI arg. Default 100,000 for
// deep coverage; pass --n=1000 for fast iteration during development.
const nArg = Deno.args.find(a => a.startsWith('--n='));
const N = nArg ? parseInt(nArg.slice(4), 10) : 100_000;
const seed = 42;
const rng = mulberry32(seed);

const violations: Map<string, { count: number; samples: Array<{ id: number; detail: string }> }> = new Map();
let totalRuns = 0;

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  LAYER 6 — PROPERTY-BASED FUZZ (n=${N}, seed=${seed})`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
for (let i = 0; i < N; i++) {
  const sex: 'male' | 'female' = rng() < 0.5 ? 'male' : 'female';
  const patient = generatePatient(rng, sex);
  let plan: ReturnType<typeof buildPlan>;
  try {
    plan = buildPlan(patient);
  } catch (e) {
    const key = 'THREW EXCEPTION';
    const v = violations.get(key) ?? { count:0, samples:[] };
    v.count++;
    if (v.samples.length < 3) v.samples.push({ id:i, detail: String((e as Error).message).slice(0, 200) });
    violations.set(key, v);
    continue;
  }
  totalRuns++;
  for (const inv of INVARIANTS) {
    const result = inv.check(patient, plan);
    if (result !== null) {
      const v = violations.get(inv.name) ?? { count:0, samples:[] };
      v.count++;
      if (v.samples.length < 3) v.samples.push({ id:i, detail: result });
      violations.set(inv.name, v);
    }
  }
}
const elapsed = Date.now() - start;

console.log(`Ran ${totalRuns}/${N} patients in ${elapsed}ms (${(elapsed/N).toFixed(1)}ms/patient)\n`);

if (violations.size === 0) {
  console.log(`✅ ALL ${INVARIANTS.length} INVARIANTS PASSED ACROSS ${N} RANDOM PATIENTS`);
  Deno.exit(0);
} else {
  console.log(`❌ ${violations.size} INVARIANTS VIOLATED:\n`);
  for (const [name, v] of violations) {
    console.log(`  ${v.count}x  ${name}`);
    for (const s of v.samples) {
      console.log(`         patient #${s.id}: ${s.detail}`);
    }
  }
  Deno.exit(1);
}
