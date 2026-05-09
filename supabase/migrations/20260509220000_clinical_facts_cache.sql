-- supabase/migrations/20260509220000_clinical_facts_cache.sql
--
-- CLINICAL FACTS CACHE — cross-surface coherence layer
-- =====================================================
-- Lab analysis, wellness plan, and doctor prep all consume the same
-- ClinicalFacts object. Compute it ONCE per (user, input-state-hash),
-- save it here, and serve it from all three surfaces. Identical clinical
-- reasoning across every surface, no drift possible.
--
-- input_state_hash captures: profile snapshot + active conditions +
-- active meds + active symptoms + lab values + rule-library version.
-- Any change to any input invalidates the cache.

CREATE TABLE IF NOT EXISTS public.clinical_facts_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_state_hash TEXT NOT NULL,
  draw_id UUID REFERENCES public.lab_draws(id) ON DELETE CASCADE,
  rule_library_version TEXT NOT NULL,
  facts JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  PRIMARY KEY (user_id, input_state_hash)
);

CREATE INDEX IF NOT EXISTS clinical_facts_cache_user_idx
  ON public.clinical_facts_cache (user_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS clinical_facts_cache_draw_idx
  ON public.clinical_facts_cache (user_id, draw_id, computed_at DESC);

ALTER TABLE public.clinical_facts_cache ENABLE ROW LEVEL SECURITY;

-- Users can read their own cached facts (UI may peek at canonical prose).
CREATE POLICY "users read own facts cache"
  ON public.clinical_facts_cache FOR SELECT
  USING (auth.uid() = user_id);

-- Edge functions (service role) write the cache.
CREATE POLICY "service role manages facts cache"
  ON public.clinical_facts_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Comment for future devs.
COMMENT ON TABLE public.clinical_facts_cache IS
  'Single source of truth for ClinicalFacts across lab analysis, wellness plan, and doctor prep. Keyed on user_id + input_state_hash so any input change invalidates the cache. Read this before recomputing.';
