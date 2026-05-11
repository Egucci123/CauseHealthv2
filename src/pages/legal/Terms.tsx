// src/pages/legal/Terms.tsx
// v7 — synced from legal/TERMS_OF_SERVICE.md (May 10, 2026)
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Terms = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">CauseHealth Terms of Service</h1>
      <p className="text-body text-clinical-stone text-sm"><strong>Effective:</strong> May 10, 2026 · <strong>Governing law:</strong> Pennsylvania · <strong>Venue:</strong> Bucks County, Pennsylvania</p>
      <p className="text-body text-clinical-stone text-sm mb-10">
        <strong>Questions:</strong>{' '}
        <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a>
      </p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section id="section-1" title="1. What CauseHealth Is — and Isn't">
          <p>CauseHealth is a wellness app that helps you understand your bloodwork and prepare for conversations with your doctor. You upload your lab results, and we generate a Doctor Prep Document — a structured summary designed to be reviewed with your licensed clinician, not instead of one.</p>
          <p className="mt-3">CauseHealth is not a medical provider. We do not diagnose, treat, or prescribe anything. Nothing in this app is medical advice. Your doctor makes health decisions. We help you have a better conversation with them.</p>
          <p className="mt-3">If you are having a medical emergency, call 911. Do not use this app in an emergency.</p>
        </Section>

        <Section id="section-2" title="2. Who Can Use CauseHealth">
          <p>You can use CauseHealth if you:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Are 18 or older</li>
            <li>Live in the United States (excluding California, New York, Illinois, and Washington State — we don't currently operate there)</li>
            <li>Have a licensed doctor, nurse practitioner, or physician assistant you can discuss your results with</li>
            <li>Are uploading your own personal lab results</li>
          </ul>
          <p className="mt-3">By creating an account you confirm all of the above are true.</p>
        </Section>

        <Section id="section-3" title="3. Your Account">
          <p>Keep your login credentials private. You're responsible for everything that happens under your account. If you think someone has accessed your account without permission, email us at <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a> right away.</p>
        </Section>

        <Section id="section-4" title="4. What You Pay">
          <p>CauseHealth costs $19 for your first lab analysis, which includes up to three wellness plan generations. Additional lab uploads are $5 each.</p>
          <p className="mt-3">There are no subscriptions and no auto-renewal. You pay once per analysis.</p>
          <p className="mt-3">Because we generate your Doctor Prep Document immediately after purchase, all sales are final once your document has been generated. If you were charged in error, email us within 14 days and we'll make it right.</p>
          <p className="mt-3">Payments are processed by Stripe. We never see your full card number.</p>
        </Section>

        <Section id="section-5" title="5. What the App Does With Your Labs">
          <p>When you upload bloodwork, we extract your biomarker values and run them through our analysis pipeline. This combines a set of clinical reference rules we've built with AI (Claude, by Anthropic) to generate your Doctor Prep Document.</p>
          <p className="mt-3">The AI sees your biomarker values, medications, supplements, conditions, and relevant health info you've entered. It does not see your name, email, or payment information — those are stripped before anything is sent.</p>
          <p className="mt-3">Output flagged as critically abnormal triggers a mandatory warning regardless of what the AI produces. We've built safety rails. But no automated system is perfect — which is why your doctor's review is the required final step before you act on anything.</p>
        </Section>

        <Section id="section-6" title="6. Using the App Responsibly">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Upload anyone else's lab results</li>
            <li>Use the app to provide health advice to others</li>
            <li>Attempt to reverse-engineer or scrape the app</li>
            <li>Create an account if you live in a blocked state</li>
            <li>Use the app if you're on a U.S. sanctions list</li>
          </ul>
        </Section>

        <Section id="section-7" title="7. Your Content">
          <p>You own your data. By using the app, you give us permission to store and process it to generate your output. We use it only for that. We don't sell it. We don't share it with advertisers. We don't train AI models on it.</p>
          <p className="mt-3">You can delete your account at any time from Settings. Your health data is purged within 30 days. Billing records are kept 7 years for tax purposes.</p>
        </Section>

        <Section id="section-8" title="8. Liability">
          <p>CauseHealth is a $19 wellness tool. We're not a hospital or a clinical practice. Our liability to you is limited to the amount you paid us, or $100, whichever is greater. We're not liable for health outcomes — those are between you and your doctor.</p>
          <p className="mt-3">This cap doesn't apply to gross negligence, fraud, or data breaches on our part.</p>
        </Section>

        <Section id="section-9" title="9. Disputes">
          <p>If you have a problem with CauseHealth, email <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a> first. Most things can be resolved quickly without anyone lawyering up.</p>
          <p className="mt-3">If we can't resolve it informally within 60 days, disputes are settled by binding individual arbitration through AAA under its Consumer Arbitration Rules. This means you resolve disputes with us individually, not as part of a class action.</p>
          <p className="mt-3">You have the right to opt out of arbitration within 30 days of creating your account. To opt out, email <a href="mailto:support@causehealth.app?subject=Arbitration%20Opt-Out" className="text-primary-container hover:underline">support@causehealth.app</a> with the subject line "Arbitration Opt-Out" and your account email. If you opt out, disputes go to the courts in Bucks County, Pennsylvania.</p>
          <p className="mt-3">Pennsylvania law governs these Terms.</p>
        </Section>

        <Section id="section-10" title="10. Changes to These Terms">
          <p>If we make material changes we'll notify you by email at least 14 days before they take effect. Continued use after that means you accept the new terms.</p>
        </Section>

        <Section id="section-11" title="11. Contact">
          <p>CauseHealth LLC · <a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a></p>
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
