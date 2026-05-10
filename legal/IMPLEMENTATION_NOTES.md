# v6 Legal Implementation Notes

This file describes how the legal pieces in this commit wire into the
existing app. It is the developer's reference for finishing the integration.

---

## What's already in this commit

### Documents (user-facing)
- `legal/PRIVACY_POLICY.md` — v6 cleaned, geoblocked, ready to render at `/privacy`
- `legal/TERMS_OF_SERVICE.md` — v6 cleaned, ready to render at `/terms`

### Database
- `supabase/migrations/20260509250000_consent_log.sql`
  - Drops the `consent_type` CHECK constraint on the existing `consent_log` table so new types can be added without migrations.
  - Adds columns: `checkbox_text`, `text_version`, `page_url`, `metadata`.
  - Creates `user_eligibility` — single-row-per-user state (certified state, clinician name, output-ack timestamp, arbitration opt-out).
  - Adds `BEFORE UPDATE/DELETE` triggers on `consent_log` enforcing append-only.
  - Adds the `consent_log_latest` view for fast "did this user already accept?" lookups.

### App-side modules
- `src/lib/legal/consentTypes.ts` — closed enum of `ConsentType` values + `SIGNUP_REQUIRED_CONSENTS` and `OUTPUT_GATE_REQUIRED_CONSENTS` arrays.
- `src/lib/legal/consentTextTypes.ts` — shared `ConsentText` interface.
- `src/lib/legal/consentText.ts` — canonical text + version for every checkbox in the app. **Single source of truth — never inline a label.**
- `src/lib/legal/blockedJurisdictions.ts` — `BLOCKED_US_STATES` (CA/NY/IL/WA), `BLOCKED_COUNTRIES` (EEA/UK/CH + sanctions), `isBlockedJurisdiction()`, `ALLOWED_US_STATES` for the signup dropdown.

### Components
- `src/components/legal/StandaloneConsent.tsx` — single-checkbox component. Renders the canonical label adjacent to the box (not inside a link). Use for arbitration, state residency, EU geoblock, clinician relationship, sensitive-health consent.
- `src/components/legal/OutputAcknowledgmentGate.tsx` — modal gate. Three sequential affirmations + clinician name + practice. Each step unlocks the next. Calls `onComplete({clinicianName, clinicianPractice})` once all four are satisfied.

---

## What still needs developer work

The pieces above are the foundation. The following integration touches are **not** in this commit and need to be done by hand:

### 1. Update `record-consent` edge function

Path: `supabase/functions/record-consent/index.ts` (existing).

Add support for the new consent types and the new columns:

- Accept `text_version` on the request body (mirror to the existing `policy_version` column for backward compat).
- Accept `checkbox_text` on the request body — write byte-for-byte to the new column.
- Accept optional `metadata` jsonb (used for `state_residency_certify` → `{state}`, `clinician_name_entered` → `{name, practice}`, `auto_renewal_disclosure` → `{price_cents, interval}`).
- For `state_residency_certify`: also UPSERT into `user_eligibility` (set `certified_state`, `state_certified_at`, `state_certified_ip`, `registration_geo_country`, `registration_geo_region` from the request IP geolookup).
- For `clinician_relationship`: set `user_eligibility.has_clinician_certified = true`.
- For `clinician_name_entered`: set `user_eligibility.clinician_name`, `clinician_practice`, `clinician_name_entered_at`.
- After all `OUTPUT_GATE_REQUIRED_CONSENTS` are present at the current version: set `user_eligibility.output_ack_completed_at = now()`.
- For `arbitration_class_waiver`: also enqueue the post-registration confirmation email (see #5 below).

### 2. Wire signup flow

Locate the existing signup screen (`src/pages/auth/Register.tsx` or similar) and insert these pieces in order:

1. **Email + password** (existing)
2. **State of residence dropdown** sourced from `ALLOWED_US_STATES`. The blocked four are not in the list. Backend re-validates with `isBlockedJurisdiction({stateCode})`.
3. **Standalone checkbox stack** (use `<StandaloneConsent>`):
   - `AGE_18_CHECKBOX`
   - `STATE_RESIDENCY_CHECKBOX`
   - `EU_GEOBLOCK_CHECKBOX`
   - `CLINICIAN_RELATIONSHIP_CHECKBOX`
   - `SENSITIVE_HEALTH_CHECKBOX`
4. **Scroll-and-accept** for ToS and Privacy. Recommend a `<PolicyScrollGate>` component that:
   - Renders the doc in an iframe or scrollable div.
   - Enables the Continue button only after the user scrolls within ~50px of the bottom.
   - On Continue, logs `tos_scroll_and_accept` then `privacy_scroll_and_accept` consent events.
5. **Standalone arbitration checkbox** (`<StandaloneConsent consent={ARBITRATION_CHECKBOX} hyperlinkText="Read Section 17" hyperlinkHref="/terms#section-17" emphasis="high" />`). This MUST be a separate visual block, not bundled into the ToS scroll-accept.
6. **Submit** — on click, validate that the geofence on the server agrees, then call the auth-create flow, then in parallel call `record-consent` for every type in `SIGNUP_REQUIRED_CONSENTS`. If any consent write fails, reject the registration.

### 3. Add `/privacy` and `/terms` routes

- `src/pages/legal/PrivacyPolicy.tsx` — render `legal/PRIVACY_POLICY.md` via `react-markdown` (or whatever the codebase already uses for markdown).
- `src/pages/legal/TermsOfService.tsx` — same for `legal/TERMS_OF_SERVICE.md`. Link both into the router (`src/AppRouter.tsx` or equivalent). The arbitration link in Section 17 needs to be a fragment anchor (`#section-17`).

### 4. Wire the OutputAcknowledgmentGate

In `src/pages/labs/LabDetail.tsx`, `WellnessPlan.tsx`, and `DoctorPrep.tsx`, before rendering AI output:

```tsx
const { data: eligibility } = useQuery(['user_eligibility', userId], ...);
const ackComplete = !!eligibility?.output_ack_completed_at;

if (!ackComplete) {
  return <OutputAcknowledgmentGate
    onComplete={async ({ clinicianName, clinicianPractice }) => {
      // 4 record-consent calls in sequence — each writes its own row
      await recordConsent({ type: 'output_ack_share_with_clin', presentedAt });
      await recordConsent({ type: 'output_ack_not_clinical', presentedAt });
      await recordConsent({ type: 'output_ack_liability_limited', presentedAt });
      await recordConsent({
        type: 'clinician_name_entered',
        presentedAt,
        metadata: { name: clinicianName, practice: clinicianPractice },
      });
      qc.invalidateQueries(['user_eligibility', userId]);
    }}
    onDismiss={() => navigate('/dashboard')}
  />;
}
```

### 5. Post-registration confirmation email

After signup completes, send an email (via the existing transactional email vendor) containing:

- Summary of the arbitration agreement and class-action waiver.
- The 30-day opt-out instructions: send email to `legal@causehealth.com` with subject "Arbitration Opt-Out".
- The exact deadline date (account creation timestamp + 30 days).

Required by ToS Section 17.8. Failure to send voids the arbitration clause for that user.

### 6. Arbitration opt-out intake

Stand up an inbox monitor for `legal@causehealth.com`. When an opt-out email arrives:

1. Verify subject contains "Arbitration Opt-Out" and email matches an existing account.
2. Verify the email arrived within 30 days of `auth.users.created_at` for that user.
3. Set `user_eligibility.arbitration_opted_out = true`, `arbitration_opted_out_at = now()`.
4. Send a confirmation email to the user.
5. Log the entire event chain — this is evidence in any later dispute.

This can be a manual process at low volume; automate when traffic justifies it.

### 7. Auto-renewal disclosure (only if subscription model)

In the Stripe checkout component (`src/components/billing/Checkout.tsx` or equivalent), render the canonical `AUTO_RENEWAL_DISCLOSURE.text` **physically above** the Subscribe / Pay button. Not in a tooltip, not in a link, not below the button. Then on click, log `auto_renewal_disclosure` consent event with `metadata: {price_cents: 1900, interval: 'month'}`.

If you go with one-time pricing, delete this row.

### 8. Server-side geofence revalidation

Every privileged action (plan generation, doctor prep generation, lab analysis) should be wrapped in a server-side check:

```ts
const eligibility = await supabase
  .from('user_eligibility')
  .select('certified_state, registration_geo_country')
  .eq('user_id', userId)
  .single();

if (isBlockedJurisdiction({
  stateCode: eligibility.data?.certified_state,
  countryCode: eligibility.data?.registration_geo_country,
}).blocked) {
  return json({ error: 'Service not available in your jurisdiction.' }, 403);
}
```

This catches users who self-certified one state but later changed it, or whose IP geolookup at signup didn't match their certification.

---

## Versioning the consent text

When you change any string in `src/lib/legal/consentText.ts`:

1. **Bump the `version`** on that constant. Format: `'YYYY-MM-DD-N'`. Don't reuse a version.
2. Existing users will be re-prompted on next login because `getMissingConsents` matches against the current version.
3. The old version stays in `consent_log` for users who agreed under it — that's the historical record.

Never edit a label string in place without bumping the version. The whole point of the system is that we know exactly what each user agreed to.

---

## Testing checklist

Before launch, manually verify each of these:

- [ ] Signup with `state = 'CA'` is refused at the dropdown (option not present) and at the server.
- [ ] Signup with VPN-spoofed CA IP but `state = 'PA'` self-certified — the server logs the contradiction in `user_eligibility.registration_geo_region` and the user is blocked.
- [ ] All 8 standalone signup checkboxes default to unchecked.
- [ ] Arbitration checkbox is in a separate visual block from ToS scroll-accept.
- [ ] Refreshing the signup page does NOT preserve checkbox state (ensure stale state can't bypass re-consent).
- [ ] Output Acknowledgment Gate cannot be dismissed without the three sequential clicks plus clinician name + practice.
- [ ] Each item logs its own `consent_log` row with a unique timestamp (verify with `SELECT * FROM consent_log_latest WHERE user_id = '...'`).
- [ ] After completing the gate, `user_eligibility.output_ack_completed_at` is set.
- [ ] Returning to the output page does NOT re-prompt (gate respects the eligibility row).
- [ ] Bumping a version in `consentText.ts` re-prompts on next login.
- [ ] Account deletion CASCADEs through to `consent_log` and `user_eligibility`.
- [ ] Attempt to UPDATE a row in `consent_log` from psql is rejected by the trigger.
- [ ] Confirmation email arrives within 24h of registration with arbitration summary + opt-out instructions.
