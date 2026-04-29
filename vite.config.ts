import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Bake the commit hash into the bundle as VITE_BUILD_VERSION at build time.
// We do this via define so it works whether or not .env.production.local was
// written by the prebuild script — Vite's env-file loading was unreliable on
// Vercel's build environment.
function getBuildVersion(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8);
  if (process.env.VITE_BUILD_VERSION) return process.env.VITE_BUILD_VERSION;
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
}

const buildVersion = getBuildVersion();
// Surface in build logs so we can verify the right version is baked in
console.log('[vite.config] VITE_BUILD_VERSION =', buildVersion);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
  },
})
