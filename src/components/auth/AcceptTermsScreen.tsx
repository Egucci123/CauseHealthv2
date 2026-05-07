// src/components/auth/AcceptTermsScreen.tsx
//
// CONSENT SCREEN 1 of 2 — Terms of Service + Privacy Policy + Medical Disclaimer.
//
// Shown after auth, before any health data is collected. The user must
// scroll through the entire combined document before the Accept button
// enables — defensible audit trail proving they read it.
//
// On accept: records ONLY the 'terms' consent type into consent_log via
// the record-consent edge function. The AI processing consent and health
// data authorization are captured on Screen 2 — NEVER bundled with this
// one (GDPR Recital 32 + Washington MHMDA require separate moments).
//
// Universal — same gate for every new user, every signup. Re-shown when
// CONSENT_POLICY_VERSION changes.

import { useEffect, useRef, useState } from 'react';
import { CONSENT_POLICY_VERSION, recordConsent } from '../../lib/consent';

interface Props {
  onAccepted: () => void;
}

export const AcceptTermsScreen = ({ onAccepted }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const presentedAtRef = useRef<string>(new Date().toISOString());
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepting, setAccepting] = useState(false);
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
    handleScroll(); // Handle short-viewport case where content is already at bottom
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAccept = async () => {
    if (!scrolledToBottom) return;
    setAccepting(true);
    setError(null);
    try {
      await recordConsent({
        consentType: 'terms',
        presentedAt: presentedAtRef.current,
      });
      onAccepted();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your consent. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-clinical-cream flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl bg-clinical-white rounded-[14px] shadow-card-md flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }}>
        {/* Header */}
        <div className="px-6 sm:px-8 py-5 border-b border-clinical-cream flex-shrink-0">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
            Step 1 of 2
          </p>
          <h1 className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold">
            Terms of Service, Privacy Policy &amp; Medical Disclaimer
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            Scroll to the bottom to enable the Accept button. Reading these in full is required.
          </p>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 sm:px-8 py-6" style={{ minHeight: '300px' }}>
          <div className="space-y-10 text-body text-clinical-charcoal text-sm leading-relaxed">

            {/* TERMS OF SERVICE — condensed */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 1 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Terms of Service</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">1. Acceptance &amp; Eligibility</h3>
              <p>You must be 18+ and legally able to enter contracts. By creating an account, you agree to be bound by these Terms.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">2. What CauseHealth Is</h3>
              <p>CauseHealth is a <strong>consumer health information and wellness service</strong>. We help you understand your bloodwork, identify patterns in your labs / medications / conditions / symptoms, and prepare for conversations with your healthcare provider.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">3. What CauseHealth Is NOT</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>NOT a medical device. NOT FDA-approved or cleared.</li>
                <li>NOT diagnostic. We do not diagnose, treat, cure, or prevent any condition.</li>
                <li>NOT medical advice. All content is educational.</li>
                <li>NOT a replacement for your physician, pharmacist, or other licensed provider.</li>
                <li>Does not establish a doctor-patient relationship.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">4. Your Responsibility</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>You are solely responsible for all decisions you make about your health.</li>
                <li>Always consult a qualified healthcare provider before starting, stopping, or modifying any medication, supplement, diet, or treatment.</li>
                <li>Do not delay seeking medical attention based on CauseHealth.</li>
                <li>Medical emergency: call 911 or your local emergency number immediately.</li>
                <li>You are responsible for the accuracy of the information you provide.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">5. AI-Generated Content</h3>
              <p>CauseHealth uses Anthropic's Claude AI plus rule-based engines to analyze your data. AI-generated content may contain errors or inaccuracies. You expressly acknowledge these limitations and agree to verify all AI outputs with a licensed healthcare provider before acting on them.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">6. Supplement Recommendations &mdash; Specific Risks</h3>
              <p>Supplements can interact with prescription medications. Although we screen recommendations against your medications using a public-database engine, this engine is not exhaustive. <strong>You agree to consult your physician AND pharmacist before adding ANY supplement to your regimen.</strong> You assume all risk associated with supplements you choose to take.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">7. Pricing</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>$19 unlocks your account and your first lab analysis (3 plan generations included).</li>
                <li>$5 per additional lab upload, 3 plan generations included.</li>
                <li>All purchases final and non-refundable once a plan has been generated.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">8. Limitation of Liability</h3>
              <p>To the maximum extent permitted by law, CauseHealth and its operators are not liable for indirect, incidental, special, consequential, or punitive damages, including damages from health decisions made based on our outputs. Our total cumulative liability shall not exceed the amount you paid us in the prior 12 months, or $100, whichever is greater.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">9. Arbitration &amp; Class Action Waiver</h3>
              <p><strong>Disputes will be resolved through binding individual arbitration, not in court.</strong> You waive the right to participate in a class action against CauseHealth. You may opt out of arbitration within 30 days of accepting these Terms by emailing support@causehealth.app.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">10. Governing Law</h3>
              <p>These Terms are governed by Pennsylvania law. Any in-court disputes shall be brought in Pennsylvania.</p>

              <p className="mt-4 italic text-clinical-stone text-xs">Full Terms available at <a href="/terms" className="text-primary-container underline" target="_blank" rel="noreferrer">/terms</a>.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* PRIVACY POLICY — condensed */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 2 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Privacy Policy</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">HIPAA does not apply to CauseHealth</h3>
              <p>
                <strong>CauseHealth is not a HIPAA covered entity.</strong> HIPAA regulates healthcare providers, health plans, and their business associates — CauseHealth is a consumer health information service that you voluntarily upload your own data to, and is none of those. HIPAA does NOT govern your data here.
              </p>
              <p className="mt-2">
                Your data is instead protected by our Privacy Policy and by: the FTC Health Breach Notification Rule (60-day breach notification), the California Consumer Privacy Act (CCPA), the EU General Data Protection Regulation (GDPR), and the Washington My Health My Data Act (MHMDA) — applied universally, not just to WA users. If you require HIPAA-covered handling, keep that information in your healthcare provider's systems instead.
              </p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">What we collect</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Account:</strong> email, name, DOB, sex, height/weight, goals.</li>
                <li><strong>Health (Consumer Health Data):</strong> labs, conditions, medications, symptoms, lifestyle, generated plans.</li>
                <li><strong>Usage:</strong> pages visited, error logs (no raw health data), device info, IP address (fraud prevention).</li>
                <li><strong>Payment:</strong> processed by Stripe; we do NOT store your card number or CVV.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">What we do NOT collect</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>No biometric identifiers (fingerprints, facial geometry, voice prints).</li>
                <li>No precise geolocation. No geofencing.</li>
                <li>No social media profile data.</li>
                <li>No data from third-party data brokers.</li>
              </ul>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">How we use it</h3>
              <p>To generate your personalized analysis, communicate with you, prevent fraud, and improve the Service via aggregated, de-identified usage data. <strong>We never use your individually identifiable health data to train AI models. Anthropic does not train on data submitted via its API.</strong></p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Who we share with</h3>
              <p>Only the third-party processors required to run CauseHealth, each under a Data Processing Agreement:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Supabase</strong> &mdash; database &amp; auth (encrypted at rest with AES-256, US-hosted)</li>
                <li><strong>Anthropic</strong> &mdash; AI analysis (does NOT use your data to train models)</li>
                <li><strong>Stripe</strong> &mdash; payment processing</li>
                <li><strong>Vercel</strong> &mdash; hosting / CDN</li>
              </ul>
              <p className="mt-2"><strong>We do NOT sell your personal information or health data to anyone, ever.</strong> We do NOT share with advertisers, data brokers, insurers, or employers.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Your rights</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Access</strong> all data we hold (Settings &rarr; Export All Data &mdash; JSON + CSV formats).</li>
                <li><strong>Delete</strong> your data and account (Settings &rarr; Delete Account &mdash; complete within 30 days).</li>
                <li><strong>Withdraw consent</strong> at any time (support@causehealth.app).</li>
                <li><strong>Appeal</strong> any denial within 45 days.</li>
              </ul>
              <p className="mt-2">CCPA (California), GDPR (EEA/UK/Switzerland), and Washington My Health My Data Act rights are honored. Full details at <a href="/privacy" className="text-primary-container underline" target="_blank" rel="noreferrer">/privacy</a>.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Security</h3>
              <p>TLS encryption in transit, AES-256 encryption at rest, MFA on production access, password hashing via bcrypt, and no raw health data in error logs. If a breach occurs, we'll notify affected users within 30 days per the FTC Health Breach Notification Rule.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Retention</h3>
              <p>We retain your data while your account is active. After deletion, data is removed from active systems within 30 days; encrypted backups overwritten within 90 days.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* MEDICAL DISCLAIMER */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Document 3 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Medical Disclaimer</h2>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Educational use only</h3>
              <p>Everything in CauseHealth &mdash; lab interpretations, supplement suggestions, wellness plans, AI chat &mdash; is for <strong>informational purposes only</strong>. None of it is medical advice, diagnosis, or treatment.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Always talk to your doctor</h3>
              <p>Discuss every finding, supplement change, medication adjustment, or dietary intervention with your physician <strong>before making any change</strong>.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Functional medicine optimal ranges</h3>
              <p>CauseHealth uses functional medicine "optimal-range" thresholds in addition to standard reference ranges. Optimal ranges are tighter than what most labs flag as "out of range" and are not universally accepted. Treat flags as conversation starters with your doctor, not diagnoses.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">AI limitations</h3>
              <p>Our analyses come from large language models with built-in clinical guardrails. AI can be wrong, inconsistent, or miss nuances a trained clinician would catch. Cross-reference any major decision with your healthcare team. <strong>Never delay medical care because of something CauseHealth told you.</strong></p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Supplement and medication safety</h3>
              <p>Supplements can interact with prescription medications, alter lab values, and be contraindicated in specific conditions (pregnancy, kidney disease, anticoagulant use, etc.). Always check with a qualified pharmacist or physician before starting a supplement.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">Emergencies</h3>
              <p><strong>If you are having a medical emergency, call 911 or go to your nearest emergency room immediately.</strong> Do NOT use CauseHealth for emergency triage.</p>

              <h3 className="text-authority text-base font-semibold mt-4 mb-2">FDA &amp; regulatory status</h3>
              <p>CauseHealth has not been evaluated by the FDA. We are not a medical device. Our outputs are not intended to diagnose, treat, cure, or prevent any disease.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* End-of-document marker */}
            <section className="bg-clinical-cream/40 rounded-[10px] p-5 text-center">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">
                End of agreement
              </p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                You've reached the bottom. The Accept button below is now enabled. After you accept, one more short step covers your health-data consent.
              </p>
              <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide mt-3">
                Policy version {CONSENT_POLICY_VERSION}
              </p>
            </section>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-5 border-t border-clinical-cream flex-shrink-0 bg-clinical-white" style={{ borderRadius: '0 0 14px 14px' }}>
          {error && (
            <p className="text-body text-[#C94F4F] text-xs mb-3 leading-snug">{error}</p>
          )}
          <button
            onClick={handleAccept}
            disabled={!scrolledToBottom || accepting}
            className={`w-full py-3.5 px-6 font-semibold text-base transition-all ${
              scrolledToBottom && !accepting
                ? 'bg-primary-container text-white hover:bg-primary-container/90 cursor-pointer'
                : 'bg-clinical-cream text-clinical-stone cursor-not-allowed'
            }`}
            style={{ borderRadius: '8px' }}
          >
            {accepting
              ? 'Saving your consent…'
              : scrolledToBottom
              ? 'I have read and agree to the Terms, Privacy Policy, and Medical Disclaimer'
              : 'Scroll to the bottom to enable Accept'}
          </button>
          <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider text-center mt-3 leading-snug">
            By accepting, you confirm you have read all three documents in full. Your acceptance is timestamped and logged.
          </p>
        </div>
      </div>
    </div>
  );
};
