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

// In-memory ring buffer of recent events — exposed to window so a debug
// overlay (or just devtools) can read it without needing the DB.
type LocalEvent = { t: string; event: string; payload?: any };
const localEvents: LocalEvent[] = [];
declare global { interface Window { __chEvents: LocalEvent[]; __chLast?: any } }
if (typeof window !== 'undefined') window.__chEvents = localEvents;

export function logEvent(event: string, payload?: Record<string, unknown>) {
  try {
    // Always push to in-memory ring buffer (last 50) — even if DB insert fails
    localEvents.push({ t: new Date().toISOString().slice(11, 23), event, payload });
    if (localEvents.length > 50) localEvents.shift();
    if (typeof window !== 'undefined') window.__chLast = { event, payload, at: Date.now() };

    const row = {
      user_id: cachedUserId,
      event,
      payload: { ...(payload ?? {}), session_id },
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
    };
    supabase.from('client_events').insert(row).then((res) => {
      if (res.error) {
        // Push the FAILURE itself to the ring buffer too so the overlay can show it
        localEvents.push({ t: new Date().toISOString().slice(11, 23), event: 'log_write_failed', payload: { for: event, error: res.error.message } });
        if (import.meta.env.DEV) console.warn('[clientLog] write failed:', res.error.message);
      }
    }, (err) => {
      localEvents.push({ t: new Date().toISOString().slice(11, 23), event: 'log_write_threw', payload: { for: event, error: String(err).slice(0, 200) } });
    });
    if (import.meta.env.DEV) console.log(`[evt] ${event}`, payload ?? '');
  } catch (e) {
    localEvents.push({ t: new Date().toISOString().slice(11, 23), event: 'log_threw', payload: { for: event, error: String(e).slice(0, 200) } });
    if (import.meta.env.DEV) console.warn('[clientLog] threw:', e);
  }
}

// ── Page render tracker — what did the user actually see? ───────────
// Pages call this when their primary content state resolves so I can
// distinguish "URL changed but page is blank/skeleton/error" from "URL
// changed and rendered the right content."
export function logPageRender(page: string, state: string, extra?: Record<string, unknown>) {
  logEvent('page_render', { page, state, ...(extra ?? {}) });
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

  // ── Fetch wrapper: logs every failed network request + slow ones ──
  const origFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const start = Date.now();
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    try {
      const response = await origFetch(input, init);
      const duration = Date.now() - start;
      if (!response.ok) {
        logEvent('fetch_error', {
          url: url.slice(0, 200),
          method: init?.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          duration_ms: duration,
        });
      } else if (duration > 3000) {
        // Surface slow successful requests (>3s) so we see "looks ok but lagging"
        logEvent('fetch_slow', {
          url: url.slice(0, 200),
          method: init?.method || 'GET',
          duration_ms: duration,
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

  // ── Global click logger: captures every click in the app ──
  // No need to instrument individual buttons; click delegation catches them all.
  // Throttled at 1 event per 200ms per-element so rapid double-clicks don't spam.
  let lastClickKey = '';
  let lastClickAt = 0;
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Walk up to find the closest interactive element (button/a/[role=button])
    const el = target.closest('button, a, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], [data-log]') as HTMLElement | null;
    if (!el) return;
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().slice(0, 60);
    const dataLog = el.getAttribute('data-log');
    const key = `${el.tagName}|${text}|${dataLog ?? ''}`;
    const now = Date.now();
    if (key === lastClickKey && now - lastClickAt < 200) return;
    lastClickKey = key; lastClickAt = now;
    logEvent('click', {
      tag: el.tagName,
      text,
      data_log: dataLog,
      href: (el as HTMLAnchorElement).href || null,
      type: (el as HTMLInputElement).type || null,
      disabled: (el as HTMLButtonElement).disabled ?? null,
    });
  }, true);

  // ── Form submissions ──
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement | null;
    logEvent('form_submit', {
      action: form?.action ?? null,
      id: form?.id ?? null,
      method: form?.method ?? null,
    });
  }, true);

  // ── Input focus/blur on key fields (login, signup, profile) ──
  // Helps trace "I typed my email and the page flickered" style bugs.
  document.addEventListener('focus', (e) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    if (['password', 'email'].includes(el.type) || el.name === 'email' || el.name === 'password') {
      logEvent('input_focus', { type: el.type, name: el.name, id: el.id });
    }
  }, true);
}
