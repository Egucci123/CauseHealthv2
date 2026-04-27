// src/components/onboarding/SupplementSearch.tsx
// Pattern: mirrors MedicationSearch but for supplements with lab-interaction display.
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchSupplements, findSupplement, type SupplementEntry } from '../../data/supplements';
import { useOnboardingStore } from '../../store/onboardingStore';
import { CustomSelect } from '../ui/CustomSelect';

export const SupplementSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SupplementEntry[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { supplements, addSupplement, removeSupplement } = useOnboardingStore();

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setResults(searchSupplements(query));
    setOpen(true);
  }, [query]);

  const addedNames = new Set(supplements.map(s => s.name.toLowerCase()));

  const handleSelect = (supp: SupplementEntry) => {
    if (addedNames.has(supp.name.toLowerCase())) { setQuery(''); setOpen(false); return; }
    addSupplement({ name: supp.name, duration: '1_6_months' });
    setQuery(''); setOpen(false); inputRef.current?.focus();
  };

  // Allow custom entry (supplement not in database)
  const handleCustom = () => {
    if (query.trim().length < 2) return;
    if (addedNames.has(query.toLowerCase().trim())) { setQuery(''); setOpen(false); return; }
    addSupplement({ name: query.trim(), duration: '1_6_months' });
    setQuery(''); setOpen(false); inputRef.current?.focus();
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">
          Search Supplements
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type supplement name (e.g. Magnesium, Creatine, Vitamin D)"
            style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors"
          />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">search</span>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1 overflow-hidden max-h-72 overflow-y-auto"
              style={{ borderRadius: '4px' }}
            >
              {results.length === 0 ? (
                <button
                  onClick={handleCustom}
                  className="w-full text-left px-4 py-3 hover:bg-clinical-cream transition-colors flex items-center gap-3"
                >
                  <span className="material-symbols-outlined text-primary-container text-[16px]">add</span>
                  <div>
                    <p className="text-body text-clinical-charcoal text-sm font-medium">Add "{query}"</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">Custom supplement (no lab interaction data)</p>
                  </div>
                </button>
              ) : (
                results.map((supp) => {
                  const alreadyAdded = addedNames.has(supp.name.toLowerCase());
                  const hasLabInteractions = supp.labInteractions.length > 0;
                  return (
                    <button
                      key={supp.name}
                      onClick={() => handleSelect(supp)}
                      disabled={alreadyAdded}
                      className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${
                        alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-clinical-cream cursor-pointer'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-clinical-charcoal text-sm font-medium">{supp.name}</p>
                        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{supp.category} · {supp.commonUses.slice(0, 2).join(', ')}</p>
                      </div>
                      {alreadyAdded ? (
                        <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider">ADDED</span>
                      ) : hasLabInteractions ? (
                        <span className="text-precision text-[0.55rem] text-[#E8922A] font-bold tracking-wider">AFFECTS LABS</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Added supplements list */}
      <AnimatePresence>
        {supplements.length > 0 && (
          <div className="space-y-2">
            {supplements.map((supp) => {
              const dbEntry = findSupplement(supp.name);
              const labInteractions = dbEntry?.labInteractions ?? [];
              return (
                <SupplementCard
                  key={supp.id}
                  supplement={supp}
                  labInteractions={labInteractions}
                  onRemove={() => removeSupplement(supp.id)}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SupplementCardProps {
  supplement: { id: string; name: string; dose?: string; duration: string; reason?: string };
  labInteractions: { marker: string; effect: string; magnitude: string; note: string }[];
  onRemove: () => void;
}

const SupplementCard = ({ supplement, labInteractions, onRemove }: SupplementCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasLabFlags = labInteractions.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`bg-clinical-white border ${hasLabFlags ? 'border-[#E8922A]/30' : 'border-outline-variant/15'} overflow-hidden`}
      style={{ borderRadius: '6px' }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-body text-clinical-charcoal font-semibold">{supplement.name}</p>
            {hasLabFlags && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="material-symbols-outlined text-[#E8922A] text-[14px]">science</span>
                <span className="text-precision text-[0.55rem] text-[#E8922A] tracking-widest uppercase font-bold">
                  Affects {labInteractions.length} lab marker{labInteractions.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onRemove}
            className="text-clinical-stone hover:text-[#C94F4F] transition-colors"
            aria-label="Remove supplement"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <CustomSelect
            label="Duration"
            value={supplement.duration}
            onChange={(v) => useOnboardingStore.setState((s) => ({
              supplements: s.supplements.map((x) => x.id === supplement.id ? { ...x, duration: v } : x),
            }))}
            options={[
              { value: 'less_than_1_month', label: 'Less than 1 month' },
              { value: '1_6_months', label: '1–6 months' },
              { value: '6_12_months', label: '6–12 months' },
              { value: '1_3_years', label: '1–3 years' },
              { value: '3_plus_years', label: '3+ years' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Dose (optional)</label>
            <input
              type="text"
              value={supplement.dose ?? ''}
              onChange={(e) => useOnboardingStore.setState((s) => ({
                supplements: s.supplements.map((x) => x.id === supplement.id ? { ...x, dose: e.target.value } : x),
              }))}
              placeholder="e.g. 200mg"
              style={{ borderRadius: '4px' }}
              className="w-full bg-clinical-cream border border-outline-variant/20 px-3 py-2.5 text-clinical-charcoal text-body text-sm focus:border-primary-container focus:outline-none transition-colors"
            />
          </div>
        </div>

        {hasLabFlags && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-precision text-[0.6rem] text-[#E8922A] font-bold tracking-widest uppercase hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide' : 'Show'} lab interactions
            <span className="material-symbols-outlined text-[14px]" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
          </button>
        )}

        <AnimatePresence>
          {expanded && hasLabFlags && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-outline-variant/10 space-y-2">
                {labInteractions.map((interaction, i) => (
                  <div key={i} className="bg-[#E8922A]/5 border-l-2 border-[#E8922A] rounded-r px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-precision text-xs text-clinical-charcoal font-bold">{interaction.marker}</span>
                      <span className="text-precision text-[0.55rem] text-[#E8922A] tracking-widest uppercase">{interaction.effect.replace('_', ' ')}</span>
                    </div>
                    <p className="text-body text-clinical-stone text-xs leading-relaxed">{interaction.note}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
