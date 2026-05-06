// src/lib/consent.ts
//
// Consent recording + checking — universal helper used by the consent screens
// and the gate. Three types are required for full consent (each captured at
// its own UI moment per GDPR + MHMDA):
//   1. terms                       — ToS + Privacy bundle
//   2. ai_processing               — Health-data AI processing (GDPR Art 9)
//   3. health_data_authorization   — Standalone health data collection auth (MHMDA)

import { supabase } from './supabase';

/** Bumped any time the legal text materially changes. Existing users with
 *  consent for an older version are re-prompted on next login. */
export const CONSENT_POLICY_VERSION = '2.0';

export type ConsentType = 'terms' | 'ai_processing' | 'health_data_authorization';

const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'ai_processing', 'health_data_authorization'];

/** Record a single consent event via the record-consent edge function.
 *  The edge function captures IP + user_agent server-side. Returns the
 *  inserted row id on success, throws on failure. */
export async function recordConsent(args: {
  consentType: ConsentType;
  presentedAt: string; // ISO timestamp of when the screen was shown
}): Promise<{ id: string; accepted_at: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-consent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        consent_type: args.consentType,
        presented_at: args.presentedAt,
        policy_version: CONSENT_POLICY_VERSION,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Failed to record ${args.consentType} consent`);
  }
  return await res.json();
}

/** Determine which of the required consent types the user has accepted at
 *  the current policy version. Returns the SET of consent types still
 *  needed. If the set is empty, the user is fully consented. */
export async function getMissingConsents(userId: string): Promise<Set<ConsentType>> {
  const { data, error } = await supabase
    .from('consent_log')
    .select('consent_type, policy_version')
    .eq('user_id', userId)
    .eq('policy_version', CONSENT_POLICY_VERSION);

  if (error) {
    // On read failure, default to "all required" — fail-safe; user re-consents
    // rather than slip through. Better than the opposite.
    console.warn('[consent] read failed, treating as missing:', error.message);
    return new Set(REQUIRED_CONSENTS);
  }

  const accepted = new Set((data ?? []).map((r: any) => r.consent_type as ConsentType));
  const missing = new Set<ConsentType>();
  for (const t of REQUIRED_CONSENTS) {
    if (!accepted.has(t)) missing.add(t);
  }
  return missing;
}

export function isFullyConsented(missing: Set<ConsentType>): boolean {
  return missing.size === 0;
}
