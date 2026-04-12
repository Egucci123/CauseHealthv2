// src/hooks/useWellnessPlan.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useState, useEffect } from 'react';
import type { WellnessPlan } from '../types';

export interface SupplementItem {
  rank: number; nutrient: string; form: string; dose: string; timing: string;
  why: string; priority: 'critical' | 'high' | 'moderate' | 'optimize';
  sourced_from: string; evidence_note: string;
}

export interface WellnessPlanData {
  generated_at: string;
  summary: string;
  supplement_stack: SupplementItem[];
  lifestyle_interventions: {
    diet: { intervention: string; rationale: string; priority: string }[];
    sleep: { intervention: string; rationale: string; priority: string }[];
    exercise: { intervention: string; rationale: string; priority: string }[];
    stress: { intervention: string; rationale: string; priority: string }[];
  };
  action_plan: {
    phase_1: { name: string; focus: string; actions: string[] };
    phase_2: { name: string; focus: string; actions: string[] };
    phase_3: { name: string; focus: string; actions: string[] };
  };
  retest_timeline: { marker: string; retest_at: string; why: string }[];
  disclaimer: string;
  plan_mode?: 'treatment' | 'optimization';
}

// Module-level generation state — survives component unmount/remount
let activeGeneration: Promise<WellnessPlanData> | null = null;
let generatingFlag = false;
let lastGenerationTime = 0;

export function useWellnessPlan() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['wellness-plan', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('wellness_plans').select('*').eq('user_id', userId).eq('generation_status', 'complete').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? (data.plan_data as WellnessPlanData) : null;
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
    staleTime: 30 * 1000,
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
    if (activeGeneration) return activeGeneration;
    if (Date.now() - lastGenerationTime < 30000) throw new Error('Please wait before regenerating');

    generatingFlag = true;
    lastGenerationTime = Date.now();
    setGenerating(true);

    activeGeneration = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-wellness-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ userId }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Generation failed');
      // Set the new plan directly in cache — no stale data
      qc.setQueryData(['wellness-plan', userId], data as WellnessPlanData);
      return data as WellnessPlanData;
    }).finally(() => {
      activeGeneration = null;
      generatingFlag = false;
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ['activePlan'] });
    });

    return activeGeneration;
  };

  return { generate, generating };
}
