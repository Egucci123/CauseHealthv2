// markerDisambiguator.test.ts — verify each disambiguation rule.
// Each test: build a row that an upstream stage would have canonicalized
// (with canonical_key set), then run the disambiguator and check that
// it correctly promotes or converts.

import { disambiguateMarkers } from "../markerDisambiguator.ts";
import { canonicalize } from "../markerCanonical.ts";

function row(name: string, value: number, unit: string) {
  const c = canonicalize(name);
  return {
    marker_name: name, value, unit,
    canonical_key: c?.key,
    canonical_name: c?.canonical,
    canonical_category: c?.category,
  };
}

interface T {
  name: string;
  input: any;
  expectKey: string;
  expectNote?: RegExp;
  expectValue?: number;
  expectUnit?: string;
}

const TESTS: T[] = [
  // ── Calcium total → ionized via unit mmol/L ────────────────────────
  {
    name: "Calcium 1.18 mmol/L → ionized",
    input: row('Calcium', 1.18, 'mmol/L'),
    expectKey: 'calcium_ionized',
    expectNote: /ionized/i,
  },
  {
    name: "Calcium 9.4 mg/dL → stays as total",
    input: row('Calcium', 9.4, 'mg/dL'),
    expectKey: 'calcium',
  },
  {
    name: "Calcium 1.25 (no unit) → ionized via value < 3 fallback",
    input: row('Calcium', 1.25, ''),
    expectKey: 'calcium_ionized',
  },

  // ── Iron → TSat via % unit ──────────────────────────────────────────
  {
    name: "Iron 32 % → TSat",
    input: row('Iron', 32, '%'),
    expectKey: 'tsat',
  },
  {
    name: "Iron 95 mcg/dL → stays as iron",
    input: row('Iron', 95, 'mcg/dL'),
    expectKey: 'iron',
  },

  // ── Glucose → fasting via name hint ─────────────────────────────────
  {
    name: "Glucose, Fasting Spec → glucose_fasting",
    input: row('Glucose Fasting Specimen', 92, 'mg/dL'),
    expectKey: 'glucose_fasting',
  },
  {
    name: "Glucose, Random → stays as random (NOT promoted by fasting rule)",
    input: row('Glucose, Random', 145, 'mg/dL'),
    expectKey: 'glucose_random',
  },
  {
    name: "Plain Glucose with no hint → stays as glucose",
    input: row('Glucose', 95, 'mg/dL'),
    expectKey: 'glucose',
  },

  // ── B12 unit conversion ─────────────────────────────────────────────
  {
    name: "B12 442 pmol/L → converted to ~599 pg/mL",
    input: row('Vitamin B12', 442, 'pmol/L'),
    expectKey: 'b12',
    expectValue: Math.round(442 * 1.355),
    expectUnit: 'pg/mL',
    expectNote: /converted from 442 pmol\/l/i,
  },
  {
    name: "B12 600 pg/mL → no conversion",
    input: row('Vitamin B12', 600, 'pg/mL'),
    expectKey: 'b12',
    expectValue: 600,
    expectUnit: 'pg/mL',
  },

  // ── Vit D unit conversion ───────────────────────────────────────────
  {
    name: "Vit D 75 nmol/L → converted to ~30 ng/mL",
    input: row('25-OH Vitamin D', 75, 'nmol/L'),
    expectKey: 'vit_d',
    expectValue: Math.round(75 / 2.496 * 10) / 10,
    expectUnit: 'ng/mL',
    expectNote: /converted from 75 nmol\/l/i,
  },
  {
    name: "Vit D 42 ng/mL → no conversion",
    input: row('25-OH Vitamin D', 42, 'ng/mL'),
    expectKey: 'vit_d',
    expectValue: 42,
    expectUnit: 'ng/mL',
  },

  // ── Magnesium serum vs RBC via value + name hint ────────────────────
  {
    name: "Magnesium 5.4 with RBC hint → magnesium_rbc",
    input: { ...row('Mg RBC', 5.4, 'mg/dL'), canonical_key: 'magnesium', canonical_name: 'Magnesium' },
    expectKey: 'magnesium_rbc',
  },
  {
    name: "Magnesium 2.1 (serum, no RBC hint) → stays as serum",
    input: row('Magnesium', 2.1, 'mg/dL'),
    expectKey: 'magnesium',
  },
];

let pass = 0, fail = 0;
for (const t of TESTS) {
  const { values } = disambiguateMarkers([t.input]);
  const row = values[0];
  const errors: string[] = [];
  if (row.canonical_key !== t.expectKey) errors.push(`canonical_key=${row.canonical_key} (want ${t.expectKey})`);
  if (t.expectValue !== undefined && row.value !== t.expectValue) errors.push(`value=${row.value} (want ${t.expectValue})`);
  if (t.expectUnit !== undefined && row.unit !== t.expectUnit) errors.push(`unit=${row.unit} (want ${t.expectUnit})`);
  if (t.expectNote && !t.expectNote.test(row.disambiguation_note ?? '')) errors.push(`note missing pattern ${t.expectNote}`);
  if (errors.length === 0) { console.log(`  ✅ ${t.name}`); pass++; }
  else { console.log(`  ❌ ${t.name}\n     ${errors.join(' | ')}`); fail++; }
}

console.log(`\n======================================================`);
console.log(`  DISAMBIGUATOR — ${pass} pass / ${fail} fail`);
console.log(`======================================================`);
if (fail) Deno.exit(1);
