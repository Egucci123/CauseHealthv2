// src/hooks/useProgress.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { SupplementCompliance } from '../types';
import { format, subDays } from 'date-fns';

const getToday = () => format(new Date(), 'yyyy-MM-dd');

// ── Progress Entry Types ───────────────────────────────────────────────────
export interface ProgressEntry {
  id: string; user_id: string; logged_at: string;
  energy: number; sleep_quality: number; pain_level: number;
  mental_clarity: number; mood: number; overall_score: number;
  note?: string; created_at: string;
}

export interface CheckInInput {
  energy: number; sleep_quality: number; pain_level: number;
  mental_clarity: number; mood: number; note?: string;
}

// ── Progress Entries (last N days) ─────────────────────────────────────────
export function useProgressEntries(days = 90) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['progress', userId, days], enabled: !!userId, staleTime: 15 * 1000,
    queryFn: async () => {
      const since = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const { data, error } = await supabase.from('progress_entries').select('*').eq('user_id', userId!).gte('logged_at', since).order('logged_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgressEntry[];
    },
  });
}

// ── Today's Entry ──────────────────────────────────────────────────────────
export function useTodayEntry() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['progress-today', userId, getToday()], enabled: !!userId, staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('progress_entries').select('*').eq('user_id', userId!).eq('logged_at', getToday()).maybeSingle();
      if (error) throw error;
      return data as ProgressEntry | null;
    },
  });
}

// ── Log Check-In ───────────────────────────────────────────────────────────
export function useLogCheckIn() {
  const userId = useAuthStore(s => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckInInput) => {
      const { data, error } = await supabase.from('progress_entries').upsert(
        { user_id: userId!, logged_at: getToday(), ...input },
        { onConflict: 'user_id,logged_at' }
      ).select().single();
      if (error) throw error;
      return data as ProgressEntry;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['progress'] }); qc.invalidateQueries({ queryKey: ['progress-today'] }); },
  });
}

// ── Lab Trends (specific marker across all draws) ──────────────────────────
export function useLabTrends(markerName: string) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['lab-trend', userId, markerName], enabled: !!userId && !!markerName, staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: draws, error: drawsErr } = await supabase.from('lab_draws').select('id, draw_date').eq('user_id', userId!).eq('processing_status', 'complete').order('draw_date', { ascending: true });
      if (drawsErr) throw drawsErr;
      if (!draws?.length) return [];
      const { data: values, error: valErr } = await supabase.from('lab_values').select('draw_id, value, unit, optimal_flag, optimal_low, optimal_high').in('draw_id', draws.map(d => d.id)).ilike('marker_name', `%${markerName}%`);
      if (valErr) throw valErr;
      return (values ?? []).map(v => {
        const draw = draws.find(d => d.id === v.draw_id);
        return { date: draw?.draw_date ?? '', value: v.value, unit: v.unit, optimal_flag: v.optimal_flag, optimal_min: v.optimal_low, optimal_max: v.optimal_high };
      }).filter(v => v.date).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export function useSupplementCompliance() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['supplementCompliance', user?.id, getToday()], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('supplement_compliance').select('*').eq('user_id', user!.id).eq('taken_date', getToday());
      if (error) throw error;
      return (data ?? []).map((row): SupplementCompliance => ({
        id: row.id, userId: row.user_id, takenDate: row.taken_date, supplementName: row.supplement_name, taken: row.taken,
      }));
    },
  });
}

export function useToggleCompliance() {
  const user = useAuthStore(s => s.user);
  const qClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplementName, taken }: { supplementName: string; taken: boolean }) => {
      const { error } = await supabase.from('supplement_compliance').upsert({
        user_id: user!.id, taken_date: getToday(), supplement_name: supplementName, taken,
      }, { onConflict: 'user_id,taken_date,supplement_name' });
      if (error) throw error;
    },
    onMutate: async ({ supplementName, taken }) => {
      const qKey = ['supplementCompliance', user?.id, getToday()];
      await qClient.cancelQueries({ queryKey: qKey });
      const previous = qClient.getQueryData<SupplementCompliance[]>(qKey);
      qClient.setQueryData<SupplementCompliance[]>(qKey, (old = []) => {
        const existing = old.find(c => c.supplementName === supplementName);
        if (existing) return old.map(c => c.supplementName === supplementName ? { ...c, taken } : c);
        return [...old, { id: crypto.randomUUID(), userId: user!.id, takenDate: getToday(), supplementName, taken }];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qClient.setQueryData(['supplementCompliance', user?.id, getToday()], context.previous);
    },
    onSettled: () => { qClient.invalidateQueries({ queryKey: ['supplementCompliance', user?.id, getToday()] }); },
  });
}

export function useComplianceStreak() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['complianceStreak', user?.id], enabled: !!user?.id, staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('supplement_compliance').select('taken_date, taken').eq('user_id', user!.id).eq('taken', true).order('taken_date', { ascending: false }).limit(60);
      if (error) throw error;
      const dates = [...new Set((data ?? []).map(r => r.taken_date))].sort().reverse();
      let streak = 0; let checkDate = new Date();
      for (const dateStr of dates) {
        const entryDate = new Date(dateStr);
        const diff = Math.round((checkDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff <= 1) { streak++; checkDate = entryDate; } else break;
      }
      return streak;
    },
  });
}
