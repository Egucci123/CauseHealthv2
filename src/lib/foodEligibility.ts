// src/lib/foodEligibility.ts
//
// Client-side filter that returns the meals from FOOD_PLAYBOOK the user is
// actually eligible to eat given their life_context. Used by the
// FoodPlaybookLibrary modal to show "everything you CAN eat" without surfacing
// meals their cooking time / budget / chains / diet rule out.
//
// Universal: no condition-specific logic. Pure constraint matching.
//
// Coast-to-coast nationwide chains pass through eligibility EVEN when the
// user didn't tick them in onboarding — McDonald's, Subway, Starbucks etc.
// are realistically available to everyone. Wawa, Sheetz, Royal Farms, In-N-Out
// stay gated since they're regional.

import { FOOD_PLAYBOOK, chainIsNationwide, type MealEntry } from '../data/foodPlaybook';

// Loose shape — accepts both the strict `LifeContext` from onboardingStore
// AND the looser one from types/index.ts (Profile field). Keeps eligibility
// filter agnostic to which type comes in (Profile vs onboarding store).
type AnyLifeContext = Record<string, any>;

const COOKING_TIME_MAX: Record<string, number> = {
  under_15: 15,
  '15_30': 30,
  '30_60': 60,
  '60_plus': 999,
};

const BUDGET_MAX_TIER: Record<string, number> = {
  under_50: 1,
  '50_100': 2,
  '100_150': 3,
  '150_plus': 3,
};

export interface EligibilityContext {
  lifeContext?: AnyLifeContext;
  diet?: string;
}

export function getEligibleMeals(ctx: EligibilityContext): MealEntry[] {
  const lc = ctx.lifeContext ?? {};
  const cookingMax = lc.cookingTimeAvailable ? COOKING_TIME_MAX[lc.cookingTimeAvailable] ?? 999 : 999;
  const budgetMaxTier = lc.weeklyFoodBudget ? BUDGET_MAX_TIER[lc.weeklyFoodBudget] ?? 3 : 3;
  const userChains: string[] = (lc.eatOutPlaces ?? []).map((c: string) => c.toLowerCase().trim());
  const hasKids = lc.kidsAtHome != null && lc.kidsAtHome !== '0';
  const userDiet = (ctx.diet ?? 'standard').toLowerCase();
  const workType = lc.workType ?? '';

  return FOOD_PLAYBOOK.filter(m => {
    if (m.prepMinutes > cookingMax) return false;
    if (m.cost > budgetMaxTier) return false;
    const c = m.constraint;
    if (!c) return true;
    if (c.workType && !c.workType.includes(workType)) return false;
    if (c.excludeWorkType && c.excludeWorkType.includes(workType)) return false;
    if (c.hasKids && !hasKids) return false;
    if (c.noKids && hasKids) return false;
    if (c.maxPrepMinutes && m.prepMinutes > c.maxPrepMinutes) return false;
    if (c.minBudgetTier && budgetMaxTier < c.minBudgetTier) return false;
    if (c.requiresChain && c.requiresChain.length > 0) {
      // Nationwide chains (McDonald's, Subway, Starbucks, BK, Wendy's, etc.)
      // always pass — they're available coast-to-coast so we don't make the
      // user explicitly list them. Regional chains (Wawa, Sheetz, In-N-Out,
      // Whataburger) still require explicit user pre-selection.
      const ok = chainIsNationwide(c.requiresChain) ||
        c.requiresChain.some((chain: string) => userChains.some((uc: string) => uc.includes(chain.toLowerCase())));
      if (!ok) return false;
    }
    if (c.diet && c.diet.length > 0 && !c.diet.includes(userDiet)) return false;
    if (c.excludeDiet && c.excludeDiet.includes(userDiet)) return false;
    return true;
  });
}
