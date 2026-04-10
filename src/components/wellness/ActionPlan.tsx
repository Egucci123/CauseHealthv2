// src/components/wellness/ActionPlan.tsx
import { SectionLabel } from '../ui/SectionLabel';
import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

const PHASE_COLORS = [
  { border: 'border-[#C94F4F]', dot: '#C94F4F', bg: 'bg-[#C94F4F]/5' },
  { border: 'border-[#E8922A]', dot: '#E8922A', bg: 'bg-[#E8922A]/5' },
  { border: 'border-[#D4A574]', dot: '#D4A574', bg: 'bg-[#D4A574]/5' },
];

export const ActionPlan = ({ actionPlan, retestTimeline }: { actionPlan: WellnessPlanData['action_plan']; retestTimeline: WellnessPlanData['retest_timeline'] }) => {
  const phases = [actionPlan.phase_1, actionPlan.phase_2, actionPlan.phase_3];

  return (
    <div className="space-y-6">
      <SectionLabel icon="event_note">90-Day Action Plan</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {phases.map((phase, i) => {
          const color = PHASE_COLORS[i];
          return (
            <div key={i} className={`bg-clinical-white rounded-[10px] shadow-card border-l-4 ${color.border} p-6`}>
              <div className={`inline-block px-3 py-1 rounded-full ${color.bg} mb-4`}>
                <span className="text-precision text-[0.6rem] font-bold tracking-widest" style={{ color: color.dot }}>PHASE {i + 1}</span>
              </div>
              <h4 className="text-authority text-lg text-clinical-charcoal font-semibold mb-2">{phase.name}</h4>
              <p className="text-body text-clinical-stone text-sm mb-4 leading-relaxed">{phase.focus}</p>
              <ul className="space-y-2">
                {phase.actions.map((action, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: color.dot }} />
                    <p className="text-body text-clinical-charcoal text-sm">{action}</p>
                  </li>
                ))}
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
