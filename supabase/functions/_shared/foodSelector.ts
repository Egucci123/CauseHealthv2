// supabase/functions/_shared/foodSelector.ts
//
// Filters + ranks the curated FOOD_PLAYBOOK against a user's life_context
// (work, kids, cooking time, budget, eat-out chains, breakfast/lunch/dinner
// patterns) AND their lab targets (high TG, high ALT, low ferritin, etc.).
// Returns the top N candidates for the AI to choose from.
//
// Universal rule: scoring is purely additive based on signal matches —
// no condition-specific hardcoding. Lab targets come from the user's actual
// flagged lab values, not from a diagnosis list.

import { FOOD_PLAYBOOK, type MealEntry, type Playbook, type Target } from './foodPlaybook.ts';

export interface SelectorContext {
  workType?: string;
  hasKids?: boolean;          // derived from kidsAtHome != '0'
  cookingTimeAvailable?: string; // 'under_15' | '15_30' | '30_60' | '60_plus' | undefined
  weeklyFoodBudget?: string;     // 'under_50' | '50_100' | '100_150' | '150_plus' | undefined
  eatOutPlaces?: string[];       // chains user listed
  breakfastPatterns?: string[];
  lunchPatterns?: string[];
  dinnerPatterns?: string[];
  diet?: string;                  // 'standard' | 'vegan' | 'vegetarian' | 'keto' | etc.
  // Lab targets the meal should HELP. Inferred from flagged labs + symptoms.
  labTargets?: Target[];
}

// Map onboarding meal patterns to playbooks the user is likely to eat from.
const PATTERN_TO_PLAYBOOKS: Record<string, Playbook[]> = {
  // breakfast
  skip:               [],
  fast_food:          ['fast_food'],
  gas_station:        ['convenience_store'],
  coffee_shop:        ['fast_food', 'low_cal_drink'],
  frozen_sandwich:    ['frozen_breakfast'],
  eggs_home:          ['simple_home_cook', 'frozen_breakfast'],
  cereal:             ['simple_home_cook', 'protein_bar_shake'],
  smoothie:           ['low_cal_drink', 'viral_hack'],
  protein_bar:        ['protein_bar_shake'],
  // lunch (some overlap with breakfast keys is intentional)
  wawa_convenience:   ['convenience_store'],
  packed:             ['lunchbox_thermos'],
  cafeteria:          ['fast_food'],
  cooler_box:         ['lunchbox_thermos'],
  drive_thru_salad:   ['fast_food'],
  restaurant:         ['fast_food', 'simple_home_cook'],
  // dinner
  cook_scratch:       ['simple_home_cook'],
  crock_pot:          ['crock_pot'],
  sheet_pan:          ['sheet_pan'],
  frozen_meal:        ['frozen_aisle'],
  takeout:            ['fast_food'],
  kid_friendly:       ['mom_friendly'],
  snack_dinner:       ['protein_bar_shake', 'viral_hack'],
  other:              [],
};

const COOKING_TIME_MAX: Record<string, number> = {
  under_15: 15,
  '15_30': 30,
  '30_60': 60,
  '60_plus': 999,
};

const BUDGET_MAX_TIER: Record<string, number> = {
  under_50: 1,    // only cost tier 1 meals
  '50_100': 2,
  '100_150': 3,
  '150_plus': 3,
};

/**
 * Filter the library down to meals the user CAN eat (constraint pass) AND
 * rank by match score (life_context + lab targets). Returns top N.
 */
export function selectMealCandidates(ctx: SelectorContext, topN: number = 60): MealEntry[] {
  // 1) Identify which playbooks the user actually uses (from their patterns)
  const allPatterns = [
    ...(ctx.breakfastPatterns ?? []),
    ...(ctx.lunchPatterns ?? []),
    ...(ctx.dinnerPatterns ?? []),
  ];
  const activePlaybooks = new Set<Playbook>();
  for (const p of allPatterns) {
    const pbs = PATTERN_TO_PLAYBOOKS[p] ?? [];
    for (const pb of pbs) activePlaybooks.add(pb);
  }
  // If user provided NO meal patterns at all, default to a broad universal set
  // (busy-blue-collar default — same as the old "unknown" fallback).
  if (activePlaybooks.size === 0) {
    ['fast_food', 'frozen_aisle', 'convenience_store', 'lunchbox_thermos',
     'protein_bar_shake', 'crock_pot', 'low_cal_drink', 'viral_hack',
     'sheet_pan', 'simple_home_cook'].forEach(p => activePlaybooks.add(p as Playbook));
  }
  // mom_friendly always available if user has kids
  if (ctx.hasKids) activePlaybooks.add('mom_friendly');
  // viral_hack always allowed (universal)
  activePlaybooks.add('viral_hack');
  // low_cal_drink always allowed (drinks are universal)
  activePlaybooks.add('low_cal_drink');

  const cookingMax = ctx.cookingTimeAvailable ? COOKING_TIME_MAX[ctx.cookingTimeAvailable] ?? 999 : 999;
  const budgetMaxTier = ctx.weeklyFoodBudget ? BUDGET_MAX_TIER[ctx.weeklyFoodBudget] ?? 3 : 3;
  const userChains = (ctx.eatOutPlaces ?? []).map(c => c.toLowerCase().trim());
  const userDiet = (ctx.diet ?? 'standard').toLowerCase();
  const userLabTargets = new Set(ctx.labTargets ?? []);

  // 2) Filter by hard constraints
  const eligible = FOOD_PLAYBOOK.filter(m => {
    // Playbook must be active for the user
    if (!activePlaybooks.has(m.playbook)) return false;
    // Cooking time
    if (m.prepMinutes > cookingMax) return false;
    // Budget
    if (m.cost > budgetMaxTier) return false;
    const c = m.constraint;
    if (c) {
      if (c.workType && !c.workType.includes(ctx.workType ?? 'unknown')) return false;
      if (c.excludeWorkType && c.excludeWorkType.includes(ctx.workType ?? '')) return false;
      if (c.hasKids && !ctx.hasKids) return false;
      if (c.noKids && ctx.hasKids) return false;
      if (c.maxPrepMinutes && m.prepMinutes > c.maxPrepMinutes) return false;
      if (c.minBudgetTier && budgetMaxTier < c.minBudgetTier) return false;
      if (c.requiresChain && c.requiresChain.length > 0) {
        const ok = c.requiresChain.some(chain => userChains.some(uc => uc.includes(chain.toLowerCase())));
        if (!ok) return false;
      }
      if (c.diet && c.diet.length > 0 && !c.diet.includes(userDiet)) return false;
      if (c.excludeDiet && c.excludeDiet.includes(userDiet)) return false;
    }
    return true;
  });

  // 3) Rank by score: lab-target hits + small bonuses for active playbooks
  const scored = eligible.map(m => {
    let score = 0;
    // Lab-target match: +2 per match
    for (const t of m.targets) {
      if (userLabTargets.has(t)) score += 2;
    }
    // Bonus if meal's playbook directly matches one of user's selected patterns
    const directMatch = allPatterns.some(p => (PATTERN_TO_PLAYBOOKS[p] ?? []).includes(m.playbook));
    if (directMatch) score += 3;
    // Slight bonus for Phase 1 (start-here meals dominate the plan)
    if (m.phase === 1) score += 1;
    // Slight bonus when chain match is strong (user listed it)
    const chainMatch = userChains.some(uc => m.name.toLowerCase().includes(uc));
    if (chainMatch) score += 2;
    return { meal: m, score };
  });

  // 4) Sort + cap with breadth control across two dimensions:
  //   • per-playbook cap = 6 (was 8) so each category gets variety
  //   • per-chain cap = 3 — prevents a single chain (Wawa, Chick-fil-A) from
  //     dominating just because the user listed it. With 11 Wawa entries +
  //     a +2 chain-match bonus, the old code put 7+ Wawa meals in front of
  //     the AI and the plan came out 30% Wawa. Hard cap at 3 forces the AI
  //     to pull from Sheetz, 7-Eleven, etc. when those are also listed.
  scored.sort((a, b) => b.score - a.score);
  const perPlaybookCount = new Map<Playbook, number>();
  const perChainCount = new Map<string, number>();
  const out: MealEntry[] = [];

  // Detect a chain "key" from the meal — uses constraint.requiresChain[0]
  // when present (Wawa, Chick-fil-A, etc.), otherwise falls back to the
  // first significant word of the meal name (so home-cooked meals don't
  // accidentally count toward the same chain bucket).
  const chainKey = (m: MealEntry): string | null => {
    const required = m.constraint?.requiresChain?.[0];
    if (required) return required.toLowerCase();
    return null;
  };

  for (const s of scored) {
    const count = perPlaybookCount.get(s.meal.playbook) ?? 0;
    if (count >= 6) continue;
    const ck = chainKey(s.meal);
    if (ck) {
      const cc = perChainCount.get(ck) ?? 0;
      if (cc >= 3) continue;
      perChainCount.set(ck, cc + 1);
    }
    out.push(s.meal);
    perPlaybookCount.set(s.meal.playbook, count + 1);
    if (out.length >= topN) break;
  }
  return out;
}

/**
 * Infer lab targets from the user's flagged lab values + symptoms.
 * Universal — works off the actual flagged data, not condition list.
 */
export function inferLabTargets(labValues: any[], symptoms: any[]): Target[] {
  const targets = new Set<Target>();
  for (const v of labValues ?? []) {
    const name = String(v?.marker_name ?? '').toLowerCase();
    const flag = String(v?.optimal_flag ?? v?.standard_flag ?? '').toLowerCase();
    const high = ['high', 'critical_high', 'elevated'].includes(flag);
    const low = ['low', 'critical_low', 'deficient'].includes(flag);

    if (high && /\btriglycer/.test(name)) targets.add('high_tg');
    if (high && /\bldl\b/.test(name)) targets.add('high_ldl');
    if (high && /\bapob\b/.test(name)) targets.add('high_apob');
    if (high && /\b(total\s+)?cholesterol\b/.test(name) && !/hdl|ldl/.test(name)) targets.add('high_chol');
    if (low && /\bhdl\b/.test(name)) targets.add('low_hdl');
    if (high && /\balt\b|alanine/.test(name)) { targets.add('high_alt'); targets.add('liver_stress'); }
    if (high && /\bast\b|aspartate/.test(name)) { targets.add('high_ast'); targets.add('liver_stress'); }
    if (high && /(glucose|fasting\s+glucose)/.test(name)) targets.add('high_glucose');
    if (high && /(a1c|hba1c|hemoglobin\s+a1c)/.test(name)) targets.add('high_a1c');
    if ((high || flag === 'watch') && /(insulin|homa)/.test(name)) targets.add('insulin_resistance');
    if (low && /\bferritin\b/.test(name)) { targets.add('low_ferritin'); targets.add('low_iron'); }
    if (low && /(iron\b|tibc|transferrin)/.test(name)) targets.add('low_iron');
    if (low && /\bb[\s-]?12\b|cobalamin/.test(name)) targets.add('low_b12');
    if (low && /folate/.test(name)) targets.add('low_folate');
    if (low && /vitamin\s*d/.test(name)) targets.add('low_vitamin_d');
    if (low && /testosterone/.test(name)) targets.add('low_test');
  }
  for (const s of symptoms ?? []) {
    const sym = String(s?.symptom ?? '').toLowerCase();
    if (/hair\s*(loss|thin)/.test(sym)) { targets.add('hair_loss'); targets.add('low_iron'); }
    if (/brain\s*fog|memory|focus/.test(sym)) targets.add('brain_fog');
    if (/sleep|insomnia|wake/.test(sym)) targets.add('sleep_support');
    if (/stress|anxiety|tense/.test(sym)) targets.add('cortisol_calm');
    if (/fatigue|tired|crash|low\s*energy/.test(sym)) targets.add('energy_steady');
    if (/weight|lose\s*weight|trouble\s*losing/.test(sym)) targets.add('weight_loss');
    if (/joint|stiff|inflam/.test(sym)) targets.add('anti_inflammatory');
    if (/bloat|gas|gut|cramp|diarrh|constipat/.test(sym)) targets.add('gut_inflammation');
  }
  return [...targets];
}
