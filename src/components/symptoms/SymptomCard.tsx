// src/components/symptoms/SymptomCard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Symptom, SymptomAnalysis } from '../../hooks/useSymptoms';

function severityColor(s: number) { return s >= 8 ? '#C94F4F' : s >= 5 ? '#E8922A' : '#D4A574'; }
function causeTypeIcon(t: string) { return ({ lab_finding: 'biotech', medication_depletion: 'medication', autoimmune: 'coronavirus', lifestyle: 'self_improvement' })[t] ?? 'info'; }

interface SymptomCardProps { symptom: Symptom; analysis: SymptomAnalysis['symptom_connections'][0] | null; index: number; }

export const SymptomCard = ({ symptom, analysis, index }: SymptomCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const color = severityColor(symptom.severity);
  const hasCauses = (analysis?.root_causes?.length ?? 0) > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="bg-clinical-white rounded-[10px] shadow-card border-l-4 overflow-hidden" style={{ borderLeftColor: color }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-5 text-left hover:bg-clinical-cream/30 transition-colors">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className="text-precision text-lg font-bold" style={{ color }}>{symptom.severity}</span>
            <span className="text-precision text-[0.55rem] text-clinical-stone">/10</span>
          </div>
          <div>
            <p className="text-body text-clinical-charcoal font-semibold">{symptom.symptom}</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider mt-0.5">{symptom.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasCauses ? (
            <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 bg-primary-container text-white" style={{ borderRadius: '2px' }}>{analysis!.root_causes.length} CAUSE{analysis!.root_causes.length > 1 ? 'S' : ''} FOUND</span>
          ) : (
            <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 bg-surface-container text-on-surface-variant" style={{ borderRadius: '2px' }}>NO DATA</span>
          )}
          <span className="material-symbols-outlined text-clinical-stone text-[18px] transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-5 pb-5 pt-0 border-t border-outline-variant/10">
              {!hasCauses ? (
                <p className="text-body text-clinical-stone text-sm pt-4 text-center py-4">Run symptom analysis to identify potential root causes.</p>
              ) : (
                <div className="pt-4 space-y-4">
                  <div className="space-y-3">
                    {analysis!.root_causes.map((cause, i) => (
                      <div key={i} className="bg-clinical-cream rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-outlined text-primary-container text-[16px]">{causeTypeIcon(cause.type)}</span>
                          <p className="text-body text-clinical-charcoal font-semibold text-sm">{cause.cause}</p>
                          <span className="text-precision text-[0.55rem] text-clinical-stone ml-auto">{cause.confidence === 'high' ? '●●●' : cause.confidence === 'moderate' ? '●●○' : '●○○'}</span>
                        </div>
                        <p className="text-body text-clinical-stone text-sm leading-relaxed">{cause.evidence}</p>
                        {cause.lab_marker && <div className="mt-2"><span className="text-precision text-[0.55rem] font-medium text-clinical-stone border border-outline-variant/30 px-2 py-0.5" style={{ borderRadius: '2px' }}>{cause.lab_marker}</span></div>}
                      </div>
                    ))}
                  </div>
                  {analysis!.interventions?.length > 0 && (
                    <div className="border-l-4 border-primary-container bg-primary-container/5 p-4 rounded-r-lg">
                      <p className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase mb-2">Interventions</p>
                      <ul className="space-y-1.5">
                        {analysis!.interventions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-primary-container text-[14px] mt-0.5 flex-shrink-0">arrow_right</span>
                            <p className="text-body text-clinical-charcoal text-sm">{action}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
