// src/components/progress/WellbeingTrend.tsx
//
// Light card matching CheckInForm + ComplianceCalendar aesthetic.
// 5 metric mini-cards in a grid, each with:
//   • Color-tinted icon badge + label
//   • Big bold colored current number (tabular-nums)
//   • Trend arrow + 7-day delta
//   • Sparkline at the bottom
//
// No emojis. Same icon set as the CheckInForm (energy=bolt, sleep=bedtime,
// pain=personal_injury, mental_clarity=psychology, mood=sentiment_calm) so
// the user sees the same visual language across check-in → trends.

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { ProgressEntry } from '../../hooks/useProgress';

interface MetricSpec {
  key: keyof ProgressEntry | 'pain_inverted';
  label: string;
  icon: string;
  color: string;
  invert?: boolean;
  sourceKey?: keyof ProgressEntry;
}

const METRICS: MetricSpec[] = [
  { key: 'energy',         label: 'Energy',          icon: 'bolt',             color: '#1B4332' },
  { key: 'sleep_quality',  label: 'Sleep',           icon: 'bedtime',          color: '#4A90D9' },
  { key: 'mental_clarity', label: 'Mental Clarity',  icon: 'psychology',       color: '#9B59B6' },
  { key: 'mood',           label: 'Mood',            icon: 'sentiment_calm',   color: '#D4A574' },
  { key: 'pain_inverted',  label: 'Pain (inverse)',  icon: 'personal_injury',  color: '#E8922A', invert: true, sourceKey: 'pain_level' },
];

const trendArrow = (delta: number): { icon: string; color: string; label: string } => {
  if (delta >= 0.5)  return { icon: 'trending_up',   color: '#1B4332', label: `+${delta.toFixed(1)}` };
  if (delta <= -0.5) return { icon: 'trending_down', color: '#C94F4F', label: delta.toFixed(1) };
  return { icon: 'trending_flat', color: '#A6A39B', label: 'flat' };
};

const MetricCard = ({ spec, entries }: { spec: MetricSpec; entries: ProgressEntry[] }) => {
  const series = entries.map(e => {
    if (spec.key === 'pain_inverted') return 11 - (e.pain_level ?? 0);
    return (e[spec.key as keyof ProgressEntry] as number) ?? 0;
  });
  if (series.length === 0) return null;

  const current = series[series.length - 1];
  const lookback = Math.min(series.length - 1, 6);
  const baseline = series[series.length - 1 - lookback] ?? series[0];
  const delta = current - baseline;
  const arrow = trendArrow(delta);
  const sparkData = series.map((v, i) => ({ i, v }));

  return (
    <div className="bg-clinical-cream/40 rounded-[12px] p-4 border border-outline-variant/10">
      {/* Header: icon badge + label + trend chip */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${spec.color}15` }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: spec.color }}>{spec.icon}</span>
          </div>
          <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone leading-tight">{spec.label}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="material-symbols-outlined text-[14px]" style={{ color: arrow.color }}>{arrow.icon}</span>
          <span className="text-precision text-[0.6rem] font-bold tabular-nums" style={{ color: arrow.color }}>{arrow.label}</span>
        </div>
      </div>

      {/* Big number readout */}
      <div className="flex items-baseline gap-1 mb-2">
        <span
          className="text-authority text-3xl font-bold leading-none"
          style={{ color: spec.color, fontVariantNumeric: 'tabular-nums' }}
        >
          {current.toFixed(0)}
        </span>
        <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">/10</span>
      </div>

      {/* Sparkline */}
      <div className="h-10 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis domain={[1, 10]} hide />
            <Line
              type="monotone"
              dataKey="v"
              stroke={spec.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const WellbeingTrend = ({ entries }: { entries: ProgressEntry[] }) => {
  if (entries.length < 3) {
    return (
      <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-clinical-cream/60 rounded-lg flex items-center justify-center border border-outline-variant/10">
            <span className="material-symbols-outlined text-clinical-stone text-[20px]">trending_up</span>
          </div>
          <div>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold">Wellbeing Trend</p>
            <p className="text-authority text-lg text-clinical-charcoal font-bold">Coming soon</p>
          </div>
        </div>
        <p className="text-body text-clinical-stone text-sm max-w-md">
          Log at least 3 daily check-ins to see how your energy, sleep, mood, mental clarity, and pain are trending.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">Wellbeing Trend · last {entries.length} check-ins</p>
          <p className="text-authority text-lg text-clinical-charcoal font-bold">5 metrics, 7-day change</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICS.map(m => <MetricCard key={m.key} spec={m} entries={entries} />)}
      </div>
    </div>
  );
};
