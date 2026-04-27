// src/components/onboarding/steps/Step3_Medications.tsx — meds + supplements
import { OnboardingShell } from '../OnboardingShell';
import { MedicationSearch } from '../MedicationSearch';
import { SupplementSearch } from '../SupplementSearch';
import { useOnboardingStore } from '../../../store/onboardingStore';

export const Step3_Medications = () => {
  const {
    nextStep, noMedications, updateStep3, medications,
    supplements, noSupplements,
  } = useOnboardingStore();

  return (
    <OnboardingShell
      stepKey="step-3"
      title="Medications & Supplements"
      description="Include all prescription medications AND supplements you take regularly. Many supplements (like biotin, creatine, niacin) directly alter lab values — knowing them helps us interpret your bloodwork accurately."
      onNext={async () => { await nextStep(); }}
      showSkip
      onSkip={async () => { updateStep3({ noMedications: true, noSupplements: true }); await nextStep(); }}
    >
      <div className="space-y-10">
        {/* ── MEDICATIONS ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-primary-container text-[20px]">medication</span>
            <h3 className="text-authority text-lg text-clinical-charcoal font-semibold">Prescription Medications</h3>
          </div>

          <button
            onClick={() => updateStep3({ noMedications: !noMedications })}
            style={{ borderRadius: '4px' }}
            className={`flex items-center gap-3 w-full px-4 py-3 border text-body text-sm transition-all mb-4 ${
              noMedications ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'
            }`}
          >
            <div
              className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noMedications ? 'bg-primary-container border-primary-container' : 'border-outline-variant/40'}`}
              style={{ borderRadius: '2px' }}
            >
              {noMedications && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
            </div>
            I don't take any prescription medications
          </button>

          {!noMedications && (
            <>
              <MedicationSearch />
              {medications.length > 0 && (
                <div className="bg-[#131313] rounded-[10px] p-4 mt-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-[18px]">info</span>
                    <p className="text-body text-on-surface text-xs">
                      {medications.filter((m) => m.depletes.length > 0).length} of {medications.length} medication{medications.length !== 1 ? 's' : ''} {medications.filter((m) => m.depletes.length > 0).length !== 1 ? 'have' : 'has'} documented nutrient depletions.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── SUPPLEMENTS ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-[#2A9D8F] text-[20px]">eco</span>
            <h3 className="text-authority text-lg text-clinical-charcoal font-semibold">Supplements</h3>
          </div>

          <button
            onClick={() => updateStep3({ noSupplements: !noSupplements })}
            style={{ borderRadius: '4px' }}
            className={`flex items-center gap-3 w-full px-4 py-3 border text-body text-sm transition-all mb-4 ${
              noSupplements ? 'bg-[#2A9D8F]/10 border-[#2A9D8F]/40 text-[#2A9D8F]' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'
            }`}
          >
            <div
              className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center ${noSupplements ? 'bg-[#2A9D8F] border-[#2A9D8F]' : 'border-outline-variant/40'}`}
              style={{ borderRadius: '2px' }}
            >
              {noSupplements && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
            </div>
            I don't take any supplements
          </button>

          {!noSupplements && (
            <>
              <SupplementSearch />
              {supplements.length > 0 && (
                <div className="bg-[#131313] rounded-[10px] p-4 mt-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#2A9D8F] text-[18px]">science</span>
                    <p className="text-body text-on-surface text-xs">
                      Your supplements are saved. Any that affect lab values (e.g., creatine, biotin, niacin) will be noted in your AI analysis to avoid misinterpreting bloodwork.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </OnboardingShell>
  );
};
