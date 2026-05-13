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
/** Test name appears EITHER in the global PCP test panel OR inside one of
 *  the suspected conditions' confirmatory_tests recommendations. Both
 *  surface to the user in doctor prep / wellness plan. */
function mustHaveTestAnywhere(testNamePattern: RegExp, description: string): Expectation {
  return {
    description,
    check: (plan) => {
      const inPanel = plan.tests.some(t => testNamePattern.test(t.name));
      if (inPanel) return null;
      const inCondTests = plan.conditions.some(c =>
        (c.confirmatory_tests ?? []).some((t: any) =>
          testNamePattern.test(typeof t === 'string' ? t : (t?.test ?? ''))));
      return inCondTests ? null : `MISSING TEST matching ${testNamePattern} in panel OR condition confirmatory_tests`;
    },
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

  // ── Young female + low ferritin + heavy menses (universal IDA pattern) ──
  {
    id: 'young_female_iron_deficiency',
    description: '28yo female, BMI 22, fatigue + heavy periods, ferritin 12 + Hgb 11.5',
    input: makeInput({
      age: 28, sex: 'female', bmi: 22,
      symptoms: ['Chronic fatigue', 'Hair shedding', 'Heavy periods'],
      labs: [
        lab('Ferritin', 12, 'ng/mL', 'low'),
        lab('Hemoglobin', 11.5, 'g/dL', 'low'),
        lab('Hematocrit', 35, '%', 'low'),
      ],
    }),
    expectations: [
      mustHaveTest(/ferritin|iron panel|tibc|transferrin/i, 'Iron studies must fire for low ferritin in menstruating female'),
      mustHaveTest(/cbc|reticulocyte/i, 'CBC w/ retics for anemia workup'),
      mustHaveDiscussionPoint(/menorrhagia|heavy menstrual|gyn|menstrual/i, 'Heavy menstrual bleeding workup must be raised'),
    ],
  },

  // ── apoB > LDL discordance (universal CVD risk miss) ─────────────────────
  {
    id: 'apob_ldl_discordance',
    description: '45yo male, BMI 28, LDL "fine" at 110 but apoB elevated + small-particle pattern',
    input: makeInput({
      age: 45, sex: 'male', bmi: 28,
      conditions: ['Family history of premature CAD'],
      labs: [
        lab('LDL Cholesterol', 110, 'mg/dL'),
        lab('Triglycerides', 180, 'mg/dL', 'watch'),
        lab('HDL', 38, 'mg/dL', 'low'),
        lab('Non-HDL Cholesterol', 148, 'mg/dL', 'high'),
      ],
    }),
    expectations: [
      mustHaveTest(/apob|apolipoprotein b/i, 'apoB must fire on atherogenic lipid pattern + family CAD history'),
      mustHaveTest(/lp\(a\)|lipoprotein\(a\)|lp-a/i, 'Lp(a) must fire once-in-lifetime on family CAD history'),
    ],
  },

  // ── Subclinical hypothyroidism (universal "your TSH is fine" miss) ───────
  {
    id: 'subclinical_hypothyroid',
    description: '42yo female, BMI 27, TSH 5.8 + normal T4, fatigue + cold + weight gain',
    input: makeInput({
      age: 42, sex: 'female', bmi: 27,
      symptoms: ['Chronic fatigue', 'Cold intolerance', 'Weight gain', 'Brain fog', 'Dry skin'],
      labs: [
        lab('TSH', 5.8, 'mIU/L', 'high'),
      ],
    }),
    expectations: [
      mustHaveTest(/free t4|ft4/i, 'Free T4 must fire on elevated TSH'),
      mustHaveTest(/free t3|ft3/i, 'Free T3 must fire on subclinical hypothyroid'),
      mustHaveTest(/tpo|thyroid antibod|thyroglobulin/i, 'Thyroid antibodies must fire on elevated TSH'),
    ],
  },

  // ── Prediabetes A1c 5.7-6.4 + central adiposity (universal IR miss) ──────
  {
    id: 'prediabetes_central_adiposity',
    description: '45yo male, BMI 31, A1c 6.0, fasting glucose 105',
    input: makeInput({
      age: 45, sex: 'male', bmi: 31,
      symptoms: ['Sugar cravings', 'Afternoon energy crash', 'Difficulty losing weight'],
      labs: [
        lab('Hemoglobin A1c', 6.0, '%', 'high'),
        lab('Glucose', 105, 'mg/dL', 'high'),
        lab('Triglycerides', 175, 'mg/dL', 'watch'),
      ],
    }),
    expectations: [
      mustHaveTest(/fasting insulin|insulin/i, 'Fasting insulin must fire on prediabetes'),
      mustHaveTest(/homa-ir|homa/i, 'HOMA-IR must fire to quantify insulin resistance'),
    ],
  },

  // ── Fatigue with completely normal basic CMP/CBC (universal expansion) ──
  {
    id: 'fatigue_normal_basics',
    description: '35yo female, BMI 23, persistent fatigue but every basic lab is normal',
    input: makeInput({
      age: 35, sex: 'female', bmi: 23,
      symptoms: ['Chronic fatigue', 'Brain fog', 'Poor sleep quality'],
      labs: [
        lab('Glucose', 88, 'mg/dL'),
        lab('Creatinine', 0.8, 'mg/dL'),
        lab('Hemoglobin', 13.5, 'g/dL'),
        lab('TSH', 2.1, 'mIU/L'),
      ],
    }),
    expectations: [
      mustHaveTest(/ferritin/i, 'Ferritin must fire on fatigue even with normal Hgb (non-anemic iron deficiency)'),
      mustHaveTest(/vitamin d|25-?oh/i, 'Vit D must fire on chronic fatigue workup'),
      mustHaveTest(/b12|cobalamin/i, 'B12 must fire on fatigue + brain fog'),
    ],
  },

  // ── Elevated GGT + normal ALT/AST (universal alcohol/metabolic liver) ────
  {
    id: 'elevated_ggt_alcohol_pattern',
    description: '50yo male, BMI 27, GGT 95 with normal ALT/AST — alcohol vs metabolic',
    input: makeInput({
      age: 50, sex: 'male', bmi: 27,
      labs: [
        lab('GGT', 95, 'U/L', 'high'),
        lab('ALT', 28, 'U/L'),
        lab('AST', 26, 'U/L'),
        lab('Alkaline Phosphatase', 88, 'U/L'),
      ],
    }),
    expectations: [
      mustHaveDiscussionPoint(/alcohol|drink|etoh/i, 'Alcohol intake review must be raised on isolated GGT elevation'),
    ],
  },

  // ── Long-term SSRI (universal monitoring miss) ──────────────────────────
  {
    id: 'long_term_ssri',
    description: '60yo female, BMI 27, on sertraline 5+ years',
    input: makeInput({
      age: 60, sex: 'female', bmi: 27,
      conditions: ['Depression'],
      meds: ['Sertraline 100mg'],
      symptoms: ['Low libido', 'Weight gain'],
    }),
    expectations: [
      mustHaveTest(/sodium|cmp/i, 'Sodium monitoring (SSRI hyponatremia risk, esp. age 60+)'),
    ],
  },

  // ── Postmenopausal female + no HRT (universal screening gap) ────────────
  {
    id: 'postmenopausal_no_hrt',
    description: '58yo female, BMI 26, postmenopausal, not on HRT, no recent DEXA',
    input: makeInput({
      age: 58, sex: 'female', bmi: 26,
      conditions: ['Menopause'],
      symptoms: ['Hot flashes', 'Sleep disturbance', 'Joint pain'],
      labs: [
        lab('LDL Cholesterol', 142, 'mg/dL', 'high'),
        lab('25-Hydroxy, Vitamin D', 24, 'ng/mL', 'low'),
      ],
    }),
    expectations: [
      mustHaveTest(/dexa|bone density/i, 'DEXA must fire for postmenopausal screening'),
      mustHaveTest(/apob|apolipoprotein|lipid/i, 'apoB or lipid panel must fire for postmenopausal CVD risk shift'),
    ],
  },

  // ── Young hypertension (universal secondary HTN workup miss) ────────────
  {
    id: 'young_hypertension',
    description: '32yo male, BMI 24, BP 158/98 with no obvious cause',
    input: makeInput({
      age: 32, sex: 'male', bmi: 24,
      conditions: ['Hypertension'],
      symptoms: ['Headaches', 'Palpitations'],
      labs: [
        lab('Potassium', 3.4, 'mEq/L', 'low'),
        lab('Creatinine', 0.9, 'mg/dL'),
      ],
    }),
    expectations: [
      mustHaveTest(/aldosterone|renin|aldo-?renin/i, 'Aldosterone/renin ratio must fire on young HTN + low K (Conn syndrome rule-out)'),
      mustHaveTest(/uacr|microalbumin|urine albumin/i, 'UACR for end-organ damage screening in HTN'),
    ],
  },

  // ── Chronic NSAID user (universal kidney/GI monitoring miss) ────────────
  {
    id: 'chronic_nsaid_user',
    description: '52yo male, BMI 28, on daily ibuprofen for chronic back pain',
    input: makeInput({
      age: 52, sex: 'male', bmi: 28,
      conditions: ['Chronic back pain'],
      meds: ['Ibuprofen 800mg daily'],
      labs: [
        lab('Creatinine', 1.1, 'mg/dL'),
        lab('eGFR', 85, 'mL/min'),
      ],
    }),
    expectations: [
      mustHaveTest(/creatinine|egfr|cmp/i, 'Renal monitoring for chronic NSAID use'),
    ],
  },

  // ── Anabolic/PED user — supraphysiologic T + Hct + low HDL + ALT high ─
  // The Angel case — found day 1 of Reddit launch (r/Biohackers / r/ResearchCompounds).
  // This entire archetype was completely silent before 2026-05-13-50.
  {
    id: 'supraphysiologic_testosterone_male',
    description: '58yo male, BMI 27, Total T 13.8 ng/mL (2× upper), Hct 50.8, HDL 37 low, ALT 105 high, WBC 15.3 high',
    input: makeInput({
      age: 58, sex: 'male', bmi: 27,
      labs: [
        lab('Testosterone Total', 13.8, 'ng/mL', 'high'),
        lab('Hematocrit', 50.8, '%', 'high'),
        lab('HDL', 37, 'mg/dL', 'low'),
        lab('ALT', 105, 'U/L', 'high'),
        lab('AST', 56, 'U/L', 'high'),
        lab('WBC', 15.3, 'x10³/uL', 'high'),
        lab('Neutrophils', 11.6, 'x10³/uL', 'high'),
        lab('Lymphocytes %', 15.3, '%', 'low'),
        lab('25-Hydroxy, Vitamin D', 104, 'ng/mL', 'high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/supraphysiolog|anabolic|trt exposure/i, 'Supraphysiologic T must fire when male T ≥ supra threshold'),
      mustHaveCondition(/leukocytos/i, 'Leukocytosis differential must fire on WBC >12 + neutrophils >10'),
      mustHaveCondition(/anabolic.*erythrocyt|erythrocyt.*anabolic/i, 'Anabolic-erythrocytosis must fire on high Hct + high T in male'),
      mustNotHaveSupplement(/vitamin d|vit_?d|^d3$/i, 'Vit D supplement MUST NOT fire when measured Vit D is high (toxicity risk)'),
    ],
  },

  // ── Mono / EBV — lymphocyte-predominant leukocytosis ────────────────────
  // Young patient with viral illness presentation. Tests lymphocyte branch
  // of the leukocytosis detector — should NOT fire the "stress/anabolic"
  // bacterial framing; should fire the viral/mono framing instead.
  {
    id: 'mono_lymphocytic_leukocytosis',
    description: '19yo with mono — WBC 13.5 with lymph 68% (lymphocyte-predominant)',
    input: makeInput({
      age: 19, sex: 'female', bmi: 22,
      symptoms: ['Fatigue', 'Sore throat', 'Swollen glands', 'Fever'],
      labs: [
        lab('WBC', 13.5, 'x10³/uL', 'high'),
        lab('Lymphocytes %', 68, '%', 'high'),
        lab('Neutrophils', 3.2, 'x10³/uL'),
      ],
    }),
    expectations: [
      mustHaveCondition(/lymphocyte.predominant|viral|mono/i, 'Lymphocytic leukocytosis branch must fire (mono/EBV/CMV workup, not bacterial framing)'),
      mustHaveTestAnywhere(/monospot|heterophile|ebv/i, 'Monospot/EBV serology must appear in test panel OR condition confirmatory_tests'),
    ],
  },

  // ── Bariatric post-op multi-nutrient deficiency cascade ────────────────
  {
    id: 'bariatric_postop_multi_deficient',
    description: '38yo female, 18mo post-RYGB, multi-nutrient deficient pattern',
    input: makeInput({
      age: 38, sex: 'female', bmi: 27,
      conditions: ['Roux-en-Y Gastric Bypass'],
      symptoms: ['Fatigue', 'Hair loss', 'Tingling', 'Brain fog', 'Cold intolerance'],
      labs: [
        lab('Vitamin B12', 180, 'pg/mL', 'low'),
        lab('Ferritin', 14, 'ng/mL', 'low'),
        lab('25-Hydroxy, Vitamin D', 18, 'ng/mL', 'low'),
        lab('Folate', 3.0, 'ng/mL', 'low'),
        lab('Hemoglobin', 11.2, 'g/dL', 'low'),
      ],
    }),
    expectations: [
      mustHaveCondition(/b12 deficiency|pernicious/i, 'B12 deficiency must fire'),
      mustHaveCondition(/iron deficiency anemia/i, 'IDA must fire'),
      mustHaveCondition(/vitamin d deficiency|vit d.*deficiency/i, 'Vit D deficiency must fire'),
      mustHaveCondition(/folate deficiency|low folate/i, 'Folate deficiency must fire'),
    ],
  },

  // ── New-onset T1DM / LADA — low C-peptide + high glucose ───────────────
  {
    id: 'new_t1dm_lada_pattern',
    description: '32yo adult with new T1DM/LADA signal (C-peptide 0.3, glucose 280, A1c 9.2)',
    input: makeInput({
      age: 32, sex: 'male', bmi: 22,
      symptoms: ['Polyuria', 'Polydipsia', 'Weight loss', 'Fatigue'],
      labs: [
        lab('C-Peptide', 0.3, 'ng/mL', 'low'),
        lab('Glucose', 280, 'mg/dL', 'critical_high'),
        lab('Hemoglobin A1c', 9.2, '%', 'critical_high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/c.?peptide|t1dm|lada|type 1/i, 'Low C-peptide T1DM/LADA workup must fire'),
      mustHaveCondition(/diabetes/i, 'Diabetes pattern must fire on glucose 280 + A1c 9.2'),
    ],
  },

  // ── Graves' hyperthyroidism signal ──────────────────────────────────────
  {
    id: 'graves_hyperthyroid',
    description: '38yo female, suppressed TSH + high Free T4, palpitations + weight loss + heat intolerance',
    input: makeInput({
      age: 38, sex: 'female', bmi: 21,
      symptoms: ['Palpitations', 'Heat intolerance', 'Weight loss', 'Tremor', 'Anxiety'],
      labs: [
        lab('TSH', 0.05, 'mIU/L', 'low'),
        lab('Free T4', 2.4, 'ng/dL', 'high'),
        lab('Free T3', 6.8, 'pg/mL', 'high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/hyperthyroid|graves/i, 'Hyperthyroid pattern must fire on low TSH + high T4/T3'),
    ],
  },

  // ── Addison disease pattern ─────────────────────────────────────────────
  {
    id: 'addison_disease_pattern',
    description: '42yo female, low AM cortisol + high K + low Na + fatigue + hyperpigmentation',
    input: makeInput({
      age: 42, sex: 'female', bmi: 21,
      symptoms: ['Severe fatigue', 'Hyperpigmentation', 'Dizziness on standing', 'Salt craving', 'Weight loss'],
      labs: [
        lab('Cortisol', 2.8, 'µg/dL', 'low'),
        lab('Potassium', 5.7, 'mEq/L', 'high'),
        lab('Sodium', 129, 'mEq/L', 'low'),
      ],
    }),
    expectations: [
      mustHaveCondition(/cortisol|adrenal insuffic|addison/i, 'Low AM cortisol must fire'),
      mustHaveCondition(/hyperkalemia|high potassium/i, 'Hyperkalemia must fire'),
      mustHaveCondition(/hyponatremia|low sodium/i, 'Hyponatremia must fire'),
    ],
  },

  // ── Pituitary tumor / central hypopituitarism pattern ──────────────────
  {
    id: 'pituitary_central_hypopit',
    description: '45yo female, low Free T4 + low cortisol + low FSH + headache + visual changes',
    input: makeInput({
      age: 45, sex: 'female', bmi: 23,
      symptoms: ['Headache', 'Visual changes', 'Fatigue', 'Low libido', 'Amenorrhea'],
      labs: [
        lab('Free T4', 0.6, 'ng/dL', 'low'),
        lab('TSH', 1.2, 'mIU/L'),
        lab('Cortisol', 3.8, 'µg/dL', 'low'),
        lab('FSH', 2.1, 'mIU/mL', 'low'),
      ],
    }),
    expectations: [
      mustHaveCondition(/central hypothyroid|free t4.*non-elevated tsh/i, 'Central hypothyroidism pattern must fire'),
      mustHaveCondition(/cortisol|adrenal insuffic/i, 'Low cortisol must fire'),
    ],
  },

  // ── RED-S / female athlete triad — low energy availability ────────────
  {
    id: 'red_s_female_athlete',
    description: '24yo female athlete, BMI 18, amenorrhea + low IGF-1 + low ferritin + low FT3',
    input: makeInput({
      age: 24, sex: 'female', bmi: 18,
      symptoms: ['Amenorrhea', 'Stress fracture', 'Fatigue', 'Cold intolerance'],
      labs: [
        lab('IGF-1', 75, 'ng/mL', 'low'),
        lab('Ferritin', 11, 'ng/mL', 'low'),
        lab('Free T3', 1.9, 'pg/mL', 'low'),
        lab('TSH', 1.5, 'mIU/L'),
        lab('Free T4', 0.95, 'ng/dL'),
      ],
    }),
    expectations: [
      mustHaveCondition(/igf-?1|gh deficiency|chronic illness/i, 'Low IGF-1 must fire'),
      mustHaveCondition(/iron deficiency anemia|iron deficien/i, 'IDA must fire on low ferritin'),
      mustHaveCondition(/low free t3|conversion|non.?thyroidal/i, 'Low FT3 conversion pattern must fire'),
    ],
  },

  // ── Chronic alcohol-related liver disease pattern ──────────────────────
  {
    id: 'chronic_alcohol_liver',
    description: '48yo male, AST > ALT 2:1, GGT high, macrocytic MCV, low folate',
    input: makeInput({
      age: 48, sex: 'male', bmi: 27,
      symptoms: ['Fatigue', 'Easy bruising'],
      labs: [
        lab('AST', 110, 'U/L', 'high'),
        lab('ALT', 52, 'U/L', 'high'),
        lab('GGT', 180, 'U/L', 'high'),
        lab('MCV', 104, 'fL', 'high'),
        lab('Folate', 3.0, 'ng/mL', 'low'),
        lab('Platelets', 130, 'x10³/uL', 'low'),
      ],
    }),
    expectations: [
      mustHaveCondition(/hepatic stress|nafld|alcohol|alcoholic/i, 'Hepatic stress / alcohol pattern must fire'),
      mustHaveCondition(/folate deficien/i, 'Folate deficiency must fire'),
      mustHaveDiscussionPoint(/alcohol|etoh|drink/i, 'Alcohol intake review must be raised'),
    ],
  },

  // ── CKD + renal anemia cluster ──────────────────────────────────────────
  {
    id: 'ckd_renal_anemia',
    description: '68yo female, CKD G3b with anemia + low ferritin (mixed-etiology)',
    input: makeInput({
      age: 68, sex: 'female', bmi: 28,
      conditions: ['Hypertension', 'Type 2 Diabetes'],
      meds: ['Lisinopril 20mg', 'Metformin 1000mg'],
      symptoms: ['Fatigue', 'Pallor', 'Shortness of breath'],
      labs: [
        lab('Creatinine', 1.55, 'mg/dL', 'high'),
        lab('eGFR', 42, 'mL/min', 'low'),
        lab('Hemoglobin', 10.2, 'g/dL', 'low'),
        lab('Ferritin', 28, 'ng/mL', 'low'),
        lab('Hemoglobin A1c', 7.1, '%', 'high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/ckd|chronic kidney|kidney disease/i, 'CKD pattern must fire'),
      mustHaveCondition(/anemia|iron deficien/i, 'Anemia pattern must fire'),
      mustHaveTest(/uacr|microalbumin/i, 'UACR must fire for CKD progression monitoring'),
    ],
  },

  // ── Statin myopathy crisis (CK > 5000 + AKI signal) ────────────────────
  {
    id: 'rhabdo_statin_myopathy_crisis',
    description: '60yo on high-dose statin + clopidogrel, recent gym, CK 7200 + Cr 1.6',
    input: makeInput({
      age: 60, sex: 'male', bmi: 28,
      conditions: ['CAD', 'Hyperlipidemia'],
      meds: ['Atorvastatin 80mg', 'Clopidogrel 75mg'],
      symptoms: ['Severe muscle pain', 'Dark urine', 'Weakness'],
      labs: [
        lab('Creatine Kinase', 7200, 'U/L', 'critical_high'),
        lab('Creatinine', 1.6, 'mg/dL', 'high'),
        lab('AST', 280, 'U/L', 'high'),
      ],
    }),
    expectations: [
      mustHaveCondition(/rhabdomyolysis|ck elevation|severe ck/i, 'Severe CK / rhabdo must fire'),
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
