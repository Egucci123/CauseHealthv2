// supabase/functions/_shared/factsCache.ts
//
// CLINICAL FACTS CACHE — read/write-through helper
// =================================================
// All three surfaces (lab analysis, wellness plan, doctor prep) call
// `loadOrComputeFacts(input)`. If an existing cache row exists for the
// same input_state_hash, return its facts. Otherwise compute fresh,
// write the cache, return the result. Same patient input → same facts
// across surfaces, mathematically.
//
// Universal invalidation: any change to (profile, conditions, meds,
// symptoms, lab values, rule library version) → different hash →
// cache miss → recompute. Old facts auto-expire after 24 hours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPlan, type ClinicalFacts, type PatientInput } from './buildPlan.ts';

// Bump this when ANY rule file in _shared/rules/* changes. Forces
// cache invalidation across the user base — old facts are no longer
// guaranteed to match the current rule library.
//
// Convention: bump on every rule-impacting deploy. Format: 'YYYY-MM-DD-N'.
export const RULE_LIBRARY_VERSION = '2026-05-09-1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Stable hash of every input that affects the deterministic engine.
 * Universal — same shape input → same hash, byte-for-byte.
 */
export async function computeInputStateHash(input: PatientInput): Promise<string> {
  // Canonicalize: every field sorted, normalized, deterministic.
  const canonical = JSON.stringify({
    age: input.age,
    sex: input.sex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    bmi: input.bmi,
    isPregnant: input.isPregnant,
    hasShellfishAllergy: input.hasShellfishAllergy,
    hasSulfaAllergy: input.hasSulfaAllergy,
    conditions: [...input.conditionsList].map(s => s.toLowerCase().trim()).sort(),
    meds: [...input.medsList].map(s => s.toLowerCase().trim()).sort(),
    supplements: [...input.supplementsList].map(s => s.toLowerCase().trim()).sort(),
    symptoms: [...input.symptomsList]
      .map(s => `${s.name.toLowerCase().trim()}:${s.severity ?? 0}`)
      .sort(),
    labs: [...input.labs]
      .map(l => `${String(l.marker).toLowerCase().trim()}:${l.value ?? ''}:${l.unit ?? ''}:${l.flag ?? 'normal'}`)
      .sort(),
    rule_library: RULE_LIBRARY_VERSION,
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Read-through helper. Lab analysis, wellness, doctor prep all call this.
 * Returns ClinicalFacts. Computes once per input-state, serves the same
 * row to every subsequent caller until something changes.
 *
 * @param userId user UUID
 * @param drawId optional lab draw id (for indexing the cache by draw)
 * @param input the deterministic input
 */
export async function loadOrComputeFacts(args: {
  userId: string;
  drawId: string | null;
  input: PatientInput;
}): Promise<{ facts: ClinicalFacts; hash: string; fromCache: boolean }> {
  const { userId, drawId, input } = args;
  const hash = await computeInputStateHash(input);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Read-through
  const { data: cached } = await supabase
    .from('clinical_facts_cache')
    .select('facts, computed_at, expires_at')
    .eq('user_id', userId)
    .eq('input_state_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached?.facts) {
    return { facts: cached.facts as ClinicalFacts, hash, fromCache: true };
  }

  // Compute fresh
  const facts = buildPlan(input);

  // Write-through (best-effort — failure to cache shouldn't fail the request)
  try {
    await supabase
      .from('clinical_facts_cache')
      .upsert(
        {
          user_id: userId,
          input_state_hash: hash,
          draw_id: drawId,
          rule_library_version: RULE_LIBRARY_VERSION,
          facts,
          computed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: 'user_id,input_state_hash' },
      );
  } catch (e) {
    console.warn('[factsCache] write failed (non-fatal):', e);
  }

  return { facts, hash, fromCache: false };
}

/**
 * Invalidate the cache for a user — used when input data is known to
 * have changed (e.g., new lab draw uploaded, conditions edited).
 * Universal — drops ALL rows for the user, not just one hash.
 */
export async function invalidateFactsCache(userId: string): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await supabase.from('clinical_facts_cache').delete().eq('user_id', userId);
}
