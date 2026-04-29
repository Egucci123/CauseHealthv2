// src/components/progress/LabTrendChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useLabTrends } from '../../hooks/useProgress';

interface Props { markerName: string; displayName: string; unit: string; optimalMin: number; optimalMax: number; }

// Color map for both new (healthy/watch/low/high/critical_*) and legacy
// flag values so historical rows still render correctly.
const FLAG_COLORS: Record<string, string> = {
  healthy: '#1B4332', watch: '#E8922A', low: '#C94F4F', high: '#C94F4F', critical_low: '#C94F4F', critical_high: '#C94F4F',
  optimal: '#1B4332', monitor: '#E8922A', critical: '#C94F4F', suboptimal_low: '#E8922A', suboptimal_high: '#E8922A', deficient: '#C94F4F', elevated: '#C94F4F',
};

const CustomDot = (props: any) => { const { cx, cy, payload } = props; const color = FLAG_COLORS[payload?.optimal_flag] ?? '#6B7280'; return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#FDFAF5" strokeWidth={2} />; };
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const color = FLAG_COLORS[d?.optimal_flag] ?? '#6B7280';
  return <div className="bg-[#131313] rounded-lg p-3 border border-outline-variant/10 shadow-xl">
    <p className="text-[0.65rem] text-on-surface-variant mb-1">{label}</p>
    <p className="font-bold text-sm" style={{ color }}>{d?.value} {d?.unit}</p>
    {d?.optimal_flag && <p className="text-[0.6rem] uppercase tracking-wider mt-0.5" style={{ color }}>{d.optimal_flag}</p>}
  </div>;
};

export const LabTrendChart = ({ markerName, displayName, unit, optimalMin, optimalMax }: Props) => {
  const { data} = useLabTrends(markerName);
  const points = data ?? [];

  // Skeleton until query resolves once.
  if (!data) return <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8E3DB] p-6 animate-pulse"><div className="h-4 bg-[#E8E3DB] rounded w-1/3 mb-4" /><div className="h-32 bg-[#E8E3DB] rounded" /></div>;

  if (points.length < 2) return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8E3DB] p-6">
      <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest mb-1">{displayName}</p>
      <p className="text-body text-clinical-stone text-sm">{points.length === 0 ? `No ${displayName} data found.` : 'Need at least 2 lab draws to show a trend.'}</p>
    </div>
  );

  const chartData = points.map(p => ({ ...p, date: format(parseISO(p.date), 'MMM d'), value: typeof p.value === 'string' ? parseFloat(p.value) : p.value }));
  const allValues = chartData.map(d => d.value);
  const minVal = Math.min(...allValues, optimalMin) * 0.85;
  const maxVal = Math.max(...allValues, optimalMax) * 1.15;
  const latest = chartData[chartData.length - 1];
  const latestColor = FLAG_COLORS[latest.optimal_flag] ?? '#6B7280';

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8E3DB] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest mb-0.5">{displayName} — {points.length} draws</p>
          <div className="flex items-baseline gap-2">
            <span className="text-precision text-2xl font-bold" style={{ color: latestColor }}>{latest.value}</span>
            <span className="text-precision text-[0.68rem] text-clinical-stone">{unit}</span>
            {latest.optimal_flag && <span className="text-precision text-[0.6rem] font-bold px-1.5 py-0.5 uppercase tracking-wider" style={{ color: latestColor, background: `${latestColor}18`, borderRadius: '2px' }}>{latest.optimal_flag}</span>}
          </div>
        </div>
        <div className="text-right"><p className="text-[0.62rem] text-clinical-stone">Optimal range</p><p className="text-[0.68rem] font-bold text-clinical-charcoal">{optimalMin}–{optimalMax} {unit}</p></div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E3DB" vertical={false} />
          <ReferenceArea y1={optimalMin} y2={optimalMax} fill="#1B4332" fillOpacity={0.06} />
          <ReferenceLine y={optimalMin} stroke="#1B4332" strokeDasharray="4 4" strokeOpacity={0.4} strokeWidth={1} />
          <ReferenceLine y={optimalMax} stroke="#1B4332" strokeDasharray="4 4" strokeOpacity={0.4} strokeWidth={1} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9B8EA0' }} axisLine={false} tickLine={false} />
          <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 10, fill: '#9B8EA0' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="value" stroke="#1B4332" strokeWidth={2} dot={<CustomDot />} activeDot={{ r: 7, fill: '#1B4332' }} />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex gap-4 mt-3">
        {[{ color: '#1B4332', label: 'Optimal' }, { color: '#E8922A', label: 'Monitor' }, { color: '#C94F4F', label: 'Critical' }].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: color }} /><span className="text-[0.6rem] text-clinical-stone">{label}</span></div>
        ))}
      </div>
    </div>
  );
};
