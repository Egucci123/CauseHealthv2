// src/pages/legal/Terms.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Terms = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">Terms of Service</h1>
      <p className="text-body text-clinical-stone mb-10">Last updated: April 9, 2026</p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section title="1. Acceptance of Terms">
          By creating an account or using CauseHealth, you agree to these Terms of Service. If you do not agree, do not use the service.
        </Section>

        <Section title="2. What CauseHealth Is">
          CauseHealth is a <strong>health education and information tool</strong>. It helps you understand your lab results, identify patterns, and prepare for conversations with your healthcare provider. CauseHealth analyzes your bloodwork against functional and standard reference ranges, identifies potential medication-nutrient interactions, and generates educational documents you can share with your doctor.
        </Section>

        <Section title="3. What CauseHealth Is NOT">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>CauseHealth is <strong>not a medical device</strong> and is not FDA-approved or cleared.</li>
            <li>CauseHealth does <strong>not diagnose, treat, cure, or prevent</strong> any disease or medical condition.</li>
            <li>CauseHealth does <strong>not provide medical advice</strong>. All information is educational.</li>
            <li>CauseHealth does <strong>not replace your doctor, specialist, or any licensed healthcare provider</strong>.</li>
            <li>CauseHealth does <strong>not establish a doctor-patient relationship</strong> between you and CauseHealth or its operators.</li>
            <li>ICD-10 codes, test suggestions, and clinical summaries are <strong>educational aids for discussion with your provider</strong>, not orders or prescriptions.</li>
          </ul>
        </Section>

        <Section title="4. Your Responsibility">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>You are responsible for all decisions you make regarding your health.</li>
            <li>Always consult a qualified healthcare provider before starting, stopping, or changing any medication, supplement, diet, or treatment plan.</li>
            <li>Do not delay seeking medical attention based on information from CauseHealth.</li>
            <li>If you are experiencing a medical emergency, call 911 or your local emergency number immediately.</li>
            <li>You are responsible for the accuracy of the information you provide (lab results, medications, symptoms, conditions).</li>
          </ul>
        </Section>

        <Section title="5. AI-Generated Content">
          CauseHealth uses artificial intelligence (Anthropic Claude) to analyze your data and generate reports. AI-generated content may contain errors, omissions, or inaccuracies. All AI outputs are provided "as-is" for educational purposes. You should verify all information with your healthcare provider before acting on it. CauseHealth does not guarantee the accuracy, completeness, or clinical validity of any AI-generated content.
        </Section>

        <Section title="6. Subscription and Payment">
          CauseHealth Pro is a monthly subscription at $7.67/month ($92/year). You may cancel at any time through your account settings. Cancellation takes effect at the end of your current billing period. No refunds are provided for partial months. Payment is processed securely through Stripe. CauseHealth does not store your credit card information.
        </Section>

        <Section title="7. Your Data">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>You own your data. We never sell, share, or monetize your personal health information.</li>
            <li>You can export all your data at any time from Settings.</li>
            <li>You can delete your account and all associated data at any time from Settings.</li>
            <li>Your data is processed by AI services (Anthropic Claude) to generate analysis. See our Privacy Policy for details.</li>
          </ul>
        </Section>

        <Section title="8. Limitation of Liability">
          To the maximum extent permitted by law, CauseHealth and its operators shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the service, including but not limited to damages arising from health decisions made based on information provided by CauseHealth. You use CauseHealth entirely at your own risk.
        </Section>

        <Section title="9. Indemnification">
          You agree to indemnify and hold harmless CauseHealth, its operators, employees, and affiliates from any claims, damages, losses, or expenses arising from your use of the service or your violation of these terms.
        </Section>

        <Section title="10. Changes to Terms">
          We may update these terms from time to time. Continued use of CauseHealth after changes constitutes acceptance of the updated terms. We will notify you of material changes via email or in-app notification.
        </Section>

        <Section title="11. Governing Law">
          These terms are governed by the laws of the State of Florida, United States. Any disputes shall be resolved in the courts of Florida.
        </Section>

        <Section title="12. Contact">
          For questions about these terms, contact us at <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a>.
        </Section>
      </div>
    </div>
    <LandingFooter />
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h2 className="text-authority text-xl text-clinical-charcoal font-semibold mb-3">{title}</h2>
    <div className="text-body text-clinical-stone text-sm leading-relaxed">{children}</div>
  </div>
);
