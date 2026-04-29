// scripts/write-version.js
// Runs at build time. Writes public/version.json with the current commit
// hash + build timestamp. The deployed app polls this file at runtime to
// detect when a new version has been deployed and prompts the user to
// refresh — so users never run on stale JS without knowing.

import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let commit = 'unknown';
// Vercel sets VERCEL_GIT_COMMIT_SHA automatically on production builds
if (process.env.VERCEL_GIT_COMMIT_SHA) {
  commit = process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8);
} else {
  // Local builds — read from git
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {}
}

const version = {
  commit,
  builtAt: new Date().toISOString(),
};

const target = join(__dirname, '..', 'public', 'version.json');
writeFileSync(target, JSON.stringify(version, null, 2) + '\n');
console.log(`[write-version] ${target} -> ${JSON.stringify(version)}`);

// Also expose to the bundle as VITE_BUILD_VERSION so the running app
// can compare its baked-in version against the live one.
const envFile = join(__dirname, '..', '.env.production.local');
writeFileSync(envFile, `VITE_BUILD_VERSION=${commit}\n`);
console.log(`[write-version] ${envFile} -> VITE_BUILD_VERSION=${commit}`);
