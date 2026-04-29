// src/components/dashboard/LabSummary.tsx
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { useLatestLabDraw, useLatestLabValues } from '../../hooks/useLabData';
import type { LabValue } from '../../types';
import { SectionLabel } from '../ui/SectionLabel';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

function getStatus(v: LabValue): 'urgent' | 'monitor' | 'optimal' {
  // New flags
  if (v.optimalFlag === 'healthy') return 'optimal';
  if (v.optimalFlag === 'watch') return 'monitor';
  if (v.optimalFlag === 'low' || v.optimalFlag === 'high' || v.optimalFlag === 'critical_low' || v.optimalFlag === 'critical_high') return 'urgent';
  // Legacy flags (rows pre-overhaul)
  if (v.optimalFlag === 'optimal') return 'optimal';
  if (v.optimalFlag === 'deficient' || v.optimalFlag === 'elevated') return 'urgent';
  // Fallback to standard flag if optimal not set
  if (v.standardFlag === 'high' || v.standardFlag === 'low' || v.standardFlag === 'critical_high' || v.standardFlag === 'critical_low') return 'urgent';
  if (v.standardFlag === 'normal') return 'optimal';
  return 'optimal';
}

const MarkerRow = ({ value }: { value: LabValue }) => {
  const status = getStatus(value);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-outline-variant/5 last:border-0">
      <div className="flex items-center gap-3"><Badge status={status} /><span className="text-body text-clinical-charcoal text-sm">{value.markerName}</span></div>
      <div className="text-right"><span className="text-precision text-sm text-clinical-charcoal font-medium">{value.value}</span><span className="text-precision text-[0.6rem] text-clinical-stone ml-1">{value.unit}</span></div>
    </div>
  );
};

export const LabSummary = () => {
  const navigate = useNavigate();
  const { data: draw } = useLatestLabDraw();
  const { data: values } = useLatestLabValues();

  const sortedValues = values ? [...values].sort((a, b) => { const o = { urgent: 0, monitor: 1, optimal: 2 }; return o[getStatus(a)] - o[getStatus(b)]; }) : [];
  const displayValues = sortedValues.slice(0, 6);

  // Skeleton only on true first load (no cached values). Otherwise show
  // cached data and refetch silently.
  if (!values) return (
    <div><SectionLabel className="mb-4">Latest Lab Results</SectionLabel>
      <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="flex justify-between items-center py-2.5 border-b border-outline-variant/5"><div className="flex items-center gap-3"><div className="w-12 h-4 bg-[#E8E3DB] rounded-sm animate-pulse" /><div className="w-24 h-4 bg-[#E8E3DB] rounded-sm animate-pulse" /></div><div className="w-16 h-4 bg-[#E8E3DB] rounded-sm animate-pulse" /></div>)}</div>
    </div>
  );

  if (!draw) return (
    <div><SectionLabel className="mb-4">Latest Lab Results</SectionLabel>
      <div className="py-8 text-center">
        <span className="material-symbols-outlined text-clinical-stone text-4xl mb-3 block">upload_file</span>
        <p className="text-body text-clinical-charcoal font-medium mb-2">No lab results yet.</p>
        <p className="text-body text-clinical-stone text-sm mb-6">Upload your bloodwork PDF to get your full analysis.</p>
        <Button variant="primary" size="md" onClick={() => navigate('/labs/upload')} icon="upload_file">Upload My Labs</Button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel className="mb-0">Latest Lab Results</SectionLabel>
        <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{format(parseISO(draw.drawDate), 'MMM d, yyyy')}</span>
      </div>
      <div>{displayValues.map(v => <MarkerRow key={v.id} value={v} />)}</div>
      {values && values.length > 6 && <button onClick={() => navigate(`/labs/${draw.id}`)} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline w-full text-center py-3 mt-1">View all {values.length} markers →</button>}
    </div>
  );
};
