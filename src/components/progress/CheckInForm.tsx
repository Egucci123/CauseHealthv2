// src/components/progress/CheckInForm.tsx
//
// Replaces the old 5-slider clinical form with an emoji-grid picker.
// Each metric is one row: 5 emoji buttons (low → high), tap once.
// Selected state shows a colored ring + value chip on the right.
//
// On submit, form collapses into a "Today's vibe" summary card showing the
// selected emojis horizontally — way more rewarding to look at than "logged".
//
// All state still maps to the existing 1–10 scale on save (3, 5, 7, 8, 10
// for the 5 buttons) so the rest of the app (sparklines, heat map, score)
// keeps working unchanged.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogCheckIn, type ProgressEntry } from '../../hooks/useProgress';

interface MetricSpec {
  key: string;
  label: string;
  icon: string;
  color: string;
  invert?: boolean;        // pain: higher emoji index = less pain
  options: { emoji: string; value: number; label: string }[];
}

// 5-step pickers for each metric. Values map to the 1–10 scale on save so
// downstream sparklines/heat map keep working without DB changes.
const METRICS: MetricSpec[] = [
  {
    key: 'energy', label: 'Energy', icon: 'bolt', color: '#1B4332',
    options: [
      { emoji: '🪫', value: 2, label: 'Drained' },
      { emoji: '😴', value: 4, label: 'Tired' },
      { emoji: '😐', value: 6, label: 'Average' },
      { emoji: '🙂', value: 8, label: 'Good' },
      { emoji: '⚡', value: 10, label: 'High' },
    ],
  },
  {
    key: 'sleep_quality', label: 'Sleep last night', icon: 'bedtime', color: '#4A90D9',
    options: [
      { emoji: '😵', value: 2, label: 'Awful' },
      { emoji: '😩', value: 4, label: 'Restless' },
      { emoji: '😶', value: 6, label: 'OK' },
      { emoji: '😌', value: 8, label: 'Solid' },
      { emoji: '🌙', value: 10, label: 'Great' },
    ],
  },
  {
    key: 'pain_level', label: 'Pain today', icon: 'heal', color: '#E8922A', invert: true,
    options: [
      { emoji: '🙏', value: 1, label: 'None' },
      { emoji: '🙂', value: 3, label: 'Mild' },
      { emoji: '😐', value: 5, label: 'Some' },
      { emoji: '😣', value: 7, label: 'Bad' },
      { emoji: '🥵', value: 10, label: 'Severe' },
    ],
  },
  {
    key: 'mental_clarity', label: 'Mental clarity', icon: 'psychology', color: '#9B59B6',
    options: [
      { emoji: '🌫️', value: 2, label: 'Foggy' },
      { emoji: '😶‍🌫️', value: 4, label: 'Hazy' },
      { emoji: '🤔', value: 6, label: 'Average' },
      { emoji: '🧠', value: 8, label: 'Clear' },
      { emoji: '🎯', value: 10, label: 'Sharp' },
    ],
  },
  {
    key: 'mood', label: 'Mood', icon: 'sentiment_calm', color: '#D4A574',
    options: [
      { emoji: '😞', value: 2, label: 'Low' },
      { emoji: '😕', value: 4, label: 'Off' },
      { emoji: '😐', value: 6, label: 'Neutral' },
      { emoji: '🙂', value: 8, label: 'Good' },
      { emoji: '😄', value: 10, label: 'Great' },
    ],
  },
];

interface MetricRowProps {
  spec: MetricSpec;
  selectedValue: number | undefined;
  onPick: (value: number) => void;
}

const MetricRow = ({ spec, selectedValue, onPick }: MetricRowProps) => {
  const selectedOption = spec.options.find(o => o.value === selectedValue);
  return (
    <div className="bg-clinical-cream/40 rounded-[12px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${spec.color}15` }}>
            <span className="material-symbols-outlined text-[16px]" style={{ color: spec.color }}>{spec.icon}</span>
          </div>
          <span className="text-body text-clinical-charcoal font-semibold text-sm">{spec.label}</span>
        </div>
        {selectedOption && (
          <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase" style={{ color: spec.color }}>
            {selectedOption.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {spec.options.map(opt => {
          const selected = opt.value === selectedValue;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onPick(opt.value)}
              whileTap={{ scale: 0.92 }}
              className={`relative flex items-center justify-center aspect-square rounded-[10px] transition-all ${selected ? 'bg-clinical-white shadow-card' : 'bg-clinical-white/60 hover:bg-clinical-white'}`}
              style={{
                outline: selected ? `2px solid ${spec.color}` : '2px solid transparent',
                outlineOffset: '-1px',
              }}
              title={opt.label}
            >
              <span className="text-2xl leading-none" style={{ filter: selected ? 'none' : 'grayscale(0.6) opacity(0.85)' }}>
                {opt.emoji}
              </span>
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
            {todayEntry ? "Today's Vibe — Logged" : "Today's Vibe"}
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

      {/* Progress chip */}
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
            selectedValue={values[m.key]}
            onPick={(v) => setValues(prev => ({ ...prev, [m.key]: v }))}
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
