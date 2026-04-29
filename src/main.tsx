import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { useAuthStore } from './store/authStore';
import { queryClient } from './lib/queryClient';
import { logEvent, setLogUserId } from './lib/clientLog';
import { supabase } from './lib/supabase';
import { NewVersionBanner } from './components/layout/NewVersionBanner';
import './index.css';

// ── Wire user id into telemetry as soon as auth resolves ──
supabase.auth.onAuthStateChange((evt, session) => {
  setLogUserId(session?.user?.id ?? null);
  logEvent('auth_state_change', { evt, hasSession: !!session, userId: session?.user?.id });
});
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user?.id) {
    setLogUserId(session.user.id);
    logEvent('auth_initial_session', { userId: session.user.id });
  } else {
    logEvent('auth_initial_no_session');
  }
});

// Logs every client-side navigation AND snapshots what actually rendered
// 600ms later — so I can detect "URL changed but the wrong page is showing".
const RouteLogger = () => {
  const loc = useLocation();
  React.useEffect(() => {
    logEvent('route_change', { pathname: loc.pathname, search: loc.search });
    // Snapshot DOM after React has rendered so we capture what the user sees
    const timer = setTimeout(() => {
      try {
        const h1 = document.querySelector('h1')?.textContent?.trim().slice(0, 80) || null;
        const h2 = document.querySelector('h2')?.textContent?.trim().slice(0, 80) || null;
        const hasSkeleton = !!document.querySelector('[class*="skeleton" i], [class*="animate-pulse"]');
        const visibleButtons = document.querySelectorAll('button:not([disabled]), a[href]').length;
        const bodyText = (document.body?.innerText || '').slice(0, 300).replace(/\s+/g, ' ');
        logEvent('page_snapshot', {
          pathname: loc.pathname,
          title: document.title?.slice(0, 80) ?? null,
          h1, h2,
          has_skeleton: hasSkeleton,
          visible_buttons: visibleButtons,
          body_preview: bodyText,
        });
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [loc.pathname, loc.search]);
  return null;
};

const AuthInitializer = ({ children }: { children: React.ReactNode }) => {
  const initialize  = useAuthStore(s => s.initialize);
  const initialized = useAuthStore(s => s.initialized);
  // Only delay-show the loading screen — for typical fast loads (~50-300ms)
  // the spinner never appears. Avoids the black/green flash on every login.
  const [showSpinner, setShowSpinner] = React.useState(false);

  React.useEffect(() => { initialize(); }, [initialize]);

  React.useEffect(() => {
    if (initialized) return;
    // If auth hasn't resolved within 250ms, THEN show the spinner.
    // Most loads resolve faster — user never sees the loading state at all.
    const timer = setTimeout(() => setShowSpinner(true), 250);
    return () => clearTimeout(timer);
  }, [initialized]);

  if (!initialized) {
    if (!showSpinner) return null;
    return (
      <div className="min-h-screen bg-[#131313] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">CauseHealth.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RouteLogger />
        <AuthInitializer>
          <App />
        </AuthInitializer>
        <NewVersionBanner />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
    </MotionConfig>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); });
}
