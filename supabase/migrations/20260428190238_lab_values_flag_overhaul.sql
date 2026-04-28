-- Update optimal_flag CHECK constraint to accept the new range model.
-- Foundation 0a (Healthy / Watch / Out-of-Range / Critical) introduced new
-- flag values that the previous CHECK rejected, causing upload INSERTs to
-- silently fail with constraint violation. This migration accepts both new
-- and legacy values so historical rows still validate.

ALTER TABLE public.lab_values
  DROP CONSTRAINT IF EXISTS lab_values_optimal_flag_check;

ALTER TABLE public.lab_values
  ADD CONSTRAINT lab_values_optimal_flag_check
  CHECK (optimal_flag IN (
    -- New range-model flags (computed by labUploadStore.computeFlag)
    'healthy', 'watch', 'low', 'high', 'critical_low', 'critical_high', 'unknown',
    -- Legacy flags (kept so pre-overhaul rows still validate)
    'optimal', 'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated'
  ));
