// src/lib/legal/consentText.ts
//
// CANONICAL CONSENT TEXT — single source of truth
// ===============================================
// Every checkbox / scroll-accept / acknowledgment in the app pulls its
// exact label from this file. The literal string + version tag both go
// into consent_log.checkbox_text and consent_log.text_version on every
// consent event.
//
// CRITICAL: do not edit a string in place without bumping its version.
// When you change wording, add a new constant with a new version. The
// existing constant becomes the historical record of what prior users
// agreed to. This is what defends the consent in court.
//
// Versioning convention: 'YYYY-MM-DD-N' (release date + bump count that
// day). Bump when the user-visible wording changes in any meaningful way
// (typos, formatting tweaks excluded — but if in doubt, bump).

import type { ConsentType } from './consentTypes';
import type { ConsentText } from './consentTextTypes';

// Bumped 2026-05-10: ToS renumbered (arbitration §17 → §9, liability §15 → §8).
// Canonical text changes below force new text_version on consent_log rows.
const v6 = '2026-05-10-1';

// ──────────────────────────────────────────────────────────────────────
// Standalone checkboxes — these MUST be unchecked by default and presented
// alongside the relevant text (not buried in a general ToS link).
// ──────────────────────────────────────────────────────────────────────

export const ARBITRATION_CHECKBOX: ConsentText = {
  type: 'arbitration_class_waiver',
  version: v6,
  text:
    'I agree to the Arbitration Agreement and Class-Action Waiver in Section 9 of the Terms of Service, including my right to opt out within 30 days.',
};

export const STATE_RESIDENCY_CHECKBOX: ConsentText = {
  type: 'state_residency_certify',
  version: v6,
  text:
    'I certify that I am NOT a current resident of California, New York, Illinois, or Washington State, and I understand the Service is not available to residents of those states.',
};

export const CLINICIAN_RELATIONSHIP_CHECKBOX: ConsentText = {
  type: 'clinician_relationship',
  version: v6,
  text:
    'I certify that I am an established patient of a licensed physician, nurse practitioner, or physician assistant, and I will review any output from CauseHealth with that clinician before making any health decision.',
};

export const SENSITIVE_HEALTH_CHECKBOX: ConsentText = {
  type: 'sensitive_health_consent',
  version: v6,
  text:
    'I consent to CauseHealth processing my sensitive health information — including bloodwork, conditions, medications, supplements, symptoms, and pregnancy status — solely to operate the Service for me, as described in Section 4 of the Privacy Policy.',
};

export const EU_GEOBLOCK_CHECKBOX: ConsentText = {
  type: 'eu_geoblock_certify',
  version: v6,
  text:
    'I certify that I am NOT located in or a resident of the European Economic Area, the United Kingdom, or Switzerland, and I understand the Service is not available outside the United States.',
};

export const AGE_18_CHECKBOX: ConsentText = {
  type: 'age_18_plus',
  version: v6,
  text: 'I certify that I am at least 18 years of age.',
};

// ──────────────────────────────────────────────────────────────────────
// Scroll-and-accept (commercial terms) — implicit assent via reaching
// the bottom of the doc and clicking Continue. Logged separately from
// the standalone checkboxes per Berman v. Freedom Financial reasoning.
// ──────────────────────────────────────────────────────────────────────

export const TOS_SCROLL_ACCEPT: ConsentText = {
  type: 'tos_scroll_and_accept',
  version: v6,
  text:
    'By clicking Continue, I acknowledge that I have read and agree to the CauseHealth Terms of Service.',
};

export const PRIVACY_SCROLL_ACCEPT: ConsentText = {
  type: 'privacy_scroll_and_accept',
  version: v6,
  text:
    'By clicking Continue, I acknowledge that I have read and agree to the CauseHealth Privacy Policy.',
};

// ──────────────────────────────────────────────────────────────────────
// Output Acknowledgment Gate — three sequential affirmations + clinician
// name. Each item logs its own row in consent_log so we have a separate
// timestamp per checkbox, which is the strongest possible evidence for
// the "physician review before health decision" element of the causal
// chain in ToS Section 11.
// ──────────────────────────────────────────────────────────────────────

export const OUTPUT_ACK_SHARE_WITH_CLINICIAN: ConsentText = {
  type: 'output_ack_share_with_clin',
  version: v6,
  text:
    'I will share and review this Doctor Prep Document with my licensed clinician before making any health decision based on it.',
};

export const OUTPUT_ACK_NOT_CLINICAL: ConsentText = {
  type: 'output_ack_not_clinical',
  version: v6,
  text:
    'I understand this Doctor Prep Document is general health information, not a clinical assessment, diagnosis, or treatment recommendation, and that reference ranges shown are population statistics that may not apply to me.',
};

export const OUTPUT_ACK_LIABILITY_LIMITED: ConsentText = {
  type: 'output_ack_liability_limited',
  version: v6,
  text:
    "I acknowledge that CauseHealth's liability for AI-generated output is limited as set forth in Section 8 of the Terms of Service.",
};

export const OUTPUT_ACK_ITEMS = [
  OUTPUT_ACK_SHARE_WITH_CLINICIAN,
  OUTPUT_ACK_NOT_CLINICAL,
  OUTPUT_ACK_LIABILITY_LIMITED,
] as const;

// ──────────────────────────────────────────────────────────────────────
// Auto-renewal disclosure (only for subscription pricing). This is the
// text that must render PHYSICALLY ABOVE the payment button — not in a
// link, not below the button. CA ARL + FTC Click-to-Cancel.
// ──────────────────────────────────────────────────────────────────────

export const AUTO_RENEWAL_DISCLOSURE: ConsentText = {
  type: 'auto_renewal_disclosure',
  version: v6,
  text:
    'Your subscription will automatically renew at $19/month until you cancel. You can cancel anytime from Settings → Billing in one click; cancellation takes effect at the end of the current billing period. By clicking Subscribe, you agree to these auto-renewal terms.',
};

// ──────────────────────────────────────────────────────────────────────
// Lookup helper — for the rare consumer that wants to render any of these
// from a known type. Most callers should import the named export directly.
// ──────────────────────────────────────────────────────────────────────

const REGISTRY: Record<ConsentType, ConsentText | null> = {
  // v6 additions
  arbitration_class_waiver: ARBITRATION_CHECKBOX,
  state_residency_certify: STATE_RESIDENCY_CHECKBOX,
  clinician_relationship: CLINICIAN_RELATIONSHIP_CHECKBOX,
  sensitive_health_consent: SENSITIVE_HEALTH_CHECKBOX,
  eu_geoblock_certify: EU_GEOBLOCK_CHECKBOX,
  age_18_plus: AGE_18_CHECKBOX,
  tos_scroll_and_accept: TOS_SCROLL_ACCEPT,
  privacy_scroll_and_accept: PRIVACY_SCROLL_ACCEPT,
  output_ack_share_with_clin: OUTPUT_ACK_SHARE_WITH_CLINICIAN,
  output_ack_not_clinical: OUTPUT_ACK_NOT_CLINICAL,
  output_ack_liability_limited: OUTPUT_ACK_LIABILITY_LIMITED,
  clinician_name_entered: { type: 'clinician_name_entered', version: v6, text: '(metadata-only consent — clinician name and practice captured)' },
  auto_renewal_disclosure: AUTO_RENEWAL_DISCLOSURE,
  // v1 legacy types — text not centralized here; existing flows continue
  // to write their own labels until they migrate to this registry.
  terms: null,
  ai_processing: null,
  health_data_authorization: null,
  mhmda_wa_authorization: null,
  // Ops-entered when a user emails to opt out of arbitration within 30
  // days. No user-facing checkbox — the consent_log row's checkbox_text
  // is set by the ops tool that records it.
  arbitration_optout: null,
};

export function getConsentText(type: ConsentType): ConsentText | null {
  return REGISTRY[type] ?? null;
}
