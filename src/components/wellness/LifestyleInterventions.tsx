// src/components/wellness/LifestyleInterventions.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SectionLabel } from '../ui/SectionLabel';

const TABS = [
  { id: 'diet', label: 'Diet', icon: 'restaurant' },
  { id: 'sleep', label: 'Sleep', icon: 'bedtime' },
  { id: 'exercise', label: 'Exercise', icon: 'fitness_center' },
  { id: 'stress', label: 'Stress', icon: 'self_improvement' },
];

function priorityDot(p: string) { return p === 'high' ? '#C94F4F' : p === 'moderate' ? '#E8922A' : '#D4A574'; }

interface Intervention { intervention: string; rationale: string; priority: string; }

export const LifestyleInterventions = ({ interventions }: { interventions: { diet: Intervention[]; sleep: Intervention[]; exercise: Intervention[]; stress: Intervention[] } }) => {
  const [activeTab, setActiveTab] = useState<'diet' | 'sleep' | 'exercise' | 'stress'>('diet');
  const [expanded, setExpanded] = useState<number | null>(null);
  const items = interventions[activeTab] ?? [];

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container overflow-hidden">
      <div className="p-8">
        <SectionLabel icon="self_improvement" className="mb-6">Lifestyle Interventions</SectionLabel>
        <div className="flex border-b border-outline-variant/10 mb-6 -mx-8 px-8">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setExpanded(null); }}
              className={`flex items-center gap-2 px-4 py-3 text-precision text-[0.68rem] font-bold tracking-wider uppercase border-b-2 transition-all ${activeTab === tab.id ? 'border-primary-container text-primary-container' : 'border-transparent text-clinical-stone hover:text-clinical-charcoal'}`}>
              <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="border border-outline-variant/10 rounded-lg overflow-hidden">
                <button onClick={() => setExpanded(expanded === i ? null : i)} className="w-full flex items-center justify-between p-4 text-left hover:bg-clinical-cream/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityDot(item.priority) }} />
                    <p className="text-body text-clinical-charcoal text-sm font-medium">{item.intervention}</p>
                  </div>
                  <span className="material-symbols-outlined text-clinical-stone text-[18px] flex-shrink-0 transition-transform duration-200" style={{ transform: expanded === i ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
                </button>
                <AnimatePresence>
                  {expanded === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-4 pb-4 pt-0 border-t border-outline-variant/10">
                        <p className="text-body text-clinical-stone text-sm leading-relaxed pt-3">{item.rationale}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {items.length === 0 && <p className="text-body text-clinical-stone text-sm text-center py-6">No {activeTab} interventions generated.</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
