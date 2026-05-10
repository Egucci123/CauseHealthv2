// src/components/auth/StandaloneConsentScreen.tsx
//
// Generic single-consent screen used for the v6 standalone consents
// (arbitration, EU geoblock, clinician attestation). Each one shows:
//   - "Step N of M" eyebrow
//   - title + subtitle
//   - body copy explaining the consent
//   - the canonical checkbox label (from src/lib/legal/consentText.ts)
//     in a high-emphasis block
//   - optional adjacent hyperlink (NOT inside the label)
//   - Continue button enabled only after the box is checked
//
// On Continue, posts to record-consent via the v6 client helper which
// writes the EXACT label byte-for-byte to consent_log.checkbox_text.
//
// State-residency screen has a custom variant (StateResidencyScreen)
// because it also captures a state code via dropdown.

import { useRef, useState } from 'react';
import StandaloneConsent from '../legal/StandaloneConsent';
import { recordConsentEvent } from '../../lib/legal/recordConsent';
import type { ConsentText } from '../../lib/legal/consentTextTypes';

interface Props {
  /** Canonical consent constant from src/lib/legal/consentText.ts.
   *  Source of the type, version, and exact checkbox label. */
  consent: ConsentText;
  /** Eyebrow label e.g. "Step 4 of 9". */
  stepLabel: string;
  /** Screen heading. */
  title: string;
  /** Single sentence under the heading. */
  subtitle: string;
  /** Body paragraph(s) before the checkbox. Plain string or JSX. */
  body: React.ReactNode;
  /** Optional adjacent hyperlink for the checkbox (e.g., "Read Section 17"). */
  hyperlinkText?: string;
  hyperlinkHref?: string;
  /** Optional metadata to attach to the consent_log row (jsonb). */
  metadata?: Record<string, unknown>;
  /** Called once consent successfully recorded. ConsentGate calls
   *  recordedAndRefresh from this. */
  onAccepted: () => void;
}

export const StandaloneConsentScreen = ({
  consent,
  stepLabel,
  title,
  subtitle,
  body,
  hyperlinkText,
  hyperlinkHref,
  metadata,
  onAccepted,
}: Props) => {
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!checked) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordConsentEvent({
        consent,
        presentedAt: presentedAtRef.current,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
        metadata,
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your confirmation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-cream flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-clinical-white rounded-[14px] shadow-card-md flex flex-col">
        <div className="px-6 sm:px-8 py-5 border-b border-clinical-cream">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
            {stepLabel}
          </p>
          <h1 className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold">
            {title}
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            {subtitle}
          </p>
        </div>

        <div className="px-6 sm:px-8 py-6">
          <div className="text-body text-clinical-charcoal text-sm leading-relaxed mb-5">
            {body}
          </div>

          <StandaloneConsent
            consent={consent}
            checked={checked}
            onChange={setChecked}
            disabled={submitting}
            hyperlinkText={hyperlinkText}
            hyperlinkHref={hyperlinkHref}
            emphasis="high"
          />

          {error && (
            <div className="mt-4 px-3 py-2 rounded-[8px] bg-red-50 border border-red-200">
              <p className="text-body text-red-700 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-clinical-cream">
          <button
            onClick={handleContinue}
            disabled={!checked || submitting}
            className="w-full px-5 py-3 rounded-[10px] bg-primary-container text-clinical-white text-precision text-[0.7rem] font-bold tracking-widest uppercase transition-all duration-200 hover:bg-primary-container/90 disabled:bg-clinical-stone/30 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
