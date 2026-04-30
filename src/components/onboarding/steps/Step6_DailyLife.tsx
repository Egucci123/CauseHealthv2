// src/components/onboarding/steps/Step6_DailyLife.tsx
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { DailyLifeEditor } from '../../health/DailyLifeEditor';

export const Step6_DailyLife = () => {
  const { nextStep, lifeContext, updateStep6 } = useOnboardingStore();
  return (
    <OnboardingShell
      stepKey="step-6"
      title="Your daily life."
      description="So we tailor your plan to your real life — your work, your kids, your budget. None of this is required, skip anything you'd rather not share."
      onNext={async () => { await nextStep(); }}
      showSkip
      onSkip={async () => { await nextStep(); }}
    >
      <DailyLifeEditor
        value={lifeContext}
        onChange={patch => updateStep6({ lifeContext: { ...lifeContext, ...patch } })}
      />
    </OnboardingShell>
  );
};
