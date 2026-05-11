// src/components/auth/ConsentGate.tsx
//
// v6 collapsed onboarding gate — ONE screen.
//
// The previous two-step flow (AcceptTermsScreen → ArbitrationConsentScreen)
// is now a single CombinedConsentScreen that captures BOTH 'terms' and
// 'arbitration_class_waiver' consents on the same page. The legal record
// is unchanged — two separate consent_log rows are still written. Only
// the UI presentation is collapsed.
//
// Once both consents are recorded, we fire a one-time post-signup
// confirmation email summarizing the arbitration agreement, class-action
// waiver, and 30-day opt-out right and deadline (required by ToS §17.8).
// The email-send is fire-and-forget — failures don't block the user.
//
// Race-condition note (unchanged from v1): record-consent INSERTs via the
// service-role client; the frontend re-reads via the user's JWT. Supavisor
// can have sub-second eventual consistency. We maintain a local set of
// consents we just recorded so a slow-replicating read doesn't undo a
// write we know succeeded.

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getMissingConsents, isFullyConsented, type ConsentType } from '../../lib/consent';
import { CombinedConsentScreen } from './CombinedConsentScreen';
import { sendSignupConfirmationEmail } from '../../lib/legal/sendConfirmationEmail';

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

const REQUIRED: ConsentType[] = ['terms', 'arbitration_class_waiver'];

export const ConsentGate = ({ onConsented }: Props) => {
  const userId = useAuthStore(s => s.user?.id);
  const [missing, setMissing] = useState<Set<ConsentType> | null>(null);
  const justRecordedRef = useRef<Set<ConsentType>>(new Set());

  const computeMissing = (dbMissing: Set<ConsentType>): Set<ConsentType> => {
    const merged = new Set(dbMissing);
    for (const t of justRecordedRef.current) merged.delete(t);
    return merged;
  };

  const finalize = () => {
    // Fire-and-forget arbitration summary email. The edge function is
    // idempotent (no-ops if it's already been sent for this user).
    sendSignupConfirmationEmail().catch((e) =>
      console.warn('[ConsentGate] confirmation email send failed:', e),
    );
    onConsented();
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

  const handleCombinedAccepted = async () => {
    if (!userId) return;
    // CombinedConsentScreen writes BOTH consents in sequence before
    // calling us. Mark them locally so the post-write DB re-read can't
    // race past them.
    justRecordedRef.current.add('terms');
    justRecordedRef.current.add('arbitration_class_waiver');
    const localMissing = new Set<ConsentType>(REQUIRED.filter(t => !justRecordedRef.current.has(t)));
    setMissing(localMissing);
    if (isFullyConsented(localMissing)) {
      finalize();
      return;
    }
    try {
      const dbMissing = await getMissingConsents(userId);
      const merged = computeMissing(dbMissing);
      setMissing(merged);
      if (isFullyConsented(merged)) finalize();
    } catch { /* local set is fine */ }
  };

  if (missing === null) return <Loading />;

  if (missing.has('terms') || missing.has('arbitration_class_waiver')) {
    return <CombinedConsentScreen onAccepted={handleCombinedAccepted} />;
  }

  return <Loading />;
};
