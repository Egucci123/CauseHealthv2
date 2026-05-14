// pdf-coverage.test.ts
// ──────────────────────────────────────────────────────────────────────
// Every field the engine emits should either:
//   (a) be rendered by one of the PDF exporters (exportWellnessPlanPDF,
//       exportPatientVisitGuidePDF, exportDoctorPrepPDF), OR
//   (b) be explicitly allow-listed as "intentionally screen-only".
//
// Why this exists: the wellness plan PDF was only rendering 4 of ~14
// user-facing wellness fields, and the doctor-prep PDF was missing
// hpi / pmh / bmi / tell_doctor / questions_to_ask / executive_summary /
// patient_questions / prep_instructions / functional_medicine_note /
// emergency_alerts. Users downloading their plan got a truncated copy
// of what they saw on screen.
//
// Strategy: read exportPDF.ts as text, then grep for snake_case OR
// camelCase reference to each engine field. If zero references, fail.
// Mirrors engine-ui-coverage.test.ts but scoped to the PDF surface only.

// Same canonical key lists as engine-ui-coverage.test.ts. Keep in sync.
const WELLNESS_FIELDS = [
  'headline', 'summary', 'plan_mode',
  'suspected_conditions', 'supplement_stack', 'multi_marker_patterns',
  'medication_depletions', 'retest_timeline', 'suboptimal_flags',
  'interaction_warnings', 'emergency_alerts', 'symptoms_addressed',
  'action_plan', 'today_actions', 'workouts', 'lifestyle_interventions',
  'eating_pattern', 'prep_instructions', 'goal_targets', 'risk_calculators',
  'progress_summary', 'crisis_alert', 'medication_alternatives',
];

const DOCTOR_PREP_FIELDS = [
  'headline', 'chief_complaint', 'hpi', 'pmh', 'bmi', 'bmi_category',
  'possible_conditions', 'tests_to_request', 'discussion_points',
  'medications', 'medication_depletions', 'medication_alternatives',
  'lab_summary', 'tell_doctor', 'questions_to_ask', 'executive_summary',
  'patient_questions', 'review_of_systems', 'prep_instructions',
  'functional_medicine_note', 'advanced_screening', 'emergency_alerts',
];

// Fields that are deliberately screen-only (not in the PDF). Document
// the rationale next to each so future readers know why.
const SCREEN_ONLY_WELLNESS = new Set<string>([
  // Tracking-only widget — PDF is a snapshot, motion/animation doesn't
  // serialize; the on-screen progress story is its own surface.
  'progress_summary',
  // 90-day action plan IS rendered; phase content covers it. Today
  // actions are a separate UI widget for daily use.
  'today_actions',
]);
const SCREEN_ONLY_DOCTORPREP = new Set<string>([
  // Tabs render canonical_prose-style content via possible_conditions
  // evidence + supplement why-strings. PDF renders the structured fields
  // directly; canonical_prose was kept off-PDF intentionally.
  // (No exclusions here today — every field should appear in PDF.)
]);

function findExportPDF(): string {
  const cwd = Deno.cwd();
  const candidates = [`${cwd}/src/lib/exportPDF.ts`, `${cwd}/causehealth/src/lib/exportPDF.ts`];
  for (const p of candidates) {
    try { Deno.statSync(p); return p; } catch { /* try next */ }
  }
  throw new Error(`Could not find exportPDF.ts from cwd=${cwd}`);
}

const SRC = await Deno.readTextFile(findExportPDF());

// Split the file into per-function bodies so we can attribute references
// to the specific exporter that owns them.
function functionBody(name: string): string {
  const start = SRC.indexOf(`export function ${name}`);
  if (start < 0) return '';
  // Find the closing brace at column 0 of a later line (these are top-
  // level functions). Walk forward counting braces.
  let i = SRC.indexOf('{', start);
  if (i < 0) return '';
  let depth = 1;
  i++;
  while (i < SRC.length && depth > 0) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(start, i);
}

const WELLNESS_BODY = functionBody('exportWellnessPlanPDF');
const VISIT_BODY = functionBody('exportPatientVisitGuidePDF');
const PREP_BODY = functionBody('exportDoctorPrepPDF');

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function referenced(field: string, body: string): boolean {
  if (!body) return false;
  const re = new RegExp(`\\b(${field}|${camel(field)})\\b`);
  return re.test(body);
}

interface Miss { field: string; exporter: 'wellness' | 'doctorprep' | 'both' }
const missing: Miss[] = [];

// Wellness fields — must appear in exportWellnessPlanPDF
for (const f of WELLNESS_FIELDS) {
  if (SCREEN_ONLY_WELLNESS.has(f)) continue;
  if (!referenced(f, WELLNESS_BODY)) missing.push({ field: f, exporter: 'wellness' });
}

// Doctor-prep fields — must appear in exportDoctorPrepPDF (or the patient
// visit guide, which is a companion PDF).
for (const f of DOCTOR_PREP_FIELDS) {
  if (SCREEN_ONLY_DOCTORPREP.has(f)) continue;
  if (!referenced(f, PREP_BODY) && !referenced(f, VISIT_BODY)) {
    missing.push({ field: f, exporter: 'doctorprep' });
  }
}

console.log('======================================================');
console.log('  PDF COVERAGE — every engine field in the PDF too');
console.log('======================================================');
console.log(`  Wellness fields audited: ${WELLNESS_FIELDS.length - SCREEN_ONLY_WELLNESS.size}`);
console.log(`  Doctor-prep fields audited: ${DOCTOR_PREP_FIELDS.length - SCREEN_ONLY_DOCTORPREP.size}`);
console.log(`  Missing from PDF: ${missing.length}`);
if (missing.length > 0) {
  console.log('');
  for (const m of missing) console.log(`  ❌ ${m.field.padEnd(28)}  (${m.exporter} PDF)`);
  console.log('');
  console.log('  Each missing field is rendered on-screen but the user gets nothing');
  console.log('  for it in the downloaded PDF. Fix: add to the relevant exporter,');
  console.log('  or add to SCREEN_ONLY_* with a comment.');
  Deno.exit(1);
}
console.log('  ✅ Every engine-emitted field reaches the PDF exporters.');
