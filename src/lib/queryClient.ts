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
// canonical signal. When the user comes back after >5s away, invalidate all
// active queries so the page reflects fresh server state immediately.
let lastHiddenAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now();
    } else if (document.visibilityState === 'visible') {
      const awayMs = Date.now() - lastHiddenAt;
      if (lastHiddenAt > 0 && awayMs > 5000) {
        queryClient.invalidateQueries();
      }
    }
  });

  // Also re-invalidate on pageshow with persisted=true (back-forward cache hit).
  // Safari especially restores the page from BFCache without firing visibilitychange.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      logEvent('bfcache_restore');
      queryClient.invalidateQueries();
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
