// src/components/medications/MedicationCard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DepletionEntry } from '../../data/medicationDepletions';
import { useEngineDepletions, lookupDepletions, lookupAlternatives, type EngineDepletion } from '../../hooks/useEngineDepletions';

// 2026-05-12-35: ENGINE-ONLY DATA SOURCE.
// The deterministic backend engine (35 drug classes, 314 brand/generic
// names, 54 depletion rules, 11 alternatives rules) is the single source
// of truth for the Medications tab. No client-side hardcoded fallback —
// if the engine doesn't recognize a med, the card shows a clean "no
// data" state. This guarantees zero drift between what the engine knows
// and what the UI renders.

// 2026-05-12-38: Map an engine depletion to the UI's DepletionEntry shape.
// Reads dose/form/timing directly from the EMBEDDED recommended_supplement
// (which the backend pulls from SUPPLEMENT_BASE — universal canonical
// data). No dependency on the user's filtered supplement_stack.
function engineToDepletionEntry(d: EngineDepletion): DepletionEntry {
  const supp = d.recommended_supplement;
  const sevMap: Record<string, DepletionEntry['severity']> = { high: 'critical', moderate: 'significant', low: 'moderate' };
  return {
    nutrient: d.nutrient,
    severity: sevMap[d.severity] ?? 'moderate',
    mechanism: d.mechanism,
    clinical_effects: d.clinical_effects ?? [],
    intervention: supp
      ? `${supp.nutrient}${supp.practical_note ? ` — ${supp.practical_note}` : ''}`
      : 'Discuss with your doctor whether repletion is right for you.',
    dose: supp?.dose ?? '—',
    form: supp?.form ?? '—',
    timing: supp?.timing ?? '—',
    contraindications: undefined,
  };
}

function severityConfig(s: string) {
  if (s === 'critical') return { border: 'border-l-4 border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'CRITICAL' };
  if (s === 'significant') return { border: 'border-l-4 border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'SIGNIFICANT' };
  return { border: 'border-l-4 border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'MODERATE' };
}

const DepletionRow = ({ dep, index }: { dep: DepletionEntry; index: number }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const cfg = severityConfig(dep.severity);

  return (
    <div className={`bg-clinical-white rounded-lg overflow-hidden ${cfg.border}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-left hover:bg-clinical-cream/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`${cfg.badge} text-precision text-[0.7rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
          <p className="text-body text-clinical-charcoal font-semibold text-sm">{dep.nutrient}</p>
        </div>
        <span className="material-symbols-outlined text-clinical-stone text-[18px] transition-transform duration-200 flex-shrink-0" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-5 pt-0 space-y-4 border-t border-outline-variant/10">
              <div className="pt-4"><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Mechanism</p><p className="text-body text-clinical-charcoal text-sm leading-relaxed">{dep.mechanism}</p></div>
              <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-2">Clinical Effects</p>
                <div className="flex flex-wrap gap-1.5">{dep.clinical_effects.map((e, i) => <span key={i} className="text-body text-clinical-charcoal text-xs bg-clinical-cream px-2 py-1" style={{ borderRadius: '3px' }}>{e}</span>)}</div>
              </div>
              <div className="bg-primary-container/5 border-l-4 border-primary-container p-4 rounded-r-lg">
                <p className="text-precision text-[0.6rem] text-primary-container uppercase tracking-widest font-bold mb-2">Recommended Intervention</p>
                <p className="text-body text-clinical-charcoal text-sm font-semibold mb-3">{dep.intervention}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2">
                  <div><p className="text-precision text-[0.7rem] text-clinical-stone uppercase tracking-wider mb-0.5">Dose</p><p className="text-body text-clinical-charcoal text-xs">{dep.dose}</p></div>
                  <div><p className="text-precision text-[0.7rem] text-clinical-stone uppercase tracking-wider mb-0.5">Form</p><p className="text-body text-clinical-charcoal text-xs font-medium">{dep.form}</p></div>
                  <div><p className="text-precision text-[0.7rem] text-clinical-stone uppercase tracking-wider mb-0.5">Timing</p><p className="text-body text-clinical-charcoal text-xs">{dep.timing}</p></div>
                </div>
                {dep.contraindications?.length && (
                  <div className="mt-3 pt-3 border-t border-primary-container/10">
                    <p className="text-precision text-[0.7rem] text-[#C94F4F] uppercase tracking-wider font-bold mb-1">Caution</p>
                    {dep.contraindications.map((c, i) => <p key={i} className="text-body text-[#C94F4F] text-xs">{c}</p>)}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface MedicationCardProps { medication: { id: string; name: string; dose?: string | null; is_active?: boolean }; index: number; }

function altTypeCfg(t: string) {
  if (t === 'pharmaceutical') return { color: '#1B4332', icon: 'medication', label: 'PHARMACEUTICAL' };
  if (t === 'natural') return { color: '#2A9D8F', icon: 'eco', label: 'NATURAL' };
  return { color: '#D4A574', icon: 'directions_run', label: 'LIFESTYLE' };
}

export const MedicationCard = ({ medication, index }: MedicationCardProps) => {
  const [open, setOpen] = useState(true);
  const [altsOpen, setAltsOpen] = useState(false);

  // Engine is the SINGLE SOURCE OF TRUTH. No client-data fallback —
  // if the engine doesn't recognize this med, the UI shows "No data
  // yet" instead of stale hardcoded content.
  const { data: engineMap } = useEngineDepletions();
  const engineDeps = lookupDepletions(engineMap, medication.name);
  const medClass = engineDeps[0]?.med_class;
  const engineAlts = lookupAlternatives(engineMap, medication.name, medClass);

  const profile = engineDeps.length > 0 ? {
    genericName: medication.name,
    brandNames: [] as string[],
    drugClass: medClass ?? '',
    depletions: engineDeps.map(d => engineToDepletionEntry(d)),
    interactions: [] as string[],
    notes: undefined as string | undefined,
  } : null;

  // Flatten engine alternatives into the flat UI shape (name/type/reason).
  // Pharmaceutical + natural lists come from the engine; lifestyle entries
  // appear when an engine rule includes them in natural_alternatives.
  const alternatives = engineAlts.flatMap(a => [
    ...a.pharmaceutical_alternatives.map(p => ({ name: p.name, type: 'pharmaceutical' as const, reason: p.reason })),
    ...a.natural_alternatives.map(n => ({ name: n.name, type: 'natural' as const, reason: n.reason })),
  ]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
      className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-6 text-left hover:bg-clinical-cream/20 transition-colors">
        <div>
          <h3 className="text-authority text-xl text-clinical-charcoal font-semibold">{medication.name}</h3>
          <div className="flex items-center gap-3 mt-1">
            {medication.dose && <span className="text-precision text-[0.6rem] text-clinical-stone">{medication.dose}</span>}
            {profile && <><span className="text-clinical-stone/30">·</span><span className="text-precision text-[0.6rem] text-clinical-stone">{profile.drugClass}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {profile ? (
            profile.depletions.length > 0 ? (
              <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-[#614018] text-[#FFDCBC]" style={{ borderRadius: '3px' }}>{profile.depletions.length} DEPLETIONS</span>
            ) : (
              <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-primary-container/20 text-primary-container" style={{ borderRadius: '3px' }}>TARGETED THERAPY</span>
            )
          ) : (
            <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-surface-container text-on-surface-variant" style={{ borderRadius: '3px' }}>NO DATA</span>
          )}
          {alternatives.length > 0 && (
            <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-[#2A9D8F] text-white" style={{ borderRadius: '3px' }}>{alternatives.length} ALTERNATIVES</span>
          )}
          <span className="material-symbols-outlined text-clinical-stone text-[20px] transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-6 pb-6 pt-0 space-y-3 border-t border-outline-variant/10">
              {profile ? (
                <>
                  {profile.notes && <div className="pt-4 pb-2"><p className="text-body text-clinical-stone text-sm italic leading-relaxed">{profile.notes}</p></div>}
                  {profile.depletions.map((dep, i) => <DepletionRow key={dep.nutrient} dep={dep} index={i} />)}
                </>
              ) : (
                <div className="py-6 text-center"><p className="text-body text-clinical-stone text-sm">No depletion data available for this medication.</p></div>
              )}

              {/* Alternatives section */}
              {alternatives.length > 0 && (
                <div className="bg-[#2A9D8F]/5 border border-[#2A9D8F]/20 rounded-lg overflow-hidden mt-4">
                  <button onClick={() => setAltsOpen(!altsOpen)} className="w-full flex items-center justify-between p-4 text-left hover:bg-[#2A9D8F]/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#2A9D8F] text-[20px]">swap_horiz</span>
                      <div>
                        <p className="text-body text-clinical-charcoal font-semibold text-sm">Healthier Alternatives</p>
                        <p className="text-precision text-[0.6rem] text-clinical-stone">{alternatives.length} options to discuss with your doctor</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[#2A9D8F] text-[18px] transition-transform duration-200" style={{ transform: altsOpen ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
                  </button>
                  <AnimatePresence>
                    {altsOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="p-4 pt-0 border-t border-[#2A9D8F]/15">
                          <div className="bg-white rounded-lg p-3 mb-3">
                            <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
                              <span className="font-semibold">Don't stop or switch medications without your prescriber.</span> These are evidence-based alternatives — pharmaceutical, natural, and lifestyle — to discuss at your next visit. The right choice depends on your full clinical picture.
                            </p>
                          </div>
                          <div className="space-y-2.5">
                            {alternatives.map((alt, i) => {
                              const cfg = altTypeCfg(alt.type);
                              return (
                                <div key={i} className="bg-white rounded-lg p-3 border-l-4" style={{ borderLeftColor: cfg.color }}>
                                  <div className="flex items-start gap-3">
                                    <span className="material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <p className="text-body text-clinical-charcoal text-sm font-semibold">{alt.name}</p>
                                        <span className="text-precision text-[0.7rem] font-bold px-1.5 py-0.5 tracking-widest" style={{ borderRadius: '2px', backgroundColor: `${cfg.color}15`, color: cfg.color }}>{cfg.label}</span>
                                      </div>
                                      <p className="text-body text-clinical-stone text-xs leading-relaxed">{alt.reason}</p>
                                      {(alt as any).caution && (
                                        <p className="text-body text-[#C94F4F] text-xs leading-relaxed mt-1.5 italic">⚠ {(alt as any).caution}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
