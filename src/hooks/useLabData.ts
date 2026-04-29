// src/hooks/useLabData.ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['labDraws', user?.id], enabled: !!user?.id,
    // 10s staleTime keeps list responsive to upload completions but stops
    // the sign-in flicker from refetching on every component remount.
    staleTime: 10 * 1000, refetchOnMount: false, refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('lab_draws').select('*').eq('user_id', user!.id).order('draw_date', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []).map(mapDraw);
    },
    // Poll every 2s while any draw is processing — fallback if realtime is blocked
    refetchInterval: (query) => {
      const draws = query.state.data;
      return draws?.some(d => d.processingStatus === 'processing') ? 2000 : false;
    },
  });

  // Realtime: invalidate the list any time the user's lab_draws change.
  // Channel name MUST be unique per mount — supabase.channel('name') returns
  // an existing instance if the name matches, and calling .on() on an already
  // -subscribed channel throws "cannot add postgres_changes after subscribe()".
  // React strict-mode double-effect was reusing the channel and crashing.
  useEffect(() => {
    if (!user?.id) return;
    const uniqueId = `lab-draws-list-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const channel = supabase
      .channel(uniqueId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lab_draws', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['labDraws'] });
          qc.invalidateQueries({ queryKey: ['latestLabDraw'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  return query;
}

export function useLatestLabDraw() {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['latestLabDraw', user?.id], enabled: !!user?.id,
    staleTime: 30 * 1000, refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_draws').select('*')
        .eq('user_id', user!.id)
        .eq('processing_status', 'complete')
        .order('draw_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapDraw(data) : null;
    },
  });

  // Realtime: invalidate the cached 'null' the moment any draw flips to
  // complete, so the dashboard's "Latest Lab Results" card updates without
  // a manual refresh. Unique channel name per mount to avoid the
  // re-subscribe error in React strict mode.
  useEffect(() => {
    if (!user?.id) return;
    const uniqueId = `latest-draw-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const channel = supabase
      .channel(uniqueId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lab_draws', filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ['latestLabDraw'] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  return query;
}

export function useLabValues(drawId: string | null | undefined) {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['labValues', drawId], enabled: !!user?.id && !!drawId,
    staleTime: 30 * 1000, refetchOnMount: 'always',
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
