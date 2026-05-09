// src/components/auth/WashingtonHealthDataConsentScreen.tsx
//
// CONSENT SCREEN 3 — Washington State MHMDA Authorization (RCW 19.373).
//
// Shown ONLY to users whose IP geolocates to Washington state. This is
// IN ADDITION to the universal health_data_authorization captured in
// HealthDataConsentScreen — the universal screen covers GDPR + general
// MHMDA-style baseline; this WA-specific screen exists so we have a
// timestamped, IP-stamped consent_log row using the exact statutory
// wording RCW 19.373 contemplates, eliminating the MHMDA private right
// of action exposure.
//
// Wording is intentionally close to verbatim what was specified — do NOT
// reword without legal review. The statutory framing matters here.

import { useRef, useState } from 'react';
import { recordConsent } from '../../lib/consent';

interface Props {
  onAccepted: () => void;
}

export const WashingtonHealthDataConsentScreen = ({ onAccepted }: Props) => {
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!checked) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordConsent({
        consentType: 'mhmda_wa_authorization',
        presentedAt: presentedAtRef.current,
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your authorization. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-cream flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-clinical-white rounded-[14px] shadow-card-md p-6 sm:p-10">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">
          Step 4 of 4
        </p>
        <h1 className="text-authority text-2xl sm:text-3xl text-clinical-charcoal font-bold mb-3 leading-tight">
          Washington State Health Data Authorization
        </h1>
        <p className="text-body text-clinical-stone text-sm sm:text-base leading-relaxed mb-6">
          Before we collect your health information, Washington state law requires us to obtain your separate authorization.
        </p>

        <div className="bg-clinical-cream/40 rounded-[10px] p-5 sm:p-6 mb-6 space-y-4">
          <div>
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-primary-container mb-1">
              We will collect:
            </p>
            <p className="text-body text-clinical-charcoal text-sm sm:text-base leading-relaxed">
              Lab results, diagnosed conditions, medications, symptoms, lifestyle data, and inferences derived from these.
            </p>
          </div>

          <div>
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-primary-container mb-1">
              We will use it to:
            </p>
            <p className="text-body text-clinical-charcoal text-sm sm:text-base leading-relaxed">
              Generate lab analysis, wellness plans, and Doctor Visit Slips through the CauseHealth service.
            </p>
          </div>

          <div>
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-primary-container mb-1">
              We will share it with:
            </p>
            <p className="text-body text-clinical-charcoal text-sm sm:text-base leading-relaxed">
              Supabase (storage), Anthropic (AI analysis), Stripe (payment), Vercel (hosting) — no one else.
            </p>
          </div>

          <div>
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-primary-container mb-1">
              Your rights:
            </p>
            <p className="text-body text-clinical-charcoal text-sm sm:text-base leading-relaxed">
              You can access, delete, or withdraw this authorization at any time from Settings.
            </p>
          </div>
        </div>

        <div className={`border-2 rounded-[10px] p-5 mb-6 transition-colors ${checked ? 'border-primary-container bg-primary-container/5' : 'border-clinical-cream'}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              disabled={submitting}
              className="mt-1 w-5 h-5 flex-shrink-0 cursor-pointer"
            />
            <span className="text-body text-clinical-charcoal text-sm sm:text-base font-semibold leading-snug">
              I authorize CauseHealth to collect and process my health data as described above.
            </span>
          </label>
        </div>

        {error && (
          <p className="text-body text-[#C94F4F] text-xs mb-3 leading-snug">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!checked || submitting}
          className={`w-full py-3.5 px-6 font-semibold text-base transition-all ${
            checked && !submitting
              ? 'bg-primary-container text-white hover:bg-primary-container/90 cursor-pointer'
              : 'bg-clinical-cream text-clinical-stone cursor-not-allowed'
          }`}
          style={{ borderRadius: '8px' }}
        >
          {submitting
            ? 'Saving your authorization…'
            : checked
            ? 'Authorize and continue'
            : 'Check the box to authorize'}
        </button>

        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider text-center mt-4 leading-snug">
          This authorization is timestamped, IP-stamped, and recorded in your account audit log per the Washington My Health My Data Act (RCW 19.373).
        </p>
      </div>
    </div>
  );
};
