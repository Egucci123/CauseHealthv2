-- 20260510_arbitration_optout.sql
--
-- Adds the operational state columns the send-confirmation-email edge
-- function and the manual arbitration-opt-out workflow need.
--
--   1. signup_confirmation_email_sent_at — idempotency marker for the
--      AAA-required post-signup confirmation email (ToS §17.8). Stamped
--      by the send-confirmation-email function on a successful send;
--      a non-null value short-circuits re-invocations.
--
--   2. arbitration_opted_out (bool) + arbitration_optout_at (timestamptz)
--      — set when a user emails legal@causehealth.com with subject
--      "Arbitration Opt-Out" within their 30-day window per ToS §17.6.
--      Logged via consent_log (consent_type='arbitration_optout') and
--      mirrored here for fast lookup.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.user_eligibility
  ADD COLUMN IF NOT EXISTS signup_confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS arbitration_opted_out             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arbitration_optout_at             timestamptz;

COMMENT ON COLUMN public.user_eligibility.signup_confirmation_email_sent_at IS
  'Timestamp the AAA-required post-signup confirmation/opt-out-notice email was sent. NULL = not sent yet. Set by send-confirmation-email edge function on success. Used for idempotency.';

COMMENT ON COLUMN public.user_eligibility.arbitration_opted_out IS
  'TRUE if the user emailed legal@causehealth.com to opt out of arbitration within the 30-day window per ToS Section 17.6. Class-action waiver also falls away for these users.';

COMMENT ON COLUMN public.user_eligibility.arbitration_optout_at IS
  'Timestamp of the opt-out email (postmark time when ops logs it). NULL when arbitration_opted_out = false.';

-- Helper index for the "did any user opt out" report — cheap, sparse.
CREATE INDEX IF NOT EXISTS user_eligibility_optout_idx
  ON public.user_eligibility (arbitration_optout_at)
  WHERE arbitration_opted_out = true;
