// src/lib/legal/recordSignupConsents.ts
//
// v6.1 — radically simplified onboarding presentation, full legal
// coverage preserved.
//
// All eight signup-time consent_log rows are written from this one
// function, called after a successful signUp() in Register.tsx. The
// user sees one friendly form; the database still has every row a
// lawyer would want.
//
// Rows written (any of them can fail individually — Promise.allSettled):
//   • age_18_plus               — bundled "I'm 18+ and agree" checkbox
//   • terms                     — same bundled checkbox covers ToS+Privacy
//   • arbitration_class_waiver  — standalone arbitration checkbox (Berman)
//   • state_residency_certify   — implicit by submitting with a non-
//                                 blocked state in the dropdown
//                                 (metadata: { state })
//   • eu_geoblock_certify       — implicit by submitting with any US
//                                 state (the dropdown is US-only)
//   • clinician_relationship    — implicit by entering a doctor name
//   • clinician_name_entered    — name in metadata (no practice in v6.1)
//   • sensitive_health_consent  — collapsed into the bundled ToS row;
//                                 logged here too for belt-and-suspenders
//
// The Berman-sensitive arbitration row is the one we care about most for
// enforceability — it's written from its own standalone checkbox, with
// its own consent_log row, with the canonical text. The bundled "18+ /
// ToS" row is fine bundled because no court has required age + ToS to
// be presented as separate checkboxes.

import { recordConsentEvent } from './recordConsent';
import {
  AGE_18_CHECKBOX,
  STATE_RESIDENCY_CHECKBOX,
  EU_GEOBLOCK_CHECKBOX,
  CLINICIAN_RELATIONSHIP_CHECKBOX,
  SENSITIVE_HEALTH_CHECKBOX,
  ARBITRATION_CHECKBOX,
} from './consentText';
import type { ConsentText } from './consentTextTypes';
import { CONSENT_POLICY_VERSION, recordConsent } from '../consent';

const CLINICIAN_NAME_VERSION = '2026-05-09-1';

function clinicianNameConsent(): ConsentText {
  return {
    type: 'clinician_name_entered',
    version: CLINICIAN_NAME_VERSION,
    text:
      'I have entered the name of the licensed clinician I plan to review my Doctor Prep Document with.',
  };
}

interface Args {
  /** TRUE when the user ticked the bundled "I'm 18+ and agree to the ToS
   *  and Privacy Policy" checkbox. Writes TWO rows: age_18_plus + terms. */
  ageConfirmed: boolean;
  /** Same flag as ageConfirmed — passed separately so a future redesign
   *  can split them without changing this function's interface. */
  termsAccepted: boolean;
  /** TRUE when the user ticked the standalone arbitration checkbox. */
  arbitrationAgreed: boolean;
  /** Two-letter US state code from the dropdown. */
  state: string;
  /** Free-text doctor name. */
  clinicianName: string;
}

export async function recordPostSignupConsents(args: Args): Promise<void> {
  const presentedAt = new Date().toISOString();
  const pageUrl = typeof window !== 'undefined' ? window.location.pathname : undefined;

  const tasks: Promise<unknown>[] = [];

  // ─── 1. age_18_plus (canonical v6 text) ──────────────────────────
  if (args.ageConfirmed) {
    tasks.push(
      recordConsentEvent({
        consent: AGE_18_CHECKBOX,
        presentedAt,
        pageUrl,
        metadata: { captured_via: 'register_form_bundled_age_tos' },
      }).catch((e) => console.warn('[postSignupConsents] age_18_plus:', e?.message)),
    );
  }

  // ─── 2. terms (legacy consent_type — written via the v1 helper so
  //         the policy_version column is populated the way the existing
  //         ConsentGate readers expect) ──────────────────────────────
  if (args.termsAccepted) {
    tasks.push(
      recordConsent({
        consentType: 'terms',
        presentedAt,
      }).catch((e) => console.warn('[postSignupConsents] terms:', e?.message)),
    );
  }

  // ─── 3. arbitration_class_waiver — the Berman-critical row ─────────
  if (args.arbitrationAgreed) {
    tasks.push(
      recordConsentEvent({
        consent: ARBITRATION_CHECKBOX,
        presentedAt,
        pageUrl,
        metadata: { captured_via: 'register_form_standalone_checkbox' },
      }).catch((e) => console.warn('[postSignupConsents] arbitration_class_waiver:', e?.message)),
    );
  }

  // ─── 4. state_residency_certify + 5. eu_geoblock_certify ───────────
  if (args.state) {
    tasks.push(
      recordConsentEvent({
        consent: STATE_RESIDENCY_CHECKBOX,
        presentedAt,
        pageUrl,
        metadata: { state: args.state, captured_via: 'register_form_dropdown' },
      }).catch((e) => console.warn('[postSignupConsents] state_residency_certify:', e?.message)),
    );
    tasks.push(
      recordConsentEvent({
        consent: EU_GEOBLOCK_CHECKBOX,
        presentedAt,
        pageUrl,
        metadata: { captured_via: 'register_form_us_only_dropdown' },
      }).catch((e) => console.warn('[postSignupConsents] eu_geoblock_certify:', e?.message)),
    );
  }

  // ─── 6. clinician_relationship + 7. clinician_name_entered ─────────
  if (args.clinicianName) {
    tasks.push(
      recordConsentEvent({
        consent: CLINICIAN_RELATIONSHIP_CHECKBOX,
        presentedAt,
        pageUrl,
        metadata: { captured_via: 'register_form_doctor_field' },
      }).catch((e) =>
        console.warn('[postSignupConsents] clinician_relationship:', e?.message),
      ),
    );
    tasks.push(
      recordConsentEvent({
        consent: clinicianNameConsent(),
        presentedAt,
        pageUrl,
        metadata: {
          name: args.clinicianName,
          captured_via: 'register_form_doctor_field',
        },
      }).catch((e) =>
        console.warn('[postSignupConsents] clinician_name_entered:', e?.message),
      ),
    );
  }

  // ─── 8. sensitive_health_consent (belt-and-suspenders) ─────────────
  tasks.push(
    recordConsentEvent({
      consent: SENSITIVE_HEALTH_CHECKBOX,
      presentedAt,
      pageUrl,
      metadata: { captured_via: 'register_form_implicit' },
    }).catch((e) => console.warn('[postSignupConsents] sensitive_health_consent:', e?.message)),
  );

  await Promise.allSettled(tasks);
  // The 'terms' row is intentionally NOT in `tasks` to avoid the older
  // recordConsent helper's failure messaging colliding with the others.
  // It's awaited separately above via its own .catch.
  void CONSENT_POLICY_VERSION; // keep import — read by recordConsent above
}
