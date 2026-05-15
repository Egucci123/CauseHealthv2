// recompute-optimal-flags.ts
// ──────────────────────────────────────────────────────────────────────
// One-shot universal recompute of lab_values.optimal_flag for every row
// in the database. Pulls each row + the patient's profile (sex, age),
// runs the same checkWatchList rules the frontend uses post-2026-05-15,
// and UPDATEs rows where the stored stamp disagrees with the recompute.
//
// Why this exists: the optimal_flag column is stamped at UPLOAD time.
// When watch rules change (operator drift, new markers added), existing
// rows keep their stale stamps. The lab analytics page reads the stored
// stamp, so users see flags from rules that no longer exist. This
// migration brings every row up to date with the current rule set.
//
// Run: deno run -A --allow-net causehealth/scripts/recompute-optimal-flags.ts

const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF') ?? 'iywyoolqhzdfreksgbbk';
const TOKEN = Deno.env.get('SUPABASE_ACCESS_TOKEN');
if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN env var (the sbp_* personal access token).');
  console.error('  Example: SUPABASE_ACCESS_TOKEN=sbp_xxx deno run -A scripts/recompute-optimal-flags.ts');
  Deno.exit(2);
}
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function q(sql: string): Promise<any[]> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Same rules as src/store/labUploadStore.ts checkWatchList. Keep in sync. ──
function checkWatchList(value: number, markerName: string, sex: string | null, age: number | null): string | null {
  const n = (markerName ?? '').toLowerCase();
  const isMale = sex === 'male';
  const isFemale = sex === 'female';
  if (/\b(hba1c|hemoglobin a1c|a1c)\b/.test(n) && value > 5.4 && value <= 5.6) return 'watch';
  if ((/fasting glucose/.test(n) || /^glucose/.test(n) || /glucose,? serum/.test(n)) && value > 90 && value <= 99) return 'watch';
  if (/(apolipoprotein b|\bapo\s*b\b|apob)/.test(n) && value > 90) return 'watch';
  if (/triglyceride/.test(n) && value > 100 && value < 150) return 'watch';
  if (/(\bhdl\b|hdl cholesterol)/.test(n)) {
    const lowFloor = isMale ? 50 : isFemale ? 60 : 50;
    if (value < lowFloor && value >= 40) return 'watch';
  }
  if (/(\bhs-?crp\b|\bcrp\b|c-reactive protein|high sensitivity c)/.test(n) && value > 1.0 && value < 3) return 'watch';
  if (/homocysteine/.test(n) && value >= 10 && value < 15) return 'watch';
  if (/uric acid/.test(n)) {
    const highCeil = isMale ? 6.0 : isFemale ? 5.0 : 6.0;
    if (value > highCeil && value < 8) return 'watch';
  }
  if (/(vitamin d|25-oh|25-hydroxy)/.test(n) && value >= 30 && value < 40) return 'watch';
  if (/^ferritin/.test(n)) {
    const ageNum = age ?? 35;
    const lowFloor = isMale ? 75 : (ageNum >= 50 ? 75 : 50);
    if (value < lowFloor && value >= 30) return 'watch';
  }
  if (/\btsh\b|thyroid stimulating/.test(n) && value > 2.0 && value <= 2.5) return 'watch';
  if (isMale && /\btestosterone\b/.test(n) && !/free|shbg/.test(n)) {
    const ageNum = age ?? 35;
    const lowFloor = ageNum <= 40 ? 600 : 500;
    if (value < lowFloor && value >= 264) return 'watch';
  }
  if (/\bvitamin b[\s-]?12\b|^b12$|cobalamin\b/.test(n) && value < 500 && value >= 232) return 'watch';
  if (/^mcv$|mean corpuscular volume/.test(n) && value < 88 && value >= 79) return 'watch';
  if (/^mch$(?!c)|mean corpuscular hemoglobin(?! concentration)/.test(n) && value < 28 && value >= 26.6) return 'watch';
  if (/^mchc$|mean corpuscular hemoglobin concentration/.test(n) && value < 33 && value >= 31.5) return 'watch';
  if (/^rdw(?:[-\s]*cv)?$|red cell distribution width/.test(n) && value > 13.0 && value <= 15.4) return 'watch';
  return null;
}

// Mirror of frontend computeFlag — stdLow/stdHigh dominate, watch fires only inside std range.
function recomputeFlag(value: number, stdLow: number | null, stdHigh: number | null, marker: string, sex: string | null, age: number | null, higherIsBetter: boolean): string {
  if (stdLow == null && stdHigh == null) return 'unknown';
  if (stdHigh != null && value > stdHigh) {
    if (higherIsBetter) return 'healthy';
    const margin = (value - stdHigh) / Math.max(Math.abs(stdHigh), 1);
    return margin > 0.25 ? 'critical_high' : 'high';
  }
  if (stdLow != null && value < stdLow) {
    const margin = (stdLow - value) / Math.max(Math.abs(stdLow), 1);
    return margin > 0.25 ? 'critical_low' : 'low';
  }
  return checkWatchList(value, marker, sex, age) ?? 'healthy';
}

const HIGHER_IS_BETTER = ['egfr', 'gfr', 'hdl', 'apolipoprotein a', 'apoa', 'apoa-1', 'apo a', 'vitamin b12', 'b12', 'folate', 'folic acid', 'vitamin b1', 'thiamine', 'vitamin b6', 'pyridoxine', 'vitamin d', '25-oh', '25-hydroxy', 'coq10', 'coenzyme q10', 'adiponectin', 'amh', 'anti-mullerian'];

console.log('Pulling every lab_value row + owner profile...');
const rows = await q(`
  SELECT lv.id, lv.marker_name, lv.value, lv.standard_low, lv.standard_high,
         lv.optimal_flag AS stored_flag, lv.standard_flag,
         p.sex, EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age
  FROM lab_values lv
  JOIN lab_draws ld ON ld.id = lv.draw_id
  JOIN profiles p ON p.id = ld.user_id
  WHERE lv.value IS NOT NULL
`);
console.log(`  Loaded ${rows.length} rows.`);

const changes: Array<{ id: string; marker: string; value: string; from: string; to: string }> = [];

for (const r of rows) {
  const value = Number(r.value);
  if (!Number.isFinite(value)) continue;
  const stdLow = r.standard_low != null ? Number(r.standard_low) : null;
  const stdHigh = r.standard_high != null ? Number(r.standard_high) : null;
  const n = String(r.marker_name ?? '').toLowerCase();
  const higherIsBetter = HIGHER_IS_BETTER.some(k => n.includes(k));
  const recomputed = recomputeFlag(value, stdLow, stdHigh, r.marker_name, r.sex, r.age, higherIsBetter);
  if (recomputed !== r.stored_flag) {
    changes.push({ id: r.id, marker: r.marker_name, value: String(r.value), from: r.stored_flag, to: recomputed });
  }
}

console.log(`\n  ${changes.length} rows have stale optimal_flag (stored != recompute).`);
if (changes.length === 0) {
  console.log('  ✅ All stored flags already match current rules.');
  Deno.exit(0);
}

// Print breakdown by transition
const buckets: Record<string, number> = {};
for (const c of changes) {
  const key = `${c.from} -> ${c.to}`;
  buckets[key] = (buckets[key] ?? 0) + 1;
}
console.log('\n  Transitions:');
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${v.toString().padStart(4)}  ${k}`);
}

console.log('\n  Sample (first 10):');
for (const c of changes.slice(0, 10)) {
  console.log(`    ${c.marker.padEnd(30)} ${c.value.padEnd(8)} ${c.from} -> ${c.to}`);
}

// Apply updates in batches
const BATCH = 50;
let applied = 0;
for (let i = 0; i < changes.length; i += BATCH) {
  const batch = changes.slice(i, i + BATCH);
  // Build a CASE expression so all rows update in one round trip.
  const cases = batch.map(c => `WHEN id::text = '${c.id}' THEN '${c.to}'::text`).join(' ');
  const ids = batch.map(c => `'${c.id}'::uuid`).join(',');
  await q(`UPDATE lab_values SET optimal_flag = CASE ${cases} END WHERE id IN (${ids})`);
  applied += batch.length;
  console.log(`    applied ${applied} / ${changes.length}`);
}

console.log(`\n  ✅ Recomputed ${applied} stored optimal_flag values to match current rules.`);
