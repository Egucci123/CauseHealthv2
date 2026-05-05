// src/components/wellness/PossibleConditions.tsx
//
// Differential-diagnosis card. Renders `suspected_conditions` produced by
// the wellness-plan engine (AI open-ended reasoning + deterministic
// backstop). Distinct from the retest list:
//
//   retest_timeline       = "the baseline tests your doctor should have ordered"
//   suspected_conditions  = "if these patterns are real, here's how to confirm"
//
// We split them because the audience reads them differently — retest is a
// polite gap-fill, this is a differential-workup ask.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

type SuspectedCondition = NonNullable<WellnessPlanData['suspected_conditions']>[number];

interface PossibleConditionsProps {
  conditions: SuspectedCondition[];
}

const CONFIDENCE_STYLES: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  high:     { label: 'HIGH',     dot: '#C94F4F', bg: 'bg-[#C94F4F]/10', text: 'text-[#C94F4F]' },
  moderate: { label: 'MODERATE', dot: '#E8922A', bg: 'bg-[#E8922A]/10', text: 'text-[#E8922A]' },
  low:      { label: 'LOW',      dot: '#8A7E6B', bg: 'bg-[#8A7E6B]/10', text: 'text-[#8A7E6B]' },
};

export const PossibleConditions = ({ conditions }: PossibleConditionsProps) => {
  if (!conditions?.length) return null;

  // Sort: high → moderate → low; deterministic-backstop entries pinned within tier.
  const order = { high: 0, moderate: 1, low: 2 } as Record<string, number>;
  const sorted = [...conditions].sort((a, b) => {
    const ac = order[(a.confidence ?? 'low').toLowerCase()] ?? 3;
    const bc = order[(b.confidence ?? 'low').toLowerCase()] ?? 3;
    if (ac !== bc) return ac - bc;
    if (a.source === 'deterministic' && b.source !== 'deterministic') return -1;
    if (b.source === 'deterministic' && a.source !== 'deterministic') return 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      <div className="bg-[#C94F4F]/5 border-l-4 border-[#C94F4F] rounded-r p-4">
        <p className="text-precision text-[0.6rem] text-[#C94F4F] tracking-widest font-bold uppercase mb-1">
          Not a diagnosis
        </p>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
          These are pattern-matches against your data — informational only. Only your physician can diagnose a condition. Bring this list to your visit as a starting point for discussion, not a conclusion.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map((c, i) => {
          const conf = (c.confidence ?? 'low').toLowerCase();
          const style = CONFIDENCE_STYLES[conf] ?? CONFIDENCE_STYLES.low;
          return (
            <div
              key={i}
              className="bg-clinical-white border border-clinical-cream rounded-[10px] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-authority text-base sm:text-lg text-clinical-charcoal font-semibold leading-tight">
                    {c.name}
                  </h4>
                  {c.icd10 && (
                    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest mt-0.5">
                      ICD-10 · {c.icd10}
                    </p>
                  )}
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${style.bg}`}>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: style.dot }}
                  />
                  <span className={`text-precision text-[0.6rem] font-bold tracking-widest ${style.text}`}>
                    {style.label} CONFIDENCE
                  </span>
                </div>
              </div>

              {c.evidence && (
                <div className="mt-3">
                  <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-1">
                    Why we flagged it
                  </p>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                    {c.evidence}
                  </p>
                </div>
              )}

              {Array.isArray(c.confirmatory_tests) && c.confirmatory_tests.length > 0 && (
                <div className="mt-3">
                  <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-1.5">
                    Tests to confirm
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.confirmatory_tests.map((t, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-clinical-cream/60 rounded-md"
                      >
                        <span className="material-symbols-outlined text-[12px] text-clinical-stone">science</span>
                        <span className="text-body text-clinical-charcoal text-xs">{t}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {c.what_to_ask_doctor && (
                <div className="mt-3 p-3 bg-clinical-cream/40 border-l-2 border-primary-container rounded-r">
                  <p className="text-precision text-[0.6rem] text-primary-container tracking-widest uppercase mb-1">
                    What to ask your doctor
                  </p>
                  <p className="text-body text-clinical-charcoal text-sm italic leading-relaxed">
                    "{c.what_to_ask_doctor}"
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider leading-relaxed mt-2">
        These are pattern matches against your data — not a diagnosis. Only your doctor can diagnose.
      </p>
    </div>
  );
};
