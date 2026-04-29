// src/components/layout/NewVersionBanner.tsx
// Detects when Vercel has deployed a newer build than the one in this tab.
// Polls /version.json on visibility-change and every 5 minutes. When the
// commit hash differs from the one this bundle was built with, surfaces a
// banner with a one-click reload. Auto-reloads after 60s of inactivity.

import { useEffect, useState } from 'react';
import { logEvent } from '../../lib/clientLog';
import { queryClient } from '../../lib/queryClient';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_RELOAD_AFTER_MS = 60 * 1000;  // 60s after banner shown

// Force a true hard reload — bypass the HTTP cache for the HTML, clear all
// caches, drop the React Query cache. window.location.reload() alone can
// serve cached HTML referencing an old bundle hash, leaving the user on
// stale code AGAIN.
async function hardReload() {
  try { queryClient.clear(); } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}
  // Cache-bust the URL so the browser MUST refetch HTML from the network
  const url = new URL(window.location.href);
  url.searchParams.set('_v', String(Date.now()));
  window.location.replace(url.toString());
}

export const NewVersionBanner = () => {
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || null;
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  const newVersionAvailable = !!buildVersion && !!serverVersion && buildVersion !== serverVersion;

  useEffect(() => {
    if (!buildVersion) return; // dev mode, not built — no version comparison

    let cancelled = false;
    const check = async () => {
      try {
        // Cache-bust the version.json fetch — Vercel/CDNs sometimes cache it
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.commit && data.commit !== buildVersion) {
          setServerVersion(data.commit);
          logEvent('new_version_detected', { current: buildVersion, latest: data.commit });
        }
      } catch { /* offline or fetch failed — try again next tick */ }
    };

    // Check now, then on every visibility-back, then every 5 min
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [buildVersion]);

  // Auto-reload after 60s if user doesn't click the button
  useEffect(() => {
    if (!newVersionAvailable) return;
    const timer = setTimeout(() => {
      logEvent('new_version_auto_reload', { current: buildVersion, latest: serverVersion });
      hardReload();
    }, AUTO_RELOAD_AFTER_MS);
    return () => clearTimeout(timer);
  }, [newVersionAvailable, buildVersion, serverVersion]);

  if (!newVersionAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm bg-[#1B4332] text-white rounded-[10px] shadow-lg border border-[#2D6A4F] p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4">
      <span className="material-symbols-outlined text-[#D4A574] text-[20px] flex-shrink-0 mt-0.5">refresh</span>
      <div className="flex-1 min-w-0">
        <p className="text-authority text-sm font-semibold mb-0.5">New version available</p>
        <p className="text-body text-on-surface-variant text-xs leading-relaxed mb-2">
          A newer version of CauseHealth has been deployed. Reload to get the latest fixes.
        </p>
        <button
          onClick={() => {
            logEvent('new_version_manual_reload', { current: buildVersion, latest: serverVersion });
            hardReload();
          }}
          className="text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-1.5 bg-[#D4A574] text-clinical-charcoal rounded-[6px] hover:bg-[#B8915F] transition-colors"
        >
          Reload Now
        </button>
      </div>
    </div>
  );
};
