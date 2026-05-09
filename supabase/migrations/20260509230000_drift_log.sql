-- supabase/migrations/20260509230000_drift_log.sql
--
-- DRIFT LOG — cross-surface coherence telemetry
-- ==============================================
-- Background drift-detector function writes one row here per detected
-- divergence. If wellness, lab analysis, and doctor prep ever drift on
-- condition keys / test keys / risk numbers, this table catches it.

CREATE TABLE IF NOT EXISTS public.drift_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  surface_a TEXT NOT NULL,        -- 'wellness' | 'analysis' | 'doctor_prep'
  surface_b TEXT NOT NULL,
  drift_kind TEXT NOT NULL,       -- 'conditions' | 'tests' | 'risk_numbers' | 'goals' | 'alerts'
  details JSONB NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warn',  -- 'warn' | 'error'
  hash_a TEXT,
  hash_b TEXT
);

CREATE INDEX IF NOT EXISTS drift_log_recent_idx ON public.drift_log (detected_at DESC);
CREATE INDEX IF NOT EXISTS drift_log_user_idx ON public.drift_log (user_id, detected_at DESC);

ALTER TABLE public.drift_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages drift_log"
  ON public.drift_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
