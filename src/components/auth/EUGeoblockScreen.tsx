// src/components/auth/EUGeoblockScreen.tsx
//
// v6 EU/UK/EEA/Switzerland self-certification. We don't operate
// internationally; this is the user-facing block paired with server-side
// IP geofencing.

import { StandaloneConsentScreen } from './StandaloneConsentScreen';
import { EU_GEOBLOCK_CHECKBOX } from '../../lib/legal/consentText';

interface Props {
  stepLabel: string;
  onAccepted: () => void;
}

export const EUGeoblockScreen = ({ stepLabel, onAccepted }: Props) => (
  <StandaloneConsentScreen
    consent={EU_GEOBLOCK_CHECKBOX}
    stepLabel={stepLabel}
    title="Are you in the U.S.?"
    subtitle="CauseHealth is only available in the United States."
    body={
      <>
        <p>
          The Service is operated and hosted in the United States. We don&apos;t
          currently offer it to residents of the European Economic Area (EEA),
          the United Kingdom, or Switzerland. EU/UK privacy law (GDPR, UK GDPR)
          imposes obligations we don&apos;t support today.
        </p>
        <p className="mt-3">
          If you live in any of those regions, please don&apos;t create an
          account. We&apos;ll let you know when we expand.
        </p>
      </>
    }
    onAccepted={onAccepted}
  />
);
