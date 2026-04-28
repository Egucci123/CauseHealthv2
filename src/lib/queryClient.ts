// src/lib/queryClient.ts
import { QueryClient, keepPreviousData } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s within-app freshness — page transitions reuse cache instead of
      // refetching on every mount. Visibility/pageshow handlers below still
      // invalidate everything when the user returns to the tab, so true
      // "fresh data on return" still works.
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      // Keep showing the previous query's data when the queryKey changes
      // (e.g., userId transient null during route transitions). Without
      // this, components flash a skeleton while the new key fetches.
      placeholderData: keepPreviousData,
      // Refetch on mount only if data is stale.
      refetchOnMount: true,
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
      queryClient.invalidateQueries();
    }
  });
}
