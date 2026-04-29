// src/lib/clientLog.ts
// Comprehensive client telemetry. Writes to public.client_events so I can
// watch what's happening server-side in real time while the user uses the
// app — works on mobile, captures errors that don't print to console,
// captures things even after page refresh / crash.

import { supabase } from './supabase';

let cachedUserId: string | null = null;
let session_id: string;
try {
  // Stable per-tab id so I can group a single user's session events together
  session_id = sessionStorage.getItem('ch_session_id') ?? '';
  if (!session_id) {
    session_id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('ch_session_id', session_id);
  }
} catch { session_id = `nostorage-${Math.random().toString(36).slice(2, 10)}`; }

export function setLogUserId(userId: string | null) {
  cachedUserId = userId;
  logEvent('log_user_set', { userId });
}

export function logEvent(event: string, payload?: Record<string, unknown>) {
  try {
    const row = {
      user_id: cachedUserId,
      event,
      payload: { ...(payload ?? {}), session_id },
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    };
    supabase.from('client_events').insert(row).then((res) => {
      if (res.error && import.meta.env.DEV) console.warn('[clientLog] write failed:', res.error.message);
    });
    if (import.meta.env.DEV) console.log(`[evt] ${event}`, payload ?? '');
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[clientLog] threw:', e);
  }
}

// ── Global error capture ──────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    logEvent('window_error', {
      message: e.message?.slice(0, 500),
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    logEvent('unhandled_rejection', {
      message: (reason?.message || String(reason)).slice(0, 500),
      stack: reason?.stack?.slice(0, 1000),
    });
  });

  // ── Page lifecycle: tells me when user refreshes, switches tabs, closes ──
  window.addEventListener('pagehide', () => logEvent('page_hide'));
  window.addEventListener('beforeunload', () => logEvent('page_unload'));
  document.addEventListener('visibilitychange', () => {
    logEvent('visibility_change', { state: document.visibilityState });
  });

  // Initial page load — captures EVERY page load, including refreshes
  // (each refresh = new session_id since it's per-tab via sessionStorage)
  const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type;
  logEvent('page_load', {
    navigation_type: navType, // 'navigate' | 'reload' | 'back_forward' | 'prerender'
    referrer: document.referrer || null,
    online: navigator.onLine,
  });

  // Online/offline transitions
  window.addEventListener('online', () => logEvent('network_online'));
  window.addEventListener('offline', () => logEvent('network_offline'));

  // ── Fetch wrapper: logs every failed network request ──
  const origFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const start = Date.now();
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    try {
      const response = await origFetch(input, init);
      // Only log non-ok responses to avoid flooding (skip 200s)
      if (!response.ok) {
        logEvent('fetch_error', {
          url: url.slice(0, 200),
          method: init?.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          duration_ms: Date.now() - start,
        });
      }
      return response;
    } catch (err: any) {
      logEvent('fetch_throw', {
        url: url.slice(0, 200),
        method: init?.method || 'GET',
        message: err?.message?.slice(0, 300),
        duration_ms: Date.now() - start,
      });
      throw err;
    }
  };
}
