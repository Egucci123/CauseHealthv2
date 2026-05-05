// src/components/doctorprep/PossibleConditionsCard.tsx
//
// Doctor-prep "Possible conditions to investigate" — distinct from
// `tests_to_request` (the baseline-gap list). This is the differential:
// patterns the data fits that the patient hasn't been diagnosed with,
// each with its own confirmatory_tests + ICD-10 + script for the visit.

import type { DoctorPrepDocument } from '../../hooks/useDoctorPrep';
import { FolderSection } from '../ui/FolderSection';

type SuspectedCondition = NonNullable<DoctorPrepDocument['possible_conditions']>[number];

const CONFIDENCE_STYLES: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  high:     { label: 'HIGH CONFIDENCE',     dot: '#C94F4F', bg: 'bg-[#C94F4F]/10', text: 'text-[#C94F4F]' },
  moderate: { label: 'MODERATE CONFIDENCE', dot: '#E8922A', bg: 'bg-[#E8922A]/10', text: 'text-[#E8922A]' },
  low:      { label: 'LOW CONFIDENCE',      dot: '#8A7E6B', bg: 'bg-[#8A7E6B]/10', text: 'text-[#8A7E6B]' },
};

export const PossibleConditionsCard = ({ conditions }: { conditions: SuspectedCondition[] }) => {
  if (!conditions?.length) return null;

  const order: Record<string, number> = { high: 0, moderate: 1, low: 2 };
  const sorted = [...conditions].sort((a, b) => {
    const ac = order[(a.confidence ?? 'low').toLowerCase()] ?? 3;
    const bc = order[(b.confidence ?? 'low').toLowerCase()] ?? 3;
    return ac - bc;
  });

  return (
    <FolderSection
      icon="quiz"
      title="Possible conditions to investigate"
      count={sorted.length}
      countLabel={sorted.length === 1 ? 'pattern' : 'patterns'}
      explanation="Differential diagnosis: patterns in the patient's labs and symptoms that fit conditions not on their problem list. Each entry lists the confirmatory workup. Distinct from the baseline retest list above."
      accentColor="#C94F4F"
      defaultOpen
    >
      <div className="space-y-4">
        {sorted.map((c, i) => {
          const conf = (c.confidence ?? 'low').toLowerCase();
          const style = CONFIDENCE_STYLES[conf] ?? CONFIDENCE_STYLES.low;
          return (
            <div key={i} className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#C94F4F] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-authority text-xl text-clinical-charcoal font-semibold leading-tight">
                    {c.name}
                  </h4>
                  {c.icd10 && (
                    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest mt-1">
                      ICD-10 · {c.icd10}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${style.bg}`} style={{ borderRadius: '2px' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
                  <span className={`text-precision text-[0.6rem] font-bold tracking-widest ${style.text}`}>
                    {style.label}
                  </span>
                </span>
              </div>

              {c.evidence && (
                <div className="mb-4">
                  <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">
                    Why this is on the differential
                  </p>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{c.evidence}</p>
                </div>
              )}

              {Array.isArray(c.confirmatory_tests) && c.confirmatory_tests.length > 0 && (
                <div className="mb-4">
                  <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-2">
                    Tests to confirm
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {c.confirmatory_tests.map((t, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-clinical-cream/60" style={{ borderRadius: '2px' }}>
                        <span className="material-symbols-outlined text-[12px] text-clinical-stone">science</span>
                        <span className="text-body text-clinical-charcoal text-xs">{t}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {c.what_to_ask_doctor && (
                <div className="p-3 bg-clinical-cream/40 border-l-2 border-primary-container rounded-r">
                  <p className="text-precision text-[0.6rem] text-primary-container tracking-widest uppercase mb-1">
                    Script for the visit
                  </p>
                  <p className="text-body text-clinical-charcoal text-sm italic leading-relaxed">"{c.what_to_ask_doctor}"</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FolderSection>
  );
};
