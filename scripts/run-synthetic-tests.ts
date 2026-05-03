// scripts/run-synthetic-tests.ts
//
// Run the synthetic patient bench against the deterministic engines.
// Exits with code 0 on all-pass, 1 on any failure.
//
// Run with: deno run --allow-read scripts/run-synthetic-tests.ts
//
// Add to CI before any deploy that touches edge functions — keeps known-good
// patient archetypes from quietly regressing.

import { runSyntheticTests, PATIENTS } from '../supabase/functions/_shared/syntheticPatients.ts';

const results = runSyntheticTests();
let passed = 0;
let failed = 0;

console.log(`\n=== Synthetic patient test bench (${PATIENTS.length} patients) ===\n`);

for (const r of results) {
  if (r.passed) {
    console.log(`✓ ${r.patient}`);
    passed++;
  } else {
    console.log(`✗ ${r.patient}`);
    for (const f of r.failures) console.log(`    - ${f}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
Deno.exit(failed > 0 ? 1 : 0);
