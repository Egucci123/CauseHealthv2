// GoalTargetsCard.tsx
// ──────────────────────────────────────────────────────────────────────
// "From here / To here" — concrete numeric targets the engine derived
// per marker from the user's primary goal + current values. Each card
// shows today's value, the goal, and the delta the patient is aiming at.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  targets?: WellnessPlanData['goal_targets'];
}

export const GoalTargetsCard = ({ targets }: Props) => {
  const list = Array.isArray(targets) ? targets : [];
  if (list.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map((t, i) => (
        <div key={t.key ?? i} className="bg-clinical-white rounded-[10px] p-4 border border-outline-variant/10">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">
              <span className="mr-1.5">{t.emoji}</span>{t.marker}
            </p>
            <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wider uppercase">{t.confidence}</span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-precision text-clinical-stone text-sm">{t.today}</span>
            <span className="material-symbols-outlined text-clinical-stone/40 text-[16px]">arrow_right_alt</span>
            <span className="text-precision text-clinical-charcoal text-sm font-bold">{t.goal}</span>
            <span className="text-body text-clinical-stone text-xs">{t.unit}</span>
          </div>
          <p className="text-precision text-[0.65rem] text-primary-container font-bold tracking-wide">{t.deltaText}</p>
        </div>
      ))}
    </div>
  );
};
