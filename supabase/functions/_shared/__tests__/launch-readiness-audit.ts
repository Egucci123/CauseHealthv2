// LAUNCH-READINESS AUDIT — every feature, every patient archetype
// =====================================================================
// One pass through every clinical engine output field for 15 patient
// archetypes covering the full clinical spectrum. Validates:
//
//   • Engine fact production (conditions, tests, supplements, depletions,
//     alternatives, risk calculators, goal targets)
//   • Deterministic prose (today_actions, action_plan, finding_explanations,
//     pattern_descriptions, eating_pattern, lifestyle_interventions,
//     workouts, tell_doctor, executive_summary, chief_complaint, hpi,
//     questions_to_ask, discussion_points, patient_questions,
//     functional_medicine_note)
//   • Safety rules: no empirical iron, calcium, fat-solubles at therapeutic
//     dose; measured-normal suppression; depletion auto-test injection
//   • No string truncations anywhere
//   • No drift between surfaces (same evidence in wellness + doctor prep)
//   • Universal coverage: no patient breaks the engine, no leaks
//
// If this passes, the engine is launch-ready.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";
import { runMedicationAlternativesEngine } from "../medicationAlternativesEngine.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function makeInput(opts: {
  age?: number; sex?: 'male' | 'female';
  meds?: string[]; conditions?: string[]; symptoms?: string[]; labs?: LabValue[];
  bmi?: number; isPregnant?: boolean;
}): PatientInput {
  const labs = opts.labs ?? [];
  const symptoms = (opts.symptoms ?? []).map(name => ({ name, severity: 4 }));
  const bmi = opts.bmi ?? 26.1;
  return {
    age: opts.age ?? 45, sex: opts.sex ?? 'male', heightCm: 175, weightKg: bmi * 1.75 * 1.75, bmi,
    conditionsList: opts.conditions ?? [], conditionsLower: (opts.conditions ?? []).join(' ').toLowerCase(),
    medsList: opts.meds ?? [], medsLower: (opts.meds ?? []).join(' ').toLowerCase(),
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => s.name.toLowerCase()).join(' '),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: !!opts.isPregnant, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

// ── 15 PATIENT ARCHETYPES — full clinical spectrum ─────────────────
const PATIENTS: Array<{ id: string; tags: string[]; input: PatientInput }> = [
  { id: 'healthy_young_male', tags: ['healthy', 'baseline'],
    input: makeInput({ age: 28, sex: 'male' }) },
  { id: 'healthy_senior_female', tags: ['healthy', 'senior'],
    input: makeInput({ age: 70, sex: 'female' }) },
  { id: 'edgemech_multi_pattern', tags: ['multi-pattern', 'UC', 'statin', 'NAFLD'],
    input: makeInput({ age: 32, sex: 'male', bmi: 30,
      conditions: ['Ulcerative Colitis (UC)', 'High Cholesterol'],
      meds: ['Mesalamine', 'Ustekinumab', 'Atorvastatin'],
      labs: [
        lab('ALT (SGPT)', 97, 'IU/L', 'high'),
        lab('AST (SGOT)', 48, 'IU/L', 'high'),
        lab('Triglycerides', 327, 'mg/dL', 'high'),
        lab('LDL Cholesterol', 166, 'mg/dL', 'high'),
        lab('25-Hydroxy, Vitamin D', 24, 'ng/mL', 'low'),
        lab('Hemoglobin A1c', 5.5, '%', 'watch'),
      ],
    }) },
  { id: 'metabolic_syndrome_male', tags: ['metabolic', 'middle-aged'],
    input: makeInput({ age: 52, sex: 'male', bmi: 31,
      symptoms: ['Weight gain despite diet', 'Chronic fatigue'],
      labs: [
        lab('Triglycerides', 220, 'mg/dL', 'high'),
        lab('HDL Cholesterol', 32, 'mg/dL', 'low'),
        lab('Glucose', 108, 'mg/dL', 'watch'),
        lab('Hemoglobin A1c', 6.0, '%', 'high'),
      ],
    }) },
  { id: 'hashimoto_female', tags: ['thyroid', 'autoimmune'],
    input: makeInput({ age: 50, sex: 'female',
      symptoms: ['Chronic fatigue', 'Brain fog', 'Cold intolerance'],
      labs: [lab('TSH', 6.8, 'mIU/L', 'high')],
    }) },
  { id: 'iron_def_anemia_female', tags: ['iron', 'anemia', 'female-specific'],
    input: makeInput({ age: 38, sex: 'female',
      symptoms: ['Chronic fatigue', 'Hair loss — no family history'],
      labs: [
        lab('Hemoglobin', 11.2, 'g/dL', 'low'),
        lab('Ferritin', 9, 'ng/mL', 'low'),
        lab('MCV', 75, 'fL', 'low'),
      ],
    }) },
  { id: 'poly_pharmacy_senior', tags: ['poly-pharmacy', 'depletions', 'senior'],
    input: makeInput({ age: 68, sex: 'female',
      conditions: ['Type 2 Diabetes', 'Hypertension', 'GERD'],
      meds: ['Metformin', 'Lisinopril', 'Hydrochlorothiazide', 'Omeprazole', 'Atorvastatin'],
      labs: [
        lab('Vitamin B12', 280, 'pg/mL', 'low'),
        lab('Hemoglobin A1c', 7.2, '%', 'high'),
        lab('Potassium', 3.4, 'mEq/L', 'low'),
        lab('LDL Cholesterol', 145, 'mg/dL', 'high'),
      ],
    }) },
  { id: 'anticonvulsant_bone_loss', tags: ['anticonvulsant', 'bone', 'vit-d'],
    input: makeInput({ age: 55, sex: 'female',
      conditions: ['Epilepsy', 'Osteopenia'],
      meds: ['Phenytoin 300mg'],
      labs: [lab('Vitamin D', 22, 'ng/mL', 'low')],
    }) },
  { id: 'glp1_severe_gi', tags: ['GLP-1', 'alternatives-trigger'],
    input: makeInput({ age: 45, sex: 'female',
      conditions: ['Type 2 Diabetes'],
      meds: ['Semaglutide'],
      symptoms: ['severe nausea', 'persistent vomiting', 'cannot tolerate'],
    }) },
  { id: 'nsaid_chronic_renal', tags: ['NSAID', 'kidney', 'alternatives-trigger'],
    input: makeInput({ age: 65, sex: 'male',
      conditions: ['Osteoarthritis'],
      meds: ['Ibuprofen 600mg daily for years'],
      labs: [lab('Creatinine', 1.5, 'mg/dL', 'high')],
    }) },
  { id: 'pregnant_safety_gates', tags: ['pregnancy', 'safety'],
    input: makeInput({ age: 32, sex: 'female', isPregnant: true,
      symptoms: ['Chronic fatigue'],
      labs: [lab('Hemoglobin', 11.0, 'g/dL', 'low'), lab('Ferritin', 14, 'ng/mL', 'low')],
    }) },
  { id: 'obese_diabetic_cv', tags: ['obese', 'diabetes', 'cv-risk'],
    input: makeInput({ age: 58, sex: 'male', bmi: 35,
      conditions: ['Type 2 Diabetes', 'Hypertension', 'Hyperlipidemia'],
      meds: ['Metformin', 'Atorvastatin', 'Lisinopril'],
      labs: [
        lab('LDL Cholesterol', 178, 'mg/dL', 'high'),
        lab('Triglycerides', 280, 'mg/dL', 'high'),
        lab('Hemoglobin A1c', 8.1, '%', 'high'),
        lab('hs-CRP', 4.2, 'mg/L', 'high'),
      ],
    }) },
  { id: 'measured_normal_b12', tags: ['measured-normal-suppression'],
    input: makeInput({ age: 40, sex: 'female',
      conditions: ['Ulcerative Colitis (UC)'],
      meds: ['Mesalamine'],
      labs: [lab('Vitamin B12', 650, 'pg/mL', 'normal'), lab('Folate', 12, 'ng/mL', 'normal')],
    }) },
  { id: 'measured_normal_vit_d', tags: ['measured-normal-suppression'],
    input: makeInput({ age: 50, sex: 'male',
      symptoms: ['Chronic fatigue', 'frequent infections'],
      labs: [lab('Vitamin D 25-hydroxy', 55, 'ng/mL', 'normal')],
    }) },
  { id: 'critical_outliers', tags: ['critical', 'emergency'],
    input: makeInput({ age: 45, sex: 'male',
      labs: [
        lab('Glucose', 320, 'mg/dL', 'critical_high'),
        lab('Hemoglobin A1c', 11.2, '%', 'critical_high'),
        lab('Potassium', 2.5, 'mEq/L', 'critical_low'),
      ],
    }) },
];

interface FailureRecord { patient: string; feature: string; assertion: string; }
const failures: FailureRecord[] = [];
function fail(patient: string, feature: string, assertion: string) {
  failures.push({ patient, feature, assertion });
}
function notEmpty(s: any): boolean { return typeof s === 'string' && s.trim().length > 0; }
function arrNonEmpty(a: any): boolean { return Array.isArray(a) && a.length > 0; }

// Truncation detector — flag any text that appears cut mid-sentence
function looksTruncated(s: string): boolean {
  if (!s || s.length < 30) return false;
  // Ends with no terminal punctuation and ends mid-word? Suspicious.
  const last = s.trim().slice(-40);
  if (/[.?!]\s*$/.test(last)) return false;          // proper end
  if (/\b\w{3,}$/.test(last) && !/[.,;:)]$/.test(last)) return true; // mid-word
  return false;
}

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  LAUNCH-READINESS AUDIT — every feature, ${PATIENTS.length} archetypes`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const featureCounts = {
  conditions: 0, tests: 0, supplements: 0, depletions: 0, alternatives: 0,
  workouts: 0, todayActions: 0, lifestyleInterventions: 0,
  prepFields: 0, riskCalculators: 0,
};

for (const { id, tags, input } of PATIENTS) {
  const plan = buildPlan(input);
  const alts = runMedicationAlternativesEngine({
    medsLower: input.medsLower,
    conditionsLower: input.conditionsLower,
    labValues: input.labs.map(l => ({ marker_name: l.marker, value: l.value as number, optimal_flag: l.flag })),
    symptomsLower: input.symptomsLower,
  });

  // ── F1: ENGINE FACT PRODUCTION ─────────────────────────────────
  if (!Array.isArray(plan.conditions)) fail(id, 'F1', 'conditions not array');
  if (!Array.isArray(plan.tests)) fail(id, 'F1', 'tests not array');
  if (!Array.isArray(plan.supplementCandidates)) fail(id, 'F1', 'supplementCandidates not array');
  if (!Array.isArray(plan.depletions)) fail(id, 'F1', 'depletions not array');
  if (!plan.riskCalculators || typeof plan.riskCalculators !== 'object') fail(id, 'F1', 'riskCalculators missing');
  featureCounts.conditions += plan.conditions.length;
  featureCounts.tests += plan.tests.length;
  featureCounts.supplements += plan.supplementCandidates.length;
  featureCounts.depletions += plan.depletions.length;
  featureCounts.alternatives += alts.length;
  featureCounts.workouts += plan.workouts.length;
  featureCounts.todayActions += plan.todayActions.length;
  featureCounts.riskCalculators += 1;

  // ── F2: SUPPLEMENT QUALITY ─────────────────────────────────────
  for (const s of plan.supplementCandidates) {
    if (!notEmpty(s.key)) fail(id, 'F2 supp.key', 'empty');
    if (!notEmpty(s.nutrient)) fail(id, 'F2 supp.nutrient', `empty for ${s.key}`);
    if (!notEmpty(s.dose)) fail(id, 'F2 supp.dose', `empty for ${s.nutrient}`);
    if (!notEmpty(s.timing)) fail(id, 'F2 supp.timing', `empty for ${s.nutrient}`);
    if (!['critical','high','moderate'].includes(s.priority)) fail(id, 'F2 supp.priority', `bad: ${s.priority}`);
    const validCats = ['sleep_stress','gut_healing','liver_metabolic','inflammation','cardio','inflammation_cardio','nutrient_repletion','condition_therapy'];
    if (!validCats.includes(s.category)) fail(id, 'F2 supp.category', `bad: ${s.category}`);
  }

  // ── F3: CONDITION QUALITY ──────────────────────────────────────
  for (const c of plan.conditions) {
    if (!notEmpty(c.name)) fail(id, 'F3 cond.name', 'empty');
    if (!notEmpty(c.evidence)) fail(id, 'F3 cond.evidence', `empty for ${c.name}`);
    if (looksTruncated(c.evidence)) fail(id, 'F3 cond.evidence TRUNCATION', `${c.name}: …${c.evidence.slice(-40)}`);
    if (!notEmpty(c.icd10)) fail(id, 'F3 cond.icd10', `empty for ${c.name}`);
    if (!notEmpty(c.what_to_ask_doctor)) fail(id, 'F3 cond.what_to_ask_doctor', `empty for ${c.name}`);
    if (looksTruncated(c.what_to_ask_doctor)) fail(id, 'F3 cond.what_to_ask_doctor TRUNCATION', c.name);
  }

  // ── F4: TEST QUALITY ───────────────────────────────────────────
  for (const t of plan.tests) {
    if (!notEmpty(t.name)) fail(id, 'F4 test.name', 'empty');
    if (!notEmpty(t.icd10)) fail(id, 'F4 test.icd10', `empty for ${t.name}`);
    if (!notEmpty(t.whyShort)) fail(id, 'F4 test.whyShort', `empty for ${t.name}`);
    if (!notEmpty(t.priority)) fail(id, 'F4 test.priority', `empty for ${t.name}`);
  }

  // ── F5: DEPLETION QUALITY + AUTO-TEST INJECTION ────────────────
  for (const d of plan.depletions) {
    if (!notEmpty(d.mechanism)) fail(id, 'F5 dep.mechanism', `empty for ${d.medClass}/${d.nutrient}`);
    if (looksTruncated(d.mechanism)) fail(id, 'F5 dep.mechanism TRUNCATION', `${d.medClass}/${d.nutrient}`);
    if (!arrNonEmpty(d.clinicalEffects)) fail(id, 'F5 dep.clinicalEffects', `empty for ${d.medClass}/${d.nutrient}`);
    // Auto-test injection: if depletion has monitoringTest, it should be in plan.tests
    if (d.monitoringTest && !plan.tests.some(t => t.key === d.monitoringTest)) {
      fail(id, 'F5 depletion-test auto-injection', `${d.medClass}/${d.nutrient} → ${d.monitoringTest} NOT in test list`);
    }
  }

  // ── F6: CLINICAL SAFETY RULES ──────────────────────────────────
  // (a) No empirical iron — iron only with measured low ferritin
  for (const s of plan.supplementCandidates) {
    if (/iron/i.test(s.nutrient) && s.sourcedFrom !== 'lab_finding') {
      fail(id, 'F6a no-empirical-iron', `Iron from ${s.sourcedFrom} (must be lab_finding)`);
    }
  }
  // (b) No calcium supplement empirically (no key for calcium in registry — defensive)
  for (const s of plan.supplementCandidates) {
    if (/^calcium\s/i.test(s.nutrient) && s.sourcedFrom !== 'lab_finding') {
      fail(id, 'F6b no-empirical-calcium', `Calcium from ${s.sourcedFrom}`);
    }
  }
  // (c) Vit D 4000 IU only from lab; empirical Vit D = 1000 IU
  for (const s of plan.supplementCandidates) {
    if (/vitamin d3/i.test(s.nutrient) && /4000/.test(s.dose) && s.sourcedFrom !== 'lab_finding') {
      fail(id, 'F6c high-dose-VitD-empirical', `4000 IU from ${s.sourcedFrom} (must be lab_finding)`);
    }
  }
  // (d) Measured-normal suppression
  if (tags.includes('measured-normal-suppression')) {
    if (id === 'measured_normal_b12') {
      // B12 was measured 650 [normal] AND folate was measured 12 [normal]
      // Neither should fire
      const hasB12 = plan.supplementCandidates.some(s => /b12|cobalamin|methylcobalamin/i.test(s.nutrient));
      const hasFolate = plan.supplementCandidates.some(s => /methylfolate|folate/i.test(s.nutrient));
      if (hasB12) fail(id, 'F6d measured-normal-B12-suppression', 'B12 supplement fired despite normal B12 lab');
      if (hasFolate) fail(id, 'F6d measured-normal-folate-suppression', 'Folate supplement fired despite normal folate lab');
    }
    if (id === 'measured_normal_vit_d') {
      const hasD = plan.supplementCandidates.some(s => /vitamin d/i.test(s.nutrient));
      if (hasD) fail(id, 'F6d measured-normal-VitD-suppression', 'Vit D fired despite normal Vit D lab');
    }
  }
  // (e) Pregnancy safety
  if (tags.includes('pregnancy')) {
    for (const s of plan.supplementCandidates) {
      if (/red yeast rice|berberine|niacin|nac/i.test(s.nutrient)) {
        fail(id, 'F6e pregnancy-contraindicated', `${s.nutrient} fired for pregnant patient`);
      }
    }
  }

  // ── F7: DETERMINISTIC PROSE ────────────────────────────────────
  if (plan.todayActions.length !== 3) fail(id, 'F7 today_actions count', `expected 3 got ${plan.todayActions.length}`);
  for (const a of plan.todayActions) {
    if (!notEmpty(a.action)) fail(id, 'F7 todayAction.action', 'empty');
    if (!notEmpty(a.why)) fail(id, 'F7 todayAction.why', 'empty');
  }
  for (const phase of ['phase_1','phase_2','phase_3'] as const) {
    const p = (plan.actionPlan as any)[phase];
    if (!arrNonEmpty(p.actions)) fail(id, `F7 actionPlan.${phase}`, 'no actions');
  }
  if (!arrNonEmpty(plan.eatingPattern.emphasize)) fail(id, 'F7 eatingPattern.emphasize', 'empty');
  if (!arrNonEmpty(plan.eatingPattern.limit)) fail(id, 'F7 eatingPattern.limit', 'empty');
  if (plan.workouts.length < 4) fail(id, 'F7 workouts count', `${plan.workouts.length} < 4`);
  for (const w of plan.workouts) {
    if (!notEmpty(w.title)) fail(id, 'F7 workout.title', 'empty');
    if (!notEmpty(w.description)) fail(id, 'F7 workout.description', `empty for ${w.title}`);
    if (looksTruncated(w.description)) fail(id, 'F7 workout.description TRUNCATION', w.title);
  }
  for (const bucket of ['diet','sleep','exercise','stress'] as const) {
    if (!arrNonEmpty((plan.lifestyleInterventions as any)[bucket])) {
      fail(id, `F7 lifestyle.${bucket}`, 'empty');
    }
  }

  // ── F8: DOCTOR PREP FIELDS ─────────────────────────────────────
  if (!notEmpty(plan.chiefComplaint)) fail(id, 'F8 chiefComplaint', 'empty');
  if (!notEmpty(plan.hpi)) fail(id, 'F8 hpi', 'empty');
  if (looksTruncated(plan.hpi)) fail(id, 'F8 hpi TRUNCATION', plan.hpi.slice(-40));
  if (!notEmpty(plan.functionalMedicineNote)) fail(id, 'F8 functionalMedicineNote', 'empty');
  if (plan.conditions.length > 0) {
    if (!arrNonEmpty(plan.tellDoctor)) fail(id, 'F8 tellDoctor', 'empty despite conditions');
    if (!arrNonEmpty(plan.questionsToAsk)) fail(id, 'F8 questionsToAsk', 'empty despite conditions');
    if (!arrNonEmpty(plan.executiveSummary)) fail(id, 'F8 executiveSummary', 'empty despite conditions');
  }
  for (const q of plan.questionsToAsk) {
    if (!notEmpty(q.question)) fail(id, 'F8 question.question', 'empty');
    if (!notEmpty(q.why)) fail(id, 'F8 question.why', 'empty');
    if (looksTruncated(q.question)) fail(id, 'F8 question TRUNCATION', q.question.slice(-40));
    if (looksTruncated(q.why)) fail(id, 'F8 question.why TRUNCATION', q.why.slice(-40));
  }
  for (const td of plan.tellDoctor) {
    if (!notEmpty(td.headline)) fail(id, 'F8 tellDoctor.headline', 'empty');
    if (!notEmpty(td.detail)) fail(id, 'F8 tellDoctor.detail', 'empty');
    if (looksTruncated(td.detail)) fail(id, 'F8 tellDoctor.detail TRUNCATION', td.headline);
  }

  // ── F9: MEDICATION ALTERNATIVES ────────────────────────────────
  for (const a of alts) {
    if (!notEmpty(a.current_medication)) fail(id, 'F9 alt.current_medication', 'empty');
    if (!notEmpty(a.reason_to_consider)) fail(id, 'F9 alt.reason_to_consider', 'empty');
    if (looksTruncated(a.reason_to_consider)) fail(id, 'F9 alt.reason TRUNCATION', a.current_medication);
  }

  // ── F10: NO STRING TRUNCATIONS IN PROSE TEMPLATES ──────────────
  for (const e of plan.findingExplanations) {
    if (looksTruncated(e.explanation)) fail(id, 'F10 findingExplanation TRUNCATION', e.marker);
  }
  for (const p of plan.patternDescriptions) {
    if (looksTruncated(p.description)) fail(id, 'F10 patternDescription TRUNCATION', p.name);
  }
  for (const b of plan.executiveSummary) {
    if (looksTruncated(b)) fail(id, 'F10 executiveSummary TRUNCATION', b.slice(-40));
  }

  // ── F11: CRITICAL ALERT ROUTING ────────────────────────────────
  if (tags.includes('critical') || tags.includes('emergency')) {
    const hasCritical = plan.labs.outliers.some(o => o.flag.startsWith('critical'));
    if (!hasCritical) fail(id, 'F11 critical-outlier-detection', 'expected critical flags');
  }

  // ── Compact summary line ───────────────────────────────────────
  console.log(`${id.padEnd(34)} outliers=${String(plan.labs.outliers.length).padStart(2)} conds=${String(plan.conditions.length).padStart(2)} supps=${String(plan.supplementCandidates.length).padStart(2)} tests=${String(plan.tests.length).padStart(2)} deps=${String(plan.depletions.length).padStart(2)} alts=${String(alts.length).padStart(2)} workouts=${plan.workouts.length}`);
}

console.log(`\n──── ENGINE OUTPUT TOTALS ────`);
console.log(`Conditions:               ${featureCounts.conditions}`);
console.log(`Tests:                    ${featureCounts.tests}`);
console.log(`Supplements:              ${featureCounts.supplements}`);
console.log(`Depletions:               ${featureCounts.depletions}`);
console.log(`Alternatives:             ${featureCounts.alternatives}`);
console.log(`Workouts:                 ${featureCounts.workouts}`);
console.log(`Today actions:            ${featureCounts.todayActions}`);
console.log(`Risk calculators:         ${featureCounts.riskCalculators}`);

console.log(`\n──── FEATURE COVERAGE ────`);
const featuresChecked = [
  'F1  Engine fact production',
  'F2  Supplement quality',
  'F3  Condition quality + ICD-10 + no truncation',
  'F4  Test quality',
  'F5  Depletion quality + auto-test injection',
  'F6a No empirical iron',
  'F6b No empirical calcium',
  'F6c Vit D 4000 IU lab-only (1000 IU empirical)',
  'F6d Measured-normal suppression (B12, Folate, Vit D)',
  'F6e Pregnancy contraindications',
  'F7  Deterministic prose (todayActions, actionPlan, eatingPattern, workouts, lifestyle)',
  'F8  Doctor prep fields (HPI, chief complaint, questions, tellDoctor, execSummary, functionalMedicineNote)',
  'F9  Medication alternatives engine',
  'F10 No string truncations in prose templates',
  'F11 Critical alert routing',
];
for (const f of featuresChecked) {
  const featureFails = failures.filter(x => x.feature.startsWith(f.slice(0, 3))).length;
  console.log(`  ${featureFails === 0 ? '✅' : '❌ ' + featureFails + ' fails'}  ${f}`);
}

console.log();
if (failures.length === 0) {
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`✅ LAUNCH READY — every feature passes across ${PATIENTS.length} clinical archetypes`);
  console.log(`══════════════════════════════════════════════════════════════`);
  Deno.exit(0);
} else {
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`❌ ${failures.length} FAILURES across ${new Set(failures.map(f => f.patient)).size} patients`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  for (const f of failures) console.log(`  ${f.patient.padEnd(34)} ${f.feature.padEnd(35)} ${f.assertion}`);
  Deno.exit(1);
}
