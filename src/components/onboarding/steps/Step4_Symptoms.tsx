// src/components/onboarding/steps/Step4_Symptoms.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OnboardingShell } from '../OnboardingShell';
import { SYMPTOM_CATEGORIES } from '../../../data/symptoms';
import { useOnboardingStore } from '../../../store/onboardingStore';

export const Step4_Symptoms = () => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { nextStep, symptoms, addSymptom, removeSymptom, noSymptoms } = useOnboardingStore();
  const updateStep4 = useOnboardingStore(s => s.updateStep4);

  const isSelected = (symptom: string) => symptoms.some(s => s.symptom === symptom);
  const toggleSymptom = (symptom: string, category: string) => {
    if (isSelected(symptom)) { const f = symptoms.find(s => s.symptom === symptom); if (f) removeSymptom(f.id); }
    else {
      addSymptom({ symptom, category, severity: 5, duration: '1_6_months' });
      // Adding any symptom clears the "no symptoms" flag
      if (noSymptoms) updateStep4({ noSymptoms: false });
    }
  };

  // Validation: either at least one symptom OR explicit "no current symptoms".
  const canContinue = symptoms.length > 0 || noSymptoms;
  const errorMsg = canContinue ? null : 'Pick at least one symptom or confirm none below.';

  return (
    <OnboardingShell stepKey="step-4" title="How are you feeling?"
      description="Select all symptoms you experience regularly. Be thorough — this is how we connect your labs and medications to your day-to-day experience."
      onNext={async () => { if (canContinue) await nextStep(); }}
      nextDisabled={!canContinue}>
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

        {/* Severity slider removed — users were rating everything 5 by default
            anyway, which gave false signal. Just selecting a symptom is the
            signal; the deterministic engines fire workups for any selected
            symptom. (Backend stores severity 5 as a no-op default.) */}

        <button
          type="button"
          onClick={() => updateStep4({ noSymptoms: !noSymptoms })}
          disabled={symptoms.length > 0}
          className={`w-full px-4 py-3 text-left border transition-colors flex items-center gap-3 ${noSymptoms ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'} ${symptoms.length > 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          style={{ borderRadius: '4px' }}
        >
          <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noSymptoms ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
            {noSymptoms && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
          </div>
          <span className="text-body text-sm">I have no current symptoms</span>
        </button>

        {errorMsg && (
          <p className="text-precision text-[0.65rem] text-[#C94F4F] tracking-wide">{errorMsg}</p>
        )}
      </div>
    </OnboardingShell>
  );
};
