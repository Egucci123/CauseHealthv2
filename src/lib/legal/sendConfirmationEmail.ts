// src/lib/legal/sendConfirmationEmail.ts
//
// Fires the post-signup arbitration / class-action waiver summary email
// required by ToS §17.8 ("A post-registration confirmation email
// summarizes the arbitration agreement, class-action waiver, and 30-day
// opt-out right and deadline.").
//
// Called once, fire-and-forget, the first time the user passes the
// ConsentGate. The edge function is idempotent — it checks whether a
// confirmation has already been sent for this user and no-ops if so.
//
// Auth: requires the user's JWT. The edge function pulls the email
// address from auth.users server-side so the frontend never has to.

import { supabase } from '../supabase';

export async function sendSignupConfirmationEmail(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return; // Not authenticated — nothing to do.

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-confirmation-email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Failed to send confirmation email (${res.status})`);
  }
}
