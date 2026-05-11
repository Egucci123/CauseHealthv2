// src/pages/legal/Privacy.tsx
// v7 — synced from legal/PRIVACY_POLICY.md (May 10, 2026)
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Privacy = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">CauseHealth Privacy Policy</h1>
      <p className="text-body text-clinical-stone text-sm"><strong>Effective:</strong> May 10, 2026</p>
      <p className="text-body text-clinical-stone text-sm mb-6">
        <strong>Questions:</strong>{' '}
        <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a>
      </p>
      <p className="text-body text-clinical-charcoal text-sm mb-10 italic">
        Short version: we collect what we need to run the app, we don't sell your data, and your health information stays yours.
      </p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section id="section-1" title="1. What We Collect">
          <p><strong>When you sign up</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Name and email</li>
            <li>Password (we never see it — stored as an encrypted hash by Supabase)</li>
            <li>State of residence</li>
            <li>Your doctor's name and practice</li>
          </ul>

          <p><strong>When you use the app</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1 mb-3">
            <li>Lab results you upload (PDFs, images, or manual entry)</li>
            <li>Biomarker values extracted from your labs</li>
            <li>Medications, supplements, conditions, symptoms you enter</li>
            <li>Date of birth and biological sex (needed for accurate lab interpretation)</li>
            <li>Height, weight, lifestyle info (optional)</li>
          </ul>

          <p><strong>Automatically</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>IP address and approximate location</li>
            <li>Device type, browser, operating system</li>
            <li>Pages you visit and features you use</li>
            <li>Error logs (no health data included)</li>
          </ul>
        </Section>

        <Section id="section-2" title="2. What We Don't Collect">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Biometric identifiers (fingerprints, face scans, voice)</li>
            <li>Precise GPS location</li>
            <li>Social media data</li>
            <li>Your full credit card number (Stripe handles payments, we only see the last 4 digits)</li>
          </ul>
        </Section>

        <Section id="section-3" title="3. How We Use Your Information">
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Generate your Doctor Prep Document and wellness plan</li>
            <li>Run the app and keep your account working</li>
            <li>Send you the things you'd expect: account confirmation, billing receipts, security alerts</li>
            <li>Improve the app using aggregated, de-identified data — never your individual health records</li>
          </ul>
          <p className="mt-3">We do not use your health information for advertising. Ever.</p>
        </Section>

        <Section id="section-4" title="4. Who We Share It With">
          <p>We share your data only with the vendors we need to run the app:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Supabase</strong> — our database and file storage (United States)</li>
            <li><strong>Anthropic</strong> — AI that generates your document. Receives biomarker values and health context only. Never your name, email, or payment info. Contractually prohibited from training on your data. (United States)</li>
            <li><strong>Stripe</strong> — payment processing. Receives your email, name, billing ZIP, and card token only. (United States)</li>
            <li><strong>Vercel</strong> — hosts the app. Receives IP address and request metadata. (Global edge)</li>
            <li><strong>Resend</strong> — sends transactional emails. Receives your email address. (United States)</li>
          </ul>
          <p className="mt-3">We do not sell your data. We do not share it with advertisers, data brokers, your employer, or your insurance company. We have no advertising pixels on this app — no Meta, Google Ads, TikTok, or LinkedIn trackers.</p>
        </Section>

        <Section id="section-5" title="5. Your Health Data — Extra Protections">
          <p>Because you're sharing sensitive health information with us, we apply stricter rules to it:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>We never sell it</li>
            <li>We never use it for behavioral advertising</li>
            <li>We never share it with data brokers or insurers</li>
            <li>We never use it to train any AI model</li>
            <li>We never use your individual health records for product improvement — only aggregated, de-identified patterns</li>
          </ul>
        </Section>

        <Section id="section-6" title="6. Security">
          <p>We use TLS encryption for all data in transit, encryption at rest for our database and file storage, and database-level access controls so each user can only see their own data. Passwords are hashed — we never see yours.</p>
          <p className="mt-3">No system is perfectly secure. If you find a security issue, email <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a>.</p>
          <p className="mt-3">If there's ever a breach affecting your health data, we'll notify you and the FTC within 60 days of discovery (our internal target is 30 days).</p>
        </Section>

        <Section id="section-7" title="7. Your Rights">
          <p>You can:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Access a copy of your data — email <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a></li>
            <li>Correct inaccurate information — edit it in the app or email us</li>
            <li>Delete your account and data — Settings → Delete Account, or email us. Health data is purged within 30 days.</li>
            <li>Export your data — Settings → Export</li>
          </ul>
          <p className="mt-3">We don't sell or share your data for advertising, so opt-out rights for those purposes are honored by default.</p>
          <p className="mt-3">We respond to requests within 45 days.</p>
        </Section>

        <Section id="section-8" title="8. Where We Operate">
          <p>CauseHealth is available to U.S. residents only, excluding California, New York, Illinois, and Washington State. We don't currently offer the app in those states or internationally.</p>
        </Section>

        <Section id="section-9" title="9. Data Retention">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Health data and account info: deleted within 30 days of account deletion (90 days from backups)</li>
            <li>Billing records: kept 7 years for tax purposes</li>
            <li>Consent records: kept for the life of your account plus 7 years (legal requirement)</li>
          </ul>
        </Section>

        <Section id="section-10" title="10. Children">
          <p>CauseHealth is for adults 18 and older. We don't knowingly collect information from anyone under 18. If you believe a minor has created an account, email <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a> and we'll delete it.</p>
        </Section>

        <Section id="section-11" title="11. Changes">
          <p>If we make material changes to this policy we'll notify you by email at least 14 days before they take effect.</p>
        </Section>

        <Section id="section-12" title="12. Contact">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Privacy questions: <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a></li>
            <li>Security reports: <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a></li>
            <li>CauseHealth LLC</li>
          </ul>
        </Section>
      </div>
    </div>
    <LandingFooter />
  </div>
);

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <div id={id} className="scroll-mt-24">
    <h2 className="text-authority text-xl text-clinical-charcoal font-semibold mb-3">{title}</h2>
    <div className="text-body text-clinical-stone text-sm leading-relaxed">{children}</div>
  </div>
);
