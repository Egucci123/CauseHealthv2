// src/lib/legal/recordSignupConsents.ts
//
// Batch-record the implicit consents captured by the Register form.
// Per the v6 lawyer reframe (May 2026): the form fields themselves
// (state dropdown, clinician name) ARE the legal attestations. We
// just need to log them to consent_log so the evidence trail exists,
// without showing the user a separate screen for each.
//
// Captured here:
//   • age_18_plus               — from the 18+ checkbox on the form
//   • state_residency_certify   — implicit by submitting with a non-
//                                 blocked state in the dropdown
//                                 (metadata: { state })
//   • eu_geoblock_certify       — implicit by submitting with a US
//                                 state (the dropdown is US-only)
//   • clinician_relationship    — implicit by entering a clinician
//                                 name on the form
//   • clinician_name_entered    — name + practice (metadata)
//   • sensitive_health_consent  — collapsed into the ToS scroll-and-
//                                 accept that runs next; logged here
//                                 too as belt-and-suspenders since the
//                                 same legal coverage is in the ToS.
//
// The arbitration_class_waiver and tos_scroll_and_accept consents are
// captured AFTER this on dedicated screens — those two cannot be
// collapsed (Berman v. Freedom Financial + ToS clear-and-conspicuous
// requirements).

import { recordConsentEvent } from './recordConsent';
import {
  AGE_18_CHECKBOX,
  STATE_RESIDENCY_CHECKBOX,
  EU_GEOBLOCK_CHECKBOX,
  CLINICIAN_RELATIONSHIP_CHECKBOX,
  SENSITIVE_HEALTH_CHECKBOX,
} from './consentText';
import type { ConsentText } from './consentTextTypes';

const CLINICIAN_NAME_VERSION = '2026-05-09-1';

function clinicianNameConsent(): ConsentText {
  return {
    type: 'clinician_name_entered',
    version: CLINICIAN_NAME_VERSION,
    text:
      'I have entered the name and practice of the licensed clinician I plan to review my Doctor Prep Document with.',
  };
}

interface Args {
  ageConfirmed: boolean;
  state: string;
  clinicianName: string;
  clinicianPractice: string;
}

/** Run after a successful signUp() — best-effort. Failures are logged
 *  but never block the signup; the post-signup ConsentGate will still
 *  capture the non-collapsible pieces (ToS, arbitration). */
export async function recordPostSignupConsents(args: Args): Promise<void> {
  const presentedAt = new Date().toISOString();
  const pageUrl = typeof window !== 'undefined' ? window.location.pathname : undefined;

  // Each event is independent — if one fails we keep going so other
  // legal coverage still gets stamped.
  const tasks: Promise<unknown>[] = [];

  if (args.ageConfirmed) {
    tasks.push(
      recordConsentEvent({ consent: AGE_18_CHECKBOX, presentedAt, pageUrl }).catch((e) =>
        console.warn('[postSignupConsents] age_18_plus:', e?.message),
      ),
    );
  }
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
  if (args.clinicianName && args.clinicianPractice) {
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
          practice: args.clinicianPractice,
          captured_via: 'register_form_doctor_field',
        },
      }).catch((e) =>
        console.warn('[postSignupConsents] clinician_name_entered:', e?.message),
      ),
    );
  }
  // Sensitive health — covered in the post-signup ToS scroll-and-
  // accept too, but we stamp it here so the form-submission moment
  // also has explicit evidence.
  tasks.push(
    recordConsentEvent({
      consent: SENSITIVE_HEALTH_CHECKBOX,
      presentedAt,
      pageUrl,
      metadata: { captured_via: 'register_form_implicit' },
    }).catch((e) => console.warn('[postSignupConsents] sensitive_health_consent:', e?.message)),
  );

  await Promise.allSettled(tasks);
}
