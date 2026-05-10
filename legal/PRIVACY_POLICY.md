# CauseHealth Privacy Policy

**DRAFT — FOR LEGAL REVIEW. NOT FINAL. DO NOT PUBLISH WITHOUT ATTORNEY APPROVAL.**

**Effective Date:** [FILL: launch date]
**Last Updated:** [FILL: last update date]
**Entity:** [FILL: legal name of operating entity, e.g., "CauseHealth, Inc.", "CauseHealth LLC"]
**Contact:** [FILL: privacy@causehealth.com or equivalent]
**Mailing address:** [FILL: registered address]

---

## 1. Introduction

CauseHealth (“we,” “us,” “our,” the “Service”) is a consumer wellness application that helps you understand your bloodwork and lifestyle factors. We are **not** a healthcare provider, are **not** a HIPAA-covered entity, and we **do not provide medical advice, diagnosis, or treatment.** The Service is intended to support — not replace — your relationship with a licensed clinician.

This Privacy Policy describes what information we collect, how we use it, who we share it with, and the rights you have. Use of the Service is also governed by our [Terms of Service](./TERMS_OF_SERVICE.md).

If you do not agree with this Policy, do not use the Service.

---

## 2. Eligibility

The Service is intended for users who are **18 years of age or older** and located in the **United States**. We do not knowingly collect information from children under 13 (or under 16 in jurisdictions where the higher floor applies). If you believe a child has provided us information, contact us at [FILL: privacy contact] and we will delete it.

---

## 3. Information We Collect

We collect three categories of information.

### 3.1 Information you provide directly

- **Account information:** email address and password (password is stored only as a salted hash by our authentication provider; we never see plaintext passwords).
- **Profile information:** first and last name, date of birth, biological sex, height, weight, pregnancy status, allergies, free-text health notes.
- **Health information you submit:**
  - Lab reports you upload (PDFs, images) and the parsed laboratory values extracted from them — including but not limited to lipid panels, hemoglobin A1c, vitamin levels, hormone levels, complete blood counts, comprehensive metabolic panels, inflammation markers, thyroid markers, and any other biomarkers contained in the document you upload.
  - Active medications, supplements, conditions/diagnoses, and symptoms (with severity ratings) that you enter.
- **Payment information:** payment is handled by our payment processor (Stripe). We do **not** store full card numbers, CVV, or full bank account numbers on our servers. We receive only a token, the last four digits of your card, brand, and billing zip.
- **Communications:** when you email us or use in-app support, we receive the content of those messages and any attachments.

### 3.2 Information collected automatically

- **Device and usage data:** IP address, approximate location derived from IP, device type, operating system, browser, referring URL, pages viewed, features used, timestamps, error logs.
- **Cookies and similar technologies:** see Section 9.
- **Analytics events:** page views, button clicks, generation events. We use these to improve the Service. [FILL: name your analytics tool — e.g., PostHog, Plausible, none.]

### 3.3 Information from third parties

If you sign in via a third-party identity provider (e.g., Google, Apple), we receive the basic profile data that provider releases to us (typically email and name). We do not receive your password.

---

## 4. Sensitive Personal Information / “Health Information”

Some of the information we process — your bloodwork, conditions, medications, symptoms, and pregnancy status — is **sensitive health-related information**. Even though we are not a HIPAA-covered entity, we treat this information with elevated care and only use it to deliver the Service to you.

We do **not**:
- sell your health information,
- use your health information for behavioral advertising,
- share your health information with data brokers,
- use your health information to train any third-party AI model,
- share your health information with your employer, insurer, or healthcare provider unless **you** affirmatively share or export it.

---

## 5. How We Use Your Information

We use the information we collect to:

1. **Operate the Service** — create and authenticate your account, process payments, store and display your data, generate your wellness plan / lab analysis / doctor-prep document.
2. **Generate AI output** — to produce the personalized output, we transmit the relevant subset of your information (profile, lab values, medications, symptoms, conditions, supplements) to our AI sub-processor under contract (see Section 6). Output is returned to us, stored against your account, and shown only to you.
3. **Improve the Service** — diagnose bugs, monitor performance, develop new features. Where we use your data for product improvement, we do so on aggregated or de-identified data wherever feasible.
4. **Communicate with you** — service announcements, security alerts, billing notices, and (if you opt in) product updates and educational content. You can opt out of marketing email at any time; transactional/security emails cannot be opted out of while you have an active account.
5. **Comply with law and protect rights** — investigate fraud, enforce our Terms, comply with subpoenas and lawful requests, defend legal claims.

We do **not** use your information for any purpose other than those listed without your additional consent.

---

## 6. Sub-Processors and Third-Party Services

We rely on a small set of vetted vendors to operate the Service. Each vendor is contractually bound to use your information only to provide their service to us.

| Vendor | Role | Data shared | Region |
| --- | --- | --- | --- |
| [FILL: Supabase, Inc.] | Database, authentication, storage, serverless compute | All account, profile, lab, and generated content data | United States |
| [FILL: Anthropic, PBC] | Generative AI (Claude API) for narrative wellness plan, lab analysis, doctor prep | Profile demographics, lab values, medications, conditions, symptoms, supplements (no email, no payment data, no name) | United States |
| [FILL: Stripe, Inc.] | Payment processing | Email, name, billing zip, card token | United States |
| [FILL: Vercel, Inc.] | Frontend hosting and edge delivery | IP address, browser info, request metadata | Global edge |
| [FILL: email vendor — e.g., Resend, Postmark, SendGrid] | Transactional email | Email, message content | United States |
| [FILL: analytics vendor or "none"] | Product analytics | Pseudonymized usage events | [FILL] |
| [FILL: error monitoring — e.g., Sentry, or "none"] | Error and performance monitoring | Stack traces, request metadata, user ID | [FILL] |

We have a written data processing agreement (or equivalent terms) with each sub-processor that handles personal information. **No sub-processor uses your information to train an AI model.** Anthropic’s API terms specifically prohibit training on our submitted data; we have a written contract with Anthropic confirming this. [LEGAL: confirm Anthropic API terms in force at launch and attach as exhibit.]

We will update this list when we add or remove sub-processors.

---

## 7. How We Share Information

Beyond the sub-processors above, we share information only:

- **With you** — through the Service interface, exports, and PDFs you generate.
- **With people you direct us to share with** — for example, when you generate a Doctor Prep document and send it to your physician. The act of sharing is yours; we provide the export tool.
- **In a business transfer** — if we are acquired, merged, sold, or undergo bankruptcy, your information may transfer to the successor. We will notify you and give you a meaningful chance to delete your account before the transfer takes effect.
- **For legal reasons** — to comply with a subpoena, court order, or other lawful demand; to defend our rights or those of users; to investigate fraud or security incidents; to protect anyone’s safety. We push back on overbroad requests where we have grounds to do so.
- **With your consent** — for any other purpose, only with your specific opt-in.

We do **not** sell personal information. We do **not** “share” personal information for cross-context behavioral advertising as those terms are defined under California law.

---

## 8. Data Retention

We retain your information for as long as your account is active and for a reasonable period afterward to comply with our legal obligations, resolve disputes, and enforce agreements.

- **Account and profile:** retained until you delete your account, then purged within [FILL: 30] days from active systems and within [FILL: 90] days from backups.
- **Lab data and generated documents:** retained until you delete them or delete your account, then purged on the same schedule.
- **Billing records:** retained for [FILL: 7] years to comply with tax and accounting law.
- **Logs and analytics:** retained for [FILL: 90 days] in identifiable form, then aggregated or deleted.

You can delete your account at any time from Settings → Account, or by emailing [FILL: privacy contact]. Deletion is irreversible.

---

## 9. Cookies and Tracking

We use a small number of cookies and similar technologies:

- **Strictly necessary cookies** — to keep you logged in and protect against CSRF.
- **Functional cookies** — to remember your preferences (e.g., theme, dismissed banners).
- **Analytics cookies** — [FILL: only if you use analytics; describe and offer opt-out.]

We do **not** use third-party advertising cookies or pixels. There are no Meta Pixel, Google Ads, TikTok, or LinkedIn trackers on the Service.

You can disable cookies in your browser, but parts of the Service will not function correctly without strictly necessary cookies.

We honor **Global Privacy Control (GPC)** signals as a valid opt-out request from California users.

---

## 10. Security

We use industry-standard administrative, technical, and physical safeguards to protect your information:

- TLS 1.2+ for all data in transit.
- Encryption at rest for the primary database and object storage.
- Row-level security policies that prevent users from reading other users’ data.
- Hashed passwords (bcrypt/argon2) — we never see your plaintext password.
- Principle-of-least-privilege access controls for staff. [FILL: who has prod access — likely just founder pre-launch.]
- Audit logs for administrative actions.
- Regular dependency updates and vulnerability monitoring.

No system is perfectly secure. If you become aware of a security issue, please email [FILL: security@causehealth.com]. If we become aware of a breach affecting your information, we will notify you and applicable regulators within the timeframes required by law.

---

## 11. Your Privacy Rights

Depending on where you live, you may have the following rights:

- **Access** — request a copy of the information we hold about you.
- **Correction** — ask us to fix inaccurate information.
- **Deletion** — ask us to delete your information.
- **Portability** — receive a machine-readable export of your information.
- **Opt-out of sale or sharing** — we do not sell or share for cross-context advertising; this opt-out is honored by default.
- **Limit use of sensitive information** — we already limit use of your sensitive health information to providing the Service; this is honored by default.
- **Withdraw consent** — withdraw any consent you previously gave.
- **Non-discrimination** — we will not deny service or charge a different price for exercising your rights.

To exercise any right, email [FILL: privacy contact]. We may need to verify your identity by asking you to confirm details associated with your account. We will respond within the timeframe required by your jurisdiction’s law (typically 30–45 days). You may also designate an authorized agent.

If you are in California, you have additional rights under the **California Consumer Privacy Act / California Privacy Rights Act**:
- Right to know categories and specific pieces of personal information collected.
- Right to delete.
- Right to correct.
- Right to opt out of sale/sharing (we do not sell or share — this is honored by default).
- Right to limit use of sensitive personal information (already limited).
- Right not to be retaliated against for exercising your rights.

If you are in [FILL: other state laws — Virginia VCDPA, Colorado CPA, Connecticut CTDPA, Texas TDPSA, etc., as relevant], you have analogous rights. [LEGAL: confirm exact list of state-law disclosures required at launch.]

If you are in the European Economic Area, United Kingdom, or Switzerland — **the Service is not currently offered in your region.** Do not use it. [LEGAL: confirm EU/UK posture; if accepting EU users, GDPR transfer mechanisms and Article 9 lawful basis must be addressed separately.]

---

## 12. AI Disclosures

CauseHealth uses generative AI (large language models) to produce narrative explanations of your bloodwork and recommendations for discussion with a clinician. You should know:

- **AI output is generated, not retrieved.** It is built from patterns in the underlying model and the deterministic rules we wrote on top of your specific data.
- **AI output may be incomplete or, in rare cases, wrong.** We layer deterministic clinical rules to constrain risky outputs, but AI is not a substitute for a clinician who knows you.
- **Your data is not used to train any third-party model.** Our AI vendor is contractually prohibited from training on our submitted data.
- **No AI vendor receives your full identity.** We send only the clinical inputs needed for generation, not your name, email, or payment information.
- **You can opt out of AI features.** [FILL: only if you actually offer this; otherwise delete this bullet. If AI is core to the product and there is no opt-out, say so plainly.]

---

## 13. Medical Disclaimer (Privacy Implications)

CauseHealth is **not** a covered entity, business associate, healthcare provider, telehealth platform, or medical device. The output we produce is informational and educational. It is **not** medical advice. You should not act, or refrain from acting, on the basis of the Service’s output without consulting a licensed clinician who has your full history.

**If you are experiencing a medical emergency, call 911 or go to the nearest emergency room. Do not use the Service in an emergency.**

---

## 14. International Users

The Service is hosted and operated in the United States. If you access it from outside the U.S., you consent to the transfer, storage, and processing of your information in the U.S., where data-protection laws may differ from those in your jurisdiction.

---

## 15. Changes to This Policy

We may update this Policy from time to time. Material changes will be announced by email and/or in-app notice at least [FILL: 14] days before they take effect, and (where required by law) we will obtain your consent before applying the change to information already collected. The “Last Updated” date at the top reflects the most recent version. Prior versions are available on request.

---

## 16. Contact

For privacy questions, requests, or complaints:

- Email: [FILL: privacy@causehealth.com]
- Mail: [FILL: legal entity, mailing address]
- Data Protection lead: [FILL: name and role, e.g., founder Evan Gutman]

If you are not satisfied with our response, you may also lodge a complaint with your state attorney general or applicable regulator.

---

**END OF POLICY — INTERNAL NOTES FOR LEGAL COUNSEL**

The following checklist is for the reviewing attorney; remove before publication.

- [ ] Confirm legal entity name and registered address.
- [ ] Confirm operating jurisdiction(s) and choice-of-law accordingly.
- [ ] Confirm full list of sub-processors and DPA status with each.
- [ ] Confirm Anthropic API “no training on customer data” language is current at launch.
- [ ] Confirm whether EU/UK users will be blocked at signup — if not, full GDPR addendum needed.
- [ ] Confirm CCPA/CPRA, VCDPA, CPA, CTDPA, UCPA, TDPSA applicability and required-by-law disclosures per state law as of launch date.
- [ ] Confirm retention schedule against business needs and any state-specific minima.
- [ ] Confirm breach-notification timelines (state laws vary 30–60 days; CA, NY, etc.).
- [ ] Confirm data minimization for AI prompts — review prompt construction code in `supabase/functions/_shared/prompts/`.
- [ ] Confirm whether wellness app is exempt from FTC Health Breach Notification Rule (recently expanded). 16 CFR Part 318.
- [ ] Confirm marketing claims comply with FTC Act § 5 (no “diagnose,” “treat,” “cure” language anywhere in product or marketing).
- [ ] Confirm cookie banner and CCPA opt-out link if any new tracking is added before launch.
