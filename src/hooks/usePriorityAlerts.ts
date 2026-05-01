// src/hooks/usePriorityAlerts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { PriorityAlert } from '../types';

const mapAlert = (row: Record<string, unknown>): PriorityAlert => ({
  id: row.id as string, userId: row.user_id as string, createdAt: row.created_at as string,
  status: row.status as PriorityAlert['status'], title: row.title as string,
  description: row.description as string | null, source: row.source as string | null,
  actionLabel: row.action_label as string | null, actionPath: row.action_path as string | null,
  dismissed: row.dismissed as boolean, drawId: row.draw_id as string | null,
});

export function usePriorityAlerts() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['priorityAlerts', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('priority_alerts').select('*').eq('user_id', user!.id).eq('dismissed', false).order('status', { ascending: true }).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []).map(mapAlert);
    },
  });
}

export function useDismissAlert() {
  const user = useAuthStore(s => s.user);
  const qClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.from('priority_alerts').update({ dismissed: true }).eq('id', alertId).eq('user_id', user!.id);
      if (error) throw error;
    },
    onMutate: async (alertId) => {
      const qKey = ['priorityAlerts', user?.id];
      await qClient.cancelQueries({ queryKey: qKey });
      const previous = qClient.getQueryData<PriorityAlert[]>(qKey);
      qClient.setQueryData<PriorityAlert[]>(qKey, (old = []) => old.filter(a => a.id !== alertId));
      return { previous };
    },
    onError: (_err, _id, context) => { if (context?.previous) qClient.setQueryData(['priorityAlerts', user?.id], context.previous); },
  });
}
