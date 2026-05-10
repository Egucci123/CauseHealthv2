// src/lib/legal/useOutputAck.ts
//
// Hook for any page that renders AI-generated output. Reads
// user_eligibility.output_ack_completed_at, returns the boolean +
// helpers for completing the gate.
//
// Usage:
//
//   const ack = useOutputAck();
//   if (!ack.ready) return <PageSkeleton />;
//   return (
//     <>
//       {ack.complete && <AIAnalysisBlock />}
//       {!ack.complete && (
//         <OutputAcknowledgmentGate
//           onComplete={ack.recordAndComplete}
//           submitting={ack.submitting}
//         />
//       )}
//     </>
//   );
//
// Notes:
//   - `ready` is false while the eligibility query is in flight. Pages
//     should render a skeleton in that window — never flash AI content.
//   - `complete` is true if user_eligibility.output_ack_completed_at is
//     non-null at the current text version. (We don't currently version
//     the gate; once any version of the four required consents is on
//     file the gate stays passed.)
//   - `recordAndComplete` writes the four consent_log rows in order,
//     refetches eligibility, and resolves once `complete` flips to true.
//     Pages can pass it directly to OutputAcknowledgmentGate.onComplete.

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { recordConsentSequence } from './recordConsent';
import {
  OUTPUT_ACK_SHARE_WITH_CLINICIAN,
  OUTPUT_ACK_NOT_CLINICAL,
  OUTPUT_ACK_LIABILITY_LIMITED,
} from './consentText';
import type { ConsentText } from './consentTextTypes';

const CLINICIAN_NAME_VERSION = '2026-05-09-1';

function clinicianNameConsent(): ConsentText {
  return {
    type: 'clinician_name_entered',
    version: CLINICIAN_NAME_VERSION,
    text:
      'I have entered the name and practice of the licensed clinician with whom I will review this Doctor Prep Document.',
  };
}

export interface UseOutputAck {
  /** False while the eligibility query is in flight. Render a skeleton. */
  ready: boolean;
  /** True once the user has completed the gate (output_ack_completed_at set). */
  complete: boolean;
  /** True while the consent rows are being written + refetched. */
  submitting: boolean;
  /** Pass to OutputAcknowledgmentGate.onComplete. */
  recordAndComplete: (args: {
    clinicianName: string;
    clinicianPractice: string;
  }) => Promise<void>;
}

export function useOutputAck(): UseOutputAck {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const q = useQuery({
    queryKey: ['user_eligibility', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_eligibility')
        .select('output_ack_completed_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  // Treat unauthenticated users as "not ready" — output pages have their
  // own auth guards, but if one slips through we don't want to show
  // analysis without an ack record.
  const ready = !!user?.id && !q.isLoading;
  const complete = !!q.data?.output_ack_completed_at;

  const recordAndComplete = useCallback(
    async (args: { clinicianName: string; clinicianPractice: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      setSubmitting(true);
      try {
        const presentedAt = new Date().toISOString();
        const pageUrl = typeof window !== 'undefined' ? window.location.pathname : null;
        await recordConsentSequence([
          { consent: OUTPUT_ACK_SHARE_WITH_CLINICIAN, presentedAt, pageUrl: pageUrl ?? undefined },
          { consent: OUTPUT_ACK_NOT_CLINICAL, presentedAt, pageUrl: pageUrl ?? undefined },
          { consent: OUTPUT_ACK_LIABILITY_LIMITED, presentedAt, pageUrl: pageUrl ?? undefined },
          {
            consent: clinicianNameConsent(),
            presentedAt,
            pageUrl: pageUrl ?? undefined,
            metadata: {
              name: args.clinicianName,
              practice: args.clinicianPractice,
            },
          },
        ]);
        await qc.invalidateQueries({ queryKey: ['user_eligibility', user.id] });
      } finally {
        setSubmitting(false);
      }
    },
    [qc, user?.id],
  );

  return { ready, complete, submitting, recordAndComplete };
}
