// src/components/onboarding/steps/Step5_Lifestyle.tsx
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { LifestyleEditor, type LifestyleValue } from '../../health/LifestyleEditor';

// Required fields for advancing — every one of these influences AI analysis
// or supplement recommendations. Skipping leaves the AI guessing on context.
const REQUIRED_LIFESTYLE_FIELDS: Array<keyof LifestyleValue> = [
  'sleepHours',          // sleep quality / duration
  'dietType',            // shapes meal recommendations
  'exerciseDaysPerWeek', // metabolic context
  'stressLevel',         // cortisol-related supplements
  'smoker',              // cardiovascular risk + supplement contraindications
];

export const Step5_Lifestyle = () => {
  const { nextStep, lifestyle, updateStep5 } = useOnboardingStore();

  // A field counts as "filled" if it's not undefined and not empty string.
  // Numbers like sleepHours=0 count as filled (user actively set it to 0).
  const isFilled = (key: keyof LifestyleValue) => {
    const v = (lifestyle as any)[key];
    return v !== undefined && v !== null && v !== '';
  };
  const missing = REQUIRED_LIFESTYLE_FIELDS.filter(k => !isFilled(k));
  const canContinue = missing.length === 0;
  const errorMsg = canContinue ? null : `Fill in all 5 lifestyle factors to continue. (${missing.length} left)`;

  return (
    <OnboardingShell stepKey="step-5" title="Your lifestyle factors."
      description="Sleep, diet, exercise, and stress affect every lab value. This context makes the difference between a generic plan and a precise one."
      onNext={async () => { if (canContinue) await nextStep(); }}
      nextDisabled={!canContinue}>
      <div className="space-y-4">
        <LifestyleEditor
          value={lifestyle as LifestyleValue}
          onChange={patch => updateStep5({ lifestyle: { ...lifestyle, ...patch } })}
        />
        {errorMsg && (
          <p className="text-precision text-[0.65rem] text-[#C94F4F] tracking-wide">{errorMsg}</p>
        )}
      </div>
    </OnboardingShell>
  );
};
