// src/components/labs/LabMarkerCard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OptimalRangeBar } from '../lab/OptimalRangeBar';
import { Badge } from '../ui/Badge';
import { ClinicalLink } from '../ui/Button';

interface LabValueRow {
  id: string; marker_name: string; marker_category: string; value: number; unit: string;
  standard_low?: number | null; standard_high?: number | null;
  optimal_low?: number | null; optimal_high?: number | null;
  standard_flag?: string | null; optimal_flag?: string | null;
}

interface AnalysisFinding { marker: string; flag: string; headline: string; explanation: string; }

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

  return (
    <div className={`bg-clinical-white rounded-[10px] shadow-card ${topBorder} overflow-hidden`}>
      <div className="p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-body text-clinical-charcoal font-semibold text-lg">{value.marker_name}</h3>
            <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mt-0.5">{value.marker_category}</p>
          </div>
          <Badge status={status} />
        </div>

        <div className="mb-6">
          <span className="text-precision text-5xl text-clinical-charcoal font-medium">{value.value}</span>
          <span className="text-body text-clinical-stone text-xl ml-2">{value.unit}</span>
        </div>

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
                {onAddToPrep && <ClinicalLink onClick={() => onAddToPrep(value.marker_name)}>ADD TO CLINICAL PREP</ClinicalLink>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
