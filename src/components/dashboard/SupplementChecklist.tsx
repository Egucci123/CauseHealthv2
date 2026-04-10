// src/components/dashboard/SupplementChecklist.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useSupplementCompliance, useToggleCompliance, useComplianceStreak } from '../../hooks/useProgress';
import { useActivePlan } from '../../hooks/useWellnessPlan';
import { useMedications } from '../../hooks/useMedications';
import { MEDICATIONS } from '../../data/medications';
import { DEPLETIONS } from '../../data/depletions';
import { SectionLabel } from '../ui/SectionLabel';

function useSupplementList() {
  const { data: plan } = useActivePlan();
  const { data: meds } = useMedications();

  // Check actual wellness plan format (supplement_stack array from AI)
  const planData = plan?.planData as Record<string, any> | null;
  if (planData?.supplement_stack && Array.isArray(planData.supplement_stack) && planData.supplement_stack.length > 0) {
    return planData.supplement_stack.map((s: any) => s.nutrient || s.name).filter(Boolean) as string[];
  }

  // Legacy format (tiered)
  if (planData?.supplementStack?.tier1) {
    return planData.supplementStack.tier1.map((s: any) => s.name).filter(Boolean) as string[];
  }

  // Fallback: derive from medication depletions
  if (meds && meds.length > 0) {
    const depKeys = new Set<string>();
    meds.forEach(med => {
      const dbMed = MEDICATIONS.find(m => m.generic.toLowerCase() === med.name.toLowerCase());
      dbMed?.depletes.forEach(k => depKeys.add(k));
    });
    return [...depKeys].map(key => DEPLETIONS[key]?.nutrient).filter(Boolean) as string[];
  }

  return [];
}

const SupplementRow = ({ name, taken, onToggle }: { name: string; taken: boolean; onToggle: () => void }) => (
  <motion.div layout className={`flex items-center gap-4 py-3 border-b border-outline-variant/5 last:border-0 transition-opacity ${taken ? 'opacity-60' : ''}`}>
    <button onClick={onToggle} className="flex-shrink-0 focus:outline-none" aria-label={`Mark ${name} as ${taken ? 'not taken' : 'taken'}`}>
      <motion.div animate={taken ? { backgroundColor: '#1B4332', borderColor: '#1B4332', scale: [1, 1.15, 1] } : { backgroundColor: 'transparent', borderColor: '#414844', scale: 1 }} transition={{ duration: 0.2 }}
        className="w-5 h-5 border-2 flex items-center justify-center" style={{ borderRadius: '3px' }}>
        <AnimatePresence>
          {taken && <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="material-symbols-outlined text-white text-[14px]">check</motion.span>}
        </AnimatePresence>
      </motion.div>
    </button>
    <span className={`text-body text-sm flex-1 ${taken ? 'text-clinical-stone line-through' : 'text-clinical-charcoal'}`}>{name}</span>
    {taken && <span className="material-symbols-outlined text-[#D4A574] text-[16px]">check_circle</span>}
  </motion.div>
);

export const SupplementChecklist = () => {
  const supplements = useSupplementList();
  const { data: compliance } = useSupplementCompliance();
  const { mutate: toggle } = useToggleCompliance();
  const { data: streak } = useComplianceStreak();

  const taken = (name: string) => compliance?.find(c => c.supplementName === name)?.taken ?? false;
  const totalTaken = supplements.filter(name => taken(name)).length;
  const allTaken = supplements.length > 0 && totalTaken === supplements.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel className="mb-0">Today's Protocol</SectionLabel>
        {streak !== undefined && streak > 0 && <div className="flex items-center gap-1.5"><span className="text-lg">🔥</span><span className="text-precision text-[0.68rem] text-clinical-stone tracking-wide">{streak} day streak</span></div>}
      </div>

      {supplements.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{totalTaken} of {supplements.length} taken</span>
            {allTaken && <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-precision text-[0.6rem] text-[#D4A574] font-bold tracking-wider uppercase">Complete</motion.span>}
          </div>
          <div className="h-1 bg-outline-variant/20 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: allTaken ? '#D4A574' : '#1B4332' }} initial={{ width: 0 }} animate={{ width: `${(totalTaken / supplements.length) * 100}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>
      )}

      {supplements.length === 0 ? (
        <div className="py-6 text-center">
          <span className="material-symbols-outlined text-clinical-stone text-3xl mb-2 block">medication</span>
          <p className="text-body text-clinical-stone text-sm">Your supplement checklist will appear after your wellness plan is generated.</p>
        </div>
      ) : (
        <div>{supplements.map(name => <SupplementRow key={name} name={name} taken={taken(name)} onToggle={() => toggle({ supplementName: name, taken: !taken(name) })} />)}</div>
      )}

      <AnimatePresence>
        {allTaken && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 bg-primary-container/5 border border-primary-container/20 rounded-lg p-4 text-center">
            <p className="text-body text-primary-container text-sm font-medium">All supplements taken for today.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
