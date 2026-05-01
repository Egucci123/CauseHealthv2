// src/components/wellness/WeeklySpotlight.tsx
//
// "This Week's Focus" spotlight at the top of /wellness. Pulls 7 meals from
// the user's existing plan, weighted to their current week-since-plan-was-
// generated. Phase 1 meals dominate weeks 1-3 ("easy mode"), Phase 3 home
// cooking dominates weeks 10-12 — with a dinner-specific override that
// pushes harder toward home-cooked dinners as weeks progress.
//
// Selection logic lives in src/lib/weeklySpotlight.ts (pure function).
// This component just displays the result.

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { pickWeeklySpotlight, type PlanMeal } from '../../lib/weeklySpotlight';

interface Props {
  meals: PlanMeal[];
  planGeneratedAt: string;
  userId: string;
  // Optional: smooth-scroll target id for "Browse all" button
  browseAnchorId?: string;
}

export const WeeklySpotlight = ({ meals, planGeneratedAt, userId, browseAnchorId }: Props) => {
  const result = useMemo(
    () => pickWeeklySpotlight(meals, planGeneratedAt, userId),
    [meals, planGeneratedAt, userId],
  );

  if (!result || result.meals.length === 0) return null;

  const handleBrowse = () => {
    if (!browseAnchorId) return;
    const el = document.getElementById(browseAnchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-[#131313] rounded-[14px] p-6 shadow-card mb-6"
    >
      {/* Pill header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] bg-[#D4A574]/10 px-2.5 py-1 rounded-[3px]">
          Week {result.weekNumber} of 12
        </span>
        <span className="text-precision text-[0.6rem] text-on-surface-variant tracking-wider uppercase">This Week's Focus</span>
      </div>

      {/* Headline + sub */}
      <h2 className="text-authority text-2xl md:text-3xl text-on-surface font-bold leading-tight mb-2">
        {result.weekLabel}
      </h2>
      <p className="text-body text-on-surface-variant text-sm mb-5 max-w-2xl leading-relaxed">
        {result.weekSubLabel}
      </p>

      {/* Meal pills — tap-friendly */}
      <div className="flex flex-wrap gap-2 mb-4">
        {result.meals.map((m, i) => (
          <motion.div
            key={`${m.name}-${i}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="bg-clinical-white rounded-[10px] px-3 py-2 flex items-center gap-2 max-w-full"
          >
            <span className="text-base flex-shrink-0">{m.emoji ?? '🍽️'}</span>
            <span className="text-body text-clinical-charcoal text-sm font-medium leading-snug">{m.name}</span>
          </motion.div>
        ))}
      </div>

      {/* Browse-all jumper — scrolls down to the existing meal list */}
      {browseAnchorId && (
        <button
          onClick={handleBrowse}
          className="text-precision text-[0.65rem] text-[#D4A574] font-bold tracking-widest uppercase hover:underline flex items-center gap-1"
        >
          Browse all {meals.length} meals
          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
        </button>
      )}
    </motion.div>
  );
};
