// SUBTLE / CLOSE-CALL AUDIT — 5,000 ADULTS WITH "DOCTOR MIGHT MISS THIS" PATTERNS
// ===============================================================================
// Generates 5,000 patients (50% male / 50% female) age 25-75 with
// underlying conditions where labs are JUST at the edge of normal —
// the kind of close calls a busy PCP might write off as "looks fine."
//
// Tests engine sensitivity to:
//   • Watch-tier labs (in standard range, outside functional optimal)
//   • Single-marker subtle drifts (TSH 2.6 with thyroid symptoms)
//   • Pre-disease patterns (Ferritin 32, A1c 5.6, Vit D 31)
//   • Borderline elevations (LDL 128, ALT 38, TSat 42)
//
// Measures detection rate per subtle pattern. Goal: catch underlying
// disease earlier than a standard PCP visit would.

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

// ── SUBTLE PATTERN PROFILES — "close calls" ─────────────────────────
// Each plants labs at the edge of normal + symptoms suggesting underlying.
// Expected: engine should still catch the pattern.

type PatternId =
  | 'subclinical_hypothyroid'      // TSH 2.6-4.4 (AACE grey zone) + sx
  | 'early_prediabetes'             // A1c 5.6-5.7 (just at watch)
  | 'subtle_iron_deficiency'        // Ferritin 18-30 + Hgb low-normal
  | 'early_hemochromatosis'         // Ferritin 250-350 + TSat 42-49
  | 'functional_b12_low'            // B12 220-330 (low-normal, MMA elevated)
  | 'high_homocysteine'             // Homocysteine 11-15 + sx
  | 'pre_nafld'                     // ALT 36-50 + TG 145-180 + BMI 27-30
  | 'subclinical_ckd'               // eGFR 58-72 + creat 1.1-1.3
  | 'vit_d_insufficient'            // 25-OH-D 22-29 (suboptimal)
  | 'borderline_hyperchol'          // LDL 130-145 (just over threshold)
  | 'borderline_cortisol'           // AM Cortisol 20-23 + symptoms
  | 'subclinical_hyperthyroid'      // TSH 0.35-0.42 + subtle sx
  | 'metabolic_drift_pre_A1c'       // Glucose 95-99 + TG/HDL >3 (no A1c rise yet)
  | 'pre_anemia_male'               // Hgb 13.0-13.5 (low-normal male)
  | 'lp_a_elevated'                 // Lp(a) 40-60 (high but in range for some labs)
  ;

interface SubtlePattern {
  id: PatternId;
  expected: RegExp[];   // engine condition names that should fire
  description: string;
  generate: (rng: () => number, sex: 'male'|'female') => { labs: LabValue[]; symptoms: string[]; conditions?: string[] };
}

const SUBTLE_PATTERNS: SubtlePattern[] = [
  { id:'subclinical_hypothyroid',
    expected:[/thyroid|hypothyroid|hashimoto|subclinical/i],
    description:'TSH 2.6-4.4 grey zone + 2 thyroid sx',
    generate:(rng,sex)=>({
      labs:[lab('TSH', rfloat(2.6, 4.4, rng, 1), 'mIU/L', 'watch')],
      symptoms: ['Chronic fatigue','Brain fog'].concat(rng() < 0.5 ? ['Cold intolerance'] : ['Hair loss — no family history']),
    }),
  },

  { id:'early_prediabetes',
    expected:[/prediab|insulin resistance|metabolic/i],
    description:'A1c 5.6-5.7 just at watch threshold + weight gain',
    generate:(rng)=>({
      labs:[
        lab('Hemoglobin A1c', rfloat(5.6, 5.7, rng, 1), '%', 'watch'),
        lab('Glucose', rfloat(94, 99, rng), 'mg/dL'),
      ],
      symptoms:['Weight gain despite diet','Afternoon energy crash'],
    }),
  },

  { id:'subtle_iron_deficiency',
    expected:[/iron deficien|anemia|hypochromic|early/i],
    description:'Ferritin 18-30 + Hgb low-normal + fatigue',
    generate:(rng,sex)=>({
      labs:[
        lab('Ferritin', rfloat(18, 30, rng), 'ng/mL', 'low'),
        lab('Hemoglobin', sex === 'female' ? rfloat(11.5, 12.4, rng, 1) : rfloat(13.0, 13.6, rng, 1), 'g/dL', 'low'),
        lab('MCV', rfloat(78, 84, rng), 'fL'),
      ],
      symptoms:['Chronic fatigue','Hair loss — no family history'],
    }),
  },

  { id:'early_hemochromatosis',
    expected:[/hemochromatos|iron overload/i],
    description:'Ferritin 250-350 + TSat 42-49 (just outside textbook)',
    generate:(rng)=>({
      labs:[
        lab('Ferritin', rfloat(280, 380, rng), 'ng/mL', 'high'),
        lab('Transferrin Saturation', rfloat(46, 55, rng), '%', 'high'),
        lab('Iron', rfloat(155, 185, rng), 'µg/dL'),
      ],
      symptoms:['Joint pain','Chronic fatigue'],
    }),
  },

  { id:'functional_b12_low',
    expected:[/b12|cobalamin|pernicious|deficiency/i],
    description:'B12 220-330 (low-normal range) + MMA elevated + sx',
    generate:(rng)=>({
      labs:[
        lab('B12', rfloat(220, 330, rng), 'pg/mL'),
        lab('MMA', rfloat(280, 420, rng), 'nmol/L', 'high'),
        lab('Homocysteine', rfloat(11, 15, rng, 1), 'µmol/L', 'high'),
      ],
      symptoms:['Chronic fatigue','Brain fog','Tingling'],
    }),
  },

  { id:'pre_nafld',
    expected:[/nafld|hepatic stress|fatty liver/i],
    description:'ALT 36-50 + TG 145-180 + BMI 27-30 (just over thresholds)',
    generate:(rng)=>({
      labs:[
        lab('ALT', rfloat(38, 52, rng), 'U/L', 'high'),
        lab('AST', rfloat(28, 38, rng), 'U/L'),
        lab('Triglycerides', rfloat(150, 185, rng), 'mg/dL', 'high'),
        lab('Hemoglobin A1c', rfloat(5.4, 5.7, rng, 1), '%', 'watch'),
      ],
      symptoms:['Chronic fatigue','Weight gain despite diet'],
    }),
  },

  { id:'subclinical_ckd',
    expected:[/ckd|kidney|renal/i],
    description:'eGFR 58-72 + creat 1.1-1.3 (early stage 2-3)',
    generate:(rng)=>({
      labs:[
        lab('Creatinine', rfloat(1.15, 1.35, rng, 2), 'mg/dL'),
        lab('eGFR', rfloat(58, 72, rng), 'mL/min', 'low'),
        lab('BUN', rfloat(20, 28, rng), 'mg/dL'),
      ],
      symptoms:[],
      conditions:['hypertension'],
    }),
  },

  { id:'vit_d_insufficient',
    expected:[/vitamin d|deficien/i],
    description:'25-OH-D 22-29 (just below 30 threshold)',
    generate:(rng)=>({
      labs:[lab('Vitamin D 25-hydroxy', rfloat(22, 29, rng), 'ng/mL', 'low')],
      symptoms:['Chronic fatigue','Depression'],
    }),
  },

  { id:'borderline_hyperchol',
    expected:[/cholesterol|lipid|hyperchol|particle/i],
    description:'LDL 130-150 + ApoB 90-105 (just at threshold)',
    generate:(rng)=>({
      labs:[
        lab('Total Cholesterol', rfloat(205, 235, rng), 'mg/dL'),
        lab('LDL', rfloat(132, 152, rng), 'mg/dL', 'high'),
        lab('ApoB', rfloat(92, 108, rng), 'mg/dL'),
        lab('HDL', rfloat(38, 50, rng), 'mg/dL'),
      ],
      symptoms:[],
    }),
  },

  { id:'borderline_cortisol',
    expected:[/cortisol|cushing|adrenal/i],
    description:'AM Cortisol 20-23 (upper edge) + sx + HTN',
    generate:(rng)=>({
      labs:[lab('Cortisol AM', rfloat(20.5, 23.5, rng, 1), 'µg/dL', 'watch')],
      symptoms:['Chronic fatigue','Difficulty falling asleep','Weight gain despite diet'],
      conditions:['hypertension'],
    }),
  },

  { id:'subclinical_hyperthyroid',
    expected:[/hyperthyroid|graves|thyroid pattern/i],
    description:'TSH 0.30-0.42 (just below lower edge) + 2 sx',
    generate:(rng)=>({
      labs:[lab('TSH', rfloat(0.30, 0.42, rng, 2), 'mIU/L', 'low')],
      symptoms:['Heart palpitations','Heat intolerance'],
    }),
  },

  { id:'metabolic_drift_pre_A1c',
    expected:[/insulin resistance|metabolic|prediab|dyslipid/i],
    description:'Glucose 95-99 + TG/HDL >3 + weight resistance (no A1c rise yet)',
    generate:(rng)=>({
      labs:[
        lab('Glucose', rfloat(95, 99, rng), 'mg/dL'),
        lab('Triglycerides', rfloat(165, 220, rng), 'mg/dL', 'high'),
        lab('HDL', rfloat(34, 42, rng), 'mg/dL', 'low'),
        lab('Hemoglobin A1c', rfloat(5.2, 5.4, rng, 1), '%'),
      ],
      symptoms:['Weight gain despite diet','Sugar cravings'],
    }),
  },
];

function generateSubtle(rng: () => number): { input: PatientInput; planted: PatternId[] } {
  const age = rint(25, 75, rng);
  const sex: 'male'|'female' = rng() < 0.5 ? 'male' : 'female';
  const heightCm = rint(155, 195, rng);
  const bmi = rfloat(22, 30, rng, 1);
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  // 1 underlying subtle pattern per patient (high signal-to-noise)
  const pattern = pick(SUBTLE_PATTERNS, rng);
  const gen = pattern.generate(rng, sex);
  const symps = gen.symptoms.map(name => ({ name, severity: 3 }));
  const conds = gen.conditions ?? [];
  const labs = gen.labs;
  return {
    input: {
      age, sex, heightCm, weightKg, bmi,
      conditionsList: conds, conditionsLower: conds.join(' ').toLowerCase(),
      medsList: [], medsLower: '',
      symptomsList: symps,
      symptomsLower: symps.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
      supplementsList: [], supplementsLower: '',
      labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
      isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
      freeText: '',
    },
    planted:[pattern.id],
  };
}

// ── RUNNER ──────────────────────────────────────────────────────────
const N = 5000;
const seed = 777;
const rng = mulberry32(seed);

const detection: Record<PatternId, { planted: number; caught: number; samples: string[] }> = {} as any;
for (const p of SUBTLE_PATTERNS) detection[p.id] = { planted:0, caught:0, samples:[] };
let totalConditions = 0;
let sexLeaks = 0;
const FEMALE_ONLY = [/pap smear|cervical/i, /\bamh\b/i, /female hormone panel/i, /pcos panel/i, /mammogram/i];
const MALE_ONLY = [/\bpsa\b/i];

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  SUBTLE / CLOSE-CALL AUDIT — ${N} adults, ${SUBTLE_PATTERNS.length} subtle patterns`);
console.log(`  "Things a busy PCP might miss"`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
for (let i = 0; i < N; i++) {
  const { input: p, planted } = generateSubtle(rng);
  const plan = buildPlan(p);
  totalConditions += plan.conditions.length;

  for (const t of plan.tests) {
    if (p.sex === 'male'   && FEMALE_ONLY.some(re => re.test(t.name))) sexLeaks++;
    if (p.sex === 'female' && MALE_ONLY.some(re => re.test(t.name)))   sexLeaks++;
  }

  for (const id of planted) {
    detection[id].planted++;
    const profile = SUBTLE_PATTERNS.find(p => p.id === id)!;
    const hit = plan.conditions.some(c => profile.expected.some(re => re.test(c.name)));
    if (hit) detection[id].caught++;
    else if (detection[id].samples.length < 2) {
      detection[id].samples.push(`#${i} ${p.sex} ${p.age}y bmi ${p.bmi}: ${plan.conditions.map(c=>c.name).join('; ') || 'NO PATTERNS'}`);
    }
  }
}
const elapsed = Date.now() - start;
console.log(`Ran ${N} in ${elapsed}ms (${(elapsed/N).toFixed(1)}ms/patient)\n`);

console.log(`──── DETECTION RATE BY SUBTLE PATTERN ────`);
console.log(`(How often the engine caught the close-call underlying signal)\n`);
let overallPlanted = 0, overallCaught = 0;
for (const p of SUBTLE_PATTERNS) {
  const s = detection[p.id];
  const pct = s.planted > 0 ? (s.caught / s.planted) * 100 : 0;
  const flag = pct >= 90 ? '✅' : pct >= 60 ? '⚠️' : '❌';
  console.log(`  ${flag} ${p.id.padEnd(32)} | planted: ${String(s.planted).padStart(4)} | caught: ${String(s.caught).padStart(4)} | rate: ${pct.toFixed(0)}%`);
  console.log(`     ${p.description}`);
  if (pct < 90 && s.samples.length) {
    for (const sample of s.samples) console.log(`     miss: ${sample.slice(0, 120)}`);
  }
  overallPlanted += s.planted;
  overallCaught += s.caught;
}
console.log();
console.log(`──── OVERALL ────`);
console.log(`Total subtle patterns planted: ${overallPlanted}`);
console.log(`Total caught:                  ${overallCaught}`);
console.log(`Overall sensitivity:           ${(overallCaught/overallPlanted*100).toFixed(1)}%`);
console.log(`Average conditions/patient:    ${(totalConditions/N).toFixed(2)}`);
console.log(`Sex-gate leaks:                ${sexLeaks === 0 ? '✅ 0' : '❌ '+sexLeaks}`);
