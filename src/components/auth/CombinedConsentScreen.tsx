// src/components/auth/CombinedConsentScreen.tsx
//
// v6 SINGLE-SCREEN consent: ToS/Privacy scroll-and-accept + standalone
// arbitration + class-action waiver checkbox on the SAME page.
//
// Per the founder-spec (May 2026): collapse the previous two screens
// (AcceptTermsScreen + ArbitrationConsentScreen) into one. The user
// scrolls through the ToS/Privacy/Disclaimer block, then sees the
// standalone, unchecked-by-default arbitration checkbox below.
//
// Legal posture preserved:
//   • Berman v. Freedom Financial — arbitration checkbox is STILL its
//     own, clearly-labeled, unchecked-by-default checkbox with operative
//     language adjacent (not inside a link). Just rendered on the same
//     screen as the ToS scroll-and-accept.
//   • Two SEPARATE consent_log rows are written: one for 'terms', one
//     for 'arbitration_class_waiver'. The combined UI does not collapse
//     the legal record — only the visual presentation.
//
// On Accept: records BOTH consents in order. If either fails, surfaces
// the error and stops. Calls onAccepted() only after both succeed.

import { useEffect, useRef, useState } from 'react';
import { CONSENT_POLICY_VERSION, recordConsent } from '../../lib/consent';
import { recordConsentEvent } from '../../lib/legal/recordConsent';
import { ARBITRATION_CHECKBOX } from '../../lib/legal/consentText';
import StandaloneConsent from '../legal/StandaloneConsent';

interface Props {
  onAccepted: () => void;
}

export const CombinedConsentScreen = ({ onAccepted }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [arbitrationChecked, setArbitrationChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < 80) setScrolledToBottom(true);
    };
    el.addEventListener('scroll', handleScroll);
    handleScroll(); // Short-viewport case
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const canSubmit = scrolledToBottom && arbitrationChecked && !submitting;

  const handleAccept = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1. Record ToS / Privacy / Disclaimer umbrella consent.
      await recordConsent({
        consentType: 'terms',
        presentedAt: presentedAtRef.current,
      });

      // 2. Record standalone arbitration + class-action waiver consent
      //    (separate row, exact canonical text from ARBITRATION_CHECKBOX).
      await recordConsentEvent({
        consent: ARBITRATION_CHECKBOX,
        presentedAt: presentedAtRef.current,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
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
      <div
        className="w-full max-w-3xl bg-clinical-white rounded-[14px] shadow-card-md flex flex-col"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
      >
        {/* Header */}
        <div className="px-6 sm:px-8 py-5 border-b border-clinical-cream flex-shrink-0">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
            Final step before onboarding
          </p>
          <h1 className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold">
            Terms, Privacy &amp; Arbitration
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            Scroll through the agreement, then check the arbitration box below to continue.
          </p>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 sm:px-8 py-6" style={{ minHeight: '300px' }}>
          <div className="space-y-10 text-body text-clinical-charcoal text-sm leading-relaxed">

            {/* HIPAA notice */}
            <section className="bg-[#E8922A]/10 border-2 border-[#E8922A]/40 rounded-[10px] p-5">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#9A6020] mb-2">
                Important — read this first
              </p>
              <h3 className="text-authority text-base text-clinical-charcoal font-bold mb-2">
                CauseHealth is NOT a HIPAA-covered service
              </h3>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                HIPAA regulates healthcare providers, health plans, and their business associates.{' '}
                <strong>CauseHealth is a consumer wellness service you voluntarily upload your own data to — it is not any of those.</strong>{' '}
                HIPAA does NOT govern your data here.
              </p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed mt-2">
                Your data is protected by our Privacy Policy and by the FTC Health Breach Notification Rule, applied universally to every user. If you require HIPAA-covered handling, keep that information with your healthcare provider&apos;s HIPAA-covered systems instead.
              </p>
            </section>

            {/* TERMS OF SERVICE */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 1 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Terms of Service</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">1. Eligibility</h3>
              <p>You must be 18+, a U.S. resident outside CA / NY / IL / WA, and an established patient of a licensed clinician. By creating an account, you agree to be bound by these Terms.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">2. What CauseHealth Is</h3>
              <p>A <strong>consumer wellness service</strong> that helps you turn your bloodwork into a Doctor Prep Document for use with your licensed clinician.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">3. What CauseHealth Is NOT</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>NOT a medical device. NOT FDA-approved.</li>
                <li>Does NOT diagnose, treat, cure, or prevent any condition.</li>
                <li>Does NOT provide medical advice. All content is educational.</li>
                <li>Does NOT replace your physician, pharmacist, or other licensed provider.</li>
                <li>Does NOT establish a doctor-patient relationship.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">4. Your Responsibility</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>You are solely responsible for all decisions you make about your health.</li>
                <li>Always consult your clinician before starting, stopping, or modifying any medication, supplement, diet, or treatment.</li>
                <li>Medical emergency: call 911 or your local emergency number immediately.</li>
                <li>You are responsible for the accuracy of the information you provide.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">5. AI-Generated Content</h3>
              <p>CauseHealth uses Anthropic&apos;s Claude AI plus deterministic rule engines. AI output may contain errors. You agree to verify all output with a licensed clinician before acting on it.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">6. Pricing</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>$19 unlocks your account and your first lab analysis.</li>
                <li>$5 per additional lab upload.</li>
                <li>All purchases final and non-refundable once a plan has been generated.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">7. Limitation of Liability</h3>
              <p>To the maximum extent permitted by law, our total cumulative liability shall not exceed the greater of the amount you paid us in the prior 12 months or $100.</p>

              <p className="mt-4 italic text-clinical-stone text-xs">
                Full Terms at <a href="/terms" className="text-primary-container underline" target="_blank" rel="noreferrer">/terms</a>.
              </p>
            </section>

            <hr className="border-clinical-cream" />

            {/* PRIVACY POLICY */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 2 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Privacy Policy</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">What we collect</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Account:</strong> email, name, DOB, sex, state, clinician name.</li>
                <li><strong>Health (Consumer Health Data):</strong> labs, conditions, medications, symptoms, generated plans.</li>
                <li><strong>Usage:</strong> pages visited, error logs, device info, IP (fraud prevention).</li>
                <li><strong>Payment:</strong> processed by Stripe — we never see your card number or CVV.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">How we use it</h3>
              <p>To generate your personalized Doctor Prep Document, communicate with you, prevent fraud, and improve the Service via aggregated, de-identified usage data.{' '}
                <strong>We never use your individually identifiable health data to train AI models. Anthropic does not train on data submitted via its API.</strong>
              </p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Who we share with</h3>
              <p>Only the third-party processors required to run CauseHealth:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Supabase</strong> &mdash; database &amp; auth (US-hosted, encrypted at rest)</li>
                <li><strong>Anthropic</strong> &mdash; AI analysis (no training on your data)</li>
                <li><strong>Stripe</strong> &mdash; payment processing</li>
                <li><strong>Vercel</strong> &mdash; hosting / CDN</li>
              </ul>
              <p className="mt-2">
                <strong>We do NOT sell your personal information or health data, ever.</strong> No advertisers, brokers, insurers, or employers.
              </p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Your rights</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Access</strong> all data we hold (Settings &rarr; Export All Data).</li>
                <li><strong>Delete</strong> your data and account (Settings &rarr; Delete Account).</li>
                <li><strong>Withdraw consent</strong> at any time (support@causehealth.app).</li>
                <li><strong>Appeal</strong> any denial within 45 days.</li>
              </ul>
              <p className="mt-2">
                Full details at <a href="/privacy" className="text-primary-container underline" target="_blank" rel="noreferrer">/privacy</a>.
              </p>
            </section>

            <hr className="border-clinical-cream" />

            {/* MEDICAL DISCLAIMER */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 3 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Medical Disclaimer</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Educational use only</h3>
              <p>Everything in CauseHealth — lab interpretations, supplement information, AI chat — is for <strong>informational purposes only</strong>. None of it is medical advice, diagnosis, or treatment.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Always talk to your clinician</h3>
              <p>Discuss every finding, supplement change, medication adjustment, or dietary intervention with your clinician <strong>before making any change</strong>.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">AI limitations</h3>
              <p>Our analyses come from large language models with built-in clinical guardrails. AI can be wrong, inconsistent, or miss nuances a trained clinician would catch.{' '}
                <strong>Never delay medical care because of something CauseHealth told you.</strong>
              </p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Emergencies</h3>
              <p><strong>If you are having a medical emergency, call 911 or go to your nearest emergency room immediately.</strong></p>
            </section>

            <hr className="border-clinical-cream" />

            {/* End-of-document marker */}
            <section className="bg-clinical-cream/40 rounded-[10px] p-5 text-center">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">
                End of agreement
              </p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                You&apos;ve reached the bottom. Now confirm the arbitration agreement below to enable the Continue button.
              </p>
              <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide mt-3">
                Policy version {CONSENT_POLICY_VERSION}
              </p>
            </section>
          </div>
        </div>

        {/* Arbitration block + Continue — sticky footer */}
        <div className="px-6 sm:px-8 py-5 border-t border-clinical-cream flex-shrink-0 bg-clinical-white space-y-4" style={{ borderRadius: '0 0 14px 14px' }}>

          <div>
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-2">
              Arbitration agreement &amp; class-action waiver
            </p>
            <p className="text-body text-clinical-charcoal text-xs leading-relaxed mb-3">
              You agree to resolve disputes through <strong>individual arbitration</strong> — not in court — and you waive participation in any class action. You have <strong>30 days</strong> to opt out by emailing{' '}
              <a
                href="mailto:support@causehealth.app?subject=Arbitration%20Opt-Out"
                className="text-primary-container underline hover:text-primary-container/80"
              >
                support@causehealth.app
              </a>.
            </p>

            <StandaloneConsent
              consent={ARBITRATION_CHECKBOX}
              checked={arbitrationChecked}
              onChange={setArbitrationChecked}
              disabled={submitting}
              hyperlinkText="Read Section 9 →"
              hyperlinkHref="/terms#section-9"
              emphasis="high"
            />
          </div>

          {error && (
            <p className="text-body text-[#C94F4F] text-xs leading-snug">{error}</p>
          )}

          <button
            onClick={handleAccept}
            disabled={!canSubmit}
            className={`w-full py-3.5 px-6 font-semibold text-base transition-all ${
              canSubmit
                ? 'bg-primary-container text-white hover:bg-primary-container/90 cursor-pointer'
                : 'bg-clinical-cream text-clinical-stone cursor-not-allowed'
            }`}
            style={{ borderRadius: '8px' }}
          >
            {submitting
              ? 'Saving your consent…'
              : !scrolledToBottom
              ? 'Scroll to the bottom of the agreement'
              : !arbitrationChecked
              ? 'Check the arbitration box above to continue'
              : 'I agree to the Terms, Privacy Policy, and Arbitration Agreement'}
          </button>

          <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider text-center leading-snug">
            By continuing, you confirm you have read all three documents in full. Two timestamped consent records are saved — one for the Terms/Privacy/Disclaimer, one for the standalone arbitration agreement.
          </p>
        </div>
      </div>
    </div>
  );
};
