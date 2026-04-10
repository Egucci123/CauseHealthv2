// src/components/progress/ComplianceCalendar.tsx
import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

const scoreToColor = (s: number | null) => s === null ? '#E8E3DB' : s >= 7.5 ? '#1B4332' : s >= 5.5 ? '#D4A574' : s >= 3.5 ? '#E8922A' : '#C94F4F';
const scoreToLabel = (s: number | null) => s === null ? 'No check-in' : s >= 7.5 ? 'Great day' : s >= 5.5 ? 'OK day' : s >= 3.5 ? 'Rough day' : 'Hard day';

export const ComplianceCalendar = ({ entries }: { entries: ProgressEntry[] }) => {
  const today = new Date();
  const scoreMap = useMemo(() => { const m: Record<string, number> = {}; entries.forEach(e => { m[e.logged_at] = e.overall_score; }); return m; }, [entries]);
  const days = useMemo(() => eachDayOfInterval({ start: subDays(today, 89), end: today }), []);

  const weeks = useMemo(() => {
    const result: (Date | null)[][] = []; let week: (Date | null)[] = [];
    for (let i = 0; i < days[0].getDay(); i++) week.push(null);
    days.forEach(day => { week.push(day); if (week.length === 7) { result.push(week); week = []; } });
    if (week.length > 0) { while (week.length < 7) week.push(null); result.push(week); }
    return result;
  }, [days]);

  const streakDays = useMemo(() => { let s = 0; for (let i = 0; i < 90; i++) { if (scoreMap[format(subDays(today, i), 'yyyy-MM-dd')] !== undefined) s++; else break; } return s; }, [scoreMap]);
  const avgScore = useMemo(() => entries.length ? entries.reduce((s, e) => s + e.overall_score, 0) / entries.length : null, [entries]);

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-precision text-[0.68rem] text-clinical-stone uppercase tracking-widest mb-1">90-Day Check-In History</p>
          <p className="text-authority text-xl text-clinical-charcoal font-bold">Compliance Calendar</p>
        </div>
        <div className="flex gap-4 text-right">
          <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider">Streak</p><p className="text-precision text-xl font-bold text-primary-container">{streakDays}d</p></div>
          <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider">Logged</p><p className="text-precision text-xl font-bold text-clinical-charcoal">{entries.length}/90</p></div>
          {avgScore !== null && <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider">Avg</p><p className="text-precision text-xl font-bold" style={{ color: scoreToColor(avgScore) }}>{avgScore.toFixed(1)}</p></div>}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-center text-[0.58rem] text-clinical-stone">{d}</div>)}
      </div>

      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} />;
              const dateStr = format(day, 'yyyy-MM-dd');
              const score = scoreMap[dateStr] ?? null;
              const isToday = dateStr === format(today, 'yyyy-MM-dd');
              return <div key={di} title={`${format(day, 'MMM d')} — ${scoreToLabel(score)}${score !== null ? ` (${score.toFixed(1)})` : ''}`}
                className="aspect-square rounded-sm transition-opacity hover:opacity-80 cursor-default"
                style={{ background: scoreToColor(score), outline: isToday ? '2px solid #1B4332' : 'none', outlineOffset: '1px' }} />;
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <span className="text-[0.6rem] text-clinical-stone">Score:</span>
        {[{ color: '#C94F4F', label: 'Hard (1–3)' }, { color: '#E8922A', label: 'Rough (4–5)' }, { color: '#D4A574', label: 'OK (6–7)' }, { color: '#1B4332', label: 'Great (8–10)' }, { color: '#E8E3DB', label: 'No log' }].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: color }} /><span className="text-[0.6rem] text-clinical-stone">{label}</span></div>
        ))}
      </div>
    </div>
  );
};
