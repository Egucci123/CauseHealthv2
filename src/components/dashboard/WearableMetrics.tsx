// src/components/dashboard/WearableMetrics.tsx
// Manual-entry stub for wearable metrics. Real OAuth integrations
// (Whoop, Oura, Apple Health, Garmin) are platform work — for now we
// let users enter the four numbers that matter most for optimizers
// directly from their device's screen. Stored in localStorage.
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { SectionLabel } from '../ui/SectionLabel';

interface MetricEntry { value: number; updatedAt: string }
type MetricKey = 'rhr' | 'hrv' | 'sleep' | 'vo2max';
type MetricsState = Partial<Record<MetricKey, MetricEntry>>;

const STORAGE_KEY = (uid: string) => `wearable_metrics_${uid}`;

const METRICS: { key: MetricKey; label: string; icon: string; unit: string; helper: string; ranges: { good: string } }[] = [
  { key: 'rhr',     label: 'Resting HR',  icon: 'monitor_heart',     unit: 'bpm',      helper: 'From your wearable. Lower = more cardiovascular fitness.', ranges: { good: '< 60 bpm' } },
  { key: 'hrv',     label: 'HRV',         icon: 'graphic_eq',        unit: 'ms',       helper: 'Heart rate variability. Higher = better recovery.',          ranges: { good: '> 50 ms' } },
  { key: 'sleep',   label: 'Avg Sleep',   icon: 'bedtime',           unit: 'hrs',      helper: '7-day average from your tracker.',                            ranges: { good: '7-9 hrs' } },
  { key: 'vo2max',  label: 'VO2 Max',     icon: 'directions_run',    unit: 'ml/kg/min',helper: 'Estimated fitness. Strongest mortality predictor.',           ranges: { good: '> 45 ml/kg/min' } },
];

export const WearableMetrics = ({ userId }: { userId: string }) => {
  const [metrics, setMetrics] = useState<MetricsState>({});
  const [editing, setEditing] = useState<MetricKey | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(userId));
      if (raw) setMetrics(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [userId]);

  const save = (key: MetricKey, value: number) => {
    setMetrics(prev => {
      const next: MetricsState = { ...prev, [key]: { value, updatedAt: new Date().toISOString() } };
      try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    setEditing(null);
    setDraft('');
  };

  const startEdit = (key: MetricKey) => {
    setEditing(key);
    setDraft(metrics[key]?.value?.toString() ?? '');
  };

  const recordCount = Object.keys(metrics).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel className="mb-0" icon="watch">Wearable Vitals</SectionLabel>
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{recordCount}/4 tracked</p>
      </div>

      {recordCount === 0 && (
        <div className="bg-clinical-cream/40 border border-outline-variant/15 rounded-[10px] p-4 mb-3">
          <p className="text-body text-clinical-stone text-xs leading-relaxed">
            Tap a metric below and enter your latest number from Whoop / Oura / Apple Health / Garmin. Updating once a week is plenty. These show up in trend context next to your lab data.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {METRICS.map(m => {
          const entry = metrics[m.key];
          const isEditing = editing === m.key;
          return (
            <div key={m.key} className="bg-clinical-white rounded-[10px] shadow-card p-4 border-l-2 border-[#1B423A]">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-[8px] bg-[#1B423A]/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#1B423A] text-[18px]">{m.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight">{m.label}</p>
                  <p className="text-precision text-[0.7rem] text-clinical-stone tracking-wide mt-0.5">{m.ranges.good}</p>
                </div>
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = parseFloat(draft);
                        if (!isNaN(n)) save(m.key, n);
                      } else if (e.key === 'Escape') {
                        setEditing(null); setDraft('');
                      }
                    }}
                    className="flex-1 bg-clinical-cream border border-outline-variant/30 rounded-[6px] px-3 py-2 text-precision text-base text-clinical-charcoal font-medium focus:outline-none focus:border-primary-container"
                    placeholder={`Value in ${m.unit}`}
                  />
                  <button
                    onClick={() => {
                      const n = parseFloat(draft);
                      if (!isNaN(n)) save(m.key, n);
                    }}
                    className="bg-primary-container text-white text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 rounded-[6px] hover:bg-[#0F2A24] transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditing(null); setDraft(''); }}
                    className="text-precision text-[0.65rem] text-clinical-stone tracking-widest uppercase px-2 py-2 hover:text-clinical-charcoal"
                  >
                    Cancel
                  </button>
                </div>
              ) : entry ? (
                <button
                  onClick={() => startEdit(m.key)}
                  className="w-full text-left flex items-baseline justify-between gap-2 hover:opacity-80 transition-opacity"
                >
                  <div>
                    <span className="text-authority text-2xl text-clinical-charcoal font-bold">{entry.value}</span>
                    <span className="text-precision text-[0.7rem] text-clinical-stone ml-1">{m.unit}</span>
                  </div>
                  <span className="text-precision text-[0.7rem] text-clinical-stone">
                    {formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => startEdit(m.key)}
                  className="w-full text-precision text-[0.65rem] text-primary-container font-bold tracking-widest uppercase py-2 hover:underline text-left"
                >
                  + Add {m.label}
                </button>
              )}

              {!isEditing && (
                <p className="text-precision text-[0.7rem] text-clinical-stone tracking-wide leading-relaxed mt-2">{m.helper}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
