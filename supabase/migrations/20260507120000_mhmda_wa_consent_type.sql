-- Add Washington MHMDA-specific consent type to consent_log.
--
-- This is required IN ADDITION to the universal 'health_data_authorization'
-- (which we already collect from every user). The MHMDA-specific screen is
-- shown ONLY to users whose IP geolocates to Washington state, and uses the
-- exact prescribed wording from RCW 19.373 — separate from any other
-- consent moment, with its own audit row.
--
-- Why both? Belt-and-suspenders. The universal authorization covers the
-- baseline GDPR / generic-MHMDA case. The WA-specific row exists so that
-- if a WA user ever sues under MHMDA's private right of action, we have a
-- timestamped, IP-stamped row showing the user saw the exact statutory
-- wording and authorized collection on a standalone screen.

ALTER TABLE public.consent_log
  DROP CONSTRAINT IF EXISTS consent_log_consent_type_check;

ALTER TABLE public.consent_log
  ADD CONSTRAINT consent_log_consent_type_check
  CHECK (consent_type IN (
    'terms',
    'ai_processing',
    'health_data_authorization',
    'mhmda_wa_authorization'
  ));

COMMENT ON COLUMN public.consent_log.consent_type IS
  'Which consent moment this row records. terms = ToS + Privacy bundle. ai_processing = GDPR Art 9 explicit consent for AI health-data processing. health_data_authorization = MHMDA-style standalone health data collection authorization (universal). mhmda_wa_authorization = Washington-state-specific MHMDA authorization with statutory wording, only collected from WA-geolocated users.';
