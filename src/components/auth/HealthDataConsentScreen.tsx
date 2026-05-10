// src/components/auth/HealthDataConsentScreen.tsx
//
// CONSENT SCREEN 2 of 2 — standalone health data authorization.
//
// Required to comply with:
//   - GDPR Article 9 + Recital 32: explicit, separate, specific consent
//     for processing special-category data (health). Cannot be bundled
//     with general Terms acceptance.
//   - Washington My Health My Data Act: standalone authorization to
//     collect Consumer Health Data, distinct from ToS.
//
// Each checkbox is its own consent moment, recorded as a separate row in
// consent_log. Both must be checked to proceed. The user can untick
// either to withdraw — but withdrawal blocks the Service since the data
// is required to provide it.
//
// Universal — every user, every signup. Not WA-specific. The MHMDA
// authorization language is shown to everyone so we never have a
// jurisdiction gap (Connecticut, Nevada, Texas, etc. are passing
// substantially similar laws).

import { useRef, useState } from 'react';
import { recordConsent } from '../../lib/consent';

interface Props {
  onAccepted: () => void;
}

export const HealthDataConsentScreen = ({ onAccepted }: Props) => {
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [aiChecked, setAiChecked] = useState(false);
  const [healthChecked, setHealthChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = aiChecked && healthChecked;

  const handleSubmit = async () => {
    if (!allChecked) return;
    setSubmitting(true);
    setError(null);
    try {
      // Record both consents. Sequential — if one fails, we don't proceed.
      // Each is its own row in consent_log per the legal requirement.
      await recordConsent({
        consentType: 'ai_processing',
        presentedAt: presentedAtRef.current,
      });
      await recordConsent({
        consentType: 'health_data_authorization',
        presentedAt: presentedAtRef.current,
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-cream flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-clinical-white rounded-[14px] shadow-card-md p-6 sm:p-10">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">
          Step 6 of 8
        </p>
        <h1 className="text-authority text-2xl sm:text-3xl text-clinical-charcoal font-bold mb-3 leading-tight">
          Two quick health-data authorizations
        </h1>
        <p className="text-body text-clinical-stone text-sm sm:text-base leading-relaxed mb-8">
          Before we collect your health information, we need your explicit consent for two separate things. These are required by the Washington My Health My Data Act and the EU General Data Protection Regulation. Both authorizations are required to use CauseHealth.
        </p>

        {/* CONSENT 1 — AI processing (GDPR Article 9) */}
        <div className={`border-2 rounded-[10px] p-5 mb-4 transition-colors ${aiChecked ? 'border-primary-container bg-primary-container/5' : 'border-clinical-cream'}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aiChecked}
              onChange={e => setAiChecked(e.target.checked)}
              disabled={submitting}
              className="mt-1 w-5 h-5 flex-shrink-0 cursor-pointer"
            />
            <div className="flex-1">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
                Authorization 1 — AI processing
              </p>
              <p className="text-body text-clinical-charcoal text-sm sm:text-base font-semibold leading-snug mb-2">
                I consent to my health data being processed by an AI system (Anthropic's Claude API) to generate my personalized analysis.
              </p>
              <p className="text-body text-clinical-stone text-xs sm:text-sm leading-relaxed">
                Anthropic acts as our data processor under a Data Processing Agreement and does NOT use your data to train its AI models. This authorization is required to use CauseHealth and can be withdrawn at any time by deleting your account.
              </p>
            </div>
          </label>
        </div>

        {/* CONSENT 2 — Health Data Authorization (MHMDA-compliant, shown to everyone) */}
        <div className={`border-2 rounded-[10px] p-5 mb-6 transition-colors ${healthChecked ? 'border-primary-container bg-primary-container/5' : 'border-clinical-cream'}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={healthChecked}
              onChange={e => setHealthChecked(e.target.checked)}
              disabled={submitting}
              className="mt-1 w-5 h-5 flex-shrink-0 cursor-pointer"
            />
            <div className="flex-1">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
                Authorization 2 — Health data collection
              </p>
              <p className="text-body text-clinical-charcoal text-sm sm:text-base font-semibold leading-snug mb-3">
                I authorize CauseHealth to collect and process my health data as described below.
              </p>
              <div className="bg-clinical-cream/50 rounded-[8px] p-4 space-y-2">
                <p className="text-body text-clinical-charcoal text-xs sm:text-sm">
                  <strong className="text-precision text-[0.65rem] tracking-wider">WHAT WE WILL COLLECT:</strong> Lab results, diagnosed conditions, medications, symptoms, lifestyle data, and inferences derived from these (e.g., pattern flags, multi-marker correlations).
                </p>
                <p className="text-body text-clinical-charcoal text-xs sm:text-sm">
                  <strong className="text-precision text-[0.65rem] tracking-wider">HOW WE WILL USE IT:</strong> To generate your lab analysis, wellness plans, and Doctor Visit Slips through the CauseHealth service.
                </p>
                <p className="text-body text-clinical-charcoal text-xs sm:text-sm">
                  <strong className="text-precision text-[0.65rem] tracking-wider">WHO WE WILL SHARE IT WITH:</strong> Supabase (storage), Anthropic (AI analysis), Stripe (payment), Vercel (hosting). No one else. We do NOT sell health data.
                </p>
                <p className="text-body text-clinical-charcoal text-xs sm:text-sm">
                  <strong className="text-precision text-[0.65rem] tracking-wider">YOUR RIGHTS:</strong> You can access, export, delete, or withdraw this authorization at any time from Settings. Withdrawal ends your ability to use the Service.
                </p>
              </div>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-body text-[#C94F4F] text-xs mb-3 leading-snug">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          className={`w-full py-3.5 px-6 font-semibold text-base transition-all ${
            allChecked && !submitting
              ? 'bg-primary-container text-white hover:bg-primary-container/90 cursor-pointer'
              : 'bg-clinical-cream text-clinical-stone cursor-not-allowed'
          }`}
          style={{ borderRadius: '8px' }}
        >
          {submitting
            ? 'Saving your authorizations…'
            : allChecked
            ? 'Continue'
            : 'Check both boxes to continue'}
        </button>

        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider text-center mt-4 leading-snug">
          Each authorization is a separate, timestamped record. You can withdraw either at any time from Settings &rarr; Privacy.
        </p>
      </div>
    </div>
  );
};
