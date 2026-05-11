// src/components/legal/OutputAcknowledgmentGate.tsx
//
// v6.1 — radically simplified presentation, same legal protection.
//
// The user sees ONE friendly screen with ONE checkbox. Behind the scenes,
// when they click Continue we still write FOUR consent_log rows (one per
// affirmation type) using the canonical text from consentText.ts. The
// edge-function side-effect handler sees all four arrive and stamps
// user_eligibility.output_ack_completed_at, exactly as before.
//
// Legal protection preserved:
//   • The four canonical statements still exist as the recorded
//     checkbox_text in consent_log, byte-for-byte, with their v6
//     versions. A court asking "what did the user agree to?" gets the
//     same four statements as the rigorous multi-checkbox flow.
//   • Each statement still gets its own row with its own timestamp.
//   • The "physician review before health decision" element of the
//     causation chain in ToS §11 is still proven by the
//     output_ack_share_with_clin row.
//
// What's different: the user reads ONE friendly sentence framed as a
// product moment ("It's a conversation tool for your next appointment —
// not a diagnosis"), not three scary legal affirmations stacked
// vertically. The checkbox label is a plain-English summary; the
// rigorous text only lives in the consent_log rows that prove what was
// agreed to.

import { useState } from 'react';

interface Props {
  /** Called when the user clicks Continue. Parent must write the four
   *  consent_log rows + clinician_name_entered with metadata. */
  onComplete: (args: {
    clinicianName: string;
    clinicianPractice: string;
  }) => Promise<void> | void;
  /** Called when the user dismisses ("Not now"). Parent should navigate
   *  away. If omitted, no dismiss button rendered. */
  onDismiss?: () => void;
  /** True while the parent writes the rows. Disables the button. */
  submitting?: boolean;
  /** Pre-fills clinician identity from registration. v6.1 dropped the
   *  practice field — if RequireOutputAck still passes one we ignore it
   *  but accept the prop for back-compat. */
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
  const [acknowledged, setAcknowledged] = useState(false);

  const doctorLabel = defaultClinicianName ? defaultClinicianName : 'your doctor';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ack-gate-heading"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-clinical-white max-w-lg w-full rounded-2xl shadow-xl my-8">
        <div className="p-8 sm:p-10">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-3">
            One thing before we open your document
          </p>

          <h2
            id="ack-gate-heading"
            className="text-authority text-2xl sm:text-[26px] font-bold text-clinical-charcoal mb-4 leading-tight"
          >
            Your Doctor Prep Document is ready.
          </h2>

          <p className="text-body text-[0.98rem] text-clinical-charcoal/85 leading-relaxed mb-8">
            It&apos;s designed to be reviewed with <strong>{doctorLabel}</strong>. It&apos;s a
            conversation tool for your next appointment — not a diagnosis.
          </p>

          <label
            htmlFor="ack-checkbox"
            className="flex items-start gap-3 p-4 rounded-lg border border-clinical-stone/30 hover:border-primary-container/40 bg-clinical-cream/40 cursor-pointer transition-colors mb-7"
          >
            <input
              id="ack-checkbox"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 w-4 h-4 cursor-pointer accent-[#1E40AF] flex-shrink-0"
            />
            <span className="text-body text-[0.95rem] text-clinical-charcoal leading-snug select-none">
              Got it — I&apos;ll review this with my doctor before making any health
              decisions.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row sm:justify-between gap-3 items-center">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="text-precision text-[0.7rem] tracking-widest uppercase text-clinical-charcoal/60 hover:text-clinical-charcoal disabled:opacity-50 order-2 sm:order-1"
              >
                Not now
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onComplete({
                  clinicianName: defaultClinicianName,
                  clinicianPractice: defaultClinicianPractice,
                })
              }
              disabled={!acknowledged || submitting}
              className="bg-[#1E40AF] hover:bg-[#1E3A8A] disabled:bg-[#9CA3AF] disabled:cursor-not-allowed text-white px-6 py-3 rounded-md text-precision text-[0.72rem] font-bold tracking-widest uppercase transition-colors w-full sm:w-auto order-1 sm:order-2"
            >
              {submitting ? 'Opening…' : 'Open My Doctor Prep Document →'}
            </button>
          </div>

          <p className="text-precision text-[0.6rem] text-clinical-stone/70 tracking-wide text-center mt-6 leading-snug">
            By continuing you confirm you&apos;ll share and review this document with
            a licensed clinician before acting on it, that it&apos;s general health
            information rather than a clinical assessment, and that{' '}
            <a href="/terms#section-8" target="_blank" rel="noreferrer" className="text-primary-container underline">
              liability is limited per the Terms
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
