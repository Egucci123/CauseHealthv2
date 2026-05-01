// src/components/progress/StreakCounter.tsx
//
// Subtle streak indicator. Counts consecutive calendar days with at least one
// progress entry, going backwards from today (or yesterday if today not yet
// logged). Renders nothing if streak is 0 — never nag the user with empty
// streak counters.
//
// Anti-pattern guard: we deliberately do NOT show a "you broke your streak"
// message anywhere. Streaks are a positive signal only — guilt-tripping
// people about their health is counterproductive.

import { useMemo } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import type { ProgressEntry } from '../../hooks/useProgress';

interface Props {
  entries: ProgressEntry[];
}

function computeStreak(entries: ProgressEntry[]): number {
  if (entries.length === 0) return 0;

  // Build a Set of unique YYYY-MM-DD dates that have an entry.
  const days = new Set(entries.map(e => e.logged_at?.slice(0, 10)).filter(Boolean) as string[]);
  if (days.size === 0) return 0;

  // Walk backwards from today. If today not logged yet, allow yesterday as
  // streak head — gives users a grace period during the day before they
  // check in.
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  let streak = 0;
  let cursor = days.has(today) ? new Date() : (days.has(yesterday) ? subDays(new Date(), 1) : null);
  if (!cursor) return 0;

  while (true) {
    const key = format(cursor, 'yyyy-MM-dd');
    if (!days.has(key)) break;
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

export const StreakCounter = ({ entries }: Props) => {
  const streak = useMemo(() => computeStreak(entries), [entries]);
  if (streak === 0) return null;

  const milestone = streak >= 30 ? '30+ day streak'
    : streak >= 14 ? `${streak}-day streak`
    : streak >= 7 ? `${streak}-day streak`
    : `${streak}-day streak`;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-[6px]">
      <span className="material-symbols-outlined text-[#D4A574] text-[16px]">local_fire_department</span>
      <span className="text-precision text-[0.68rem] text-[#B8915F] font-bold tracking-wider uppercase">{milestone}</span>
    </div>
  );
};

// Helper for parent components that want the raw number (e.g., a separate
// celebration toast on milestone hits).
export const useStreakDays = (entries: ProgressEntry[]): number => {
  return useMemo(() => computeStreak(entries), [entries]);
};

// Re-export for any future use case where the date import is handy
export { parseISO };
