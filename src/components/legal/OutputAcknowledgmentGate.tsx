// src/components/legal/OutputAcknowledgmentGate.tsx
//
// MANDATORY GATE before any AI-generated Doctor Prep Document is shown.
// Per the v6 implementation spec, this is the operationally most
// important consent surface — it generates the strongest evidence for
// the "physician review before health decision" element of the causal
// chain in ToS Section 11.
//
// Three sequential affirmative statements + a free-text clinician name
// + practice. Each affirmation logs ITS OWN row in consent_log so we
// have separate, ordered timestamps proving the user read and clicked
// each one in sequence — not a single bundled "I agree."
//
// Flow:
//   1. Item 1 enabled, items 2–3 disabled
//   2. User checks item 1 → log row → unlock item 2
//   3. User checks item 2 → log row → unlock item 3
//   4. User checks item 3 → log row → unlock the clinician fields
//   5. User enters clinician name + practice → log row → unlock Continue
//   6. Continue → updates user_eligibility.output_ack_completed_at →
//      navigates to the output
//
// Wire this in front of every page that renders AI output:
//   - /labs/:id  (after analysis_result is loaded)
//   - /wellness-plan
//   - /doctor-prep
// Once user_eligibility.output_ack_completed_at is set, the gate doesn't
// re-fire (one-time per user). If the legal text version is bumped, the
// next render checks the latest consent_log rows against the current
// version and re-fires if any are stale.

import { useState } from 'react';
import StandaloneConsent from './StandaloneConsent';
import {
  OUTPUT_ACK_SHARE_WITH_CLINICIAN,
  OUTPUT_ACK_NOT_CLINICAL,
  OUTPUT_ACK_LIABILITY_LIMITED,
} from '../../lib/legal/consentText';

interface Props {
  /** Called once all four steps complete. Parent should call the
   *  record-consent edge function for each individual checkbox event
   *  AND the clinician_name_entered event with metadata. */
  onComplete: (args: {
    clinicianName: string;
    clinicianPractice: string;
  }) => Promise<void> | void;
  /** Called when the user dismisses the gate without completing it.
   *  Parent should navigate them away from any output page. */
  onDismiss?: () => void;
  /** Render-blocking — set true while the parent is recording the
   *  consent rows. Disables all inputs to prevent double-submit. */
  submitting?: boolean;
  /** Pre-fills the clinician name + practice from registration so the
   *  user just confirms or edits instead of retyping. The output ack
   *  still records its own clinician_name_entered consent at this
   *  moment with whatever values are submitted (which may have been
   *  edited from the pre-fill). */
  defaultClinicianName?: string;
  defaultClinicianPractice?: string;
}

export default function OutputAcknowledgmentGate({
  onComplete,
  onDismiss,
  submitting = false,
  defaultClinicianName = '',
  defaultClinicianPractice = '',
}: Props) {
  const [item1, setItem1] = useState(false);
  const [item2, setItem2] = useState(false);
  const [item3, setItem3] = useState(false);
  const [clinicianName, setClinicianName] = useState(defaultClinicianName);
  const [clinicianPractice, setClinicianPractice] = useState(defaultClinicianPractice);

  const item2Enabled = item1 && !submitting;
  const item3Enabled = item1 && item2 && !submitting;
  const clinicianFieldsEnabled = item1 && item2 && item3 && !submitting;
  const continueEnabled =
    item1 && item2 && item3 &&
    clinicianName.trim().length >= 2 &&
    clinicianPractice.trim().length >= 2 &&
    !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-gate-heading"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-clinical-white max-w-2xl w-full rounded-lg shadow-xl my-8">
        <div className="p-6 sm:p-8">
          <h2
            id="ack-gate-heading"
            className="text-authority text-2xl font-bold text-clinical-charcoal mb-3"
          >
            Your Doctor Prep Document is ready
          </h2>
          <p className="text-body text-[0.95rem] text-clinical-charcoal/80 mb-6 leading-relaxed">
            It&apos;s designed to be reviewed with{' '}
            {defaultClinicianName ? (
              <strong>{defaultClinicianName}</strong>
            ) : (
              <strong>your doctor</strong>
            )}
            {defaultClinicianPractice ? (
              <> at <strong>{defaultClinicianPractice}</strong></>
            ) : null}
            . Before we open it, let&apos;s make sure we&apos;re on the same page —
            three quick confirmations.
          </p>

          {/* Step 1 */}
          <div className="mb-3">
            <StandaloneConsent
              consent={OUTPUT_ACK_SHARE_WITH_CLINICIAN}
              checked={item1}
              onChange={setItem1}
              disabled={submitting}
              emphasis="high"
            />
          </div>

          {/* Step 2 — locked until step 1 */}
          <div className={`mb-3 ${item2Enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <StandaloneConsent
              consent={OUTPUT_ACK_NOT_CLINICAL}
              checked={item2}
              onChange={setItem2}
              disabled={!item2Enabled}
              emphasis="high"
            />
          </div>

          {/* Step 3 — locked until step 2 */}
          <div className={`mb-3 ${item3Enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <StandaloneConsent
              consent={OUTPUT_ACK_LIABILITY_LIMITED}
              checked={item3}
              onChange={setItem3}
              disabled={!item3Enabled}
              emphasis="high"
              hyperlinkText="Read Section 15"
              hyperlinkHref="/terms#section-15"
            />
          </div>

          {/* Clinician identification — locked until all 3 checks */}
          <div
            className={`mt-6 p-4 rounded-md border border-[#E8E3DB] bg-[#FAFAF7] transition-opacity ${
              clinicianFieldsEnabled ? '' : 'opacity-40 pointer-events-none'
            }`}
          >
            <p className="text-body text-[0.88rem] text-clinical-charcoal font-medium mb-3">
              {defaultClinicianName
                ? "Confirm the clinician you'll review this with — edit if it's changed."
                : "Tell us which clinician you'll review this with."}
            </p>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="clinician-name"
                  className="block text-body text-[0.82rem] text-clinical-charcoal font-medium mb-1"
                >
                  Clinician name (e.g., Dr. Jane Doe)
                </label>
                <input
                  id="clinician-name"
                  type="text"
                  value={clinicianName}
                  onChange={(e) => setClinicianName(e.target.value)}
                  disabled={!clinicianFieldsEnabled}
                  placeholder="Dr. Jane Doe"
                  className="w-full px-3 py-2 border border-clinical-stone/40 rounded-md text-body text-[0.95rem] text-clinical-charcoal placeholder:text-clinical-stone/60 bg-clinical-white focus:outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/30 disabled:bg-clinical-cream disabled:text-clinical-charcoal disabled:cursor-not-allowed"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label
                  htmlFor="clinician-practice"
                  className="block text-body text-[0.82rem] text-clinical-charcoal font-medium mb-1"
                >
                  Practice or clinic name
                </label>
                <input
                  id="clinician-practice"
                  type="text"
                  value={clinicianPractice}
                  onChange={(e) => setClinicianPractice(e.target.value)}
                  placeholder="Penn Internal Medicine"
                  disabled={!clinicianFieldsEnabled}
                  className="w-full px-3 py-2 border border-clinical-stone/40 rounded-md text-body text-[0.95rem] text-clinical-charcoal placeholder:text-clinical-stone/60 bg-clinical-white focus:outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/30 disabled:bg-clinical-cream disabled:text-clinical-charcoal disabled:cursor-not-allowed"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:justify-between gap-3">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="text-precision text-[0.7rem] tracking-widest uppercase text-clinical-charcoal/60 hover:text-clinical-charcoal disabled:opacity-50"
              >
                Not now
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onComplete({
                  clinicianName: clinicianName.trim(),
                  clinicianPractice: clinicianPractice.trim(),
                })
              }
              disabled={!continueEnabled}
              className="bg-[#1E40AF] hover:bg-[#1E3A8A] disabled:bg-[#9CA3AF] disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-md text-precision text-[0.72rem] font-bold tracking-widest uppercase transition-colors"
            >
              {submitting ? 'Saving…' : 'Continue to Document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
