// src/components/labs/LabMarkerCard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { OptimalRangeBar } from '../lab/OptimalRangeBar';
import { MarkerDotBar } from './MarkerDotBar';
import { Badge } from '../ui/Badge';
import { ClinicalLink } from '../ui/Button';
import { Sparkline } from '../ui/Sparkline';
import { MarkerTerm } from '../ui/MarkerTerm';
import { useMarkerHistory } from '../../hooks/useMarkerHistory';

interface LabValueRow {
  id: string; marker_name: string; marker_category: string; value: number; unit: string;
  standard_low?: number | null; standard_high?: number | null;
  optimal_low?: number | null; optimal_high?: number | null;
  standard_flag?: string | null; optimal_flag?: string | null;
}

interface AnalysisFinding { marker: string; flag: string; headline: string; explanation: string; emoji?: string; what_to_do?: string; }

interface LabMarkerCardProps { value: LabValueRow; analysis?: AnalysisFinding | null; onAddToPrep?: (markerName: string) => void; }

function getStatus(flag: string | undefined | null): 'urgent' | 'monitor' | 'optimal' {
  if (!flag) return 'optimal';
  if (flag === 'deficient' || flag === 'elevated') return 'urgent';
  if (flag === 'suboptimal_low' || flag === 'suboptimal_high') return 'monitor';
  return 'optimal';
}

export const LabMarkerCard = ({ value, analysis, onAddToPrep }: LabMarkerCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(value.optimal_flag);
  const topBorder = status === 'urgent' ? 'border-t-[3px] border-[#C94F4F]' : status === 'monitor' ? 'border-t-[3px] border-[#E8922A]' : 'border-t-[3px] border-[#D4A574]';

  // Fetch historical values for this marker — sparkline + previous comparison
  const { data: historyData } = useMarkerHistory(value.marker_name);
  const comparison = historyData?.comparison;
  const history = historyData?.history ?? [];

  // Direction indicator config
  const dirCfg = comparison?.direction === 'improving'
    ? { icon: 'trending_up', color: '#2A9D8F', label: 'improving' }
    : comparison?.direction === 'declining'
    ? { icon: 'trending_down', color: '#C94F4F', label: 'declining' }
    : comparison?.direction === 'stable'
    ? { icon: 'trending_flat', color: '#D4A574', label: 'stable' }
    : null;

  return (
    <div className={`bg-clinical-white rounded-[10px] shadow-card ${topBorder} overflow-hidden`}>
      <div className="p-8">
        <div className="flex justify-between items-start mb-6 gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {analysis?.emoji && <span className="text-3xl flex-shrink-0 leading-none">{analysis.emoji}</span>}
            <div className="min-w-0">
              <h3 className="text-body text-clinical-charcoal font-semibold text-lg">
                <MarkerTerm name={value.marker_name} className="text-clinical-charcoal font-semibold">
                  {value.marker_name}
                </MarkerTerm>
              </h3>
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mt-0.5">{value.marker_category}</p>
            </div>
          </div>
          <Badge status={status} />
        </div>

        {/* Visual-first: dot-on-bar at the top so even a glance tells the story */}
        {value.optimal_low != null && value.optimal_high != null && (
          <div className="mb-5">
            <MarkerDotBar
              value={value.value}
              optimalLow={value.optimal_low}
              optimalHigh={value.optimal_high}
              standardLow={value.standard_low}
              standardHigh={value.standard_high}
              flag={status}
            />
          </div>
        )}

        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-precision text-5xl text-clinical-charcoal font-medium">{value.value}</span>
            <span className="text-body text-clinical-stone text-xl ml-2">{value.unit}</span>
          </div>
          {history.length >= 2 && (
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <Sparkline
                data={history.map(h => ({ value: h.value, date: h.drawDate }))}
                optimalLow={value.optimal_low ?? null}
                optimalHigh={value.optimal_high ?? null}
                color={dirCfg?.color ?? '#1B4332'}
                width={100}
                height={32}
              />
              <p className="text-precision text-[0.5rem] text-clinical-stone tracking-wider uppercase">{history.length} draws</p>
            </div>
          )}
        </div>

        {/* Previous → Current comparison */}
        {comparison?.previous && comparison.delta != null && (
          <div className="flex items-center gap-3 mb-4 bg-clinical-cream/60 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 text-precision text-[0.6rem] text-clinical-stone">
              <span className="font-medium">{format(new Date(comparison.previous.drawDate), 'MMM yyyy')}:</span>
              <span className="text-clinical-charcoal font-bold">{comparison.previous.value}</span>
            </div>
            {dirCfg && (
              <span className="material-symbols-outlined text-[16px]" style={{ color: dirCfg.color }}>{dirCfg.icon}</span>
            )}
            <div className="flex items-center gap-1.5 text-precision text-[0.6rem] text-clinical-stone">
              <span className="font-medium">{format(new Date(comparison.current.drawDate), 'MMM yyyy')}:</span>
              <span className="text-clinical-charcoal font-bold">{comparison.current.value}</span>
            </div>
            {comparison.deltaPct != null && Math.abs(comparison.deltaPct) >= 1 && (
              <span
                className="text-precision text-[0.55rem] font-bold tracking-wider px-1.5 py-0.5 ml-auto"
                style={{
                  borderRadius: '2px',
                  backgroundColor: dirCfg ? `${dirCfg.color}15` : '#0001',
                  color: dirCfg?.color ?? '#666',
                }}
              >
                {comparison.delta > 0 ? '+' : ''}{comparison.deltaPct.toFixed(0)}%
              </span>
            )}
          </div>
        )}

        {value.optimal_low != null && value.optimal_high != null ? (
          <OptimalRangeBar value={value.value} unit={value.unit} optimalLow={value.optimal_low} optimalHigh={value.optimal_high}
            standardLow={value.standard_low ?? undefined} standardHigh={value.standard_high ?? undefined} />
        ) : value.standard_low != null && value.standard_high != null ? (
          <div className="flex gap-4">
            <p className="text-precision text-[0.68rem] text-clinical-stone">Standard range: {value.standard_low}–{value.standard_high} {value.unit}</p>
          </div>
        ) : null}

        {analysis && status === 'urgent' && !expanded && (
          <div className="mt-4 p-4 bg-[#C94F4F]/5 border-l-2 border-[#C94F4F] rounded-r-lg">
            <p className="text-body text-clinical-charcoal text-sm font-medium">{analysis.headline}</p>
          </div>
        )}

        {analysis && (
          <button onClick={() => setExpanded(!expanded)} className="mt-4 flex items-center gap-2 text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">
            CLINICAL ANALYSIS
            <span className="material-symbols-outlined text-[14px] transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
          </button>
        )}

        <AnimatePresence>
          {expanded && analysis && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="mt-6 space-y-4 pt-4 border-t border-outline-variant/10">
                <p className="text-body text-clinical-charcoal font-semibold">{analysis.headline}</p>
                <p className="text-body text-clinical-stone text-sm leading-relaxed">{analysis.explanation}</p>
                {analysis.what_to_do && (
                  <div className="bg-primary-container/5 border-l-2 border-primary-container rounded-r px-3 py-2">
                    <p className="text-precision text-[0.55rem] font-bold text-primary-container tracking-widest uppercase mb-1">Do this</p>
                    <p className="text-body text-clinical-charcoal text-sm">{analysis.what_to_do}</p>
                  </div>
                )}
                {onAddToPrep && <ClinicalLink onClick={() => onAddToPrep(value.marker_name)}>ADD TO CLINICAL PREP</ClinicalLink>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
