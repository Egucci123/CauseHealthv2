// SuboptimalFlagsList.tsx
// ──────────────────────────────────────────────────────────────────────
// "Watch list" — values that are in the LAB's normal range but outside
// the age/sex-specific OPTIMAL range. Engine emits these so users see
// markers worth tracking before they become formally abnormal.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  flags?: WellnessPlanData['suboptimal_flags'];
}

export const SuboptimalFlagsList = ({ flags }: Props) => {
  const list = Array.isArray(flags) ? flags : [];
  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      {list.map((f, i) => {
        const aboveOptimal = f.optimalHigh != null && f.value > f.optimalHigh;
        const belowOptimal = f.optimalLow != null && f.value < f.optimalLow;
        const direction = aboveOptimal ? 'above optimal' : belowOptimal ? 'below optimal' : 'outside optimal';
        return (
          <div key={i} className="bg-clinical-cream/40 rounded-[8px] p-3 border-l-2 border-[#E89D3C]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-body text-clinical-charcoal font-semibold text-sm">{f.marker}</p>
              <p className="text-precision text-sm text-[#B86E15] font-bold">
                {f.value} {f.unit}
                {(f.optimalLow != null || f.optimalHigh != null) && (
                  <span className="text-[0.65rem] tracking-wide uppercase ml-2 text-clinical-stone">
                    optimal {f.optimalLow ?? '?'}–{f.optimalHigh ?? '?'}
                  </span>
                )}
              </p>
            </div>
            <p className="text-precision text-[0.6rem] text-[#B86E15] tracking-wider uppercase mb-1">{direction}</p>
            <p className="text-body text-clinical-stone text-xs leading-relaxed">{f.rationale}</p>
          </div>
        );
      })}
    </div>
  );
};
