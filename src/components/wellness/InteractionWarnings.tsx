// src/components/wellness/InteractionWarnings.tsx
//
// Surfaces drug–supplement interactions found by the safety engine.
// 'block' severity items have already been REMOVED from supplement_stack —
// rendered here so the user knows we considered + skipped them. 'caution'
// items remain in the stack with the warning attached.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

type InteractionWarning = NonNullable<WellnessPlanData['interaction_warnings']>[number];

const STYLES = {
  block:   { label: 'BLOCKED',  border: 'border-[#C94F4F]', bg: 'bg-[#C94F4F]/10', dot: '#C94F4F' },
  caution: { label: 'CAUTION',  border: 'border-[#E8922A]', bg: 'bg-[#E8922A]/10', dot: '#E8922A' },
};

export const InteractionWarnings = ({ warnings }: { warnings: InteractionWarning[] }) => {
  if (!warnings?.length) return null;

  // Sort: block first, then caution
  const sorted = [...warnings].sort((a, b) => (a.severity === 'block' ? -1 : 1) - (b.severity === 'block' ? -1 : 1));

  return (
    <div className="space-y-3">
      <p className="text-body text-clinical-stone text-sm leading-relaxed">
        We checked every recommended supplement against your medications. Here's what we found.
        Items marked <span className="font-semibold text-[#C94F4F]">BLOCKED</span> were removed from your stack;
        items marked <span className="font-semibold text-[#E8922A]">CAUTION</span> are still recommended but with a warning.
      </p>

      <div className="space-y-2">
        {sorted.map((w, i) => {
          const s = STYLES[w.severity] ?? STYLES.caution;
          return (
            <div key={i} className={`bg-clinical-white border-l-4 ${s.border} rounded-r p-4`}>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5" style={{ color: s.dot }}>
                  {w.severity === 'block' ? 'block' : 'warning'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 ${s.bg}`} style={{ borderRadius: '2px' }}>
                      <span className="text-precision text-[0.6rem] font-bold tracking-widest" style={{ color: s.dot }}>
                        {s.label}
                      </span>
                    </span>
                    <span className="text-body text-clinical-charcoal text-sm font-semibold">
                      {w.supplement}
                    </span>
                    <span className="text-body text-clinical-stone text-xs">×</span>
                    <span className="text-body text-clinical-charcoal text-sm font-semibold">
                      {w.medication}
                    </span>
                  </div>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                    {w.warning}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider leading-relaxed mt-2">
        These are general interactions from public databases — your pharmacist or prescriber knows your full picture and should always make the final call.
      </p>
    </div>
  );
};
