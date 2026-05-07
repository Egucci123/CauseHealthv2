// src/pages/legal/Terms.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

export const Terms = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <div className="max-w-3xl mx-auto px-6 pt-32 pb-20">
      <h1 className="text-authority text-4xl text-clinical-charcoal font-bold mb-2">Terms of Service</h1>
      <p className="text-body text-clinical-stone mb-2">Last updated: May 6, 2026</p>
      <p className="text-body text-clinical-stone mb-10 italic text-sm">Please read these Terms carefully. By creating an account or using CauseHealth, you agree to be bound by them. They include arbitration, a class-action waiver, and important limitations on our liability.</p>

      <div className="prose prose-sm max-w-none space-y-8">
        <Section title="1. Acceptance of Terms">
          <p>By creating an account, accessing, or using CauseHealth (the "Service"), you ("you" or "User") agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not create an account and do not use the Service.</p>
          <p className="mt-2">These Terms form a binding contract between you and CauseHealth ("CauseHealth," "we," "us," or "our"). You acknowledge that you have read, understood, and accept these Terms in their entirety.</p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be at least 18 years old and legally able to enter into a binding contract to use CauseHealth. By using the Service, you represent that you meet these requirements.</p>
          <p className="mt-2">CauseHealth is intended for personal, non-commercial use by individuals seeking to understand their own health data. You may not use the Service on behalf of another person without their explicit consent and your legal authority to act on their behalf.</p>
          <p className="mt-2">CauseHealth is intended for use by adults in the United States. We make no representation that the Service is appropriate or available for use in other jurisdictions.</p>
        </Section>

        <Section title="3. What CauseHealth Is">
          <p>CauseHealth is a <strong>consumer health information and wellness service</strong>. We help you:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Understand your bloodwork and lab values against standard and functional reference ranges</li>
            <li>Identify potential patterns in your labs, medications, conditions, and symptoms</li>
            <li>Receive educational suggestions for tests, supplements, dietary patterns, exercise, and lifestyle interventions</li>
            <li>Generate documents you can share with your healthcare provider</li>
            <li>Track changes between lab draws over time</li>
          </ul>
          <p className="mt-2">CauseHealth analyzes the information you provide using artificial intelligence and rule-based engines, and produces educational outputs based on that analysis.</p>
        </Section>

        <Section title="4. What CauseHealth Is NOT — Critical Limitations">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>CauseHealth is <strong>NOT a medical device, NOT FDA-approved, and NOT FDA-cleared</strong>.</li>
            <li>CauseHealth does <strong>NOT diagnose, treat, cure, prevent, or mitigate</strong> any disease, illness, or medical condition.</li>
            <li>CauseHealth does <strong>NOT provide medical advice</strong>. All content is educational and informational only.</li>
            <li>CauseHealth does <strong>NOT replace your physician, specialist, pharmacist, or any licensed healthcare professional</strong>.</li>
            <li>CauseHealth does <strong>NOT establish a doctor-patient, pharmacist-patient, or any professional healthcare relationship</strong> between you and CauseHealth or its operators.</li>
            <li>ICD-10 codes, suggested tests, supplement recommendations, lifestyle interventions, predicted outcomes, suspected conditions, and clinical summaries are <strong>educational aids for discussion with your provider</strong>. They are not orders, prescriptions, or diagnostic conclusions.</li>
            <li>The "Possible Conditions to Investigate" section presents <strong>differential pattern matches against your data</strong>, NOT diagnoses. Only a licensed healthcare provider can diagnose any condition.</li>
            <li>The "Drug-Supplement Interactions" screen is based on general public databases. It does NOT replace consultation with a pharmacist or prescriber regarding your specific medications.</li>
          </ul>
        </Section>

        <Section title="4a. HIPAA Does Not Apply to CauseHealth">
          <p className="mt-2">
            <strong>CauseHealth is not a HIPAA covered entity.</strong> The Health Insurance Portability and Accountability Act (HIPAA) regulates a specific set of organizations: healthcare providers who bill electronically, health plans, healthcare clearinghouses, and the "business associates" of those entities. CauseHealth is a consumer health information and wellness service that you voluntarily upload your own data to — it is none of those things, does not bill insurance, and does not enter into business associate agreements.
          </p>
          <p className="mt-3">
            This means HIPAA's specific protections, breach-notification rules, and patient-rights provisions <strong>do not apply</strong> to your data on CauseHealth. The protections we provide your data are governed instead by:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Our Privacy Policy and the security practices described in it</li>
            <li>The <strong>FTC Health Breach Notification Rule</strong> (16 CFR Part 318), which requires us to notify you within 60 days of a security breach affecting your identifiable health information</li>
            <li>The <strong>California Consumer Privacy Act (CCPA / CPRA)</strong> if you reside in California</li>
            <li>The <strong>EU General Data Protection Regulation (GDPR)</strong> if you reside in the European Economic Area, the United Kingdom, or Switzerland</li>
            <li>The <strong>Washington My Health My Data Act (MHMDA, RCW 19.373)</strong>, which applies to all consumer health data we collect — even from users outside Washington state</li>
            <li>Other applicable state and federal consumer-data laws</li>
          </ul>
          <p className="mt-3">
            If you require HIPAA-covered handling of your health information, do not use CauseHealth. Have your healthcare provider keep that information in their HIPAA-covered systems instead.
          </p>
        </Section>

        <Section title="5. Your Responsibility for Your Health">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>You are solely responsible for all decisions you make about your health.</strong></li>
            <li><strong>Always consult a qualified healthcare provider</strong> (physician, pharmacist, specialist) before starting, stopping, or modifying any medication, supplement, diet, exercise plan, or treatment.</li>
            <li><strong>Do not delay seeking medical attention</strong> based on anything you read or see in CauseHealth.</li>
            <li>If you are experiencing a medical emergency, <strong>call 911 or your local emergency number immediately</strong>. CauseHealth is not an emergency service.</li>
            <li>You are responsible for the <strong>accuracy of all information you provide</strong>, including lab results, medications, symptoms, conditions, age, sex, and lifestyle data. CauseHealth's outputs are only as accurate as your inputs.</li>
            <li>You are responsible for verifying any information CauseHealth provides with your healthcare provider before acting on it.</li>
          </ul>
        </Section>

        <Section title="6. AI-Generated Content — Limitations">
          <p>CauseHealth uses artificial intelligence (currently Anthropic's Claude model) and rule-based engines to analyze your data and produce reports.</p>
          <p className="mt-2"><strong>Important AI limitations:</strong></p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>AI-generated content may contain errors, omissions, hallucinations, or inaccuracies.</li>
            <li>AI may misinterpret your inputs, misapply clinical reasoning, or surface differentials that don't apply to you.</li>
            <li>AI does not have access to your full medical history, family history, current symptoms beyond what you reported, allergies, prior imaging, or any data outside of what you've explicitly provided.</li>
            <li>AI cannot account for nuances a trained clinician would catch from physical examination, history-taking, or longitudinal knowledge of you.</li>
            <li>AI outputs are provided <strong>"AS IS" without warranty of any kind</strong>.</li>
          </ul>
          <p className="mt-2"><strong>You expressly acknowledge that you are aware of these limitations and agree to verify all AI-generated content with a licensed healthcare provider before acting on it.</strong></p>
        </Section>

        <Section title="7. Supplement Recommendations — Specific Risks">
          <p>CauseHealth may recommend dietary supplements based on your data. You acknowledge:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Dietary supplements are <strong>not regulated by the FDA</strong> for safety or efficacy in the same way prescription medications are.</li>
            <li>Supplements can interact with prescription medications, alter laboratory values, and cause adverse effects.</li>
            <li>While we screen recommendations against your medications using a public-database-derived interaction engine, this engine is not exhaustive and may miss interactions specific to your situation.</li>
            <li><strong>You agree to consult your physician AND pharmacist before adding ANY supplement to your regimen</strong>, regardless of whether CauseHealth flagged it as safe.</li>
            <li>You assume all risk associated with any supplement you choose to take.</li>
          </ul>
        </Section>

        <Section title="8. Pricing and Payment">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>$19</strong> (one-time) unlocks your CauseHealth account and your first lab analysis. Includes up to 3 wellness plan generations against your initial lab data.</li>
            <li><strong>$5</strong> (one-time) per additional lab upload (e.g., a 12-week retest, follow-up labs). Each upload includes up to 3 wellness plan generations against that data.</li>
            <li>Payment is processed securely through Stripe, Inc. CauseHealth does not store your credit card number, security code, or billing details.</li>
            <li>All purchases are <strong>final and non-refundable</strong> once a wellness plan has been generated. If you have a billing dispute, contact us within 7 days at support@causehealth.app and we will review on a case-by-case basis.</li>
            <li>Prices are subject to change. We will provide at least 30 days' notice before any price increase affecting existing accounts.</li>
            <li>You are responsible for any applicable sales tax.</li>
          </ul>
        </Section>

        <Section title="9. Account Security">
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You agree to notify us immediately of any unauthorized access to your account.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>Do not share your account with others. If multiple people in your household want to use CauseHealth, each person must create their own account.</li>
          </ul>
        </Section>

        <Section title="10. Your Data and Privacy">
          <p>Your data privacy is governed by our <a href="/privacy" className="text-primary-container hover:underline">Privacy Policy</a> and our <a href="/privacy" className="text-primary-container hover:underline">Consumer Health Data Privacy Policy</a>, which are incorporated into these Terms by reference.</p>
          <p className="mt-2">In summary:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>You own your data. We never sell or monetize your personal health information.</li>
            <li>Your health data is processed by AI services (Anthropic) and stored on secure infrastructure (Supabase) to provide the Service.</li>
            <li>You can export all your data at any time from Settings.</li>
            <li>You can delete your account and all associated data at any time from Settings, in accordance with applicable privacy laws including the California Consumer Privacy Act, Washington My Health My Data Act, and the EU General Data Protection Regulation where applicable.</li>
          </ul>
        </Section>

        <Section title="11. Acceptable Use">
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
            <li>Upload data that is not yours, or upload another person's lab results without their explicit permission and your legal authority to do so.</li>
            <li>Attempt to reverse-engineer, decompile, or extract the source code of the Service.</li>
            <li>Use automated tools (bots, scrapers) to access the Service without our express written permission.</li>
            <li>Resell, redistribute, or commercially exploit any output of the Service without our written permission.</li>
            <li>Misrepresent CauseHealth outputs as medical advice, diagnoses, or recommendations from a licensed healthcare provider.</li>
            <li>Use the Service in a way that could harm CauseHealth, other users, or third parties.</li>
          </ul>
          <p className="mt-2">We reserve the right to suspend or terminate accounts that violate these terms, with or without notice.</p>
        </Section>

        <Section title="12. Intellectual Property">
          <p>All content, software, design, and intellectual property of the CauseHealth Service (excluding your personal health data) are owned by CauseHealth or our licensors. You receive a limited, non-exclusive, non-transferable license to use the Service for your personal use only.</p>
          <p className="mt-2">Your personal health data remains your property. By using the Service, you grant CauseHealth a limited license to use your data solely to provide the Service to you.</p>
        </Section>

        <Section title="13. Termination">
          <p>You may cancel your account at any time from Settings. We may suspend or terminate your account at our discretion if you violate these Terms or for any lawful reason. Upon termination:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Your access to the Service will end.</li>
            <li>Your data will be deleted in accordance with our Privacy Policy and applicable law (typically within 30 days, except where retention is legally required).</li>
            <li>Sections of these Terms that by their nature survive termination (limitation of liability, indemnification, dispute resolution, governing law) will remain in effect.</li>
          </ul>
        </Section>

        <Section title="14. Disclaimer of Warranties">
          <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, OR NON-INFRINGEMENT.</p>
          <p className="mt-2">CAUSEHEALTH DOES NOT WARRANT THAT:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>The Service will be uninterrupted, secure, or error-free.</li>
            <li>The information generated will be accurate, reliable, complete, or up-to-date.</li>
            <li>Any errors will be corrected.</li>
            <li>The Service is free of viruses or harmful components.</li>
          </ul>
        </Section>

        <Section title="15. Limitation of Liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:</p>
          <p className="mt-2">CAUSEHEALTH AND ITS OPERATORS, OFFICERS, EMPLOYEES, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, DATA, HEALTH OUTCOMES, OR OTHER INTANGIBLE LOSSES, ARISING FROM:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Your use of or inability to use the Service.</li>
            <li>Any health decisions you make based on information provided by CauseHealth.</li>
            <li>Any actions or inactions of healthcare providers based on CauseHealth outputs.</li>
            <li>Any supplement, medication, or lifestyle decision you make.</li>
            <li>Unauthorized access to your data, except as required by law.</li>
            <li>Any third-party content, services, or links.</li>
          </ul>
          <p className="mt-2"><strong>OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO CAUSEHEALTH IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER.</strong></p>
          <p className="mt-2">Some jurisdictions do not allow the exclusion or limitation of certain damages, so some of the above limitations may not apply to you.</p>
        </Section>

        <Section title="16. Indemnification">
          <p>You agree to indemnify, defend, and hold harmless CauseHealth, its operators, officers, employees, and affiliates from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>Your use of the Service.</li>
            <li>Your violation of these Terms.</li>
            <li>Your violation of any rights of any third party.</li>
            <li>Any health decision you make based on information from CauseHealth.</li>
            <li>The accuracy of any data you provide.</li>
          </ul>
        </Section>

        <Section title="17. Dispute Resolution — Arbitration and Class Action Waiver">
          <p><strong>READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.</strong></p>
          <p className="mt-2">Any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved through <strong>binding individual arbitration</strong>, not in court, except that you may bring an individual action in small-claims court if eligible.</p>
          <p className="mt-2">Arbitration will be conducted by the American Arbitration Association (AAA) under its Consumer Arbitration Rules, in your county of residence or another mutually-agreed location.</p>
          <p className="mt-2"><strong>CLASS ACTION WAIVER:</strong> YOU AGREE THAT ANY DISPUTE WILL BE RESOLVED ON AN INDIVIDUAL BASIS. YOU WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION, OR REPRESENTATIVE ACTION AGAINST CAUSEHEALTH.</p>
          <p className="mt-2"><strong>OPT-OUT:</strong> You may opt out of this arbitration agreement by emailing support@causehealth.app within 30 days of first accepting these Terms, with the subject line "Arbitration Opt-Out" and your full name + account email. If you opt out, you may bring claims in court but waive nothing else in these Terms.</p>
        </Section>

        <Section title="18. Governing Law and Jurisdiction">
          <p>These Terms are governed by the laws of the State of Florida, United States, without regard to conflict-of-law principles. Subject to the arbitration clause above, any dispute that proceeds in court shall be brought exclusively in the state or federal courts located in Miami-Dade County, Florida, and you consent to personal jurisdiction in those courts.</p>
        </Section>

        <Section title="19. Changes to These Terms">
          <p>We may update these Terms from time to time. Material changes will be communicated to you by email or through an in-app notification at least 14 days before they take effect. Continued use of the Service after the effective date of updated Terms constitutes acceptance.</p>
          <p className="mt-2">If you do not agree to updated Terms, you may cancel your account before they take effect. We will refund any unused portion of your purchase if the change materially reduces the value of the Service.</p>
        </Section>

        <Section title="20. Force Majeure">
          <p>CauseHealth shall not be liable for any failure to perform due to causes beyond our reasonable control, including but not limited to natural disasters, war, terrorism, civil unrest, government action, internet or telecommunications failures, or third-party service outages (including outages of Anthropic, Stripe, or Supabase).</p>
        </Section>

        <Section title="21. Severability">
          <p>If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect. The unenforceable provision will be modified to the minimum extent necessary to make it enforceable while preserving its intent.</p>
        </Section>

        <Section title="22. Entire Agreement">
          <p>These Terms, together with our Privacy Policy and Medical Disclaimer, constitute the entire agreement between you and CauseHealth regarding the Service and supersede any prior agreements.</p>
        </Section>

        <Section title="23. Contact Us">
          <p>For questions about these Terms, contact us at:</p>
          <p className="mt-2"><a href="mailto:support@causehealth.app" className="text-primary-container hover:underline">support@causehealth.app</a></p>
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
