// src/components/layout/DebugOverlay.tsx
// On-screen event log. Toggle with ?debug=1 in URL or Ctrl+Shift+D.
// Shows the last 30 logEvent calls + their payloads in real time so we
// can see exactly what fires when the user clicks something — no DevTools
// needed.

import { useEffect, useState } from 'react';

type LocalEvent = { t: string; event: string; payload?: any };

export const DebugOverlay = () => {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  });
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [_, force] = useState(0);

  // Toggle with Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-render every 500ms while open by reading window.__chEvents
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const buf = (window as any).__chEvents as LocalEvent[] | undefined;
      if (buf) setEvents([...buf].reverse());
      force(n => n + 1);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, zIndex: 99999,
      width: '420px', maxHeight: '50vh', overflowY: 'auto',
      background: '#0d0d0d', color: '#fff', borderTop: '2px solid #D4A574',
      borderLeft: '2px solid #D4A574', borderTopLeftRadius: '8px',
      fontFamily: 'monospace', fontSize: '11px', padding: '8px',
      boxShadow: '0 0 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
        <strong style={{ color: '#D4A574' }}>DEBUG · {events.length} events</strong>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '1px 6px', cursor: 'pointer', fontSize: '10px' }}>×</button>
      </div>
      <div>
        {events.length === 0 && <div style={{ color: '#666' }}>No events yet — interact with the page.</div>}
        {events.map((e, i) => {
          const isErr = e.event.includes('failed') || e.event.includes('threw') || e.event.includes('error');
          return (
            <div key={i} style={{ marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px dotted #222' }}>
              <div style={{ color: isErr ? '#FF6B6B' : '#88E', fontSize: '10px' }}>{e.t} · <span style={{ color: isErr ? '#FF6B6B' : '#5DC' }}>{e.event}</span></div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <div style={{ color: '#aaa', fontSize: '10px', marginTop: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(e.payload, null, 0).slice(0, 400)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
