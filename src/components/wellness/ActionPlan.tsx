// src/components/wellness/ActionPlan.tsx
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SectionLabel } from '../ui/SectionLabel';
import { useAuthStore } from '../../store/authStore';
import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

const PHASE_COLORS = [
  { border: 'border-[#C94F4F]', dot: '#C94F4F', bg: 'bg-[#C94F4F]/5', accent: '#C94F4F' },
  { border: 'border-[#E8922A]', dot: '#E8922A', bg: 'bg-[#E8922A]/5', accent: '#E8922A' },
  { border: 'border-[#D4A574]', dot: '#D4A574', bg: 'bg-[#D4A574]/5', accent: '#D4A574' },
];

// Storage key for action plan completion. Scoped to user + plan generation.
const STORAGE_KEY = 'causehealth.actionplan.v1';

interface ProgressMap { [key: string]: boolean; }

function loadProgress(userId: string, planKey: string): ProgressMap {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${userId}.${planKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProgress(userId: string, planKey: string, progress: ProgressMap) {
  try { localStorage.setItem(`${STORAGE_KEY}.${userId}.${planKey}`, JSON.stringify(progress)); } catch {}
}

interface ActionPlanProps {
  actionPlan: WellnessPlanData['action_plan'];
  retestTimeline: WellnessPlanData['retest_timeline'];
  /** Used to scope progress to a specific generation of the plan */
  planKey?: string;
}

export const ActionPlan = ({ actionPlan, retestTimeline, planKey = 'default' }: ActionPlanProps) => {
  const userId = useAuthStore(s => s.user?.id) ?? 'anon';
  const phases = useMemo(() => [actionPlan.phase_1, actionPlan.phase_2, actionPlan.phase_3], [actionPlan]);
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress(userId, planKey));

  // Re-load if user or plan changes
  useEffect(() => { setProgress(loadProgress(userId, planKey)); }, [userId, planKey]);

  const toggle = (key: string) => {
    setProgress(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveProgress(userId, planKey, next);
      return next;
    });
  };

  // Compute counts for progress bars
  const phaseStats = phases.map((phase, i) => {
    const total = phase.actions?.length ?? 0;
    const done = (phase.actions ?? []).filter((_, j) => progress[`${i}.${j}`]).length;
    return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
  });
  const totalActions = phaseStats.reduce((a, b) => a + b.total, 0);
  const totalDone = phaseStats.reduce((a, b) => a + b.done, 0);
  const overallPct = totalActions === 0 ? 0 : Math.round((totalDone / totalActions) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionLabel icon="event_note">90-Day Action Plan</SectionLabel>
        {totalActions > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase">
              {totalDone} of {totalActions} done
            </span>
            <div className="w-32 h-1.5 bg-clinical-cream rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary-container rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${overallPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest">{overallPct}%</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {phases.map((phase, i) => {
          const color = PHASE_COLORS[i];
          const stats = phaseStats[i];
          return (
            <div key={i} className={`bg-clinical-white rounded-[10px] shadow-card border-l-4 ${color.border} p-6`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`inline-block px-3 py-1 rounded-full ${color.bg}`}>
                  <span className="text-precision text-[0.6rem] font-bold tracking-widest" style={{ color: color.dot }}>PHASE {i + 1}</span>
                </div>
                {stats.total > 0 && (
                  <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wider">{stats.done}/{stats.total}</span>
                )}
              </div>
              <h4 className="text-authority text-lg text-clinical-charcoal font-semibold mb-2">{phase.name}</h4>
              <p className="text-body text-clinical-stone text-sm mb-4 leading-relaxed">{phase.focus}</p>

              {/* Phase progress bar */}
              {stats.total > 0 && (
                <div className="mb-4 h-1 bg-clinical-cream rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color.accent }}
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.pct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              )}

              <ul className="space-y-2">
                {(phase.actions ?? []).map((action, j) => {
                  const key = `${i}.${j}`;
                  const done = !!progress[key];
                  return (
                    <li key={j}>
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex items-start gap-3 text-left p-2 -mx-2 rounded-md hover:bg-clinical-cream/40 transition-colors group"
                      >
                        <span
                          className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 transition-all ${done ? 'bg-primary-container border-primary-container' : 'border-clinical-stone/30 group-hover:border-primary-container'}`}
                        >
                          {done && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                        </span>
                        <p className={`text-body text-sm leading-relaxed flex-1 ${done ? 'text-clinical-stone line-through' : 'text-clinical-charcoal'}`}>{action}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {retestTimeline?.length > 0 && (
        <div className="bg-[#131313] rounded-[10px] p-6">
          <SectionLabel light icon="biotech" className="text-on-surface-variant mb-4">Recommended Retesting</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {retestTimeline.map((item, i) => (
              <div key={i} className="bg-surface-container rounded-lg p-4">
                <p className="text-body text-on-surface font-medium text-sm">{item.marker}</p>
                <p className="text-precision text-[0.6rem] text-primary font-bold tracking-wide mt-1">RETEST IN {item.retest_at.toUpperCase()}</p>
                <p className="text-body text-on-surface-variant text-xs mt-2 leading-relaxed">{item.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
