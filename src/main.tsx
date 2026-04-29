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

// Logs every client-side navigation. Lives inside the Router so useLocation works.
const RouteLogger = () => {
  const loc = useLocation();
  React.useEffect(() => {
    logEvent('route_change', { pathname: loc.pathname, search: loc.search });
  }, [loc.pathname, loc.search]);
  return null;
};

const AuthInitializer = ({ children }: { children: React.ReactNode }) => {
  const initialize  = useAuthStore(s => s.initialize);
  const initialized = useAuthStore(s => s.initialized);
  const loading     = useAuthStore(s => s.loading);

  React.useEffect(() => { initialize(); }, [initialize]);

  if (!initialized || loading) {
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
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
    </MotionConfig>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); });
}
