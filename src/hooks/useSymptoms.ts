// src/hooks/useSymptoms.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface Symptom { id: string; symptom: string; severity: number; category: string; user_id: string; }

export interface SymptomAnalysis {
  symptom_connections: Array<{
    symptom: string; severity: number;
    root_causes: Array<{ cause: string; type: string; confidence: string; evidence: string; lab_marker: string | null }>;
    interventions: string[];
  }>;
  patterns: Array<{
    pattern_name: string; confidence: string; severity: string; symptoms_involved: string[];
    explanation: string; likely_mechanism: string; suggested_tests: string[]; icd10_codes: string[];
  }>;
  autoimmune_flags: Array<{
    condition: string; supporting_symptoms: string[]; supporting_labs: string[]; confidence: string; next_step: string;
  }>;
  priority_actions: Array<{ action: string; urgency: string; rationale: string }>;
  summary: string;
}

export function useSymptoms() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['symptoms', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('symptoms').select('*').eq('user_id', userId).order('severity', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Symptom[];
    },
    enabled: !!userId, staleTime: 5 * 60 * 1000,
  });
}

export function useSymptomAnalysis() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['symptom-analysis', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('symptom_analyses').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? (data.analysis_data as SymptomAnalysis) : null;
    },
    enabled: !!userId, staleTime: 10 * 60 * 1000,
  });
}

export function useSaveSymptoms() {
  const userId = useAuthStore(s => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symptoms: { symptom: string; severity: number; category?: string }[]) => {
      if (!userId) throw new Error('Not authenticated');
      await supabase.from('symptoms').delete().eq('user_id', userId);
      if (symptoms.length > 0) {
        const { error } = await supabase.from('symptoms').insert(
          symptoms.map(s => ({ user_id: userId, symptom: s.symptom, severity: s.severity, category: s.category || null }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['symptoms'] }); },
  });
}

export function useRunSymptomAnalysis() {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not authenticated');
      const { data, error } = await supabase.functions.invoke('analyze-symptoms', { body: { userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SymptomAnalysis;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['symptom-analysis'] }); },
  });
}
