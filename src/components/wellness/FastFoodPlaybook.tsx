// src/components/wellness/FastFoodPlaybook.tsx
//
// FAST FOOD PLAYBOOK — pressable, expandable meal cards
// =====================================================
// Pulls all fast-food / convenience-store / airport / hotel / drive-thru
// entries from the foodPlaybook.ts library (~89 curated meals). Each
// card is collapsed by default and expands on click to show full
// ingredients, prep time, cost tier, protein grams, and the targets it
// hits (high-protein, low-carb, anti-inflammatory, etc.).
//
// Grouped by venue category so the user can quickly find "I'm at the
// airport" or "I'm at Wawa" or "I need a Starbucks pick."
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FOOD_PLAYBOOK, type MealEntry } from '../../data/foodPlaybook';

// Groups the user actually thinks in. Each entry maps to a filter
// predicate over MealEntry. Order = display order in UI.
const VENUE_GROUPS: Array<{
  key: string; label: string; icon: string; emoji: string;
  match: (m: MealEntry) => boolean;
}> = [
  {
    key: 'drive_thru', label: 'Drive-thru', icon: 'directions_car', emoji: '🚗',
    match: (m) =>
      m.playbook === 'fast_food' ||
      /mcdonald|wendy|burger king|chick.?fil.?a|taco bell|popeye|kfc|sonic|arby|five guys|jimmy john|jersey mike/i.test(JSON.stringify(m)),
  },
  {
    key: 'coffee_shop', label: 'Coffee shop (Starbucks / Dunkin)', icon: 'local_cafe', emoji: '☕',
    match: (m) => /starbucks|dunkin|panera/i.test(JSON.stringify(m)),
  },
  {
    key: 'fast_casual', label: 'Fast casual (Chipotle / Subway / Panera)', icon: 'restaurant_menu', emoji: '🥗',
    match: (m) => /chipotle|subway|panera|sweetgreen|cava/i.test(JSON.stringify(m)),
  },
  {
    key: 'convenience', label: 'Gas station / convenience', icon: 'local_gas_station', emoji: '⛽',
    match: (m) =>
      m.playbook === 'convenience_store' ||
      /wawa|sheetz|7.?eleven|royal farms|quiktrip|circle k|speedway|cumberland/i.test(JSON.stringify(m)),
  },
  {
    key: 'airport_travel', label: 'Airport / travel / hotel', icon: 'flight', emoji: '✈️',
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
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">
              {meal.protein_g}g protein
            </span>
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">
              {meal.prepMinutes === 0 ? 'No prep' : `${meal.prepMinutes} min`}
            </span>
            <span className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">
              {COST_LABEL[meal.cost] ?? ''}
            </span>
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
                <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1.5">
                  What to order
                </p>
                <ul className="text-body text-clinical-charcoal text-sm leading-relaxed space-y-0.5">
                  {meal.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-clinical-stone mt-0.5">•</span>
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {Array.isArray(meal.targets) && meal.targets.length > 0 && (
                <div>
                  <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1.5">
                    Hits
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {meal.targets.map((t, i) => (
                      <span
                        key={i}
                        className="text-precision text-[0.65rem] tracking-wide bg-[#1B423A]/10 text-[#1B423A] px-2 py-0.5 rounded-full"
                      >
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

export const FastFoodPlaybook = () => {
  const [activeGroup, setActiveGroup] = useState<string>(VENUE_GROUPS[0].key);

  const groupedMeals = useMemo(() => {
    const result: Record<string, MealEntry[]> = {};
    for (const group of VENUE_GROUPS) {
      result[group.key] = FOOD_PLAYBOOK.filter(group.match);
    }
    return result;
  }, []);

  const activeMeals = groupedMeals[activeGroup] ?? [];
  const activeGroupMeta = VENUE_GROUPS.find(g => g.key === activeGroup);

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
          Curated orders for when you're at a drive-thru, gas station, coffee shop, or airport. Tap any meal to
          see exactly what to order and the macros it hits.
        </p>

        {/* Venue tabs */}
        <div className="flex border-b border-outline-variant/10 mb-4 -mx-5 sm:-mx-6 px-5 sm:px-6 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {VENUE_GROUPS.map(group => {
            const count = groupedMeals[group.key]?.length ?? 0;
            return (
              <button
                key={group.key}
                onClick={() => setActiveGroup(group.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-precision text-[0.62rem] sm:text-[0.65rem] font-bold tracking-wide uppercase border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
                  activeGroup === group.key
                    ? 'border-[#1B423A] text-[#1B423A]'
                    : 'border-transparent text-clinical-stone hover:text-clinical-charcoal'
                }`}
              >
                <span className="text-base leading-none">{group.emoji}</span>
                {group.label}
                <span className="text-precision text-[0.6rem] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeGroup}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-2"
          >
            {activeMeals.length === 0 ? (
              <p className="text-body text-clinical-stone text-sm text-center py-8">
                No {activeGroupMeta?.label.toLowerCase()} entries yet — we're adding more as we find good ones.
              </p>
            ) : (
              activeMeals.map(meal => <MealCard key={meal.id} meal={meal} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
