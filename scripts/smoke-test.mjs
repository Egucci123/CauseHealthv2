#!/usr/bin/env node
// scripts/smoke-test.mjs
// ──────────────────────────────────────────────────────────────────────
// Pre-commit smoke-test gate. Runs the right tier of audits based on
// which files are staged. Refuses the commit on any audit failure.
//
// Tier selection
// ──────────────
//   CLINICAL    — staged files touch clinical-rule logic (engine + rules + canonical thresholds)
//     Audits: light tier + realistic-fuzz (2K) + nhanes-fuzz (21K) +
//             clinical-depth + pattern-coverage-map
//     ~5 minutes worst case
//
//   STANDARD    — staged files touch _shared/ (markers, sanity, ref ranges, extraction)
//                 but NOT clinical rule logic
//     Audits: light tier + nhanes-fuzz (real-data trust signal)
//     ~3 minutes worst case
//
//   FRONTEND    — staged files are React/TS in src/, no shared code
//     Audits: light tier (parity audit is the critical one — proves
//             frontend stamp = backend recompute)
//     ~30 seconds worst case
//
//   TEST_ONLY   — only test files / scripts changed
//     Audits: none (the tests ARE the audits)
//
// Per founder request 2026-05-15: NHANES fuzz is always included on
// STANDARD and CLINICAL tiers — it's the most trustworthy single check
// (21,704 real US adults from NHANES 2011-2018).
//
// Bypass: `git commit --no-verify` skips this. Only do that if you
// know what you're breaking.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DENO = process.platform === 'win32'
  ? resolve(process.env.USERPROFILE ?? '', '.deno/bin/deno.exe')
  : 'deno';

function color(c, s) { return process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s; }
const red = s => color('31', s);
const green = s => color('32', s);
const yellow = s => color('33', s);
const cyan = s => color('36', s);
const dim = s => color('2', s);

// ── Detect staged files ─────────────────────────────────────────────
function stagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: ROOT, encoding: 'utf8',
    }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ── File classification ─────────────────────────────────────────────
const CLINICAL_RULE_FILES = [
  'supabase/functions/_shared/suspectedConditionsBackstop.ts',
  'supabase/functions/_shared/canonical.ts',
  'supabase/functions/_shared/safetyNet.ts',
  'supabase/functions/_shared/optimalRanges.ts',
  'supabase/functions/_shared/buildPlan.ts',
  'supabase/functions/_shared/factsCache.ts',
  'supabase/functions/_shared/clinicalCalculators.ts',
  'supabase/functions/_shared/testIndications.ts',
];
const CLINICAL_RULE_DIRS = [
  'supabase/functions/_shared/rules/',
];

function tierFor(files) {
  if (files.length === 0) return 'TEST_ONLY';
  const isClinicalRule = (f) =>
    CLINICAL_RULE_FILES.includes(f) ||
    CLINICAL_RULE_DIRS.some(d => f.startsWith(d));
  const isShared = (f) => f.startsWith('supabase/functions/_shared/') && !f.includes('__tests__/');
  const isFrontend = (f) => f.startsWith('src/');
  const isTestOnly = (f) =>
    f.includes('__tests__/') || f.startsWith('scripts/') ||
    f.startsWith('.husky/') || f === '.gitignore' ||
    // Config / dependency files — no runtime clinical impact unless they
    // also touch source code (which would already trip another tier).
    f === 'package.json' || f === 'package-lock.json' || f === 'deno.lock' ||
    f === 'tsconfig.json' || f === 'tsconfig.app.json' || f === 'tsconfig.node.json' ||
    f === 'vite.config.ts' || f === 'eslint.config.js' || f === 'postcss.config.js' ||
    f === 'tailwind.config.js' || f === 'vercel.json' || f === 'README.md' ||
    f === 'SETUP.md' || f === 'index.html' || f === 'middleware.ts';

  if (files.some(isClinicalRule)) return 'CLINICAL';
  if (files.some(isShared)) return 'STANDARD';
  if (files.some(isFrontend)) return 'FRONTEND';
  if (files.every(isTestOnly)) return 'TEST_ONLY';
  return 'STANDARD';
}

// ── Audit definitions ───────────────────────────────────────────────
const AUDITS = {
  // Light tier — fast, always run except on TEST_ONLY
  'watchFlagParity':       'supabase/functions/_shared/__tests__/watchFlagParity.test.ts',
  'plan-schema-contract':  'supabase/functions/_shared/__tests__/plan-schema-contract.ts',
  'engine-ui-coverage':    'supabase/functions/_shared/__tests__/engine-ui-coverage.test.ts',
  'pdf-coverage':          'supabase/functions/_shared/__tests__/pdf-coverage.test.ts',
  'markerCanonical':       'supabase/functions/_shared/__tests__/markerCanonical.test.ts',
  'crossMarkerSanity':     'supabase/functions/_shared/__tests__/crossMarkerSanity.test.ts',
  'markerDisambiguator':   'supabase/functions/_shared/__tests__/markerDisambiguator.test.ts',
  'markerReferenceRanges': 'supabase/functions/_shared/__tests__/markerReferenceRanges.test.ts',
  'supplement-safety':     'supabase/functions/_shared/__tests__/supplement-safety-fuzz.ts',
  'marker-overlap-traps':  'supabase/functions/_shared/__tests__/marker-overlap-traps.ts',
  // Heavy tier — clinical real-data + synthetic fuzz
  'nhanes-fuzz':           'supabase/functions/_shared/__tests__/nhanes-fuzz.ts',
  'realistic-fuzz':        'supabase/functions/_shared/__tests__/realistic-fuzz.ts',
  'clinical-depth':        'supabase/functions/_shared/__tests__/clinical-depth-audit.ts',
  'pattern-coverage-map':  'supabase/functions/_shared/__tests__/pattern-coverage-map.ts',
};

const LIGHT_TIER = [
  'watchFlagParity', 'plan-schema-contract', 'engine-ui-coverage', 'pdf-coverage',
  'markerCanonical', 'crossMarkerSanity', 'markerDisambiguator', 'markerReferenceRanges',
  'supplement-safety', 'marker-overlap-traps',
];

const STANDARD_TIER = [...LIGHT_TIER, 'nhanes-fuzz'];

const CLINICAL_TIER = [
  ...LIGHT_TIER, 'nhanes-fuzz', 'realistic-fuzz', 'clinical-depth', 'pattern-coverage-map',
];

const FRONTEND_TIER = LIGHT_TIER;

// ── Runner ───────────────────────────────────────────────────────────
function runAudit(name, file) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) {
    console.log(`  ${yellow('⚠')}  ${name.padEnd(28)} ${dim('(file not found, skipping)')}`);
    return true;
  }
  const start = Date.now();
  process.stdout.write(`  ${dim('•')}  ${name.padEnd(28)} ${dim('running...')}`);
  // -A grants all permissions (net, env, read, write, run, sys, ffi).
  // Don't combine with --allow-net etc. — Deno rejects that.
  const r = spawnSync(DENO, ['run', '-A', file], {
    cwd: ROOT, encoding: 'utf8', shell: false,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  // Erase the "running..." line
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  if (r.status === 0) {
    console.log(`  ${green('✓')}  ${name.padEnd(28)} ${dim(`${elapsed}s`)}`);
    return true;
  }
  console.log(`  ${red('✗')}  ${name.padEnd(28)} ${dim(`${elapsed}s`)}`);
  // Print last 30 lines of output so the failure reason is visible
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const lines = out.split('\n').slice(-30);
  console.log(dim('     ' + lines.join('\n     ')));
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────
const files = stagedFiles();
const tier = tierFor(files);
const audits = {
  CLINICAL: CLINICAL_TIER,
  STANDARD: STANDARD_TIER,
  FRONTEND: FRONTEND_TIER,
  TEST_ONLY: [],
}[tier];

console.log('');
console.log(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
console.log(cyan(`  PRE-COMMIT SMOKE TEST — ${tier} tier`));
console.log(cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
console.log('');
console.log(`  Staged files: ${files.length}`);
if (files.length > 0 && files.length <= 8) {
  for (const f of files) console.log(`    ${dim(f)}`);
} else if (files.length > 8) {
  for (const f of files.slice(0, 5)) console.log(`    ${dim(f)}`);
  console.log(`    ${dim(`... +${files.length - 5} more`)}`);
}
console.log('');
console.log(`  Audits to run: ${audits.length}`);
if (audits.length === 0) {
  console.log(`  ${green('✓ TEST_ONLY tier — nothing to verify, commit allowed.')}`);
  console.log('');
  process.exit(0);
}
console.log('');

let allPassed = true;
const startAll = Date.now();
for (const name of audits) {
  if (!runAudit(name, AUDITS[name])) allPassed = false;
}
const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);

console.log('');
if (allPassed) {
  console.log(`  ${green('✓ All audits passed')} ${dim(`(${totalElapsed}s total)`)}`);
  console.log('');
  process.exit(0);
}
console.log(`  ${red('✗ Commit blocked — fix the failing audit(s) above and retry.')}`);
console.log(`    ${dim(`(${totalElapsed}s total. Bypass with --no-verify if absolutely necessary.)`)}`);
console.log('');
process.exit(1);
