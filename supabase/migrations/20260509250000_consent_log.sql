-- supabase/migrations/20260509250000_consent_log.sql
--
-- v6 LEGAL HARDENING — extends the existing consent_log to support the
-- v6 implementation spec from outside counsel:
--   * standalone arbitration / class-waiver checkbox (Berman v. Freedom Financial)
--   * state-residency self-certification (geofence + log + IP)
--   * established-clinician attestation
--   * output acknowledgment quiz (3 sequential affirmations + clinician name)
--   * sensitive-health TX TDPSA / VCDPA / CPA opt-in
--   * EU/UK geoblock self-certification
--   * auto-renewal disclosure (pre-payment)
--
-- Builds on top of:
--   20260506210000_consent_log.sql           (base table)
--   20260507120000_mhmda_wa_consent_type.sql (added MHMDA type)
--
-- Strategy: keep the existing table, drop the CHECK constraint that limits
-- consent_type, and add the v6 columns + a derived eligibility table.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Drop the consent_type CHECK so we can add new types without bumping
--    the constraint every release. App-level constants enforce the
--    closed enum (src/lib/legal/consentText.ts).
-- ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  conname text;
BEGIN
  SELECT conname INTO conname
  FROM pg_constraint
  WHERE conrelid = 'public.consent_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%consent_type%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.consent_log DROP CONSTRAINT %I', conname);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Add v6 columns — all nullable / defaulted so existing rows survive.
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.consent_log
  ADD COLUMN IF NOT EXISTS checkbox_text text,
  ADD COLUMN IF NOT EXISTS text_version  text,
  ADD COLUMN IF NOT EXISTS page_url      text,
  ADD COLUMN IF NOT EXISTS metadata      jsonb DEFAULT '{}'::jsonb;

-- text_version mirrors the existing policy_version on writes from the new
-- code path. Keep both columns populated until policy_version can be
-- deprecated in a later cleanup migration.

CREATE INDEX IF NOT EXISTS idx_consent_log_user_type_v6
  ON public.consent_log (user_id, consent_type, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_log_type_textver
  ON public.consent_log (consent_type, text_version);

-- ──────────────────────────────────────────────────────────────────────
-- 3. user_eligibility — single-row-per-user materialized state derived
-- from the latest relevant rows in consent_log. Fast gate without
-- scanning the log on every page load.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_eligibility (
  user_id                         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Most recently certified state of residence (ISO code: 'PA', 'TX', etc.)
  -- Blocked: 'CA', 'NY', 'IL', 'WA' — app refuses signup; backend re-checks.
  certified_state                 text,
  state_certified_at              timestamptz,
  state_certified_ip              text,

  -- IP geolocation at registration time, for evidence trail when a
  -- self-certified state contradicts geo lookup.
  registration_ip                 text,
  registration_geo_country        text,
  registration_geo_region         text,

  -- "I am an established patient of a licensed clinician" attestation.
  has_clinician_certified         boolean NOT NULL DEFAULT false,
  clinician_certified_at          timestamptz,

  -- Clinician name + practice captured at output-gate time.
  clinician_name                  text,
  clinician_practice              text,
  clinician_name_entered_at       timestamptz,

  -- Output acknowledgment — set once all three items are checked AND
  -- clinician name has been entered in a single session.
  output_ack_completed_at         timestamptz,

  -- Arbitration opt-out tracking. The 30-day window starts at the user's
  -- first 'arbitration_class_waiver' row in consent_log.
  arbitration_opt_out_email_sent  boolean NOT NULL DEFAULT false,
  arbitration_opted_out           boolean NOT NULL DEFAULT false,
  arbitration_opted_out_at        timestamptz,

  updated_at                      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_eligibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_eligibility_select_own" ON public.user_eligibility;
CREATE POLICY "user_eligibility_select_own"
  ON public.user_eligibility FOR SELECT
  USING (auth.uid() = user_id);

-- Writes only via service-role edge functions (record-consent etc.) —
-- absence of INSERT/UPDATE policies + RLS enabled = denied for users.

-- ──────────────────────────────────────────────────────────────────────
-- 4. Append-only triggers on consent_log — block UPDATE/DELETE even from
-- service role except via explicit DBA work.
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consent_log_block_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'consent_log is append-only — UPDATE/DELETE not permitted';
END;
$$;

DROP TRIGGER IF EXISTS consent_log_no_update ON public.consent_log;
CREATE TRIGGER consent_log_no_update
  BEFORE UPDATE ON public.consent_log
  FOR EACH ROW EXECUTE FUNCTION public.consent_log_block_mutations();

DROP TRIGGER IF EXISTS consent_log_no_delete ON public.consent_log;
CREATE TRIGGER consent_log_no_delete
  BEFORE DELETE ON public.consent_log
  FOR EACH ROW EXECUTE FUNCTION public.consent_log_block_mutations();

-- ON DELETE CASCADE from auth.users still works — Postgres CASCADE bypasses
-- BEFORE row triggers on parent-row deletion. This is intentional: account
-- deletion is a privacy-rights flow and must succeed.

-- ──────────────────────────────────────────────────────────────────────
-- 5. Helper view — most recent consent of each type per user
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.consent_log_latest AS
SELECT DISTINCT ON (user_id, consent_type)
  user_id,
  consent_type,
  checkbox_text,
  text_version,
  policy_version,
  accepted_at,
  ip_address,
  user_agent,
  page_url,
  metadata
FROM public.consent_log
ORDER BY user_id, consent_type, accepted_at DESC;

-- ──────────────────────────────────────────────────────────────────────
-- 6. Documentation — known consent_type values (extend in app code, not
-- a CHECK constraint, so adding a new one doesn't require a migration).
-- ──────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.consent_log.consent_type IS
$$Stable identifier for the consent event. Known types — extend in
src/lib/legal/consentText.ts; do not rename existing values:
  v1 (existing in production):
    'terms'                          — ToS + Privacy bundle (legacy)
    'ai_processing'                  — GDPR Art 9 explicit consent
    'health_data_authorization'      — MHMDA-style health auth
    'mhmda_wa_authorization'         — Washington MHMDA statutory wording
    'age_18_plus'                    — 18+ attestation
  v6 additions (CauseHealth_Legal_v6_GeoBlocked):
    'tos_scroll_and_accept'          — bottom-of-ToS scroll + Continue
    'privacy_scroll_and_accept'      — bottom-of-Privacy scroll + Continue
    'arbitration_class_waiver'       — standalone Section 17 checkbox (Berman)
    'state_residency_certify'        — "I am NOT a resident of CA/NY/IL/WA"
    'clinician_relationship'         — "I am an established patient of..."
    'sensitive_health_consent'       — TX TDPSA / VCDPA / CPA opt-in
    'eu_geoblock_certify'            — "I am NOT in EU/UK/CH/EEA"
    'output_ack_share_with_clin'     — output gate item 1
    'output_ack_not_clinical'        — output gate item 2
    'output_ack_liability_limited'   — output gate item 3
    'clinician_name_entered'         — clinician name + practice captured
    'auto_renewal_disclosure'        — pre-payment auto-renewal acknowledgment
$$;

COMMENT ON COLUMN public.consent_log.checkbox_text IS
  'EXACT user-facing label the user clicked. Critical for defensibility — courts/regulators want the literal text shown, not "they agreed to something."';

COMMENT ON COLUMN public.consent_log.text_version IS
  'Semantic version of checkbox_text. Bump when wording changes. Format YYYY-MM-DD-N. App imports from src/lib/legal/consentText.ts and writes the matching version.';
