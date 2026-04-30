// src/pages/onboarding/Onboarding.tsx
import { useEffect } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { Step1_Welcome }    from '../../components/onboarding/steps/Step1_Welcome';
import { Step2_Diagnoses }  from '../../components/onboarding/steps/Step2_Diagnoses';
import { Step3_Medications } from '../../components/onboarding/steps/Step3_Medications';
import { Step4_Symptoms }   from '../../components/onboarding/steps/Step4_Symptoms';
import { Step5_Lifestyle }  from '../../components/onboarding/steps/Step5_Lifestyle';
import { Step6_DailyLife }  from '../../components/onboarding/steps/Step6_DailyLife';
import { Step6_Goals }      from '../../components/onboarding/steps/Step6_Goals';
import { Step7_Complete }   from '../../components/onboarding/steps/Step7_Complete';

export const Onboarding = () => {
  const { currentStep, loadSavedProgress } = useOnboardingStore();

  useEffect(() => { loadSavedProgress(); }, [loadSavedProgress]);

  // Step 6 is the new "Daily Life" step (work, kids, food, healthcare access)
  // — drives universal AI tailoring without disease-specific logic. The
  // existing Goals + Complete components keep their filenames for git history
  // continuity but mount at positions 7 and 8 respectively.
  const steps: Record<number, React.ReactNode> = {
    1: <Step1_Welcome />, 2: <Step2_Diagnoses />, 3: <Step3_Medications />,
    4: <Step4_Symptoms />, 5: <Step5_Lifestyle />, 6: <Step6_DailyLife />,
    7: <Step6_Goals />, 8: <Step7_Complete />,
  };

  return steps[currentStep] ?? <Step1_Welcome />;
};
