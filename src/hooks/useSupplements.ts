// src/hooks/useSupplements.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface UserSupplement {
  id: string;
  userId: string;
  name: string;
  dose: string | null;
  durationCategory: string | null;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
}

const mapRow = (row: Record<string, unknown>): UserSupplement => ({
  id: row.id as string,
  userId: row.user_id as string,
  name: row.name as string,
  dose: (row.dose as string) ?? null,
  durationCategory: (row.duration_category as string) ?? null,
  reason: (row.reason as string) ?? null,
  isActive: (row.is_active as boolean) ?? true,
  createdAt: row.created_at as string,
});

export function useSupplements() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['user_supplements', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_supplements')
        .select('*')
        .eq('user_id', userId!)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    staleTime: 15 * 1000,
  });
}

export function useActiveSupplements() {
  return useSupplements();
}

export function useSaveSupplements() {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  return useMutation({
    mutationFn: async (supplements: Array<{ name: string; dose?: string | null; durationCategory?: string | null; reason?: string | null }>) => {
      if (!userId) throw new Error('Not authenticated');
      // Replace strategy: delete + insert (matches medications pattern)
      const { error: deleteErr } = await supabase.from('user_supplements').delete().eq('user_id', userId);
      if (deleteErr) throw deleteErr;
      if (supplements.length === 0) return [];
      const { error: insertErr, data } = await supabase
        .from('user_supplements')
        .insert(
          supplements.map((s) => ({
            user_id: userId,
            name: s.name,
            dose: s.dose ?? null,
            duration_category: s.durationCategory ?? null,
            reason: s.reason ?? null,
            is_active: true,
          })),
        )
        .select();
      if (insertErr) throw insertErr;
      return (data ?? []).map(mapRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user_supplements'] });
    },
  });
}
