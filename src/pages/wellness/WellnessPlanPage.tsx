// src/pages/wellness/WellnessPlanPage.tsx
// Visual-first redesign — Today / Eat / Move / Take primary tabs, full Plan behind a Details tab.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { FolderSection } from '../../components/ui/FolderSection';
import { SupplementStack } from '../../components/wellness/SupplementStack';
import { LifestyleInterventions } from '../../components/wellness/LifestyleInterventions';
import { ActionPlan } from '../../components/wellness/ActionPlan';
import { useWellnessPlan, useGenerateWellnessPlan } from '../../hooks/useWellnessPlan';
import { useLatestLabDraw } from '../../hooks/useLabData';
import { useAuthStore } from '../../store/authStore';
import { exportWellnessPlanPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

type TabKey = 'today' | 'eat' | 'move' | 'take' | 'details';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'eat', label: 'Eat', icon: 'restaurant' },
  { key: 'move', label: 'Move', icon: 'directions_run' },
  { key: 'take', label: 'Take', icon: 'medication' },
  { key: 'details', label: 'Details', icon: 'info' },
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
    <p className="text-body text-clinical-stone max-w-sm mx-auto leading-relaxed">Reading your labs, picking your meals, building your workouts. About 20 seconds.</p>
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

// ── Today Tab ──────────────────────────────────────────────────────────────────
const TodayTab = ({ plan, uid }: { plan: any; uid: string }) => {
  const actions = (plan.today_actions ?? []).slice(0, 3);
  const key = `today_progress_${uid}`;
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === todayKey()) setDone(parsed.done ?? []);
      }
    } catch { /* ignore */ }
  }, [key]);

  const toggle = (i: number) => {
    const nextDone = done.includes(i) ? done.filter(d => d !== i) : [...done, i];
    setDone(nextDone);
    try { localStorage.setItem(key, JSON.stringify({ date: todayKey(), done: nextDone })); } catch { /* quota */ }
  };

  if (actions.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get today's 3 actions.</p>;
  }

  return (
    <div className="space-y-3">
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
    </div>
  );
};

// ── Eat Tab ────────────────────────────────────────────────────────────────────
const EatTab = ({ plan }: { plan: any }) => {
  const meals = plan.meals ?? [];
  if (meals.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">Regenerate your plan to get your weekly food list.</p>;
  }
  const order = ['breakfast', 'lunch', 'dinner', 'snack'];
  const sorted = [...meals].sort((a, b) => order.indexOf(a.when) - order.indexOf(b.when));
  return (
    <div className="space-y-3">
      <p className="text-body text-clinical-stone text-sm">Real meals matched to your labs. Cook one, eat one — it counts.</p>
      {sorted.map((m: any, i: number) => (
        <div key={i} className="bg-clinical-white border border-outline-variant/15 rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">{m.emoji || '🍽️'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-body text-clinical-charcoal font-semibold">{m.name}</p>
                <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-primary-container">{m.when}</span>
              </div>
              {m.ingredients?.length > 0 && (
                <p className="text-body text-clinical-stone text-sm">{m.ingredients.join(' · ')}</p>
              )}
              {m.why && <p className="text-precision text-[0.65rem] text-clinical-stone mt-2 italic">{m.why}</p>}
            </div>
          </div>
        </div>
      ))}
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
                <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-primary-container">{w.day}</span>
                {w.duration_min && <span className="text-precision text-[0.55rem] text-clinical-stone">· {w.duration_min} min</span>}
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
const TakeTab = ({ plan }: { plan: any }) => {
  const supps = plan.supplement_stack ?? [];
  if (supps.length === 0) {
    return <p className="text-body text-clinical-stone text-sm">No supplements recommended. Your plan focuses on food and movement.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-body text-clinical-stone text-sm">{supps.length} supplement{supps.length !== 1 ? 's' : ''}. Each one fixes a specific lab.</p>
      {supps.map((s: any, i: number) => (
        <div key={i} className="bg-clinical-white border border-outline-variant/15 rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">{s.emoji || '💊'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <p className="text-body text-clinical-charcoal font-semibold">{s.nutrient}{s.form ? ` (${s.form})` : ''}</p>
                {s.priority && (
                  <span className={`text-precision text-[0.55rem] font-bold tracking-widest uppercase ${s.priority === 'critical' ? 'text-[#C94F4F]' : s.priority === 'high' ? 'text-[#E8922A]' : 'text-primary-container'}`}>
                    {s.priority}
                  </span>
                )}
              </div>
              <p className="text-body text-clinical-stone text-sm">
                {s.dose}{s.timing ? ` · ${s.timing}` : ''}
              </p>
              {(s.why_short || s.why) && <p className="text-precision text-[0.7rem] text-clinical-stone mt-2 italic">{s.why_short || s.why}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Details Tab (legacy detailed view) ────────────────────────────────────────
const DetailsTab = ({ plan }: { plan: any }) => {
  const navigate = useNavigate();
  const supplementCount = plan.supplement_stack?.length ?? 0;
  const retestCount = plan.retest_timeline?.length ?? 0;
  return (
    <div className="space-y-4">
      <FolderSection icon="medication" title="Supplement Protocol" count={supplementCount} countLabel={supplementCount === 1 ? 'supplement' : 'supplements'} explanation="Lab-backed supplements, ranked by clinical priority. Each one targets a specific abnormal value in your bloodwork." defaultOpen>
        <SupplementStack supplements={plan.supplement_stack ?? []} />
      </FolderSection>
      <FolderSection icon="restaurant" title="Lifestyle Interventions" countLabel="categories" count={4} explanation="Diet, sleep, exercise, and stress strategies targeting your specific lab patterns.">
        <LifestyleInterventions interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }} />
      </FolderSection>
      <FolderSection icon="event" title="Your 90-Day Action Plan" countLabel="phases" count={3} explanation="Three phases — stabilize, optimize, maintain. Don't try to do everything at once.">
        <ActionPlan actionPlan={plan.action_plan ?? { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } }} retestTimeline={[]} planKey={plan.generated_at ?? 'default'} />
      </FolderSection>
      <FolderSection icon="science" title="Recommended Retest at Week 12" count={retestCount} countLabel={retestCount === 1 ? 'marker' : 'markers'} explanation="Markers from your CURRENT bloodwork to recheck. For NEW tests to discuss with your doctor, see Clinical Prep." accentColor="#1B423A">
        <div className="space-y-3">
          {plan.retest_timeline && plan.retest_timeline.length > 0 ? plan.retest_timeline.map((r: any, i: number) => (
            <div key={i} className="bg-clinical-cream rounded-lg p-4 border-l-4 border-primary-container">
              <div className="flex justify-between items-start gap-3 mb-1.5">
                <p className="text-body text-clinical-charcoal font-semibold text-sm">{r.marker}</p>
                <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-primary-container flex-shrink-0">{r.retest_at}</span>
              </div>
              <p className="text-body text-clinical-stone text-xs leading-relaxed">{r.why}</p>
            </div>
          )) : <p className="text-body text-clinical-stone text-sm">No retests recommended.</p>}
          <button onClick={() => navigate('/doctor-prep')} className="w-full mt-2 bg-primary-container/5 border border-primary-container/20 rounded-lg p-4 flex items-center gap-3 hover:bg-primary-container/10 transition-colors text-left">
            <span className="material-symbols-outlined text-primary-container text-[20px]">description</span>
            <div className="flex-1">
              <p className="text-body text-clinical-charcoal font-semibold text-sm">Looking for new tests to add?</p>
              <p className="text-precision text-[0.6rem] text-clinical-stone">Your Clinical Prep has the full diagnostic test list.</p>
            </div>
            <span className="material-symbols-outlined text-primary-container text-[18px]">arrow_forward</span>
          </button>
        </div>
      </FolderSection>
      <div className="border border-outline-variant/10 rounded-lg p-5">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed">{plan.disclaimer}</p>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export const WellnessPlanPage = () => {
  const { profile, user } = useAuthStore();
  const { data: plan, isLoading } = useWellnessPlan();
  const { generate, generating } = useGenerateWellnessPlan();
  const { data: latestDraw } = useLatestLabDraw();
  const [tab, setTab] = useState<TabKey>('today');

  const planCreatedAt = (plan as any)?._createdAt ? new Date((plan as any)._createdAt) : null;
  const drawCreatedAt = latestDraw?.createdAt ? new Date(latestDraw.createdAt) : null;
  const hasNewerLabs = plan && planCreatedAt && drawCreatedAt && drawCreatedAt > planCreatedAt;

  const handleGenerate = () => {
    generate().catch(err => console.error('[WellnessPlan] Generation error:', err));
  };

  const handleExportPDF = () => {
    if (!plan) return;
    exportWellnessPlanPDF(plan, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  return (
    <AppShell pageTitle="Wellness Plan">
      {isLoading ? <WellnessSkeleton />
        : generating ? <GeneratingState />
        : !plan ? <EmptyState onGenerate={handleGenerate} loading={generating} />
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
                  <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 bg-[#2A9D8F] text-white rounded">LONGEVITY</span>
                )}
                <Button variant="ghost" size="sm" icon="download" onClick={handleExportPDF}>PDF</Button>
                <Button variant="ghost" size="sm" icon="refresh" onClick={handleGenerate}>Regenerate</Button>
              </div>
            </div>
            <p className="text-body text-on-surface-variant text-sm leading-relaxed">{plan.summary}</p>
            <p className="text-precision text-[0.55rem] text-on-surface-variant/60 mt-3">Generated {plan.generated_at ? format(new Date(plan.generated_at), 'MMM d, yyyy') : 'recently'}</p>
          </div>

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
              {tab === 'details' && <DetailsTab plan={plan} />}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </AppShell>
  );
};
