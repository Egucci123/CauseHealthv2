// src/components/onboarding/steps/Step3_Medications.tsx — meds + supplements
import { OnboardingShell } from '../OnboardingShell';
import { MedicationSearch } from '../MedicationSearch';
import { SupplementSearch } from '../SupplementSearch';
import { useOnboardingStore } from '../../../store/onboardingStore';

export const Step3_Medications = () => {
  const {
    nextStep, noMedications, updateStep3, medications,
    supplements, noSupplements,
    addMedication, removeMedication,
    addSupplement, removeSupplement,
  } = useOnboardingStore();

  // Bridge MedicationSearch's prop interface to the onboarding store. The
  // store still owns durations via setState; the component just emits the new
  // value when the user picks a different option.
  const updateMedDuration = (id: string, duration: string) =>
    useOnboardingStore.setState(s => ({ medications: s.medications.map(m => m.id === id ? { ...m, duration } : m) }));
  const updateSuppField = (id: string, patch: Partial<{ dose: string; durationCategory: string }>) =>
    useOnboardingStore.setState(s => ({
      supplements: s.supplements.map(sp =>
        sp.id === id ? { ...sp, dose: patch.dose ?? sp.dose, duration: patch.durationCategory ?? sp.duration } : sp
      ),
    }));

  // Validation: user must either list at least one med or actively confirm
  // "I don't take any". Same rule for supplements. Forces a positive answer
  // instead of letting people click Continue blindly.
  const medsOk = medications.length > 0 || noMedications;
  const suppsOk = supplements.length > 0 || noSupplements;
  const canContinue = medsOk && suppsOk;
  const errorMsg = !medsOk ? 'Add a medication or confirm none.'
    : !suppsOk ? 'Add a supplement or confirm none.'
    : null;

  return (
    <OnboardingShell
      stepKey="step-3"
      title="Medications & Supplements"
      description="Include all prescription medications AND supplements you take regularly. Many supplements (like biotin, creatine, niacin) directly alter lab values — knowing them helps us interpret your bloodwork accurately."
      onNext={async () => { if (canContinue) await nextStep(); }}
      nextDisabled={!canContinue}
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
              <MedicationSearch
                medications={medications}
                onAdd={addMedication}
                onRemove={removeMedication}
                onUpdateDuration={updateMedDuration}
                showDepletionDetail
              />
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
              <SupplementSearch
                supplements={supplements}
                onAdd={addSupplement}
                onRemove={removeSupplement}
                onUpdateField={(id, patch) => updateSuppField(id, { dose: patch.dose, durationCategory: patch.duration })}
              />
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

        {errorMsg && (
          <p className="text-precision text-[0.65rem] text-[#C94F4F] tracking-wide">{errorMsg}</p>
        )}
      </div>
    </OnboardingShell>
  );
};
