// watchFlagParity.test.ts
// ──────────────────────────────────────────────────────────────────────
// Frontend↔Backend parity audit for watch / out-of-range flag logic.
//
// Why this exists: the frontend stamps `optimal_flag` on a lab_value at
// UPLOAD time (in src/store/labUploadStore.ts → checkWatchList). The
// backend's analysis-time engine recomputes the same flag from current
// rules (supabase/functions/_shared/optimalRanges.ts → getRulesForPatient).
// The lab analytics page reads the stored stamp, so any drift between
// these two rule sets shows the user a stale flag.
//
// Real-world failure mode (Evan, 2026-05-15): frontend rule was
// `value >= 1.0` for hs-CRP, backend `value > 1.0`. Exact-1.0 stamped
// 'watch' at upload but the analysis-time recompute said 'healthy'. The
// lab analytics page showed 'watch' for a perfectly normal value.
//
// What this audit checks:
//   For every backend watch rule, probe the boundary at threshold ± ε.
//   The frontend's checkWatchList must agree with backend's recompute
//   at every probe point. Disagreement = stale-flag bug waiting to
//   happen on real user data.

// ── Mirror of the BACKEND rules in optimalRanges.ts ───────────────────
// Maintain side-by-side with that file. Each entry: regex (matches lab
// marker name), low / high optional, sex restriction optional. Audit
// just probes the boundary; it doesn't enumerate every regex variant.
interface BackendRule {
  name: string;        // human-readable label for failure output
  marker: string;      // exact marker name we feed into the frontend rule
  low?: number;
  high?: number;
  sex: 'male' | 'female' | 'either';
  age?: number;        // for age-stratified rules
}

const BACKEND_WATCH_RULES: BackendRule[] = [
  { name: 'A1c',                  marker: 'Hemoglobin A1c',         high: 5.4,  sex: 'either' },
  { name: 'Fasting glucose',      marker: 'Glucose, Serum',         high: 90,   sex: 'either' },
  { name: 'Triglycerides',        marker: 'Triglycerides',          high: 100,  sex: 'either' },
  { name: 'HDL — male',           marker: 'HDL Cholesterol',        low: 50,    sex: 'male' },
  { name: 'HDL — female',         marker: 'HDL Cholesterol',        low: 60,    sex: 'female' },
  { name: 'hs-CRP',               marker: 'C-Reactive Protein',     high: 1.0,  sex: 'either' },
  { name: 'TSH (high)',           marker: 'TSH',                    high: 2.0,  sex: 'either' },
  { name: 'B12',                  marker: 'Vitamin B12',            low: 500,   sex: 'either' },
  { name: 'Uric acid — male',     marker: 'Uric Acid',              high: 6.0,  sex: 'male' },
  { name: 'Uric acid — female',   marker: 'Uric Acid',              high: 5.0,  sex: 'female' },
  { name: 'Vit D 25-OH',          marker: '25-Hydroxy Vitamin D',   low: 40,    sex: 'either' },
  { name: 'Ferritin — male',      marker: 'Ferritin',               low: 75,    sex: 'male' },
  { name: 'Ferritin — female<50', marker: 'Ferritin',               low: 50,    sex: 'female', age: 35 },
  { name: 'Ferritin — female50+', marker: 'Ferritin',               low: 75,    sex: 'female', age: 60 },
  { name: 'Testosterone — male≤40', marker: 'Testosterone, Total',  low: 600,   sex: 'male',   age: 30 },
  { name: 'Testosterone — male>40', marker: 'Testosterone, Total',  low: 500,   sex: 'male',   age: 50 },
  { name: 'MCV',                  marker: 'MCV',                    low: 88,    sex: 'either' },
  { name: 'MCH',                  marker: 'MCH',                    low: 28,    sex: 'either' },
  { name: 'MCHC',                 marker: 'MCHC',                   low: 33,    sex: 'either' },
  { name: 'RDW',                  marker: 'RDW',                    high: 13.0, sex: 'either' },
];

// ── Inline copy of the frontend checkWatchList logic (Deno can't import
//    .ts from src/ without bundling, and we want this audit fully
//    self-contained). Maintain alongside the real implementation. ─────
function frontendCheckWatchList(
  value: number,
  markerName: string,
  sex?: string | null,
  age?: number | null,
): string | null {
  const n = (markerName ?? '').toLowerCase();
  const isMale = sex === 'male';
  const isFemale = sex === 'female';

  if (/\b(hba1c|hemoglobin a1c|a1c)\b/.test(n) && value > 5.4 && value <= 5.6) return 'A1c';
  if ((/fasting glucose/.test(n) || /^glucose/.test(n) || /glucose,? serum/.test(n)) && value > 90 && value <= 99) return 'glucose';
  if (/(apolipoprotein b|\bapo\s*b\b|apob)/.test(n) && value > 90) return 'apob';
  if (/triglyceride/.test(n) && value > 100 && value < 150) return 'tg';
  if (/(\bhdl\b|hdl cholesterol)/.test(n)) {
    const lowFloor = isMale ? 50 : isFemale ? 60 : 50;
    if (value < lowFloor && value >= 40) return 'hdl';
  }
  if (/(\bhs-?crp\b|\bcrp\b|c-reactive protein|high sensitivity c)/.test(n) && value > 1.0 && value < 3) return 'crp';
  if (/homocysteine/.test(n) && value >= 10 && value < 15) return 'homocysteine';
  if (/uric acid/.test(n)) {
    const highCeil = isMale ? 6.0 : isFemale ? 5.0 : 6.0;
    if (value > highCeil && value < 8) return 'uricacid';
  }
  if (/(vitamin d|25-oh|25-hydroxy)/.test(n) && value >= 30 && value < 40) return 'vitd';
  if (/^ferritin/.test(n)) {
    const ageNum = age ?? 35;
    const lowFloor = isMale ? 75 : (ageNum >= 50 ? 75 : 50);
    if (value < lowFloor && value >= 30) return 'ferritin';
  }
  if (/\btsh\b|thyroid stimulating/.test(n) && value > 2.0 && value <= 2.5) return 'tsh';
  if (isMale && /\btestosterone\b/.test(n) && !/free|shbg/.test(n)) {
    const ageNum = age ?? 35;
    const lowFloor = ageNum <= 40 ? 600 : 500;
    if (value < lowFloor && value >= 264) return 'testosterone';
  }
  if (/\bvitamin b[\s-]?12\b|^b12$|cobalamin\b/.test(n) && value < 500 && value >= 232) return 'b12';
  if (/^mcv$|mean corpuscular volume/.test(n) && value < 88 && value >= 79) return 'mcv';
  if (/^mch$(?!c)|mean corpuscular hemoglobin(?! concentration)/.test(n) && value < 28 && value >= 26.6) return 'mch';
  if (/^mchc$|mean corpuscular hemoglobin concentration/.test(n) && value < 33 && value >= 31.5) return 'mchc';
  if (/^rdw(?:[-\s]*cv)?$|red cell distribution width/.test(n) && value > 13.0 && value <= 15.4) return 'rdw';
  return null;
}

// ── Backend recompute equivalent (mirror of optimalRanges.ts logic).
//    Uses strict > / < per the backend's `lowMiss = val < rule.low` and
//    `highMiss = val > rule.high`. ──
function backendIsWatch(rule: BackendRule, value: number): boolean {
  if (rule.low !== undefined && value < rule.low) return true;
  if (rule.high !== undefined && value > rule.high) return true;
  return false;
}

// ── Probe each backend rule at the boundary ± epsilon ────────────────
interface Failure { rule: string; probe: number; frontendWatch: boolean; backendWatch: boolean; }
const failures: Failure[] = [];

const EPSILON_CANDIDATES = [0.01, 0.1, 1];

for (const rule of BACKEND_WATCH_RULES) {
  // Choose epsilon based on the threshold's magnitude
  const threshold = rule.low ?? rule.high!;
  const eps = EPSILON_CANDIDATES.find(e => e < Math.abs(threshold) * 0.5) ?? 0.01;
  const probes = [threshold - eps, threshold, threshold + eps];

  for (const v of probes) {
    const fe = frontendCheckWatchList(v, rule.marker, rule.sex === 'either' ? null : rule.sex, rule.age) !== null;
    const be = backendIsWatch(rule, v);
    if (fe !== be) {
      failures.push({ rule: rule.name, probe: v, frontendWatch: fe, backendWatch: be });
    }
  }
}

// ── Flag-taxonomy parity check ───────────────────────────────────────
// Frontend canonical set: critical_high, critical_low, high, low, watch, healthy.
// Backend recomputeFlag must return values from this exact set — any
// other value (e.g. legacy 'suboptimal_high' / 'normal') silently fails
// downstream filters that match by flag name.
const FRONTEND_CANONICAL_FLAGS = new Set(['critical_high', 'critical_low', 'high', 'low', 'watch', 'healthy', 'unknown']);

// Import the live backend recompute. If it ever drifts, this test trips.
const { recomputeFlag } = await import('../optimalRanges.ts');

interface TaxonomyProbe { name: string; lab: any; ctx: any; }
const TAXONOMY_PROBES: TaxonomyProbe[] = [
  // Watch-tier values (should return 'watch', not 'suboptimal_*' or 'normal')
  { name: 'A1c 5.5 (in-range but above watch threshold)',
    lab: { marker_name: 'Hemoglobin A1c', value: 5.5, standard_flag: 'normal' },
    ctx: { age: 30, sex: 'male' } },
  { name: 'CRP 1.5 (watch-tier moderate CV)',
    lab: { marker_name: 'C-Reactive Protein', value: 1.5, standard_flag: 'normal' },
    ctx: { age: 30, sex: 'male' } },
  { name: 'MCV 85 (low-normal microcytic signal)',
    lab: { marker_name: 'MCV', value: 85, standard_flag: 'normal' },
    ctx: { age: 30, sex: 'male' } },
  // Healthy values (should return 'healthy', not 'normal')
  { name: 'A1c 5.0 (squarely healthy)',
    lab: { marker_name: 'Hemoglobin A1c', value: 5.0, standard_flag: 'normal' },
    ctx: { age: 30, sex: 'male' } },
  { name: 'TSH 1.5 (healthy mid-range)',
    lab: { marker_name: 'TSH', value: 1.5, standard_flag: 'normal' },
    ctx: { age: 30, sex: 'male' } },
  // Out-of-range — preserved from lab's own flag
  { name: 'Hgb 6 (critical_low from lab)',
    lab: { marker_name: 'Hemoglobin', value: 6, standard_flag: 'critical_low' },
    ctx: { age: 30, sex: 'male' } },
  { name: 'ALT 97 (high from lab)',
    lab: { marker_name: 'ALT', value: 97, standard_flag: 'high' },
    ctx: { age: 30, sex: 'male' } },
];

const taxonomyFailures: string[] = [];
for (const p of TAXONOMY_PROBES) {
  const result = recomputeFlag(p.lab, p.ctx);
  if (!FRONTEND_CANONICAL_FLAGS.has(result)) {
    taxonomyFailures.push(`  ❌ ${p.name}\n     backend returned: ${result} (not in canonical set)`);
  }
}

console.log('======================================================');
console.log('  WATCH-FLAG PARITY — frontend stamp = backend recompute');
console.log('======================================================');
console.log(`  Rules probed: ${BACKEND_WATCH_RULES.length}`);
console.log(`  Boundary disagreements: ${failures.length}`);
console.log(`  Flag-taxonomy probes: ${TAXONOMY_PROBES.length}`);
console.log(`  Taxonomy failures: ${taxonomyFailures.length}`);
if (taxonomyFailures.length > 0) {
  console.log('');
  for (const f of taxonomyFailures) console.log(f);
  console.log('');
  console.log('  Backend recomputeFlag must return a value from the frontend canonical set:');
  console.log('  { critical_high, critical_low, high, low, watch, healthy, unknown }');
  console.log('  Fix: align recomputeFlag in supabase/functions/_shared/optimalRanges.ts.');
  Deno.exit(1);
}
if (failures.length > 0) {
  console.log('');
  for (const f of failures) {
    console.log(`  ❌ ${f.rule.padEnd(28)}  @${f.probe.toString().padEnd(7)}  frontend=${f.frontendWatch ? 'watch' : 'healthy'}  backend=${f.backendWatch ? 'watch' : 'healthy'}`);
  }
  console.log('');
  console.log('  Each disagreement is a stale-flag bug waiting to happen — the');
  console.log('  user uploads a value at this threshold, the frontend stamps one');
  console.log('  flag, the backend would compute the other, and the lab analytics');
  console.log('  page shows whichever the upload happened to stamp.');
  console.log('  Fix: align operator/threshold in checkWatchList (src/store/labUploadStore.ts).');
  Deno.exit(1);
}
console.log('  ✅ Every backend rule matches frontend stamp at boundary ± epsilon.');
