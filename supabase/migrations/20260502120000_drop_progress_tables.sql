-- 20260502120000_drop_progress_tables.sql
-- Pivot: CauseHealth is no longer a daily-tracking app. Drop the tables that
-- backed the Progress page (daily check-ins) and the dashboard supplement
-- check-off card. The product is now a one-time bloodwork scanner +
-- doctor prep tool — no daily habit loop, no compliance tracking.

DROP TABLE IF EXISTS public.progress_entries CASCADE;
DROP TABLE IF EXISTS public.supplement_compliance CASCADE;
