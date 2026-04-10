// src/hooks/useMedications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface MedicationHook {
  id: string; name: string; brandName: string | null; dose: string | null;
  durationCategory: string | null; prescribingCondition: string | null; isActive: boolean;
}

export function useMedications() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['medications', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('medications').select('*').eq('user_id', user!.id).eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []).map((row): MedicationHook => ({
        id: row.id, name: row.name, brandName: row.brand_name, dose: row.dose,
        durationCategory: row.duration_category, prescribingCondition: row.prescribing_condition, isActive: row.is_active,
      }));
    },
  });
}

// Alias — used by MedicationChecker page
export const useActiveMedications = useMedications;

export function useSaveMedications() {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meds: { name: string; brand_name?: string; dose?: string; duration_category?: string; prescribing_condition?: string }[]) => {
      if (!user) throw new Error('Not authenticated');
      await supabase.from('medications').delete().eq('user_id', user.id);
      if (meds.length > 0) {
        const { error } = await supabase.from('medications').insert(
          meds.map(m => ({ user_id: user.id, ...m, is_active: true }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medications'] }); },
  });
}
