// src/components/onboarding/steps/Step5_Lifestyle.tsx
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { LifestyleEditor, type LifestyleValue } from '../../health/LifestyleEditor';

export const Step5_Lifestyle = () => {
  const { nextStep, lifestyle, updateStep5 } = useOnboardingStore();
  return (
    <OnboardingShell stepKey="step-5" title="Your lifestyle factors."
      description="Sleep, diet, exercise, and stress affect every lab value. This context makes the difference between a generic plan and a precise one."
      onNext={async () => { await nextStep(); }} showSkip onSkip={async () => { await nextStep(); }}>
      <LifestyleEditor
        value={lifestyle as LifestyleValue}
        onChange={patch => updateStep5({ lifestyle: { ...lifestyle, ...patch } })}
      />
    </OnboardingShell>
  );
};
