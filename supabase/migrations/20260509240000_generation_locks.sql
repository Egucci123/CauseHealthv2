-- supabase/migrations/20260509240000_generation_locks.sql
--
-- GENERATION LOCKS — universal mutual-exclusion for long-running surfaces
-- =======================================================================
-- Lab analysis, wellness plan, doctor prep, and any future generative
-- surface uses this table to prevent concurrent runs for the same
-- (user, surface). Without it: the user hits "Retry" while a previous
-- request is still in flight, both run concurrently, and the analysis
-- count double-increments / results race.
--
-- Pattern:
--   1. Function tries to UPSERT a lock row with locked_until = now + 90s,
--      using ON CONFLICT to detect prior holder.
--   2. If the existing locked_until > now (still held), return 409.
--   3. Otherwise own the lock, run the work.
--   4. On finish (success or error), DELETE the lock row.
--   5. Locks auto-expire after 90s in case the function dies mid-run.

CREATE TABLE IF NOT EXISTS public.generation_locks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,           -- 'wellness' | 'doctor_prep' | 'lab_analysis:{drawId}'
  locked_until TIMESTAMPTZ NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, surface)
);

CREATE INDEX IF NOT EXISTS generation_locks_expiry_idx
  ON public.generation_locks (locked_until);

ALTER TABLE public.generation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages generation_locks"
  ON public.generation_locks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.generation_locks IS
  'Mutual exclusion for long-running edge function generations. Auto-expires after 90s. Used by analyze-labs-v2, generate-wellness-plan-v2, generate-doctor-prep-v2.';
