import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { useAuthStore } from './store/authStore';
import { queryClient } from './lib/queryClient';
import './index.css';

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <App />
        </AuthInitializer>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); });
}
