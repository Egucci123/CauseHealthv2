// src/hooks/useMarkerHistory.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchMarkerHistory, buildComparison, type MarkerComparison, type MarkerHistory } from '../lib/labComparison';

export function useMarkerHistory(markerName: string | null | undefined) {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['marker-history', userId, markerName],
    enabled: !!userId && !!markerName,
    queryFn: async () => {
      if (!userId || !markerName) return null;
      const history = await fetchMarkerHistory(userId, markerName);
      const comparison = buildComparison(markerName, history);
      return { history, comparison };
    },
    staleTime: 30 * 1000,
  });
}

export type { MarkerComparison, MarkerHistory };
