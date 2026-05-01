// src/components/progress/ComplianceCalendar.tsx
//
// Light cards matching lab-analytics + CheckInForm aesthetic. No emojis on
// tiles — score number rendered directly inside the colored tile (tabular
// monospace numbers). Today highlighted with a thick green ring.
//
// Two stacked cards:
//   1. THIS WEEK — 7 large day tiles M-S, each showing the day's score number
//   2. PAST 30 DAYS — denser color-block trend strip for at-a-glance trend

import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval, startOfWeek, isToday, isFuture } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

const scoreToBg = (s: number | null, future: boolean): string => {
  if (future) return 'transparent';
  if (s === null) return '#F4F0E6';
  if (s >= 8.5) return 'linear-gradient(135deg, #2D6A4F 0%, #1B4332 100%)';
  if (s >= 7)   return 'linear-gradient(135deg, #5E8C61 0%, #3D6647 100%)';
  if (s >= 5.5) return 'linear-gradient(135deg, #D4A574 0%, #B8915F 100%)';
  if (s >= 3.5) return 'linear-gradient(135deg, #E8922A 0%, #C97C1F 100%)';
  return 'linear-gradient(135deg, #C94F4F 0%, #A53A3A 100%)';
};

const scoreToTextColor = (s: number | null): string => {
  if (s === null) return '#A6A39B';
  if (s >= 5.5) return '#FFFFFF';   // dark backgrounds → white text
  return '#FFFFFF';                  // bright orange/red → still white
};

const scoreToLabel = (s: number | null) =>
  s === null ? 'No check-in'
  : s >= 8.5 ? 'Great day'
  : s >= 7 ? 'Good'
  : s >= 5.5 ? 'OK'
  : s >= 3.5 ? 'Below average'
  : 'Hard day';

const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const ComplianceCalendar = ({ entries }: { entries: ProgressEntry[] }) => {
  const today = new Date();

  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.logged_at] = e.overall_score; });
    return m;
  }, [entries]);

  const thisWeekDays = useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const past30 = useMemo(() => {
    const end = today;
    const start = subDays(end, 29);
    return eachDayOfInterval({ start, end });
  }, []);

  return (
    <div className="space-y-5">
      {/* THIS WEEK card */}
      <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">This Week</p>
            <p className="text-authority text-xl text-clinical-charcoal font-bold">{format(today, 'MMMM yyyy')}</p>
          </div>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">Week of {format(thisWeekDays[0], 'MMM d')}</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {thisWeekDays.map((d, i) => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const score = scoreMap[dateStr] ?? null;
            const isFutureDay = isFuture(d);
            const isTodayDay = isToday(d);
            const dayLabel = format(d, 'd');
            const dayInitial = DAYS_SHORT[i];

            return (
              <div key={dateStr} className="flex flex-col items-center gap-1.5">
                <span className={`text-precision text-[0.55rem] font-bold tracking-wider uppercase ${isTodayDay ? 'text-primary-container' : 'text-clinical-stone'}`}>
                  {dayInitial}
                </span>
                <div
                  title={`${format(d, 'EEEE, MMM d')} — ${scoreToLabel(score)}${score !== null ? ` (${score.toFixed(1)})` : ''}`}
                  className={`relative w-full aspect-square rounded-[12px] flex items-center justify-center transition-all ${
                    isFutureDay ? 'border border-dashed border-outline-variant/30 bg-clinical-cream/30'
                    : score === null ? 'bg-clinical-cream/60 border border-outline-variant/10'
                    : 'shadow-card-md'
                  }`}
                  style={{
                    background: !isFutureDay && score !== null ? scoreToBg(score, false) : undefined,
                    outline: isTodayDay ? '2.5px solid #1B4332' : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {/* Score number — tabular monospace for clean alignment */}
                  {score !== null ? (
                    <div className="flex items-baseline gap-0.5">
                      <span
                        className="text-authority font-bold leading-none"
                        style={{
                          color: scoreToTextColor(score),
                          fontSize: 'clamp(1.5rem, 5vw, 1.875rem)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {score.toFixed(0)}
                      </span>
                    </div>
                  ) : isFutureDay ? (
                    <span className="text-clinical-stone/30 text-xs">·</span>
                  ) : (
                    <span className="text-clinical-stone/40 text-xs">—</span>
                  )}
                </div>
                <span className={`text-precision text-[0.6rem] font-bold ${isTodayDay ? 'text-primary-container' : 'text-clinical-stone'}`}>
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* PAST 30 DAYS card */}
      <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">Past 30 Days</p>
            <p className="text-authority text-lg text-clinical-charcoal font-bold">Trend at a glance</p>
          </div>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">
            {entries.filter(e => past30.some(d => format(d, 'yyyy-MM-dd') === e.logged_at?.slice(0, 10))).length}/30 logged
          </span>
        </div>

        <div className="grid grid-cols-10 gap-1.5">
          {past30.map((d, i) => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const score = scoreMap[dateStr] ?? null;
            const isTodayDay = isToday(d);
            return (
              <div
                key={i}
                title={`${format(d, 'MMM d')} — ${scoreToLabel(score)}`}
                className="relative aspect-square rounded-[6px] transition-transform hover:scale-110 cursor-default"
                style={{
                  background: scoreToBg(score, false),
                  boxShadow: isTodayDay ? '0 0 0 2px #1B4332, 0 0 0 4px #1B433220' : 'none',
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wide">Hard</span>
          {[
            'linear-gradient(135deg, #C94F4F 0%, #A53A3A 100%)',
            'linear-gradient(135deg, #E8922A 0%, #C97C1F 100%)',
            'linear-gradient(135deg, #D4A574 0%, #B8915F 100%)',
            'linear-gradient(135deg, #5E8C61 0%, #3D6647 100%)',
            'linear-gradient(135deg, #2D6A4F 0%, #1B4332 100%)',
          ].map(g => (
            <div key={g} className="w-[14px] h-[14px] rounded-[3px]" style={{ background: g }} />
          ))}
          <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wide">Great</span>
        </div>
      </div>
    </div>
  );
};
