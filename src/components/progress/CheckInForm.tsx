// src/components/progress/CheckInForm.tsx
//
// Light card style matching Lab Analytics — bg-clinical-white + shadow-card.
// Each metric is one row: icon + label, big number readout, then a 10-button
// pill row (1-10) for tap-to-pick. Selected pill highlights with the metric's
// color. No emojis (user feedback). Numbers + labels under each row.
//
// Maps directly to the existing 1-10 scale on save so sparklines / heat map
// keep working unchanged.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogCheckIn, type ProgressEntry } from '../../hooks/useProgress';

interface MetricSpec {
  key: string;
  label: string;
  icon: string;
  color: string;
  /** Word-label per number range — drawn under the picker row. */
  bands: { min: number; max: number; label: string }[];
}

const METRICS: MetricSpec[] = [
  {
    key: 'energy', label: 'Energy', icon: 'bolt', color: '#1B4332',
    bands: [
      { min: 1, max: 3, label: 'Drained' },
      { min: 4, max: 6, label: 'Average' },
      { min: 7, max: 8, label: 'Good' },
      { min: 9, max: 10, label: 'High' },
    ],
  },
  {
    key: 'sleep_quality', label: 'Sleep last night', icon: 'bedtime', color: '#4A90D9',
    bands: [
      { min: 1, max: 3, label: 'Awful' },
      { min: 4, max: 6, label: 'OK' },
      { min: 7, max: 8, label: 'Solid' },
      { min: 9, max: 10, label: 'Great' },
    ],
  },
  {
    key: 'pain_level', label: 'Pain today', icon: 'personal_injury', color: '#E8922A',
    bands: [
      { min: 1, max: 2, label: 'None' },
      { min: 3, max: 5, label: 'Mild' },
      { min: 6, max: 8, label: 'Bad' },
      { min: 9, max: 10, label: 'Severe' },
    ],
  },
  {
    key: 'mental_clarity', label: 'Mental clarity', icon: 'psychology', color: '#9B59B6',
    bands: [
      { min: 1, max: 3, label: 'Foggy' },
      { min: 4, max: 6, label: 'Average' },
      { min: 7, max: 8, label: 'Clear' },
      { min: 9, max: 10, label: 'Sharp' },
    ],
  },
  {
    key: 'mood', label: 'Mood', icon: 'sentiment_calm', color: '#D4A574',
    bands: [
      { min: 1, max: 3, label: 'Low' },
      { min: 4, max: 6, label: 'Neutral' },
      { min: 7, max: 8, label: 'Good' },
      { min: 9, max: 10, label: 'Great' },
    ],
  },
];

const bandLabelFor = (spec: MetricSpec, value: number | undefined): string => {
  if (typeof value !== 'number') return '';
  return spec.bands.find(b => value >= b.min && value <= b.max)?.label ?? '';
};

interface MetricRowProps {
  spec: MetricSpec;
  value: number | undefined;
  onPick: (n: number) => void;
}

const MetricRow = ({ spec, value, onPick }: MetricRowProps) => {
  const label = bandLabelFor(spec, value);
  return (
    <div className="bg-clinical-cream/40 rounded-[12px] p-4 border border-outline-variant/10">
      {/* Header: icon + label + big readout */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${spec.color}15` }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: spec.color }}>{spec.icon}</span>
          </div>
          <div>
            <p className="text-body text-clinical-charcoal font-semibold text-sm leading-tight">{spec.label}</p>
            {label && (
              <p className="text-precision text-[0.55rem] font-bold tracking-wider uppercase mt-0.5" style={{ color: spec.color }}>{label}</p>
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-authority text-2xl font-bold" style={{ color: typeof value === 'number' ? spec.color : '#A6A39B' }}>
            {typeof value === 'number' ? value : '–'}
          </span>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">/10</span>
        </div>
      </div>

      {/* Number pill row (1-10) */}
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const selected = n === value;
          return (
            <motion.button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              whileTap={{ scale: 0.92 }}
              className="relative flex items-center justify-center aspect-square rounded-[6px] transition-all"
              style={{
                background: selected ? spec.color : '#FFFFFF',
                border: selected ? `1.5px solid ${spec.color}` : '1px solid rgba(105,105,105,0.15)',
                color: selected ? '#FFFFFF' : '#6B6B6B',
                fontWeight: selected ? 700 : 500,
                fontSize: '0.7rem',
                fontVariantNumeric: 'tabular-nums',
              }}
              aria-label={`${spec.label} ${n}`}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

interface Props { todayEntry: ProgressEntry | null; onSaved: () => void; }

export const CheckInForm = ({ todayEntry, onSaved }: Props) => {
  const logCheckIn = useLogCheckIn();
  const [values, setValues] = useState<Record<string, number | undefined>>({
    energy: todayEntry?.energy,
    sleep_quality: todayEntry?.sleep_quality,
    pain_level: todayEntry?.pain_level,
    mental_clarity: todayEntry?.mental_clarity,
    mood: todayEntry?.mood,
  });
  const [note, setNote] = useState(todayEntry?.note ?? '');

  const allFilled = METRICS.every(m => typeof values[m.key] === 'number');
  const filledCount = METRICS.filter(m => typeof values[m.key] === 'number').length;

  const handleSubmit = async () => {
    if (!allFilled) return;
    try {
      await logCheckIn.mutateAsync({
        energy: values.energy!,
        sleep_quality: values.sleep_quality!,
        pain_level: values.pain_level!,
        mental_clarity: values.mental_clarity!,
        mood: values.mood!,
        note: note || undefined,
      });
      onSaved();
    } catch { /* surfaced by mutation state */ }
  };

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">
            {todayEntry ? "Today's Check-In — Logged" : "Today's Check-In"}
          </p>
          <p className="text-authority text-xl text-clinical-charcoal font-bold">
            {todayEntry ? 'Update your log' : 'How are you feeling today?'}
          </p>
        </div>
        {todayEntry && (
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-container/10 rounded-[6px]">
            <span className="material-symbols-outlined text-primary-container text-[14px]">check_circle</span>
            <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider uppercase">Logged</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!todayEntry && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-clinical-cream rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary-container rounded-full"
              animate={{ width: `${(filledCount / METRICS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide font-bold">
            {filledCount}/{METRICS.length}
          </span>
        </div>
      )}

      {/* Metric rows */}
      <div className="space-y-3">
        {METRICS.map(m => (
          <MetricRow
            key={m.key}
            spec={m}
            value={values[m.key]}
            onPick={(n) => setValues(prev => ({ ...prev, [m.key]: n }))}
          />
        ))}
      </div>

      {/* Note */}
      <div>
        <label className="text-precision text-[0.6rem] uppercase tracking-widest text-clinical-stone font-bold block mb-2">
          Note <span className="text-clinical-stone/60">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything notable today? (sleep, stress, what you ate)"
          rows={2}
          className="w-full bg-clinical-cream/60 border border-outline-variant/15 rounded-[10px] px-4 py-3 text-body text-sm text-clinical-charcoal placeholder:text-clinical-stone/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary-container/30 focus:border-primary-container/50"
        />
      </div>

      {/* Submit */}
      <AnimatePresence>
        {(allFilled || todayEntry) && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={handleSubmit}
            disabled={logCheckIn.isPending || !allFilled}
            className="w-full py-3.5 bg-primary-container text-white text-sm font-semibold tracking-wide rounded-[10px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {logCheckIn.isPending ? 'Saving…' : todayEntry ? 'Update Check-In' : "Log Today's Check-In"}
          </motion.button>
        )}
      </AnimatePresence>
      {!allFilled && !todayEntry && (
        <p className="text-precision text-[0.62rem] text-clinical-stone tracking-wide text-center">
          Pick all 5 to save · {METRICS.length - filledCount} left
        </p>
      )}
    </div>
  );
};
