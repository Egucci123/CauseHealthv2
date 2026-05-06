// src/components/auth/AcceptTermsScreen.tsx
//
// Full-screen consent gate. Shown once at signup AFTER auth but BEFORE the
// user reaches onboarding. The user MUST scroll the entire document before
// the "Accept All & Continue" button enables — gives us a defensible audit
// trail that they read it (vs the standard "2 checkboxes" pattern that
// doesn't prove anything).
//
// On accept:
//   - Records consent timestamp + version on profile (terms_acceptance JSONB)
//   - Calls onAccepted callback so the parent can route forward
//
// Universal — same gate for every new user, every signup. Re-displayed
// when terms_version changes (handled by parent).

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

export const TERMS_VERSION = '2026-05-06';

interface Props {
  onAccepted: () => void;
}

export const AcceptTermsScreen = ({ onAccepted }: Props) => {
  const userId = useAuthStore(s => s.user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track scroll position. Enable button when within 80px of the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < 80) setScrolledToBottom(true);
    };
    el.addEventListener('scroll', handleScroll);
    // Also handle the case where content is shorter than viewport
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAccept = async () => {
    if (!scrolledToBottom || !userId) return;
    setAccepting(true);
    setError(null);
    try {
      const consent = {
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
        privacy_accepted_at: new Date().toISOString(),
        disclaimer_accepted_at: new Date().toISOString(),
        // Best-effort signal of consent context — useful in compliance audits
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
      };
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ terms_acceptance: consent })
        .eq('id', userId);
      if (updateErr) {
        // Don't block the user if the column doesn't exist yet — fall back to localStorage
        console.warn('[AcceptTerms] DB persist failed, falling back to localStorage:', updateErr);
        try { localStorage.setItem(`causehealth.terms_acceptance.${userId}`, JSON.stringify(consent)); } catch {}
      }
      // Refresh profile in store so consent state is reflected app-wide
      await useAuthStore.getState().fetchProfile?.().catch(() => {});
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
        {/* Header — fixed */}
        <div className="px-6 sm:px-8 py-5 border-b border-clinical-cream flex-shrink-0">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">
            Before you continue
          </p>
          <h1 className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold">
            Please read and accept our terms
          </h1>
          <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
            Scroll to the bottom to enable the <strong>Accept</strong> button. By accepting, you confirm you've read all three sections: the Terms of Service, Privacy Policy, and Medical Disclaimer.
          </p>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 sm:px-8 py-6"
          style={{ minHeight: '300px' }}
        >
          <div className="space-y-10 text-body text-clinical-charcoal text-sm leading-relaxed">

            {/* ── TERMS OF SERVICE (condensed inline) ───────────────────── */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Section 1 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Terms of Service</h2>
              <p className="italic text-clinical-stone mb-4">Effective {TERMS_VERSION}</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">1. Acceptance & Eligibility</h3>
              <p>You must be 18+ and legally able to enter contracts. By creating an account, you agree to be bound by these Terms.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">2. What CauseHealth Is</h3>
              <p>CauseHealth is a <strong>consumer health information and wellness service</strong>. We help you understand your bloodwork, identify patterns in your labs / medications / conditions / symptoms, and prepare for conversations with your healthcare provider.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">3. What CauseHealth Is NOT</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>NOT a medical device. NOT FDA-approved or cleared.</li>
                <li>NOT diagnostic. We do not diagnose, treat, cure, or prevent any condition.</li>
                <li>NOT medical advice. All content is educational.</li>
                <li>NOT a replacement for your physician, pharmacist, or other licensed provider.</li>
                <li>Does not establish a doctor-patient relationship.</li>
              </ul>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">4. Your Responsibility</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>You are solely responsible for all decisions you make about your health.</li>
                <li>Always consult a qualified healthcare provider before starting, stopping, or modifying any medication, supplement, diet, or treatment.</li>
                <li>Do not delay seeking medical attention based on CauseHealth.</li>
                <li>If you have a medical emergency, call 911 or your local emergency number immediately.</li>
                <li>You are responsible for the accuracy of the information you provide.</li>
              </ul>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">5. AI-Generated Content</h3>
              <p>CauseHealth uses Anthropic's Claude AI plus rule-based engines to analyze your data. AI-generated content may contain errors or inaccuracies. You expressly acknowledge these limitations and agree to verify all AI outputs with a licensed healthcare provider before acting on them.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">6. Supplement Recommendations — Specific Risks</h3>
              <p>Supplements can interact with prescription medications. Although we screen recommendations against your medications using a public-database engine, this engine is not exhaustive. <strong>You agree to consult your physician AND pharmacist before adding ANY supplement to your regimen.</strong> You assume all risk associated with supplements you choose to take.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">7. Pricing</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>$19 unlocks your account and your first lab analysis (3 plan generations included).</li>
                <li>$5 per additional lab upload (e.g., 12-week retest), 3 plan generations included.</li>
                <li>All purchases final and non-refundable once a plan has been generated.</li>
              </ul>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">8. Limitation of Liability</h3>
              <p>To the maximum extent permitted by law, CauseHealth and its operators are not liable for indirect, incidental, special, consequential, or punitive damages, including damages from health decisions made based on our outputs. Our total cumulative liability shall not exceed the amount you paid us in the prior 12 months, or $100, whichever is greater.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">9. Arbitration & Class Action Waiver</h3>
              <p><strong>Disputes will be resolved through binding individual arbitration, not in court.</strong> You waive the right to participate in a class action against CauseHealth. You may opt out of arbitration within 30 days of accepting these Terms by emailing support@causehealth.app with the subject line "Arbitration Opt-Out."</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">10. Governing Law</h3>
              <p>These Terms are governed by Florida law. Any in-court disputes shall be brought in Miami-Dade County, Florida.</p>

              <p className="mt-4 italic text-clinical-stone text-xs">Full Terms available at <a href="/terms" className="text-primary-container underline" target="_blank" rel="noreferrer">/terms</a> — open in a new tab to read in detail.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* ── PRIVACY POLICY (condensed inline) ────────────────────── */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Section 2 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Privacy Policy</h2>
              <p className="italic text-clinical-stone mb-4">Effective {TERMS_VERSION}</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">What we collect</h3>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Account data:</strong> email, name, DOB, sex, height/weight, goals.</li>
                <li><strong>Health data ("Consumer Health Data"):</strong> lab results, conditions, medications, symptoms, lifestyle factors, generated wellness plans.</li>
                <li><strong>Usage data:</strong> pages visited, error logs (no raw health data), device info, IP address.</li>
                <li><strong>Payment:</strong> processed by Stripe; we do NOT store your credit card number or CVV.</li>
              </ul>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">How we use it</h3>
              <p>To generate your personalized analysis, communicate with you, prevent fraud, and improve the Service via aggregated, de-identified usage data. <strong>We never use your individually identifiable health data to train AI models.</strong></p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Who we share with</h3>
              <p>Only the third-party providers required to run CauseHealth, acting as our processors:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Supabase</strong> — database & auth (encrypted, US-hosted)</li>
                <li><strong>Anthropic</strong> — AI analysis (does NOT use your data to train models)</li>
                <li><strong>Stripe</strong> — payment processing</li>
                <li><strong>Vercel</strong> — hosting / CDN</li>
              </ul>
              <p className="mt-2"><strong>We do NOT sell your personal information or health data to anyone, ever.</strong></p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Consumer Health Data (Washington MHMDA + similar state laws)</h3>
              <p>The categories above include "Consumer Health Data" as defined by the Washington My Health My Data Act and analogous state laws. You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li><strong>Access</strong> all health data we hold about you (use Settings → Export All Data)</li>
                <li><strong>Delete</strong> your health data and account (use Settings → Delete Account)</li>
                <li><strong>Withdraw consent</strong> at any time (email privacy@causehealth.app)</li>
                <li><strong>Appeal</strong> any denial of these requests (we'll respond within 45 days)</li>
              </ul>
              <p className="mt-2">CauseHealth does NOT use geofencing for health-related advertising and does NOT sell Consumer Health Data.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">CCPA (California) and GDPR (Europe)</h3>
              <p>California and EEA residents have additional rights including access, deletion, correction, portability, and objection. To exercise these, email privacy@causehealth.app. We respond within 45 days.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Security</h3>
              <p>TLS encryption in transit, encryption at rest, password hashing, and no raw health data in error logs. No system is 100% secure. If a breach occurs, we'll notify affected users within 60 days per the FTC Health Breach Notification Rule.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Retention</h3>
              <p>We retain your data while your account is active. After deletion, your data is removed from active systems within 30 days; backups are overwritten within 90 days.</p>

              <p className="mt-4 italic text-clinical-stone text-xs">Full Privacy Policy available at <a href="/privacy" className="text-primary-container underline" target="_blank" rel="noreferrer">/privacy</a>.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* ── MEDICAL DISCLAIMER (condensed inline) ────────────────── */}
            <section>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">Section 3 of 3</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold mb-4">Medical Disclaimer</h2>
              <p className="italic text-clinical-stone mb-4">Effective {TERMS_VERSION}</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Educational use only</h3>
              <p>Everything in CauseHealth — lab interpretations, supplement suggestions, wellness plans, AI chat — is for <strong>informational purposes only</strong>. None of it is medical advice, diagnosis, or treatment.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Always talk to your doctor</h3>
              <p>Discuss every finding, supplement change, medication adjustment, or dietary intervention with your physician <strong>before making any change</strong>.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Lab interpretation</h3>
              <p>CauseHealth uses functional medicine "optimal-range" thresholds in addition to standard reference ranges. Optimal ranges are tighter than what most labs flag as "out of range" and are not universally accepted. Treat flags as conversation starters, not diagnoses.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">AI limitations</h3>
              <p>Our analyses come from large language models with built-in clinical guardrails. AI can be wrong, inconsistent, or miss nuances a trained clinician would catch. Cross-reference any major decision with your healthcare team. <strong>Never delay medical care because of something CauseHealth told you.</strong></p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Supplement and medication safety</h3>
              <p>Supplements can interact with prescription medications, alter lab values, and be contraindicated in specific conditions (pregnancy, kidney disease, anticoagulant use, etc.). Always check with a qualified pharmacist or physician before starting a supplement.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">Emergencies</h3>
              <p><strong>If you are having a medical emergency, call 911 or go to your nearest emergency room immediately.</strong> Do NOT use CauseHealth for emergency triage.</p>

              <h3 className="text-authority text-base text-clinical-charcoal font-semibold mt-4 mb-2">FDA & regulatory status</h3>
              <p>CauseHealth has not been evaluated by the FDA. We are not a medical device. Our outputs are not intended to diagnose, treat, cure, or prevent any disease.</p>

              <p className="mt-4 italic text-clinical-stone text-xs">Full Medical Disclaimer available at <a href="/disclaimer" className="text-primary-container underline" target="_blank" rel="noreferrer">/disclaimer</a>.</p>
            </section>

            <hr className="border-clinical-cream" />

            {/* End-of-document marker */}
            <section className="bg-clinical-cream/40 rounded-[10px] p-5 text-center">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-2">
                End of agreement
              </p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                You've reached the bottom. The Accept button below is now enabled.
              </p>
              <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide mt-3">
                Version {TERMS_VERSION}
              </p>
            </section>

          </div>
        </div>

        {/* Footer with the Accept button — fixed */}
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
              ? 'I have read and accept all three documents'
              : 'Scroll down to enable Accept'}
          </button>
          <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider text-center mt-3 leading-snug">
            By accepting, you acknowledge you've read the Terms of Service, Privacy Policy, and Medical Disclaimer in full. Your acceptance is timestamped and recorded.
          </p>
        </div>
      </div>
    </div>
  );
};
