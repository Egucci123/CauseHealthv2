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
// CRITICAL race-condition fix: the record-consent edge function INSERTs
// using the service-role client (one PostgREST connection), but the
// frontend re-reads via the user's JWT (potentially a different pooler
// connection). PostgREST + Supavisor can have sub-second eventual
// consistency between writes and reads. So a successful INSERT followed
// immediately by a SELECT can return zero rows.
//
// The symptom users hit: accept terms → screen shows again → refresh →
// re-accept → eventually goes through. The DB write succeeded the first
// time, but the SELECT race made it look like it didn't.
//
// Fix: maintain a LOCAL set of consent types we just successfully
// recorded. After recordConsent returns 201 (write succeeded), we know
// for a fact that consent is logged — we don't need the DB to confirm
// it. The local set is merged with the DB read so a slow-replicating
// read doesn't undo our state.

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getMissingConsents, isFullyConsented, type ConsentType } from '../../lib/consent';
import { AgeGateScreen } from './AgeGateScreen';
import { AcceptTermsScreen } from './AcceptTermsScreen';
import { HealthDataConsentScreen } from './HealthDataConsentScreen';
import { WashingtonHealthDataConsentScreen } from './WashingtonHealthDataConsentScreen';

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

const REQUIRED: ConsentType[] = [
  'age_18_plus',
  'terms',
  'ai_processing',
  'health_data_authorization',
  'mhmda_wa_authorization',
];

export const ConsentGate = ({ onConsented }: Props) => {
  const userId = useAuthStore(s => s.user?.id);
  const [missing, setMissing] = useState<Set<ConsentType> | null>(null);
  // Local cache of consents this session has successfully recorded. Persists
  // across re-renders so a slow-propagating DB read can't undo a write we
  // know succeeded.
  const justRecordedRef = useRef<Set<ConsentType>>(new Set());

  const computeMissing = (dbMissing: Set<ConsentType>): Set<ConsentType> => {
    const merged = new Set(dbMissing);
    for (const t of justRecordedRef.current) merged.delete(t);
    return merged;
  };

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      const dbMissing = await getMissingConsents(userId);
      if (cancelled) return;
      const m = computeMissing(dbMissing);
      setMissing(m);
      if (isFullyConsented(m)) onConsented();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const recordedAndRefresh = async (...types: ConsentType[]) => {
    if (!userId) return;
    for (const t of types) justRecordedRef.current.add(t);
    const localMissing = new Set<ConsentType>(REQUIRED.filter(t => !justRecordedRef.current.has(t)));
    setMissing(localMissing);
    if (isFullyConsented(localMissing)) {
      onConsented();
      return;
    }
    try {
      const dbMissing = await getMissingConsents(userId);
      const merged = computeMissing(dbMissing);
      setMissing(merged);
      if (isFullyConsented(merged)) onConsented();
    } catch { /* DB read failed — local set is fine */ }
  };

  if (missing === null) return <Loading />;

  // Step 1 — universal 18+ attestation. Catches Google sign-ins which bypass
  // the inline Register checkbox.
  if (missing.has('age_18_plus')) {
    return <AgeGateScreen onAccepted={() => recordedAndRefresh('age_18_plus')} />;
  }

  if (missing.has('terms')) {
    return <AcceptTermsScreen onAccepted={() => recordedAndRefresh('terms')} />;
  }

  if (missing.has('ai_processing') || missing.has('health_data_authorization')) {
    return (
      <HealthDataConsentScreen
        onAccepted={() => recordedAndRefresh('ai_processing', 'health_data_authorization')}
      />
    );
  }

  // WA-specific MHMDA authorization — always shown LAST so it stands alone
  // as its own dedicated step (private right of action exposure mitigation).
  if (missing.has('mhmda_wa_authorization')) {
    return (
      <WashingtonHealthDataConsentScreen
        onAccepted={() => recordedAndRefresh('mhmda_wa_authorization')}
      />
    );
  }

  return <Loading />;
};
