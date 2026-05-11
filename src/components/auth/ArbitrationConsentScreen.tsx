// src/components/auth/ArbitrationConsentScreen.tsx
//
// v6 arbitration agreement + class-action waiver consent. Per the
// outside-counsel implementation spec, this MUST be:
//   - a separate, clearly labeled checkbox (not bundled inside a general
//     ToS scroll-and-accept)
//   - unchecked by default
//   - presented with the operative language adjacent to the checkbox,
//     not buried inside a hyperlink (Berman v. Freedom Financial)
//   - link to the full arbitration text immediately adjacent
//
// Failure to implement this presentation voids the arbitration clause as
// to any user who registered without compliant notice.

import { StandaloneConsentScreen } from './StandaloneConsentScreen';
import { ARBITRATION_CHECKBOX } from '../../lib/legal/consentText';

interface Props {
  stepLabel: string;
  onAccepted: () => void;
}

export const ArbitrationConsentScreen = ({ stepLabel, onAccepted }: Props) => (
  <StandaloneConsentScreen
    consent={ARBITRATION_CHECKBOX}
    stepLabel={stepLabel}
    title="Arbitration & class-action waiver"
    subtitle="Please review and confirm the dispute-resolution terms before continuing."
    body={
      <>
        <p>
          By creating a CauseHealth account, you agree to resolve any dispute
          with us through <strong>individual arbitration</strong> — not in
          court — and you agree not to participate in any class action or
          collective proceeding.
        </p>
        <p className="mt-3">
          You have <strong>30 days from creating your account</strong> to opt
          out of arbitration by emailing{' '}
          <a
            href="mailto:support@causehealth.app?subject=Arbitration%20Opt-Out"
            className="text-primary-container underline hover:text-primary-container/80"
          >
            support@causehealth.app
          </a>{' '}
          with the subject line &quot;Arbitration Opt-Out.&quot; If you opt out,
          your other rights under the Terms remain in full force.
        </p>
        <p className="mt-3 text-clinical-stone text-xs leading-relaxed">
          The full text of the arbitration agreement, class-action waiver, and
          opt-out instructions is in Section 9 of our Terms of Service. The
          link below opens it in a new tab.
        </p>
      </>
    }
    hyperlinkText="Read Section 9 →"
    hyperlinkHref="/terms#section-9"
    onAccepted={onAccepted}
  />
);
