// src/components/onboarding/steps/Step6_DailyLife.tsx
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { DailyLifeEditor } from '../../health/DailyLifeEditor';

// Required fields for the wellness plan generator. Skipping these makes the
// AI fall back to "busy blue-collar" defaults that don't match the user.
const REQUIRED_LIFE_FIELDS = [
  'workType',
  'kidsAtHome',
  'cookingTimeAvailable',
  'weeklyFoodBudget',
] as const;

export const Step6_DailyLife = () => {
  const { nextStep, lifeContext, updateStep6 } = useOnboardingStore();

  const isFilled = (k: string) => {
    const v = (lifeContext as any)[k];
    return v !== undefined && v !== null && v !== '';
  };
  const hasArr = (k: string) => Array.isArray((lifeContext as any)[k]) && (lifeContext as any)[k].length > 0;

  // 4 single-pick fields + 3 meal-pattern arrays (must have at least one pick each)
  // Lunch is saved as `typicalLunches` (legacy `typicalLunch` for old accounts)
  // — NOT `lunchPatterns` like the others. The wellness plan generator
  // bridges the names at runtime, so the validation has to too.
  const baseMissing = REQUIRED_LIFE_FIELDS.filter(k => !isFilled(k));
  const breakfastOk = hasArr('breakfastPatterns');
  const lunchOk = hasArr('typicalLunches') || isFilled('typicalLunch');
  const dinnerOk = hasArr('dinnerPatterns');

  const canContinue = baseMissing.length === 0 && breakfastOk && lunchOk && dinnerOk;
  const errorMsg = !canContinue
    ? `Pick all the daily-life fields. (${baseMissing.length + (breakfastOk ? 0 : 1) + (lunchOk ? 0 : 1) + (dinnerOk ? 0 : 1)} left)`
    : null;

  return (
    <OnboardingShell
      stepKey="step-6"
      title="Your daily life."
      description="So we tailor your plan to your real life — your work, your kids, your budget. We need all of this filled out so the AI doesn't guess."
      onNext={async () => { if (canContinue) await nextStep(); }}
      nextDisabled={!canContinue}
    >
      <div className="space-y-4">
        <DailyLifeEditor
          value={lifeContext}
          onChange={patch => updateStep6({ lifeContext: { ...lifeContext, ...patch } })}
        />
        {errorMsg && (
          <p className="text-precision text-[0.65rem] text-[#C94F4F] tracking-wide">{errorMsg}</p>
        )}
      </div>
    </OnboardingShell>
  );
};
