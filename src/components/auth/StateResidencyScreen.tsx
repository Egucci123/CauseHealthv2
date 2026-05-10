// src/components/auth/StateResidencyScreen.tsx
//
// v6 state-residency self-certification. The user picks their state of
// residence from a dropdown that does NOT include CA, NY, IL, or WA.
// They also affirm the certification with a standalone checkbox per
// the Berman v. Freedom Financial procedural-fairness reasoning.
//
// On Continue:
//   - Posts to record-consent with metadata: { state: 'PA' } (or
//     whatever was selected). The edge function side-effects this into
//     user_eligibility.certified_state + state_certified_at + IP.
//   - Server-side geofence still re-validates per IMPLEMENTATION_NOTES;
//     this screen is the user-facing self-certification half of the
//     two-layer block.
//
// If the user is on a connection that resolves to a blocked state, the
// dropdown still won't include it — they can't pick it. They can pick a
// non-blocked state and we record their attestation; if their IP says
// otherwise, that contradiction is preserved in user_eligibility for
// any later dispute (registration_geo_country / registration_geo_region
// are written by the server-side geolookup, not by this screen).

import { useRef, useState } from 'react';
import { recordConsentEvent } from '../../lib/legal/recordConsent';
import { STATE_RESIDENCY_CHECKBOX } from '../../lib/legal/consentText';
import { ALLOWED_US_STATES } from '../../lib/legal/blockedJurisdictions';
import StandaloneConsent from '../legal/StandaloneConsent';

interface Props {
  stepLabel: string;
  onAccepted: () => void;
}

export const StateResidencyScreen = ({ stepLabel, onAccepted }: Props) => {
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [stateCode, setStateCode] = useState('');
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = stateCode.length === 2 && certified && !submitting;

  const handleContinue = async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordConsentEvent({
        consent: STATE_RESIDENCY_CHECKBOX,
        presentedAt: presentedAtRef.current,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
        metadata: { state: stateCode },
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your selection. Please try again.');
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
            Where do you live?
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            CauseHealth is currently available only to U.S. residents outside of
            certain states.
          </p>
        </div>

        <div className="px-6 sm:px-8 py-6">
          <p className="text-body text-clinical-charcoal text-sm leading-relaxed mb-5">
            Select your state of residence. We are not currently available to
            residents of <strong>California, New York, Illinois, or Washington
            State</strong>; those options are not in the list. If you live in
            one of those states, please do not create an account — we&apos;ll let
            you know when we expand.
          </p>

          <div className="mb-4">
            <label
              htmlFor="state-residence"
              className="block text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-stone mb-2"
            >
              State of residence
            </label>
            <select
              id="state-residence"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2.5 border border-[#E8E3DB] rounded-md text-body text-[0.92rem] text-clinical-charcoal bg-clinical-white focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/30"
            >
              <option value="">Select your state…</option>
              {ALLOWED_US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <StandaloneConsent
            consent={STATE_RESIDENCY_CHECKBOX}
            checked={certified}
            onChange={setCertified}
            disabled={submitting}
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
            disabled={!canContinue}
            className="w-full px-5 py-3 rounded-[10px] bg-primary-container text-clinical-white text-precision text-[0.7rem] font-bold tracking-widest uppercase transition-all duration-200 hover:bg-primary-container/90 disabled:bg-clinical-stone/30 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
