// src/pages/wellness/WellnessPlanPage.tsx
// Visual-first redesign — Today / Eat / Move / Take primary tabs, full Plan behind a Details tab.
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { FolderSection } from '../../components/ui/FolderSection';
import { LifestyleInterventions } from '../../components/wellness/LifestyleInterventions';
import { ActionPlan } from '../../components/wellness/ActionPlan';
import { PossibleConditions } from '../../components/wellness/PossibleConditions';
import { InteractionWarnings } from '../../components/wellness/InteractionWarnings';
import { TransformationForecast } from '../../components/wellness/TransformationForecast';
import { useWellnessPlan, useGenerateWellnessPlan } from '../../hooks/useWellnessPlan';
import { useLatestLabDraw, useLatestLabValues } from '../../hooks/useLabData';
import { buildForecasts } from '../../lib/transformationForecast';
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { useAuthStore } from '../../store/authStore';
import { exportWellnessPlanPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

type TabKey = 'today' | 'eat' | 'move' | 'take';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'eat', label: 'Food Playbook', icon: 'restaurant' },
  { key: 'move', label: 'Move', icon: 'directions_run' },
  { key: 'take', label: 'Take', icon: 'medication' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const WellnessSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-24 bg-[#E8E3DB] rounded-[10px]" />
    {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-[#E8E3DB] rounded-[10px]" />)}
  </div>
);

const GeneratingState = () => (
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
    <div className="w-16 h-16 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-6">
      <span className="material-symbols-outlined text-primary-container text-3xl animate-pulse">favorite</span>
    </div>
    <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Building your plan…</p>
    <p className="text-body text-clinical-stone max-w-sm mx-auto leading-relaxed">Reading your labs, screening drug interactions, building your differential. About 90–180 seconds.</p>
    <div className="flex gap-2 justify-center mt-6">
      {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary-container animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />)}
    </div>
  </div>
);

const EmptyState = ({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) => (
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
    <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">favorite</span>
    <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Build your plan</p>
    <p className="text-body text-clinical-stone mb-6 max-w-sm mx-auto leading-relaxed">3 things to do today. A weekly food list. A workout schedule. Your supplements. All from your labs.</p>
    <Button variant="primary" size="lg" loading={loading} onClick={onGenerate} icon="auto_awesome">Build My Plan</Button>
  </div>
);

const MILESTONES_INLINE: { week: number; emoji: string; label: string }[] = [
  { week: 2, emoji: '⚡', label: 'Energy crashes start lifting' },
  { week: 4, emoji: '🩸', label: 'Triglycerides starting to drop' },
  { week: 6, emoji: '☀️', label: 'Vitamin D approaching target' },
  { week: 8, emoji: '🫀', label: 'Liver enzymes visibly improving' },
  { week: 10, emoji: '🔥', label: 'Inflammation should be calmer' },
  { week: 12, emoji: '🧪', label: 'Time to retest — full readout' },
];

// ── Today Tab ──────────────────────────────────────────────────────────────────
// Storage shape v2: { history: { [YYYY-MM-DD]: number[] } } keeping last 60 days.
// v1 was { date, done } and lost history when date rolled over. We migrate on read.
type ProgressHistory = Record<string, number[]>;

const loadHistory = (key: string): ProgressHistory => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.history) return parsed.history as ProgressHistory;
    // v1 migration: { date, done } -> { history: { [date]: done } }
    if (parsed?.date && Array.isArray(parsed?.done)) {
      const migrated: ProgressHistory = { [parsed.date]: parsed.done };
      localStorage.setItem(key, JSON.stringify({ history: migrated }));
      return migrated;
    }
  } catch { /* ignore */ }
  return {};
};

const saveHistory = (key: string, history: ProgressHistory) => {
  // Keep last 60 days only
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const trimmed: ProgressHistory = {};
  for (const [d, list] of Object.entries(history)) {
    if (d >= cutoff) trimmed[d] = list;
  }
  try { localStorage.setItem(key, JSON.stringify({ history: trimmed })); } catch { /* quota */ }
};

// Compute consecutive days ending today where at least one action was checked.
function computeStreak(history: ProgressHistory): number {
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const list = history[d];
    if (list && list.length > 0) streak++;
    else if (i === 0) {
      // No checks today — still allow yesterday-counting (don't break streak before user has checked today)
      continue;
    } else break;
  }
  return streak;
}

// Days this week (Mon-Sun) with at least one check.
function weekCompletion(history: ProgressHistory): { done: number; total: number } {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = Mon
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  let done = 0;
  for (let i = 0; i <= dow; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    if ((history[k]?.length ?? 0) > 0) done++;
  }
  return { done, total: dow + 1 };
}

const TodayTab = ({ plan, uid }: { plan: any; uid: string }) => {
  const actions = (plan.today_actions ?? []).slice(0, 3);
  const key = `today_progress_${uid}`;
  const [history, setHistory] = useState<ProgressHistory>({});
  const today = todayKey();
  const done = history[today] ?? [];

  useEffect(() => {
    setHistory(loadHistory(key));
  }, [key]);

  const toggle = (i: number) => {
    setHistory(prev => {
      const todayList = prev[today] ?? [];
      const nextTodayList = todayList.includes(i)
        ? todayList.filter(d => d !== i)
        : [...todayList, i];
      const next = { ...prev, [today]: nextTodayList };
      saveHistory(key, next);
      return next;
    });
  };

  const streak = useMemo(() => computeStreak(history), [history]);
  const week = useMemo(() => weekCompletion(history), [history]);

  // Compute current week of 12 from plan generation
  const planWeek = useMemo(() => {
    if (!plan?.generated_at) return null;
    const days = Math.floor((Date.now() - new Date(plan.generated_at).getTime()) / 86_400_000);
    return { week: Math.max(1, Math.min(12, Math.floor(days / 7) + 1)), days };
  }, [plan?.generated_at]);

  const nextMilestone = useMemo(() => {
    if (!planWeek) return null;
    const m = MILESTONES_INLINE.find((x) => x.week >= planWeek.week) ?? MILESTONES_INLINE[MILESTONES_INLINE.length - 1];
    return { ...m, daysUntil: Math.max(0, m.week * 7 - planWeek.days) };
  }, [planWeek]);

  if (actions.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get today's 3 actions.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Week milestone strip — same as dashboard TodayCard */}
      {planWeek && nextMilestone && (
        <div className="bg-clinical-cream/40 rounded-[10px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone">
              Week {planWeek.week} of 12
            </span>
            <span className="text-precision text-[0.6rem] text-clinical-stone">
              Next milestone in {nextMilestone.daysUntil} day{nextMilestone.daysUntil === 1 ? '' : 's'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-clinical-stone/15 overflow-hidden mb-2">
            <div className="h-full bg-primary-container transition-all" style={{ width: `${(planWeek.week / 12) * 100}%` }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{nextMilestone.emoji}</span>
            <span className="text-precision text-[0.65rem] text-clinical-charcoal">{nextMilestone.label}</span>
          </div>
        </div>
      )}

      {/* Habit streak + week summary — appears once user has any check-off history */}
      {(streak > 0 || week.done > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[10px] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[8px] bg-[#D4A574]/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#D4A574] text-[20px]">local_fire_department</span>
            </div>
            <div>
              <p className="text-authority text-2xl font-bold text-[#D4A574] leading-none">{streak}</p>
              <p className="text-precision text-[0.7rem] text-on-surface-variant tracking-widest uppercase mt-1">{streak === 1 ? 'day' : 'days'} in a row</p>
            </div>
          </div>
          <div className="bg-clinical-cream rounded-[10px] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[8px] bg-primary-container/15 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary-container text-[20px]">date_range</span>
            </div>
            <div>
              <p className="text-authority text-2xl font-bold text-clinical-charcoal leading-none">{week.done}<span className="text-precision text-sm text-clinical-stone">/{week.total}</span></p>
              <p className="text-precision text-[0.7rem] text-clinical-stone tracking-widest uppercase mt-1">this week</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-body text-clinical-stone text-sm">3 things. Start with one. Check it off.</p>
      {actions.map((a: any, i: number) => {
        const isDone = done.includes(i);
        return (
          <button key={i} onClick={() => toggle(i)} className={`w-full flex items-center gap-4 p-5 rounded-[10px] border text-left transition-all ${isDone ? 'bg-primary-container/10 border-primary-container/30' : 'bg-clinical-white border-outline-variant/15 hover:border-primary-container/30'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-primary-container border-primary-container' : 'border-clinical-stone/30'}`}>
              {isDone && <span className="material-symbols-outlined text-white text-[20px]">check</span>}
            </div>
            <span className="text-3xl flex-shrink-0">{a.emoji || '•'}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-body text-base font-semibold ${isDone ? 'text-clinical-stone line-through' : 'text-clinical-charcoal'}`}>{a.action}</p>
              {a.why && <p className="text-precision text-[0.7rem] text-clinical-stone mt-0.5">{a.why}</p>}
            </div>
          </button>
        );
      })}

      {/* Pivot May 2026: Lifestyle Interventions, 90-Day Action Plan, and the
          retest markers list moved OUT of the Today tab and into top-level
          sections on the main page. Today now ONLY shows 3 actions + week
          progress + streak. Less crowded. */}
    </div>
  );
};

// ── Eat Tab ────────────────────────────────────────────────────────────────────
// Static set of trusted outbound recipe sites — same for every user. We don't
// curate recipes; we point users at sites that already do that well. Picked for
// breadth (Mediterranean, low-carb, simple weeknight) and reputation (NYT Cooking,
// EatingWell, Bon Appétit, Mediterranean Dish, Skinnytaste, Budget Bytes).
const RECIPE_LINKS: { label: string; subtitle: string; url: string }[] = [
  { label: 'NYT Cooking',          subtitle: 'Best general recipe library on the internet', url: 'https://cooking.nytimes.com/' },
  { label: 'EatingWell',           subtitle: 'Free recipes filtered by health condition + diet', url: 'https://www.eatingwell.com/' },
  { label: 'The Mediterranean Dish', subtitle: 'The gold standard for Mediterranean cooking',   url: 'https://www.themediterraneandish.com/' },
  { label: 'Skinnytaste',          subtitle: 'Lower-calorie weeknight recipes with macros',     url: 'https://www.skinnytaste.com/' },
  { label: 'Budget Bytes',         subtitle: 'Cheap, simple, real-life recipes — cost per serving', url: 'https://www.budgetbytes.com/' },
];

// Fast-food smart-orders + drive-thru hacks. Different audience than the
// recipe sites — for "I'm at the drive-thru, what do I order?" not
// "what should I cook tonight?". CauseHealth doesn't curate these
// either; Eat This, Not That has been the dedicated brand for this since
// 2007 with per-chain smart-order guides. CalorieKing is the lookup tool
// for exact macros at any chain item.
const FAST_FOOD_LINKS: { label: string; subtitle: string; url: string }[] = [
  { label: 'Eat This, Not That!',
    subtitle: 'The dedicated site for fast-food swaps + smart orders. Per-chain guides for Chick-fil-A, McDonald\'s, Wendy\'s, Wawa, Subway, Chipotle, Taco Bell, Starbucks, etc.',
    url: 'https://www.eatthis.com/category/restaurants/' },
  { label: 'CalorieKing — Restaurant Nutrition',
    subtitle: 'Look up exact calories, protein, carbs, and sodium for any item at any chain before you order.',
    url: 'https://www.calorieking.com/us/en/foods/restaurants/' },
  { label: 'Healthline — Healthy Fast Food Guide',
    subtitle: 'Medically reviewed best orders at 30+ chains (good when you want a single article instead of browsing).',
    url: 'https://www.healthline.com/nutrition/healthiest-fast-food' },
];

const EatTab = ({ plan }: { plan: any }) => {
  const pattern = plan.eating_pattern ?? null;
  const hasPattern = pattern && (pattern.name || (Array.isArray(pattern.emphasize) && pattern.emphasize.length > 0));
  if (!hasPattern) {
    return (
      <div className="space-y-4">
        <p className="text-body text-clinical-stone text-sm">Your plan didn't include an eating pattern. Hit Regenerate to refresh — newer plans always include one.</p>
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#1B423A] p-5">
          <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-stone mb-3">Trusted recipe sites</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RECIPE_LINKS.map(l => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 p-3 rounded-[8px] hover:bg-clinical-cream transition-colors">
                <span className="material-symbols-outlined text-[#D4A574] text-[18px] mt-0.5">restaurant</span>
                <div className="flex-1 min-w-0">
                  <p className="text-body text-clinical-charcoal text-sm font-semibold">{l.label}</p>
                  <p className="text-precision text-[0.65rem] text-clinical-stone">{l.subtitle}</p>
                </div>
                <span className="material-symbols-outlined text-clinical-stone text-[14px]">open_in_new</span>
              </a>
            ))}
          </div>
        </div>
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8922A] p-5">
          <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-stone mb-3">Fast-food smart orders + hacks</p>
          <div className="space-y-2">
            {FAST_FOOD_LINKS.map(l => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 p-3 rounded-[8px] hover:bg-clinical-cream transition-colors">
                <span className="material-symbols-outlined text-[#E8922A] text-[18px] mt-0.5">fastfood</span>
                <div className="flex-1 min-w-0">
                  <p className="text-body text-clinical-charcoal text-sm font-semibold">{l.label}</p>
                  <p className="text-precision text-[0.65rem] text-clinical-stone leading-snug">{l.subtitle}</p>
                </div>
                <span className="material-symbols-outlined text-clinical-stone text-[14px]">open_in_new</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const emphasize: string[] = Array.isArray(pattern.emphasize) ? pattern.emphasize : [];
  const limit: string[]     = Array.isArray(pattern.limit)     ? pattern.limit     : [];

  return (
    <div className="space-y-4">
      {/* Pattern card — the WHAT KIND of eater you should be */}
      <div className="bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[10px] p-6 shadow-card">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Your Eating Pattern</p>
        <p className="text-authority text-2xl text-on-surface font-bold leading-tight">{pattern.name || 'Whole-food balanced'}</p>
        {pattern.rationale && (
          <p className="text-body text-on-surface-variant text-sm mt-3 leading-relaxed">{pattern.rationale}</p>
        )}
      </div>

      {/* Emphasize / Limit two-up */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {emphasize.length > 0 && (
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#2A9D8F] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[#2A9D8F] text-[20px]">add_circle</span>
              <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">Lean Into</p>
            </div>
            <ul className="space-y-2">
              {emphasize.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#2A9D8F] text-sm leading-tight mt-0.5">+</span>
                  <span className="text-body text-clinical-charcoal text-sm leading-snug capitalize">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {limit.length > 0 && (
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#C94F4F] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[#C94F4F] text-[20px]">remove_circle</span>
              <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">Cut Back On</p>
            </div>
            <ul className="space-y-2">
              {limit.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#C94F4F] text-sm leading-tight mt-0.5">−</span>
                  <span className="text-body text-clinical-charcoal text-sm leading-snug capitalize">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Outbound recipe links — we're not a meal planner; we send users to real recipe sites */}
      <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#D4A574] p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#D4A574] text-[20px]">menu_book</span>
          <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">Find Recipes (when you're cooking)</p>
        </div>
        <p className="text-body text-clinical-stone text-xs mb-4 leading-relaxed">CauseHealth tells you the diet pattern. These trusted recipe sites do recipes better than any app could.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RECIPE_LINKS.map(l => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 p-3 rounded-[8px] bg-clinical-cream/50 hover:bg-clinical-cream transition-colors border border-outline-variant/10">
              <span className="material-symbols-outlined text-[#D4A574] text-[18px] mt-0.5">restaurant</span>
              <div className="flex-1 min-w-0">
                <p className="text-body text-clinical-charcoal text-sm font-semibold">{l.label}</p>
                <p className="text-precision text-[0.65rem] text-clinical-stone">{l.subtitle}</p>
              </div>
              <span className="material-symbols-outlined text-clinical-stone text-[14px]">open_in_new</span>
            </a>
          ))}
        </div>
      </div>

      {/* Fast-food smart orders + hacks — separate audience: drive-thru / convenience-store moments */}
      <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8922A] p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#E8922A] text-[20px]">fastfood</span>
          <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">Fast-Food Smart Orders + Hacks (when you're not cooking)</p>
        </div>
        <p className="text-body text-clinical-stone text-xs mb-4 leading-relaxed">For when you're at a drive-thru, gas station, or convenience store. These sites have per-chain smart-order guides + macro lookups so you can pick the order that fits your eating pattern without guessing.</p>
        <div className="space-y-2">
          {FAST_FOOD_LINKS.map(l => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 p-3 rounded-[8px] bg-clinical-cream/50 hover:bg-clinical-cream transition-colors border border-outline-variant/10">
              <span className="material-symbols-outlined text-[#E8922A] text-[18px] mt-0.5">fastfood</span>
              <div className="flex-1 min-w-0">
                <p className="text-body text-clinical-charcoal text-sm font-semibold">{l.label}</p>
                <p className="text-precision text-[0.65rem] text-clinical-stone leading-snug">{l.subtitle}</p>
              </div>
              <span className="material-symbols-outlined text-clinical-stone text-[14px]">open_in_new</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};


// ── Move Tab ───────────────────────────────────────────────────────────────────
const MoveTab = ({ plan }: { plan: any }) => {
  const workouts = plan.workouts ?? [];
  if (workouts.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get your workout schedule.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-body text-clinical-stone text-sm">Your week, blocked out. Show up — that's the whole job.</p>
      {workouts.map((w: any, i: number) => (
        <div key={i} className="bg-clinical-white border border-outline-variant/15 rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">{w.emoji || '🏃'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-body text-clinical-charcoal font-semibold">{w.title}</p>
                <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-primary-container">{w.day}</span>
                {w.duration_min && <span className="text-precision text-[0.7rem] text-clinical-stone">· {w.duration_min} min</span>}
              </div>
              <p className="text-body text-clinical-stone text-sm">{w.description}</p>
              {w.why && <p className="text-precision text-[0.65rem] text-clinical-stone mt-2 italic">{w.why}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Take Tab ───────────────────────────────────────────────────────────────────
const amazonSearchUrl = (s: any) => {
  const q = `${s.nutrient ?? ''} ${s.form ?? ''} ${s.dose ?? ''}`.replace(/\s+/g, ' ').trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
};

const CATEGORY_META: Record<string, { label: string; sub: string; icon: string; color: string }> = {
  sleep_stress: { label: 'Sleep & Stress', sub: 'Calming, sleep onset, cortisol management', icon: 'bedtime', color: '#7B1FA2' },
  gut_healing: { label: 'Gut Healing', sub: 'Mucosal repair, microbiome, digestive support', icon: 'restaurant', color: '#2A9D8F' },
  liver_metabolic: { label: 'Liver & Metabolic', sub: 'Liver enzymes, lipids, blood sugar, hepatoprotection', icon: 'water_drop', color: '#5E8C61' },
  inflammation_cardio: { label: 'Inflammation & Cardio', sub: 'Lower inflammation, support heart + lipids', icon: 'favorite', color: '#C94F4F' },
  nutrient_repletion: { label: 'Nutrient Repletion', sub: 'Fixing measurable deficiencies', icon: 'science', color: '#1B423A' },
  condition_therapy: { label: 'Condition-Specific', sub: 'Disease-mechanism therapy with strong evidence', icon: 'medication', color: '#D4A574' },
};
const CATEGORY_ORDER_SUPPS = ['nutrient_repletion', 'liver_metabolic', 'gut_healing', 'inflammation_cardio', 'condition_therapy', 'sleep_stress'];

const TakeTab = ({ plan }: { plan: any }) => {
  const supps = [...(plan.supplement_stack ?? [])];
  if (supps.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">No supplements recommended. Your plan focuses on food and movement.</p>;
  }

  // Group by category if entries have one. Fall back to flat ranked list for legacy plans.
  const hasCategories = supps.some((s: any) => !!s.category);
  const groups: { key: string; items: any[] }[] = hasCategories
    ? CATEGORY_ORDER_SUPPS
        .map(key => ({ key, items: supps.filter((s: any) => s.category === key) }))
        .filter(g => g.items.length > 0)
        .concat(
          supps.some((s: any) => !s.category)
            ? [{ key: '_uncategorized', items: supps.filter((s: any) => !s.category) }]
            : []
        )
    : [{ key: '_all', items: supps }];

  const renderCard = (s: any, i: number) => {
    const priorityColor = s.priority === 'critical' ? '#C94F4F' : s.priority === 'high' ? '#E8922A' : s.priority === 'optimize' ? '#2A9D8F' : '#D4A574';
    return (
      <div key={i} className="bg-clinical-white rounded-[10px] shadow-card overflow-hidden" style={{ borderTop: `3px solid ${priorityColor}` }}>{/* tslint:disable-line */}</div>
    );
  };
  void renderCard; // silence unused — actual card render is inline below

  return (
    <div className="space-y-4">
      <div className="bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-[10px] p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-[#B8915F] text-[20px] flex-shrink-0 mt-0.5">tips_and_updates</span>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
          Grouped by what each supplement does. Each card shows the primary recommendation; tap "Other options" for equivalent alternatives you can pick instead based on form, budget, or preference.
        </p>
      </div>

      {groups.map(({ key, items }) => {
        const meta = CATEGORY_META[key];
        return (
          <div key={key} className="space-y-3">
            {meta && (
              <div className="flex items-center gap-3 pt-2">
                <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>{meta.icon}</span>
                <div className="flex-1">
                  <p className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-clinical-charcoal">{meta.label}</p>
                  <p className="text-precision text-[0.6rem] text-clinical-stone">{meta.sub}</p>
                </div>
              </div>
            )}
            {items.map((s: any, i: number) => {
        const priorityColor = s.priority === 'critical' ? '#C94F4F' : s.priority === 'high' ? '#E8922A' : s.priority === 'optimize' ? '#2A9D8F' : '#D4A574';
        return (
          <div key={i} className="bg-clinical-white rounded-[10px] shadow-card overflow-hidden" style={{ borderTop: `3px solid ${priorityColor}` }}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-[10px] bg-gradient-to-br from-[#1B423A] to-[#0F2A24] flex items-center justify-center flex-shrink-0 shadow-card">
                  <span className="text-[18px] leading-none">{s.emoji ?? '💊'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <p className="text-body text-clinical-charcoal font-semibold leading-tight">{s.nutrient}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {s.priority && (
                        <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase px-2 py-0.5 rounded" style={{ backgroundColor: `${priorityColor}20`, color: priorityColor }}>
                          {s.priority}
                        </span>
                      )}
                      <a
                        href={amazonSearchUrl(s)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Find on Amazon"
                        aria-label={`Find ${s.nutrient} on Amazon`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-clinical-cream hover:bg-[#D4A574]/20 text-clinical-charcoal hover:text-[#1B423A] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                      </a>
                    </div>
                  </div>
                  {s.form && <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{s.form}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="bg-clinical-cream rounded-lg p-3">
                  <p className="text-precision text-[0.7rem] text-clinical-stone uppercase tracking-widest mb-0.5">Dose</p>
                  <p className="text-body text-clinical-charcoal text-sm font-medium break-words">{s.dose}</p>
                </div>
                <div className="bg-clinical-cream rounded-lg p-3">
                  <p className="text-precision text-[0.7rem] text-clinical-stone uppercase tracking-widest mb-0.5">When</p>
                  <p className="text-body text-clinical-charcoal text-sm font-medium break-words">{s.timing}</p>
                </div>
              </div>
              {(s.why_short || s.why) && <p className="text-body text-clinical-stone text-xs mt-3 italic leading-relaxed">{s.why_short || s.why}</p>}
              {s.practical_note && (
                <div className="mt-3 flex items-start gap-2 bg-clinical-cream/60 rounded-md px-3 py-2 border-l-2 border-[#D4A574]">
                  <span className="material-symbols-outlined text-[#D4A574] text-[14px] flex-shrink-0 mt-0.5">tips_and_updates</span>
                  <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{s.practical_note}</p>
                </div>
              )}
              {Array.isArray(s.alternatives) && s.alternatives.length > 0 && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer flex items-center gap-1.5 text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone hover:text-clinical-charcoal transition-colors list-none">
                    <span className="material-symbols-outlined text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
                    Other options ({s.alternatives.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {s.alternatives.map((alt: any, ai: number) => (
                      <div key={ai} className="bg-clinical-cream/40 rounded-md px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-body text-clinical-charcoal text-xs font-semibold">{alt.name}</span>
                          {alt.form && <span className="text-precision text-[0.7rem] text-clinical-stone tracking-wide">· {alt.form}</span>}
                        </div>
                        {alt.note && <p className="text-body text-clinical-stone text-xs leading-snug">{alt.note}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        );
            })}
          </div>
        );
      })}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export const WellnessPlanPage = () => {
  const { profile, user } = useAuthStore();
  const { data: plan} = useWellnessPlan();
  const { generate, generating } = useGenerateWellnessPlan();
  const { data: latestDraw } = useLatestLabDraw();
  const { data: latestValues } = useLatestLabValues();
  const [tab, setTab] = useState<TabKey>('today');

  const forecasts = (latestValues && latestValues.length > 0) ? buildForecasts(latestValues as any) : [];

  const planCreatedAt = (plan as any)?._createdAt ? new Date((plan as any)._createdAt) : null;
  const drawCreatedAt = latestDraw?.createdAt ? new Date(latestDraw.createdAt) : null;
  const hasNewerLabs = plan && planCreatedAt && drawCreatedAt && drawCreatedAt > planCreatedAt;

  // Plan week (1-12+) — used to surface the retest CTA at week 10+
  const planWeek = useMemo(() => {
    if (!plan?.generated_at) return null;
    const days = Math.floor((Date.now() - new Date(plan.generated_at).getTime()) / 86_400_000);
    return Math.max(1, Math.floor(days / 7) + 1);
  }, [plan?.generated_at]);
  const showRetestCTA = planWeek != null && planWeek >= 10 && !hasNewerLabs;

  const [genError, setGenError] = useState<string | null>(null);
  const handleGenerate = () => {
    setGenError(null);
    generate().catch(err => {
      console.error('[WellnessPlan] Generation error:', err);
      setGenError(err?.message ?? 'Generation failed. Please try again.');
    });
  };

  const handleExportPDF = () => {
    if (!plan) return;
    exportWellnessPlanPDF(plan, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  return (
    <AppShell pageTitle="Wellness Plan">
      {/* Plan undefined = loading. Plan null = no plan generated yet. */}
      {plan === undefined ? <WellnessSkeleton />
        : generating ? <GeneratingState />
        : !plan ? (
          <PaywallGate
            feature="Wellness Plan"
            description="Personalized 90-day plan from your labs. Today actions, meals, workouts, supplements, retest schedule, transformation forecast."
          >
            <EmptyState onGenerate={handleGenerate} loading={generating} />
          </PaywallGate>
        )
        : (
        <div className="space-y-5">
          {/* Headline + actions */}
          <div className="bg-[#131313] rounded-[10px] p-6">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-precision text-[0.6rem] font-bold text-on-surface-variant tracking-widest uppercase mb-2">Your Plan</p>
                <p className="text-authority text-2xl text-on-surface font-bold leading-tight">{plan.headline || plan.summary?.split('.')[0] || 'Your personalized plan'}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {plan.plan_mode === 'optimization' && (
                  <span className="text-precision text-[0.7rem] font-bold px-2 py-0.5 bg-[#2A9D8F] text-white rounded">LONGEVITY</span>
                )}
                <button
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-1.5 bg-white/10 hover:bg-white/20 text-on-surface rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">download</span>
                  PDF
                </button>
                <button
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-1.5 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Regenerate
                </button>
              </div>
            </div>
            <p className="text-body text-on-surface-variant text-sm leading-relaxed">{plan.summary}</p>
            <p className="text-precision text-[0.7rem] text-on-surface-variant/60 mt-3">Generated {plan.generated_at ? format(new Date(plan.generated_at), 'MMM d, yyyy') : 'recently'}</p>
            {genError && (
              <div className="mt-4 bg-[#C94F4F]/15 border border-[#C94F4F]/40 rounded-[8px] p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-[#FF8A8A] text-[18px] flex-shrink-0 mt-0.5">error</span>
                <p className="text-body text-[#FFD0D0] text-sm leading-snug">{genError}</p>
              </div>
            )}
          </div>

          {/* Transformation forecast — pure math, big motivation */}
          {forecasts.length > 0 && <TransformationForecast forecasts={forecasts} />}

          {/* Single unified test list — re-measures + new tests in one folder.
              The split into 'retest' vs 'new tests' was a UX experiment that
              tested poorly: users had to mentally merge two lists. Now ONE
              comprehensive list of every test to ask for at the 12-week visit. */}
          {/* Tests grouped by specialist. Each folder is the focused, defensible
              list for that visit — PCP gets the basics, GI gets UC-relevant
              tests, cardiology gets ApoB/Lp(a), etc. The user walks in to each
              specialist with a list that doesn't feel "extreme" and is paired
              with the right ICD-10. */}
          {(() => {
            const validRetests = (plan.retest_timeline ?? []).filter(
              (r: any) => typeof r?.marker === 'string' && r.marker.trim().length > 0,
            );
            if (validRetests.length === 0) return null;

            const SPECIALIST_META: Record<string, { title: string; explanation: string; icon: string; accent: string }> = {
              pcp:            { title: 'For your PCP visit',         icon: 'medical_services',  accent: '#1B423A', explanation: 'The basics any primary care doctor will order at your 12-week follow-up. All insurance-covered with the ICD-10 codes paired here.' },
              gi:             { title: 'For your GI doctor',          icon: 'restaurant',         accent: '#8B6F47', explanation: 'Tests your gastroenterologist orders. Bring this list to your UC follow-up — most are covered with K51.90 / K50.90.' },
              hepatology:     { title: 'For a hepatology referral',   icon: 'medication',         accent: '#5C8FA8', explanation: 'Liver-specific tests. If your PCP sees ALT remains elevated, ask for a hepatology referral and bring this list.' },
              cardiology:     { title: 'For preventive cardiology',   icon: 'monitor_heart',      accent: '#C94F4F', explanation: 'Advanced lipid + cardiovascular risk markers. Some PCPs order these; if not, ask for a cardiology referral.' },
              endocrinology:  { title: 'For an endocrinologist',      icon: 'biotech',            accent: '#7B5CA0', explanation: 'Full thyroid panel, hormone, and adrenal workup. PCPs often only order TSH — these go deeper.' },
              sleep_medicine: { title: 'For a sleep medicine referral', icon: 'bedtime',          accent: '#3D4F6A', explanation: 'Sleep study to evaluate apnea and oxygenation. Most insurances cover this with snoring, fatigue, or polycythemia documented.' },
              rheumatology:   { title: 'For a rheumatology referral', icon: 'health_and_safety',  accent: '#A0563D', explanation: 'Autoimmune workup tests. Ask your PCP for a referral if joint symptoms persist or autoimmune dx is suspected.' },
              nephrology:     { title: 'For a nephrology referral',   icon: 'water_drop',         accent: '#4A7C8D', explanation: 'Advanced kidney function tests. Refer if eGFR persistently abnormal.' },
              hematology:     { title: 'For a hematology referral',   icon: 'opacity',            accent: '#8E2A2A', explanation: 'Advanced blood disorder workup. For unexplained CBC patterns or rule-outs.' },
              functional:     { title: 'For a functional medicine doctor', icon: 'spa',           accent: '#5F7A4D', explanation: "Tests most PCPs don't order routinely. If your PCP declines, a functional medicine MD or naturopathic doctor will run these — often with cash-pay options under $100." },
              imaging:        { title: 'Imaging to consider',         icon: 'visibility',         accent: '#6B6B6B', explanation: 'Non-blood tests — ultrasound, FibroScan, sleep study, CAC. These need a separate order or referral; insurance coverage varies by indication.' },
              mental_health:  { title: 'Mental health screening',     icon: 'psychology',         accent: '#7B6FA0', explanation: 'Standard screening tools your PCP can administer in 5 minutes during a visit.' },
            };

            const groups: Record<string, any[]> = {};
            for (const r of validRetests) {
              const key = (r.specialist ?? 'pcp') as string;
              (groups[key] ??= []).push(r);
            }
            const order: string[] = ['pcp', 'gi', 'hepatology', 'cardiology', 'endocrinology', 'sleep_medicine', 'rheumatology', 'nephrology', 'hematology', 'functional', 'imaging', 'mental_health'];

            return (
              <>
                {order.filter(k => groups[k]?.length).map((k) => {
                  const meta = SPECIALIST_META[k] ?? SPECIALIST_META.pcp;
                  const items = groups[k];
                  return (
                    <FolderSection
                      key={k}
                      icon={meta.icon}
                      title={meta.title}
                      count={items.length}
                      countLabel={items.length === 1 ? 'test' : 'tests'}
                      explanation={meta.explanation}
                      accentColor={meta.accent}
                      defaultOpen={k === 'pcp'}
                    >
                      <div className="space-y-2">
                        {items.map((r: any, i: number) => (
                          <div key={i} className="bg-clinical-cream/40 rounded-[8px] p-3">
                            <div className="flex items-start gap-2">
                              <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5" style={{ color: meta.accent }}>science</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight">{r.marker}</p>
                                  {r.icd10 && (
                                    <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wider px-1.5 py-0.5 bg-clinical-white border border-clinical-cream" style={{ borderRadius: '2px' }}>
                                      ICD-10 · {r.icd10}
                                    </span>
                                  )}
                                </div>
                                {r.why && <p className="text-precision text-[0.65rem] text-clinical-stone mt-1 leading-snug">{r.why}</p>}
                                {r.insurance_note && (
                                  <p className="text-precision text-[0.6rem] text-clinical-stone/80 mt-1 italic leading-snug">{r.insurance_note}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </FolderSection>
                  );
                })}
              </>
            );
          })()}

          {/* Drug-supplement interaction warnings — safety-critical, render
              high on the page so the user sees them before the supplement
              stack itself. 'block' items already filtered out of the stack;
              'caution' items remain with a warning. */}
          {Array.isArray(plan.interaction_warnings) && plan.interaction_warnings.length > 0 && (
            <FolderSection
              icon="warning"
              title="Drug–supplement interactions"
              count={plan.interaction_warnings.length}
              countLabel={plan.interaction_warnings.length === 1 ? 'finding' : 'findings'}
              explanation="Every supplement we recommend is checked against your medications. Items shown here either were removed from your stack or kept with a warning. Always confirm with your pharmacist before starting anything new."
              accentColor="#C94F4F"
              defaultOpen
            >
              <InteractionWarnings warnings={plan.interaction_warnings} />
            </FolderSection>
          )}

          {/* Possible conditions to investigate — separate from retests.
              Retests = baseline tests the doctor missed. This = differential
              diagnosis (patterns the data fits but never made it onto a
              chart). Each entry carries its own confirmatory_tests, so the
              user knows exactly what to ask for. */}
          {(() => {
            const suspected = (plan.suspected_conditions ?? []).filter(
              (c: any) => c && typeof c.name === 'string' && c.name.trim().length > 0,
            );
            return suspected.length > 0 && (
              <FolderSection
                icon="quiz"
                title="Possible conditions to investigate"
                count={suspected.length}
                countLabel={suspected.length === 1 ? 'pattern' : 'patterns'}
                explanation="Patterns in your bloodwork and symptoms that fit conditions you haven't been diagnosed with. Not a diagnosis — a differential. Each one comes with the confirmatory tests to ask your doctor for."
                accentColor="#C94F4F"
                defaultOpen
              >
                <PossibleConditions conditions={suspected} />
              </FolderSection>
            );
          })()}

          {/* 90-day retest CTA — surfaces in last 2 weeks of protocol */}
          {showRetestCTA && (
            <Link
              to="/labs/upload"
              className="block bg-gradient-to-br from-[#D4A574] to-[#B8915F] rounded-[14px] p-5 hover:shadow-card-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl flex-shrink-0">🧪</span>
                <div className="flex-1 min-w-0">
                  <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-charcoal/70 mb-1">
                    {planWeek! >= 12 ? '90 days complete' : `Week ${planWeek} of 12`}
                  </p>
                  <p className="text-authority text-lg text-clinical-charcoal font-bold">
                    {planWeek! >= 12 ? 'Time to retest — upload your 90-day labs' : 'Almost time to retest — get your bloodwork drawn'}
                  </p>
                  <p className="text-body text-clinical-charcoal/80 text-sm mt-1">
                    {planWeek! >= 12 ? 'See if your numbers moved. The honest test of the plan.' : 'Schedule your draw this week so the labs are back by week 12.'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-clinical-charcoal text-[24px] flex-shrink-0">arrow_forward</span>
              </div>
            </Link>
          )}

          {hasNewerLabs && (
            <button onClick={handleGenerate} className="w-full bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 rounded-[10px] p-4 flex items-center gap-3 hover:bg-[#2A9D8F]/15 transition-colors text-left">
              <span className="material-symbols-outlined text-[#2A9D8F]">update</span>
              <div className="flex-1">
                <p className="text-body text-clinical-charcoal font-semibold text-sm">New labs available</p>
                <p className="text-precision text-[0.6rem] text-clinical-stone">Tap to rebuild your plan.</p>
              </div>
            </button>
          )}

          {/* Tab nav */}
          <div className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[8px] transition-all ${
                  tab === t.key ? 'bg-clinical-white shadow-card' : 'hover:bg-clinical-white/50'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${tab === t.key ? 'text-primary-container' : 'text-clinical-stone'}`}>{t.icon}</span>
                <span className={`text-precision text-[0.7rem] font-bold tracking-wide ${tab === t.key ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab body */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'today' && <TodayTab plan={plan} uid={user?.id ?? 'anon'} />}
              {tab === 'eat' && <EatTab plan={plan} />}
              {tab === 'move' && <MoveTab plan={plan} />}
              {tab === 'take' && <TakeTab plan={plan} />}
            </motion.div>
          </AnimatePresence>

          {/* Below-the-tabs sections — order set by founder direction:
              1. Lifestyle Interventions (4 categories)
              2. 90-Day Action Plan (3 phases)
              3. Symptoms (bottom — context, not action)
              The "Tests to ask for" retest list lives near the top of the page,
              right under the headline, since it's the next concrete step. */}
          <FolderSection
            icon="restaurant"
            title="Lifestyle Interventions"
            countLabel="categories"
            count={4}
            explanation="Diet, sleep, exercise, and stress strategies targeting your specific lab patterns."
          >
            <LifestyleInterventions interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }} />
          </FolderSection>

          <FolderSection
            icon="event"
            title="Your 90-Day Action Plan"
            countLabel="phases"
            count={3}
            explanation="Three phases — stabilize, optimize, maintain. Don't try to do everything at once."
          >
            <ActionPlan
              actionPlan={plan.action_plan ?? { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } }}
              retestTimeline={[]}
              planKey={plan.generated_at ?? 'default'}
            />
          </FolderSection>

          {Array.isArray(plan.symptoms_addressed) && plan.symptoms_addressed.length > 0 && (
            <FolderSection
              icon="monitor_heart"
              title="Your symptoms — and how this plan addresses them"
              count={plan.symptoms_addressed.length}
              countLabel={plan.symptoms_addressed.length === 1 ? 'symptom' : 'symptoms'}
              explanation="Every symptom you logged maps to a specific test, a supplement (when a lab confirms the cause), and a lifestyle change. Tap to expand."
              accentColor="#7B1FA2"
            >
              <div className="space-y-3">
                {plan.symptoms_addressed.map((s: any, i: number) => (
                  <div key={i} className="bg-clinical-cream/40 rounded-[10px] p-4 border-l-2 border-[#7B1FA2]">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="text-body text-clinical-charcoal text-sm font-semibold leading-snug">{s.symptom}</p>
                      {typeof s.severity === 'number' && (
                        <span className="text-precision text-[0.6rem] font-bold tracking-wider text-[#7B1FA2] bg-[#7B1FA2]/10 px-2 py-0.5 rounded flex-shrink-0">
                          {s.severity}/10
                        </span>
                      )}
                    </div>
                    {s.how_addressed && (
                      <p className="text-body text-clinical-stone text-xs leading-relaxed">{s.how_addressed}</p>
                    )}
                  </div>
                ))}
              </div>
            </FolderSection>
          )}

          {plan.disclaimer && (
            <div className="border border-outline-variant/10 rounded-lg p-5">
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed">{plan.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
};
