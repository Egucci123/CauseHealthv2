// src/lib/weeklySpotlight.ts
//
// Picks 7 meals from the user's existing wellness-plan meals[] for the
// "This Week's Focus" spotlight on /wellness. Phase-weighted by how many
// weeks have passed since the plan was generated, with a dinner-specific
// override pushing harder toward home cooking, and a 2-week cool-down
// preventing the same meal from repeating in adjacent weeks.
//
// Pure function. No side effects. Same inputs → same outputs.
// Cool-down is computed by re-running the picker for weeks N-1 and N-2
// against the same meals[] so the spotlight is stable per (user, week)
// without persisting any state.

export interface PlanMeal {
  emoji?: string;
  name: string;
  when?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  phase?: 1 | 2 | 3;
  playbook?: string;
  ingredients?: string[];
  why?: string;
  // Allow extra fields without TS pain
  [key: string]: any;
}

export interface SpotlightResult {
  weekNumber: number;             // 1..12, capped both ends
  weekLabel: string;              // "Easy mode — start where you are"
  weekSubLabel: string;           // "Same N meals in your plan. We're highlighting..."
  meals: PlanMeal[];              // up to 7 picks
}

// Phase weights per week range. Tuned to nudge, not force.
// Sums must = 1. dinnerWeights overrides for 'dinner' slot only.
interface WeekWeights {
  base: { p1: number; p2: number; p3: number };
  dinner: { p1: number; p2: number; p3: number };
  label: string;
}

const WEEK_TABLE: WeekWeights[] = [
  // weeks 1-3
  {
    base:   { p1: 0.65, p2: 0.30, p3: 0.05 },
    dinner: { p1: 0.65, p2: 0.30, p3: 0.05 },
    label:  'Easy mode — start where you are',
  },
  // weeks 4-6
  {
    base:   { p1: 0.40, p2: 0.45, p3: 0.15 },
    dinner: { p1: 0.25, p2: 0.50, p3: 0.25 },
    label:  'Step it up — pack more lunches',
  },
  // weeks 7-9
  {
    base:   { p1: 0.25, p2: 0.45, p3: 0.30 },
    dinner: { p1: 0.15, p2: 0.40, p3: 0.45 },
    label:  'Home stretch — cook more dinners',
  },
  // weeks 10-12
  {
    base:   { p1: 0.15, p2: 0.40, p3: 0.45 },
    dinner: { p1: 0.05, p2: 0.35, p3: 0.60 },
    label:  "You've got this — most meals at home",
  },
];

function weekRangeIndex(week: number): 0 | 1 | 2 | 3 {
  if (week <= 3) return 0;
  if (week <= 6) return 1;
  if (week <= 9) return 2;
  return 3;
}

// djb2 string hash — tiny, deterministic, plenty good for shuffle seed.
function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Mulberry32 PRNG. Pure, deterministic, fast.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates with a seeded RNG.
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Convert a fractional weight to an integer count over a fixed total slots.
// Largest-remainder method so the total always sums correctly.
function distributeSlots(
  total: number,
  weights: { p1: number; p2: number; p3: number },
): { p1: number; p2: number; p3: number } {
  const raw = {
    p1: weights.p1 * total,
    p2: weights.p2 * total,
    p3: weights.p3 * total,
  };
  const floored = {
    p1: Math.floor(raw.p1),
    p2: Math.floor(raw.p2),
    p3: Math.floor(raw.p3),
  };
  let remainder = total - (floored.p1 + floored.p2 + floored.p3);
  // Hand out leftover slots to phases with the highest fractional remainder
  const remainders: Array<['p1' | 'p2' | 'p3', number]> = [
    ['p1', raw.p1 - floored.p1],
    ['p2', raw.p2 - floored.p2],
    ['p3', raw.p3 - floored.p3],
  ];
  remainders.sort((a, b) => b[1] - a[1]);
  let i = 0;
  while (remainder > 0) {
    floored[remainders[i % 3][0]]++;
    remainder--;
    i++;
  }
  return floored;
}

// Group meals into pools by phase. Defaults missing phase to 1 (safest fallback).
function groupByPhase(meals: PlanMeal[]): Record<1 | 2 | 3, PlanMeal[]> {
  const pools: Record<1 | 2 | 3, PlanMeal[]> = { 1: [], 2: [], 3: [] };
  for (const m of meals) {
    const ph = (m.phase === 2 || m.phase === 3) ? m.phase : 1;
    pools[ph].push(m);
  }
  return pools;
}

// Pick `need` meals from pool using cool-down: skip meals whose name appears
// in `excluded`. If pool runs dry, fall back to relaxed exclusion (most-recent
// week only), then to no exclusion.
function pickWithCooldown(
  pool: PlanMeal[],
  need: number,
  excludedStrict: Set<string>,
  excludedRelaxed: Set<string>,
): PlanMeal[] {
  if (need <= 0 || pool.length === 0) return [];
  const out: PlanMeal[] = [];
  for (const m of pool) {
    if (out.length >= need) break;
    if (!excludedStrict.has(m.name)) out.push(m);
  }
  // Tier 2: allow meals on relaxed-only list (1 week back)
  if (out.length < need) {
    for (const m of pool) {
      if (out.length >= need) break;
      if (out.includes(m)) continue;
      if (!excludedRelaxed.has(m.name)) out.push(m);
    }
  }
  // Tier 3: take whatever's left
  if (out.length < need) {
    for (const m of pool) {
      if (out.length >= need) break;
      if (out.includes(m)) continue;
      out.push(m);
    }
  }
  return out;
}

// Core single-week pick. Returns the picked meal names + the actual meals.
// Used both for the public output AND for the cool-down lookback.
function pickForWeek(
  meals: PlanMeal[],
  weekNumber: number,
  userId: string,
  excludedStrict: Set<string>,
  excludedRelaxed: Set<string>,
): PlanMeal[] {
  const idx = weekRangeIndex(weekNumber);
  const weights = WEEK_TABLE[idx];

  // Spotlight = 7 meals: 4 dinners + 3 non-dinner (breakfast/lunch/snack mix)
  const TOTAL_SLOTS = 7;
  const DINNER_SLOTS = 4;
  const NON_DINNER_SLOTS = TOTAL_SLOTS - DINNER_SLOTS;

  // Split meals into dinner vs non-dinner pools, keep phase grouping
  const dinnerMeals = meals.filter(m => m.when === 'dinner');
  const nonDinnerMeals = meals.filter(m => m.when !== 'dinner');

  // Edge case: if user's plan is dinner-light, allow non-dinner meals to
  // fill dinner slots and vice-versa. Better than empty spotlight.
  const dinnerActual = Math.min(DINNER_SLOTS, dinnerMeals.length);
  const nonDinnerActual = Math.min(NON_DINNER_SLOTS, nonDinnerMeals.length);
  const overflowToDinner = DINNER_SLOTS - dinnerActual;
  const overflowToNonDinner = NON_DINNER_SLOTS - nonDinnerActual;

  const dinnerSlots = dinnerActual + overflowToNonDinner;
  const nonDinnerSlots = nonDinnerActual + overflowToDinner;

  // Apply phase weights separately to dinner / non-dinner counts
  const dinnerCounts = distributeSlots(dinnerSlots, weights.dinner);
  const nonDinnerCounts = distributeSlots(nonDinnerSlots, weights.base);

  // Group + shuffle each phase pool with stable per-(user, week, phase) seed
  const dinnerPools = groupByPhase(dinnerActual > 0 ? dinnerMeals : []);
  const nonDinnerPools = groupByPhase(nonDinnerActual > 0 ? nonDinnerMeals : []);

  // Overflow: when dinner pool is too small, those slots go to non-dinner
  // (and vice-versa). We add the leftover counts to the OTHER pool's
  // distribution so we don't lose slots.
  if (overflowToDinner > 0) {
    const extra = distributeSlots(overflowToDinner, weights.base);
    nonDinnerCounts.p1 += extra.p1;
    nonDinnerCounts.p2 += extra.p2;
    nonDinnerCounts.p3 += extra.p3;
  }
  if (overflowToNonDinner > 0) {
    const extra = distributeSlots(overflowToNonDinner, weights.dinner);
    dinnerCounts.p1 += extra.p1;
    dinnerCounts.p2 += extra.p2;
    dinnerCounts.p3 += extra.p3;
  }

  const result: PlanMeal[] = [];
  for (const ph of [1, 2, 3] as const) {
    const dinnerPool = seededShuffle(
      dinnerPools[ph],
      mulberry32(hashSeed(`${userId}|w${weekNumber}|d${ph}`)),
    );
    const ndPool = seededShuffle(
      nonDinnerPools[ph],
      mulberry32(hashSeed(`${userId}|w${weekNumber}|n${ph}`)),
    );
    result.push(...pickWithCooldown(dinnerPool, dinnerCounts[`p${ph}` as const], excludedStrict, excludedRelaxed));
    result.push(...pickWithCooldown(ndPool, nonDinnerCounts[`p${ph}` as const], excludedStrict, excludedRelaxed));
  }

  // If we somehow ended up under TOTAL_SLOTS (very small plan), top up from
  // any remaining unused meals — better to show 5 than fail empty.
  if (result.length < TOTAL_SLOTS) {
    const used = new Set(result.map(m => m.name));
    for (const m of meals) {
      if (result.length >= TOTAL_SLOTS) break;
      if (!used.has(m.name)) result.push(m);
    }
  }

  return result.slice(0, TOTAL_SLOTS);
}

export function pickWeeklySpotlight(
  meals: PlanMeal[],
  planGeneratedAt: string,
  userId: string,
): SpotlightResult | null {
  if (!Array.isArray(meals) || meals.length === 0) return null;
  if (!planGeneratedAt) return null;

  const generatedTs = new Date(planGeneratedAt).getTime();
  if (!Number.isFinite(generatedTs)) return null;

  const daysElapsed = Math.max(0, (Date.now() - generatedTs) / 86_400_000);
  const rawWeek = Math.floor(daysElapsed / 7) + 1;
  const weekNumber = Math.min(12, Math.max(1, rawWeek));

  // Cool-down: compute prior 1 + 2 weeks back to get the meal names that
  // shouldn't repeat. Strict excludes both, relaxed excludes only N-1.
  const prevExcludedStrict = new Set<string>();
  const prevExcludedRelaxed = new Set<string>();
  if (weekNumber >= 2) {
    const w1 = pickForWeek(meals, weekNumber - 1, userId, new Set(), new Set());
    for (const m of w1) {
      prevExcludedStrict.add(m.name);
      prevExcludedRelaxed.add(m.name);
    }
  }
  if (weekNumber >= 3) {
    const w2 = pickForWeek(meals, weekNumber - 2, userId, new Set(), new Set());
    for (const m of w2) prevExcludedStrict.add(m.name);
  }

  const picked = pickForWeek(meals, weekNumber, userId, prevExcludedStrict, prevExcludedRelaxed);

  const weights = WEEK_TABLE[weekRangeIndex(weekNumber)];
  return {
    weekNumber,
    weekLabel: weights.label,
    weekSubLabel: `Same ${meals.length} meals in your plan. We're highlighting the ones that fit week ${weekNumber} best.`,
    meals: picked,
  };
}
