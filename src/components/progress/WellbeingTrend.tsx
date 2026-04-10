// src/components/progress/WellbeingTrend.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

const LINES = [
  { key: 'energy', label: 'Energy', color: '#1B4332' },
  { key: 'sleep_quality', label: 'Sleep', color: '#D4A574' },
  { key: 'mental_clarity', label: 'Clarity', color: '#4A90D9' },
  { key: 'mood', label: 'Mood', color: '#9B59B6' },
  { key: 'pain_inverted', label: 'Pain (inv.)', color: '#E8922A' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return <div className="bg-[#131313] rounded-lg p-3 border border-outline-variant/10 shadow-xl min-w-[140px]">
    <p className="text-[0.65rem] text-on-surface-variant mb-2">{label}</p>
    {payload.map((p: any) => <div key={p.dataKey} className="flex justify-between gap-3 mb-0.5"><span className="text-[0.62rem]" style={{ color: p.color }}>{p.name}</span><span className="text-[0.62rem] font-bold text-on-surface">{p.value}</span></div>)}
  </div>;
};

export const WellbeingTrend = ({ entries }: { entries: ProgressEntry[] }) => {
  if (entries.length < 3) return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8E3DB] p-6">
      <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest mb-2">Wellbeing Trend</p>
      <p className="text-body text-clinical-stone text-sm">Log at least 3 check-ins to see your trend line.</p>
    </div>
  );

  const chartData = entries.map(e => ({ date: format(parseISO(e.logged_at), 'MMM d'), energy: e.energy, sleep_quality: e.sleep_quality, mental_clarity: e.mental_clarity, mood: e.mood, pain_inverted: 11 - e.pain_level }));

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8E3DB] p-6">
      <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest mb-1">Wellbeing Trend — Last {entries.length} check-ins</p>
      <p className="text-authority text-xl text-clinical-charcoal font-bold mb-5">5-Metric Overview</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E3DB" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9B8EA0' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fontSize: 10, fill: '#9B8EA0' }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {LINES.map(m => <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-3">
        {LINES.map(m => <div key={m.key} className="flex items-center gap-1.5"><div className="w-4 h-0.5" style={{ background: m.color }} /><span className="text-[0.6rem] text-clinical-stone">{m.label}</span></div>)}
      </div>
    </div>
  );
};
