// src/components/wellness/FastFoodPlaybook.tsx
//
// FAST FOOD PLAYBOOK — collapsible venue groups, each meal expandable
// =====================================================================
// 5 venue groups, all collapsed by default. Click the group header to
// expand and see meal cards inside; click again to collapse. Each meal
// card itself is also expandable to show full order details.
// Two-level collapse keeps the page short until the user opts in.

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FOOD_PLAYBOOK, type MealEntry } from '../../data/foodPlaybook';

const VENUE_GROUPS: Array<{
  key: string; label: string; emoji: string;
  match: (m: MealEntry) => boolean;
}> = [
  {
    key: 'drive_thru', label: 'Drive-thru', emoji: '🚗',
    match: (m) =>
      m.playbook === 'fast_food' ||
      /mcdonald|wendy|burger king|chick.?fil.?a|taco bell|popeye|kfc|sonic|arby|five guys|jimmy john|jersey mike/i.test(JSON.stringify(m)),
  },
  {
    key: 'coffee_shop', label: 'Coffee shop (Starbucks / Dunkin)', emoji: '☕',
    match: (m) => /starbucks|dunkin|panera/i.test(JSON.stringify(m)),
  },
  {
    key: 'fast_casual', label: 'Fast casual (Chipotle / Subway / Panera)', emoji: '🥗',
    match: (m) => /chipotle|subway|panera|sweetgreen|cava/i.test(JSON.stringify(m)),
  },
  {
    key: 'convenience', label: 'Gas station / convenience', emoji: '⛽',
    match: (m) =>
      m.playbook === 'convenience_store' ||
      /wawa|sheetz|7.?eleven|royal farms|quiktrip|circle k|speedway|cumberland/i.test(JSON.stringify(m)),
  },
  {
    key: 'airport_travel', label: 'Airport / travel / hotel', emoji: '✈️',
    match: (m) =>
      m.playbook === 'travel_hotel' ||
      /airport|hudson news|gate.?side|plane|hotel|continental|mini.?fridge/i.test(JSON.stringify(m)),
  },
];

const COST_LABEL: Record<number, string> = { 1: '< $5', 2: '$5–12', 3: '$12+' };
const TARGET_LABELS: Record<string, string> = {
  high_protein: 'High protein',
  low_carb: 'Low carb',
  anti_inflam: 'Anti-inflammatory',
  satiety: 'Filling',
  budget: 'Budget',
  fiber: 'High fiber',
  electrolytes: 'Electrolytes',
  gut_friendly: 'Gut-friendly',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
  bone_density: 'Bone density',
  cardio_friendly: 'Cardio-friendly',
};

function MealCard({ meal }: { meal: MealEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-clinical-white border border-outline-variant/15 rounded-[10px] overflow-hidden hover:border-[#1B423A]/40 transition-colors">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-clinical-cream/40 transition-colors"
      >
        <span className="text-2xl flex-shrink-0 leading-none">{meal.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-body text-clinical-charcoal text-sm font-semibold leading-snug">{meal.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">{meal.protein_g}g protein</span>
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">
              {meal.prepMinutes === 0 ? 'No prep' : `${meal.prepMinutes} min`}
            </span>
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">{COST_LABEL[meal.cost] ?? ''}</span>
          </div>
        </div>
        <span
          className="material-symbols-outlined text-clinical-stone text-[18px] flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          expand_more
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-outline-variant/10 space-y-3">
              <div className="pt-3">
                <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1.5">What to order</p>
                <ul className="text-body text-clinical-charcoal text-sm leading-relaxed space-y-0.5">
                  {meal.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2"><span className="text-clinical-stone mt-0.5">•</span><span>{ing}</span></li>
                  ))}
                </ul>
              </div>
              {Array.isArray(meal.targets) && meal.targets.length > 0 && (
                <div>
                  <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1.5">Hits</p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.targets.map((t, i) => (
                      <span key={i} className="text-precision text-[0.65rem] tracking-wide bg-[#1B423A]/10 text-[#1B423A] px-2 py-0.5 rounded-full">
                        {TARGET_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {meal.constraint?.requiresChain && meal.constraint.requiresChain.length > 0 && (
                <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">
                  📍 Available at: {meal.constraint.requiresChain.join(' · ')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Collapsible group section — header click toggles open/closed.
function VenueGroup({ group, meals }: { group: { key: string; label: string; emoji: string }; meals: MealEntry[] }) {
  const [open, setOpen] = useState(false);
  if (meals.length === 0) return null;
  return (
    <div className="bg-clinical-white border border-outline-variant/15 rounded-[10px] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-clinical-cream/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0 leading-none">{group.emoji}</span>
          <div>
            <p className="text-body text-clinical-charcoal text-sm font-bold">{group.label}</p>
            <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">{meals.length} orders</p>
          </div>
        </div>
        <span
          className="material-symbols-outlined text-clinical-stone text-[20px] flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          expand_more
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-outline-variant/10 space-y-2">
              <div className="pt-3 space-y-2">
                {meals.map(meal => <MealCard key={meal.id} meal={meal} />)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const FastFoodPlaybook = () => {
  const groupedMeals = useMemo(() => {
    const result: Record<string, MealEntry[]> = {};
    for (const group of VENUE_GROUPS) {
      result[group.key] = FOOD_PLAYBOOK.filter(group.match);
    }
    return result;
  }, []);

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#E8922A] overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#E8922A] text-[20px]">fastfood</span>
          <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">
            Fast Food Playbook
          </p>
        </div>
        <p className="text-body text-clinical-stone text-xs mb-4 leading-relaxed">
          Curated orders for when you're at a drive-thru, gas station, coffee shop, or airport. Tap a venue to
          expand its orders; tap any order to see full ingredients + macros.
        </p>

        <div className="space-y-2">
          {VENUE_GROUPS.map(group => (
            <VenueGroup key={group.key} group={group} meals={groupedMeals[group.key] ?? []} />
          ))}
        </div>
      </div>
    </div>
  );
};
