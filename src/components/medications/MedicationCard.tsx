// src/components/medications/MedicationCard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDepletionProfile, type DepletionEntry } from '../../data/medicationDepletions';

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
          <span className={`${cfg.badge} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
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
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider mb-0.5">Dose</p><p className="text-body text-clinical-charcoal text-xs">{dep.dose}</p></div>
                  <div><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider mb-0.5">Form</p><p className="text-body text-clinical-charcoal text-xs font-medium">{dep.form}</p></div>
                  <div><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider mb-0.5">Timing</p><p className="text-body text-clinical-charcoal text-xs">{dep.timing}</p></div>
                </div>
                {dep.contraindications?.length && (
                  <div className="mt-3 pt-3 border-t border-primary-container/10">
                    <p className="text-precision text-[0.55rem] text-[#C94F4F] uppercase tracking-wider font-bold mb-1">Caution</p>
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

export const MedicationCard = ({ medication, index }: MedicationCardProps) => {
  const [open, setOpen] = useState(true);
  const profile = getDepletionProfile(medication.name);

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
            <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-[#614018] text-[#FFDCBC]" style={{ borderRadius: '3px' }}>{profile.depletions.length} DEPLETIONS</span>
          ) : (
            <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-surface-container text-on-surface-variant" style={{ borderRadius: '3px' }}>NO DATA</span>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
