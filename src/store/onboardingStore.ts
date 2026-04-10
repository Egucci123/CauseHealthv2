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
  primaryGoal:        string;
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
  currentStep: 1, totalSteps: 7, loading: false,
  firstName: '', lastName: '', dateOfBirth: '', sex: '',
  heightFt: '', heightIn: '', weightLbs: '', locationState: '',
  conditions: [],
  familyHistory: { heartDisease: false, diabetes: false, autoimmune: false, cancer: false, earlyDeath: false, highCholesterol: false },
  geneticTesting: '',
  medications: [], supplements: [], noMedications: false,
  symptoms: [],
  lifestyle: DEFAULT_LIFESTYLE,
  primaryGoal: '', specificConcern: '', triedBefore: '', hearAboutUs: '',
  quickInsights: [], insightsLoading: false,

  goToStep: (step) => set({ currentStep: step }),
  prevStep: () => set(s => ({ currentStep: Math.max(1, s.currentStep - 1) })),

  nextStep: async () => {
    try {
      // Timeout after 8 seconds — don't let a hanging save block the user
      await Promise.race([
        get().saveCurrentStep(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 8000)),
      ]);
    } catch (err) {
      console.error('[Onboarding] nextStep save failed, continuing anyway:', err);
    }
    set({ loading: false });
    const next = Math.min(get().totalSteps, get().currentStep + 1);
    set({ currentStep: next });
    if (next === 7) get().generateQuickInsights();
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
    const user = useAuthStore.getState().user;
    if (!user) return;
    const state = get();
    set({ loading: true });
    try {
      const step = state.currentStep;
      const profileUpdate: Record<string, unknown> = {};

      if (step === 1) {
        const heightCm = state.heightFt && state.heightIn
          ? (parseInt(state.heightFt) * 30.48) + (parseInt(state.heightIn) * 2.54) : null;
        const weightKg = state.weightLbs ? parseFloat(state.weightLbs) * 0.453592 : null;
        Object.assign(profileUpdate, {
          first_name: state.firstName, last_name: state.lastName,
          date_of_birth: state.dateOfBirth || null, sex: state.sex || null,
          height_cm: heightCm, weight_kg: weightKg,
        });
      }

      if (Object.keys(profileUpdate).length > 0) {
        console.log('[Onboarding] Saving step', step, 'profile update:', profileUpdate);
        const { error: profileErr } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
        console.log('[Onboarding] Profile save:', profileErr?.message ?? 'ok');
      }

      if (step === 2 && state.conditions.length > 0) {
        await supabase.from('conditions').delete().eq('user_id', user.id);
        const { error: condErr } = await supabase.from('conditions').insert(
          state.conditions.map(c => ({
            user_id: user.id, name: c.name, icd10: c.icd10 || null, is_active: true,
          }))
        );
        console.log('[Onboarding] Conditions insert:', condErr?.message ?? `ok (${state.conditions.length} conditions)`);
      }

      if (step === 3 && state.medications.length > 0) {
        const { error: delErr } = await supabase.from('medications').delete().eq('user_id', user.id);
        console.log('[Onboarding] Meds delete:', delErr?.message ?? 'ok');
        const { error: insErr } = await supabase.from('medications').insert(
          state.medications.map(m => ({
            user_id: user.id, name: m.generic, brand_name: m.brand,
            dose: m.dose, duration_category: m.duration,
            prescribing_condition: m.condition, is_active: true,
          }))
        );
        console.log('[Onboarding] Meds insert:', insErr?.message ?? `ok (${state.medications.length} meds)`);
      }

      if (step === 4 && state.symptoms.length > 0) {
        const { error: delErr } = await supabase.from('symptoms').delete().eq('user_id', user.id);
        console.log('[Onboarding] Symptoms delete:', delErr?.message ?? 'ok');
        const { error: insErr } = await supabase.from('symptoms').insert(
          state.symptoms.map(s => ({
            user_id: user.id, symptom: s.symptom,
            severity: s.severity, duration: s.duration,
            category: s.category || null,
          }))
        );
        console.log('[Onboarding] Symptoms insert:', insErr?.message ?? `ok (${state.symptoms.length} symptoms)`);
      }
    } catch (err) {
      console.error('Onboarding save error:', err);
    } finally {
      set({ loading: false });
    }
  },

  loadSavedProgress: async () => {
    const user = useAuthStore.getState().user;
    const profile = useAuthStore.getState().profile;
    if (!profile || !user) return;

    // Restore profile data
    if (profile.firstName) {
      set({ firstName: profile.firstName ?? '', lastName: profile.lastName ?? '' });
    }

    // Check what data already exists in DB to determine which step to resume at
    let resumeStep = 1;
    try {
      // If profile has name + DOB, step 1 is done
      if (profile.firstName && profile.dateOfBirth) resumeStep = 2;

      // Check conditions (step 2)
      const { data: conditions } = await supabase.from('conditions').select('name').eq('user_id', user.id).limit(1);
      if (conditions && conditions.length > 0) resumeStep = 3;

      // Check medications (step 3)
      const { data: meds } = await supabase.from('medications').select('name').eq('user_id', user.id).limit(1);
      if (meds && meds.length > 0) resumeStep = 4;

      // Check symptoms (step 4)
      const { data: symptoms } = await supabase.from('symptoms').select('symptom').eq('user_id', user.id).limit(1);
      if (symptoms && symptoms.length > 0) resumeStep = 5;
    } catch {
      // If any check fails, start from beginning
    }

    if (resumeStep > 1 && get().currentStep === 1) {
      set({ currentStep: resumeStep });
    }
  },

  completeOnboarding: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ loading: true });
    const state = get();

    // Safety net: ensure conditions, medications, and symptoms are saved even if step saves failed
    if (state.conditions.length > 0) {
      await supabase.from('conditions').delete().eq('user_id', user.id);
      const { error: condErr } = await supabase.from('conditions').insert(
        state.conditions.map(c => ({
          user_id: user.id, name: c.name, icd10: c.icd10 || null, is_active: true,
        }))
      );
      if (condErr) console.error('[Onboarding] Final conditions save failed:', condErr.message);
    }
    if (state.medications.length > 0) {
      await supabase.from('medications').delete().eq('user_id', user.id);
      const { error: medErr } = await supabase.from('medications').insert(
        state.medications.map(m => ({
          user_id: user.id, name: m.generic, brand_name: m.brand,
          dose: m.dose, duration_category: m.duration,
          prescribing_condition: m.condition, is_active: true,
        }))
      );
      if (medErr) console.error('[Onboarding] Final meds save failed:', medErr.message);
    }
    if (state.symptoms.length > 0) {
      await supabase.from('symptoms').delete().eq('user_id', user.id);
      const { error: symErr } = await supabase.from('symptoms').insert(
        state.symptoms.map(s => ({
          user_id: user.id, symptom: s.symptom,
          severity: s.severity, category: s.category || null,
        }))
      );
      if (symErr) console.error('[Onboarding] Final symptoms save failed:', symErr.message);
    }

    await supabase.from('profiles').update({
      onboarding_completed: true,
      primary_goals: [state.primaryGoal].filter(Boolean),
    }).eq('id', user.id);
    await useAuthStore.getState().fetchProfile();
    set({ loading: false });
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
