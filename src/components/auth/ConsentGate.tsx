// src/components/auth/ConsentGate.tsx
//
// Routes the user through the three required consent moments before
// allowing access to the Service. Each moment is its own UI screen and
// its own row in consent_log:
//
//   Step 1 (AcceptTermsScreen)         → records 'terms'
//   Step 2 (HealthDataConsentScreen)   → records 'ai_processing' AND
//                                        'health_data_authorization'
//
// On mount: queries which consents the user is missing for the current
// policy version. Shows the screens in order until all three are logged.
// Calls onConsented() when fully done.
//
// Universal — same flow for every user, every signup. Re-shown when
// CONSENT_POLICY_VERSION changes.

import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getMissingConsents, isFullyConsented, type ConsentType } from '../../lib/consent';
import { AcceptTermsScreen } from './AcceptTermsScreen';
import { HealthDataConsentScreen } from './HealthDataConsentScreen';

const Loading = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-clinical-cream">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-primary-container/30 border-t-primary-container animate-spin" />
      <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase">Checking consent</p>
    </div>
  </div>
);

interface Props {
  onConsented: () => void;
}

export const ConsentGate = ({ onConsented }: Props) => {
  const userId = useAuthStore(s => s.user?.id);
  const [missing, setMissing] = useState<Set<ConsentType> | null>(null);

  // Initial fetch of missing consents
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      const m = await getMissingConsents(userId);
      if (!cancelled) setMissing(m);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // After a screen records consent, refresh the missing set
  const refresh = async () => {
    if (!userId) return;
    const m = await getMissingConsents(userId);
    setMissing(m);
    if (isFullyConsented(m)) onConsented();
  };

  if (missing === null) return <Loading />;

  // Step 1: terms not yet accepted → show AcceptTermsScreen
  if (missing.has('terms')) {
    return <AcceptTermsScreen onAccepted={refresh} />;
  }

  // Step 2: terms done but health-data consents missing → show HealthDataConsentScreen
  if (missing.has('ai_processing') || missing.has('health_data_authorization')) {
    return <HealthDataConsentScreen onAccepted={refresh} />;
  }

  // All three logged — caller should have already onConsented'd, but if
  // the effect raced, render loading briefly until it does.
  return <Loading />;
};
