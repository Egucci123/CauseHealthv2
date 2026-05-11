// src/pages/legal/Privacy.tsx
// v6 — synced from legal/PRIVACY_POLICY.md
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Privacy = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">CauseHealth Privacy Policy</h1>
      <p className="text-body text-clinical-stone mb-1 text-sm"><strong>Effective Date:</strong> May 10, 2026</p>
      <p className="text-body text-clinical-stone mb-1 text-sm"><strong>Last Updated:</strong> May 10, 2026</p>
      <p className="text-body text-clinical-stone mb-1 text-sm"><strong>Entity:</strong> CauseHealth LLC</p>
      <p className="text-body text-clinical-stone mb-1 text-sm"><strong>Privacy Contact:</strong> privacy@causehealth.com</p>
      <p className="text-body text-clinical-stone mb-10 text-sm"><strong>Mailing Address:</strong> CauseHealth LLC, registered mailing address</p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section title="1. Introduction">
          <p>CauseHealth ("we," "us," "our") is a consumer wellness application that helps you organize your bloodwork into a Doctor Prep Document for use with your licensed clinician. We are not a healthcare provider, not a HIPAA-covered entity or business associate, and we do not provide medical advice, diagnosis, or treatment.</p>
          <p className="mt-2">This Privacy Policy describes what information we collect, how we use it, who we share it with, and the rights you have. Use of the Service is also governed by our <a href="/terms" className="text-primary-container hover:underline">Terms of Service</a>. If you do not agree with this Policy, do not use the Service.</p>
        </Section>

        <Section title="2. Eligibility and Scope">
          <p>The Service is intended for users who are 18 years of age or older, are residents of the United States (excluding the blocked jurisdictions listed in Section 12), and are established patients of a licensed clinician. We do not knowingly collect personal information from children under 13, and we do not permit users under 18 to create accounts. If you believe a child under 13 has provided us information, contact us at privacy@causehealth.com and we will delete it promptly.</p>
          <p className="mt-2">The Service is not available to residents of California, New York, Illinois, Washington State, the European Economic Area, the United Kingdom, or Switzerland. See Section 12.</p>
        </Section>

        <Section title="3. Information We Collect">
          <p><strong>3.1 Information You Provide Directly</strong></p>
          <p className="mt-2"><strong>Account information:</strong> email address and password. Passwords are stored only as a salted cryptographic hash by our authentication provider (Supabase). We never receive or store your plaintext password.</p>
          <p className="mt-2"><strong>Eligibility attestations:</strong> state of residence, age, and confirmation that you are an established patient of a licensed clinician. These are required to use the Service and are logged with timestamp, IP address, and user agent.</p>
          <p className="mt-2"><strong>Clinician identification:</strong> the name and practice of the licensed clinician with whom you intend to review your Doctor Prep Document. This is collected before output access and is used solely to (a) generate a pre-written patient message you can send to that clinician and (b) create a record that you identified a clinician before accessing the output. We do not contact, verify, or share information with the clinician you identify.</p>
          <p className="mt-2"><strong>Profile information:</strong> first and last name, date of birth, biological sex, height, weight, pregnancy status, allergies, and free-text health notes you choose to enter.</p>
          <p className="mt-2"><strong>Health information you submit:</strong> lab reports you upload (PDFs or images) and the biomarker values extracted from them, including but not limited to lipid panels, hemoglobin A1c, vitamin levels, hormone levels, complete blood counts, metabolic panels, inflammation markers, and thyroid markers. You also enter active medications, supplements, diagnosed conditions, and symptoms with severity ratings.</p>
          <p className="mt-2"><strong>Payment information:</strong> handled entirely by Stripe, Inc. We receive only a payment token, the last four digits of your card, card brand, and billing ZIP code. We never store full card numbers, CVV codes, or bank account numbers.</p>
          <p className="mt-2"><strong>Communications:</strong> when you contact us or use in-app support, we receive the content of those messages and any attachments.</p>
          <p className="mt-2"><strong>Consent records:</strong> every checkbox, acknowledgment, and attestation you complete is logged with the exact text shown, the version of that text, the timestamp, your IP address, and your user agent. This record is used solely to demonstrate compliance with applicable law and to defend the integrity of our consent process.</p>

          <p className="mt-4"><strong>3.2 Information Collected Automatically</strong></p>
          <p className="mt-2">When you use the Service we automatically collect: IP address and approximate city-level location derived from IP; device type, operating system, and browser; referring URL; pages and features accessed; timestamps; and application error logs.</p>

          <p className="mt-4"><strong>3.3 Cookies and Similar Technologies</strong></p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Strictly necessary cookies:</strong> session management and CSRF protection. Required for the Service to function.</li>
            <li><strong>Functional cookies:</strong> user preference storage (e.g., theme, dismissed notices). Can be disabled in browser settings.</li>
          </ul>
          <p className="mt-2">We do not use third-party advertising cookies or pixels of any kind. The Meta Pixel, Google Ads tags, TikTok Pixel, LinkedIn Insight Tag, and similar advertising technologies are not present on the Service.</p>
          <p className="mt-2">We honor Global Privacy Control (GPC) signals as a valid opt-out of any cookie-based data collection or sale.</p>

          <p className="mt-4"><strong>3.4 Information From Third Parties</strong></p>
          <p className="mt-2">If you register or sign in using Google or Apple SSO, we receive only the basic profile information that provider releases to us — typically your email address and name. We do not receive your SSO provider account password.</p>
        </Section>

        <Section title="4. Sensitive Health Information — Elevated Protections">
          <p>Information about your bloodwork, medical conditions, medications, supplements, symptoms, and pregnancy status is sensitive health-related personal information. Even though we are not subject to HIPAA, we apply the following elevated restrictions to this data by default, regardless of your location:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>We do not sell your health information under any circumstances.</li>
            <li>We do not use your health information for behavioral advertising, interest-based advertising, or any form of targeted marketing.</li>
            <li>We do not share your health information with data brokers, insurance companies, employers, or government agencies, except in response to lawful legal process as described in Section 7.</li>
            <li>We do not use individually identifiable health information to train any AI model, whether operated by us or a third party.</li>
            <li>We do not use individually identifiable health information to improve the Service or develop new features. Any product analytics or improvement work uses only aggregated, de-identified data where no individual can be reasonably re-identified.</li>
            <li>We do not share your health information with your employer, insurer, or any healthcare provider unless you affirmatively export and transmit it yourself.</li>
          </ul>
          <p className="mt-2"><strong>Clarification — Product Improvement and De-Identified Data.</strong> "De-identified" means data that has been processed such that no individual can reasonably be re-identified, consistent with 45 CFR § 164.514 standards. We apply HIPAA de-identification standards voluntarily as a best practice. Individually identifiable health information is never used for product improvement, analytics development, or model training.</p>
          <p className="mt-2"><strong>FTC Health Breach Notification Rule (16 CFR Part 318).</strong> CauseHealth processes personal health records as that term is defined in the FTC's Health Breach Notification Rule, as amended in 2024. In the event of a breach of unsecured individually identifiable health information, we are required to notify: (1) affected users without unreasonable delay and within 60 calendar days of discovery; (2) the Federal Trade Commission; and (3) prominent media outlets in any state where more than 500 residents are affected. We maintain a written incident response plan designed to meet all applicable notification timelines, including shorter state-law deadlines. Our internal target is 30 days.</p>
        </Section>

        <Section title="5. How We Use Your Information">
          <p>We use information we collect solely for the following purposes. We do not use your information for any purpose not listed below without your explicit prior consent.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Service operation:</strong> create and authenticate your account, process payments, store your data, and generate your personalized Doctor Prep Document.</li>
            <li><strong>AI output generation:</strong> we transmit a minimal, carefully scoped subset of your information to our AI sub-processor to generate output. This subset is limited to biomarker values, medications, supplements, conditions, symptoms, and relevant demographic factors. It expressly excludes your name, email address, account identifiers, payment information, and any information not directly needed for the analysis.</li>
            <li><strong>Product improvement:</strong> we analyze aggregated and de-identified usage patterns, performance metrics, and error logs. Individually identifiable health data is excluded.</li>
            <li><strong>Communications:</strong> service announcements, security alerts, billing notices, and — if you opt in — educational content. You may opt out of marketing communications at any time. Security and billing communications cannot be opted out of while your account is active.</li>
            <li><strong>Legal compliance and rights protection:</strong> investigate fraud, enforce our Terms of Service, respond to lawful legal process, protect the safety of any person, and defend legal claims.</li>
          </ul>
          <p className="mt-3"><strong>5.1 Data Minimization Commitment.</strong> We design our AI prompts and data pipelines to transmit the minimum information necessary to generate useful output. Before each AI call, our system programmatically strips identifying information (name, email, account ID, IP address, payment token) from the data payload.</p>
        </Section>

        <Section title="6. Sub-Processors and Third-Party Services">
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-xs border border-clinical-stone/30">
              <thead className="bg-clinical-stone/10">
                <tr>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Vendor</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Role</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Data Shared</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">AI Training?</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Region</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">Supabase, Inc.</td><td className="border border-clinical-stone/30 px-2 py-1">Database, auth, storage, serverless compute</td><td className="border border-clinical-stone/30 px-2 py-1">Account, profile, health data, generated docs</td><td className="border border-clinical-stone/30 px-2 py-1">No — prohibited by contract</td><td className="border border-clinical-stone/30 px-2 py-1">United States</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">Anthropic, PBC</td><td className="border border-clinical-stone/30 px-2 py-1">Generative AI (Claude API)</td><td className="border border-clinical-stone/30 px-2 py-1">Biomarker values, medications, conditions, symptoms, demographics only. No name, email, or payment data.</td><td className="border border-clinical-stone/30 px-2 py-1">No — API terms prohibit</td><td className="border border-clinical-stone/30 px-2 py-1">United States</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">Stripe, Inc.</td><td className="border border-clinical-stone/30 px-2 py-1">Payment processing</td><td className="border border-clinical-stone/30 px-2 py-1">Email, name, billing ZIP, card token only</td><td className="border border-clinical-stone/30 px-2 py-1">No</td><td className="border border-clinical-stone/30 px-2 py-1">United States</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">Vercel, Inc.</td><td className="border border-clinical-stone/30 px-2 py-1">Frontend hosting and edge delivery</td><td className="border border-clinical-stone/30 px-2 py-1">IP address, browser metadata, request logs</td><td className="border border-clinical-stone/30 px-2 py-1">No</td><td className="border border-clinical-stone/30 px-2 py-1">Global edge</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">We will update this table when we add or remove sub-processors. Material sub-processor changes that expand the categories of data shared will be announced with advance notice.</p>
        </Section>

        <Section title="7. How We Share Information">
          <p>Beyond the sub-processors above, we share your information only:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>With you:</strong> through the Service interface, exports, and PDFs you generate.</li>
            <li><strong>At your direction:</strong> when you generate and send a Doctor Prep Document or export to your clinician. The sharing decision and act are yours; we provide the export tool only.</li>
            <li><strong>In a business transfer:</strong> if CauseHealth is acquired, merged, or enters bankruptcy, your information may transfer to a successor subject to this Privacy Policy. We will provide at least 30 days' advance written notice and the opportunity to delete your account.</li>
            <li><strong>For legal compliance:</strong> to respond to a valid and legally enforceable subpoena, court order, or other lawful demand. We push back on overbroad or procedurally defective demands where we have grounds and notify you to the extent permitted by law.</li>
            <li><strong>With your explicit consent:</strong> for any other purpose, only with your specific opt-in.</li>
          </ul>
          <p className="mt-2">We do not sell personal information. We do not "share" personal information for cross-context behavioral advertising as those terms are defined under California law (Cal. Civ. Code § 1798.140). These prohibitions are absolute.</p>
        </Section>

        <Section title="8. Data Retention">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Account and profile data:</strong> 30 days after account deletion from active systems; 90 days from backup systems.</li>
            <li><strong>Lab data and generated documents:</strong> retained until you delete them or delete your account, then purged on the same schedule.</li>
            <li><strong>Billing records:</strong> 7 years from the date of the transaction, to comply with tax and accounting law. Billing records are excepted from user-initiated deletion requests.</li>
            <li><strong>Application logs and analytics:</strong> 90 days in identifiable form, after which logs are aggregated, de-identified, or deleted.</li>
            <li><strong>Consent records:</strong> retained for the life of the account plus 7 years to support enforceability of your agreement to these Terms and the Privacy Policy. Consent records are excepted from user-initiated deletion requests.</li>
          </ul>
          <p className="mt-2">You may delete your account at any time from Settings → Account → Delete Account, or by emailing privacy@causehealth.com. Deletion is permanent and irreversible. We confirm deletion by email within 5 business days.</p>
        </Section>

        <Section title="9. Security">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>TLS 1.2 or higher for all data in transit.</li>
            <li>Encryption at rest for our primary database and file storage.</li>
            <li>Row-level security policies that prevent any user from accessing another user's data.</li>
            <li>Cryptographic password hashing (bcrypt or argon2). We never store plaintext passwords.</li>
            <li>Principle-of-least-privilege access controls.</li>
            <li>Audit logging for administrative actions.</li>
            <li>Regular dependency and vulnerability scanning and patching.</li>
            <li>Written incident response plan with defined notification timelines.</li>
          </ul>
          <p className="mt-2">To report a security vulnerability, email <a href="mailto:security@causehealth.com" className="text-primary-container hover:underline">security@causehealth.com</a>. We will acknowledge reports within 2 business days.</p>
          <p className="mt-2"><strong>Breach Notification.</strong> If we discover a breach of unsecured health information, we will notify affected users, the FTC, and applicable state regulators within the timeframes required by law. The FTC Health Breach Notification Rule (16 CFR Part 318) sets a 60-day maximum window. State laws may impose shorter deadlines (some require 30 days). We target 30 days as our internal standard.</p>
        </Section>

        <Section title="10. Your Privacy Rights">
          <p>Depending on where you live, you may have some or all of the following rights. We honor all of these for all permitted U.S. users as a matter of policy:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Access</strong> — request a copy of the personal information we hold about you.</li>
            <li><strong>Correction</strong> — ask us to correct inaccurate personal information.</li>
            <li><strong>Deletion</strong> — ask us to delete your personal information, subject to legal retention obligations.</li>
            <li><strong>Portability</strong> — receive a machine-readable export of your personal information.</li>
            <li><strong>Opt-out of sale/sharing for advertising</strong> — we do not sell or share for cross-context advertising; this right is honored by default.</li>
            <li><strong>Limit use of sensitive information</strong> — we already limit use of your sensitive health information to Service operation only; this right is honored by default.</li>
            <li><strong>Withdraw consent</strong> — withdraw any consent previously given.</li>
            <li><strong>Non-discrimination</strong> — we will not deny service or charge different prices for exercising any privacy right.</li>
            <li><strong>Appeal</strong> — if we deny your privacy request, you may appeal by contacting our privacy lead. We respond to appeals within 60 days.</li>
          </ul>
          <p className="mt-2">To submit a rights request, email <a href="mailto:privacy@causehealth.com" className="text-primary-container hover:underline">privacy@causehealth.com</a>. We may need to verify your identity. We respond within 45 days; we may extend by 45 more days for complex requests with written notice.</p>

          <p className="mt-3"><strong>10.1 California, New York, Illinois, Washington — Not Permitted Users.</strong> The Service is not available to residents of California, New York, Illinois, or Washington State. Section 12 explains the geographic restrictions. The CCPA/CPRA, NY SHIELD, BIPA, and Washington My Health MY Data Act do not apply because residents of those jurisdictions are not permitted users.</p>

          <p className="mt-3"><strong>10.2 State Privacy Laws That Do Apply.</strong> The following state laws may apply to permitted users:</p>
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-xs border border-clinical-stone/30">
              <thead className="bg-clinical-stone/10">
                <tr>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">State Law</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Applies To</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Rights Honored</th>
                  <th className="border border-clinical-stone/30 px-2 py-1 text-left">Sensitive Data Treatment</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">TX TDPSA</td><td className="border border-clinical-stone/30 px-2 py-1">All TX residents (no threshold)</td><td className="border border-clinical-stone/30 px-2 py-1">Access, correct, delete, portability, opt-out of sale/profiling, appeal</td><td className="border border-clinical-stone/30 px-2 py-1">Explicit consent required before processing sensitive health data</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">VA VCDPA</td><td className="border border-clinical-stone/30 px-2 py-1">Above threshold</td><td className="border border-clinical-stone/30 px-2 py-1">Same as TX</td><td className="border border-clinical-stone/30 px-2 py-1">Consent required</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">CO CPA</td><td className="border border-clinical-stone/30 px-2 py-1">Above threshold</td><td className="border border-clinical-stone/30 px-2 py-1">Same as TX; GPC honored</td><td className="border border-clinical-stone/30 px-2 py-1">Consent required</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">CT CTDPA</td><td className="border border-clinical-stone/30 px-2 py-1">Above threshold</td><td className="border border-clinical-stone/30 px-2 py-1">Same as TX</td><td className="border border-clinical-stone/30 px-2 py-1">Consent required</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">OR OCPA</td><td className="border border-clinical-stone/30 px-2 py-1">Above threshold</td><td className="border border-clinical-stone/30 px-2 py-1">Same as TX</td><td className="border border-clinical-stone/30 px-2 py-1">Health data is sensitive</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">TX HB 4</td><td className="border border-clinical-stone/30 px-2 py-1">All TX residents</td><td className="border border-clinical-stone/30 px-2 py-1">See TDPSA</td><td className="border border-clinical-stone/30 px-2 py-1">Health data is sensitive</td></tr>
                <tr><td className="border border-clinical-stone/30 px-2 py-1">NV SB 370</td><td className="border border-clinical-stone/30 px-2 py-1">NV residents using websites/apps</td><td className="border border-clinical-stone/30 px-2 py-1">Opt-out of sale</td><td className="border border-clinical-stone/30 px-2 py-1">Health data covered</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="11. AI Disclosures and Data Minimization">
          <p>CauseHealth uses a generative AI large language model (currently the Claude API, operated by Anthropic, PBC) to produce narrative interpretations of your bloodwork.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>AI involvement is mandatory for core features.</strong> The personalized Doctor Prep Document is generated by AI. These features cannot be used without AI involvement.</li>
            <li><strong>Output is generated, not retrieved.</strong> The same inputs may produce different outputs across sessions.</li>
            <li><strong>Output may be inaccurate.</strong> AI output may be incomplete, outdated, or wrong. We layer deterministic clinical rules and safety filters to reduce — not eliminate — this risk. All output should be treated as a starting point for discussion with a licensed clinician.</li>
            <li><strong>Your data is not used for AI training.</strong> Anthropic is contractually prohibited from training on data submitted through the CauseHealth API integration.</li>
            <li><strong>Strict data minimization on AI prompts.</strong> We transmit to Anthropic only biomarker values, medications, conditions, supplements, symptoms, and relevant demographic factors. Your name, email, account ID, IP address, and payment information are programmatically excluded from every AI prompt.</li>
            <li><strong>Human oversight.</strong> AI output is reviewed by deterministic rule systems before delivery. Emergency alert conditions trigger mandatory warning language regardless of AI output.</li>
          </ul>
        </Section>

        <Section title="12. Geographic Restrictions — Blocked and Restricted Jurisdictions">
          <p>The Service is available only to residents of certain U.S. states. The Service is <strong>not</strong> available to residents of:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>California</strong> — due to the California Consumer Legal Remedies Act, Unfair Competition Law, Consumer Privacy Rights Act, and related statutes that create private rights of action and one-way attorney fee-shifting in consumer litigation.</li>
            <li><strong>New York</strong> — due to New York General Business Law § 349 (private right of action and mandatory attorney fees), the SHIELD Act, and the New York attorney general's enforcement posture in consumer health matters.</li>
            <li><strong>Illinois</strong> — due to the Illinois Biometric Information Privacy Act (BIPA, 740 ILCS 14/1 et seq.) and the Illinois Consumer Fraud and Deceptive Business Practices Act.</li>
            <li><strong>Washington State</strong> — due to the Washington My Health MY Data Act (SB 1155), which imposes the broadest non-HIPAA consumer health data obligations in the U.S., including a private right of action and triple damages for willful violations.</li>
            <li><strong>EU / EEA / United Kingdom / Switzerland</strong> — the Service is not available internationally.</li>
          </ul>
          <p className="mt-2"><strong>Technical Enforcement.</strong> We implement IP-based geolocation blocks and a mandatory self-certification at account registration. At registration, you must affirmatively represent that you are not a current resident of any blocked jurisdiction. If you are a resident of a blocked jurisdiction and circumvent these controls to access the Service, you do so in material breach of these Terms. We may terminate any account we determine is operated by a resident of a blocked jurisdiction and retain any subscription fees paid as liquidated damages for the breach.</p>
          <p className="mt-2"><strong>Residency Defined.</strong> "Resident" means a person whose primary domicile is in the blocked jurisdiction at the time of account creation or at any time during an active subscription. Temporary physical presence in a blocked jurisdiction (e.g., travel) while domiciled elsewhere does not constitute residency.</p>
        </Section>

        <Section title="13. Corporate Practice of Medicine and Regulatory Disclaimer">
          <p>CauseHealth does not employ licensed physicians, nurses, or other healthcare professionals to provide clinical services through the Service. The Service does not constitute the practice of medicine, nursing, or any other licensed healthcare profession in any jurisdiction.</p>
          <p className="mt-2">Output produced by the Service is generated by software and AI systems, not by licensed clinicians. CauseHealth is not subject to medical practice acts, state telehealth regulations, or the clinical oversight requirements applicable to healthcare providers. Nothing in the Service creates a physician-patient, nurse-patient, therapist-patient, or any other professional-patient relationship between you and CauseHealth or any of its personnel.</p>
        </Section>

        <Section title="14. Changes to This Policy">
          <p>We may update this Policy to reflect changes in our practices, technology, legal requirements, or sub-processors. Material changes — including any change to how we use health data, any new category of sub-processor, or any expansion of data sharing — will be announced by email and in-app notification at least 14 days before they take effect. Where required by law, we will obtain your renewed consent before applying material changes to information already collected. Non-material changes (clarifications, corrections, contact updates) may be made without advance notice.</p>
        </Section>

        <Section title="15. Contact">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Email:</strong> <a href="mailto:privacy@causehealth.com" className="text-primary-container hover:underline">privacy@causehealth.com</a></li>
            <li><strong>Security reports:</strong> <a href="mailto:security@causehealth.com" className="text-primary-container hover:underline">security@causehealth.com</a></li>
            <li><strong>Mail:</strong> CauseHealth LLC, registered mailing address</li>
            <li><strong>Data protection lead:</strong> Evan Gutman, Founder</li>
          </ul>
          <p className="mt-2">If you are not satisfied with our response, you may contact your state attorney general or applicable state privacy enforcement agency.</p>
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
