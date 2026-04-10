// src/hooks/useConditions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface Condition { id: string; name: string; icd10: string | null; is_active: boolean; }

export function useConditions() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['conditions', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []) as Condition[];
    },
    enabled: !!userId,
  });
}

export function useSaveConditions() {
  const userId = useAuthStore(s => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conditions: { name: string; icd10?: string }[]) => {
      if (!userId) throw new Error('Not authenticated');
      await supabase.from('conditions').delete().eq('user_id', userId);
      if (conditions.length > 0) {
        const { error } = await supabase.from('conditions').insert(
          conditions.map(c => ({ user_id: userId, name: c.name, icd10: c.icd10 || null, is_active: true }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conditions'] }); },
  });
}
