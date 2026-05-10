// src/components/auth/ClinicianAttestationScreen.tsx
//
// v6 established-clinician attestation. The user affirms they have an
// active clinical relationship with a licensed physician, NP, or PA who
// can review CauseHealth output with them. Sets up the "physician
// review before health decision" element of the ToS Section 11 causal
// chain.

import { StandaloneConsentScreen } from './StandaloneConsentScreen';
import { CLINICIAN_RELATIONSHIP_CHECKBOX } from '../../lib/legal/consentText';

interface Props {
  stepLabel: string;
  onAccepted: () => void;
}

export const ClinicianAttestationScreen = ({ stepLabel, onAccepted }: Props) => (
  <StandaloneConsentScreen
    consent={CLINICIAN_RELATIONSHIP_CHECKBOX}
    stepLabel={stepLabel}
    title="Do you have a clinician?"
    subtitle="CauseHealth is designed to be read with your doctor — not instead of them."
    body={
      <>
        <p>
          The Doctor Prep Document we generate is a starting point for a
          conversation with a licensed clinician — it&apos;s not a diagnosis
          and it&apos;s not medical advice.
        </p>
        <p className="mt-3">
          Please confirm that you have an active relationship with a licensed
          physician, nurse practitioner, or physician assistant who can review
          your bloodwork with you.
        </p>
      </>
    }
    onAccepted={onAccepted}
  />
);
