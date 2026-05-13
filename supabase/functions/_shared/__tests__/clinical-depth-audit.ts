// CLINICAL-DEPTH AUDIT — does the engine catch what a careful clinician would?
// =================================================================
// The full-app + launch-readiness audits check STRUCTURE (every field
// populated, no truncation, schemas valid). This audit checks CLINICAL
// DEPTH — does the engine actually catch the workups a real clinician
// would order for a given patient profile?
//
// Each test case = (synthetic patient profile, list of clinical
// expectations). Expectations come in three forms:
//   - mustHaveTest: a specific test must appear in the test panel
//   - mustHaveCondition: a specific condition pattern must fire
//   - mustHaveDiscussionPoint: a specific topic must appear in the
//     doctor-prep discussion_points or HPI
//
// Each case is a small synthetic patient — NEVER a real user. The
// engine runs read-only. Failures call out the specific clinical gap
// so we can fix the rule (not patch the user's data).
//
// Universal rule: every check below applies to ANY patient who fits
// the trigger pattern, not just the synthetic test case.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function makeInput(opts: {
  age: number; sex: 'male' | 'female'; bmi: number;
  conditions?: string[]; meds?: string[]; symptoms?: string[]; labs?: LabValue[];
}): PatientInput {
  const conditions = opts.conditions ?? [];
  const meds = opts.meds ?? [];
  const symptoms = (opts.symptoms ?? []).map(name => ({ name, severity: 5 }));
  const labs = opts.labs ?? [];
  return {
    age: opts.age, sex: opts.sex, heightCm: 175, weightKg: opts.bmi * 3.0625, bmi: opts.bmi,
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => s.name.toLowerCase()).join(' '),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

interface Expectation {
  /** Human-readable description for the failure message. */
  description: string;
  /** Check function: returns null if the expectation is met, or a failure
   *  string if not. */
  check: (plan: ReturnType<typeof buildPlan>) => string | null;
}
function mustHaveTest(testNamePattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => plan.tests.some(t => testNamePattern.test(t.name))
      ? null
      : `MISSING TEST matching ${testNamePattern} — got [${plan.tests.map(t => t.name).join(' | ')}]`,
  };
}
function mustHaveCondition(conditionNamePattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => plan.conditions.some(c => conditionNamePattern.test(c.name))
      ? null
      : `MISSING CONDITION matching ${conditionNamePattern} — got [${plan.conditions.map(c => c.name).join(' | ')}]`,
  };
}
function mustHaveDiscussionPoint(textPattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => plan.discussionPoints.some(d => textPattern.test(d))
      ? null
      : `MISSING DISCUSSION POINT matching ${textPattern} — got [${plan.discussionPoints.map(d => d.slice(0, 50)).join(' | ')}]`,
  };
}
function mustHaveHpiContent(textPattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => textPattern.test(plan.hpi)
      ? null
      : `MISSING HPI CONTENT matching ${textPattern} — HPI was: "${plan.hpi.slice(0, 200)}…"`,
  };
}
function mustNotHaveSupplement(suppPattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => plan.supplementCandidates.some(s => suppPattern.test(s.nutrient))
      ? `UNSAFE SUPPLEMENT FIRED matching ${suppPattern} — got [${plan.supplementCandidates.map(s => s.nutrient).join(' | ')}]`
      : null,
  };
}

interface ClinicalCase {
  id: string;
  description: string;
  input: PatientInput;
  expectations: Expectation[];
}

const CASES: ClinicalCase[] = [
  // ── Obese male + borderline Cr + isolated bili + gynecomastia ───────────
  // (the Tim case — distilled to its clinical essentials)
  {
    id: 'obese_male_borderline_cr_gynecomastia',
    description: '41yo male, BMI 41, Cr 1.29, bili 1.3 (isolated), gynecomastia + low T symptoms',
    input: makeInput({
      age: 41, sex: 'male', bmi: 41,
      conditions: ['Anxiety', 'Depression', 'Psoriasis', 'Sleep Apnea (Obstructive)'],
      symptoms: ['Gynecomastia — male breast tissue', 'Low testosterone symptoms', 'Sugar cravings', 'Difficulty losing weight', 'Snoring'],
      labs: [
        lab('Bilirubin Total', 1.3, 'mg/dL', 'high'),
        lab('Creatinine', 1.29, 'mg/dL', 'high'),
        lab('ALT', 37, 'U/L'),
        lab('AST', 37, 'U/L'),
        lab('Alkaline Phosphatase', 67, 'U/L'),
        lab('Glucose', 94, 'mg/dL', 'watch'),
      ],
    }),
    expectations: [
      mustHaveHpiContent(/bmi\s*41/i, 'HPI must include BMI when obese'),
      mustHaveHpiContent(/gynecomastia/i, 'HPI must surface gynecomastia as red-flag'),
      mustHaveTest(/cystatin/i, 'Cystatin-C must appear when Cr elevated + BMI obese'),
      mustHaveTest(/testosterone/i, 'Testosterone panel must fire on gynecomastia + low T sx in male'),
      mustHaveTest(/prolactin/i, 'Prolactin must fire on gynecomastia (hyperprolactinemia rule-out)'),
      mustHaveCondition(/gilbert|isolated.*bilirubin/i, 'Gilbert rule-out must fire on isolated bili high + normal ALT/AST/AlkPhos'),
      mustHaveDiscussionPoint(/glp-?1|sglt2/i, 'GLP-1 discussion must fire on BMI ≥35 + metabolic signals'),
      mustHaveDiscussionPoint(/sleep apnea|osa.*testosterone|testosterone.*sleep|cpap/i, 'OSA ↔ low-T link must be discussed for male with both signals'),
      mustHaveDiscussionPoint(/psorias.*metabolic|metabolic.*psorias|psorias.*comorbid/i, 'Psoriasis-metabolic comorbidity must be flagged'),
    ],
  },

  // ── 70yo female with osteopenia history ─────────────────────────────────
  {
    id: 'senior_female_osteopenia',
    description: '70yo female, BMI 24, osteopenia, on calcium supplement',
    input: makeInput({
      age: 70, sex: 'female', bmi: 24,
      conditions: ['Osteopenia'],
      symptoms: ['Fragility fracture history'],
      labs: [lab('25-Hydroxy, Vitamin D', 22, 'ng/mL', 'low')],
    }),
    expectations: [
      mustHaveTest(/dexa|bone density/i, 'DEXA must fire for women 65+ with osteopenia'),
      mustHaveTest(/pth|parathyroid/i, 'PTH should fire for low Vit D + bone signal'),
      mustNotHaveSupplement(/^iron\b/i, 'Iron must never fire empirically'),
    ],
  },

  // ── Statin user + persistent muscle pain ────────────────────────────────
  {
    id: 'statin_myalgia',
    description: '55yo male, BMI 28, on atorvastatin, reports muscle pain',
    input: makeInput({
      age: 55, sex: 'male', bmi: 28,
      conditions: ['Hyperlipidemia'],
      meds: ['Atorvastatin 40mg'],
      symptoms: ['Muscle ache', 'Exercise intolerance'],
      labs: [lab('LDL Cholesterol', 95, 'mg/dL'), lab('ALT', 35, 'U/L')],
    }),
    expectations: [
      mustHaveTest(/creatine kinase|^ck\b/i, 'CK must fire on statin user with muscle symptoms'),
      mustHaveTest(/liver panel|cmp/i, 'Liver Panel / CMP must fire for statin monitoring'),
    ],
  },

  // ── Long-term metformin + low B12 ───────────────────────────────────────
  {
    id: 'metformin_b12_low',
    description: '60yo female, BMI 32, T2D on metformin, B12 measured low',
    input: makeInput({
      age: 60, sex: 'female', bmi: 32,
      conditions: ['Type 2 Diabetes'],
      meds: ['Metformin 1000mg'],
      labs: [lab('Vitamin B12', 220, 'pg/mL', 'low'), lab('Hemoglobin A1c', 7.2, '%', 'high')],
    }),
    expectations: [
      mustHaveTest(/b12|cobalamin/i, 'B12 workup must auto-add for metformin user'),
      mustHaveTest(/mma|methylmalonic/i, 'MMA must confirm functional B12 status'),
      mustHaveTest(/homocysteine/i, 'Homocysteine must accompany B12 workup'),
    ],
  },

  // ── PPI long-term + low Mg ──────────────────────────────────────────────
  {
    id: 'ppi_long_term_low_mg',
    description: '55yo male on chronic PPI, Mg 1.5 (low)',
    input: makeInput({
      age: 55, sex: 'male', bmi: 26,
      conditions: ['GERD'],
      meds: ['Omeprazole 40mg'],
      labs: [lab('Magnesium', 1.5, 'mg/dL', 'low')],
    }),
    expectations: [
      mustHaveTest(/magnesium/i, 'Mg workup auto-added for PPI user'),
      mustHaveTest(/b12|cobalamin/i, 'B12 workup auto-added for PPI user'),
      mustHaveTest(/calcium/i, 'Ca workup auto-added for PPI user'),
    ],
  },

  // ── Mesalamine user (UC) ────────────────────────────────────────────────
  {
    id: 'uc_mesalamine',
    description: '32yo female with UC on mesalamine',
    input: makeInput({
      age: 32, sex: 'female', bmi: 23,
      conditions: ['Ulcerative Colitis'],
      meds: ['Mesalamine'],
      symptoms: ['Chronic fatigue'],
    }),
    expectations: [
      mustHaveTest(/folate/i, 'Folate workup auto-added for mesalamine user'),
    ],
  },

  // ── Hashimoto + Vit D low ───────────────────────────────────────────────
  {
    id: 'hashimoto_vit_d_low',
    description: '45yo female with Hashimoto, Vit D 18',
    input: makeInput({
      age: 45, sex: 'female', bmi: 25,
      conditions: ['Hashimoto'],
      symptoms: ['Chronic fatigue', 'Brain fog', 'Cold intolerance'],
      labs: [
        lab('TSH', 4.8, 'mIU/L', 'high'),
        lab('25-Hydroxy, Vitamin D', 18, 'ng/mL', 'low'),
      ],
    }),
    expectations: [
      mustHaveTest(/tpo|thyroglobulin|thyroid antibod/i, 'Thyroid antibodies for Hashimoto monitoring'),
      mustHaveTest(/free t3|free t4/i, 'Free T3 + Free T4 for Hashimoto'),
      // Selenium SUPPLEMENT (not test) is the standard for Hashimoto's —
      // engine handles via supplement stack with recommendedSupplementKey.
    ],
  },

  // ── ALT high + TG high + BMI 30 (NAFLD signal) ──────────────────────────
  {
    id: 'nafld_signal',
    description: '38yo male, BMI 31, ALT 78 + TG 240',
    input: makeInput({
      age: 38, sex: 'male', bmi: 31,
      labs: [
        lab('ALT', 78, 'U/L', 'high'),
        lab('AST', 52, 'U/L', 'high'),
        lab('Triglycerides', 240, 'mg/dL', 'high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/nafld|fatty liver|hepatic stress/i, 'NAFLD pattern must fire'),
      mustHaveTest(/ggt/i, 'GGT for NAFLD workup'),
      mustHaveTest(/insulin|homa-ir/i, 'Fasting Insulin + HOMA-IR for NAFLD-IR axis'),
    ],
  },

  // ── Healthy 30yo male — should NOT trigger condition rules ──────────────
  {
    id: 'healthy_baseline',
    description: '30yo male healthy — should get foundational stack only',
    input: makeInput({
      age: 30, sex: 'male', bmi: 23,
    }),
    expectations: [
      // No specific must-haves; just verify no inappropriate firings via universal audit
      {
        description: 'Healthy patient should not surface disease patterns',
        check: (plan) => plan.conditions.length === 0
          ? null
          : `UNEXPECTED CONDITIONS for healthy patient: [${plan.conditions.map(c => c.name).join(' | ')}]`,
      },
      mustNotHaveSupplement(/^iron\b/i, 'Iron must never fire for healthy patient'),
    ],
  },

  // ── Pregnant + IBD ──────────────────────────────────────────────────────
  {
    id: 'pregnant_ibd',
    description: '28yo pregnant female with UC',
    input: { ...makeInput({
      age: 28, sex: 'female', bmi: 26,
      conditions: ['UC'],
      meds: ['Mesalamine'],
    }), isPregnant: true },
    expectations: [
      mustNotHaveSupplement(/red yeast rice|berberine|nac/i, 'Pregnancy-contraindicated supplements must not fire'),
      mustHaveTest(/folate/i, 'Folate workup for mesalamine + pregnancy'),
    ],
  },
];

// ── RUNNER ──────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  CLINICAL-DEPTH AUDIT — ${CASES.length} synthetic patient archetypes`);
console.log(`  Checks the engine catches the workups a careful clinician would.`);
console.log(`══════════════════════════════════════════════════════════════\n`);

let totalChecks = 0;
let totalFailures = 0;
const failuresByCase: Record<string, string[]> = {};

for (const c of CASES) {
  const plan = buildPlan(c.input);
  const caseFailures: string[] = [];
  for (const exp of c.expectations) {
    totalChecks++;
    const failure = exp.check(plan);
    if (failure) {
      totalFailures++;
      caseFailures.push(`     ❌ ${exp.description}\n        ${failure}`);
    }
  }
  if (caseFailures.length === 0) {
    console.log(`✅ ${c.id.padEnd(40)} ${c.expectations.length}/${c.expectations.length} checks passed`);
  } else {
    failuresByCase[c.id] = caseFailures;
    console.log(`❌ ${c.id.padEnd(40)} ${c.expectations.length - caseFailures.length}/${c.expectations.length} checks passed — ${caseFailures.length} clinical gaps:`);
    for (const f of caseFailures) console.log(f);
  }
}

console.log(`\n──── SUMMARY ────`);
console.log(`Total checks       : ${totalChecks}`);
console.log(`Passed             : ${totalChecks - totalFailures}`);
console.log(`Clinical gaps      : ${totalFailures}`);

console.log();
if (totalFailures === 0) {
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`✅ ENGINE CLINICAL DEPTH IS GOOD — every workup a clinician would order is present.`);
  console.log(`══════════════════════════════════════════════════════════════`);
  Deno.exit(0);
} else {
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`❌ ${totalFailures} CLINICAL GAPS — fix the rules, not the user data.`);
  console.log(`══════════════════════════════════════════════════════════════`);
  Deno.exit(1);
}
