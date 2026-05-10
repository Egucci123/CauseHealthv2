// src/lib/legal/recordConsent.ts
//
// Client-side caller for the record-consent edge function.
// Writes the canonical checkbox text + version + optional metadata to
// consent_log. Server captures IP + user-agent + persists side effects
// into user_eligibility.
//
// Use this everywhere a user clicks an assent control:
//
//   import { ARBITRATION_CHECKBOX } from './consentText';
//   await recordConsentEvent({
//     consent: ARBITRATION_CHECKBOX,
//     pageUrl: window.location.pathname,
//   });
//
// For consents that carry data (state residency, clinician name,
// auto-renewal disclosure), pass `metadata`:
//
//   await recordConsentEvent({
//     consent: STATE_RESIDENCY_CHECKBOX,
//     pageUrl: '/auth/signup',
//     metadata: { state: 'PA', geo_country: 'US', geo_region: 'PA' },
//   });

import { supabase } from '../supabase';
import type { ConsentText } from './consentTextTypes';

export interface RecordConsentResult {
  id: string;
  accepted_at: string;
}

export async function recordConsentEvent(args: {
  consent: ConsentText;
  /** When was the screen shown to the user. Default: now(). Useful when
   *  the gate is open for a while before the user clicks Continue. */
  presentedAt?: string;
  /** Route path where the consent was captured. Default: current path. */
  pageUrl?: string;
  /** Optional structured payload — see consent_log.metadata column docs. */
  metadata?: Record<string, unknown>;
}): Promise<RecordConsentResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated — cannot record consent');

  const presentedAt =
    args.presentedAt ?? new Date().toISOString();
  const pageUrl =
    args.pageUrl ??
    (typeof window !== 'undefined' ? window.location.pathname : null);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-consent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      consent_type: args.consent.type,
      // Both version fields populated for backward compat with legacy readers.
      text_version: args.consent.version,
      policy_version: args.consent.version,
      checkbox_text: args.consent.text,
      presented_at: presentedAt,
      page_url: pageUrl,
      metadata: args.metadata ?? {},
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error ?? '';
    } catch {
      /* swallow */
    }
    throw new Error(detail || `record-consent failed (HTTP ${res.status})`);
  }

  return (await res.json()) as RecordConsentResult;
}

/** Convenience: record a sequence of consent events in order. Used by
 *  the OutputAcknowledgmentGate when the user clicks Continue — we want
 *  one row per affirmation with a unique timestamp, in order. */
export async function recordConsentSequence(
  events: Array<Parameters<typeof recordConsentEvent>[0]>,
): Promise<RecordConsentResult[]> {
  const out: RecordConsentResult[] = [];
  for (const ev of events) {
    out.push(await recordConsentEvent(ev));
  }
  return out;
}
