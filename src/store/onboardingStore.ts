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
  supplements:        string[];
  noMedications:      boolean;
  symptoms:           AddedSymptom[];
  lifestyle:          Partial<LifestyleData>;
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
  addMedication:    (med: Omit<AddedMedication, 'id'>) => void;
  removeMedication: (id: string) => void;
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
  currentStep: 1, totalSteps: 6, loading: false,
  firstName: '', lastName: '', dateOfBirth: '', sex: '',
  heightFt: '', heightIn: '', weightLbs: '', locationState: '',
  conditions: [],
  familyHistory: { heartDisease: false, diabetes: false, autoimmune: false, cancer: false, earlyDeath: false, highCholesterol: false },
  geneticTesting: '',
  medications: [], supplements: [], noMedications: false,
  symptoms: [],
  lifestyle: DEFAULT_LIFESTYLE,
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

  addMedication: (med) => set(s => ({
    medications: [...s.medications, { ...med, id: crypto.randomUUID() }],
  })),
  removeMedication: (id) => set(s => ({
    medications: s.medications.filter(m => m.id !== id),
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
    if (!profile || !user) return;

    // Restore ALL existing data into the store so forms are pre-filled
    const updates: Partial<OnboardingState> = {};

    // Step 1 data from profile
    if (profile.firstName) updates.firstName = profile.firstName;
    if (profile.lastName) updates.lastName = profile.lastName;
    if (profile.dateOfBirth) updates.dateOfBirth = profile.dateOfBirth;
    if (profile.sex) updates.sex = profile.sex;
    if (profile.heightCm) {
      const totalInches = profile.heightCm / 2.54;
      updates.heightFt = String(Math.floor(totalInches / 12));
      updates.heightIn = String(Math.round(totalInches % 12));
    }
    if (profile.weightKg) updates.weightLbs = String(Math.round(profile.weightKg / 0.453592));
    if (profile.primaryGoals && profile.primaryGoals.length > 0) updates.primaryGoals = profile.primaryGoals;

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

    try {
      // Quick session check — don't hang if it fails
      try { await Promise.race([supabase.auth.getSession(), new Promise(r => setTimeout(r, 3000))]); } catch {}

      // Fire all saves in parallel — don't let one block the others
      const saves = [];

      if (state.conditions.length > 0) {
        saves.push(
          supabase.from('conditions').delete().eq('user_id', user.id)
            .then(() => supabase.from('conditions').insert(
              state.conditions.map(c => ({ user_id: user.id, name: c.name, icd10: c.icd10 || null, is_active: true }))
            ))
        );
      }
      if (state.medications.length > 0) {
        saves.push(
          supabase.from('medications').delete().eq('user_id', user.id)
            .then(() => supabase.from('medications').insert(
              state.medications.map(m => ({ user_id: user.id, name: m.generic, brand_name: m.brand, dose: m.dose, duration_category: m.duration, prescribing_condition: m.condition, is_active: true }))
            ))
        );
      }
      if (state.symptoms.length > 0) {
        saves.push(
          supabase.from('symptoms').delete().eq('user_id', user.id)
            .then(() => supabase.from('symptoms').insert(
              state.symptoms.map(s => ({ user_id: user.id, symptom: s.symptom, severity: s.severity, category: s.category || null }))
            ))
        );
      }
      saves.push(
        supabase.from('profiles').update({
          onboarding_completed: true,
          primary_goals: state.primaryGoals.filter(Boolean),
        }).eq('id', user.id)
      );

      // Wait for all saves with a 10s timeout
      await Promise.race([
        Promise.allSettled(saves),
        new Promise(resolve => setTimeout(resolve, 10000)),
      ]);

      try { await useAuthStore.getState().fetchProfile(); } catch {}
    } catch (err) {
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

async function autoSaveToDB() {
  if (isSaving) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  const state = useOnboardingStore.getState();

  isSaving = true;
  try {
    // Save profile fields
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

    if (Object.keys(profileData).length > 0) {
      await supabase.from('profiles').update(profileData).eq('id', user.id);
    }

    // Save conditions
    if (state.conditions.length > 0) {
      await supabase.from('conditions').delete().eq('user_id', user.id);
      await supabase.from('conditions').insert(
        state.conditions.map(c => ({ user_id: user.id, name: c.name, icd10: c.icd10 || null, is_active: true }))
      );
    }

    // Save medications
    if (state.medications.length > 0) {
      await supabase.from('medications').delete().eq('user_id', user.id);
      await supabase.from('medications').insert(
        state.medications.map(m => ({ user_id: user.id, name: m.generic, brand_name: m.brand, dose: m.dose, duration_category: m.duration, prescribing_condition: m.condition, is_active: true }))
      );
    }

    // Save symptoms
    if (state.symptoms.length > 0) {
      await supabase.from('symptoms').delete().eq('user_id', user.id);
      await supabase.from('symptoms').insert(
        state.symptoms.map(s => ({ user_id: user.id, symptom: s.symptom, severity: s.severity, duration: s.duration, category: s.category || null }))
      );
    }
  } catch (err) {
    console.warn('[AutoSave] Error:', err);
  } finally {
    isSaving = false;
  }
}

// Subscribe to store changes — auto-save 2 seconds after last change
useOnboardingStore.subscribe((state, prevState) => {
  // Only auto-save if meaningful data changed (not loading/currentStep)
  const changed = state.firstName !== prevState.firstName || state.lastName !== prevState.lastName ||
    state.dateOfBirth !== prevState.dateOfBirth || state.sex !== prevState.sex ||
    state.heightFt !== prevState.heightFt || state.heightIn !== prevState.heightIn ||
    state.weightLbs !== prevState.weightLbs || state.primaryGoals.length !== prevState.primaryGoals.length ||
    state.conditions.length !== prevState.conditions.length ||
    state.medications.length !== prevState.medications.length ||
    state.symptoms.length !== prevState.symptoms.length ||
    state.currentStep !== prevState.currentStep;

  if (changed) {
    clearTimeout(autoSaveTimer);
    // Save immediately on step change (user might refresh), debounce on data edits
    if (state.currentStep !== prevState.currentStep) {
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
