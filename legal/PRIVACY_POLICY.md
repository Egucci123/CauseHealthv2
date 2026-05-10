# CauseHealth Privacy Policy

**Effective Date:** [Insert launch date]
**Last Updated:** [Insert date]
**Entity:** [CauseHealth LLC]
**Privacy Contact:** privacy@causehealth.com
**Mailing Address:** [Registered address]

---

## 1. Introduction

CauseHealth ("we," "us," "our") is a consumer wellness application that helps you organize your bloodwork into a Doctor Prep Document for use with your licensed clinician. We are not a healthcare provider, not a HIPAA-covered entity or business associate, and we do not provide medical advice, diagnosis, or treatment.

This Privacy Policy describes what information we collect, how we use it, who we share it with, and the rights you have. Use of the Service is also governed by our Terms of Service. If you do not agree with this Policy, do not use the Service.

## 2. Eligibility and Scope

The Service is intended for users who are 18 years of age or older, are residents of the United States (excluding the blocked jurisdictions listed in Section 12), and are established patients of a licensed clinician. We do not knowingly collect personal information from children under 13, and we do not permit users under 18 to create accounts. If you believe a child under 13 has provided us information, contact us at privacy@causehealth.com and we will delete it promptly.

The Service is not available to residents of California, New York, Illinois, Washington State, the European Economic Area, the United Kingdom, or Switzerland. See Section 12.

## 3. Information We Collect

### 3.1 Information You Provide Directly

**Account information:** email address and password. Passwords are stored only as a salted cryptographic hash by our authentication provider (Supabase). We never receive or store your plaintext password.

**Eligibility attestations:** state of residence, age, and confirmation that you are an established patient of a licensed clinician. These are required to use the Service and are logged with timestamp, IP address, and user agent.

**Clinician identification:** the name and practice of the licensed clinician with whom you intend to review your Doctor Prep Document. This is collected before output access and is used solely to (a) generate a pre-written patient message you can send to that clinician and (b) create a record that you identified a clinician before accessing the output. We do not contact, verify, or share information with the clinician you identify.

**Profile information:** first and last name, date of birth, biological sex, height, weight, pregnancy status, allergies, and free-text health notes you choose to enter.

**Health information you submit:** lab reports you upload (PDFs or images) and the biomarker values extracted from them, including but not limited to lipid panels, hemoglobin A1c, vitamin levels, hormone levels, complete blood counts, metabolic panels, inflammation markers, and thyroid markers. You also enter active medications, supplements, diagnosed conditions, and symptoms with severity ratings.

**Payment information:** handled entirely by Stripe, Inc. We receive only a payment token, the last four digits of your card, card brand, and billing ZIP code. We never store full card numbers, CVV codes, or bank account numbers.

**Communications:** when you contact us or use in-app support, we receive the content of those messages and any attachments.

**Consent records:** every checkbox, acknowledgment, and attestation you complete is logged with the exact text shown, the version of that text, the timestamp, your IP address, and your user agent. This record is used solely to demonstrate compliance with applicable law and to defend the integrity of our consent process.

### 3.2 Information Collected Automatically

When you use the Service we automatically collect: IP address and approximate city-level location derived from IP; device type, operating system, and browser; referring URL; pages and features accessed; timestamps; and application error logs.

### 3.3 Cookies and Similar Technologies

- **Strictly necessary cookies:** session management and CSRF protection. Required for the Service to function.
- **Functional cookies:** user preference storage (e.g., theme, dismissed notices). Can be disabled in browser settings.
- **Analytics cookies:** [Complete only if analytics cookies are used. If using a cookieless analytics tool, delete this bullet.]

We do not use third-party advertising cookies or pixels of any kind. The Meta Pixel, Google Ads tags, TikTok Pixel, LinkedIn Insight Tag, and similar advertising technologies are not present on the Service.

We honor Global Privacy Control (GPC) signals as a valid opt-out of any cookie-based data collection or sale.

### 3.4 Information From Third Parties

If you register or sign in using Google or Apple SSO, we receive only the basic profile information that provider releases to us — typically your email address and name. We do not receive your SSO provider account password.

## 4. Sensitive Health Information — Elevated Protections

Information about your bloodwork, medical conditions, medications, supplements, symptoms, and pregnancy status is sensitive health-related personal information. Even though we are not subject to HIPAA, we apply the following elevated restrictions to this data by default, regardless of your location:

- We do not sell your health information under any circumstances.
- We do not use your health information for behavioral advertising, interest-based advertising, or any form of targeted marketing.
- We do not share your health information with data brokers, insurance companies, employers, or government agencies, except in response to lawful legal process as described in Section 7.
- We do not use individually identifiable health information to train any AI model, whether operated by us or a third party.
- We do not use individually identifiable health information to improve the Service or develop new features. Any product analytics or improvement work uses only aggregated, de-identified data where no individual can be reasonably re-identified.
- We do not share your health information with your employer, insurer, or any healthcare provider unless you affirmatively export and transmit it yourself.

**Clarification — Product Improvement and De-Identified Data.** "De-identified" means data that has been processed such that no individual can reasonably be re-identified, consistent with 45 CFR § 164.514 standards. We apply HIPAA de-identification standards voluntarily as a best practice. Individually identifiable health information is never used for product improvement, analytics development, or model training.

**FTC Health Breach Notification Rule (16 CFR Part 318).** CauseHealth processes personal health records as that term is defined in the FTC's Health Breach Notification Rule, as amended in 2024. In the event of a breach of unsecured individually identifiable health information, we are required to notify: (1) affected users without unreasonable delay and within 60 calendar days of discovery; (2) the Federal Trade Commission; and (3) prominent media outlets in any state where more than 500 residents are affected. We maintain a written incident response plan designed to meet all applicable notification timelines, including shorter state-law deadlines. Our internal target is 30 days.

## 5. How We Use Your Information

We use information we collect solely for the following purposes. We do not use your information for any purpose not listed below without your explicit prior consent.

- **Service operation:** create and authenticate your account, process payments, store your data, and generate your personalized Doctor Prep Document.
- **AI output generation:** we transmit a minimal, carefully scoped subset of your information to our AI sub-processor to generate output. This subset is limited to biomarker values, medications, supplements, conditions, symptoms, and relevant demographic factors. It expressly excludes your name, email address, account identifiers, payment information, and any information not directly needed for the analysis.
- **Product improvement:** we analyze aggregated and de-identified usage patterns, performance metrics, and error logs. Individually identifiable health data is excluded.
- **Communications:** service announcements, security alerts, billing notices, and — if you opt in — educational content. You may opt out of marketing communications at any time. Security and billing communications cannot be opted out of while your account is active.
- **Legal compliance and rights protection:** investigate fraud, enforce our Terms of Service, respond to lawful legal process, protect the safety of any person, and defend legal claims.

### 5.1 Data Minimization Commitment

We design our AI prompts and data pipelines to transmit the minimum information necessary to generate useful output. Before each AI call, our system programmatically strips identifying information (name, email, account ID, IP address, payment token) from the data payload.

## 6. Sub-Processors and Third-Party Services

| Vendor | Role | Data Shared | DPA | AI Training? | Region |
| --- | --- | --- | --- | --- | --- |
| Supabase, Inc. | Database, auth, storage, serverless compute | Account, profile, health data, generated docs | DPA executed | No — prohibited by contract | United States |
| Anthropic, PBC | Generative AI (Claude API) | Biomarker values, medications, conditions, symptoms, demographics only. No name, email, or payment data. | API ToS + written confirmation | No — API terms prohibit | United States |
| Stripe, Inc. | Payment processing | Email, name, billing ZIP, card token only | Stripe DPA | No | United States |
| Vercel, Inc. | Frontend hosting and edge delivery | IP address, browser metadata, request logs | Vercel DPA | No | Global edge |
| [Email vendor] | Transactional email | Email address, message content | [Confirm DPA] | No | United States |
| [Analytics vendor or None] | Product analytics | Pseudonymized usage events | [Confirm DPA] | No | [Confirm] |
| [Error monitoring or None] | Error/performance monitoring | Stack traces, user ID, metadata | [Confirm DPA] | No | [Confirm] |

We will update this table when we add or remove sub-processors. Material sub-processor changes that expand the categories of data shared will be announced with advance notice.

## 7. How We Share Information

Beyond the sub-processors above, we share your information only:

- **With you:** through the Service interface, exports, and PDFs you generate.
- **At your direction:** when you generate and send a Doctor Prep Document or export to your clinician. The sharing decision and act are yours; we provide the export tool only.
- **In a business transfer:** if CauseHealth is acquired, merged, or enters bankruptcy, your information may transfer to a successor subject to this Privacy Policy. We will provide at least 30 days' advance written notice and the opportunity to delete your account.
- **For legal compliance:** to respond to a valid and legally enforceable subpoena, court order, or other lawful demand. We push back on overbroad or procedurally defective demands where we have grounds and notify you to the extent permitted by law.
- **With your explicit consent:** for any other purpose, only with your specific opt-in.

We do not sell personal information. We do not "share" personal information for cross-context behavioral advertising as those terms are defined under California law (Cal. Civ. Code § 1798.140). These prohibitions are absolute.

## 8. Data Retention

- **Account and profile data:** 30 days after account deletion from active systems; 90 days from backup systems.
- **Lab data and generated documents:** retained until you delete them or delete your account, then purged on the same schedule.
- **Billing records:** 7 years from the date of the transaction, to comply with tax and accounting law. Billing records are excepted from user-initiated deletion requests.
- **Application logs and analytics:** 90 days in identifiable form, after which logs are aggregated, de-identified, or deleted.
- **Consent records:** retained for the life of the account plus 7 years to support enforceability of your agreement to these Terms and the Privacy Policy. Consent records are excepted from user-initiated deletion requests.

You may delete your account at any time from Settings → Account → Delete Account, or by emailing privacy@causehealth.com. Deletion is permanent and irreversible. We confirm deletion by email within 5 business days.

## 9. Security

- TLS 1.2 or higher for all data in transit.
- Encryption at rest for our primary database and file storage.
- Row-level security policies that prevent any user from accessing another user's data.
- Cryptographic password hashing (bcrypt or argon2). We never store plaintext passwords.
- Principle-of-least-privilege access controls.
- Audit logging for administrative actions.
- Regular dependency and vulnerability scanning and patching.
- Written incident response plan with defined notification timelines.

To report a security vulnerability, email security@causehealth.com. We will acknowledge reports within 2 business days.

**Breach Notification.** If we discover a breach of unsecured health information, we will notify affected users, the FTC, and applicable state regulators within the timeframes required by law. The FTC Health Breach Notification Rule (16 CFR Part 318) sets a 60-day maximum window. State laws may impose shorter deadlines (some require 30 days). We target 30 days as our internal standard.

## 10. Your Privacy Rights

Depending on where you live, you may have some or all of the following rights. We honor all of these for all permitted U.S. users as a matter of policy:

- **Access** — request a copy of the personal information we hold about you.
- **Correction** — ask us to correct inaccurate personal information.
- **Deletion** — ask us to delete your personal information, subject to legal retention obligations.
- **Portability** — receive a machine-readable export of your personal information.
- **Opt-out of sale/sharing for advertising** — we do not sell or share for cross-context advertising; this right is honored by default.
- **Limit use of sensitive information** — we already limit use of your sensitive health information to Service operation only; this right is honored by default.
- **Withdraw consent** — withdraw any consent previously given.
- **Non-discrimination** — we will not deny service or charge different prices for exercising any privacy right.
- **Appeal** — if we deny your privacy request, you may appeal by contacting our privacy lead. We respond to appeals within 60 days.

To submit a rights request, email privacy@causehealth.com. We may need to verify your identity. We respond within 45 days; we may extend by 45 more days for complex requests with written notice.

### 10.1 California, New York, Illinois, Washington — Not Permitted Users

The Service is not available to residents of California, New York, Illinois, or Washington State. Section 12 explains the geographic restrictions. The CCPA/CPRA, NY SHIELD, BIPA, and Washington My Health MY Data Act do not apply because residents of those jurisdictions are not permitted users.

### 10.2 State Privacy Laws That Do Apply

The following state laws may apply to permitted users:

| State Law | Applies To | Rights Honored | Sensitive Data Treatment |
| --- | --- | --- | --- |
| TX TDPSA | All TX residents (no threshold) | Access, correct, delete, portability, opt-out of sale/profiling, appeal | Explicit consent required before processing sensitive health data |
| VA VCDPA | Above threshold | Same as TX | Consent required |
| CO CPA | Above threshold | Same as TX; GPC honored | Consent required |
| CT CTDPA | Above threshold | Same as TX | Consent required |
| OR OCPA | Above threshold | Same as TX | Health data is sensitive |
| TX HB 4 | All TX residents | See TDPSA | Health data is sensitive |
| NV SB 370 | NV residents using websites/apps | Opt-out of sale | Health data covered |

## 11. AI Disclosures and Data Minimization

CauseHealth uses a generative AI large language model (currently the Claude API, operated by Anthropic, PBC) to produce narrative interpretations of your bloodwork.

- **AI involvement is mandatory for core features.** The personalized Doctor Prep Document is generated by AI. These features cannot be used without AI involvement.
- **Output is generated, not retrieved.** The same inputs may produce different outputs across sessions.
- **Output may be inaccurate.** AI output may be incomplete, outdated, or wrong. We layer deterministic clinical rules and safety filters to reduce — not eliminate — this risk. All output should be treated as a starting point for discussion with a licensed clinician.
- **Your data is not used for AI training.** Anthropic is contractually prohibited from training on data submitted through the CauseHealth API integration.
- **Strict data minimization on AI prompts.** We transmit to Anthropic only biomarker values, medications, conditions, supplements, symptoms, and relevant demographic factors. Your name, email, account ID, IP address, and payment information are programmatically excluded from every AI prompt.
- **Human oversight.** AI output is reviewed by deterministic rule systems before delivery. Emergency alert conditions trigger mandatory warning language regardless of AI output.

## 12. Geographic Restrictions — Blocked and Restricted Jurisdictions

The Service is available only to residents of certain U.S. states. The Service is **not** available to residents of:

- **California** — due to the California Consumer Legal Remedies Act, Unfair Competition Law, Consumer Privacy Rights Act, and related statutes that create private rights of action and one-way attorney fee-shifting in consumer litigation.
- **New York** — due to New York General Business Law § 349 (private right of action and mandatory attorney fees), the SHIELD Act, and the New York attorney general's enforcement posture in consumer health matters.
- **Illinois** — due to the Illinois Biometric Information Privacy Act (BIPA, 740 ILCS 14/1 et seq.) and the Illinois Consumer Fraud and Deceptive Business Practices Act.
- **Washington State** — due to the Washington My Health MY Data Act (SB 1155), which imposes the broadest non-HIPAA consumer health data obligations in the U.S., including a private right of action and triple damages for willful violations.
- **EU / EEA / United Kingdom / Switzerland** — the Service is not available internationally.

**Technical Enforcement.** We implement IP-based geolocation blocks and a mandatory self-certification at account registration. At registration, you must affirmatively represent that you are not a current resident of any blocked jurisdiction. If you are a resident of a blocked jurisdiction and circumvent these controls to access the Service, you do so in material breach of these Terms. We may terminate any account we determine is operated by a resident of a blocked jurisdiction and retain any subscription fees paid as liquidated damages for the breach.

**Residency Defined.** "Resident" means a person whose primary domicile is in the blocked jurisdiction at the time of account creation or at any time during an active subscription. Temporary physical presence in a blocked jurisdiction (e.g., travel) while domiciled elsewhere does not constitute residency.

## 13. Corporate Practice of Medicine and Regulatory Disclaimer

CauseHealth does not employ licensed physicians, nurses, or other healthcare professionals to provide clinical services through the Service. The Service does not constitute the practice of medicine, nursing, or any other licensed healthcare profession in any jurisdiction.

Output produced by the Service is generated by software and AI systems, not by licensed clinicians. CauseHealth is not subject to medical practice acts, state telehealth regulations, or the clinical oversight requirements applicable to healthcare providers. Nothing in the Service creates a physician-patient, nurse-patient, therapist-patient, or any other professional-patient relationship between you and CauseHealth or any of its personnel.

## 14. Changes to This Policy

We may update this Policy to reflect changes in our practices, technology, legal requirements, or sub-processors. Material changes — including any change to how we use health data, any new category of sub-processor, or any expansion of data sharing — will be announced by email and in-app notification at least 14 days before they take effect. Where required by law, we will obtain your renewed consent before applying material changes to information already collected. Non-material changes (clarifications, corrections, contact updates) may be made without advance notice.

## 15. Contact

- **Email:** privacy@causehealth.com
- **Security reports:** security@causehealth.com
- **Mail:** [CauseHealth LLC, registered mailing address]
- **Data protection lead:** [Evan Gutman, Founder]

If you are not satisfied with our response, you may contact your state attorney general or applicable state privacy enforcement agency.
