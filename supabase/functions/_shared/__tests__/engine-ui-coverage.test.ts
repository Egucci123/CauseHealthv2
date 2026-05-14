// engine-ui-coverage.test.ts
// ──────────────────────────────────────────────────────────────────────
// Every field the engine emits in a wellness plan MUST have at least one
// consumer in the React frontend. This audit guarantees we never again
// quietly produce a field that the UI ignores — the bug that hid
// emergency_alerts, multi_marker_patterns, suboptimal_flags, etc. from
// users for weeks.
//
// Strategy:
//   1. Enumerate every top-level key the schema contract validates
//      (these are the fields the engine promises to populate).
//   2. For each key, recursively grep the `src/` tree for *any*
//      reference — direct field access, destructure, type indexing,
//      prop name. If zero references, fail.
//   3. Tunable allow-list for keys that are intentionally internal
//      (e.g., `_facts_hash`, `_version`) and never meant to surface.
//
// Run: deno run -A --allow-read supabase/functions/_shared/__tests__/engine-ui-coverage.test.ts

// ── Engine-emitted top-level keys (mirror of plan-schema-contract.ts) ──
// Maintain this list in sync with WELLNESS_PLAN_SCHEMA + DOCTOR_PREP_SCHEMA.
// New engine field? Add it here AND wire it into the UI.
const WELLNESS_PLAN_KEYS = [
  'headline', 'summary', 'plan_version', 'plan_mode', 'generated_at',
  'facts_hash', 'disclaimer', 'is_optimization_mode',
  'suspected_conditions', 'supplement_stack', 'multi_marker_patterns',
  'medication_depletions', 'retest_timeline', 'suboptimal_flags',
  'interaction_warnings', 'emergency_alerts', 'symptoms_addressed',
  'action_plan', 'today_actions', 'workouts', 'lifestyle_interventions',
  'eating_pattern', 'prep_instructions', 'goal_targets', 'risk_calculators',
  'progress_summary', 'crisis_alert', 'citations', 'medication_alternatives',
];

const DOCTOR_PREP_KEYS = [
  'headline', 'chief_complaint', 'hpi', 'pmh', 'bmi', 'bmi_category',
  'document_date', 'generated_at',
  'possible_conditions', 'tests_to_request', 'discussion_points',
  'medications', 'medication_depletions', 'medication_alternatives',
  'lab_summary', 'tell_doctor', 'questions_to_ask', 'executive_summary',
  'patient_questions', 'review_of_systems', 'prep_instructions',
  'canonical_prose', 'functional_medicine_note', 'advanced_screening',
  'emergency_alerts',
];

// ── Keys that are intentionally NOT user-facing ──────────────────────
// These are routing metadata / internal coordination fields that the UI
// should never render. They're checked by the schema contract for shape
// but not required to be displayed.
const ALLOW_INTERNAL = new Set([
  'plan_version', 'facts_hash', '_facts_hash', '_version',
  'is_optimization_mode',
  'generated_at',
  'document_date',
  'citations', // engine sets citations: [] but doesn't populate; reserved for future use.
  // canonical_prose: bundle of pre-rendered narratives for conditions,
  // outliers, supplements, goals, alerts. The content it carries is
  // already rendered through individual surfaces (suspected_conditions
  // evidence, supplement_stack why-strings, emergency_alerts message,
  // goal_targets deltaText). Keeping it in the engine output as a
  // future-proofing hook for unified-narrative rendering, but not a
  // user-facing field today.
  'canonical_prose',
]);

// ── Search corpus: every .ts/.tsx file under src/ ─────────────────────
// Resolve src/ from the current working directory. The audit must be
// run from the causehealth project root (where `src/` lives next to
// `supabase/`). Falls back to two candidate paths so the script works
// both from `causehealth/` and from the repo root.
function findSrcRoot(): string {
  const cwd = Deno.cwd();
  const candidates = [`${cwd}/src`, `${cwd}/causehealth/src`];
  for (const c of candidates) {
    try { Deno.statSync(c); return c; } catch { /* try next */ }
  }
  throw new Error(`Could not locate src/ from cwd=${cwd}. Run from the causehealth/ directory.`);
}

const SRC_ROOT = findSrcRoot();

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      yield* walk(child);
    } else if (/\.(t|j)sx?$/.test(entry.name)) {
      yield child;
    }
  }
}

async function loadCorpus(): Promise<string> {
  const parts: string[] = [];
  for await (const path of walk(SRC_ROOT)) {
    try { parts.push(await Deno.readTextFile(path)); }
    catch { /* skip */ }
  }
  return parts.join('\n');
}

// Convert snake_case to camelCase for the "is this referenced in some
// React prop/destructure?" check.
function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

async function audit() {
  const corpus = await loadCorpus();
  const allKeys = new Set([...WELLNESS_PLAN_KEYS, ...DOCTOR_PREP_KEYS]);

  const missing: { key: string; surface: string }[] = [];
  for (const key of allKeys) {
    if (ALLOW_INTERNAL.has(key)) continue;
    const camelKey = camel(key);
    // Look for snake_case OR camelCase reference anywhere in src/.
    // Word-boundary protects against false matches (e.g. plain "pmh" as
    // part of "comp_h" — using \b ensures "pmh" as a token).
    const re = new RegExp(`\\b(${key}|${camelKey})\\b`);
    if (!re.test(corpus)) {
      const surface = WELLNESS_PLAN_KEYS.includes(key)
        ? (DOCTOR_PREP_KEYS.includes(key) ? 'both' : 'wellness')
        : 'doctorprep';
      missing.push({ key, surface });
    }
  }

  console.log('======================================================');
  console.log(`  ENGINE → UI COVERAGE`);
  console.log('======================================================');
  console.log(`  Plan keys audited: ${allKeys.size}`);
  console.log(`  Internal (allow-listed, not user-facing): ${ALLOW_INTERNAL.size}`);
  console.log(`  Orphan fields (engine emits, UI never reads): ${missing.length}`);
  if (missing.length > 0) {
    console.log('');
    for (const m of missing) {
      console.log(`  ❌ ${m.key.padEnd(28)}  (${m.surface})  — no reference found in src/`);
    }
    console.log('');
    console.log('  To fix: either render this field somewhere in src/, or add it to');
    console.log('  ALLOW_INTERNAL with a comment explaining why it stays hidden.');
    Deno.exit(1);
  }
  console.log('  ✅ Every engine-emitted field is referenced by the UI.');
}

await audit();
