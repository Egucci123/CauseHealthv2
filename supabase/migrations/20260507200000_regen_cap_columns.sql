-- Track regen counts per lab dataset for both Doctor Prep and Lab
-- Analysis (parallel to wellness_plans which already has draw_id).
-- Cap is now 2 per dataset on all three artifacts.

-- Doctor preps: link each row to its source draw so we can count
-- preps per dataset (same hash-of-lab-values approach as wellness plans).
ALTER TABLE public.doctor_prep_documents
  ADD COLUMN IF NOT EXISTS draw_id UUID REFERENCES public.lab_draws(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctor_prep_documents_draw_id
  ON public.doctor_prep_documents(draw_id);

-- Lab analyses: counted via a counter on lab_draws since each draw has
-- one analysis_result column (UPDATE not INSERT). Increment in
-- analyze-labs; cap blocks the call when count reaches REGEN_CAP. New
-- uploads start at 0; existing draws get 1 (their first analysis).
ALTER TABLE public.lab_draws
  ADD COLUMN IF NOT EXISTS analysis_count INTEGER NOT NULL DEFAULT 0;

-- Backfill: any draw with a non-null analysis_result has had at least
-- one analysis run.
UPDATE public.lab_draws
   SET analysis_count = 1
 WHERE analysis_result IS NOT NULL AND analysis_count = 0;

COMMENT ON COLUMN public.doctor_prep_documents.draw_id IS
  'Source lab draw. Used to enforce the per-dataset regen cap (2 doctor preps per unique lab dataset).';

COMMENT ON COLUMN public.lab_draws.analysis_count IS
  'How many times analyze-labs has run for this draw. Cap is 2 per dataset (REGEN_CAP) — additional re-analyses require uploading new labs.';
