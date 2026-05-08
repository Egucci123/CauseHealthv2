// src/lib/queryClient.ts
import { QueryClient, keepPreviousData } from '@tanstack/react-query';
import { logEvent } from './clientLog';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime: 0 — every mount checks for fresher data. Combined with
      // placeholderData: keepPreviousData and the '!data ? Skeleton :' render
      // pattern in components, users see CACHED data instantly on every page
      // open while a background refetch silently updates if there's something
      // newer. Net result: no flicker, no need to refresh.
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      placeholderData: keepPreviousData,
      // 'always' = refetch on every mount regardless of staleness. The
      // user said it best: 'I shouldn't have to refresh to see what's
      // there.' This guarantees every page navigation pulls fresh data.
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ── Visibility-change handler ───────────────────────────────────────────────
// Mobile browsers + PWA installs don't fire window focus events reliably when
// the user backgrounds the tab and returns. The visibilitychange event is the
// canonical signal. When the user comes back after >2s away:
//   1. Refresh the Supabase session FIRST (so any JWT that expired during
//      idle is renewed before queries fire). Without this, queries refetch
//      with stale JWT → 401 → silent failure → page renders empty/stale →
//      user has to manually refresh. Symptom matches the 'come back after
//      5min and have to refresh' bug exactly.
//   2. Invalidate all queries so they refetch with the now-fresh token.
//
// supabase.auth.getSession() auto-refreshes the token if expired and emits
// the TOKEN_REFRESHED event, which the auth listener hooks to re-fetch the
// profile. So one call covers both the JWT renewal and the profile sync.
let lastHiddenAt = 0;
const refreshAndRefetch = async () => {
  // Lazy import to avoid circular module load at boot
  try {
    const { supabase } = await import('./supabase');
    await supabase.auth.getSession();
  } catch (e) {
    // If session refresh fails, still refetch queries below — they'll
    // either succeed with the existing token or surface a real auth error.
    console.warn('[queryClient] session refresh on focus failed:', e);
  }
  // refetchQueries (not just invalidateQueries) — forces every active query
  // to actually fire a fresh network request. invalidateQueries marks them
  // stale but only refetches if a component is currently subscribed AND
  // the query mode triggers it; refetchQueries({ type: 'active' }) is the
  // explicit guarantee. Skip auth/profile (authStore manages those).
  queryClient.refetchQueries({
    type: 'active',
    predicate: (query) => {
      const key = query.queryKey?.[0];
      if (typeof key !== 'string') return false;
      if (key === 'profile' || key === 'auth') return false;
      return true;
    },
  });
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
    } else if (document.visibilityState === 'visible') {
      const awayMs = Date.now() - lastHiddenAt;
      // Lowered from 5s to 2s. Users frequently switch tabs for a few
      // seconds while waiting on long-running operations (lab analysis,
      // wellness plan gen). With a 5s threshold, a 4-second tab switch
      // left the UI stuck on stale 'processing' state. 2s catches the
      // common pattern without firing on every momentary blink.
      if (lastHiddenAt > 0 && awayMs > 2000) {
        refreshAndRefetch();
      }
    }
  });

  // Window focus fires when the user returns to the tab/window — covers cases
  // where visibilitychange doesn't (some mobile browsers, multi-monitor focus
  // shifts). Cheap to call refetch on focus; React Query's dedup kicks in if
  // visibilitychange fired the same refetch a moment ago.
  window.addEventListener('focus', () => {
    if (lastHiddenAt > 0 && Date.now() - lastHiddenAt > 2000) {
      refreshAndRefetch();
    }
  });

  // Also re-validate on pageshow with persisted=true (back-forward cache hit).
  // Safari especially restores the page from BFCache without firing visibilitychange.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      logEvent('bfcache_restore');
      refreshAndRefetch();
    }
  });
}

// ── Query event subscription: surface failures + slow queries ──
// Don't log every cache touch (would flood). Only log:
//   - Query first becomes 'error'
//   - Query first becomes 'success' but took >3s
//   - Query first becomes 'pending' from idle (the *initial* fetch)
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated') {
    const { query } = event;
    const action = (event as any).action;
    if (!action) return;
    const key = JSON.stringify(query.queryKey).slice(0, 100);
    if (action.type === 'error') {
      logEvent('query_error', {
        key,
        error: (action.error as any)?.message?.slice(0, 200) ?? String(action.error).slice(0, 200),
      });
    } else if (action.type === 'success') {
      const fetchedAt = query.state.dataUpdatedAt;
      const startedAt = (query.state as any).fetchStartedAt ?? fetchedAt;
      const duration = fetchedAt - startedAt;
      if (duration > 3000) {
        logEvent('query_slow', { key, duration_ms: duration });
      }
    }
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated') {
    const m = event.mutation;
    const action = (event as any).action;
    if (!action) return;
    if (action.type === 'error') {
      logEvent('mutation_error', {
        key: JSON.stringify(m.options.mutationKey ?? 'anon').slice(0, 100),
        error: (action.error as any)?.message?.slice(0, 200) ?? String(action.error).slice(0, 200),
      });
    }
  }
});
