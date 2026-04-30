// src/components/onboarding/ConditionSearch.tsx
//
// Universal condition picker. Used in onboarding (Step 2) and Settings →
// Health Profile. State is fully owned by the parent — pass `conditions` +
// `onAdd` + `onRemove` and the component handles search/UI only.
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COMMON_CONDITIONS, CONDITIONS } from '../../data/conditions';
import { searchConditionsAPI, type ConditionSearchResult } from '../../lib/medicalSearch';

export interface PickedCondition { id?: string; name: string; icd10?: string }

interface Props {
  conditions: PickedCondition[];
  onAdd: (c: { name: string; icd10?: string }) => void;
  onRemove: (idOrName: string) => void;
}

export const ConditionSearch = ({ conditions, onAdd, onRemove }: Props) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConditionSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const apiResults = await searchConditionsAPI(query);
      setResults(apiResults);
      setOpen(true);
      setSearching(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelect = (name: string, icd10?: string) => {
    onAdd({ name, icd10 }); setQuery(''); setOpen(false);
  };

  const isAdded = (name: string) => conditions.some(c => c.name.toLowerCase() === name.toLowerCase());

  // Custom entry — submit on Enter when no API match yet (matches onboarding UX)
  const handleCustom = () => {
    const name = query.trim();
    if (name.length < 2 || isAdded(name)) return;
    onAdd({ name });
    setQuery('');
    setOpen(false);
  };

  const removeByName = (name: string) => {
    const found = conditions.find(c => c.name === name);
    if (found) onRemove(found.id ?? found.name);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Common Conditions — Tap to Add</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_CONDITIONS.map(name => {
            const added = isAdded(name);
            const cond = CONDITIONS.find(c => c.name === name);
            return (
              <button key={name}
                onClick={() => added ? removeByName(name) : handleSelect(name, cond?.icd10)}
                style={{ borderRadius: '4px' }}
                className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-2 border transition-all duration-150 ${added ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-primary-container/40 hover:text-primary-container'}`}>
                {added && <span className="material-symbols-outlined text-[10px] mr-1">check</span>}
                {name.split(' (')[0]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Search Any Condition</label>
        <div className="relative">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCustom(); } }}
            placeholder="Type any condition, disease, or diagnosis..." style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">{searching ? 'hourglass_empty' : 'search'}</span>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1 max-h-64 overflow-y-auto" style={{ borderRadius: '4px' }}>
              {results.length === 0 && !searching && (
                <button onClick={handleCustom} className="w-full text-left px-4 py-3 hover:bg-clinical-cream transition-colors flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[16px]">add</span>
                  <div>
                    <p className="text-body text-clinical-charcoal text-sm font-medium">Add "{query}"</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">Not in database — saved as a custom condition</p>
                  </div>
                </button>
              )}
              {results.map(cond => {
                const added = isAdded(cond.name);
                return (
                  <button key={`${cond.icd10}-${cond.name}`} onClick={() => handleSelect(cond.name, cond.icd10)} disabled={added}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 hover:bg-clinical-cream transition-colors ${added ? 'opacity-40' : ''}`}>
                    <p className="text-body text-clinical-charcoal text-sm">{cond.name}</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{cond.icd10}</p>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {conditions.length > 0 && (
        <div>
          <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Your Conditions ({conditions.length})</p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {conditions.map(cond => (
                <motion.div key={cond.id ?? cond.name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 bg-primary-container/10 border border-primary-container/30 px-3 py-1.5" style={{ borderRadius: '4px' }}>
                  <span className="text-body text-primary-container text-sm font-medium">{cond.name}</span>
                  <button onClick={() => onRemove(cond.id ?? cond.name)} className="text-primary-container/60 hover:text-primary-container transition-colors">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
