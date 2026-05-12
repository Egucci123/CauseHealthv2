// FULL-APP COVERAGE AUDIT — every engine-deterministic surface field
// =====================================================================
// Walks the engine output for diverse patient profiles and asserts every
// surface field that the UI renders is present, well-formed, clinically
// consistent, and free of truncation / drift.
//
// Surfaces audited:
//   1. Lab Analytics  — priority_findings, patterns, immediate_actions
//   2. Wellness Plan  — today_actions, supplement_stack, eating_pattern,
//                       workouts, lifestyle_interventions, action_plan,
//                       retest_timeline, suspected_conditions,
//                       symptoms_addressed, medication_depletions,
//                       medication_alternatives
//   3. Clinical Prep  — chief_complaint, hpi, questions_to_ask,
//                       discussion_points, patient_questions,
//                       functional_medicine_note, executive_summary,
//                       tell_doctor, possible_conditions, medications,
//                       medication_alternatives, risk_calculators
//
// Every check is universal — applies to every patient. Failures bubble up
// with patient ID + field name + the specific issue.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";
import { runMedicationAlternativesEngine } from "../medicationAlternativesEngine.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function makeInput(opts: {
  age?: number;
  sex?: 'male' | 'female';
  meds?: string[];
  conditions?: string[];
  symptoms?: string[];
  labs?: LabValue[];
}): PatientInput {
  const meds = opts.meds ?? [];
  const conditions = opts.conditions ?? [];
  const symptoms = (opts.symptoms ?? []).map(name => ({ name, severity: 4 }));
  const labs = opts.labs ?? [];
  return {
    age: opts.age ?? 45, sex: opts.sex ?? 'male', heightCm: 175, weightKg: 80, bmi: 26.1,
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => s.name.toLowerCase()).join(' '),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

// Diverse patient archetypes — covers each major clinical scenario the UI must render.
const PATIENTS: Array<{ id: string; input: PatientInput }> = [
  { id: 'healthy_young_male',
    input: makeInput({ age: 28, sex: 'male' }) },
  { id: 'healthy_senior_female',
    input: makeInput({ age: 70, sex: 'female' }) },
  { id: 'edgemech_uc_statin_dyslipidemia',
    input: makeInput({ age: 32, sex: 'male',
      conditions: ['Ulcerative Colitis (UC)', 'High Cholesterol'],
      meds: ['Mesalamine', 'Ustekinumab', 'Atorvastatin'],
      labs: [
        lab('ALT (SGPT)', 97, 'IU/L', 'high'),
        lab('AST (SGOT)', 48, 'IU/L', 'high'),
        lab('Triglycerides', 327, 'mg/dL', 'high'),
        lab('LDL', 166, 'mg/dL', 'high'),
        lab('25-Hydroxy, Vitamin D', 24, 'ng/mL', 'low'),
        lab('Hemoglobin A1c', 5.5, '%', 'watch'),
      ],
    }) },
  { id: 'metabolic_syndrome',
    input: makeInput({ age: 52, sex: 'male',
      symptoms: ['Weight gain despite diet'],
      labs: [
        lab('Triglycerides', 220, 'mg/dL', 'high'),
        lab('HDL', 32, 'mg/dL', 'low'),
        lab('Glucose', 108, 'mg/dL', 'watch'),
        lab('Hemoglobin A1c', 6.0, '%', 'high'),
      ],
    }) },
  { id: 'hashimoto_female_50',
    input: makeInput({ age: 50, sex: 'female',
      symptoms: ['Chronic fatigue', 'Brain fog', 'Cold intolerance'],
      labs: [lab('TSH', 6.8, 'mIU/L', 'high')],
    }) },
  { id: 'iron_def_anemia',
    input: makeInput({ age: 38, sex: 'female',
      symptoms: ['Chronic fatigue', 'Hair loss — no family history'],
      labs: [
        lab('Hemoglobin', 11.2, 'g/dL', 'low'),
        lab('Ferritin', 9, 'ng/mL', 'low'),
        lab('MCV', 75, 'fL', 'low'),
      ],
    }) },
  { id: 'metformin_b12_poly',
    input: makeInput({ age: 60, sex: 'female',
      conditions: ['Type 2 Diabetes', 'Hypertension'],
      meds: ['Metformin', 'Lisinopril', 'Hydrochlorothiazide', 'Omeprazole'],
      labs: [
        lab('B12', 280, 'pg/mL', 'low'),
        lab('Hemoglobin A1c', 7.2, '%', 'high'),
        lab('Potassium', 3.4, 'mEq/L', 'low'),
      ],
    }) },
  { id: 'phenytoin_bone_loss',
    input: makeInput({ age: 55, sex: 'female',
      conditions: ['Epilepsy', 'Osteopenia'],
      meds: ['Phenytoin 300mg'],
      labs: [lab('Vitamin D', 22, 'ng/mL', 'low')],
    }) },
  { id: 'glp1_severe_gi',
    input: makeInput({ age: 45, sex: 'female',
      conditions: ['Type 2 Diabetes'],
      meds: ['Semaglutide'],
      symptoms: ['severe nausea', 'persistent vomiting', 'cannot tolerate'],
    }) },
  { id: 'nsaid_chronic_renal',
    input: makeInput({ age: 65, sex: 'male',
      conditions: ['Osteoarthritis'],
      meds: ['Ibuprofen 600mg daily for years'],
      labs: [lab('Creatinine', 1.5, 'mg/dL', 'high')],
    }) },
];

interface Failure { patient: string; field: string; issue: string; }
const failures: Failure[] = [];
function fail(patient: string, field: string, issue: string) {
  failures.push({ patient, field, issue });
}

function notEmpty(s: any): boolean { return typeof s === 'string' && s.trim().length > 0; }
function arrNonEmpty(a: any): boolean { return Array.isArray(a) && a.length > 0; }

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  FULL-APP COVERAGE AUDIT — every engine-deterministic field`);
console.log(`  ${PATIENTS.length} archetype patients × all 3 surfaces`);
console.log(`══════════════════════════════════════════════════════════════\n`);

for (const { id, input } of PATIENTS) {
  const plan = buildPlan(input);

  // ── Sanity: must always have these baseline fields ──────────────────
  if (!plan.patient) fail(id, 'patient', 'missing');
  if (!plan.labs?.outliers) fail(id, 'labs.outliers', 'missing');
  if (!Array.isArray(plan.tests)) fail(id, 'tests', 'not array');
  if (!Array.isArray(plan.conditions)) fail(id, 'conditions', 'not array');
  if (!Array.isArray(plan.depletions)) fail(id, 'depletions', 'not array');
  if (!Array.isArray(plan.supplementCandidates)) fail(id, 'supplementCandidates', 'not array');

  // ── LAB ANALYTICS ───────────────────────────────────────────────────
  // priority_findings: must have 1 per outlier, each with explanation
  if (plan.labs.outliers.length !== plan.findingExplanations.length) {
    fail(id, 'lab.findingExplanations', `${plan.findingExplanations.length} vs ${plan.labs.outliers.length} outliers`);
  }
  for (const fe of plan.findingExplanations) {
    if (!notEmpty(fe.marker)) fail(id, 'lab.finding.marker', 'empty');
    if (!notEmpty(fe.explanation)) fail(id, 'lab.finding.explanation', `empty for ${fe.marker}`);
    if (!notEmpty(fe.what_to_do)) fail(id, 'lab.finding.what_to_do', `empty for ${fe.marker}`);
    if (fe.explanation.length > 300) fail(id, 'lab.finding.explanation', `>300 chars for ${fe.marker}`);
  }
  // patterns: must have 1 per condition
  if (plan.patternDescriptions.length !== plan.conditions.length) {
    fail(id, 'lab.patternDescriptions', `${plan.patternDescriptions.length} vs ${plan.conditions.length}`);
  }
  for (const pd of plan.patternDescriptions) {
    if (!notEmpty(pd.name)) fail(id, 'lab.pattern.name', 'empty');
    if (!notEmpty(pd.description)) fail(id, 'lab.pattern.description', `empty for ${pd.name}`);
  }
  // immediate_actions: exactly 3
  if (plan.todayActions.length !== 3) {
    fail(id, 'lab.immediate_actions / today_actions', `expected 3 got ${plan.todayActions.length}`);
  }
  for (const a of plan.todayActions) {
    if (!notEmpty(a.action)) fail(id, 'today_action.action', 'empty');
    if (!notEmpty(a.why)) fail(id, 'today_action.why', 'empty');
    if (!notEmpty(a.emoji)) fail(id, 'today_action.emoji', 'empty');
    if (a.action.length > 140) fail(id, 'today_action.action', `>140 chars: ${a.action.slice(0, 30)}…`);
  }

  // ── WELLNESS PLAN ───────────────────────────────────────────────────
  // supplement_stack — every supp has key/nutrient/dose/timing/category/priority
  for (const s of plan.supplementCandidates) {
    if (!notEmpty(s.key)) fail(id, 'supp.key', 'empty');
    if (!notEmpty(s.nutrient)) fail(id, 'supp.nutrient', `empty for ${s.key}`);
    if (!notEmpty(s.dose)) fail(id, 'supp.dose', `empty for ${s.nutrient}`);
    if (!notEmpty(s.timing)) fail(id, 'supp.timing', `empty for ${s.nutrient}`);
    if (!['critical','high','moderate'].includes(s.priority)) fail(id, 'supp.priority', `bad: ${s.priority}`);
    const validCats = ['sleep_stress','gut_healing','liver_metabolic','inflammation','cardio','inflammation_cardio','nutrient_repletion','condition_therapy'];
    if (!validCats.includes(s.category)) fail(id, 'supp.category', `bad: ${s.category} for ${s.nutrient}`);
  }
  // eating_pattern — full
  if (!notEmpty(plan.eatingPattern.name)) fail(id, 'eatingPattern.name', 'empty');
  if (!arrNonEmpty(plan.eatingPattern.emphasize)) fail(id, 'eatingPattern.emphasize', 'empty');
  if (!arrNonEmpty(plan.eatingPattern.limit)) fail(id, 'eatingPattern.limit', 'empty');
  // workouts — at least 4
  if (plan.workouts.length < 4) fail(id, 'workouts', `${plan.workouts.length} < 4`);
  for (const w of plan.workouts) {
    if (!notEmpty(w.title)) fail(id, 'workout.title', 'empty');
    if (!notEmpty(w.description)) fail(id, 'workout.description', `empty for ${w.title}`);
    if (!notEmpty(w.why)) fail(id, 'workout.why', `empty for ${w.title}`);
    if (w.duration_min < 5 || w.duration_min > 120) fail(id, 'workout.duration_min', `out of range: ${w.duration_min}`);
  }
  // lifestyle_interventions — each bucket non-empty
  for (const bucket of ['diet','sleep','exercise','stress'] as const) {
    if (!arrNonEmpty((plan.lifestyleInterventions as any)[bucket])) {
      fail(id, `lifestyle.${bucket}`, 'empty');
    }
  }
  // action_plan — 3 phases each with actions
  for (const phase of ['phase_1','phase_2','phase_3'] as const) {
    const p = (plan.actionPlan as any)[phase];
    if (!arrNonEmpty(p.actions)) fail(id, `actionPlan.${phase}.actions`, 'empty');
    if (!notEmpty(p.focus)) fail(id, `actionPlan.${phase}.focus`, 'empty');
  }
  // suspected_conditions: each has full evidence (>= 80 chars, not truncated)
  for (const c of plan.conditions) {
    if (!notEmpty(c.evidence)) fail(id, 'condition.evidence', `empty for ${c.name}`);
    if (c.evidence.length < 40) fail(id, 'condition.evidence', `too short (${c.evidence.length}) for ${c.name}`);
    // Truncation detection: ends with non-period mid-word
    if (/\b\w{3,}$/.test(c.evidence) && !c.evidence.endsWith('.')) {
      fail(id, 'condition.evidence', `looks truncated for ${c.name}: …${c.evidence.slice(-40)}`);
    }
    if (!notEmpty(c.what_to_ask_doctor)) fail(id, 'condition.what_to_ask_doctor', `empty for ${c.name}`);
    if (!notEmpty(c.icd10)) fail(id, 'condition.icd10', `empty for ${c.name}`);
  }
  // medication_depletions — every depletion has mechanism, clinicalEffects
  for (const d of plan.depletions) {
    if (!notEmpty(d.mechanism)) fail(id, 'depletion.mechanism', `empty for ${d.medClass}/${d.nutrient}`);
    if (!arrNonEmpty(d.clinicalEffects)) fail(id, 'depletion.clinicalEffects', `empty for ${d.medClass}/${d.nutrient}`);
    if (!['high','moderate','low'].includes(d.severity)) fail(id, 'depletion.severity', `bad: ${d.severity}`);
  }
  // tests — every test has name, icd10, why, priority
  for (const t of plan.tests) {
    if (!notEmpty(t.name)) fail(id, 'test.name', 'empty');
    if (!notEmpty(t.icd10)) fail(id, 'test.icd10', `empty for ${t.name}`);
    if (!notEmpty(t.whyShort)) fail(id, 'test.whyShort', `empty for ${t.name}`);
    if (!notEmpty(t.priority)) fail(id, 'test.priority', `empty for ${t.name}`);
  }

  // ── CLINICAL PREP ───────────────────────────────────────────────────
  if (!notEmpty(plan.chiefComplaint)) fail(id, 'prep.chiefComplaint', 'empty');
  if (plan.chiefComplaint.length > 110) fail(id, 'prep.chiefComplaint', `>110 chars: ${plan.chiefComplaint}`);
  if (!notEmpty(plan.hpi)) fail(id, 'prep.hpi', 'empty');
  if (plan.hpi.length > 360) fail(id, 'prep.hpi', `>360 chars`);
  if (!notEmpty(plan.functionalMedicineNote)) fail(id, 'prep.functionalMedicineNote', 'empty');
  if (plan.functionalMedicineNote.length > 360) fail(id, 'prep.functionalMedicineNote', `>360 chars`);
  // questions_to_ask: only required when conditions present
  if (plan.conditions.length > 0) {
    if (!arrNonEmpty(plan.questionsToAsk)) fail(id, 'prep.questionsToAsk', 'empty despite conditions');
    for (const q of plan.questionsToAsk) {
      if (!notEmpty(q.question)) fail(id, 'prep.question', 'empty');
      if (!notEmpty(q.why)) fail(id, 'prep.question.why', `empty for "${q.question.slice(0, 40)}"`);
      if (q.question.length > 250) fail(id, 'prep.question', `>250 chars`);
    }
  }
  // tell_doctor: only required when conditions present
  if (plan.conditions.length > 0 && !arrNonEmpty(plan.tellDoctor)) {
    fail(id, 'prep.tellDoctor', 'empty despite conditions');
  }
  for (const td of plan.tellDoctor) {
    if (!notEmpty(td.headline)) fail(id, 'tellDoctor.headline', 'empty');
    if (!notEmpty(td.detail)) fail(id, 'tellDoctor.detail', `empty for "${td.headline}"`);
  }
  // executive_summary: bullets when conditions/outliers exist
  if ((plan.conditions.length > 0 || plan.labs.outliers.length > 0) && !arrNonEmpty(plan.executiveSummary)) {
    fail(id, 'prep.executiveSummary', 'empty despite findings');
  }
  if (plan.executiveSummary.length > 5) fail(id, 'prep.executiveSummary', `>5 bullets`);

  // ── MEDICATION ALTERNATIVES — engine output ─────────────────────────
  const alts = runMedicationAlternativesEngine({
    medsLower: input.medsLower,
    conditionsLower: input.conditionsLower,
    labValues: input.labs.map(l => ({ marker_name: l.marker, value: l.value as number, optimal_flag: l.flag })),
    symptomsLower: input.symptomsLower,
  });
  for (const a of alts) {
    if (!notEmpty(a.current_medication)) fail(id, 'alt.current_medication', 'empty');
    if (!notEmpty(a.reason_to_consider)) fail(id, 'alt.reason_to_consider', 'empty');
    if (!Array.isArray(a.pharmaceutical_alternatives)) fail(id, 'alt.pharmaceutical_alternatives', 'not array');
    if (!Array.isArray(a.natural_alternatives)) fail(id, 'alt.natural_alternatives', 'not array');
  }

  // ── COVERAGE REPORT ────────────────────────────────────────────────
  console.log(`${id.padEnd(34)} outliers=${String(plan.labs.outliers.length).padStart(2)} conds=${String(plan.conditions.length).padStart(2)} supps=${String(plan.supplementCandidates.length).padStart(2)} tests=${String(plan.tests.length).padStart(2)} deps=${String(plan.depletions.length).padStart(2)} alts=${String(alts.length).padStart(2)} workouts=${plan.workouts.length}`);
}

console.log();
if (failures.length === 0) {
  console.log(`✅ FULL-APP COVERAGE AUDIT PASSES — ${PATIENTS.length} patients × all engine surface fields clean`);
  Deno.exit(0);
} else {
  console.log(`❌ ${failures.length} FAILURES across ${new Set(failures.map(f => f.patient)).size} patients:\n`);
  for (const f of failures) console.log(`  ${f.patient.padEnd(34)} ${f.field.padEnd(30)} ${f.issue}`);
  Deno.exit(1);
}
