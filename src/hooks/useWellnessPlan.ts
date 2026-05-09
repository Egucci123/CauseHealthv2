// src/hooks/useWellnessPlan.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useState, useEffect } from 'react';
import type { WellnessPlan } from '../types';

export interface SupplementItem {
  rank?: number; nutrient: string; form: string; dose: string; timing: string;
  why: string; priority: 'critical' | 'high' | 'moderate' | 'optimize';
  sourced_from: string; evidence_note: string;
  // Universal practical-wisdom field — covers timing rationale, drug interactions,
  // and absorption tips. Required on every supplement (prompt rule). Renders as
  // a tip box under each card alongside the why field.
  practical_note?: string;
  // Category for grouping in the UI. Maps to one of five sections so the user
  // sees the stack organized by purpose (sleep, gut, etc.) instead of one flat list.
  category?: 'sleep_stress' | 'gut_healing' | 'inflammation_cardio' | 'nutrient_repletion' | 'condition_therapy';
  // 1-2 alternative options the user can pick instead — same purpose, different
  // form/source/price/brand. Lets the user choose what fits budget/preference.
  alternatives?: { name: string; form?: string; note?: string }[];
}

export interface TodayAction {
  emoji: string;
  action: string;
  why: string;
  category: 'eat' | 'move' | 'take' | 'sleep' | 'stress';
}

export interface MealItem {
  emoji: string;
  name: string;
  when: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ingredients: string[];
  why: string;
}

export interface WorkoutItem {
  emoji: string;
  day: string;
  title: string;
  duration_min: number;
  description: string;
  why: string;
}

export interface WellnessPlanData {
  generated_at: string;
  headline?: string;
  summary: string;
  today_actions?: TodayAction[];
  meals?: MealItem[];
  workouts?: WorkoutItem[];
  supplement_stack: (SupplementItem & { emoji?: string; why_short?: string })[];
  lifestyle_interventions: {
    diet: { emoji?: string; intervention: string; rationale: string; priority: string }[];
    sleep: { emoji?: string; intervention: string; rationale: string; priority: string }[];
    exercise: { emoji?: string; intervention: string; rationale: string; priority: string }[];
    stress: { emoji?: string; intervention: string; rationale: string; priority: string }[];
  };
  action_plan: {
    phase_1: { name: string; focus: string; actions: string[] };
    phase_2: { name: string; focus: string; actions: string[] };
    phase_3: { name: string; focus: string; actions: string[] };
  };
  retest_timeline: {
    marker: string;
    retest_at: string;
    why: string;
    /** Which specialist routinely orders this test. Drives UI grouping so
     *  the patient walks into each visit with a focused list — not 20
     *  things handed to a PCP who'll only order half. */
    specialist?: 'pcp' | 'gi' | 'hepatology' | 'cardiology' | 'endocrinology' | 'sleep_medicine' | 'rheumatology' | 'nephrology' | 'hematology' | 'functional' | 'imaging' | 'mental_health';
    icd10?: string;
    icd10_description?: string;
    insurance_note?: string;
    priority?: 'urgent' | 'high' | 'moderate';
  }[];
  /** LONGITUDINAL — present only when this plan was generated against a
   *  retest (i.e., the user had a prior lab draw). Universal: works for any
   *  marker, any patient, any condition. Powers the "Progress since [date]"
   *  card on the wellness plan page. Null/absent for first-time users. */
  progress_summary?: {
    prior_draw_date: string;
    weeks_between: number;
    movements: Array<{
      marker: string;
      unit: string;
      prior_value: number | null;
      current_value: number | null;
      prior_display: string;
      current_display: string;
      delta: number | null;
      pct_change: number | null;
      prior_tier: number;
      current_tier: number;
      direction: 'improved' | 'worsened' | 'stable' | 'new_marker' | 'unclear';
      magnitude: 'major' | 'moderate' | 'minor' | 'none';
    }>;
    new_markers: string[];
    retired_markers: string[];
    rollup: {
      improved: number;
      worsened: number;
      stable: number;
      total_compared: number;
    };
  };
  /** Drug-supplement interactions found by the safety engine.
   *  'block' severity = supplement was REMOVED from supplement_stack.
   *  'caution' severity = supplement is still in stack but with a warning. */
  interaction_warnings?: Array<{
    supplement: string;
    medication: string;
    severity: 'block' | 'caution';
    warning: string;
  }>;
  /** Differential diagnosis: conditions the labs/symptoms fit but the user
   *  hasn't been diagnosed with. Populated by AI open-ended reasoning +
   *  deterministic backstop. Each entry includes confirmatory_tests so the
   *  user can ask their doctor for the exact workup. Rendered separately
   *  from retest_timeline (this is differential, not baseline-gap). */
  suspected_conditions?: {
    name: string;
    category?: string;
    confidence?: 'high' | 'moderate' | 'low';
    evidence?: string;
    /** Each entry can be either a plain string (legacy plans) or
     *  { test, why } where 'why' explains what the test adds beyond
     *  current bloodwork (quantification / staging / treatment-unlock /
     *  tracking baseline / differential / safety). UI handles both. */
    confirmatory_tests?: Array<string | { test: string; why?: string }>;
    icd10?: string;
    what_to_ask_doctor?: string;
    source?: 'ai' | 'deterministic';
  }[];
  // Per-symptom how-this-plan-addresses-it list. Populated by
  // generate-wellness-plan after the Symptoms page was deleted (April 2026).
  symptoms_addressed?: { symptom: string; severity?: number; how_addressed: string }[];
  disclaimer: string;
  plan_mode?: 'treatment' | 'optimization';
}

// Module-level generation state — survives component unmount/remount
let activeGeneration: Promise<WellnessPlanData> | null = null;
let generatingFlag = false;
// (removed: lastGenerationTime — was used for client-side cooldown that's
//  now replaced by server-side regen cap)

export function useWellnessPlan() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['wellness-plan', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('wellness_plans').select('*').eq('user_id', userId).eq('generation_status', 'complete').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const planData = data.plan_data as WellnessPlanData;
      (planData as any)._createdAt = data.created_at;
      return planData;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, refetchOnMount: 'always',
  });
}

export function useActivePlan() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['activePlan', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('wellness_plans').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error?.code === 'PGRST116') return null;
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, userId: data.user_id, createdAt: data.created_at, updatedAt: data.updated_at, title: null, planData: data.plan_data, isActive: true, version: 1 } as WellnessPlan;
    },
    enabled: !!userId,
    staleTime: 30 * 1000, refetchOnMount: 'always',
  });
}

export function useGenerateWellnessPlan() {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const [generating, setGenerating] = useState(generatingFlag);

  // On mount, if a generation is already in flight, attach to it
  useEffect(() => {
    if (activeGeneration && generatingFlag) {
      setGenerating(true);
      activeGeneration
        .then((data) => {
          if (data) qc.setQueryData(['wellness-plan', userId], data);
        })
        .catch(() => {})
        .finally(() => setGenerating(false));
    }
  }, [qc, userId]);

  const generate = async () => {
    if (!userId) throw new Error('Not authenticated');
    // Only short-circuit if a gen is GENUINELY in flight (flag is true).
    // The previous `if (activeGeneration) return activeGeneration` returned
    // stale completed promises if .finally somehow didn't clear it (rare,
    // but observed: 10 min after a successful gen, a click was no-oping
    // until refresh). Now: only attach to an existing gen if it's still
    // actively running per generatingFlag. Otherwise start fresh.
    if (activeGeneration && generatingFlag) return activeGeneration;
    // Defensive reset — wipe any stale module-level state before starting fresh.
    activeGeneration = null;
    // (Removed: 30s client-side cooldown — was redundant with server-side
    // 2-per-dataset cap and caused 'click does nothing until refresh'.)

    generatingFlag = true;
    setGenerating(true);

    // Capture start time so on fetch failure we can recover by checking the
    // DB for a plan that landed AFTER we kicked off the request. iOS Safari
    // backgrounds / screen locks regularly kill the fetch even with
    // keepalive:true; the edge function keeps running and writes the plan
    // anyway, but the client doesn't know unless we look.
    const startedAt = new Date().toISOString();

    // Grab a fresh JWT — edge function authenticates the user via Bearer token.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    // 240-second hard timeout. The plan engine now produces 7 AI-reasoning
    // domains + suspected_conditions + drug-interaction screen + deterministic
    // backstops on top of the base plan, which has pushed cold-cache
    // generation into the 90-180s range for treatment-mode patients.
    // Supabase Edge Functions allow up to 400s; 240s leaves headroom.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 240_000);

    // V2 is now the default. To opt OUT and use v1 temporarily:
    //   localStorage.setItem('wellness_v2', '0')
    const useV1 = typeof window !== 'undefined' && window.localStorage?.getItem('wellness_v2') === '0';
    const fnName = useV1 ? 'generate-wellness-plan' : 'generate-wellness-plan-v2';

    activeGeneration = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
      signal: controller.signal,
      // keepalive lets the request survive mobile-Safari backgrounding /
      // screen-lock without being killed by the browser. Without this, a
      // user clicks Generate, locks their phone, comes back 30s later
      // and sees 'Generation failed' because the fetch died mid-flight.
      // Realtime + polling on the page picks up the eventual completion.
      keepalive: true,
    }).then(async (res) => {
      let data: any;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        const msg = data?.error ?? data?.message ?? `Generation failed (${res.status})`;
        throw new Error(msg);
      }
      qc.setQueryData(['wellness-plan', userId], data as WellnessPlanData);
      return data as WellnessPlanData;
    }).catch(async (err: any) => {
      // RECOVERY: iOS Safari backgrounding / screen lock kills the fetch
      // even with keepalive. The edge function may still have completed
      // server-side. Before surfacing the error, check the DB for a plan
      // that was saved AFTER we kicked off this request — if so, the
      // generation succeeded and we just lost the response. Use that plan.
      try {
        const { data: recovered } = await supabase
          .from('wellness_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('generation_status', 'complete')
          .gte('created_at', startedAt)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recovered?.plan_data) {
          console.log('[wellness-plan] recovered plan from DB after fetch dropped', { startedAt, recoveredAt: recovered.created_at });
          qc.setQueryData(['wellness-plan', userId], recovered.plan_data as WellnessPlanData);
          return recovered.plan_data as WellnessPlanData;
        }
      } catch (recoverErr) {
        console.warn('[wellness-plan] recovery query failed:', recoverErr);
      }
      if (err?.name === 'AbortError') {
        throw new Error('Generation took too long (240s). The AI is overloaded — wait a minute and try again.');
      }
      throw err;
    }).finally(() => {
      clearTimeout(timeoutId);
      activeGeneration = null;
      generatingFlag = false;
      setGenerating(false);
      // Invalidate BOTH query keys so any subscriber refetches. setQueryData
      // above already pushed the data into the cache, but invalidate is a
      // belt-and-suspenders guarantee that pages re-render — covers cases
      // where a component reading via a slightly different selector or stale
      // query state would otherwise miss the update.
      qc.invalidateQueries({ queryKey: ['wellness-plan', userId] });
      qc.invalidateQueries({ queryKey: ['activePlan', userId] });
    });

    return activeGeneration;
  };

  return { generate, generating };
}
