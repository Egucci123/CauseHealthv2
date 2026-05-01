// src/components/progress/AdherenceHero.tsx
//
// Bright hero card for /progress. Matches the visual language of the
// Dashboard's Health Score Ring + Wellness Plan: light cream-white surface,
// bright green/gold accents, circular progress ring as the focal point.
//
// Two display modes:
//   • Day 1-3 onboarding: cream card with action callouts ("Just getting started")
//   • Day 4+ scoring:     bright score ring + sub-metric stat tiles
//
// Math:
//   • completed_days = days fully elapsed (today doesn't penalize partial logging)
//   • check-in adherence = unique-days-with-entries / completed_days
//   • supplement adherence = taken-pairs / (supplement_count × completed_days)
//   • overall = average of the two

import { useEffect, useRef, useState } from 'react';
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

const TONE = (pct: number): { color: string; tone: string } => {
  if (pct >= 80) return { color: '#1B4332', tone: 'On track' };
  if (pct >= 60) return { color: '#5E8C61', tone: 'Mostly there' };
  if (pct >= 40) return { color: '#D4A574', tone: 'Half on, half off' };
  return { color: '#E8922A', tone: "Off plan — let's recommit" };
};

// Animated circular progress ring — same animation pattern as HealthScoreRing.
const ProgressRing = ({ pct, color }: { pct: number; color: string }) => {
  const [animated, setAnimated] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const target = pct;
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(Math.round(target * eased));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pct]);

  const size = 144;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E8E3DB" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-authority text-4xl font-bold text-clinical-charcoal leading-none">{animated}</span>
        <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wider uppercase mt-1">% adherence</span>
      </div>
    </div>
  );
};

const StatTile = ({
  icon, label, valueText, pct, color, disabled,
}: {
  icon: string; label: string; valueText: string; pct: number; color: string; disabled?: boolean;
}) => (
  <div className={`bg-clinical-cream/40 rounded-[12px] p-4 ${disabled ? 'opacity-60' : ''}`}>
    <div className="flex items-center gap-2 mb-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
        <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
      </div>
      <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone">{label}</span>
    </div>
    <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2 leading-none">{valueText}</p>
    <div className="h-1.5 w-full bg-clinical-cream rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  </div>
);

const StarterCallout = ({
  icon, label, done, doneText, todoText, accent,
}: {
  icon: string; label: string; done: boolean; doneText: string; todoText: string; accent: string;
}) => (
  <div className="bg-clinical-cream/40 rounded-[12px] p-4 flex items-start gap-3">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: done ? `#1B433215` : `${accent}15` }}>
      <span className="material-symbols-outlined text-[18px]" style={{ color: done ? '#1B4332' : accent }}>
        {done ? 'check_circle' : icon}
      </span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone mb-1">{label}</p>
      <p className={`text-body text-sm leading-snug ${done ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>
        {done ? doneText : todoText}
      </p>
    </div>
  </div>
);

export const AdherenceHero = () => {
  const userId = useAuthStore(s => s.user?.id);
  const { data: plan } = useWellnessPlan();
  const { data: entries = [] } = useProgressEntries(90);

  const { data: complianceRows } = useQuery({
    queryKey: ['compliance-rows-progress-hero', userId, plan?.generated_at],
    enabled: !!userId && !!plan?.generated_at,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
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

  if (!plan?.generated_at) return null;

  const planStart = new Date(plan.generated_at);
  const today = new Date();
  const daysIntoPlan = Math.max(1, Math.floor((today.getTime() - planStart.getTime()) / 86_400_000));
  const weekNumber = Math.min(12, Math.max(1, Math.floor(daysIntoPlan / 7) + 1));
  const daysRemaining = Math.max(0, 84 - daysIntoPlan);
  const completedDays = Math.min(Math.max(0, daysIntoPlan - 1), 84);

  const uniqueCheckInDays = new Set(
    entries.map(e => e.logged_at?.slice(0, 10)).filter(Boolean)
  ).size;
  const checkInPct = completedDays > 0
    ? Math.min(100, Math.round((uniqueCheckInDays / completedDays) * 100))
    : 100;

  const supplementCount = Array.isArray(plan.supplement_stack) ? plan.supplement_stack.length : 0;
  const takenPairs = (complianceRows ?? []).filter((r: any) => r.taken).length;
  const expectedPairs = supplementCount * completedDays;
  const supplementPct = expectedPairs > 0
    ? Math.min(100, Math.round((takenPairs / expectedPairs) * 100))
    : 100;

  const overallPct = supplementCount > 0
    ? Math.round((checkInPct + supplementPct) / 2)
    : checkInPct;

  const showScore = daysIntoPlan >= 4;
  const cfg = TONE(overallPct);

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card p-6">
      {/* Top label strip */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-container/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-container text-[16px]">trending_up</span>
          </div>
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone">
            Day {daysIntoPlan} of 84
          </p>
        </div>
        <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wide">
          Week {weekNumber} of 12 · {daysRemaining} days left
        </span>
      </div>

      {/* Headline + sub */}
      <h2 className="text-authority text-2xl md:text-3xl text-clinical-charcoal font-bold leading-tight mb-1.5">
        {showScore ? WEEK_LABEL(weekNumber) : 'Just getting started'}
      </h2>
      <p className="text-body text-clinical-stone text-sm mb-5 leading-relaxed max-w-2xl">
        {showScore
          ? 'How well are you doing what your protocol asks for? Adherence drives whether your projected lab improvements actually show up at retest.'
          : "Tap your supplements below as you take them and log a check-in each day. Your adherence score appears at day 4 once we've got real data going."}
      </p>

      {showScore ? (
        <div className="flex flex-col md:flex-row items-center md:items-stretch gap-5">
          {/* Score ring */}
          <div className="flex flex-col items-center md:items-start">
            <ProgressRing pct={overallPct} color={cfg.color} />
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase mt-3" style={{ color: cfg.color }}>
              {cfg.tone}
            </p>
          </div>

          {/* Sub-metric tiles */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 md:self-center">
            <StatTile
              icon="edit_note"
              label="Daily Check-ins"
              valueText={`${uniqueCheckInDays}/${completedDays}`}
              pct={checkInPct}
              color="#1B4332"
            />
            <StatTile
              icon="medication"
              label="Supplements"
              valueText={supplementCount > 0 ? `${takenPairs}/${expectedPairs}` : '—'}
              pct={supplementPct}
              color="#D4A574"
              disabled={supplementCount === 0}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StarterCallout
            icon="edit_note"
            label="Today's check-in"
            done={uniqueCheckInDays > 0}
            doneText={`Logged · ${uniqueCheckInDays} day${uniqueCheckInDays === 1 ? '' : 's'} so far`}
            todoText="Scroll down and log how you're feeling today."
            accent="#1B4332"
          />
          <StarterCallout
            icon="medication"
            label="Today's supplements"
            done={(complianceRows ?? []).some((r: any) => r.taken && r.taken_date === today.toISOString().slice(0, 10))}
            doneText={`${takenPairs} marked taken so far`}
            todoText={supplementCount > 0
              ? `Tap each of your ${supplementCount} supplements as you take them today.`
              : 'Add a wellness plan first — supplements appear automatically.'}
            accent="#D4A574"
          />
        </div>
      )}
    </div>
  );
};
