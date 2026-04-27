// src/components/dashboard/TodayCard.tsx
// Visual-first "what to do today" card. 3 actions, big checkboxes, streak counter.
// Source: latest wellness_plan.today_actions
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useWellnessPlan, type TodayAction } from '../../hooks/useWellnessPlan';
import { useAuthStore } from '../../store/authStore';

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const storageKey = (uid: string) => `today_progress_${uid}`;

interface DayProgress {
  date: string;
  done: number[]; // indices of completed actions
  streak: number;
  lastCompletedDate: string | null;
}

const loadProgress = (uid: string): DayProgress => {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return { date: todayKey(), done: [], streak: 0, lastCompletedDate: null };
    const parsed = JSON.parse(raw) as DayProgress;
    if (parsed.date !== todayKey()) {
      // New day — preserve streak only if yesterday was completed
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const streakBroken = parsed.lastCompletedDate !== yesterday && parsed.lastCompletedDate !== todayKey();
      return {
        date: todayKey(),
        done: [],
        streak: streakBroken ? 0 : parsed.streak,
        lastCompletedDate: parsed.lastCompletedDate,
      };
    }
    return parsed;
  } catch {
    return { date: todayKey(), done: [], streak: 0, lastCompletedDate: null };
  }
};

const saveProgress = (uid: string, p: DayProgress) => {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(p)); } catch { /* quota */ }
};

export const TodayCard = () => {
  const { data: plan } = useWellnessPlan();
  const { user } = useAuthStore();
  const uid = user?.id ?? 'anon';
  const [progress, setProgress] = useState<DayProgress>(() => loadProgress(uid));

  useEffect(() => { setProgress(loadProgress(uid)); }, [uid]);

  const actions: TodayAction[] = (plan?.today_actions ?? []).slice(0, 3);

  const toggle = (i: number) => {
    const isDone = progress.done.includes(i);
    const nextDone = isDone ? progress.done.filter((d) => d !== i) : [...progress.done, i];
    let next = { ...progress, done: nextDone };
    // If they just finished all 3, bump streak (once per day)
    if (!isDone && nextDone.length === actions.length && actions.length > 0 && progress.lastCompletedDate !== todayKey()) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const newStreak = progress.lastCompletedDate === yesterday ? progress.streak + 1 : 1;
      next = { ...next, streak: newStreak, lastCompletedDate: todayKey() };
    }
    setProgress(next);
    saveProgress(uid, next);
  };

  if (!plan) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Today</p>
        </div>
        <p className="text-body text-clinical-stone text-sm">Generate a wellness plan to see your daily actions.</p>
      </div>
    );
  }

  if (actions.length === 0) {
    // Older plan without today_actions — give a useful fallback
    return (
      <div className="space-y-3">
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Today</p>
        <p className="text-body text-clinical-stone text-sm">Regenerate your wellness plan to get today's 3 actions.</p>
      </div>
    );
  }

  const allDone = progress.done.length === actions.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Today</p>
          <span className="text-precision text-[0.6rem] text-clinical-stone">
            {progress.done.length}/{actions.length}
          </span>
        </div>
        {progress.streak > 0 && (
          <span className="inline-flex items-center gap-1 text-precision text-[0.65rem] font-bold text-[#E8922A]">
            🔥 {progress.streak}-day streak
          </span>
        )}
      </div>

      <div className="space-y-2">
        {actions.map((a, i) => {
          const done = progress.done.includes(i);
          return (
            <motion.button
              key={i}
              onClick={() => toggle(i)}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center gap-4 p-4 rounded-[10px] border text-left transition-all ${
                done
                  ? 'bg-primary-container/10 border-primary-container/30'
                  : 'bg-clinical-white border-outline-variant/15 hover:border-primary-container/30'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-primary-container border-primary-container' : 'border-clinical-stone/30'
                }`}
              >
                {done && <span className="material-symbols-outlined text-white text-[18px]">check</span>}
              </div>
              <span className="text-2xl flex-shrink-0">{a.emoji || '•'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-body text-sm font-medium ${done ? 'text-clinical-stone line-through' : 'text-clinical-charcoal'}`}>
                  {a.action}
                </p>
                {a.why && (
                  <p className="text-precision text-[0.65rem] text-clinical-stone mt-0.5">{a.why}</p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {allDone && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-precision text-[0.7rem] font-bold text-primary-container tracking-widest uppercase pt-2"
        >
          Done for today. See you tomorrow.
        </motion.div>
      )}
    </div>
  );
};
