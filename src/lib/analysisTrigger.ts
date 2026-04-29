// src/lib/analysisTrigger.ts
// Single source of truth for kicking off lab analysis. Used by:
//   - labUploadStore.confirmAndAnalyze (right after the user reviews)
//   - LabDetail retryAnalysis (manual "Re-run Analysis" button)
//   - LabDetail auto-rescue (when draw stuck in 'processing' too long)
//
// The previous fire-and-forget pattern was unreliable: missing JWT meant the
// request was rejected at the gateway, and there was no retry. This helper
// makes the trigger reliable enough that the user never needs to refresh.
import { supabase } from './supabase';

interface TriggerResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/**
 * Reliably trigger analyze-labs for a given draw.
 *
 * Strategy:
 *   1. Refresh auth session, grab a fresh access_token.
 *   2. Send POST to analyze-labs with keepalive=true so it survives navigation.
 *   3. Race the fetch against a 6s timeout. The function takes 30-90s total but
 *      the gateway should accept the request within a few seconds. If we get
 *      ANY response in 6s (even a streaming-start), the server has accepted.
 *      If the timeout wins, we still consider it OK because keepalive=true
 *      means the server keeps processing.
 *   4. Up to 3 attempts with exponential backoff (1s, 2s, 4s) on hard failures.
 */
export async function triggerAnalysis(drawId: string, userId: string): Promise<TriggerResult> {
  if (!drawId || !userId) return { ok: false, error: 'missing drawId or userId' };

  // Mark the draw as 'processing' first — if the trigger then fails, the auto-
  // rescue on Lab Detail will pick it up and retry. Better to be in 'processing'
  // and detected as stuck than 'failed' from a transient network blip.
  await supabase
    .from('lab_draws')
    .update({ processing_status: 'processing', analysis_result: null })
    .eq('id', drawId);

  // Refresh auth — stale tokens are the #1 cause of the gateway 401 we saw.
  let token = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? '';
  } catch { /* will fall back below */ }
  if (!token) {
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      token = session?.access_token ?? '';
    } catch { /* anon-key fallback only */ }
  }
  if (!token) token = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
  };
  const body = JSON.stringify({ drawId, userId });

  const MAX_ATTEMPTS = 3;
  let lastError = '';
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // 6s race — if we don't get even a header in 6s something is wrong.
      // keepalive=true so the request continues even if the user navigates.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        keepalive: true,
        signal: controller.signal,
      }).catch((e: any) => {
        if (e?.name === 'AbortError') {
          // Timed out — but request was sent. Server should still be processing.
          return { ok: true, status: 0, _aborted: true } as any;
        }
        throw e;
      });

      clearTimeout(timeoutId);

      lastStatus = (res as Response).status;

      // 2xx or our abort marker means the server accepted the request.
      if ((res as any)._aborted) {
        console.log('[analysisTrigger] aborted at 6s — server still processing in background');
        return { ok: true, status: 0 };
      }
      if ((res as Response).ok) {
        console.log('[analysisTrigger] success', (res as Response).status);
        return { ok: true, status: (res as Response).status };
      }

      // Non-2xx response. Try to read body for diagnostic.
      let bodyText = '';
      try { bodyText = await (res as Response).text(); } catch { /* ignore */ }
      lastError = `HTTP ${(res as Response).status}: ${bodyText.slice(0, 200)}`;
      console.warn(`[analysisTrigger] attempt ${attempt} failed`, lastError);

      // 401/403 → token issue, refresh and retry
      if ((res as Response).status === 401 || (res as Response).status === 403) {
        try {
          const { data: { session } } = await supabase.auth.refreshSession();
          if (session?.access_token) (headers as any).Authorization = `Bearer ${session.access_token}`;
        } catch { /* will fail next attempt too, but try */ }
      }
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      console.warn(`[analysisTrigger] attempt ${attempt} threw`, lastError);
    }

    // Backoff before retry (don't sleep after final attempt)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }

  return { ok: false, error: lastError, status: lastStatus };
}

/**
 * Decide whether a draw is "stuck" — in processing too long without a result.
 * Used by Lab Detail's auto-rescue to know when to re-fire the trigger.
 */
export function isDrawStuck(processingStatus: string | null, updatedAt: string | null, ageThresholdMs = 60_000): boolean {
  if (processingStatus !== 'processing') return false;
  if (!updatedAt) return false;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs > ageThresholdMs;
}
