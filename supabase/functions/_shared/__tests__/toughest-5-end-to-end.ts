// TOUGHEST 5 ARCHETYPES — END-TO-END GENERATION INSPECTION
// =========================================================
// Five maximally-complex synthetic patients. We run them through the
// full deterministic engine and DUMP every surface that ends up
// in the user's actual app (HPI, conditions, tests, discussion
// points, supplements, lifestyle buckets, doctor-prep panel).
//
// Goal: catch production-quality issues the structural audits miss —
// truncated prose, weird phrasing, missing context, duplicate items,
// items that read fine in isolation but jar when shown together.
//
// This is a READ-ONLY observation tool. No assertions — just renders
// what a real user with this profile would see.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}

function input(opts: {
  age: number; sex: 'male' | 'female'; bmi: number;
  conditions?: string[]; meds?: string[]; symptoms?: string[]; labs?: LabValue[];
  isPregnant?: boolean; freeText?: string;
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
    isPregnant: opts.isPregnant ?? false, hasShellfishAllergy: false, hasSulfaAllergy: false,
    freeText: opts.freeText ?? '',
  };
}

const ARCHETYPES = [
  {
    id: '1_elderly_polypharm',
    title: '72yo female — 6 meds, multi-condition, low B12 + low Mg + borderline lipid',
    input: input({
      age: 72, sex: 'female', bmi: 28,
      conditions: ['Type 2 Diabetes', 'Hashimoto', 'Osteoporosis', 'GERD', 'Depression', 'Hypertension'],
      meds: ['Metformin 1000mg BID', 'Atorvastatin 40mg', 'Omeprazole 20mg', 'Sertraline 100mg', 'Levothyroxine 75mcg', 'Lisinopril 20mg'],
      symptoms: ['Chronic fatigue', 'Brain fog', 'Muscle weakness', 'Pins and needles in feet', 'Poor sleep'],
      labs: [
        lab('Hemoglobin A1c', 7.4, '%', 'high'),
        lab('Glucose', 142, 'mg/dL', 'high'),
        lab('Vitamin B12', 215, 'pg/mL', 'low'),
        lab('Magnesium', 1.6, 'mg/dL', 'low'),
        lab('25-Hydroxy, Vitamin D', 24, 'ng/mL', 'low'),
        lab('TSH', 3.2, 'mIU/L'),
        lab('Free T4', 1.0, 'ng/dL'),
        lab('LDL Cholesterol', 105, 'mg/dL', 'watch'),
        lab('HDL', 42, 'mg/dL'),
        lab('Triglycerides', 165, 'mg/dL', 'watch'),
        lab('Creatinine', 1.05, 'mg/dL'),
        lab('eGFR', 58, 'mL/min', 'low'),
        lab('ALT', 32, 'U/L'),
        lab('AST', 28, 'U/L'),
      ],
    }),
  },
  {
    id: '2_athletic_male_subtle',
    title: '28yo male athlete — "feels fine" but apoB high, fasting insulin up, low ferritin without anemia',
    input: input({
      age: 28, sex: 'male', bmi: 26,
      symptoms: ['Difficulty recovering after workouts', 'Mid-afternoon energy dip'],
      labs: [
        lab('Total Cholesterol', 178, 'mg/dL'),
        lab('LDL Cholesterol', 98, 'mg/dL'),
        lab('HDL', 52, 'mg/dL'),
        lab('Triglycerides', 88, 'mg/dL'),
        lab('ApoB', 102, 'mg/dL', 'high'),
        lab('Hemoglobin A1c', 5.5, '%'),
        lab('Glucose', 92, 'mg/dL'),
        lab('Fasting Insulin', 14, 'uIU/mL', 'high'),
        lab('Ferritin', 28, 'ng/mL', 'low'),
        lab('Hemoglobin', 14.2, 'g/dL'),
        lab('Testosterone Total', 410, 'ng/dL', 'watch'),
        lab('SHBG', 18, 'nmol/L', 'low'),
        lab('Vitamin B12', 480, 'pg/mL'),
        lab('25-Hydroxy, Vitamin D', 32, 'ng/mL'),
      ],
    }),
  },
  {
    id: '3_perimenopausal_complex',
    title: '48yo female — perimenopausal, multi-system symptoms, on SSRI, multiple borderlines',
    input: input({
      age: 48, sex: 'female', bmi: 29,
      conditions: ['Depression', 'Anxiety'],
      meds: ['Escitalopram 20mg', 'Bupropion XL 300mg'],
      symptoms: ['Hot flashes', 'Night sweats', 'Insomnia', 'Brain fog', 'Weight gain', 'Hair shedding', 'Heavy periods', 'Joint pain'],
      labs: [
        lab('TSH', 3.8, 'mIU/L', 'watch'),
        lab('Free T4', 0.9, 'ng/dL'),
        lab('25-Hydroxy, Vitamin D', 19, 'ng/mL', 'low'),
        lab('Ferritin', 24, 'ng/mL', 'low'),
        lab('Hemoglobin', 12.2, 'g/dL', 'low'),
        lab('FSH', 28, 'mIU/mL', 'high'),
        lab('Estradiol', 32, 'pg/mL', 'low'),
        lab('Vitamin B12', 360, 'pg/mL'),
        lab('Hemoglobin A1c', 5.7, '%', 'high'),
        lab('LDL Cholesterol', 138, 'mg/dL', 'high'),
        lab('HDL', 48, 'mg/dL'),
        lab('Triglycerides', 142, 'mg/dL'),
      ],
    }),
  },
  {
    id: '4_resistant_htn_metsyndrome',
    title: '55yo male — resistant HTN on 3 drugs, T2D, NAFLD signal, apoB high, family Hx CAD',
    input: input({
      age: 55, sex: 'male', bmi: 34,
      conditions: ['Type 2 Diabetes', 'Hypertension', 'Hyperlipidemia', 'NAFLD', 'Family history of premature CAD'],
      meds: ['Metformin 1000mg BID', 'Lisinopril 40mg', 'Amlodipine 10mg', 'Hydrochlorothiazide 25mg', 'Atorvastatin 80mg'],
      symptoms: ['Snoring', 'Daytime sleepiness', 'Difficulty losing weight', 'Sugar cravings', 'Erectile dysfunction'],
      labs: [
        lab('Hemoglobin A1c', 7.8, '%', 'high'),
        lab('Glucose', 156, 'mg/dL', 'high'),
        lab('Fasting Insulin', 22, 'uIU/mL', 'high'),
        lab('Potassium', 3.3, 'mEq/L', 'low'),
        lab('Sodium', 138, 'mEq/L'),
        lab('Creatinine', 1.18, 'mg/dL'),
        lab('eGFR', 72, 'mL/min'),
        lab('LDL Cholesterol', 88, 'mg/dL'),
        lab('ApoB', 110, 'mg/dL', 'high'),
        lab('Triglycerides', 285, 'mg/dL', 'high'),
        lab('HDL', 34, 'mg/dL', 'low'),
        lab('ALT', 72, 'U/L', 'high'),
        lab('AST', 48, 'U/L', 'high'),
        lab('GGT', 88, 'U/L', 'high'),
        lab('Uric Acid', 7.8, 'mg/dL', 'high'),
        lab('Vitamin B12', 240, 'pg/mL', 'low'),
      ],
    }),
  },
  {
    id: '5_autoimmune_cluster',
    title: '35yo female — Hashimoto + endometriosis + IBS, multi-deficiency, on levo + COCs',
    input: input({
      age: 35, sex: 'female', bmi: 23,
      conditions: ['Hashimoto', 'Endometriosis', 'IBS'],
      meds: ['Levothyroxine 100mcg', 'Drospirenone/Ethinyl Estradiol (COC)', 'Omeprazole 20mg'],
      symptoms: ['Chronic fatigue', 'Brain fog', 'Joint pain', 'Hair shedding', 'Cold intolerance', 'Bloating', 'Heavy periods', 'Painful periods'],
      labs: [
        lab('TSH', 4.6, 'mIU/L', 'high'),
        lab('Free T4', 1.0, 'ng/dL'),
        lab('Free T3', 2.6, 'pg/mL', 'low'),
        lab('TPO Antibodies', 285, 'IU/mL', 'high'),
        lab('25-Hydroxy, Vitamin D', 16, 'ng/mL', 'low'),
        lab('Ferritin', 18, 'ng/mL', 'low'),
        lab('Hemoglobin', 11.8, 'g/dL', 'low'),
        lab('Vitamin B12', 280, 'pg/mL', 'low'),
        lab('Folate', 7, 'ng/mL', 'low'),
        lab('Homocysteine', 14, 'umol/L', 'high'),
        lab('Magnesium', 1.7, 'mg/dL', 'low'),
        lab('hs-CRP', 4.2, 'mg/L', 'high'),
      ],
    }),
  },
];

function trim(s: string, max = 220): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  TOUGHEST 5 — END-TO-END GENERATION INSPECTION');
console.log('  Five maximally-complex synthetic patients. Read the output.');
console.log('══════════════════════════════════════════════════════════════\n');

for (const a of ARCHETYPES) {
  console.log(`\n──────────────────────────────────────────────────────────────`);
  console.log(`▌ ${a.id}`);
  console.log(`▌ ${a.title}`);
  console.log(`──────────────────────────────────────────────────────────────\n`);

  const plan = buildPlan(a.input);

  console.log(`CHIEF COMPLAINT:`);
  console.log(`  ${trim(plan.chiefComplaint, 300)}`);

  console.log(`\nHPI (History of Present Illness):`);
  console.log(`  ${trim(plan.hpi, 500)}`);

  console.log(`\nCONDITIONS DETECTED (${plan.conditions.length}):`);
  for (const c of plan.conditions) {
    console.log(`  • ${c.name}`);
    console.log(`      evidence: ${trim(c.evidence, 200)}`);
  }

  console.log(`\nTESTS RECOMMENDED (${plan.tests.length}):`);
  for (const t of plan.tests) {
    console.log(`  • ${t.name}`);
  }

  console.log(`\nDISCUSSION POINTS FOR DOCTOR (${plan.discussionPoints.length}):`);
  for (const d of plan.discussionPoints) {
    console.log(`  • ${trim(d, 280)}`);
  }

  console.log(`\nSUPPLEMENT CANDIDATES (${plan.supplementCandidates.length}):`);
  for (const s of plan.supplementCandidates.slice(0, 12)) {
    const why = (s as any).whyShort || (s as any).why || '';
    const dose = (s as any).dose ? ` [${(s as any).dose}]` : '';
    console.log(`  • ${s.nutrient}${dose}  — ${trim(why, 180)}`);
  }
  if (plan.supplementCandidates.length > 12) {
    console.log(`  … and ${plan.supplementCandidates.length - 12} more`);
  }

  if ((plan as any).executiveSummary && Array.isArray((plan as any).executiveSummary)) {
    console.log(`\nEXECUTIVE SUMMARY:`);
    for (const e of (plan as any).executiveSummary) console.log(`  • ${trim(e, 240)}`);
  }

  if ((plan as any).findingExplanations && Array.isArray((plan as any).findingExplanations)) {
    console.log(`\nKEY FINDINGS (${(plan as any).findingExplanations.length}):`);
    for (const f of (plan as any).findingExplanations.slice(0, 6)) {
      console.log(`  • ${f.marker ?? f.finding ?? '?'} — ${trim(f.explanation ?? f.text ?? '', 180)}`);
    }
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  END OF INSPECTION');
console.log('══════════════════════════════════════════════════════════════\n');
