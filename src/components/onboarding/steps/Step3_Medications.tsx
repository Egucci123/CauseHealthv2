// src/components/onboarding/steps/Step3_Medications.tsx — THE WOW STEP
import { OnboardingShell } from '../OnboardingShell';
import { MedicationSearch } from '../MedicationSearch';
import { useOnboardingStore } from '../../../store/onboardingStore';

export const Step3_Medications = () => {
  const { nextStep, noMedications, updateStep3, medications } = useOnboardingStore();

  return (
    <OnboardingShell stepKey="step-3" title="What medications are you taking?"
      description="Include all prescription medications. We'll immediately show you what each one is doing to your nutrient levels."
      onNext={async () => { await nextStep(); }} showSkip onSkip={async () => { updateStep3({ noMedications: true }); await nextStep(); }}>
      <div className="space-y-6">
        <button onClick={() => updateStep3({ noMedications: !noMedications })} style={{ borderRadius: '4px' }}
          className={`flex items-center gap-3 w-full px-4 py-3 border text-body text-sm transition-all ${noMedications ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
          <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noMedications ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`} style={{ borderRadius: '2px' }}>
            {noMedications && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
          </div>
          I don't take any prescription medications
        </button>

        {!noMedications && (
          <>
            <MedicationSearch />
            {medications.length > 0 && (
              <div className="bg-[#131313] rounded-[10px] p-5">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[20px]">info</span>
                  <div>
                    <p className="text-body text-on-surface text-sm font-medium">
                      {medications.filter(m => m.depletes.length > 0).length} of {medications.length} medication{medications.length !== 1 ? 's' : ''}{' '}
                      {medications.filter(m => m.depletes.length > 0).length !== 1 ? 'have' : 'has'} documented depletions
                    </p>
                    <p className="text-body text-on-surface-variant text-xs mt-0.5">All identified depletions will be addressed in your personalized wellness plan.</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </OnboardingShell>
  );
};
