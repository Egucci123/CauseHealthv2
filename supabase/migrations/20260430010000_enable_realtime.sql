-- Enable Supabase realtime on tables the UI subscribes to.
--
-- The previous state of this database had ZERO tables in the
-- supabase_realtime publication, which meant every postgres_changes
-- subscription in the client (LabDetail, useLabData, useDoctorPrep,
-- subscription-status sync, etc.) was firing into the void. The UI
-- was relying purely on polling, which has gaps when the tab is
-- briefly hidden or the user navigates away mid-operation. Symptom:
-- "I had to refresh to see the analysis complete" — the analyze-labs
-- function had already updated lab_draws but the page never knew.
--
-- This migration adds the tables whose row updates the client cares
-- about. Realtime is idempotent — IF NOT EXISTS isn't supported on
-- ALTER PUBLICATION ADD TABLE, so we wrap in a DO block to swallow
-- 'already exists' errors when re-running.

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_draws;             EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_values;            EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wellness_plans;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_prep_documents; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;              EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.priority_alerts;       EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
