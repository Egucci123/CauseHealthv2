// src/components/progress/ComplianceCalendar.tsx
//
// "Vibe Board" — visual at-a-glance check-in calendar. Two views stacked:
//
//   1. THIS WEEK strip — Mon→Sun, big tiles, mood emoji on each day with a
//      check-in, today highlighted with a glowing ring. Reads like an Oura
//      / Apple Watch weekly view. The hero of the section.
//
//   2. PAST 30 DAYS heat map — denser grid below, color blocks per day for
//      trend context. No emojis (too noisy at this density). GitHub style
//      but with bigger tiles + softer gradient palette so it doesn't look
//      like a dev tool.
//
// Pulls from progress_entries.overall_score. We'll surface the dominant mood
// emoji per day by reverse-mapping from the picker values used in CheckInForm.

import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval, startOfWeek, isToday, isFuture } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

// Score → background gradient. Soft, mid-saturation palette.
const scoreToBg = (s: number | null, isFuture: boolean): string => {
  if (isFuture) return 'transparent';
  if (s === null) return '#F4F0E6';            // empty cream
  if (s >= 8.5)  return 'linear-gradient(135deg, #2D6A4F 0%, #1B4332 100%)';
  if (s >= 7)    return 'linear-gradient(135deg, #5E8C61 0%, #3D6647 100%)';
  if (s >= 5.5)  return 'linear-gradient(135deg, #D4A574 0%, #B8915F 100%)';
  if (s >= 3.5)  return 'linear-gradient(135deg, #E8922A 0%, #C97C1F 100%)';
  return 'linear-gradient(135deg, #C94F4F 0%, #A53A3A 100%)';
};

// Reverse-map score → mood emoji. Picks the mood that's the dominant feeling
// at that score band. Matches the picker emojis in CheckInForm so users see
// what they "felt like" each day at a glance.
const scoreToEmoji = (s: number | null): string => {
  if (s === null) return '';
  if (s >= 8.5)  return '⚡';   // High energy
  if (s >= 7)    return '🙂';   // Good
  if (s >= 5.5)  return '😐';   // Average
  if (s >= 3.5)  return '😩';   // Tired
  return '😵';                  // Awful
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

  // ── THIS WEEK ───────────────────────────────────────────────────
  // Week starts on Monday for consistency.
  const thisWeekDays = useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  // ── PAST 30 DAYS (smooth heat map) ──────────────────────────────
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
            <p className="text-authority text-lg text-clinical-charcoal font-bold">{format(today, 'MMMM yyyy')}</p>
          </div>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">Week of {format(thisWeekDays[0], 'MMM d')}</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {thisWeekDays.map((d, i) => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const score = scoreMap[dateStr] ?? null;
            const emoji = scoreToEmoji(score);
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
                  title={`${format(d, 'EEEE, MMM d')} — ${scoreToLabel(score)}`}
                  className={`relative w-full aspect-square rounded-[12px] flex items-center justify-center transition-all ${
                    isFutureDay ? 'border border-dashed border-outline-variant/30 bg-clinical-cream/30'
                    : score === null ? 'bg-clinical-cream'
                    : 'shadow-card-md'
                  }`}
                  style={{
                    background: !isFutureDay && score !== null ? scoreToBg(score, false) : undefined,
                    outline: isTodayDay ? '2.5px solid #1B4332' : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {emoji ? (
                    <span className="text-2xl md:text-3xl leading-none drop-shadow-sm">{emoji}</span>
                  ) : isFutureDay ? (
                    <span className="text-clinical-stone/30 text-xs">—</span>
                  ) : (
                    <span className="text-clinical-stone/40 text-xs">·</span>
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

      {/* PAST 30 DAYS strip */}
      <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-1">Past 30 Days</p>
            <p className="text-authority text-lg text-clinical-charcoal font-bold">Trend at a glance</p>
          </div>
          <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{entries.filter(e => past30.some(d => format(d, 'yyyy-MM-dd') === e.logged_at?.slice(0, 10))).length}/30 logged</span>
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

        {/* Legend */}
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
          <span className="ml-auto text-precision text-[0.55rem] text-clinical-stone tracking-wide">No log = ▢</span>
        </div>
      </div>
    </div>
  );
};
