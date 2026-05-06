// src/components/settings/HealthProfileSettings.tsx
//
// Health Profile editing in Settings. Reuses the EXACT same picker components
// from onboarding (ConditionSearch, MedicationSearch, SupplementSearch) so the
// add-things UX is identical: type → autocomplete dropdown → click to add.
// Only difference: state lives in Supabase via React Query mutations instead
// of the in-memory onboarding store.
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/SectionLabel';
import { useMedications, useSaveMedications } from '../../hooks/useMedications';
import { useConditions, useSaveConditions } from '../../hooks/useConditions';
import { useSymptoms, useSaveSymptoms } from '../../hooks/useSymptoms';
import { useSupplements, useSaveSupplements } from '../../hooks/useSupplements';
import { ConditionSearch, type PickedCondition } from '../onboarding/ConditionSearch';
import { MedicationSearch, type PickedMedication } from '../onboarding/MedicationSearch';
import { SupplementSearch, type PickedSupplement } from '../onboarding/SupplementSearch';
import { LifestyleEditor, type LifestyleValue } from '../health/LifestyleEditor';
import { DailyLifeEditor } from '../health/DailyLifeEditor';
import { useAuthStore } from '../../store/authStore';
import type { LifeContext } from '../../store/onboardingStore';
import { MEDICATIONS } from '../../data/medications';

const findLocalMed = (name: string) =>
  MEDICATIONS.find(m => m.generic.toLowerCase() === name.toLowerCase()
    || m.brands.some(b => b.toLowerCase() === name.toLowerCase()));
import { SYMPTOM_CATEGORIES } from '../../data/symptoms';

// ─── Conditions ──────────────────────────────────────────────────────────────

const ConditionsEditor = () => {
  const { data: savedConditions } = useConditions();
  const saveMutation = useSaveConditions();
  const [conditions, setConditions] = useState<PickedCondition[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedConditions) {
      setConditions(savedConditions.map(c => ({ id: c.id, name: c.name, icd10: c.icd10 ?? undefined })));
    }
  }, [savedConditions]);

  const handleAdd = (c: { name: string; icd10?: string }) => {
    if (conditions.some(x => x.name.toLowerCase() === c.name.toLowerCase())) return;
    setConditions(prev => [...prev, { name: c.name, icd10: c.icd10 }]);
    setSaved(false);
  };
  const handleRemove = (idOrName: string) => {
    setConditions(prev => prev.filter(c => (c.id ?? c.name) !== idOrName));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(conditions.map(c => ({ name: c.name, icd10: c.icd10 })));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedConditions) return <div className="h-24 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="medical_information">Diagnosed Conditions</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Conditions'}</Button>
      </div>
      <ConditionSearch conditions={conditions} onAdd={handleAdd} onRemove={handleRemove} />
    </div>
  );
};

// ─── Medications ─────────────────────────────────────────────────────────────

const MedicationsEditor = () => {
  const { data: savedMeds } = useMedications();
  const saveMutation = useSaveMedications();
  const [meds, setMeds] = useState<PickedMedication[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedMeds) {
      setMeds(savedMeds.map(m => {
        const local = findLocalMed(m.name);
        return {
          id: m.id,
          generic: m.name,
          brand: m.brandName ?? local?.brands[0],
          duration: m.durationCategory ?? '1_6_months',
          depletes: local?.depletes ?? [],
        };
      }));
    }
  }, [savedMeds]);

  const handleAdd = (med: { generic: string; brand?: string; duration: string; depletes: string[] }) => {
    if (meds.some(m => m.generic.toLowerCase() === med.generic.toLowerCase())) return;
    setMeds(prev => [...prev, { ...med }]);
    setSaved(false);
  };
  const handleRemove = (idOrGeneric: string) => {
    setMeds(prev => prev.filter(m => (m.id ?? m.generic) !== idOrGeneric));
    setSaved(false);
  };
  const handleUpdateDuration = (idOrGeneric: string, duration: string) => {
    setMeds(prev => prev.map(m => (m.id ?? m.generic) === idOrGeneric ? { ...m, duration } : m));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(meds.map(m => ({
      name: m.generic,
      brand_name: m.brand,
      duration_category: m.duration,
    })));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedMeds) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="medication">Medications</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Medications'}</Button>
      </div>
      <MedicationSearch
        medications={meds}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onUpdateDuration={handleUpdateDuration}
        showDepletionDetail={false}
      />
    </div>
  );
};

// ─── Supplements ─────────────────────────────────────────────────────────────

const SupplementsEditor = () => {
  const { data: savedSupps } = useSupplements();
  const saveMutation = useSaveSupplements();
  const [supps, setSupps] = useState<PickedSupplement[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedSupps) {
      setSupps(savedSupps.map(s => ({
        id: s.id,
        name: s.name,
        dose: s.dose ?? undefined,
        duration: s.durationCategory ?? '1_6_months',
        reason: s.reason ?? undefined,
      })));
    }
  }, [savedSupps]);

  const handleAdd = (s: { name: string; duration: string }) => {
    if (supps.some(x => x.name.toLowerCase() === s.name.toLowerCase())) return;
    setSupps(prev => [...prev, { ...s }]);
    setSaved(false);
  };
  const handleRemove = (idOrName: string) => {
    setSupps(prev => prev.filter(s => (s.id ?? s.name) !== idOrName));
    setSaved(false);
  };
  const handleUpdateField = (idOrName: string, patch: { dose?: string; duration?: string }) => {
    setSupps(prev => prev.map(s => {
      if ((s.id ?? s.name) !== idOrName) return s;
      return {
        ...s,
        dose: patch.dose !== undefined ? patch.dose : s.dose,
        duration: patch.duration !== undefined ? patch.duration : s.duration,
      };
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(supps.map(s => ({
      name: s.name,
      dose: s.dose,
      durationCategory: s.duration,
      reason: s.reason,
    })));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!savedSupps) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="eco">Supplements</SectionLabel>
        <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={handleSave}
          icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Supplements'}</Button>
      </div>
      <SupplementSearch
        supplements={supps}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onUpdateField={handleUpdateField}
      />
    </div>
  );
};

// ─── Symptoms (unchanged — accordion already works fine) ─────────────────────

interface SymEntry { symptom: string; severity: number; category: string; }

const SymptomsEditor = () => {
  const { data: savedSymptoms } = useSymptoms();
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

  if (!savedSymptoms) return <div className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />;

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
                        const sel = isSelected(symptom);
                        return (
                          <button key={symptom} onClick={() => toggleSymptom(symptom, category.id)} style={{ borderRadius: '4px' }}
                            className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-2 border transition-all ${sel ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                            {sel && <span className="material-symbols-outlined text-[10px] mr-1">check</span>}
                            {symptom}
                          </button>
                        );
                      })}
                    </div>
                    {symptoms.filter(s => s.category === category.id).map(s => (
                      <div key={s.symptom} className="mt-3 flex items-center gap-3">
                        <span className="text-body text-clinical-charcoal text-sm flex-1 truncate">{s.symptom}</span>
                        <input type="range" min={1} max={10} value={s.severity}
                          onChange={e => updateSeverity(s.symptom, parseInt(e.target.value))}
                          className="w-32 accent-primary-container" />
                        <span className="text-precision text-[0.65rem] text-clinical-charcoal w-6 text-right">{s.severity}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

// ─── Lifestyle ───────────────────────────────────────────────────────────────

const LifestyleSection = () => {
  const profile = useAuthStore(s => s.profile);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const [val, setVal] = useState<LifestyleValue>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.lifestyle) setVal(profile.lifestyle as LifestyleValue);
  }, [profile?.lifestyle]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ lifestyle: val } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="self_improvement">Lifestyle (Sleep · Diet · Exercise · Stress)</SectionLabel>
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave} icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Lifestyle'}</Button>
      </div>
      <LifestyleEditor value={val} onChange={patch => { setVal(prev => ({ ...prev, ...patch })); setSaved(false); }} />
    </div>
  );
};

// ─── Daily Life (work / home / food / healthcare) ────────────────────────────

const DailyLifeSection = () => {
  const profile = useAuthStore(s => s.profile);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const [val, setVal] = useState<Partial<LifeContext>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.lifeContext) setVal(profile.lifeContext as Partial<LifeContext>);
  }, [profile?.lifeContext]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ lifeContext: val } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel icon="badge">Daily Life (Work · Home · Food · Healthcare)</SectionLabel>
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave} icon={saved ? 'check' : undefined}>{saved ? 'Saved' : 'Save Daily Life'}</Button>
      </div>
      <p className="text-body text-clinical-stone text-sm">
        Drives how the AI tailors meals, supplements, and tests to your real life. Without this, plans are generic.
      </p>
      <DailyLifeEditor value={val} onChange={patch => { setVal(prev => ({ ...prev, ...patch })); setSaved(false); }} />
    </div>
  );
};

// ─── Main ────────────────────────────────────────────────────────────────────

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
      <div className="border-t border-outline-variant/10" />
      <LifestyleSection />
      <div className="border-t border-outline-variant/10" />
      <DailyLifeSection />
    </div>
  );
};
