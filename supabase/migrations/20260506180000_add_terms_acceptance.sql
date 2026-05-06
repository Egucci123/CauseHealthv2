-- Add a terms_acceptance JSONB column to profiles to record when users
-- accepted the Terms of Service / Privacy Policy / Medical Disclaimer.
--
-- Shape:
--   {
--     "terms_version": "2026-05-06",
--     "terms_accepted_at": "2026-05-06T18:00:00.000Z",
--     "privacy_accepted_at": "2026-05-06T18:00:00.000Z",
--     "disclaimer_accepted_at": "2026-05-06T18:00:00.000Z",
--     "user_agent": "Mozilla/5.0..." (optional, truncated to 200 chars)
--   }
--
-- NULL means the user has not yet accepted (or accepted an older version
-- that is no longer current — re-prompted via TERMS_VERSION mismatch).
--
-- Universal: every authenticated user is gated on this field via the
-- ProtectedRoute consent check.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_acceptance JSONB;

-- Helpful index for any future analytics on consent timestamps. Optional —
-- query patterns currently are per-user, so no index is strictly needed,
-- but JSONB GIN keeps it cheap if we ever want to audit consent across users.
CREATE INDEX IF NOT EXISTS idx_profiles_terms_acceptance_version
  ON public.profiles ((terms_acceptance->>'terms_version'));

COMMENT ON COLUMN public.profiles.terms_acceptance IS
  'Records the user''s acceptance of Terms / Privacy / Medical Disclaimer at signup. NULL = not yet accepted current version. Re-prompted when TERMS_VERSION changes.';
