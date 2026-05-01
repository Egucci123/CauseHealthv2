// src/components/progress/AdherenceHero.tsx
//
// Top-of-Progress hero. Replaces the old 3 stat tiles with a single
// "Are you actually doing the protocol?" score that drives behavior.
//
// Math:
//   • Days into plan = floor((today - plan.generated_at) / day)
//   • Expected days  = clamp(days_into_plan, 1, 84)   // 12 weeks max
//   • Check-in adherence = unique-days-with-entries / expected
//   • Supplement adherence = (sum across all supplements of taken-days) / (expected × supplement_count)
//   • Overall = average of the two (50/50 weight)
//
// Pure component. Pulls progress entries + supplement compliance from hooks.
// Renders nothing if no plan yet (hides itself gracefully).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProgressEntries } from '../../hooks/useProgress';
import { useWellnessPlan } from '../../hooks/useWellnessPlan';

const WEEK_LABEL = (week: number): string => {
  if (week <= 3) return 'Easy mode — building the habit';
  if (week <= 6) return 'Step it up — momentum building';
  if (week <= 9) return 'Home stretch — protocol working';
  return "You've got this — final push";
};

const SCORE_COLOR = (pct: number): { color: string; tone: string } => {
  if (pct >= 80) return { color: '#1B4332', tone: 'On track' };
  if (pct >= 60) return { color: '#D4A574', tone: 'Close — small slips' };
  if (pct >= 40) return { color: '#E8922A', tone: 'Slipping — recommit' };
  return { color: '#C94F4F', tone: 'Off plan — restart this week' };
};

export const AdherenceHero = () => {
  const userId = useAuthStore(s => s.user?.id);
  const { data: plan } = useWellnessPlan();
  const { data: entries = [] } = useProgressEntries(90);

  // All compliance rows since plan started (not just today).
  // Used to compute supplement adherence over the plan period.
  const { data: complianceRows } = useQuery({
    queryKey: ['compliance-rows-progress-hero', userId, plan?.generated_at],
    enabled: !!userId && !!plan?.generated_at,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplement_compliance')
        .select('taken_date, supplement_name, taken')
        .eq('user_id', userId!)
        .gte('taken_date', plan!.generated_at!.slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });

  // Plan not generated yet — hide the hero (skeleton lives in parent).
  if (!plan?.generated_at) return null;

  const planStart = new Date(plan.generated_at);
  const today = new Date();
  const daysIntoPlan = Math.max(1, Math.floor((today.getTime() - planStart.getTime()) / 86_400_000));
  const weekNumber = Math.min(12, Math.max(1, Math.floor(daysIntoPlan / 7) + 1));
  const daysRemaining = Math.max(0, 84 - daysIntoPlan);

  // Days that have already ENDED (excluding today). Today is partial — counting
  // it would unfairly penalize users for not having tapped supplements yet.
  // Scoring window = days fully elapsed, capped at 12 weeks.
  const completedDays = Math.min(Math.max(0, daysIntoPlan - 1), 84);

  // Check-in adherence: unique calendar days with at least one entry,
  // measured against completed days only (today doesn't count yet).
  const uniqueCheckInDays = new Set(
    entries.map(e => e.logged_at?.slice(0, 10)).filter(Boolean)
  ).size;
  const checkInPct = completedDays > 0
    ? Math.min(100, Math.round((uniqueCheckInDays / completedDays) * 100))
    : 100;

  // Supplement adherence — same: only score against completed days.
  const supplementCount = Array.isArray(plan.supplement_stack) ? plan.supplement_stack.length : 0;
  const takenPairs = (complianceRows ?? []).filter((r: any) => r.taken).length;
  const expectedPairs = supplementCount * completedDays;
  const supplementPct = expectedPairs > 0
    ? Math.min(100, Math.round((takenPairs / expectedPairs) * 100))
    : 100;

  const overallPct = supplementCount > 0
    ? Math.round((checkInPct + supplementPct) / 2)
    : checkInPct;

  // Day 1-3: skip the score — it's noise this early. Show an "onboarding"
  // hero with clear next-action callouts instead. Score appears at day 4
  // when there's actually data to compare against.
  const showScore = daysIntoPlan >= 4;
  const cfg = SCORE_COLOR(overallPct);

  return (
    <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
      <div className="flex items-center justify-between mb-1">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574]">
          Day {daysIntoPlan} of 84 · Week {weekNumber} of 12 · {daysRemaining} left
        </p>
      </div>
      <h2 className="text-authority text-2xl md:text-3xl text-on-surface font-bold leading-tight mb-1">
        {showScore ? WEEK_LABEL(weekNumber) : 'Just getting started — log your first habits.'}
      </h2>
      <p className="text-body text-on-surface-variant text-sm mb-6 max-w-2xl">
        {showScore
          ? 'How well are you doing what your protocol asks for? Adherence drives whether your projected lab improvements actually show up at retest.'
          : "Tap your supplements below as you take them and log a check-in each day. Your adherence score appears at day 4 once you've got real data going."}
      </p>

      {showScore ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
          {/* Big score */}
          <div className="text-center md:text-left md:col-span-1">
            <div className="inline-flex items-baseline gap-2">
              <span className="text-authority font-bold leading-none" style={{ color: cfg.color, fontSize: 'clamp(3.5rem, 10vw, 5rem)' }}>
                {overallPct}
              </span>
              <span className="text-authority text-2xl text-on-surface-variant font-bold">%</span>
            </div>
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase mt-1" style={{ color: cfg.color }}>
              {cfg.tone}
            </p>
          </div>

          {/* Sub-metrics */}
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <SubMetric
              icon="edit_note"
              label="Daily Check-ins"
              valueText={`${uniqueCheckInDays}/${completedDays}`}
              pct={checkInPct}
            />
            <SubMetric
              icon="medication"
              label="Supplements"
              valueText={
                supplementCount > 0
                  ? `${takenPairs}/${expectedPairs}`
                  : '— add a plan'
              }
              pct={supplementPct}
              disabled={supplementCount === 0}
            />
          </div>
        </div>
      ) : (
        // Onboarding mode (Day 1-3): show simple progress callouts instead
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StarterCallout
            icon="edit_note"
            label="Today's check-in"
            done={uniqueCheckInDays > 0}
            doneText={`Logged · ${uniqueCheckInDays} day${uniqueCheckInDays === 1 ? '' : 's'} so far`}
            todoText="Scroll down and log how you're feeling today."
          />
          <StarterCallout
            icon="medication"
            label="Today's supplements"
            done={(complianceRows ?? []).some((r: any) => r.taken && r.taken_date === today.toISOString().slice(0, 10))}
            doneText={`${takenPairs} marked taken so far`}
            todoText={supplementCount > 0
              ? `Tap each of your ${supplementCount} supplements as you take them today.`
              : 'Add a wellness plan first — supplements appear automatically.'}
          />
        </div>
      )}
    </div>
  );
};

const StarterCallout = ({
  icon, label, done, doneText, todoText,
}: {
  icon: string; label: string; done: boolean; doneText: string; todoText: string;
}) => (
  <div className="bg-[#1C1B1B] rounded-[10px] p-4 flex items-start gap-3">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${done ? 'bg-primary-container/20' : 'bg-[#D4A574]/15'}`}>
      <span className={`material-symbols-outlined text-[18px] ${done ? 'text-primary-container' : 'text-[#D4A574]'}`}>
        {done ? 'check_circle' : icon}
      </span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-on-surface-variant mb-1">{label}</p>
      <p className={`text-body text-sm leading-snug ${done ? 'text-on-surface' : 'text-on-surface-variant'}`}>
        {done ? doneText : todoText}
      </p>
    </div>
  </div>
);

const SubMetric = ({
  icon, label, valueText, pct, disabled,
}: {
  icon: string; label: string; valueText: string; pct: number; disabled?: boolean;
}) => {
  const barColor = pct >= 80 ? '#1B4332' : pct >= 60 ? '#D4A574' : pct >= 40 ? '#E8922A' : '#C94F4F';
  return (
    <div className={`bg-[#1C1B1B] rounded-[10px] p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-[#D4A574] text-[16px]">{icon}</span>
        <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-on-surface-variant">{label}</span>
      </div>
      <p className="text-authority text-xl text-on-surface font-bold mb-2">{valueText}</p>
      <div className="h-1.5 w-full bg-[#2A2A2A] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  );
};
