// src/components/onboarding/ConditionSearch.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchConditions, COMMON_CONDITIONS, CONDITIONS, type Condition } from '../../data/conditions';
import { useOnboardingStore } from '../../store/onboardingStore';

export const ConditionSearch = () => {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Condition[]>([]);
  const [open, setOpen]       = useState(false);
  const { conditions, addCondition, removeCondition } = useOnboardingStore();

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.length >= 2) { setResults(searchConditions(q)); setOpen(true); }
    else setOpen(false);
  };

  const handleSelect = (name: string, icd10?: string) => {
    addCondition({ name, icd10 }); setQuery(''); setOpen(false);
  };

  const isAdded = (name: string) => conditions.some(c => c.name === name);

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
                onClick={() => added ? removeCondition(conditions.find(c => c.name === name)!.id) : handleSelect(name, cond?.icd10)}
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
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Search for Other Conditions</label>
        <div className="relative">
          <input type="text" value={query} onChange={e => handleSearch(e.target.value)} placeholder="Type condition name..." style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">search</span>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1" style={{ borderRadius: '4px' }}>
              {results.map(cond => (
                <button key={cond.name} onClick={() => handleSelect(cond.name, cond.icd10)} disabled={isAdded(cond.name)}
                  className="w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 hover:bg-clinical-cream transition-colors disabled:opacity-40">
                  <p className="text-body text-clinical-charcoal text-sm">{cond.name}</p>
                  <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{cond.category}{cond.icd10 ? ` · ${cond.icd10}` : ''}</p>
                </button>
              ))}
              {query.length >= 2 && !results.some(r => r.name.toLowerCase() === query.toLowerCase()) && !isAdded(query) && (
                <button onClick={() => { handleSelect(query.trim()); }} className="w-full text-left px-4 py-3 border-t border-outline-variant/10 hover:bg-clinical-cream transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[16px]">add_circle</span>
                    <div>
                      <p className="text-body text-primary-container text-sm font-medium">Add "{query.trim()}"</p>
                      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">Custom condition</p>
                    </div>
                  </div>
                </button>
              )}
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
                <motion.div key={cond.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 bg-primary-container/10 border border-primary-container/30 px-3 py-1.5" style={{ borderRadius: '4px' }}>
                  <span className="text-body text-primary-container text-sm font-medium">{cond.name}</span>
                  <button onClick={() => removeCondition(cond.id)} className="text-primary-container/60 hover:text-primary-container transition-colors">
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
