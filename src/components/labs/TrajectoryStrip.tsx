// src/components/labs/TrajectoryStrip.tsx
// Trend visualization for multi-draw users. Renders a horizontal strip of
// Watch + Out-of-Range markers with sparklines + delta vs the previous draw.
// Surfaces "what's drifting" at a glance — the optimizer's primary lever.
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { fetchMarkerHistoryBatch, buildComparison, type MarkerComparison } from '../../lib/labComparison';
import { Sparkline } from '../ui/Sparkline';

interface Props {
  // Current-draw lab values — already filtered to Watch + Out-of-Range
  values: Array<{
    marker_name: string;
    value: number;
    unit: string | null;
    optimal_flag?: string | null;
    optimal_low?: number | null;
    optimal_high?: number | null;
  }>;
}

const dirCfg = (d: MarkerComparison['direction']) => {
  if (d === 'improving') return { icon: 'trending_up', color: '#2A9D8F', label: 'better' };
  if (d === 'declining') return { icon: 'trending_down', color: '#C94F4F', label: 'worse' };
  if (d === 'stable') return { icon: 'trending_flat', color: '#D4A574', label: 'stable' };
  return null;
};

const flagAccent = (flag: string | null | undefined): string => {
  if (flag === 'critical_low' || flag === 'critical_high' || flag === 'low' || flag === 'high' || flag === 'deficient' || flag === 'elevated') return '#C94F4F';
  if (flag === 'watch' || flag === 'suboptimal_low' || flag === 'suboptimal_high') return '#E8922A';
  return '#2A9D8F';
};

export const TrajectoryStrip = ({ values }: Props) => {
  const userId = useAuthStore(s => s.user?.id);
  const markerNames = values.map(v => v.marker_name);

  const { data: historyMap, isLoading } = useQuery({
    queryKey: ['marker-history-batch', userId, markerNames.sort().join('|')],
    enabled: !!userId && markerNames.length > 0,
    queryFn: () => fetchMarkerHistoryBatch(userId!, markerNames),
    staleTime: 60 * 1000,
  });

  if (isLoading || !historyMap) return null;

  // Build comparisons, keep only markers with >=2 historical points (otherwise
  // there's no trajectory to show — they'd just see a single dot).
  const comparisons = values
    .map(v => {
      const history = historyMap.get(v.marker_name.toLowerCase()) ?? [];
      if (history.length < 2) return null;
      return { value: v, comparison: buildComparison(v.marker_name, history), history };
    })
    .filter((x): x is { value: Props['values'][0]; comparison: MarkerComparison; history: any[] } => x !== null && x.comparison !== null);

  if (comparisons.length === 0) return null;

  // Sort: declining first (worst → user attention), then stable, then improving
  comparisons.sort((a, b) => {
    const order = (d: MarkerComparison['direction']) => d === 'declining' ? 0 : d === 'stable' ? 1 : d === 'improving' ? 2 : 3;
    return order(a.comparison.direction) - order(b.comparison.direction);
  });

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card p-5 border-t-[3px] border-[#1B423A]">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">Trajectory</p>
          <p className="text-authority text-base text-clinical-charcoal font-bold">How your watch markers are moving</p>
        </div>
        <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{comparisons.length} marker{comparisons.length === 1 ? '' : 's'} with history</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {comparisons.map(({ value, comparison, history }) => {
          const dir = dirCfg(comparison.direction);
          const accent = flagAccent(value.optimal_flag);
          const sparkColor = dir?.color ?? accent;
          return (
            <div key={value.marker_name} className="bg-clinical-cream/60 rounded-[10px] p-4 border-l-2" style={{ borderColor: accent }}>
              <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight mb-1 truncate" title={value.marker_name}>{value.marker_name}</p>
              <div className="flex items-end justify-between gap-2 mb-2">
                <div>
                  <span className="text-authority text-xl text-clinical-charcoal font-bold">{value.value}</span>
                  <span className="text-precision text-[0.65rem] text-clinical-stone ml-1">{value.unit}</span>
                </div>
                <Sparkline
                  data={history.map((h: any) => ({ value: h.value, date: h.drawDate }))}
                  optimalLow={value.optimal_low ?? null}
                  optimalHigh={value.optimal_high ?? null}
                  color={sparkColor}
                  width={70}
                  height={24}
                />
              </div>
              {dir && comparison.deltaPct != null && (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]" style={{ color: dir.color }}>{dir.icon}</span>
                  <span className="text-precision text-[0.6rem] font-bold tracking-wide uppercase" style={{ color: dir.color }}>{dir.label}</span>
                  {Math.abs(comparison.deltaPct) >= 1 && (
                    <span className="text-precision text-[0.6rem] text-clinical-stone ml-auto">
                      {comparison.delta != null && comparison.delta > 0 ? '+' : ''}{comparison.deltaPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
