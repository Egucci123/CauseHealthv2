// src/lib/legal/consentTypes.ts
//
// Closed enum of consent_type values written to consent_log.
// The DB CHECK constraint was dropped in 20260509250000 to avoid bumping
// the constraint on every release; this file is the app-side enforcement.

export type ConsentType =
  // v1 (existing in production via 20260506210000 + 20260507120000)
  | 'terms'
  | 'ai_processing'
  | 'health_data_authorization'
  | 'mhmda_wa_authorization'
  | 'age_18_plus'
  // v6 additions
  | 'tos_scroll_and_accept'
  | 'privacy_scroll_and_accept'
  | 'arbitration_class_waiver'
  | 'state_residency_certify'
  | 'clinician_relationship'
  | 'sensitive_health_consent'
  | 'eu_geoblock_certify'
  | 'output_ack_share_with_clin'
  | 'output_ack_not_clinical'
  | 'output_ack_liability_limited'
  | 'clinician_name_entered'
  | 'auto_renewal_disclosure';

/** Consents that must be present (with current version) before account
 *  registration completes. Order is the recommended UI order. */
export const SIGNUP_REQUIRED_CONSENTS: ConsentType[] = [
  'age_18_plus',
  'state_residency_certify',
  'eu_geoblock_certify',
  'clinician_relationship',
  'sensitive_health_consent',
  'tos_scroll_and_accept',
  'privacy_scroll_and_accept',
  'arbitration_class_waiver',
];

/** Consents that must be present before the user can view ANY AI-generated
 *  Doctor Prep Document. Captured at the output-acknowledgment gate. */
export const OUTPUT_GATE_REQUIRED_CONSENTS: ConsentType[] = [
  'output_ack_share_with_clin',
  'output_ack_not_clinical',
  'output_ack_liability_limited',
  'clinician_name_entered',
];
