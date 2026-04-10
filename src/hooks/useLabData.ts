// src/hooks/useLabData.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { LabDraw, LabValue } from '../types';

const mapDraw = (row: Record<string, unknown>): LabDraw => ({
  id: row.id as string, userId: row.user_id as string, createdAt: row.created_at as string,
  drawDate: row.draw_date as string, labName: row.lab_name as string | null,
  orderingProvider: row.ordering_provider as string | null, rawPdfUrl: row.raw_pdf_url as string | null,
  processingStatus: row.processing_status as LabDraw['processingStatus'], notes: row.notes as string | null,
});

const mapValue = (row: Record<string, unknown>): LabValue => ({
  id: row.id as string, drawId: row.draw_id as string, userId: row.user_id as string,
  markerName: row.marker_name as string, markerCategory: row.marker_category as string | null,
  value: row.value as number, unit: row.unit as string | null,
  standardLow: row.standard_low as number | null, standardHigh: row.standard_high as number | null,
  optimalLow: row.optimal_low as number | null, optimalHigh: row.optimal_high as number | null,
  standardFlag: row.standard_flag as LabValue['standardFlag'], optimalFlag: row.optimal_flag as LabValue['optimalFlag'],
  drawDate: row.draw_date as string | null,
});

export function useLabDraws() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['labDraws', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('lab_draws').select('*').eq('user_id', user!.id).order('draw_date', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []).map(mapDraw);
    },
  });
}

export function useLatestLabDraw() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['latestLabDraw', user?.id], enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('lab_draws').select('*').eq('user_id', user!.id).eq('processing_status', 'complete').order('draw_date', { ascending: false }).limit(1).single();
      if (error?.code === 'PGRST116') return null;
      if (error) throw error;
      return data ? mapDraw(data) : null;
    },
  });
}

export function useLabValues(drawId: string | null | undefined) {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['labValues', drawId], enabled: !!user?.id && !!drawId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lab_values').select('*').eq('draw_id', drawId!).order('marker_category', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapValue);
    },
  });
}

export function useLatestLabValues() {
  const { data: latestDraw } = useLatestLabDraw();
  return useLabValues(latestDraw?.id);
}
