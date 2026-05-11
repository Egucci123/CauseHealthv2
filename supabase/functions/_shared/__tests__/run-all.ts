// SYNTHETIC TEST RUNNER — runs all $0 layers in sequence.
// Layer 4 (AI prose contract) is excluded from this default runner
// because it costs ~$1 per invocation. Run it separately when needed.
//
// Run: deno run -A __tests__/run-all.ts

const LAYERS = [
  { name:'Layer 1 — Marker name fuzz',        file:'./marker-fuzz.ts' },
  { name:'Layer 2 — Unit normalization fuzz', file:'./unit-fuzz.ts' },
  { name:'Layer 3 — 100-female archetype audit', file:'./female-100-audit.ts' },
  { name:'Layer 5 — Golden snapshots',        file:'./snapshots.ts' },
  { name:'Layer 6 — Property-based fuzz',     file:'./fuzz.ts' },
];

const start = Date.now();
let totalPassed = 0, totalFailed = 0;
const failedLayers: string[] = [];

console.log(`\n╔════════════════════════════════════════════════════════════╗`);
console.log(`║  CAUSEHEALTH SYNTHETIC TEST SUITE                          ║`);
console.log(`║  4 deterministic layers, ~5K assertions, ~$0 cost          ║`);
console.log(`╚════════════════════════════════════════════════════════════╝\n`);

for (const layer of LAYERS) {
  const layerStart = Date.now();
  const cmd = new Deno.Command(Deno.execPath(), {
    args:['run','-A', new URL(layer.file, import.meta.url).href],
    stdout:'piped', stderr:'piped',
  });
  const { code, stdout, stderr } = await cmd.output();
  const elapsed = Date.now() - layerStart;
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  // Last meaningful line as the per-layer headline
  const lines = out.split('\n').filter(l => l.trim());
  const headline = lines[lines.length - 1] ?? '(no output)';

  if (code === 0) {
    totalPassed++;
    console.log(`✅ ${layer.name}  (${elapsed}ms)`);
    console.log(`   ${headline}\n`);
  } else {
    totalFailed++;
    failedLayers.push(layer.name);
    console.log(`❌ ${layer.name}  (${elapsed}ms)`);
    // Show last 20 lines for failed layers
    for (const l of lines.slice(-20)) console.log(`   ${l}`);
    if (err) console.log(`   stderr: ${err.slice(0,300)}`);
    console.log('');
  }
}

const totalElapsed = Date.now() - start;
console.log(`\n╔════════════════════════════════════════════════════════════╗`);
if (totalFailed === 0) {
  console.log(`║  ✅ ALL ${totalPassed} LAYERS PASS — ${(totalElapsed/1000).toFixed(1)}s — $0 cost                  ║`);
} else {
  console.log(`║  ❌ ${totalFailed}/${LAYERS.length} LAYERS FAILED — ${(totalElapsed/1000).toFixed(1)}s                          ║`);
  for (const f of failedLayers) console.log(`║    • ${f.padEnd(54)}║`);
}
console.log(`╚════════════════════════════════════════════════════════════╝\n`);

Deno.exit(totalFailed === 0 ? 0 : 1);
