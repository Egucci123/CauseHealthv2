// src/hooks/useSymptoms.ts
//
// Symptom data hooks. The standalone "Pattern Analysis" feature was removed
// (May 2026) because it duplicated and contradicted the wellness plan's
// `symptoms_addressed` flow without adding actionable value. The
// useSymptomAnalysis / useRunSymptomAnalysis hooks + the analyze-symptoms
// edge function + symptom_analyses table are gone with it.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface Symptom { id: string; symptom: string; severity: number; category: string; user_id: string; }

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
    enabled: !!userId, staleTime: 15 * 1000,
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
