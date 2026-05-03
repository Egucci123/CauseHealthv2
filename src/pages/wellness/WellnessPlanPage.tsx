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
import { FoodPlaybookLibrary } from '../../components/wellness/FoodPlaybookLibrary';
import { WeeklySpotlight } from '../../components/wellness/WeeklySpotlight';
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
    <p className="text-body text-clinical-stone max-w-sm mx-auto leading-relaxed">Reading your labs, picking your meals, building your workouts. About 45–90 seconds.</p>
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

      {/* Plan deep-dive — Lifestyle, 90-day phases, retest. Folded into Today
          since the standalone Details tab was removed. */}
      <div className="space-y-4 pt-2">
        <FolderSection icon="restaurant" title="Lifestyle Interventions" countLabel="categories" count={4} explanation="Diet, sleep, exercise, and stress strategies targeting your specific lab patterns.">
          <LifestyleInterventions interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }} />
        </FolderSection>
        <FolderSection icon="event" title="Your 90-Day Action Plan" countLabel="phases" count={3} explanation="Three phases — stabilize, optimize, maintain. Don't try to do everything at once.">
          <ActionPlan actionPlan={plan.action_plan ?? { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } }} retestTimeline={[]} planKey={plan.generated_at ?? 'default'} />
        </FolderSection>
        {Array.isArray(plan.retest_timeline) && plan.retest_timeline.length > 0 && (
          <FolderSection icon="science" title="Recommended Retest at Week 12" count={plan.retest_timeline.length} countLabel={plan.retest_timeline.length === 1 ? 'marker' : 'markers'} explanation="Markers from your bloodwork to recheck. For NEW tests to discuss with your doctor, see Doctor Prep." accentColor="#1B423A">
            <div className="space-y-3">
              {plan.retest_timeline.map((r: any, i: number) => (
                <div key={i} className="bg-clinical-cream rounded-lg p-4 border-l-4 border-primary-container">
                  <div className="flex justify-between items-start gap-3 mb-1.5">
                    <p className="text-body text-clinical-charcoal font-semibold text-sm">{r.marker}</p>
                    <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-primary-container flex-shrink-0">{r.retest_at}</span>
                  </div>
                  <p className="text-body text-clinical-stone text-xs leading-relaxed">{r.why}</p>
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
    </div>
  );
};

// ── Eat Tab ────────────────────────────────────────────────────────────────────
// Build a deduplicated, alphabetical shopping list from all meal ingredients.
function buildShoppingList(meals: any[]): string[] {
  const set = new Set<string>();
  for (const m of meals) {
    for (const ing of m.ingredients ?? []) {
      const cleaned = String(ing)
        .toLowerCase()
        // Strip leading quantities like "2 eggs", "1/2 cup spinach", "3oz salmon"
        .replace(/^\s*\d+(\.\d+)?\s*(\/\s*\d+)?\s*(cup|cups|tbsp|tsp|oz|lb|g|ml|cans?|cloves?|pieces?|slices?|tbs|tablespoons?|teaspoons?)?\.?\s*/i, '')
        .replace(/^\s*\d+(\.\d+)?\s*/i, '')
        .trim();
      if (cleaned) set.add(cleaned);
    }
  }
  return [...set].sort();
}

const EatTab = ({ plan }: { plan: any }) => {
  const meals = plan.meals ?? [];
  const [showList, setShowList] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const userId = useAuthStore(s => s.user?.id ?? '');

  // Export the AI-curated plan meals to a PDF directly. Different from the
  // "Browse Full Library" PDF — this one's just the user's curated week.
  const exportPlanPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;
    const ensureSpace = (need: number) => {
      if (y + need > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
    };
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(27, 66, 58);
    doc.text('Your CauseHealth Food Plan', margin, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${meals.length} meals matched to your labs and life — ${new Date().toLocaleDateString()}`, margin, y);
    y += 24;

    const order = ['breakfast', 'lunch', 'dinner', 'snack'];
    const sortedForPDF = [...meals].sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
    let lastWhen = '';
    for (const m of sortedForPDF) {
      if (m.when !== lastWhen) {
        ensureSpace(28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(27, 66, 58);
        doc.text(String(m.when || 'meal').toUpperCase(), margin, y);
        y += 16;
        lastWhen = m.when;
      }
      ensureSpace(60);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(40);
      const nameLines = doc.splitTextToSize(`• ${m.name || ''}`, pageWidth - margin * 2);
      for (const line of nameLines) { doc.text(line, margin, y); y += 12; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      const ing = doc.splitTextToSize((m.ingredients || []).join(' · '), pageWidth - margin * 2 - 12);
      for (const line of ing) { doc.text(line, margin + 12, y); y += 10; }
      if (m.why) {
        doc.setTextColor(90);
        const whyLines = doc.splitTextToSize(`Why: ${m.why}`, pageWidth - margin * 2 - 12);
        for (const line of whyLines) { doc.text(line, margin + 12, y); y += 10; }
      }
      y += 8;
    }
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${totalPages} · CauseHealth Food Plan`, margin, doc.internal.pageSize.getHeight() - 24);
    }
    doc.save('causehealth-food-plan.pdf');
  };

  if (meals.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get your weekly food list.</p>;
  }
  const order = ['breakfast', 'lunch', 'dinner', 'snack'];
  const sorted = [...meals].sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
  const shoppingList = buildShoppingList(meals);
  // Amazon Fresh search URL — opens a search for the whole list comma-separated.
  // Most users will recognize / refine items. Not a deep-link to cart (Amazon
  // doesn't expose that for non-affiliate use), but one click away from buying.
  const amazonFreshUrl = `https://www.amazon.com/alm/storefront?almBrandId=QW16YXpvbiBGcmVzaA%3D%3D&search=${encodeURIComponent(shoppingList.slice(0, 8).join(' '))}`;

  return (
    <div className="space-y-4">
      {/* Weekly spotlight — rotates which meals from the user's plan get
          highlighted based on weeks since plan generation. Phase 1 dominates
          early weeks, Phase 3 home-cooking dominates late weeks. Dinner gets
          a stronger push toward home-cook over time. Pure deterministic logic
          — no new AI calls. */}
      {plan.generated_at && userId && meals.length > 0 && (
        <WeeklySpotlight
          meals={meals}
          planGeneratedAt={plan.generated_at}
          userId={userId}
          browseAnchorId="wellness-meals-all"
        />
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-body text-clinical-stone text-sm">Real meals + real chain orders + lunchbox hacks for real life. Pick what works this week — start anywhere.</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportPlanPDF}
            className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 bg-clinical-white border border-[#1B423A]/30 hover:border-[#1B423A] text-[#1B423A] rounded-[8px] transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
            Export PDF
          </button>
          <button
            onClick={() => setShowLibrary(true)}
            className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">library_books</span>
            Browse Full Library
          </button>
          <button
            onClick={() => setShowList(!showList)}
            className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 bg-gradient-to-br from-[#1B423A] to-[#0F2A24] hover:from-[#244F46] hover:to-[#163730] text-[#D4A574] rounded-[8px] transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">shopping_basket</span>
            {showList ? 'Hide List' : `Shopping List (${shoppingList.length})`}
          </button>
        </div>
      </div>

      <FoodPlaybookLibrary open={showLibrary} onClose={() => setShowLibrary(false)} />

      {showList && (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#1B423A] p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <p className="text-authority text-base text-clinical-charcoal font-bold">Your Shopping List</p>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">Combined ingredients across all meals · {shoppingList.length} items</p>
            </div>
            <a
              href={amazonFreshUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">shopping_cart</span>
              Shop on Amazon
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {shoppingList.map((item) => (
              <label key={item} className="flex items-center gap-2 bg-clinical-cream rounded-md px-3 py-2 hover:bg-clinical-cream/70 cursor-pointer">
                <input type="checkbox" className="accent-[#1B423A] w-4 h-4 flex-shrink-0" />
                <span className="text-body text-clinical-charcoal text-sm capitalize">{item}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Render meals grouped by PLAYBOOK (the "Food Playbook"). Each meal
          carries a phase badge (1=Start Here, 2=Level Up, 3=Optimal) so the
          user sees difficulty without sections being walled off by phase.
          Anchor id used by WeeklySpotlight's "Browse all" button to scroll. */}
      <div id="wellness-meals-all" />
      {(() => {
        const PLAYBOOK_META: Record<string, { label: string; sub: string; emoji: string; color: string }> = {
          convenience_store: { label: 'Convenience Store Grabs', sub: 'Wawa, 7-Eleven, gas stations, truck stops', emoji: '🏪', color: '#7B1FA2' },
          fast_food: { label: 'Fast-Food Smart Orders', sub: 'Real chains, real orders — protein-doubled', emoji: '🍔', color: '#E8922A' },
          protein_bar_shake: { label: 'Bars & Shakes', sub: 'Real brands, real prices, anywhere in 60 sec', emoji: '🍫', color: '#C94F4F' },
          crock_pot: { label: 'Crock Pot Set-and-Forget', sub: 'Throw it in, eats for the week', emoji: '🍲', color: '#5E8C61' },
          sheet_pan: { label: 'Sheet-Pan / One-Pan', sub: '5 ingredients, zero cleanup', emoji: '🥘', color: '#D4A574' },
          frozen_aisle: { label: 'Frozen Aisle Wins', sub: 'Costco, Trader Joe\'s, Aldi specifics', emoji: '❄️', color: '#1B423A' },
          frozen_breakfast: { label: 'Frozen Breakfast Sandwiches', sub: 'Microwave it, eat it, go', emoji: '🥪', color: '#A2845E' },
          low_cal_drink: { label: 'Drink Swaps', sub: 'Replace soda + sweet coffee with these', emoji: '🥤', color: '#2A9D8F' },
          mom_friendly: { label: 'Kid-Tested + Adult-Friendly', sub: 'Same plate, parent gets the protein', emoji: '🧒', color: '#B5651D' },
          viral_hack: { label: 'Viral Hacks That Actually Work', sub: 'TikTok-tested, lab-targeted', emoji: '📱', color: '#9B59B6' },
          lunchbox_thermos: { label: 'Lunchbox / Cooler / Thermos', sub: 'Driver, construction, shift work', emoji: '🧊', color: '#1F77B4' },
          simple_home_cook: { label: 'Simple Home Cook', sub: 'Real recipes, still grocery-store basic', emoji: '🍳', color: '#1B4332' },
        };
        const PLAYBOOK_ORDER = [
          'convenience_store', 'fast_food', 'protein_bar_shake', 'frozen_aisle',
          'frozen_breakfast', 'lunchbox_thermos', 'sheet_pan', 'crock_pot',
          'simple_home_cook', 'mom_friendly', 'viral_hack', 'low_cal_drink',
        ];
        const PHASE_BADGE: Record<number, { label: string; color: string }> = {
          1: { label: 'Start here', color: '#2A9D8F' },
          2: { label: 'Level up', color: '#D4A574' },
          3: { label: 'Optimal', color: '#1B4332' },
        };
        // Group meals by playbook field. Meals with no playbook fall into "_other" bucket.
        const byPlaybook = new Map<string, any[]>();
        for (const m of sorted) {
          const key = (typeof m?.playbook === 'string' && m.playbook in PLAYBOOK_META) ? m.playbook : '_other';
          if (!byPlaybook.has(key)) byPlaybook.set(key, []);
          byPlaybook.get(key)!.push(m);
        }
        const orderedKeys = [...PLAYBOOK_ORDER.filter(k => byPlaybook.has(k))];
        if (byPlaybook.has('_other')) orderedKeys.push('_other');
        if (orderedKeys.length === 0) {
          return <p className="text-body text-clinical-stone text-sm py-4">No meals yet. Hit Regenerate.</p>;
        }
        return orderedKeys.map(key => {
          const meta = key === '_other'
            ? { label: 'More Ideas', sub: 'Other meals from your plan', emoji: '🍽️', color: '#999' }
            : PLAYBOOK_META[key];
          const meals = byPlaybook.get(key)!;
          return (
            <div key={key} className="space-y-3">
              <div className="flex items-center gap-3 pt-2">
                <span className="text-2xl flex-shrink-0">{meta.emoji}</span>
                <div className="flex-1">
                  <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">{meta.label}</p>
                  <p className="text-precision text-[0.6rem] text-clinical-stone">{meta.sub}</p>
                </div>
                <span className="text-precision text-[0.7rem] text-clinical-stone tracking-widest">{meals.length}</span>
              </div>
              {meals.map((m: any, i: number) => {
                const badge = PHASE_BADGE[m.phase as number] ?? null;
                return (
                  <div key={i} className="bg-clinical-white border-l-2 rounded-[10px] p-4" style={{ borderLeftColor: meta.color }}>
                    <div className="flex items-start gap-3">
                      <span className="text-3xl flex-shrink-0">{m.emoji || meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                          <p className="text-body text-clinical-charcoal font-semibold">{m.name}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {badge && (
                              <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: `${badge.color}20`, color: badge.color }}>{badge.label}</span>
                            )}
                            {m.when && <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-primary-container">{m.when}</span>}
                          </div>
                        </div>
                        {m.ingredients?.length > 0 && <p className="text-body text-clinical-stone text-sm">{m.ingredients.join(' · ')}</p>}
                        {m.why && <p className="text-precision text-[0.65rem] text-clinical-stone mt-2 italic">{m.why}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        });
      })()}
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
          {(() => {
            const validRetests = (plan.retest_timeline ?? []).filter((r: any) => typeof r?.marker === 'string' && r.marker.trim().length > 0);
            return validRetests.length > 0 && (
            <FolderSection
              icon="science"
              title="Tests to ask for at your 12-week visit"
              count={validRetests.length}
              countLabel={validRetests.length === 1 ? 'test' : 'tests'}
              explanation="Every test the doctor should run at your follow-up. Some re-measure values from this draw to track progress; others fill in gaps from symptoms or medication side effects. All are PCP-orderable and insurance-covered. Hand the doctor this list."
              accentColor="#1B423A"
              defaultOpen
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {validRetests.map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-clinical-cream/40 rounded-[8px]">
                    <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5 text-[#1B423A]">science</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight">{r.marker}</p>
                      {r.why && <p className="text-precision text-[0.6rem] text-clinical-stone mt-1 leading-snug">{r.why}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </FolderSection>
            );
          })()}

          {/* Symptoms addressed — moved to bottom (with the other deep-dive
              dropdowns) per founder direction. Stays folded closed by default. */}
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
        </div>
      )}
    </AppShell>
  );
};
