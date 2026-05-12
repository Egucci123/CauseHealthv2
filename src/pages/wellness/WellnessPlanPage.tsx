// src/pages/wellness/WellnessPlanPage.tsx
// Visual-first redesign — Today / Eat / Move / Take primary tabs, full Plan behind a Details tab.
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { TabNav } from '../../components/ui/TabNav';
import { FolderSection } from '../../components/ui/FolderSection';
import { LifestyleInterventions } from '../../components/wellness/LifestyleInterventions';
import { ActionPlan } from '../../components/wellness/ActionPlan';
import { InteractionWarnings } from '../../components/wellness/InteractionWarnings';
import { ProgressSummary } from '../../components/wellness/ProgressSummary';
import { TransformationForecast } from '../../components/wellness/TransformationForecast';
import { useWellnessPlan, useGenerateWellnessPlan } from '../../hooks/useWellnessPlan';
import { useLatestLabDraw, useLatestLabValues } from '../../hooks/useLabData';
import { buildForecasts } from '../../lib/transformationForecast';
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { useAuthStore } from '../../store/authStore';
import { exportWellnessPlanPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';
import OutputAcknowledgmentGate from '../../components/legal/OutputAcknowledgmentGate';
import { useOutputAck } from '../../lib/legal/useOutputAck';

type TabKey = 'lifestyle' | 'eat' | 'move' | 'take';

// 2026-05-12: 'today' tab renamed to 'lifestyle'. The 3-action-card
// framing was tied to a 12-week subscription concept that doesn't fit
// the one-time-prep product. The Lifestyle tab now shows the full
// Diet/Sleep/Exercise/Stress dropdown straight from the engine.
const TABS: { key: TabKey; label: string; shortLabel?: string; icon: string }[] = [
  { key: 'lifestyle', label: 'Lifestyle',     icon: 'self_improvement' },
  { key: 'eat',       label: 'Food Playbook', shortLabel: 'Food', icon: 'restaurant' },
  { key: 'move',      label: 'Move',          icon: 'directions_run' },
  { key: 'take',      label: 'Take',          icon: 'medication' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Cap the hero headline at 9 words / 70 chars so existing AI-generated
 *  long headlines don't balloon the dark hero card on mobile. Mirrors
 *  the server-side truncation in generate-wellness-plan/index.ts so old
 *  plans render correctly without forcing a regen. */
function capHeadline(s: string): string {
  if (!s) return s;
  if (s.length <= 70 && s.split(/\s+/).length <= 9) return s;
  // First sentence break
  const sentenceEnd = s.search(/[—–.;]\s/);
  let out = sentenceEnd > 20 && sentenceEnd < 70 ? s.slice(0, sentenceEnd + 1).trim() : s;
  const words = out.split(/\s+/);
  if (words.length > 9) out = words.slice(0, 9).join(' ').replace(/[,;:]$/, '') + '.';
  if (out.length > 70) out = out.slice(0, 67).trimEnd() + '...';
  return out;
}

const WellnessSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-24 bg-[#E8E3DB] rounded-[10px]" />
    {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-[#E8E3DB] rounded-[10px]" />)}
  </div>
);

const GeneratingState = () => (
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6 sm:p-12 text-center">
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
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6 sm:p-12 text-center">
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

// 2026-05-12: Lifestyle tab — replaces the old "Today" 3-action card flow.
// Renders the engine's Diet / Sleep / Exercise / Stress interventions
// straight from facts.lifestyleInterventions (deterministic). No timeline,
// no streak counter, no milestone framing. Just the engine's curated
// daily lifestyle changes grouped by category.
const LifestyleTab = ({ plan }: { plan: any }) => {
  return (
    <div className="space-y-4">
      <div className="bg-clinical-cream/40 rounded-[10px] p-4 border-l-[3px] border-primary-container">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
          Lifestyle Changes
        </p>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
          Daily lifestyle changes tied to your specific markers and patterns. Tap each category to see the
          interventions ranked by priority — pick what fits your week and stack from there.
        </p>
      </div>
      <LifestyleInterventions
        interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }}
      />
    </div>
  );
};

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

  // 2026-05-12: planWeek + nextMilestone were used by the removed
  // "Week N of 12" + "next milestone" strip. Now dead code — kept
  // for reference but no useMemo hook so TypeScript doesn't flag
  // them as unused.

  if (actions.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get today's 3 actions.</p>;
  }

  return (
    <div className="space-y-4">
      {/* 2026-05-12: removed week-milestone progress strip. CauseHealth is
          a one-time-per-lab-cycle product (no subscription, no ongoing
          schedule), so "Week N of 12" + "next milestone in N days"
          framing felt off. The 3 actions below are presented as
          lifestyle interventions to do today — not subscription
          milestones. */}

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

      <div className="bg-clinical-cream/40 rounded-[10px] p-4 border-l-[3px] border-primary-container">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
          Lifestyle Interventions · Today
        </p>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
          Three small actions tied to your specific markers + patterns. Do them daily — check them off when done.
        </p>
      </div>
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
// 2026-05-12-48: TodayTab and MILESTONES_INLINE are dead code after the
// switch to LifestyleTab as the default first tab. Kept as defined so we
// can restore the streak/check-off behavior if a future surface wants it.
void TodayTab;
void MILESTONES_INLINE;

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
    subtitle: 'Curated best orders at 30+ chains (good when you want a single article instead of browsing).',
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
  // 2026-05-12-32: split inflammation_cardio -> separate sections.
  // The combined section was hiding cholesterol/triglyceride supplements
  // when an autoimmune supplement (e.g. curcumin for UC) won the slot.
  inflammation: { label: 'Inflammation', sub: 'Autoimmune, joint, and CRP support', icon: 'shield', color: '#C94F4F' },
  cardio: { label: 'Cardio & Lipids', sub: 'Cholesterol, triglycerides, HDL, heart support', icon: 'favorite', color: '#E07A5F' },
  // Legacy combined category — kept so older cached plans render correctly.
  inflammation_cardio: { label: 'Inflammation & Cardio', sub: 'Lower inflammation, support heart + lipids', icon: 'favorite', color: '#C94F4F' },
  nutrient_repletion: { label: 'Nutrient Repletion', sub: 'Fixing measurable deficiencies', icon: 'science', color: '#1B423A' },
  condition_therapy: { label: 'Condition-Specific', sub: 'Disease-mechanism therapy with strong evidence', icon: 'medication', color: '#D4A574' },
  // Render-only pseudo-category. Any supplement with sourced_from === 'medication_depletion'
  // is routed here at display time, regardless of its underlying category. Keeps the
  // generator's category logic clean (CoQ10 still IS liver-supportive at the pharmacology
  // level) while giving the user a clear "this is here because of your meds" section.
  medication_depletion: { label: 'Medication Depletions', sub: 'Replacing nutrients your prescriptions deplete', icon: 'pill', color: '#B8915F' },
};
// Order: med depletions first (highest urgency for this patient), then deficiencies, then
// the rest. Putting medication_depletion at top because the user will recognize it as
// "the supplement that's because of my drug" and the "why" is immediately legible.
const CATEGORY_ORDER_SUPPS = ['medication_depletion', 'nutrient_repletion', 'liver_metabolic', 'cardio', 'gut_healing', 'inflammation', 'inflammation_cardio', 'condition_therapy', 'sleep_stress'];

const TakeTab = ({ plan }: { plan: any }) => {
  const supps = [...(plan.supplement_stack ?? [])];
  if (supps.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">No supplements recommended. Your plan focuses on food and movement.</p>;
  }

  // Group by category if entries have one. Fall back to flat ranked list for legacy plans.
  // RENDER-LEVEL ROUTING:
  //   - Liver-protective supplements (category: liver_metabolic) ALWAYS render under
  //     "Liver & Metabolic" regardless of why they were recommended. Milk Thistle
  //     helps the liver whether the trigger was a statin, NAFLD, or anything else —
  //     the user wants to see it as a liver supplement.
  //   - Otherwise, supplements with sourced_from === 'medication_depletion' route
  //     to "Medication Depletions" — these are pure replacement-for-what-the-drug-
  //     took-away supplements (CoQ10 for statin, B12 for metformin, Mg for PPI,
  //     Ca+D for steroids).
  //   - Everything else uses its pharmacological category.
  const effectiveCategory = (s: any): string => {
    if (s?.category === 'liver_metabolic') return 'liver_metabolic';
    if (s?.sourced_from === 'medication_depletion') return 'medication_depletion';
    return s?.category;
  };
  const hasCategories = supps.some((s: any) => !!s.category);
  const groups: { key: string; items: any[] }[] = hasCategories
    ? CATEGORY_ORDER_SUPPS
        .map(key => ({ key, items: supps.filter((s: any) => effectiveCategory(s) === key) }))
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
          Your top supplement picks, chosen for your specific markers and patterns. Grouped by what each one does.
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
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#1B423A] hover:bg-[#143028] text-[#D4A574] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                        <span className="text-precision text-[0.65rem] font-bold tracking-wider uppercase">Add to Amazon</span>
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
  const qc = useQueryClient();
  const { data: plan} = useWellnessPlan();
  const { generate, generating } = useGenerateWellnessPlan();
  const { data: latestDraw } = useLatestLabDraw();
  const { data: latestValues } = useLatestLabValues();
  const [tab, setTab] = useState<TabKey>('lifestyle');
  // v6 output-acknowledgment gate. Plan body is gated on completion.
  const ack = useOutputAck();

  // ── Force-fresh on mount + realtime so the plan appears the instant it's
  // ready, never requires a manual refresh. Three-layer safety:
  //   1. Invalidate the wellness-plan + activePlan queries on mount → fetch fresh.
  //   2. Realtime subscription on wellness_plans → flips the moment a row writes.
  //   3. Lightweight 3s polling for 90s after mount as a backstop in case
  //      realtime is throttled / dropped by the browser.
  useEffect(() => {
    if (!user?.id) return;
    qc.invalidateQueries({ queryKey: ['wellness-plan', user.id] });
    qc.invalidateQueries({ queryKey: ['activePlan', user.id] });

    const channelId = `wellness-plan-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wellness_plans', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['wellness-plan', user.id] });
          qc.invalidateQueries({ queryKey: ['activePlan', user.id] });
        }
      )
      .subscribe();

    // 3s polling backstop. Cap at 240s — matches the wellness-plan
    // generation timeout (treatment-mode patients can take 90-180s, with
    // tail latency reaching the 240s ceiling). Earlier 90s cap was
    // shorter than the generation itself, so plans that finished after
    // the cap wouldn't surface without a manual refresh if realtime
    // also missed.
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > 240_000) { clearInterval(interval); return; }
      qc.invalidateQueries({ queryKey: ['wellness-plan', user.id] });
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user?.id, qc]);

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

  // Clear stale error banner when a fresh plan lands. Previously, if a
  // generation timed out (130s) and the user retried successfully, the
  // first failure's error banner stayed on screen until the user clicked
  // Dismiss or refreshed — even though the new plan was rendered below it.
  // Confusing UX: "Generation failed" red banner over a fully-loaded plan.
  // Track the latest plan's generated_at; whenever it changes (i.e., a new
  // plan rendered), wipe any prior error.
  const lastPlanTsRef = useRef<string | null>(null);
  useEffect(() => {
    const currentTs = (plan as any)?.generated_at ?? null;
    if (currentTs && currentTs !== lastPlanTsRef.current) {
      lastPlanTsRef.current = currentTs;
      setGenError(null);
    }
  }, [plan]);

  const handleExportPDF = () => {
    if (!plan) return;
    exportWellnessPlanPDF(plan, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  // Detect regen-cap-reached errors and show a dedicated banner that's
  // ALWAYS visible regardless of which inner view renders. Without this,
  // the cap error only showed inside the main plan view (which gets
  // hidden during the brief 'generating' flash after click), making it
  // easy to miss.
  const isCapHit = !!genError && /used all|REGEN_LIMIT|generations for these lab|Upload genuinely new labs/i.test(genError);

  return (
    <AppShell pageTitle="Wellness Plan" showDisclaimer>
      {/* Top-level cap-reached banner. Survives across generating/plan/empty
          state changes so the user always sees why their click was rejected. */}
      {isCapHit && (
        <div className="mb-4 bg-[#E8922A]/15 border border-[#E8922A]/40 rounded-[10px] p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#E8922A] text-[22px] flex-shrink-0 mt-0.5">block</span>
          <div className="flex-1">
            <p className="text-authority text-clinical-charcoal text-sm font-bold mb-1">Regeneration limit reached</p>
            <p className="text-body text-clinical-stone text-sm leading-snug mb-2">
              You've used all 2 wellness plan generations for these specific lab values. Upload a new lab draw with genuinely different values to generate a fresh plan, or stick with your current plan.
            </p>
            <button
              onClick={() => setGenError(null)}
              className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#9A6020] hover:text-clinical-charcoal transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Generic generation error — Anthropic timeouts, parse failures,
          network drops. Without this top-level banner, mid-flight failures
          silently reverted to empty state with no feedback. */}
      {genError && !isCapHit && (
        <div className="mb-4 bg-[#C94F4F]/10 border border-[#C94F4F]/40 rounded-[10px] p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#C94F4F] text-[22px] flex-shrink-0 mt-0.5">error</span>
          <div className="flex-1">
            <p className="text-authority text-clinical-charcoal text-sm font-bold mb-1">Generation failed</p>
            <p className="text-body text-clinical-stone text-sm leading-snug mb-2 break-words">
              {genError.length > 200 ? genError.slice(0, 200) + '…' : genError} Click Build again to retry. If a partial plan was saved before the failure, that retry will count against your 2-per-dataset limit — contact support if you need a refund.
            </p>
            <button
              onClick={() => setGenError(null)}
              className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#9A3D3D] hover:text-clinical-charcoal transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Plan undefined = loading. Plan null = no plan generated yet.
          v6 gate: when a plan exists but ack isn't complete, render
          nothing in the body — the OutputAcknowledgmentGate overlay
          below covers the screen until the user completes the quiz.
          We don't render the AI content at all (not just hide visually)
          so screen readers + DOM inspection can't bypass the gate. */}
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
        : !ack.complete ? null
        : (
        <div className="space-y-5">
          {/* Headline + actions */}
          <div className="bg-[#131313] rounded-[10px] p-6">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-precision text-[0.6rem] font-bold text-on-surface-variant tracking-widest uppercase mb-2">Your Plan</p>
                <p className="text-authority text-base sm:text-xl md:text-2xl text-on-surface font-bold leading-snug sm:leading-tight">{capHeadline(plan.headline || plan.summary?.split('.')[0] || 'Your personalized plan')}</p>
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

          {/* LONGITUDINAL — Progress since prior draw. Only renders if
              this plan was generated against a retest (user has 2+ draws).
              Universal: any marker, any patient. Shown high on the page so
              users see their progress story before the next-step asks. */}
          {plan.progress_summary && plan.progress_summary.movements.length > 0 && (
            <FolderSection
              icon="trending_up"
              title={`Progress since your last draw`}
              count={plan.progress_summary.rollup.total_compared}
              countLabel="markers"
              explanation="What changed between your prior labs and this draw. Direction is measured against each marker's optimal range — 'improved' means closer to optimal, 'worsened' means further. This is the story of whether the plan worked."
              accentColor="#1B423A"
            >
              <ProgressSummary summary={plan.progress_summary} />
            </FolderSection>
          )}

          {/* v6 (2026-05-10): Specialist-grouped test stacks + Possible
              Conditions to investigate moved to Clinical Prep, where they
              sit behind the OutputAcknowledgmentGate and inside collapsed-
              by-default folders. The wellness plan now focuses on the
              lifestyle plan; clinicians see the test workup on
              /doctor-prep via the SpecialistTestStacks component. */}

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
            >
              <InteractionWarnings warnings={plan.interaction_warnings} />
            </FolderSection>
          )}

          {/* Possible conditions moved to Clinical Prep (see comment above). */}

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
          <TabNav
            tabs={TABS.map(t => ({ id: t.key, label: t.label, shortLabel: t.shortLabel, icon: t.icon }))}
            active={tab}
            onChange={(id) => setTab(id as TabKey)}
            variant="full"
          />

          {/* Tab body */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'lifestyle' && <LifestyleTab plan={plan} />}
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
          {/* 2026-05-12: Lifestyle Interventions moved up into the
              "Lifestyle" tab (was "Today"). No longer rendered as a
              FolderSection below — would be duplicate. */}

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
                      {/* Only show the severity badge when the user actually
                          rated it. Onboarding's symptom-chip flow stores 5 as
                          a no-op default, and rendering "5/10" makes it look
                          like a real measurement. Show it for non-default
                          severities only. */}
                      {typeof s.severity === 'number' && s.severity !== 5 && (
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

      {/* v6 output-acknowledgment gate. Renders ONLY when:
          - A plan has loaded (no point gating the empty / paywall state)
          - Eligibility query has resolved
          - User has not yet completed the gate
          The gate is a full-screen modal that covers the page chrome
          including the plan body that may have rendered above it. */}
      {!!plan && ack.ready && !ack.complete && (
        <OutputAcknowledgmentGate
          onComplete={ack.recordAndComplete}
          submitting={ack.submitting}
          defaultClinicianName={ack.defaultClinicianName}
          defaultClinicianPractice={ack.defaultClinicianPractice}
        />
      )}
    </AppShell>
  );
};
