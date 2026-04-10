// src/components/progress/CheckInForm.tsx
import { useState } from 'react';
import { useLogCheckIn, type ProgressEntry } from '../../hooks/useProgress';

interface Metric { key: string; label: string; icon: string; low: string; high: string; invert: boolean; }

const METRICS: Metric[] = [
  { key: 'energy', label: 'Energy', icon: 'bolt', low: 'Exhausted', high: 'Energized', invert: false },
  { key: 'sleep_quality', label: 'Sleep Quality', icon: 'bedtime', low: 'Terrible', high: 'Excellent', invert: false },
  { key: 'pain_level', label: 'Pain Level', icon: 'heal', low: 'No pain', high: 'Severe pain', invert: true },
  { key: 'mental_clarity', label: 'Mental Clarity', icon: 'psychology', low: 'Brain fog', high: 'Sharp focus', invert: false },
  { key: 'mood', label: 'Mood', icon: 'sentiment_calm', low: 'Very low', high: 'Great', invert: false },
];

const sliderColor = (v: number, inv: boolean) => { const e = inv ? 11 - v : v; return e >= 8 ? '#1B4332' : e >= 5 ? '#E8922A' : '#C94F4F'; };

interface Props { todayEntry: ProgressEntry | null; onSaved: () => void; }

export const CheckInForm = ({ todayEntry, onSaved }: Props) => {
  const logCheckIn = useLogCheckIn();
  const [values, setValues] = useState<Record<string, number>>({
    energy: todayEntry?.energy ?? 5, sleep_quality: todayEntry?.sleep_quality ?? 5,
    pain_level: todayEntry?.pain_level ?? 3, mental_clarity: todayEntry?.mental_clarity ?? 5, mood: todayEntry?.mood ?? 5,
  });
  const [note, setNote] = useState(todayEntry?.note ?? '');

  const handleSubmit = async () => {
    try {
      await logCheckIn.mutateAsync({ energy: values.energy, sleep_quality: values.sleep_quality, pain_level: values.pain_level, mental_clarity: values.mental_clarity, mood: values.mood, note: note || undefined });
      onSaved();
    } catch { /* handled by UI */ }
  };

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">{todayEntry ? "TODAY'S CHECK-IN — LOGGED" : "TODAY'S CHECK-IN"}</p>
          <p className="text-authority text-xl text-clinical-charcoal font-bold">{todayEntry ? "Update today's log" : 'How are you feeling today?'}</p>
        </div>
        {todayEntry && <div className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-primary-container text-white uppercase tracking-wider" style={{ borderRadius: '2px' }}>Logged</div>}
      </div>

      <div className="space-y-5">
        {METRICS.map(m => {
          const val = values[m.key];
          const color = sliderColor(val, m.invert);
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-clinical-stone text-[18px]">{m.icon}</span>
                  <span className="text-body text-clinical-charcoal font-semibold text-sm">{m.label}</span>
                </div>
                <span className="text-precision font-bold text-sm" style={{ color }}>{val}/10</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={val} onChange={e => setValues(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, ${color} ${(val - 1) / 9 * 100}%, #E8E3DB ${(val - 1) / 9 * 100}%)`, accentColor: color }} />
              <div className="flex justify-between mt-1"><span className="text-[0.62rem] text-clinical-stone">{m.low}</span><span className="text-[0.62rem] text-clinical-stone">{m.high}</span></div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="text-precision text-[0.68rem] uppercase tracking-widest text-clinical-stone font-bold block mb-2">Note (optional)</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything notable today?" rows={2}
          className="w-full bg-clinical-cream border border-outline-variant/15 rounded-lg px-4 py-3 text-body text-sm text-clinical-charcoal placeholder:text-clinical-stone resize-none focus:outline-none focus:ring-1 focus:ring-primary-container" />
      </div>

      <button onClick={handleSubmit} disabled={logCheckIn.isPending}
        className="w-full py-3 bg-primary-container text-white text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50" style={{ borderRadius: '6px' }}>
        {logCheckIn.isPending ? 'Saving...' : todayEntry ? 'Update Check-In' : 'Log Check-In'}
      </button>
    </div>
  );
};
