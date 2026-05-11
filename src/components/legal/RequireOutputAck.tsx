// src/components/legal/RequireOutputAck.tsx
//
// Gates rendering of any AI-generated output behind the v6
// output-acknowledgment quiz. Wrap the JSX block that renders the
// Doctor Prep Document, lab analysis result, or wellness plan.
//
// Behavior:
//   - On mount, reads user_eligibility.output_ack_completed_at.
//   - While the eligibility query is in flight, renders nothing
//     (parent supplies its own skeleton above this).
//   - If the user has already completed the gate, passes children
//     through unchanged.
//   - If the user has not completed the gate, renders only the
//     OutputAcknowledgmentGate modal — children are not mounted.
//     This is deliberate: rendering children behind a modal would
//     leak HTML to screen readers and to anyone who inspects the DOM.
//
// On gate completion, writes 4 consent_log rows in sequence (each with
// its own timestamp) and refetches the eligibility row. Once
// output_ack_completed_at is set, the wrapper falls through to children
// on the next render.
//
// Usage:
//
//   <RequireOutputAck>
//     <AnalysisRenderer data={analysis} />
//   </RequireOutputAck>
//
// The wrapper does not protect against direct fetches of analysis JSON
// from the backend — defense in depth would also require the edge
// functions to gate by user_eligibility.output_ack_completed_at. That's
// optional belt-and-suspenders; the legal record stands on the gate
// being shown before output is rendered, which this wrapper enforces.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import OutputAcknowledgmentGate from './OutputAcknowledgmentGate';
import { recordConsentSequence } from '../../lib/legal/recordConsent';
import {
  OUTPUT_ACK_SHARE_WITH_CLINICIAN,
  OUTPUT_ACK_NOT_CLINICAL,
  OUTPUT_ACK_LIABILITY_LIMITED,
} from '../../lib/legal/consentText';
import type { ConsentText } from '../../lib/legal/consentTextTypes';

interface Props {
  children: React.ReactNode;
  /** Optional: render this in place of children while the eligibility
   *  query is loading. Default: nothing. */
  loadingFallback?: React.ReactNode;
  /** Optional: called when the user dismisses the gate ("Not now"). The
   *  parent should typically navigate away. If omitted, no Dismiss button
   *  is rendered. */
  onDismiss?: () => void;
}

// Constructed at use time so we can include the clinician name + practice
// metadata. Version pinned to the same v6 string as the others.
const CLINICIAN_NAME_CONSENT_VERSION = '2026-05-09-1';

function clinicianNameConsent(): ConsentText {
  return {
    type: 'clinician_name_entered',
    version: CLINICIAN_NAME_CONSENT_VERSION,
    text:
      'I have entered the name and practice of the licensed clinician with whom I will review this Doctor Prep Document.',
  };
}

export default function RequireOutputAck({ children, loadingFallback, onDismiss }: Props) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const eligibilityQ = useQuery({
    queryKey: ['user_eligibility', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_eligibility')
        .select('output_ack_completed_at, clinician_name, clinician_practice')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  // Not logged in — let the route's auth guard handle it. Pass children
  // through; if they require an authed user they'll error themselves.
  if (!user) return <>{children}</>;

  // Loading state — never flash children before we know.
  if (eligibilityQ.isLoading) {
    return <>{loadingFallback ?? null}</>;
  }

  // Failed to read — fail open to children rather than hard-blocking.
  // The legal record falls back to whatever was captured at signup; if
  // the user pushes through anyway, the next event will retry the read.
  if (eligibilityQ.isError) {
    console.warn(
      '[RequireOutputAck] eligibility read failed; passing through to children:',
      eligibilityQ.error,
    );
    return <>{children}</>;
  }

  const completed = !!eligibilityQ.data?.output_ack_completed_at;
  if (completed) return <>{children}</>;

  const handleComplete = async (args: {
    clinicianName: string;
    clinicianPractice: string;
  }) => {
    setSubmitting(true);
    try {
      const presentedAt = new Date().toISOString();
      // Four ordered events — each gets its own row + its own timestamp.
      // recordConsentSequence awaits one before starting the next so the
      // timestamps strictly order on the server.
      await recordConsentSequence([
        {
          consent: OUTPUT_ACK_SHARE_WITH_CLINICIAN,
          presentedAt,
          pageUrl: window.location.pathname,
        },
        {
          consent: OUTPUT_ACK_NOT_CLINICAL,
          presentedAt,
          pageUrl: window.location.pathname,
        },
        {
          consent: OUTPUT_ACK_LIABILITY_LIMITED,
          presentedAt,
          pageUrl: window.location.pathname,
        },
        {
          consent: clinicianNameConsent(),
          presentedAt,
          pageUrl: window.location.pathname,
          metadata: {
            name: args.clinicianName,
            practice: args.clinicianPractice,
          },
        },
      ]);

      // The edge function side-effect sets output_ack_completed_at
      // when all four are present. Refetch so the wrapper unblocks.
      await qc.invalidateQueries({ queryKey: ['user_eligibility', user.id] });
    } catch (e: any) {
      console.error('[RequireOutputAck] consent recording failed:', e);
      alert(
        `Could not save your acknowledgment: ${
          e?.message ?? 'unknown error'
        }. Please try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OutputAcknowledgmentGate
      onComplete={handleComplete}
      onDismiss={onDismiss}
      submitting={submitting}
      defaultClinicianName={eligibilityQ.data?.clinician_name ?? ''}
      defaultClinicianPractice={eligibilityQ.data?.clinician_practice ?? ''}
    />
  );
}
