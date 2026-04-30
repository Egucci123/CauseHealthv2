// src/components/onboarding/steps/Step2_Diagnoses.tsx
import { OnboardingShell } from '../OnboardingShell';
import { ConditionSearch } from '../ConditionSearch';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { SectionLabel } from '../../ui/SectionLabel';

const FAMILY_HISTORY_OPTIONS = [
  { key: 'heartDisease', label: 'Heart disease' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'autoimmune', label: 'Autoimmune conditions' },
  { key: 'cancer', label: 'Cancer' },
  { key: 'earlyDeath', label: 'Early death (under 60)' },
  { key: 'highCholesterol', label: 'High cholesterol' },
] as const;

export const Step2_Diagnoses = () => {
  const { nextStep, familyHistory, updateStep2, geneticTesting, conditions, addCondition, removeCondition } = useOnboardingStore();

  const toggleFamilyHistory = (key: string) => {
    updateStep2({ familyHistory: { ...familyHistory, [key]: !familyHistory[key as keyof typeof familyHistory] } });
  };

  // Bridge ConditionSearch's prop interface to the onboarding store. Settings
  // does the same with React Query mutations — same component, same UX.
  const handleAdd = (c: { name: string; icd10?: string }) => addCondition(c);
  const handleRemove = (idOrName: string) => {
    const found = conditions.find(c => c.id === idOrName) ?? conditions.find(c => c.name === idOrName);
    if (found) removeCondition(found.id);
  };

  return (
    <OnboardingShell stepKey="step-2" title="Any diagnosed conditions?"
      description="Include current and past diagnoses. This lets us flag autoimmune cascade risks and connect medications to the right conditions."
      onNext={async () => { await nextStep(); }} showSkip onSkip={async () => { await nextStep(); }}>
      <div className="space-y-10">
        <ConditionSearch conditions={conditions} onAdd={handleAdd} onRemove={handleRemove} />
        <div>
          <SectionLabel>Family History</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FAMILY_HISTORY_OPTIONS.map(({ key, label }) => {
              const checked = familyHistory[key as keyof typeof familyHistory];
              return (
                <button key={key} onClick={() => toggleFamilyHistory(key)} style={{ borderRadius: '4px' }}
                  className={`flex items-center gap-3 px-4 py-3 text-left border transition-all duration-150 ${checked ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                  <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${checked ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
                    {checked && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                  </div>
                  <span className="text-body text-sm">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <SectionLabel>Genetic Testing Done?</SectionLabel>
          <div className="flex gap-2">
            {[{ value: 'yes', label: 'Yes' }, { value: 'in_progress', label: 'In Progress' }, { value: 'no', label: 'No' }].map(opt => (
              <button key={opt.value} onClick={() => updateStep2({ geneticTesting: opt.value as 'yes' | 'no' | 'in_progress' })} style={{ borderRadius: '4px' }}
                className={`flex-1 py-2.5 text-body text-sm font-medium border transition-colors ${geneticTesting === opt.value ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
};
