// src/pages/legal/Privacy.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Privacy = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">Privacy Policy</h1>
      <p className="text-body text-clinical-stone mb-2">Last updated: May 6, 2026</p>
      <p className="text-body text-clinical-stone italic text-sm mb-10">
        This Privacy Policy explains what we collect, how we use it, who we share it with, and your rights. It includes a separate Consumer Health Data Privacy Policy as required by the Washington My Health My Data Act and similar state laws.
      </p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section title="1. Overview">
          <p>CauseHealth takes your privacy seriously. We collect only the information needed to provide the Service. We do not sell your personal information or your health data to anyone, ever.</p>
          <p className="mt-2">By using CauseHealth, you agree to this Privacy Policy. Please also read our <a href="/terms" className="text-primary-container hover:underline">Terms of Service</a> and <a href="/disclaimer" className="text-primary-container hover:underline">Medical Disclaimer</a>.</p>
        </Section>

        <Section title="2. What We Collect">
          <p><strong>Account information</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Email address, password (hashed), name</li>
            <li>Date of birth, biological sex (used for clinical interpretation)</li>
            <li>Height, weight (optional, used for plan personalization)</li>
            <li>Primary health goals you select</li>
          </ul>

          <p><strong>Health information ("Consumer Health Data")</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Lab results uploaded as PDFs, photos, or entered manually</li>
            <li>Diagnosed medical conditions you report</li>
            <li>Medications and dosages you report</li>
            <li>Symptoms and severity ratings you report</li>
            <li>Lifestyle data (sleep, stress, exercise, diet patterns)</li>
            <li>Wellness plans, doctor prep documents, and other content generated from your data</li>
          </ul>

          <p><strong>Usage data</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Pages visited, features used, error logs (with personal identifiers stripped)</li>
            <li>Device type, browser, IP address (used for fraud prevention and abuse detection)</li>
          </ul>

          <p><strong>Payment information</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Processed by Stripe, Inc. We do NOT store your credit card number, security code (CVV), or full billing address.</li>
            <li>We retain a Stripe customer reference ID and the last 4 digits of your card to display in receipts.</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>To provide the Service.</strong> Your health data is used to generate personalized lab analysis, wellness plans, doctor prep documents, and AI chat responses.</li>
            <li><strong>For AI processing.</strong> Your lab values, medications, conditions, and symptoms are sent to Anthropic's Claude API to generate analysis. This data is sent over encrypted (HTTPS/TLS) connections. <strong>Anthropic does not use your data to train their models when accessed via the API.</strong></li>
            <li><strong>To improve the Service.</strong> We may analyze aggregated, de-identified usage patterns to improve features. We do NOT use your individually identifiable health data to train any AI model.</li>
            <li><strong>To communicate with you.</strong> Account-related emails (password resets, billing receipts, breach notifications, terms updates).</li>
            <li><strong>To prevent fraud, abuse, and security incidents.</strong></li>
            <li><strong>To comply with legal obligations.</strong></li>
          </ul>
        </Section>

        <Section title="4. Who We Share Your Information With">
          <p>We share your information ONLY with the third-party service providers required to run CauseHealth, and only as necessary to provide the Service:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Supabase, Inc.</strong> — Database and authentication provider. Stores your account and health data on encrypted infrastructure in the United States.</li>
            <li><strong>Anthropic, PBC</strong> — AI provider. Receives your lab values, medications, conditions, and symptoms via API to generate plan analysis. Does not retain or use this data for training.</li>
            <li><strong>Stripe, Inc.</strong> — Payment processor. Receives your payment details directly (we never see them).</li>
            <li><strong>Vercel, Inc.</strong> — Hosting and content delivery. Routes traffic; does not access your stored health data.</li>
          </ul>
          <p className="mt-2">We do NOT share your information with:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Advertisers, data brokers, or marketing companies</li>
            <li>Insurance companies or employers</li>
            <li>Other healthcare providers (unless you explicitly export and share data yourself)</li>
            <li>Government agencies (except as required by valid legal process)</li>
          </ul>
          <p className="mt-2"><strong>We do NOT sell your personal information or health data to anyone, for any reason. Ever.</strong></p>
        </Section>

        <Section title="5. Consumer Health Data Privacy Policy (Washington MHMDA Compliance)">
          <p>This section is provided in accordance with the Washington My Health My Data Act (RCW 19.373) and similar consumer-health-data laws in other states.</p>

          <p className="mt-3"><strong>Categories of Consumer Health Data we collect:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Past, present, or future physical or mental health status</li>
            <li>Health conditions and diagnoses you report</li>
            <li>Medications and treatments you report</li>
            <li>Lab values, biomarkers, and bodily measurements</li>
            <li>Reproductive or sexual health information (only if you choose to disclose it via symptoms)</li>
            <li>Health-related goals and lifestyle factors (sleep, exercise, diet, stress)</li>
            <li>Information that we infer from any of the above (e.g., suspected conditions, multi-marker patterns)</li>
          </ul>

          <p><strong>Sources of Consumer Health Data:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Directly from you (lab uploads, onboarding answers, in-app entries)</li>
            <li>Inferred or generated by our analysis engines based on your inputs</li>
          </ul>

          <p><strong>Categories with whom we share Consumer Health Data:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Service providers (Supabase, Anthropic, Stripe, Vercel — listed above) acting as our processors</li>
            <li>No other categories</li>
          </ul>

          <p><strong>Purposes for collecting and sharing:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>To provide the Service you requested (analyze your labs, generate wellness plans, store your data)</li>
            <li>To process payment for the Service</li>
            <li>To communicate with you about your account</li>
            <li>To improve the Service through aggregated, de-identified analysis</li>
            <li>To comply with legal obligations</li>
          </ul>

          <p><strong>Your rights regarding Consumer Health Data:</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li><strong>Right to access:</strong> Request a copy of all Consumer Health Data we hold about you. Use the "Export All Data" button in Settings.</li>
            <li><strong>Right to delete:</strong> Request that we delete your Consumer Health Data. Use the "Delete Account" button in Settings, or contact us at <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a>.</li>
            <li><strong>Right to withdraw consent:</strong> You may withdraw consent for any specific processing at any time by contacting us at <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a>. Note: withdrawing consent for core processing means we can no longer provide the Service.</li>
            <li><strong>Right to non-discrimination:</strong> We will not discriminate against you for exercising any of these rights.</li>
            <li><strong>Right to appeal:</strong> If we deny any of these requests, you may appeal by emailing <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a>. We will respond within 45 days.</li>
          </ul>

          <p><strong>We do NOT sell Consumer Health Data.</strong> "Sale" includes any exchange of health data for monetary or other valuable consideration. We have never sold Consumer Health Data and have no plans to.</p>

          <p className="mt-2"><strong>Geofencing notice:</strong> CauseHealth does not use geofencing to identify users in specific physical locations or to send health-related advertising based on location.</p>
        </Section>

        <Section title="6. Your Privacy Rights (CCPA / CPRA — California)">
          <p>If you are a California resident, you have the following rights under the California Consumer Privacy Act and California Privacy Rights Act:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Right to know what personal information we collect, use, disclose</li>
            <li>Right to delete your personal information</li>
            <li>Right to correct inaccurate personal information</li>
            <li>Right to opt out of "sale" or "sharing" of personal information (we do neither)</li>
            <li>Right to limit use of sensitive personal information</li>
            <li>Right to non-discrimination for exercising these rights</li>
          </ul>
          <p>To exercise these rights, use the data export and deletion tools in Settings, or email <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a>. We will respond within 45 days.</p>
        </Section>

        <Section title="7. Your Privacy Rights (GDPR — European Economic Area)">
          <p>If you are in the EEA, UK, or Switzerland, you have rights under the General Data Protection Regulation:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Right of access</li>
            <li>Right to rectification</li>
            <li>Right to erasure ("right to be forgotten")</li>
            <li>Right to restrict processing</li>
            <li>Right to data portability</li>
            <li>Right to object to processing</li>
            <li>Right not to be subject to automated decision-making</li>
            <li>Right to lodge a complaint with a supervisory authority</li>
          </ul>
          <p>To exercise these rights, email <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a>.</p>
          <p className="mt-2">Our legal basis for processing health data is your explicit consent (Article 9(2)(a) GDPR), provided when you accept these Terms at signup.</p>
        </Section>

        <Section title="8. Data Security">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>All data is encrypted in transit using TLS 1.2 or higher.</li>
            <li>All data is encrypted at rest on Supabase infrastructure.</li>
            <li>Access to production systems is restricted to authorized personnel only.</li>
            <li>Passwords are hashed using industry-standard algorithms (bcrypt or stronger).</li>
            <li>We do NOT log raw health data in error monitoring or analytics tools.</li>
          </ul>
          <p className="mt-2">No system is 100% secure. While we take strong precautions, we cannot guarantee absolute security of your data.</p>
        </Section>

        <Section title="9. Data Retention">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>We retain your data for as long as your account is active.</li>
            <li>If you delete your account, all your personal and health data is deleted from our active systems within 30 days.</li>
            <li>Backups containing your data may persist for up to 90 additional days before being overwritten in normal backup rotation.</li>
            <li>We may retain certain limited information (e.g., billing records) longer where required by law.</li>
          </ul>
        </Section>

        <Section title="10. Breach Notification">
          <p>In the event of a security breach affecting your personal or health data, we will:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Notify affected users within 60 days (in compliance with the FTC Health Breach Notification Rule and applicable state laws).</li>
            <li>Notify the Federal Trade Commission and applicable state attorneys general where required by law.</li>
            <li>Provide details about what data was affected, what we are doing in response, and what you can do to protect yourself.</li>
          </ul>
        </Section>

        <Section title="11. Children's Privacy">
          <p>CauseHealth is intended for adults 18 and older. We do not knowingly collect personal information from anyone under 18. If you believe a minor has used CauseHealth, please contact us at <a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a> and we will delete the account.</p>
        </Section>

        <Section title="12. International Users">
          <p>CauseHealth is operated from and hosted in the United States. If you access the Service from outside the U.S., your information will be transferred to and processed in the U.S. By using the Service, you consent to this transfer.</p>
        </Section>

        <Section title="13. Changes to This Privacy Policy">
          <p>We may update this Privacy Policy from time to time. Material changes will be communicated by email at least 30 days before they take effect. The "Last updated" date at the top of this page shows when the policy was most recently revised.</p>
        </Section>

        <Section title="14. Contact Us">
          <p>For privacy questions, data requests, or to exercise any of your rights:</p>
          <p className="mt-2"><a href="mailto:privacy@causehealth.app" className="text-primary-container hover:underline">privacy@causehealth.app</a></p>
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
