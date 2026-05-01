// src/components/progress/ComplianceCalendar.tsx
//
// 90-day check-in heat map. GitHub-contribution-graph layout — weeks as
// columns (oldest left → newest right), days as rows (Sun top → Sat bottom).
// Way cleaner than the previous tile grid, instantly recognizable, and the
// header is stripped down because adherence stats live in AdherenceHero now.

import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval, startOfWeek, isSameMonth } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

const scoreToColor = (s: number | null): string => {
  if (s === null) return '#EFEAE0';      // empty — soft cream
  if (s >= 7.5) return '#1B4332';        // dark green
  if (s >= 5.5) return '#5E8C61';        // mid green
  if (s >= 3.5) return '#D4A574';        // tan
  return '#E8922A';                      // amber/orange (no red — too punitive)
};
const scoreToLabel = (s: number | null) =>
  s === null ? 'No check-in'
  : s >= 7.5 ? 'Great day'
  : s >= 5.5 ? 'OK day'
  : s >= 3.5 ? 'Below average'
  : 'Hard day';

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']; // sparse to reduce noise

export const ComplianceCalendar = ({ entries }: { entries: ProgressEntry[] }) => {
  const today = new Date();

  // Map of yyyy-MM-dd → overall score
  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.logged_at] = e.overall_score; });
    return m;
  }, [entries]);

  // Build a 90-day window ending today, anchored to start-of-week so columns
  // align cleanly. Then group by week (column) with day-of-week as row.
  const days = useMemo(() => {
    const start = startOfWeek(subDays(today, 89), { weekStartsOn: 0 }); // Sunday
    return eachDayOfInterval({ start, end: today });
  }, []);

  // Group into 7-row × N-col matrix. Each column is a week.
  const columns = useMemo(() => {
    const cols: (Date | null)[][] = [];
    let week: (Date | null)[] = new Array(7).fill(null);
    for (const d of days) {
      const dow = d.getDay(); // 0 = Sun
      week[dow] = d;
      if (dow === 6) {
        cols.push(week);
        week = new Array(7).fill(null);
      }
    }
    if (week.some(d => d !== null)) cols.push(week);
    return cols;
  }, [days]);

  // Month labels above the columns — only render the first column where the
  // month appears, so labels don't repeat (matches GitHub's calendar style).
  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = '';
    columns.forEach((week, ci) => {
      const firstDay = week.find(d => d !== null);
      if (!firstDay) return;
      const monthKey = format(firstDay, 'MMM');
      if (monthKey !== lastMonth && (ci === 0 || !columns[ci - 1].some(d => d && isSameMonth(d, firstDay)))) {
        labels.push({ col: ci, label: monthKey });
        lastMonth = monthKey;
      }
    });
    return labels;
  }, [columns]);

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">90-Day Heat Map</p>
          <p className="text-authority text-lg text-clinical-charcoal font-bold">How your wellbeing has trended</p>
        </div>
        <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{entries.length} check-ins logged</span>
      </div>

      {/* Calendar grid — horizontal scroll on mobile if needed */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block">
          {/* Month labels row */}
          <div className="flex gap-[3px] ml-[24px] mb-1.5 relative h-3">
            {columns.map((_, ci) => {
              const m = monthLabels.find(ml => ml.col === ci);
              return (
                <div key={ci} className="w-[14px]">
                  {m && <span className="text-[0.55rem] text-clinical-stone whitespace-nowrap">{m.label}</span>}
                </div>
              );
            })}
          </div>

          {/* Body: day-of-week labels column + week columns */}
          <div className="flex gap-[3px]">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[3px] mr-1.5">
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="h-[14px] flex items-center text-[0.55rem] text-clinical-stone leading-none">{d}</div>
              ))}
            </div>

            {/* Week columns */}
            {columns.map((week, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  if (!day) {
                    return <div key={di} className="w-[14px] h-[14px]" />;
                  }
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const score = scoreMap[dateStr] ?? null;
                  const isToday = dateStr === format(today, 'yyyy-MM-dd');
                  const isFuture = day.getTime() > today.getTime();
                  if (isFuture) {
                    return <div key={di} className="w-[14px] h-[14px]" />;
                  }
                  return (
                    <div
                      key={di}
                      title={`${format(day, 'MMM d, yyyy')} — ${scoreToLabel(score)}${score !== null ? ` (${score.toFixed(1)})` : ''}`}
                      className="w-[14px] h-[14px] rounded-[3px] transition-transform hover:scale-125 cursor-default"
                      style={{
                        backgroundColor: scoreToColor(score),
                        boxShadow: isToday ? '0 0 0 1.5px #1B4332' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Compact legend */}
      <div className="flex items-center gap-2 mt-5 text-[0.58rem] text-clinical-stone">
        <span className="tracking-wide">Less</span>
        {['#EFEAE0', '#E8922A', '#D4A574', '#5E8C61', '#1B4332'].map(c => (
          <div key={c} className="w-[12px] h-[12px] rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        <span className="tracking-wide">More</span>
        <span className="ml-auto tracking-wide">Score range 1–10</span>
      </div>
    </div>
  );
};
