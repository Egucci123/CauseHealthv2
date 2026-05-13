// PLAN SCHEMA CONTRACT
// =====================
// Locks the structure of wellness_plans.plan_data and
// doctor_prep_documents.document_data. Validates against:
//   1. A synthetic plan generated locally (catches code regressions)
//   2. The latest production plans pulled read-only from the DB
//      (catches AI / serialization drift in deployed Edge Functions)
//
// Run: deno run -A --allow-env supabase/functions/_shared/__tests__/plan-schema-contract.ts
//
// CI / pre-deploy: run after every engine change. A failing contract
// means the surface no longer renders what the engine produced — the
// exact class of bug that buried multi_marker_patterns: [] for weeks.

// ── Minimal schema validator (no external deps) ─────────────────────
type Schema =
  | { kind: 'string'; minLen?: number; allowEmpty?: boolean }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'array'; minItems?: number; items?: Schema }
  | { kind: 'object'; props: Record<string, Schema>; optional?: string[] }
  | { kind: 'union'; any: Schema[] };

function validate(value: unknown, schema: Schema, path = '$'): string[] {
  const errors: string[] = [];
  switch (schema.kind) {
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: expected string, got ${typeof value}`); break; }
      if (!schema.allowEmpty && value.length === 0) errors.push(`${path}: empty string not allowed`);
      if (schema.minLen != null && value.length < schema.minLen) errors.push(`${path}: string shorter than ${schema.minLen}`);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) { errors.push(`${path}: expected number, got ${typeof value}`); break; }
      if (schema.min != null && value < schema.min) errors.push(`${path}: ${value} below ${schema.min}`);
      if (schema.max != null && value > schema.max) errors.push(`${path}: ${value} above ${schema.max}`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${typeof value}`);
      break;
    case 'null':
      if (value !== null) errors.push(`${path}: expected null, got ${typeof value}`);
      break;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected array, got ${typeof value}`); break; }
      if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: array length ${value.length} < ${schema.minItems}`);
      if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items!, `${path}[${i}]`)));
      break;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${value === null ? 'null' : typeof value}`); break;
      }
      const obj = value as Record<string, unknown>;
      const optional = new Set(schema.optional ?? []);
      for (const [k, sub] of Object.entries(schema.props)) {
        if (!(k in obj)) {
          if (!optional.has(k)) errors.push(`${path}.${k}: missing required key`);
          continue;
        }
        errors.push(...validate(obj[k], sub, `${path}.${k}`));
      }
      break;
    }
    case 'union': {
      const allErrs: string[][] = schema.any.map(s => validate(value, s, path));
      if (allErrs.some(e => e.length === 0)) break; // passes one branch
      errors.push(`${path}: matched none of ${schema.any.length} union branches: ${allErrs[0].join(', ')}`);
      break;
    }
  }
  return errors;
}

// ── Schemas ─────────────────────────────────────────────────────────

const NULL_OR = (kind: Schema): Schema => ({ kind: 'union', any: [kind, { kind: 'null' }] });
const STR = (allowEmpty = false): Schema => ({ kind: 'string', allowEmpty });
const NUM: Schema = { kind: 'number' };
const BOOL: Schema = { kind: 'boolean' };
const ARR = (items?: Schema): Schema => ({ kind: 'array', items });

const SUSPECTED_CONDITION: Schema = {
  kind: 'object',
  props: {
    name: STR(),
    icd10: STR(true),
    category: STR(),
    evidence: STR(),
    confidence: STR(),
    confirmatory_tests: ARR(),
  },
  optional: ['key', '_key', 'what_to_ask_doctor', 'source'],
};

const SUPPLEMENT: Schema = {
  kind: 'object',
  props: {
    nutrient: STR(),
    dose: STR(),
    form: STR(),
    timing: STR(true),
    category: STR(),
    priority: STR(),
    sourced_from: STR(),
  },
  // 'key' is on all post-2026-05-12 plans but missing on legacy data.
  optional: ['key', 'emoji', 'why', 'why_short', 'whyShort', 'alternatives', 'evidence_note', 'practical_note', 'evidenceNote', 'practicalNote', 'trigger_severity_rank', 'triggerSeverityRank', 'sourcedFrom'],
};

const TEST_ORDER: Schema = {
  kind: 'object',
  props: {
    test_name: STR(),
    icd10_primary: STR(true),
    why_short: STR(true),
  },
  optional: ['_key', 'emoji', 'priority', 'specialist', '_specialist', 'icd10_description', 'insurance_note', 'clinical_justification'],
};

const MULTI_MARKER_PATTERN: Schema = {
  kind: 'object',
  props: {
    name: STR(),
    description: STR(),
  },
  optional: ['markers', 'severity', 'category'],
};

const WELLNESS_PLAN_SCHEMA: Schema = {
  kind: 'object',
  props: {
    headline: STR(),
    summary: STR(),
    plan_version: STR(),
    plan_mode: STR(),
    generated_at: STR(),
    facts_hash: STR(),
    disclaimer: STR(),
    is_optimization_mode: BOOL,

    // Clinical surfaces
    suspected_conditions: ARR(SUSPECTED_CONDITION),
    supplement_stack: ARR(SUPPLEMENT),
    multi_marker_patterns: ARR(MULTI_MARKER_PATTERN),
    medication_depletions: ARR(),
    retest_timeline: ARR(),
    suboptimal_flags: ARR(),
    interaction_warnings: ARR(),
    emergency_alerts: ARR(),
    symptoms_addressed: ARR(),

    // Action surfaces
    action_plan: { kind: 'object', props: {}, optional: [] },
    today_actions: ARR(),
    workouts: ARR(),
    lifestyle_interventions: { kind: 'object', props: {}, optional: [] },
    eating_pattern: { kind: 'object', props: {}, optional: [] },
    prep_instructions: NULL_OR(ARR()),
    // Production shape: goal_targets is an array. Older plans may use object.
    goal_targets: NULL_OR({ kind: 'union', any: [ARR(), { kind: 'object', props: {}, optional: [] }] }),
    risk_calculators: NULL_OR({ kind: 'union', any: [{ kind: 'object', props: {}, optional: [] }, ARR()] }),

    // Misc
    progress_summary: NULL_OR(STR(true)),
    crisis_alert: NULL_OR({ kind: 'union', any: [STR(true), { kind: 'object', props: {}, optional: [] }] }),
    citations: ARR(),
  },
  // medication_alternatives is on all post-2026-05-12 plans. Missing on
  // legacy data; treat as optional rather than failing old rows.
  optional: ['medication_alternatives'],
};

const DOCTOR_PREP_SCHEMA: Schema = {
  kind: 'object',
  props: {
    headline: STR(),
    chief_complaint: STR(),
    hpi: STR(),
    // Production renders pmh as a semicolon-joined string for display.
    pmh: { kind: 'union', any: [STR(true), ARR()] },
    bmi: NULL_OR(NUM),
    bmi_category: NULL_OR(STR(true)),
    document_date: STR(),
    generated_at: STR(),
    _version: STR(),
    _facts_hash: STR(true),

    // Clinical surfaces
    possible_conditions: ARR(SUSPECTED_CONDITION),
    tests_to_request: ARR(TEST_ORDER),
    discussion_points: ARR(STR()),
    medications: ARR(),
    medication_depletions: ARR(),
    medication_alternatives: ARR(),

    // Patient-facing prose
    lab_summary: { kind: 'object', props: {}, optional: [] },
    tell_doctor: ARR(),
    questions_to_ask: ARR(),
    executive_summary: ARR(STR()),
    patient_questions: ARR(STR()),
    review_of_systems: NULL_OR({ kind: 'union', any: [STR(true), { kind: 'object', props: {}, optional: [] }, ARR()] }),
    prep_instructions: NULL_OR({ kind: 'union', any: [STR(true), ARR()] }),
    canonical_prose: NULL_OR({ kind: 'union', any: [STR(true), { kind: 'object', props: {}, optional: [] }] }),
    functional_medicine_note: NULL_OR(STR(true)),
    advanced_screening: NULL_OR({ kind: 'union', any: [{ kind: 'object', props: {}, optional: [] }, ARR()] }),

    // Misc
    emergency_alerts: ARR(),
    risk_calculators: NULL_OR({ kind: 'union', any: [{ kind: 'object', props: {}, optional: [] }, ARR()] }),
    goal_targets: NULL_OR({ kind: 'union', any: [ARR(), { kind: 'object', props: {}, optional: [] }] }),
    crisis_alert: NULL_OR({ kind: 'union', any: [STR(true), { kind: 'object', props: {}, optional: [] }] }),
  },
  optional: [],
};

// ── Validation runner ───────────────────────────────────────────────

interface ValidationCase { label: string; data: unknown; schema: Schema; }

async function pullLatestPlansFromDB(): Promise<ValidationCase[]> {
  const token = Deno.env.get('SUPABASE_MGMT_TOKEN');
  const projectRef = Deno.env.get('SUPABASE_PROJECT_REF') ?? 'iywyoolqhzdfreksgbbk';
  if (!token) {
    console.log('  (skipping production validation — set SUPABASE_MGMT_TOKEN to fetch live plans)\n');
    return [];
  }
  const cases: ValidationCase[] = [];
  const queries = [
    { label: 'wellness_plans', sql: "SELECT plan_data, created_at FROM wellness_plans ORDER BY created_at DESC LIMIT 5", schema: WELLNESS_PLAN_SCHEMA, field: 'plan_data' },
    { label: 'doctor_prep_documents', sql: "SELECT document_data, created_at FROM doctor_prep_documents ORDER BY created_at DESC LIMIT 5", schema: DOCTOR_PREP_SCHEMA, field: 'document_data' },
  ];
  for (const q of queries) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q.sql }),
    });
    const rows = await res.json();
    if (!Array.isArray(rows)) { console.log(`  ⚠️ ${q.label} query failed:`, rows); continue; }
    rows.forEach((r: any, i: number) => {
      cases.push({ label: `[live] ${q.label}#${i} (${r.created_at?.slice(0, 10)})`, data: r[q.field], schema: q.schema });
    });
  }
  return cases;
}

// ── Synthetic test plan — small deterministic shape ─────────────────
// Mirrors what generate-wellness-plan-v2 emits for a Tim-shaped input.
// Used to validate the contract WITHOUT running the live Edge Function.
function syntheticWellnessPlan(): unknown {
  return {
    headline: 'Bilirubin pattern + obesity workup.',
    summary: 'Your bilirubin is elevated with otherwise normal liver enzymes — a classic Gilbert pattern. BMI 41 raises NAFLD and metabolic syndrome risk.',
    plan_version: 'test-v0',
    plan_mode: 'treatment',
    generated_at: new Date().toISOString(),
    facts_hash: 'test_hash',
    disclaimer: 'Educational tool. Not medical advice.',
    is_optimization_mode: false,
    suspected_conditions: [{
      name: 'Gilbert syndrome rule-out', icd10: 'E80.4', category: 'gi',
      evidence: 'Total bilirubin 1.3 mg/dL with normal ALT, AST, AlkPhos.',
      confidence: 'moderate', confirmatory_tests: ['Bilirubin fractionation', 'Fasting bilirubin repeat'],
    }],
    supplement_stack: [{
      key: 'omega3_2000', nutrient: 'Omega-3 (EPA/DHA)', dose: '2000 mg/day',
      form: 'Triglyceride-form softgel', timing: 'With largest meal',
      category: 'cardio', priority: 'moderate', sourced_from: 'symptom_pattern',
    }],
    multi_marker_patterns: [{ name: 'Gilbert syndrome rule-out', description: 'Isolated bili elevation.' }],
    medication_depletions: [], medication_alternatives: [], retest_timeline: [],
    suboptimal_flags: [], interaction_warnings: [], emergency_alerts: [], symptoms_addressed: [],
    action_plan: { phase_1: { name: '', focus: '', actions: [] } },
    today_actions: [{ action: 'Schedule PCP visit' }],
    workouts: [],
    lifestyle_interventions: { diet: [], sleep: [], exercise: [], stress: [] },
    eating_pattern: { name: 'Mediterranean', rationale: '', emphasize: [], limit: [] },
    prep_instructions: null, goal_targets: [], risk_calculators: null,
    progress_summary: null, crisis_alert: null, citations: [],
  };
}

function syntheticDoctorPrep(): unknown {
  return {
    headline: 'Bilirubin pattern + obesity workup.',
    chief_complaint: 'Follow-up for elevated Total Bilirubin.',
    hpi: '41-year-old male, BMI 41 (obese class 3) with anxiety, depression, psoriasis, OSA.',
    pmh: 'Anxiety; Depression; Psoriasis; Sleep Apnea',
    bmi: 41, bmi_category: 'obese_3',
    document_date: '2026-05-13', generated_at: new Date().toISOString(),
    _version: 'test-v0', _facts_hash: 'test_hash',
    possible_conditions: [{
      name: 'Gilbert syndrome rule-out', icd10: 'E80.4', category: 'gi',
      evidence: 'Isolated bilirubin elevation.', confidence: 'moderate', confirmatory_tests: [],
    }],
    tests_to_request: [{ test_name: 'CMP', icd10_primary: 'Z00.00', why_short: 'Baseline' }],
    discussion_points: ['Discuss BMI / GLP-1 candidacy.'],
    medications: [], medication_depletions: [], medication_alternatives: [],
    lab_summary: { other_abnormal: [], urgent_findings: [] },
    tell_doctor: [], questions_to_ask: [],
    executive_summary: ['Bilirubin pattern.'],
    patient_questions: ['What does Gilbert syndrome mean?'],
    review_of_systems: null, prep_instructions: null, canonical_prose: null,
    functional_medicine_note: null, advanced_screening: null,
    emergency_alerts: [], risk_calculators: null, goal_targets: [], crisis_alert: null,
  };
}

// ── Main ────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  PLAN SCHEMA CONTRACT — wellness_plan + doctor_prep');
console.log('══════════════════════════════════════════════════════════════\n');

const cases: ValidationCase[] = [
  { label: '[synth] wellness_plan',       data: syntheticWellnessPlan(), schema: WELLNESS_PLAN_SCHEMA },
  { label: '[synth] doctor_prep',         data: syntheticDoctorPrep(),   schema: DOCTOR_PREP_SCHEMA },
  ...(await pullLatestPlansFromDB()),
];

let totalErrors = 0;
for (const c of cases) {
  const errs = validate(c.data, c.schema);
  if (errs.length === 0) {
    console.log(`✅ ${c.label}`);
  } else {
    totalErrors += errs.length;
    console.log(`❌ ${c.label} — ${errs.length} contract violations:`);
    for (const e of errs.slice(0, 10)) console.log(`     ${e}`);
    if (errs.length > 10) console.log(`     … and ${errs.length - 10} more`);
  }
}

console.log(`\n──── SUMMARY ────`);
console.log(`Cases validated : ${cases.length}`);
console.log(`Total errors    : ${totalErrors}\n`);
if (totalErrors === 0) {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('✅ All plan envelopes conform to the contract.');
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(0);
} else {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`❌ ${totalErrors} contract violations — stored plans diverged from schema.`);
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(1);
}
