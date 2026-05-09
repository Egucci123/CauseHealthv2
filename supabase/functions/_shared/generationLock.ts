// supabase/functions/_shared/generationLock.ts
//
// GENERATION LOCK — universal CAS-style mutex for long-running surfaces
// ======================================================================
// Lab analysis, wellness plan, and doctor prep all share this primitive.
// Prevents concurrent runs for the same (user, surface) — without it,
// hitting "Retry" while a prior call is in flight produces double work,
// double cost, and racing writes.
//
// Pattern:
//   const lock = await acquireLock(supabase, { userId, surface, ttlMs });
//   if (!lock.acquired) return 409 'already running' (lock.heldBy = expiry);
//   try { ... do work ... } finally { await releaseLock(supabase, ...); }
//
// Auto-expiry after ttlMs (default 90s) protects against function deaths.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface LockResult {
  acquired: boolean;
  /** When the existing lock expires (only set when acquired === false). */
  heldUntil?: string;
}

export async function acquireLock(
  supabase: SupabaseClient,
  args: { userId: string; surface: string; ttlMs?: number },
): Promise<LockResult> {
  const ttl = args.ttlMs ?? 90_000;
  const lockedUntil = new Date(Date.now() + ttl).toISOString();
  const now = new Date().toISOString();

  // First: clear any expired lock (atomic for us — Postgres handles row lock).
  await supabase
    .from('generation_locks')
    .delete()
    .eq('user_id', args.userId)
    .eq('surface', args.surface)
    .lt('locked_until', now);

  // Then: try INSERT. If a non-expired row already exists, INSERT fails
  // with a primary-key conflict — that means someone else has it.
  const { error } = await supabase
    .from('generation_locks')
    .insert({
      user_id: args.userId,
      surface: args.surface,
      locked_until: lockedUntil,
      acquired_at: now,
    });

  if (error) {
    // Primary-key collision = someone else holds it. Read who.
    const { data: existing } = await supabase
      .from('generation_locks')
      .select('locked_until')
      .eq('user_id', args.userId)
      .eq('surface', args.surface)
      .maybeSingle();
    return { acquired: false, heldUntil: existing?.locked_until };
  }

  return { acquired: true };
}

export async function releaseLock(
  supabase: SupabaseClient,
  args: { userId: string; surface: string },
): Promise<void> {
  await supabase
    .from('generation_locks')
    .delete()
    .eq('user_id', args.userId)
    .eq('surface', args.surface);
}
