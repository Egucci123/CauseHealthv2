// src/components/auth/AgeGateScreen.tsx
//
// CONSENT SCREEN 1 of 4 — 18+ age attestation.
//
// Shown post-auth, before any other consent. Universal — applies to email,
// magic-link, AND Google sign-in flows (the inline Register checkbox only
// catches email/password signups; Google bypasses the form entirely, so
// without this gate Google users would never affirm 18+).
//
// The DOB collected later in onboarding (Step 1) re-validates this with an
// actual birthdate. This screen is the upfront attestation that gets
// IP-stamped + audit-logged in consent_log.

import { useRef, useState } from 'react';
import { recordConsent } from '../../lib/consent';

interface Props {
  onAccepted: () => void;
}

export const AgeGateScreen = ({ onAccepted }: Props) => {
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [confirmed, setConfirmed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!confirmed) return;
    setAccepting(true);
    setError(null);
    try {
      await recordConsent({
        consentType: 'age_18_plus',
        presentedAt: presentedAtRef.current,
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your confirmation. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-cream flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-clinical-white rounded-[14px] shadow-card-md flex flex-col">
        {/* Header */}
        <div className="px-6 sm:px-8 py-5 border-b border-clinical-cream">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
            Step 1 of 8
          </p>
          <h1 className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold">
            Age confirmation
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            CauseHealth is for adults only. Please confirm your age to continue.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 py-6">
          <p className="text-body text-clinical-charcoal text-sm leading-relaxed mb-5">
            Our Terms require all users to be at least 18 years old, and we don&apos;t
            offer a parental-consent flow for minors. Your date of birth will be
            collected during onboarding and must match this confirmation.
          </p>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none p-3 -mx-3 rounded-[10px] hover:bg-clinical-cream/50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-2 border-clinical-stone/40 text-primary-container focus:ring-primary-container/30 cursor-pointer flex-shrink-0"
            />
            <span className="text-body text-clinical-charcoal text-sm leading-relaxed">
              I confirm I am <strong>18 years of age or older</strong> and legally
              able to enter into this agreement.
            </span>
          </label>

          {error && (
            <div className="mt-4 px-3 py-2 rounded-[8px] bg-red-50 border border-red-200">
              <p className="text-body text-red-700 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-clinical-cream">
          <button
            onClick={handleAccept}
            disabled={!confirmed || accepting}
            className="w-full px-5 py-3 rounded-[10px] bg-primary-container text-clinical-white text-precision text-[0.7rem] font-bold tracking-widest uppercase transition-all duration-200 hover:bg-primary-container/90 disabled:bg-clinical-stone/30 disabled:cursor-not-allowed"
          >
            {accepting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
