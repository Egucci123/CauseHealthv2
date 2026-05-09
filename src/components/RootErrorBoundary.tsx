// src/components/RootErrorBoundary.tsx
//
// Global render-error catcher. Wraps the entire <App /> tree in main.tsx.
// If ANY component throws during render (a bad selector, a malformed AI
// response that crashes a card, a missing field on a profile, an undefined
// access in a freshly-deployed component) the user sees a friendly screen
// with a clear path back — never a white screen.
//
// Three options on the fallback so the user is never stuck:
//   • Try again — re-renders the same tree (clears the error state). For
//     transient hiccups, often that's enough.
//   • Go back — uses history.back() so the user lands where they came
//     from, not on a blank page.
//   • Go home — hard-navigates to /dashboard (or / for public users)
//     so even a totally corrupt route resolves to something real.
//
// Every catch is logged to client_events via clientLog so I can see what
// crashed without depending on the user to report it.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logEvent } from '../lib/clientLog';
import { queryClient } from '../lib/queryClient';

// Nuke every layer of cache that could be feeding a corrupted blob back
// into the app. Used by Try Again / Go Back / Go Home so a single bad
// payload (e.g. a wellness plan with the wrong shape) cannot lock the
// user into a perma-error loop. After this, the next render re-fetches
// fresh data from the server.
async function nukeCachesAndReload(href: string) {
  try { queryClient.clear(); } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}
  try { window.localStorage?.removeItem('REACT_QUERY_OFFLINE_CACHE'); } catch {}
  // Cache-bust so HTML/bundle refetch from network, not from disk cache
  const url = new URL(href, window.location.origin);
  url.searchParams.set('_v', String(Date.now()));
  window.location.replace(url.toString());
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Telemetry — the user never sees the error message, but I do.
    try {
      logEvent('root_error_boundary_caught', {
        message: String(error?.message ?? 'unknown').slice(0, 500),
        stack: String(error?.stack ?? '').slice(0, 1500),
        componentStack: String(info?.componentStack ?? '').slice(0, 1500),
        pathname: window.location.pathname,
      });
    } catch {}
    // Also surface to console for local dev.
    if (import.meta.env.DEV) console.error('[RootErrorBoundary]', error, info);
  }

  // Reload current page with caches cleared. The previous "reset" just
  // re-rendered the same tree, which re-fetched the same cached payload
  // and crashed again — leaving the user stuck. Now we clear React Query,
  // service-worker caches, and force a network refetch.
  reset = () => { void nukeCachesAndReload(window.location.pathname + window.location.search); };

  goBack = () => {
    // Cache-bust before going back so the destination page doesn't read
    // the same corrupted cached payload that crashed this one.
    if (window.history.length > 1) {
      void nukeCachesAndReload(document.referrer || '/dashboard');
    } else {
      void nukeCachesAndReload('/dashboard');
    }
  };

  goHome = () => { void nukeCachesAndReload('/dashboard'); };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = String(this.state.error?.message ?? '').trim();
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-clinical-cream rounded-[16px] shadow-2xl p-6 sm:p-10 text-center">
          <div className="w-14 h-14 bg-[#C94F4F]/15 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="material-symbols-outlined text-[#C94F4F] text-3xl">error</span>
          </div>
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#C94F4F] mb-2">
            Something broke
          </p>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">
            We hit an unexpected error.
          </p>
          <p className="text-body text-clinical-stone text-sm mb-2 leading-relaxed">
            Your data is safe. This page couldn't render — not a crash you caused.
          </p>
          {msg && (
            <p className="text-precision text-[0.65rem] text-clinical-stone/70 break-words mb-6">
              {msg.slice(0, 180)}{msg.length > 180 ? '…' : ''}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button
              onClick={this.reset}
              className="w-full bg-primary-container hover:bg-[#2D6A4F] text-white text-precision text-[0.68rem] font-bold tracking-widest uppercase py-3 rounded-[8px] transition-colors"
            >
              Try Again
            </button>
            <div className="flex gap-2">
              <button
                onClick={this.goBack}
                className="flex-1 bg-clinical-white border border-outline-variant/30 text-clinical-charcoal text-precision text-[0.65rem] font-bold tracking-widest uppercase py-2.5 rounded-[8px] hover:bg-clinical-cream transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={this.goHome}
                className="flex-1 bg-clinical-white border border-outline-variant/30 text-clinical-charcoal text-precision text-[0.65rem] font-bold tracking-widest uppercase py-2.5 rounded-[8px] hover:bg-clinical-cream transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
