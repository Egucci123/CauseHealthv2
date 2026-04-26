// src/components/onboarding/MedicationSearch.tsx
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchMedications, type MedicationEntry } from '../../data/medications';
import { searchMedicationsAPI, type MedSearchResult } from '../../lib/medicalSearch';
import { DEPLETIONS } from '../../data/depletions';
import { useOnboardingStore, type AddedMedication } from '../../store/onboardingStore';
import { SeverityBadge } from '../ui/Badge';
import { InterventionBox } from '../ui/Card';
import { CustomSelect } from '../ui/CustomSelect';

export const MedicationSearch = () => {
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<MedicationEntry[]>([]);
  const [apiResults, setApiResults] = useState<MedSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { medications, addMedication, removeMedication } = useOnboardingStore();

  useEffect(() => {
    if (query.length < 2) { setLocalResults([]); setApiResults([]); setOpen(false); return; }
    // Immediate local search
    setLocalResults(searchMedications(query));
    setOpen(true);
    // Debounced API search for everything else
    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchMedicationsAPI(query);
      setApiResults(results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelectLocal = (med: MedicationEntry) => {
    if (medications.some(m => m.generic === med.generic)) { setQuery(''); setOpen(false); return; }
    addMedication({ generic: med.generic, brand: med.brands[0], duration: '1_6_months', depletes: med.depletes });
    setQuery(''); setOpen(false); inputRef.current?.focus();
  };

  const handleSelectAPI = (med: MedSearchResult) => {
    if (medications.some(m => m.generic.toLowerCase() === med.name.toLowerCase())) { setQuery(''); setOpen(false); return; }
    addMedication({ generic: med.name, duration: '1_6_months', depletes: [] });
    setQuery(''); setOpen(false); inputRef.current?.focus();
  };

  // Merge results: local first (has depletion data), then API results not already in local
  const localNames = new Set(localResults.map(r => r.generic.toLowerCase()));
  const addedNames = new Set(medications.map(m => m.generic.toLowerCase()));
  const filteredAPI = apiResults.filter(r => !localNames.has(r.name.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Search Medications</label>
        <div className="relative">
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Type medication name or brand (e.g. Atorvastatin, Lipitor)" style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">{searching ? 'hourglass_empty' : 'search'}</span>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1 overflow-hidden max-h-64 overflow-y-auto" style={{ borderRadius: '4px' }}>
              {/* Local results first — these have depletion data */}
              {localResults.map((med) => {
                const alreadyAdded = addedNames.has(med.generic.toLowerCase());
                return (
                  <button key={med.generic} onClick={() => handleSelectLocal(med)} disabled={alreadyAdded}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-clinical-cream cursor-pointer'}`}>
                    <div>
                      <p className="text-body text-clinical-charcoal text-sm font-medium">{med.generic}</p>
                      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{med.brands.join(', ')} · {med.category}</p>
                    </div>
                    {alreadyAdded ? <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider">ADDED</span>
                      : med.depletes.length > 0 ? <span className="text-precision text-[0.6rem] text-[#C94F4F] font-bold tracking-wider">DEPLETIONS</span> : null}
                  </button>
                );
              })}
              {/* API results — comprehensive drug database */}
              {filteredAPI.map((med) => {
                const alreadyAdded = addedNames.has(med.name.toLowerCase());
                return (
                  <button key={med.name} onClick={() => handleSelectAPI(med)} disabled={alreadyAdded}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-clinical-cream cursor-pointer'}`}>
                    <div>
                      <p className="text-body text-clinical-charcoal text-sm font-medium">{med.name}</p>
                      {med.form && <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{med.form}</p>}
                    </div>
                    {alreadyAdded && <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider">ADDED</span>}
                  </button>
                );
              })}
              {localResults.length === 0 && filteredAPI.length === 0 && !searching && (
                <div className="px-4 py-3 text-body text-clinical-stone text-sm">No results found. Try different spelling.</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {medications.map((med) => (
          <MedicationCard key={med.id} medication={med} onRemove={() => removeMedication(med.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const MedicationCard = ({ medication, onRemove }: { medication: AddedMedication; onRemove: () => void }) => {
  const [revealed, setRevealed] = useState(false);
  const hasDepletions = medication.depletes.length > 0;

  useEffect(() => {
    if (hasDepletions) { const t = setTimeout(() => setRevealed(true), 400); return () => clearTimeout(t); }
  }, [hasDepletions]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, height: 0 }} transition={{ duration: 0.25 }}
      className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-authority text-xl text-clinical-charcoal font-semibold">{medication.generic}</h3>
            {medication.brand && <p className="text-body text-clinical-stone text-sm">Brand: {medication.brand}</p>}
          </div>
          <button onClick={onRemove} className="text-clinical-stone hover:text-[#C94F4F] transition-colors" aria-label="Remove medication">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="mb-4">
          <CustomSelect
            label="How Long on This Medication?"
            value={medication.duration}
            onChange={(v) => useOnboardingStore.setState(s => ({ medications: s.medications.map(m => m.id === medication.id ? { ...m, duration: v } : m) }))}
            options={[
              { value: 'less_than_1_month', label: 'Less than 1 month' },
              { value: '1_6_months', label: '1–6 months' },
              { value: '6_12_months', label: '6–12 months' },
              { value: '1_3_years', label: '1–3 years' },
              { value: '3_plus_years', label: '3+ years' },
            ]}
          />
        </div>

        <AnimatePresence>
          {revealed && hasDepletions && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}>
              <div className="mt-2 pt-4 border-t border-outline-variant/10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#E8922A] text-[18px]">warning</span>
                  <span className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Depletion Identified</span>
                </div>
                <table className="w-full text-left mb-4">
                  <thead>
                    <tr className="text-precision text-[0.68rem] text-clinical-stone border-b border-outline-variant/10">
                      <th className="pb-2 font-medium">NUTRIENT</th>
                      <th className="pb-2 font-medium">SEVERITY</th>
                      <th className="pb-2 font-medium hidden sm:table-cell">IMPACT</th>
                    </tr>
                  </thead>
                  <tbody className="text-body text-clinical-charcoal">
                    {medication.depletes.map(key => {
                      const dep = DEPLETIONS[key];
                      if (!dep) return null;
                      return (
                        <tr key={key} className="border-b border-outline-variant/5">
                          <td className="py-3 font-semibold text-sm">{dep.nutrient}</td>
                          <td className="py-3"><SeverityBadge severity={dep.severity} /></td>
                          <td className="py-3 text-clinical-stone text-sm hidden sm:table-cell">{dep.symptoms.slice(0, 2).join(', ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {medication.depletes[0] && DEPLETIONS[medication.depletes[0]] && (
                  <InterventionBox label="Included in Your Protocol">
                    {DEPLETIONS[medication.depletes[0]].intervention}
                  </InterventionBox>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[14px]">check_circle</span>
                  <p className="text-body text-clinical-stone text-xs">This will be addressed in your personalized wellness plan.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!hasDepletions && (
          <div className="flex items-center gap-2 mt-2">
            <span className="material-symbols-outlined text-primary-container text-[14px]">check_circle</span>
            <p className="text-body text-clinical-stone text-xs">No documented nutrient depletions for this medication.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
