// markerReferenceRanges.test.ts — verify sex-aware reference lookups
// and mismatch detection.

import { lookupReference, sexAwareRefCheck, sexAwareRefSweep } from "../markerReferenceRanges.ts";

interface T { name: string; run: () => boolean | string; }
const TESTS: T[] = [
  // ── Lookups ──────────────────────────────────────────────────────────
  {
    name: "Hemoglobin male ref ≈ 13.5-17.5",
    run: () => {
      const r = lookupReference('hemoglobin', 'male');
      return r?.low === 13.5 && r?.high === 17.5 ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Hemoglobin female ref ≈ 12.0-15.5",
    run: () => {
      const r = lookupReference('hemoglobin', 'female');
      return r?.low === 12.0 && r?.high === 15.5 ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Estradiol female pre-meno wide, post-meno narrow",
    run: () => {
      const pre = lookupReference('estradiol', 'female', 'pre_meno');
      const post = lookupReference('estradiol', 'female', 'post_meno');
      if (!pre || !post) return 'missing';
      return (pre.high > 300 && post.high < 50) ? true : `pre=${JSON.stringify(pre)} post=${JSON.stringify(post)}`;
    },
  },
  {
    name: "TSH ref is shared (not sex-specific)",
    run: () => {
      const m = lookupReference('tsh', 'male');
      const f = lookupReference('tsh', 'female');
      return JSON.stringify(m) === JSON.stringify(f) ? true : `male=${JSON.stringify(m)} female=${JSON.stringify(f)}`;
    },
  },

  // ── Mismatch detection ───────────────────────────────────────────────
  {
    name: "Female Hgb labeled with male ref 13.2-17.1 → mismatch",
    run: () => {
      const r = sexAwareRefCheck('hemoglobin', 13.2, 17.1, 'female');
      return r.mismatch === true && /female/i.test((r as any).warning) ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Female Hgb correctly labeled 12.0-15.5 → no mismatch",
    run: () => {
      const r = sexAwareRefCheck('hemoglobin', 12.0, 15.5, 'female');
      return r.mismatch === false ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Male testosterone labeled with female ref 8-60 → mismatch",
    run: () => {
      const r = sexAwareRefCheck('testosterone_total', 8, 60, 'male');
      return r.mismatch === true ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Shared marker (TSH) — labs varying ref slightly do NOT flag",
    run: () => {
      // No sex-specific entry, only shared. We should not flag — even if
      // extracted ref differs from canonical, that's lab-to-lab variance.
      const r = sexAwareRefCheck('tsh', 0.45, 4.8, 'female');
      return r.mismatch === false ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Sex unknown → never flag",
    run: () => {
      const r = sexAwareRefCheck('hemoglobin', 13.2, 17.1, null);
      return r.mismatch === false ? true : `got ${JSON.stringify(r)}`;
    },
  },
  {
    name: "Marker not in registry → never flag (graceful no-op)",
    run: () => {
      const r = sexAwareRefCheck('made_up_marker_key', 1, 2, 'male');
      return r.mismatch === false ? true : `got ${JSON.stringify(r)}`;
    },
  },

  // ── Sweep over multiple rows ─────────────────────────────────────────
  {
    name: "Sweep tags ONLY mismatched rows",
    run: () => {
      const rows: any[] = [
        { canonical_key: 'hemoglobin', standard_low: 13.2, standard_high: 17.1 },     // ← male ref on female
        { canonical_key: 'hematocrit', standard_low: 36,   standard_high: 46 },         // ← correct female
        { canonical_key: 'tsh',        standard_low: 0.4,  standard_high: 4.5 },        // ← shared, never flag
      ];
      const { mismatched } = sexAwareRefSweep(rows, 'female');
      if (mismatched.length !== 1) return `mismatched=${mismatched.length} want 1`;
      if (mismatched[0] !== 'hemoglobin') return `mismatched[0]=${mismatched[0]}`;
      if (!rows[0].ref_mismatch_warning) return 'expected ref_mismatch_warning on hemoglobin row';
      if (rows[1].ref_mismatch_warning) return 'unexpected warning on hematocrit row';
      if (rows[2].ref_mismatch_warning) return 'unexpected warning on tsh row';
      return true;
    },
  },
  {
    name: "Sweep with sex=null is a no-op (returns empty mismatch list)",
    run: () => {
      const rows: any[] = [
        { canonical_key: 'hemoglobin', standard_low: 13.2, standard_high: 17.1 },
      ];
      const { mismatched } = sexAwareRefSweep(rows, null);
      return mismatched.length === 0 ? true : `mismatched=${mismatched.length}`;
    },
  },
];

let pass = 0, fail = 0;
for (const t of TESTS) {
  let r: boolean | string;
  try { r = t.run(); } catch (e) { r = `threw: ${(e as Error).message}`; }
  if (r === true) { console.log(`  ✅ ${t.name}`); pass++; }
  else { console.log(`  ❌ ${t.name}\n     ${r}`); fail++; }
}
console.log(`\n======================================================`);
console.log(`  REF RANGES — ${pass} pass / ${fail} fail`);
console.log(`======================================================`);
if (fail) Deno.exit(1);
