// src/lib/foodEligibility.ts
//
// Client-side filter that returns the meals from FOOD_PLAYBOOK the user is
// actually eligible to eat given their life_context. Used by the
// FoodPlaybookLibrary modal to show "everything you CAN eat" without surfacing
// meals their cooking time / budget / chains / diet rule out.
//
// Universal: no condition-specific logic. Pure constraint matching.

import { FOOD_PLAYBOOK, type MealEntry } from '../data/foodPlaybook';
import type { LifeContext } from '../store/onboardingStore';

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
  lifeContext?: LifeContext | null;
  diet?: string;
}

export function getEligibleMeals(ctx: EligibilityContext): MealEntry[] {
  const lc = ctx.lifeContext ?? {};
  const cookingMax = lc.cookingTimeAvailable ? COOKING_TIME_MAX[lc.cookingTimeAvailable] ?? 999 : 999;
  const budgetMaxTier = lc.weeklyFoodBudget ? BUDGET_MAX_TIER[lc.weeklyFoodBudget] ?? 3 : 3;
  const userChains = (lc.eatOutPlaces ?? []).map(c => c.toLowerCase().trim());
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
      const ok = c.requiresChain.some(chain => userChains.some(uc => uc.includes(chain.toLowerCase())));
      if (!ok) return false;
    }
    if (c.diet && c.diet.length > 0 && !c.diet.includes(userDiet)) return false;
    if (c.excludeDiet && c.excludeDiet.includes(userDiet)) return false;
    return true;
  });
}
