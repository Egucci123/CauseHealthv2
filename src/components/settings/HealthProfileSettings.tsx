// src/components/settings/HealthProfileSettings.tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/SectionLabel';
import { useMedications, useSaveMedications } from '../../hooks/useMedications';
import { useConditions, useSaveConditions } from '../../hooks/useConditions';
import { useSymptoms, useSaveSymptoms } from '../../hooks/useSymptoms';
import { useSupplements, useSaveSupplements } from '../../hooks/useSupplements';
import { searchMedications, type MedicationEntry } from '../../data/medications';
import { searchMedicationsAPI, type MedSearchResult } from '../../lib/medicalSearch';
import { searchSupplements, findSupplement, getCommonDoses, type SupplementEntry } from '../../data/supplements';
import { SYMPTOM_CATEGORIES } from '../../data/symptoms';

// ─── Medications Section ─────────────────────────────────────────────────────

interface MedEntry { name: string; brand_name?: string; dose?: string; duration_category: string; }

const MedicationsEditor = () => {
  const { data: savedMeds, isLoading } = useMedications();
  const saveMutation = useSaveMedications();
  const [meds, setMeds] = useState<MedEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicationEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load from DB on mount
  useEffect(() => {
    if (savedMeds) {
      setMeds(savedMeds.map(m => ({
        name: m.name, brand_name: m.brandName ?? undefined,
        dose: m.dose ?? undefined, duration_category: m.durationCategory ?? '1_6_months',
      })));
    }
  }, [savedMeds]);

  const [apiResults, setApiResults] = useState<MedSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (query.length >= 2) {
      setResults(searchMedications(query));
      setOpen(true);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const api = await searchMedicationsAPI(query);
        setApiResults(api);
      }, 300);
    } else { setResults([]); setApiResults([]); setOpen(false); }
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const localNames = new Set(results.map(r => r.generic.toLowerCase()));
  const filteredAPI = apiResults.filter(r => !localNames.has(r.name.toLowerCase()));

  const addMed = (med: MedicationEntry) => {
    if (meds.some(m => m.name === med.generic)) { setQuery(''); setOpen(false); return; }
    setMeds(prev => [...prev, { name: med.generic, brand_name: med.brands[0], duration_category: '1_6_months' }]);
    setQuery(''); setOpen(false); setSaved(false);
    inputRef.current?.focus();
  };

  const removeMed = (index: number) => {
    setMeds(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const updateDuration = (index: number, duration: string) => {
    setMeds(prev => prev.map((m, i) => i === index ? { ...m, duration_category: duration } : m));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(meds);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedMeds && isLoading) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="medication">Medications</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Medications'}</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="relative">
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search medication name or brand..." style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">search</span>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1 overflow-hidden" style={{ borderRadius: '4px' }}>
              {results.map(med => {
                const added = meds.some(m => m.name === med.generic);
                return (
                  <button key={med.generic} onClick={() => addMed(med)} disabled={added}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${added ? 'opacity-40 cursor-not-allowed' : 'hover:bg-clinical-cream cursor-pointer'}`}>
                    <div>
                      <p className="text-body text-clinical-charcoal text-sm font-medium">{med.generic}</p>
                      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{med.brands.join(', ')} · {med.category}</p>
                    </div>
                    {added && <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider">ADDED</span>}
                  </button>
                );
              })}
              {filteredAPI.map(med => {
                const added = meds.some(m => m.name.toLowerCase() === med.name.toLowerCase());
                return (
                  <button key={med.name} onClick={() => { if (!added) { setMeds(prev => [...prev, { name: med.name, duration_category: '1_6_months' }]); setQuery(''); setOpen(false); setSaved(false); } }} disabled={added}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${added ? 'opacity-40' : 'hover:bg-clinical-cream cursor-pointer'}`}>
                    <div>
                      <p className="text-body text-clinical-charcoal text-sm font-medium">{med.name}</p>
                      {med.form && <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{med.form}</p>}
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Current medications list */}
      {meds.length === 0 ? (
        <p className="text-body text-clinical-stone text-sm py-4 text-center">No medications added. Search above to add your prescriptions.</p>
      ) : (
        <div className="space-y-2">
          {meds.map((med, i) => (
            <div key={`${med.name}-${i}`} className="bg-clinical-white rounded-lg border border-outline-variant/10 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-body text-clinical-charcoal text-sm font-medium">{med.name}</p>
                {med.brand_name && <p className="text-precision text-[0.6rem] text-clinical-stone">{med.brand_name}</p>}
              </div>
              <select value={med.duration_category} onChange={e => updateDuration(i, e.target.value)} style={{ borderRadius: '4px' }}
                className="bg-clinical-cream border border-outline-variant/20 px-2 py-1.5 text-body text-xs text-clinical-charcoal focus:border-primary-container focus:outline-none">
                <option value="less_than_1_month">&lt; 1 month</option>
                <option value="1_6_months">1–6 months</option>
                <option value="6_12_months">6–12 months</option>
                <option value="1_3_years">1–3 years</option>
                <option value="3_plus_years">3+ years</option>
              </select>
              <button onClick={() => removeMed(i)} className="text-clinical-stone hover:text-[#C94F4F] transition-colors p-1">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Symptoms Section ────────────────────────────────────────────────────────

interface SymEntry { symptom: string; severity: number; category: string; }

const SymptomsEditor = () => {
  const { data: savedSymptoms, isLoading } = useSymptoms();
  const saveMutation = useSaveSymptoms();
  const [symptoms, setSymptoms] = useState<SymEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedSymptoms) {
      setSymptoms(savedSymptoms.map(s => ({
        symptom: s.symptom, severity: s.severity, category: s.category ?? '',
      })));
    }
  }, [savedSymptoms]);

  const isSelected = (symptom: string) => symptoms.some(s => s.symptom === symptom);

  const toggleSymptom = (symptom: string, category: string) => {
    setSaved(false);
    if (isSelected(symptom)) {
      setSymptoms(prev => prev.filter(s => s.symptom !== symptom));
    } else {
      setSymptoms(prev => [...prev, { symptom, severity: 5, category }]);
    }
  };

  const updateSeverity = (symptom: string, severity: number) => {
    setSymptoms(prev => prev.map(s => s.symptom === symptom ? { ...s, severity } : s));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(symptoms);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedSymptoms && isLoading) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="symptoms">Symptoms</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Symptoms'}</Button>
      </div>

      {symptoms.length > 0 && (
        <div className="bg-primary-container/5 border border-primary-container/20 rounded-lg px-4 py-3">
          <p className="text-body text-primary-container text-sm font-medium">{symptoms.length} symptom{symptoms.length !== 1 ? 's' : ''} selected</p>
        </div>
      )}

      {/* Category accordion */}
      {SYMPTOM_CATEGORIES.map(category => {
        const isOpen = activeCategory === category.id;
        const selectedCount = symptoms.filter(s => s.category === category.id).length;
        return (
          <div key={category.id} className="bg-clinical-white rounded-[10px] overflow-hidden border border-outline-variant/10">
            <button onClick={() => setActiveCategory(isOpen ? null : category.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-clinical-cream/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-clinical-stone text-[20px]">{category.icon}</span>
                <span className="text-body text-clinical-charcoal font-medium">{category.label}</span>
                {selectedCount > 0 && <span className="inline-block bg-primary-container text-white text-precision text-[0.6rem] px-2 py-0.5 font-bold">{selectedCount}</span>}
              </div>
              <span className={`material-symbols-outlined text-clinical-stone text-[18px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="px-5 pb-5 pt-1 border-t border-outline-variant/10">
                    <div className="flex flex-wrap gap-2 mt-3">
                      {category.symptoms.map(symptom => {
                        const selected = isSelected(symptom);
                        return (
                          <button key={symptom} onClick={() => toggleSymptom(symptom, category.id)} style={{ borderRadius: '4px' }}
                            className={`text-body text-sm px-3 py-2 border transition-all ${selected ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-primary-container/40'}`}>
                            {selected && <span className="material-symbols-outlined text-[12px] mr-1">check</span>}{symptom}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Severity sliders */}
      {symptoms.length > 0 && (
        <div>
          <SectionLabel>Rate Your Severity</SectionLabel>
          <div className="space-y-3 mt-3">
            {symptoms.map(sym => (
              <div key={sym.symptom} className="bg-clinical-white rounded-lg p-4 border border-outline-variant/10">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-body text-clinical-charcoal text-sm font-medium">{sym.symptom}</p>
                  <span className="text-precision text-[0.68rem] text-clinical-stone">{sym.severity}/10</span>
                </div>
                <input type="range" min={1} max={10} value={sym.severity} onChange={e => updateSeverity(sym.symptom, parseInt(e.target.value))} className="w-full accent-primary-container cursor-pointer" />
                <div className="flex justify-between mt-1">
                  <span className="text-precision text-[0.6rem] text-clinical-stone">Mild</span>
                  <span className="text-precision text-[0.6rem] text-clinical-stone">Severe</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Conditions Section ──────────────────────────────────────────────────────

const ConditionsEditor = () => {
  const { data: savedConditions, isLoading } = useConditions();
  const saveMutation = useSaveConditions();
  const [conditions, setConditions] = useState<{ name: string; icd10?: string }[]>([]);
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedConditions) {
      setConditions(savedConditions.map(c => ({ name: c.name, icd10: c.icd10 ?? undefined })));
    }
  }, [savedConditions]);

  const addCondition = () => {
    const name = input.trim();
    if (!name || conditions.some(c => c.name.toLowerCase() === name.toLowerCase())) return;
    setConditions(prev => [...prev, { name }]);
    setInput('');
    setSaved(false);
  };

  const removeCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(conditions);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedConditions && isLoading) return <div className="h-24 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="medical_information">Diagnosed Conditions</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Conditions'}</Button>
      </div>

      <div className="flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } }}
          placeholder="Type a condition (e.g., Ulcerative Colitis, Hypothyroidism)..." style={{ borderRadius: '4px' }}
          className="flex-1 px-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
        <Button variant="secondary" size="md" onClick={addCondition} disabled={!input.trim()}>Add</Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-body text-clinical-stone text-sm py-2 text-center">No conditions added. Type above to add your diagnosed conditions.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {conditions.map((c, i) => (
            <div key={`${c.name}-${i}`} className="inline-flex items-center gap-2 bg-clinical-white border border-outline-variant/15 px-3 py-2 rounded-lg">
              <span className="text-body text-clinical-charcoal text-sm">{c.name}</span>
              <button onClick={() => removeCondition(i)} className="text-clinical-stone hover:text-[#C94F4F] transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Supplements Section ─────────────────────────────────────────────────────

interface SuppEntry { name: string; dose?: string; durationCategory?: string; reason?: string; }

const SupplementsEditor = () => {
  const { data: savedSupps, isLoading } = useSupplements();
  const saveMutation = useSaveSupplements();
  const [supps, setSupps] = useState<SuppEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SupplementEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savedSupps) {
      setSupps(savedSupps.map(s => ({
        name: s.name,
        dose: s.dose ?? undefined,
        durationCategory: s.durationCategory ?? '1_6_months',
        reason: s.reason ?? undefined,
      })));
    }
  }, [savedSupps]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setResults(searchSupplements(query));
    setOpen(true);
  }, [query]);

  const addedNames = new Set(supps.map(s => s.name.toLowerCase()));

  const addSupp = (name: string) => {
    if (!name || addedNames.has(name.toLowerCase())) { setQuery(''); setOpen(false); return; }
    setSupps(prev => [...prev, { name, durationCategory: '1_6_months' }]);
    setQuery(''); setOpen(false); setSaved(false);
    inputRef.current?.focus();
  };

  const removeSupp = (i: number) => { setSupps(prev => prev.filter((_, idx) => idx !== i)); setSaved(false); };
  const updateField = (i: number, patch: Partial<SuppEntry>) => {
    setSupps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(supps);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedSupps && isLoading) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="eco">Supplements</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Supplements'}</Button>
      </div>
      <p className="text-body text-clinical-stone text-xs">
        Many supplements (creatine, biotin, niacin, B12) directly alter lab values. Keeping this list current makes your AI analysis accurate. Regenerate your wellness plan or doctor prep after changes to apply them.
      </p>

      <div className="relative">
        <div className="relative">
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search supplement (e.g. Magnesium, Creatine, Vitamin D)..." style={{ borderRadius: '4px' }}
            className="w-full pl-10 pr-4 py-3 bg-clinical-cream border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors"
            onKeyDown={e => { if (e.key === 'Enter' && results.length === 0 && query.trim().length >= 2) { e.preventDefault(); addSupp(query.trim()); } }} />
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[18px]">search</span>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 right-0 z-20 bg-clinical-white border border-outline-variant/20 shadow-card-md mt-1 overflow-hidden max-h-72 overflow-y-auto" style={{ borderRadius: '4px' }}>
              {results.length === 0 ? (
                <button onClick={() => addSupp(query.trim())} className="w-full text-left px-4 py-3 hover:bg-clinical-cream transition-colors flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[16px]">add</span>
                  <div>
                    <p className="text-body text-clinical-charcoal text-sm font-medium">Add "{query}"</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">Custom supplement (no lab interaction data)</p>
                  </div>
                </button>
              ) : (
                results.map(supp => {
                  const added = addedNames.has(supp.name.toLowerCase());
                  const hasLab = supp.labInteractions.length > 0;
                  return (
                    <button key={supp.name} onClick={() => addSupp(supp.name)} disabled={added}
                      className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 last:border-0 flex items-center justify-between transition-colors ${added ? 'opacity-40 cursor-not-allowed' : 'hover:bg-clinical-cream cursor-pointer'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-clinical-charcoal text-sm font-medium">{supp.name}</p>
                        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{supp.category}</p>
                      </div>
                      {added ? <span className="text-precision text-[0.6rem] text-primary-container font-bold tracking-wider">ADDED</span>
                        : hasLab ? <span className="text-precision text-[0.55rem] text-[#E8922A] font-bold tracking-wider">AFFECTS LABS</span> : null}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {supps.length === 0 ? (
        <p className="text-body text-clinical-stone text-sm py-4 text-center">No supplements added. Search above to add what you take.</p>
      ) : (
        <div className="space-y-2">
          {supps.map((s, i) => {
            const dbEntry = findSupplement(s.name);
            const hasLab = (dbEntry?.labInteractions.length ?? 0) > 0;
            return (
              <div key={`${s.name}-${i}`} className={`bg-clinical-white rounded-lg border ${hasLab ? 'border-[#E8922A]/30' : 'border-outline-variant/10'} px-4 py-3`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-clinical-charcoal text-sm font-medium">{s.name}</p>
                    {hasLab && (
                      <p className="text-precision text-[0.55rem] text-[#E8922A] tracking-widest uppercase font-bold mt-0.5">
                        Affects {dbEntry!.labInteractions.length} lab marker{dbEntry!.labInteractions.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeSupp(i)} className="text-clinical-stone hover:text-[#C94F4F] transition-colors p-1">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={s.dose ?? ''} onChange={e => updateField(i, { dose: e.target.value })} style={{ borderRadius: '4px' }}
                    className="bg-clinical-cream border border-outline-variant/20 px-2 py-1.5 text-body text-xs text-clinical-charcoal focus:border-primary-container focus:outline-none">
                    <option value="">Dose: not sure</option>
                    {getCommonDoses(s.name).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={s.durationCategory ?? '1_6_months'} onChange={e => updateField(i, { durationCategory: e.target.value })} style={{ borderRadius: '4px' }}
                    className="bg-clinical-cream border border-outline-variant/20 px-2 py-1.5 text-body text-xs text-clinical-charcoal focus:border-primary-container focus:outline-none">
                    <option value="less_than_1_month">&lt; 1 month</option>
                    <option value="1_6_months">1–6 months</option>
                    <option value="6_12_months">6–12 months</option>
                    <option value="1_3_years">1–3 years</option>
                    <option value="3_plus_years">3+ years</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const HealthProfileSettings = () => {
  return (
    <div className="space-y-10">
      <ConditionsEditor />
      <div className="border-t border-outline-variant/10" />
      <MedicationsEditor />
      <div className="border-t border-outline-variant/10" />
      <SupplementsEditor />
      <div className="border-t border-outline-variant/10" />
      <SymptomsEditor />
    </div>
  );
};
