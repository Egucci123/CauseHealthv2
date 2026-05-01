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
  const {
    nextStep,
    familyHistory, updateStep2, geneticTesting,
    conditions, addCondition, removeCondition,
    noConditions, noFamilyHistory,
  } = useOnboardingStore();

  // Family history toggling — clicking any option clears the "none" flag
  const toggleFamilyHistory = (key: string) => {
    updateStep2({
      familyHistory: { ...familyHistory, [key]: !familyHistory[key as keyof typeof familyHistory] },
      noFamilyHistory: false,
    });
  };

  // Adding a condition clears the "no conditions" flag automatically.
  const handleAdd = (c: { name: string; icd10?: string }) => {
    addCondition(c);
    if (noConditions) updateStep2({ noConditions: false });
  };
  const handleRemove = (idOrName: string) => {
    const found = conditions.find(c => c.id === idOrName) ?? conditions.find(c => c.name === idOrName);
    if (found) removeCondition(found.id);
  };

  // Validation: continue is allowed only if either at least one condition is
  // listed OR the user explicitly confirmed "no diagnosed conditions". Same
  // for family history. Genetic testing must have a selection.
  const conditionsOk = conditions.length > 0 || noConditions;
  const anyFamilyToggled = Object.values(familyHistory).some(Boolean);
  const familyOk = anyFamilyToggled || noFamilyHistory;
  const geneticOk = !!geneticTesting;
  const canContinue = conditionsOk && familyOk && geneticOk;

  const errorMsg = !conditionsOk ? 'Add a diagnosis or confirm none below.'
    : !familyOk ? 'Select family-history items or confirm none below.'
    : !geneticOk ? 'Pick a genetic-testing answer.'
    : null;

  return (
    <OnboardingShell
      stepKey="step-2"
      title="Any diagnosed conditions?"
      description="Include current and past diagnoses. This lets us flag autoimmune cascade risks and connect medications to the right conditions."
      onNext={async () => { if (canContinue) await nextStep(); }}
      nextDisabled={!canContinue}
    >
      <div className="space-y-10">
        <div>
          <ConditionSearch conditions={conditions} onAdd={handleAdd} onRemove={handleRemove} />
          <button
            type="button"
            onClick={() => updateStep2({ noConditions: !noConditions })}
            className={`mt-3 w-full px-4 py-3 text-left border transition-colors flex items-center gap-3 ${noConditions ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}
            style={{ borderRadius: '4px' }}
          >
            <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noConditions ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
              {noConditions && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
            </div>
            <span className="text-body text-sm">I have no diagnosed conditions</span>
          </button>
        </div>

        <div>
          <SectionLabel>Family History</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FAMILY_HISTORY_OPTIONS.map(({ key, label }) => {
              const checked = familyHistory[key as keyof typeof familyHistory];
              return (
                <button key={key} type="button" onClick={() => toggleFamilyHistory(key)} style={{ borderRadius: '4px' }}
                  className={`flex items-center gap-3 px-4 py-3 text-left border transition-all duration-150 ${checked ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                  <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${checked ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
                    {checked && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                  </div>
                  <span className="text-body text-sm">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => updateStep2({ noFamilyHistory: !noFamilyHistory })}
            className={`mt-3 w-full px-4 py-3 text-left border transition-colors flex items-center gap-3 ${noFamilyHistory ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}
            style={{ borderRadius: '4px' }}
          >
            <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noFamilyHistory ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
              {noFamilyHistory && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
            </div>
            <span className="text-body text-sm">No notable family history</span>
          </button>
        </div>

        <div>
          <SectionLabel>Genetic Testing Done?</SectionLabel>
          <div className="flex gap-2">
            {[{ value: 'yes', label: 'Yes' }, { value: 'in_progress', label: 'In Progress' }, { value: 'no', label: 'No' }].map(opt => (
              <button key={opt.value} type="button" onClick={() => updateStep2({ geneticTesting: opt.value as 'yes' | 'no' | 'in_progress' })} style={{ borderRadius: '4px' }}
                className={`flex-1 py-2.5 text-body text-sm font-medium border transition-colors ${geneticTesting === opt.value ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <p className="text-precision text-[0.65rem] text-[#C94F4F] tracking-wide">{errorMsg}</p>
        )}
      </div>
    </OnboardingShell>
  );
};
