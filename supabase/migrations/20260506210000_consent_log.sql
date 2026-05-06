-- consent_log — immutable audit trail for legal consent events.
--
-- Each row records ONE consent event. Three event types are required for
-- a fully-consented user (each captured at its own UI moment, never
-- bundled per GDPR Article 9 / Recital 32 + Washington MHMDA):
--
--   1. 'terms'                       — Terms of Service + Privacy Policy
--   2. 'ai_processing'               — GDPR Article 9 explicit consent for
--                                      AI processing of health data
--   3. 'health_data_authorization'   — Standalone authorization to collect
--                                      consumer health data, MHMDA-compliant
--
-- Rows are INSERT-ONLY — no updates, no deletes. The append-only model is
-- itself the audit trail. If consent is withdrawn, that's a NEW row of a
-- different type (or account deletion).
--
-- IP address is captured server-side (by the record-consent edge function)
-- not by the client, so users can't spoof it. policy_version pins the
-- consent to the exact text the user accepted — important when terms change.

CREATE TABLE IF NOT EXISTS public.consent_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL CHECK (consent_type IN ('terms', 'ai_processing', 'health_data_authorization')),
  presented_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT,
  policy_version  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_log_user_id
  ON public.consent_log(user_id);

CREATE INDEX IF NOT EXISTS idx_consent_log_user_type_version
  ON public.consent_log(user_id, consent_type, policy_version);

-- ── RLS — users can read their own consents, can insert via edge function only
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

-- Read: only your own rows
DROP POLICY IF EXISTS "Users can view their own consent log" ON public.consent_log;
CREATE POLICY "Users can view their own consent log"
  ON public.consent_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Insert: only via service role (edge function). We don't allow direct
-- client-side inserts because the edge function is what captures IP.
-- If we ever wanted client-side inserts for fallback, the policy would be:
--   FOR INSERT WITH CHECK (auth.uid() = user_id)
-- but we explicitly DO NOT want that here.

-- No UPDATE or DELETE policies — rows are immutable. Deletion of a user
-- account cascades via the FK, which is the only way a consent row leaves
-- the system.

COMMENT ON TABLE public.consent_log IS
  'Immutable audit log of legal consent events. Three types required for full consent: terms, ai_processing, health_data_authorization. Each captured at its own UI moment per GDPR + MHMDA.';

COMMENT ON COLUMN public.consent_log.consent_type IS
  'Which consent moment this row records. terms = ToS + Privacy bundle. ai_processing = GDPR Art 9 explicit consent for AI health-data processing. health_data_authorization = MHMDA-style standalone health data collection authorization.';

COMMENT ON COLUMN public.consent_log.policy_version IS
  'Pins the consent to the exact text version. When policy changes, fresh consent is required.';
