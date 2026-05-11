// LAYER 2 — UNIT NORMALIZATION FUZZ
// =================================
// US labs (mg/dL, ng/mL) vs international (mmol/L, nmol/L). Asserts
// that conversions land in the right clinical bucket — e.g., 5.0
// mmol/L glucose should flag the same as 90 mg/dL glucose.
//
// Today the engine does NOT auto-normalize units. This harness
// documents the gap and the conversion table so we can wire it up
// next. For now, each case shows what a properly normalized value
// SHOULD do downstream.
//
// Pure deterministic. Zero API cost.
//
// Run: deno run -A __tests__/unit-fuzz.ts

interface UnitCase {
  marker: string;
  conversions: Array<{
    from: { value: number; unit: string };
    to: { value: number; unit: string };
    /** Acceptable rounding tolerance for the to-value */
    tolerance: number;
  }>;
}

// Standard clinical conversion factors. Source: NIST + most-used
// laboratory references. Each conversion goes from international
// (mmol/L, nmol/L, µmol/L) → US-standard (mg/dL, ng/mL).
const UNIT_CASES: UnitCase[] = [
  { marker:'Glucose',
    conversions:[
      { from:{ value:5.0,  unit:'mmol/L' }, to:{ value:90.0,  unit:'mg/dL' }, tolerance:1 },
      { from:{ value:7.0,  unit:'mmol/L' }, to:{ value:126.0, unit:'mg/dL' }, tolerance:1 },
      { from:{ value:11.1, unit:'mmol/L' }, to:{ value:200.0, unit:'mg/dL' }, tolerance:1 },
    ],
  },
  { marker:'Total Cholesterol',
    conversions:[
      { from:{ value:5.2, unit:'mmol/L' }, to:{ value:200.0, unit:'mg/dL' }, tolerance:2 },
      { from:{ value:6.5, unit:'mmol/L' }, to:{ value:250.0, unit:'mg/dL' }, tolerance:2 },
    ],
  },
  { marker:'LDL',
    conversions:[
      { from:{ value:2.6, unit:'mmol/L' }, to:{ value:100.0, unit:'mg/dL' }, tolerance:1 },
      { from:{ value:4.1, unit:'mmol/L' }, to:{ value:159.0, unit:'mg/dL' }, tolerance:2 },
    ],
  },
  { marker:'HDL',
    conversions:[
      { from:{ value:1.0, unit:'mmol/L' }, to:{ value:39.0,  unit:'mg/dL' }, tolerance:1 },
      { from:{ value:1.6, unit:'mmol/L' }, to:{ value:62.0,  unit:'mg/dL' }, tolerance:1 },
    ],
  },
  { marker:'Triglycerides',
    conversions:[
      { from:{ value:1.7, unit:'mmol/L' }, to:{ value:150.0, unit:'mg/dL' }, tolerance:2 },
      { from:{ value:2.3, unit:'mmol/L' }, to:{ value:204.0, unit:'mg/dL' }, tolerance:2 },
    ],
  },
  { marker:'Vitamin D 25-hydroxy',
    conversions:[
      { from:{ value:50,  unit:'nmol/L' }, to:{ value:20.0, unit:'ng/mL' }, tolerance:1 },
      { from:{ value:75,  unit:'nmol/L' }, to:{ value:30.0, unit:'ng/mL' }, tolerance:1 },
      { from:{ value:125, unit:'nmol/L' }, to:{ value:50.0, unit:'ng/mL' }, tolerance:1 },
    ],
  },
  { marker:'Creatinine',
    conversions:[
      { from:{ value:88,  unit:'µmol/L' }, to:{ value:1.0, unit:'mg/dL' }, tolerance:0.1 },
      { from:{ value:160, unit:'µmol/L' }, to:{ value:1.8, unit:'mg/dL' }, tolerance:0.1 },
    ],
  },
  { marker:'Ferritin',
    conversions:[
      // ng/mL ↔ µg/L are 1:1 — no conversion needed, just unit aliasing
      { from:{ value:30,  unit:'µg/L' }, to:{ value:30,  unit:'ng/mL' }, tolerance:0 },
      { from:{ value:150, unit:'µg/L' }, to:{ value:150, unit:'ng/mL' }, tolerance:0 },
    ],
  },
  { marker:'B12',
    conversions:[
      { from:{ value:200, unit:'pmol/L' }, to:{ value:271, unit:'pg/mL' }, tolerance:5 },
      { from:{ value:500, unit:'pmol/L' }, to:{ value:678, unit:'pg/mL' }, tolerance:5 },
    ],
  },
];

// Conversion table — internal authority of how to convert.
// Returns null if no rule defined for the (from→to) pair.
function convert(value: number, fromUnit: string, toUnit: string, marker: string): number | null {
  const key = `${marker}|${fromUnit}→${toUnit}`;
  // Glucose & cholesterol use 18.0182 for mmol/L → mg/dL
  if (fromUnit === 'mmol/L' && toUnit === 'mg/dL' && /glucose/i.test(marker)) return value * 18.0182;
  if (fromUnit === 'mmol/L' && toUnit === 'mg/dL' && /cholesterol|ldl|hdl/i.test(marker)) return value * 38.67;
  if (fromUnit === 'mmol/L' && toUnit === 'mg/dL' && /triglyceride/i.test(marker)) return value * 88.57;
  if (fromUnit === 'nmol/L' && toUnit === 'ng/mL' && /vitamin d/i.test(marker)) return value / 2.496;
  if (fromUnit === 'µmol/L' && toUnit === 'mg/dL' && /creatinine/i.test(marker)) return value / 88.4;
  if (fromUnit === 'µg/L' && toUnit === 'ng/mL') return value; // 1:1
  if (fromUnit === 'pmol/L' && toUnit === 'pg/mL' && /b.?12|cobalamin/i.test(marker)) return value * 1.355;
  return null;
}

// ── RUNNER ──────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  LAYER 2 — UNIT NORMALIZATION FUZZ`);
console.log(`══════════════════════════════════════════════════════════════\n`);

let total = 0, passed = 0;
const failures: string[] = [];

for (const u of UNIT_CASES) {
  for (const c of u.conversions) {
    total++;
    const got = convert(c.from.value, c.from.unit, c.to.unit, u.marker);
    if (got === null) {
      failures.push(`${u.marker}: no rule for ${c.from.unit} → ${c.to.unit}`);
      continue;
    }
    const diff = Math.abs(got - c.to.value);
    if (diff <= c.tolerance) {
      passed++;
    } else {
      failures.push(`${u.marker}: ${c.from.value} ${c.from.unit} → expected ${c.to.value} ${c.to.unit} (±${c.tolerance}) but got ${got.toFixed(2)}`);
    }
  }
}

console.log(`Tested ${UNIT_CASES.length} markers × ${total} conversions\n`);

if (failures.length === 0) {
  console.log(`✅ ALL ${total} UNIT CONVERSIONS PASS`);
  Deno.exit(0);
} else {
  console.log(`❌ ${failures.length}/${total} FAILURES:\n`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\nNote: The engine does not yet auto-normalize units. This`);
  console.log(`harness defines the contract. Wire convert() into the lab`);
  console.log(`parser so international units route to the right rule.\n`);
  Deno.exit(1);
}
