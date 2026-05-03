// supabase/functions/_shared/syntheticPatients.ts
//
// Test bench. Each archetype represents a real patient profile + the
// expected outputs from the deterministic engines (classification,
// adequacy flags, causal chain root keys, specialty count, etc.).
//
// The test runner (runSyntheticTests) feeds each patient through the
// pure functions (no AI) and asserts. This is the regression gate —
// future architectural changes can't quietly break a known-good case.
//
// Adding a patient = pushing one PATIENT object. Add the expected
// outputs you want to lock in. CI will keep them honest.

import { classifyPatient, ClassifyResult } from './patientClassifier.ts';
import { runAdequacyChecks, runSelfSupplementChecks } from './replacementTherapyChecks.ts';
import { detectAlreadyOptimal } from './alreadyOptimalFilter.ts';
import { detectTestQualityIssues } from './testQualityFlagger.ts';
import { buildCausalChain } from './causalChainBuilder.ts';
import { synthesizeAcrossSpecialties } from './specialtySynthesizer.ts';
import { detectConditions } from './conditionAliases.ts';
import { runPathways } from './pathwayEngine.ts';

export interface SyntheticPatient {
  name: string;
  description: string;
  profile: {
    age: number;
    sex: 'male' | 'female';
    sleepHours?: number;
  };
  conditions: string[];          // freeform text the user typed in onboarding
  meds: string[];                // freeform text
  symptoms: Array<{ symptom: string; severity: number }>;
  supplements: string[];         // user_supplements freeform names
  labValues: Array<{ marker_name: string; value: number; unit: string; optimal_flag?: string }>;
  expect: {
    /** Must equal one of these. */
    mode: ClassifyResult['mode'][];
    /** Must contain ALL these adequacy flag keys (if any). */
    adequacyKeys?: string[];
    /** Must NOT contain these adequacy flag keys. */
    forbidAdequacyKeys?: string[];
    /** Causal layer-1 root keys MUST include all these. */
    causalRootKeys?: string[];
    /** Specialty count must be at least this. */
    specialtyCountAtLeast?: number;
    /** Pathway engine MUST have inserted these test keys. */
    requiredTestKeys?: string[];
    /** Pathway engine MUST have inserted these supplement keys. */
    requiredSupplementKeys?: string[];
    /** Already-optimal MUST flag these keys. */
    alreadyOptimalKeys?: string[];
    /** Test-quality MUST flag these. */
    testQualityKeys?: string[];
  };
}

export const PATIENTS: SyntheticPatient[] = [
  {
    name: 'Nona Lynn — postmenopausal hypothyroid w/ atherogenic lipids',
    description: '49yo female on Armour Thyroid + DHEA, FSH 80, LDL-P 1441, CRP 2.2. The patient that exposed the original bugs.',
    profile: { age: 49, sex: 'female', sleepHours: 5 },
    conditions: ['Hypothyroidism', 'Anxiety'],
    meds: ['ARMOUR THYROID'],
    symptoms: [
      { symptom: 'Chronic fatigue', severity: 5 },
      { symptom: 'Hair loss', severity: 5 },
      { symptom: 'Brain fog', severity: 5 },
      { symptom: 'Cold hands and feet', severity: 5 },
      { symptom: 'Difficulty falling asleep', severity: 5 },
      { symptom: 'Weight gain', severity: 5 },
    ],
    supplements: ['DHEA', 'Magnesium Glycinate', 'Vitamin D3', 'Vitamin K2 (MK-7)'],
    labValues: [
      { marker_name: 'TSH', value: 3.04, unit: 'mIU/L', optimal_flag: 'healthy' },
      { marker_name: 'T4, FREE', value: 1.2, unit: 'ng/dL', optimal_flag: 'healthy' },
      { marker_name: 'LDL P', value: 1441, unit: 'nmol/L', optimal_flag: 'critical_high' },
      { marker_name: 'SMALL LDL P', value: 614, unit: 'nmol/L', optimal_flag: 'critical_high' },
      { marker_name: 'LARGE HDL P', value: 3, unit: 'umol/L', optimal_flag: 'critical_low' },
      { marker_name: 'HS CRP', value: 2.2, unit: 'mg/L', optimal_flag: 'critical_high' },
      { marker_name: 'FSH', value: 80.3, unit: 'mIU/mL', optimal_flag: 'healthy' },
      { marker_name: 'DHEA SULFATE', value: 64, unit: 'mcg/dL', optimal_flag: 'healthy' },
      { marker_name: 'VITAMIN D, 25-OH, TOTAL', value: 64, unit: 'ng/mL', optimal_flag: 'healthy' },
      { marker_name: 'VITAMIN B12', value: 662, unit: 'pg/mL', optimal_flag: 'healthy' },
      { marker_name: 'FERRITIN', value: 98, unit: 'ng/mL', optimal_flag: 'healthy' },
      { marker_name: 'MAGNESIUM', value: 2.2, unit: 'mg/dL', optimal_flag: 'healthy' },
      { marker_name: 'HEMOGLOBIN A1c', value: 4.5, unit: '%', optimal_flag: 'healthy' },
      { marker_name: 'TESTOSTERONE, TOTAL, MS', value: 16, unit: 'ng/dL', optimal_flag: 'healthy' },
    ],
    expect: {
      mode: ['critical_treatment'],
      adequacyKeys: ['thyroid_replacement_tsh_high', 'dhea_not_converting'],
      causalRootKeys: ['under_replaced_thyroid', 'postmenopause', 'sleep_deprivation', 'autoimmune_activity'],
      specialtyCountAtLeast: 4,
      requiredTestKeys: ['thyroid_antibodies', 'reverse_t3', 'rbc_magnesium'],
      requiredSupplementKeys: ['selenium', 'curcumin', 'bergamot'],
      alreadyOptimalKeys: ['vitamin_d_25oh', 'serum_b12', 'ferritin_premenopausal_female', 'glucose_a1c'],
      testQualityKeys: ['serum_mg_unreliable', 'tsh_alone_on_replacement', 'ferritin_during_inflammation'],
    },
  },
  {
    name: 'Pristine 26yo — clean labs, no symptoms',
    description: 'Healthy 26yo athlete. Should classify as pristine, get small list, no adequacy/quality flags.',
    profile: { age: 26, sex: 'male', sleepHours: 8 },
    conditions: [],
    meds: [],
    symptoms: [],
    supplements: [],
    labValues: [
      { marker_name: 'TSH', value: 1.5, unit: 'mIU/L', optimal_flag: 'healthy' },
      { marker_name: 'HEMOGLOBIN A1c', value: 5.0, unit: '%', optimal_flag: 'healthy' },
      { marker_name: 'VITAMIN D, 25-OH, TOTAL', value: 55, unit: 'ng/mL', optimal_flag: 'healthy' },
      { marker_name: 'VITAMIN B12', value: 700, unit: 'pg/mL', optimal_flag: 'healthy' },
      { marker_name: 'LDL', value: 95, unit: 'mg/dL', optimal_flag: 'healthy' },
      { marker_name: 'TRIGLYCERIDES', value: 75, unit: 'mg/dL', optimal_flag: 'healthy' },
      { marker_name: 'HEMOGLOBIN', value: 14.5, unit: 'g/dL', optimal_flag: 'healthy' },
    ],
    expect: {
      mode: ['pristine', 'optimization'],
      forbidAdequacyKeys: ['thyroid_replacement_tsh_high', 'glycemic_uncontrolled'],
      alreadyOptimalKeys: ['vitamin_d_25oh', 'serum_b12', 'glucose_a1c'],
    },
  },
  {
    name: 'T2D uncontrolled on metformin',
    description: '55yo male, A1c 8.5 on metformin alone. Should fire glycemic_basic_control adequacy flag + B12 workup (metformin depletion).',
    profile: { age: 55, sex: 'male' },
    conditions: ['Type 2 Diabetes'],
    meds: ['Metformin 1000mg'],
    symptoms: [{ symptom: 'fatigue', severity: 5 }, { symptom: 'frequent urination', severity: 6 }],
    supplements: [],
    labValues: [
      { marker_name: 'HEMOGLOBIN A1c', value: 8.5, unit: '%', optimal_flag: 'critical_high' },
      { marker_name: 'GLUCOSE', value: 165, unit: 'mg/dL', optimal_flag: 'high' },
      { marker_name: 'TRIGLYCERIDES', value: 220, unit: 'mg/dL', optimal_flag: 'high' },
      { marker_name: 'HDL', value: 35, unit: 'mg/dL', optimal_flag: 'low' },
      { marker_name: 'VITAMIN B12', value: 350, unit: 'pg/mL', optimal_flag: 'healthy' },
    ],
    expect: {
      mode: ['critical_treatment', 'treatment'],
      adequacyKeys: ['glycemic_basic_control_high'],
      causalRootKeys: ['insulin_resistance'],
      requiredTestKeys: ['vit_b12_workup_if_long_term', 'uacr', 'hba1c'],
    },
  },
  {
    name: 'IBD patient on mesalamine',
    description: '32yo female with UC, on mesalamine. Should fire all IBD pathway hints + folate workup (mesalamine depletion).',
    profile: { age: 32, sex: 'female' },
    conditions: ['Ulcerative Colitis'],
    meds: ['Mesalamine 4.8g'],
    symptoms: [{ symptom: 'fatigue', severity: 6 }, { symptom: 'gas', severity: 5 }],
    supplements: [],
    labValues: [
      { marker_name: 'HS CRP', value: 1.8, unit: 'mg/L', optimal_flag: 'high' },
      { marker_name: 'FERRITIN', value: 25, unit: 'ng/mL', optimal_flag: 'low' },
      { marker_name: 'VITAMIN D, 25-OH, TOTAL', value: 28, unit: 'ng/mL', optimal_flag: 'low' },
    ],
    expect: {
      mode: ['critical_treatment', 'treatment'],
      causalRootKeys: ['autoimmune_activity'],
      requiredTestKeys: ['fecal_calprotectin', 'celiac_serology', 'iron_panel', 'folate_workup', 'hs_crp'],
      requiredSupplementKeys: ['l_glutamine', 's_boulardii', 'butyrate'],
    },
  },
  {
    name: 'TRT polycythemia risk',
    description: '45yo male on testosterone cypionate, Hct 53. Should fire TRT polycythemia adequacy flag.',
    profile: { age: 45, sex: 'male' },
    conditions: ['Low Testosterone'],
    meds: ['Testosterone Cypionate 200mg/wk'],
    symptoms: [],
    supplements: [],
    labValues: [
      { marker_name: 'HEMATOCRIT', value: 53, unit: '%', optimal_flag: 'high' },
      { marker_name: 'HEMOGLOBIN', value: 17.8, unit: 'g/dL', optimal_flag: 'high' },
      { marker_name: 'TESTOSTERONE, TOTAL, MS', value: 850, unit: 'ng/dL', optimal_flag: 'healthy' },
    ],
    expect: {
      mode: ['critical_treatment', 'treatment'],
      adequacyKeys: ['trt_hematocrit_high'],
    },
  },
];

export interface SyntheticTestResult {
  patient: string;
  passed: boolean;
  failures: string[];
}

/** Run every synthetic patient and return per-patient pass/fail. */
export function runSyntheticTests(): SyntheticTestResult[] {
  const results: SyntheticTestResult[] = [];
  for (const p of PATIENTS) {
    const failures: string[] = [];
    const conditionsLower = p.conditions.join(' ').toLowerCase();
    const medsLower = p.meds.join(' ').toLowerCase();
    const symptomsLower = p.symptoms.map(s => s.symptom).join(' ').toLowerCase();

    const classification = classifyPatient({
      labValues: p.labValues,
      symptoms: p.symptoms,
      conditionsLower,
      symptomsLower,
    });
    if (!p.expect.mode.includes(classification.mode)) {
      failures.push(`mode expected ${p.expect.mode.join('|')}, got ${classification.mode}`);
    }

    const adequacyFlags = [
      ...runAdequacyChecks({ medsLower, labValues: p.labValues, age: p.profile.age, sex: p.profile.sex }),
      ...runSelfSupplementChecks(p.supplements.join(' '), p.labValues, p.profile.age, p.profile.sex),
    ];
    const adequacyKeys = adequacyFlags.map(f => f.key);
    for (const k of (p.expect.adequacyKeys ?? [])) {
      if (!adequacyKeys.includes(k)) failures.push(`adequacy key missing: ${k}`);
    }
    for (const k of (p.expect.forbidAdequacyKeys ?? [])) {
      if (adequacyKeys.includes(k)) failures.push(`forbidden adequacy key fired: ${k}`);
    }

    const optimal = detectAlreadyOptimal(p.labValues, {
      age: p.profile.age, sex: p.profile.sex, conditionsLower,
    });
    for (const k of (p.expect.alreadyOptimalKeys ?? [])) {
      if (!optimal.optimalKeys.includes(k)) failures.push(`alreadyOptimal key missing: ${k}`);
    }

    const inflammationElevated = p.labValues.some(v =>
      /hs[-\s]?crp|c[-\s]?reactive/i.test(v.marker_name) &&
      ((v.optimal_flag ?? '').toLowerCase().includes('high'))
    );
    const qualityFlags = detectTestQualityIssues({
      conditionsLower, medsLower, symptomsLower,
      age: p.profile.age, sex: p.profile.sex,
      labValues: p.labValues,
      inflammationElevated,
    });
    for (const k of (p.expect.testQualityKeys ?? [])) {
      if (!qualityFlags.some(q => q.key === k)) failures.push(`testQuality key missing: ${k}`);
    }

    const causalChain = buildCausalChain({
      conditionsLower, medsLower, symptomsLower,
      age: p.profile.age, sex: p.profile.sex,
      labValues: p.labValues,
      adequacyKeys,
      sleepHours: p.profile.sleepHours ?? null,
    });
    const causalLayer1Keys = causalChain.nodes.filter(n => n.layer === 1).map(n => n.key);
    for (const k of (p.expect.causalRootKeys ?? [])) {
      if (!causalLayer1Keys.includes(k)) failures.push(`causal root missing: ${k}`);
    }

    const synthesis = synthesizeAcrossSpecialties({
      adequacyFlags,
      causalChain,
      conditionKeys: detectConditions(conditionsLower),
    });
    if (p.expect.specialtyCountAtLeast != null && synthesis.specialtyCount < p.expect.specialtyCountAtLeast) {
      failures.push(`specialty count ${synthesis.specialtyCount} < expected ${p.expect.specialtyCountAtLeast}`);
    }

    // Pathway engine
    const fakePlan = { retest_timeline: [] as any[], supplement_stack: [] as any[] };
    const pathwayResult = runPathways({
      conditionsLower, medsLower, symptomsTextWithSeverity: symptomsLower,
      symptomsArray: p.symptoms,
      labValues: p.labValues,
      sex: p.profile.sex,
      retestCadence: classification.retestCadence,
      plan: fakePlan,
      alreadyTakingText: p.supplements.join(' ').toLowerCase(),
    });
    const insertedTestKeys = pathwayResult.audit.filter(a => a.kind === 'test' && a.inserted).map(a => a.itemKey);
    const insertedSuppKeys = pathwayResult.audit.filter(a => a.kind === 'supplement' && a.inserted).map(a => a.itemKey);
    for (const k of (p.expect.requiredTestKeys ?? [])) {
      if (!insertedTestKeys.includes(k)) failures.push(`pathway test missing: ${k}`);
    }
    for (const k of (p.expect.requiredSupplementKeys ?? [])) {
      if (!insertedSuppKeys.includes(k)) failures.push(`pathway supplement missing: ${k}`);
    }

    results.push({ patient: p.name, passed: failures.length === 0, failures });
  }
  return results;
}
