// src/components/onboarding/steps/Step4_Symptoms.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OnboardingShell } from '../OnboardingShell';
import { SYMPTOM_CATEGORIES } from '../../../data/symptoms';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { SectionLabel } from '../../ui/SectionLabel';

export const Step4_Symptoms = () => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { nextStep, symptoms, addSymptom, removeSymptom, updateSymptom } = useOnboardingStore();

  const isSelected = (symptom: string) => symptoms.some(s => s.symptom === symptom);
  const toggleSymptom = (symptom: string, category: string) => {
    if (isSelected(symptom)) { const f = symptoms.find(s => s.symptom === symptom); if (f) removeSymptom(f.id); }
    else addSymptom({ symptom, category, severity: 5, duration: '1_6_months' });
  };

  return (
    <OnboardingShell stepKey="step-4" title="How are you feeling?"
      description="Select all symptoms you experience regularly. Be thorough — this is how we connect your labs and medications to your day-to-day experience."
      onNext={async () => { await nextStep(); }} showSkip onSkip={async () => { await nextStep(); }}>
      <div className="space-y-4">
        {symptoms.length > 0 && (
          <div className="bg-primary-container/5 border border-primary-container/20 rounded-lg px-4 py-3">
            <p className="text-body text-primary-container text-sm font-medium">{symptoms.length} symptom{symptoms.length !== 1 ? 's' : ''} selected</p>
          </div>
        )}

        {SYMPTOM_CATEGORIES.map(category => {
          const isOpen = activeCategory === category.id;
          const selectedCount = symptoms.filter(s => s.category === category.id).length;
          return (
            <div key={category.id} className="bg-clinical-white rounded-[10px] overflow-hidden border border-outline-variant/10">
              <button onClick={() => setActiveCategory(isOpen ? null : category.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-clinical-cream/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-clinical-stone text-[20px]">{category.icon}</span>
                  <span className="text-body text-clinical-charcoal font-medium">{category.label}</span>
                  {selectedCount > 0 && <span className="inline-block bg-primary-container text-white text-precision text-[0.6rem] px-2 py-0.5 font-bold">{selectedCount}</span>}
                </div>
                <span className={`material-symbols-outlined text-clinical-stone text-[18px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-5 pt-1 border-t border-outline-variant/10">
                      <div className="flex flex-wrap gap-2 mt-3">
                        {category.symptoms.map(symptom => {
                          const selected = isSelected(symptom);
                          return (
                            <button key={symptom} onClick={() => toggleSymptom(symptom, category.id)} style={{ borderRadius: '4px' }}
                              className={`text-body text-sm px-3 py-2 border transition-all ${selected ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-primary-container/40'}`}>
                              {selected && <span className="material-symbols-outlined text-[12px] mr-1">check</span>}{symptom}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {symptoms.length > 0 && (
          <div className="mt-4">
            <SectionLabel>Rate Your Severity</SectionLabel>
            <div className="space-y-3">
              {symptoms.slice(0, 5).map(sym => (
                <div key={sym.id} className="bg-clinical-white rounded-lg p-4 border border-outline-variant/10">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-body text-clinical-charcoal text-sm font-medium">{sym.symptom}</p>
                    <span className="text-precision text-[0.68rem] text-clinical-stone">{sym.severity}/10</span>
                  </div>
                  <input type="range" min={1} max={10} value={sym.severity} onChange={e => updateSymptom(sym.id, { severity: parseInt(e.target.value) })} className="w-full accent-primary-container cursor-pointer" />
                  <div className="flex justify-between mt-1">
                    <span className="text-precision text-[0.6rem] text-clinical-stone">Mild</span>
                    <span className="text-precision text-[0.6rem] text-clinical-stone">Severe</span>
                  </div>
                </div>
              ))}
              {symptoms.length > 5 && <p className="text-body text-clinical-stone text-xs text-center">+ {symptoms.length - 5} more symptoms selected. Rate them in your full profile.</p>}
            </div>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
};
