// src/store/onboardingStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';

export interface AddedMedication {
  id:       string;
  generic:  string;
  brand?:   string;
  dose?:    string;
  duration: string;
  condition?: string;
  depletes: string[];
}

export interface AddedCondition {
  id:   string;
  name: string;
  icd10?: string;
}

export interface AddedSupplement {
  id:       string;
  name:     string;
  dose?:    string;
  duration: string;
  reason?:  string;
}

export interface AddedSymptom {
  id:       string;
  symptom:  string;
  category: string;
  severity: number;
  duration: string;
  timing?:  string;
}

export interface FamilyHistory {
  heartDisease:   boolean;
  diabetes:       boolean;
  autoimmune:     boolean;
  cancer:         boolean;
  earlyDeath:     boolean;
  highCholesterol: boolean;
}

// Universal life-context. Drives AI tailoring (meal complexity, supplement
// budget, test recommendations) without hardcoding disease-specific logic.
// Every field optional — onboarding step can be skipped, AI handles gracefully.
export interface LifeContext {
  workType?: 'desk' | 'driver' | 'shift' | 'labor' | 'service' | 'parent_home' | 'retired' | 'unemployed';
  workSchedule?: 'days' | 'nights' | 'rotating' | 'flexible' | 'multi_jobs' | 'na';
  hoursWorkedPerWeek?: number;
  kidsAtHome?: '0' | '1' | '2' | '3plus';
  livingSituation?: 'alone' | 'partner' | 'family' | 'roommates';
  cookHomeFrequency?: number;
  cookingTimeAvailable?: 'under_15' | '15_30' | '30_60' | '60_plus';
  typicalLunch?: 'fast_food' | 'gas_station' | 'packed' | 'cafeteria' | 'skip' | 'restaurant';
  weeklyFoodBudget?: 'under_50' | '50_100' | '100_150' | '150_plus';
  eatOutPlaces?: string[];
  insuranceType?: 'employer' | 'marketplace' | 'medicaid' | 'medicare' | 'cash' | 'va';
  hasPCP?: 'regular' | 'rare' | 'none';
  lastPhysical?: 'under_6mo' | '6_12mo' | '1_2yr' | '2yr_plus' | 'never';
}

export interface LifestyleData {
  sleepHours:    number;
  sleepQuality:  number;
  snoring:       'yes' | 'no' | 'partner_says';
  wakeRested:    'yes' | 'no' | 'sometimes';
  dietType:      string;
  alcoholPerWeek: number;
  coffeePerDay:   number;
  waterPerDay:    number;
  sugarFrequency: string;
  exerciseDaysPerWeek: number;
  exerciseTypes:       string[];
  exerciseDuration:    string;
  exerciseLimitations: string[];
  stressLevel:         number;
  primaryStressors:    string[];
  stressManagement:    string[];
  waterSource:         string;
  cookingVessels:      string[];
  moldHistory:         boolean;
  smoker:              'never' | 'former' | 'current';
}

export interface OnboardingState {
  currentStep: number;
  totalSteps:  number;
  loading:     boolean;
  firstName:   string;
  lastName:    string;
  dateOfBirth: string;
  sex:         string;
  heightFt:    string;
  heightIn:    string;
  weightLbs:   string;
  locationState: string;
  conditions:    AddedCondition[];
  familyHistory: FamilyHistory;
  geneticTesting: 'yes' | 'no' | 'in_progress' | '';
  medications:        AddedMedication[];
  supplements:        AddedSupplement[];
  noSupplements:      boolean;
  noMedications:      boolean;
  symptoms:           AddedSymptom[];
  lifestyle:          Partial<LifestyleData>;
  lifeContext:        Partial<LifeContext>;
  primaryGoals:       string[];
  specificConcern:    string;
  triedBefore:        string;
  hearAboutUs:        string;
  quickInsights:      string[];
  insightsLoading:    boolean;
}

interface OnboardingStore extends OnboardingState {
  goToStep:   (step: number) => void;
  nextStep:   () => Promise<void>;
  prevStep:   () => void;
  updateStep1: (data: Partial<OnboardingState>) => void;
  updateStep2: (data: Partial<OnboardingState>) => void;
  updateStep3: (data: Partial<OnboardingState>) => void;
  updateStep4: (data: Partial<OnboardingState>) => void;
  updateStep5: (data: Partial<OnboardingState>) => void;
  updateStep6: (data: Partial<OnboardingState>) => void;
  updateStep7: (data: Partial<OnboardingState>) => void;
  addMedication:    (med: Omit<AddedMedication, 'id'>) => void;
  removeMedication: (id: string) => void;
  addSupplement:    (supp: Omit<AddedSupplement, 'id'>) => void;
  removeSupplement: (id: string) => void;
  addCondition:    (cond: Omit<AddedCondition, 'id'>) => void;
  removeCondition: (id: string) => void;
  addSymptom:    (symptom: Omit<AddedSymptom, 'id'>) => void;
  removeSymptom: (id: string) => void;
  updateSymptom: (id: string, data: Partial<AddedSymptom>) => void;
  saveCurrentStep: () => Promise<void>;
  loadSavedProgress: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  generateQuickInsights: () => Promise<void>;
}

const DEFAULT_LIFESTYLE: Partial<LifestyleData> = {
  sleepHours: 7, sleepQuality: 6, snoring: 'no', wakeRested: 'sometimes',
  dietType: 'standard', alcoholPerWeek: 0, coffeePerDay: 1, waterPerDay: 6,
  sugarFrequency: 'sometimes', exerciseDaysPerWeek: 2, exerciseTypes: [],
  exerciseDuration: '30_45_min', exerciseLimitations: [], stressLevel: 5,
  primaryStressors: [], stressManagement: [], waterSource: 'filtered',
  cookingVessels: [], moldHistory: false, smoker: 'never',
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  currentStep: 1, totalSteps: 7, loading: false,
  firstName: '', lastName: '', dateOfBirth: '', sex: '',
  heightFt: '', heightIn: '', weightLbs: '', locationState: '',
  conditions: [],
  familyHistory: { heartDisease: false, diabetes: false, autoimmune: false, cancer: false, earlyDeath: false, highCholesterol: false },
  geneticTesting: '',
  medications: [], supplements: [], noMedications: false, noSupplements: false,
  symptoms: [],
  lifestyle: DEFAULT_LIFESTYLE,
  lifeContext: {},
  primaryGoals: [], specificConcern: '', triedBefore: '', hearAboutUs: '',
  quickInsights: [], insightsLoading: false,

  goToStep: (step) => set({ currentStep: step }),
  prevStep: () => set(s => ({ currentStep: Math.max(1, s.currentStep - 1) })),

  nextStep: async () => {
    // Auto-save handles DB writes — just advance the step
    const next = Math.min(get().totalSteps, get().currentStep + 1);
    set({ currentStep: next, loading: false });
  },

  updateStep1: (data) => set(data),
  updateStep2: (data) => set(data),
  updateStep3: (data) => set(data),
  updateStep4: (data) => set(data),
  updateStep5: (data) => set(data),
  updateStep6: (data) => set(data),
  updateStep7: (data) => set(data),

  addMedication: (med) => set(s => ({
    medications: [...s.medications, { ...med, id: crypto.randomUUID() }],
  })),
  removeMedication: (id) => set(s => ({
    medications: s.medications.filter(m => m.id !== id),
  })),
  addSupplement: (supp) => {
    if (get().supplements.some(s => s.name.toLowerCase() === supp.name.toLowerCase())) return;
    set(s => ({ supplements: [...s.supplements, { ...supp, id: crypto.randomUUID() }] }));
  },
  removeSupplement: (id) => set(s => ({
    supplements: s.supplements.filter(s => s.id !== id),
  })),
  addCondition: (cond) => {
    if (get().conditions.some(c => c.name === cond.name)) return;
    set(s => ({ conditions: [...s.conditions, { ...cond, id: crypto.randomUUID() }] }));
  },
  removeCondition: (id) => set(s => ({
    conditions: s.conditions.filter(c => c.id !== id),
  })),
  addSymptom: (symptom) => {
    if (get().symptoms.some(s => s.symptom === symptom.symptom)) return;
    set(s => ({ symptoms: [...s.symptoms, { ...symptom, id: crypto.randomUUID() }] }));
  },
  removeSymptom: (id) => set(s => ({
    symptoms: s.symptoms.filter(s => s.id !== id),
  })),
  updateSymptom: (id, data) => set(s => ({
    symptoms: s.symptoms.map(sym => sym.id === id ? { ...sym, ...data } : sym),
  })),

  saveCurrentStep: async () => {
    // Now a no-op — auto-save handles everything
  },

  loadSavedProgress: async () => {
    const user = useAuthStore.getState().user;
    const profile = useAuthStore.getState().profile;
    if (!user) return;

    // Restore ALL existing data into the store so forms are pre-filled
    const updates: Partial<OnboardingState> = {};

    // FIRST: restore from localStorage backup. This survives sign-out and
    // catches the case where DB saves never landed (network/timeout). DB
    // values further down OVERWRITE these if present, so DB is still
    // source-of-truth when it has data.
    const local = restoreLocalOnboarding();
    if (local) {
      Object.assign(updates, local);
    }

    // Step 1 data from profile (DB takes precedence over local)
    if (profile?.firstName) updates.firstName = profile.firstName;
    if (profile?.lastName) updates.lastName = profile.lastName;
    if (profile?.dateOfBirth) updates.dateOfBirth = profile.dateOfBirth;
    if (profile?.sex) updates.sex = profile.sex;
    if (profile?.heightCm) {
      const totalInches = profile.heightCm / 2.54;
      updates.heightFt = String(Math.floor(totalInches / 12));
      updates.heightIn = String(Math.round(totalInches % 12));
    }
    if (profile?.weightKg) updates.weightLbs = String(Math.round(profile.weightKg / 0.453592));
    if (profile?.primaryGoals && profile.primaryGoals.length > 0) updates.primaryGoals = profile.primaryGoals;
    // Restore the rest of the onboarding context too
    if (profile?.familyHistory) updates.familyHistory = profile.familyHistory as any;
    if (profile?.geneticTesting) updates.geneticTesting = profile.geneticTesting as any;
    if (profile?.lifestyle) updates.lifestyle = profile.lifestyle as any;
    if (profile?.lifeContext) updates.lifeContext = profile.lifeContext as any;
    if (profile?.specificConcern) updates.specificConcern = profile.specificConcern;
    if (profile?.triedBefore) updates.triedBefore = profile.triedBefore;
    if (profile?.hearAboutUs) updates.hearAboutUs = profile.hearAboutUs;

    // Determine which step to resume at — only skip forward if later steps have data
    let resumeStep = 1;
    let hasLaterData = false;

    try {
      // Load conditions (step 2)
      const { data: conditions } = await supabase.from('conditions').select('*').eq('user_id', user.id).eq('is_active', true);
      if (conditions && conditions.length > 0) {
        updates.conditions = conditions.map(c => ({ id: c.id, name: c.name, icd10: c.icd10 }));
        hasLaterData = true;
        resumeStep = 3;
      }

      // Load medications (step 3)
      const { data: meds } = await supabase.from('medications').select('*').eq('user_id', user.id).eq('is_active', true);
      if (meds && meds.length > 0) {
        updates.medications = meds.map(m => ({
          id: m.id, generic: m.name, brand: m.brand_name, dose: m.dose,
          duration: m.duration_category ?? '1_6_months', condition: m.prescribing_condition, depletes: [],
        }));
        hasLaterData = true;
        resumeStep = 4;
      }

      // Load supplements (step 3, paired with medications)
      const { data: supps } = await supabase.from('user_supplements').select('*').eq('user_id', user.id).eq('is_active', true);
      if (supps && supps.length > 0) {
        updates.supplements = supps.map((s: any) => ({
          id: s.id, name: s.name, dose: s.dose ?? undefined,
          duration: s.duration_category ?? '1_6_months', reason: s.reason ?? undefined,
        }));
      }

      // Load symptoms (step 4)
      const { data: symptoms } = await supabase.from('symptoms').select('*').eq('user_id', user.id);
      if (symptoms && symptoms.length > 0) {
        updates.symptoms = symptoms.map(s => ({
          id: s.id, symptom: s.symptom, category: s.category ?? '', severity: s.severity, duration: s.duration ?? '1_6_months',
        }));
        hasLaterData = true;
        resumeStep = 5;
      }
    } catch {
      // If any check fails, still apply what we have
    }

    // Apply all loaded data to pre-fill forms
    if (Object.keys(updates).length > 0) set(updates);
    // Only skip forward if there's data in later steps (conditions, meds, symptoms)
    // If only Step 1 data exists (DOB, sex), stay on Step 1 with pre-filled form
    if (hasLaterData && resumeStep > 1 && get().currentStep === 1) {
      set({ currentStep: resumeStep });
    }
  },

  completeOnboarding: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ loading: true });
    const state = get();
    const start = Date.now();
    const { logEvent } = await import('../lib/clientLog');
    logEvent('onboarding_complete_start');

    try {
      // First do a final autosave so any unsaved Step 1-6 data lands. This
      // also benefits from autosave's per-call 15s timeouts.
      await autoSaveToDB();

      // Then explicitly mark onboarding_completed. Profile fields (name, dob,
      // sex, height, weight, primary_goals) were saved by autoSaveToDB above.
      const profileFinal = await Promise.race([
        supabase.from('profiles').update({
          onboarding_completed: true,
          primary_goals: state.primaryGoals.filter(Boolean),
        }).eq('id', user.id),
        new Promise<{ error: { message: string } }>(resolve =>
          setTimeout(() => resolve({ error: { message: 'profile finalize timed out (15s)' } }), 15000)),
      ]);
      const finalErr = (profileFinal as any)?.error;
      logEvent('onboarding_profile_finalize', {
        duration_ms: Date.now() - start,
        error: finalErr?.message ?? null,
      });

      try { await useAuthStore.getState().fetchProfile(); } catch {}

      // Clear local backup once everything is durably in the DB
      if (!finalErr) clearLocalOnboarding();

      logEvent('onboarding_complete_done', {
        duration_ms: Date.now() - start,
        success: !finalErr,
      });
    } catch (err: any) {
      logEvent('onboarding_complete_threw', {
        duration_ms: Date.now() - start,
        message: err?.message?.slice(0, 200),
      });
      console.error('[Onboarding] completeOnboarding error:', err);
    } finally {
      set({ loading: false });
    }
  },

  generateQuickInsights: async () => {
    const state = get();
    set({ insightsLoading: true });
    try {
      const { data } = await supabase.functions.invoke('generate-quick-insights', {
        body: {
          medications: state.medications.map(m => m.generic),
          conditions: state.conditions.map(c => c.name),
          symptoms: state.symptoms.map(s => s.symptom),
          depletions: state.medications.flatMap(m => m.depletes),
        },
      });
      if (data?.insights) { set({ quickInsights: data.insights }); return; }
    } catch { /* fallback below */ }
    set({ quickInsights: generateLocalInsights(state), insightsLoading: false });
  },
}));

// ── Auto-save: debounced save on any state change ─────────────────────────
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let isSaving = false;

// Wrap a Supabase call with a hard timeout. Returns either the result or
// a synthetic timeout error — never hangs forever, never throws.
async function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<{ data: any; error: { message: string } | null }> {
  const result: any = await Promise.race([
    p,
    new Promise(resolve => setTimeout(() => resolve({ data: null, error: { message: `${label} timed out after ${ms}ms` } }), ms)),
  ]);
  return result;
}

async function autoSaveToDB() {
  if (isSaving) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  const state = useOnboardingStore.getState();

  isSaving = true;
  const start = Date.now();
  // Lazy import so we don't create a circular dep at module load time
  const { logEvent } = await import('../lib/clientLog');
  logEvent('onboarding_autosave_start', { step: state.currentStep });

  let savedKinds: string[] = [];
  let errors: Record<string, string> = {};

  try {
    const heightCm = state.heightFt && state.heightIn
      ? (parseInt(state.heightFt) * 30.48) + (parseInt(state.heightIn) * 2.54) : null;
    const weightKg = state.weightLbs ? parseFloat(state.weightLbs) * 0.453592 : null;

    const profileData: Record<string, unknown> = {};
    if (state.firstName) profileData.first_name = state.firstName;
    if (state.lastName) profileData.last_name = state.lastName;
    if (state.dateOfBirth) profileData.date_of_birth = state.dateOfBirth;
    if (state.sex) profileData.sex = state.sex;
    if (heightCm) profileData.height_cm = heightCm;
    if (weightKg) profileData.weight_kg = weightKg;
    if (state.primaryGoals && state.primaryGoals.length > 0) profileData.primary_goals = state.primaryGoals;
    // Newly-saved onboarding context (added 2026-04-29 — were collected but
    // never persisted, breaking AI prompts that need family history / lifestyle).
    const fh = state.familyHistory;
    if (fh && Object.values(fh).some(Boolean)) profileData.family_history = fh;
    if (state.geneticTesting) profileData.genetic_testing = state.geneticTesting;
    if (state.lifestyle && Object.keys(state.lifestyle).length > 0) profileData.lifestyle = state.lifestyle;
    if (state.lifeContext && Object.keys(state.lifeContext).length > 0) profileData.life_context = state.lifeContext;
    if (state.specificConcern) profileData.specific_concern = state.specificConcern;
    if (state.triedBefore) profileData.tried_before = state.triedBefore;
    if (state.hearAboutUs) profileData.hear_about_us = state.hearAboutUs;

    if (Object.keys(profileData).length > 0) {
      const r = await withTimeout(
        supabase.from('profiles').update(profileData).eq('id', user.id),
        15000, 'profile update'
      );
      if (r.error) errors.profile = r.error.message; else savedKinds.push('profile');
    }

    if (state.conditions.length > 0) {
      const d = await withTimeout(supabase.from('conditions').delete().eq('user_id', user.id), 15000, 'conditions delete');
      if (!d.error) {
        const i = await withTimeout(supabase.from('conditions').insert(
          state.conditions.map(c => ({ user_id: user.id, name: c.name, icd10: c.icd10 || null, is_active: true }))
        ), 15000, 'conditions insert');
        if (i.error) errors.conditions = i.error.message; else savedKinds.push('conditions');
      } else { errors.conditions_delete = d.error.message; }
    }

    if (state.medications.length > 0) {
      const d = await withTimeout(supabase.from('medications').delete().eq('user_id', user.id), 15000, 'medications delete');
      if (!d.error) {
        const i = await withTimeout(supabase.from('medications').insert(
          state.medications.map(m => ({ user_id: user.id, name: m.generic, brand_name: m.brand, dose: m.dose, duration_category: m.duration, prescribing_condition: m.condition, is_active: true }))
        ), 15000, 'medications insert');
        if (i.error) errors.medications = i.error.message; else savedKinds.push('medications');
      } else { errors.medications_delete = d.error.message; }
    }

    if (state.supplements.length > 0) {
      const d = await withTimeout(supabase.from('user_supplements').delete().eq('user_id', user.id), 15000, 'supplements delete');
      if (!d.error) {
        const i = await withTimeout(supabase.from('user_supplements').insert(
          state.supplements.map(s => ({ user_id: user.id, name: s.name, dose: s.dose ?? null, duration_category: s.duration, reason: s.reason ?? null, is_active: true }))
        ), 15000, 'supplements insert');
        if (i.error) errors.supplements = i.error.message; else savedKinds.push('supplements');
      } else { errors.supplements_delete = d.error.message; }
    }

    if (state.symptoms.length > 0) {
      const d = await withTimeout(supabase.from('symptoms').delete().eq('user_id', user.id), 15000, 'symptoms delete');
      if (!d.error) {
        const i = await withTimeout(supabase.from('symptoms').insert(
          state.symptoms.map(s => ({ user_id: user.id, symptom: s.symptom, severity: s.severity, duration: s.duration, category: s.category || null }))
        ), 15000, 'symptoms insert');
        if (i.error) errors.symptoms = i.error.message; else savedKinds.push('symptoms');
      } else { errors.symptoms_delete = d.error.message; }
    }

    logEvent('onboarding_autosave_done', {
      step: state.currentStep,
      duration_ms: Date.now() - start,
      saved: savedKinds,
      errors,
    });
  } catch (err: any) {
    logEvent('onboarding_autosave_threw', {
      step: state.currentStep,
      duration_ms: Date.now() - start,
      message: err?.message?.slice(0, 200),
    });
    console.warn('[AutoSave] Error:', err);
  } finally {
    isSaving = false;
  }
}

// ── localStorage backup so onboarding never loses input ────────────────
// Even if every DB save fails (network down, RLS broken, whatever) the
// user's typed data survives sign-out + refresh. Restored on app load
// inside loadSavedProgress.
const LOCAL_KEY = 'onboarding_progress_v1';

function persistLocal(state: OnboardingState) {
  try {
    const snapshot = {
      currentStep: state.currentStep,
      firstName: state.firstName, lastName: state.lastName,
      dateOfBirth: state.dateOfBirth, sex: state.sex,
      heightFt: state.heightFt, heightIn: state.heightIn,
      weightLbs: state.weightLbs, locationState: state.locationState,
      conditions: state.conditions,
      medications: state.medications, supplements: state.supplements,
      symptoms: state.symptoms,
      lifestyle: state.lifestyle,
      lifeContext: state.lifeContext,
      primaryGoals: state.primaryGoals,
      familyHistory: state.familyHistory,
      geneticTesting: state.geneticTesting,
      noMedications: state.noMedications, noSupplements: state.noSupplements,
      specificConcern: state.specificConcern, triedBefore: state.triedBefore, hearAboutUs: state.hearAboutUs,
      _saved_at: Date.now(),
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  } catch { /* quota / private mode — ignore */ }
}

export function restoreLocalOnboarding(): Partial<OnboardingState> | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Don't restore if older than 7 days (stale)
    if (parsed._saved_at && Date.now() - parsed._saved_at > 7 * 86_400_000) {
      localStorage.removeItem(LOCAL_KEY);
      return null;
    }
    delete parsed._saved_at;
    return parsed as Partial<OnboardingState>;
  } catch { return null; }
}

export function clearLocalOnboarding() {
  try { localStorage.removeItem(LOCAL_KEY); } catch {}
}

// Subscribe to store changes — auto-save 2 seconds after last change.
// Also persist to localStorage IMMEDIATELY on every change so data is never lost.
useOnboardingStore.subscribe((state, prevState) => {
  // Always persist locally on any data change — instant, no network needed
  const dataChanged = state.firstName !== prevState.firstName || state.lastName !== prevState.lastName ||
    state.dateOfBirth !== prevState.dateOfBirth || state.sex !== prevState.sex ||
    state.heightFt !== prevState.heightFt || state.heightIn !== prevState.heightIn ||
    state.weightLbs !== prevState.weightLbs || state.primaryGoals.length !== prevState.primaryGoals.length ||
    state.conditions.length !== prevState.conditions.length ||
    state.medications.length !== prevState.medications.length ||
    state.symptoms.length !== prevState.symptoms.length ||
    state.supplements.length !== prevState.supplements.length ||
    JSON.stringify(state.familyHistory) !== JSON.stringify(prevState.familyHistory) ||
    state.geneticTesting !== prevState.geneticTesting ||
    JSON.stringify(state.lifestyle) !== JSON.stringify(prevState.lifestyle) ||
    JSON.stringify(state.lifeContext) !== JSON.stringify(prevState.lifeContext) ||
    state.specificConcern !== prevState.specificConcern ||
    state.triedBefore !== prevState.triedBefore ||
    state.hearAboutUs !== prevState.hearAboutUs;
  const stepChanged = state.currentStep !== prevState.currentStep;

  if (dataChanged || stepChanged) {
    persistLocal(state);
    clearTimeout(autoSaveTimer);
    if (stepChanged) {
      autoSaveToDB();
    } else {
      autoSaveTimer = setTimeout(autoSaveToDB, 2000);
    }
  }
});

function generateLocalInsights(state: OnboardingState): string[] {
  const insights: string[] = [];
  state.medications.forEach(med => {
    if (med.depletes.includes('coq10') && state.symptoms.some(s => s.symptom.toLowerCase().includes('muscle')))
      insights.push(`Your ${med.generic} is depleting CoQ10 — this is likely causing your muscle pain and fatigue.`);
    if (med.depletes.includes('folate') && state.symptoms.some(s => s.symptom.toLowerCase().includes('hair')))
      insights.push(`Your ${med.generic} is depleting folate — this is the most likely cause of your hair loss.`);
    if (med.depletes.includes('b12') && state.symptoms.some(s => ['brain fog', 'fatigue'].some(k => s.symptom.toLowerCase().includes(k))))
      insights.push(`Your ${med.generic} is depleting B12 — B12 deficiency explains your fatigue and brain fog.`);
    if (med.depletes.includes('magnesium') && state.symptoms.some(s => s.symptom.toLowerCase().includes('sleep')))
      insights.push(`Your ${med.generic} is depleting magnesium — magnesium deficiency is a primary cause of sleep disruption.`);
  });
  if (insights.length === 0 && state.medications.length > 0)
    insights.push(`We identified ${state.medications.length} medication${state.medications.length > 1 ? 's' : ''} that may be affecting your nutrient levels. Your full analysis will be in your wellness plan.`);
  if (insights.length === 0)
    insights.push('Upload your first lab report to get your personalized root cause analysis.', 'Your wellness plan will be ready once we see your bloodwork.');
  return insights.slice(0, 3);
}
