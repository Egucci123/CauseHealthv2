// src/components/wellness/SupplementStack.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupplementItem } from '../../hooks/useWellnessPlan';
import { SectionLabel } from '../ui/SectionLabel';

function priorityConfig(p: string) {
  if (p === 'critical') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'CRITICAL' };
  if (p === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'HIGH' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'MODERATE' };
}

function sourceIcon(s: string) { return s === 'lab_finding' ? 'biotech' : s === 'medication_depletion' ? 'medication' : 'symptoms'; }

const SupplementCard = ({ item, index }: { item: SupplementItem; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = priorityConfig(item.priority);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className={`bg-clinical-white rounded-[10px] shadow-card ${cfg.border} overflow-hidden`}>
      <div className="p-6">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-clinical-cream rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-precision text-xs text-clinical-charcoal font-bold">{item.rank}</span>
            </div>
            <div>
              <h4 className="text-body text-clinical-charcoal font-semibold break-words">{item.nutrient}</h4>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide break-words">{item.form}</p>
            </div>
          </div>
          <span className={`${cfg.badge} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-clinical-cream rounded-lg p-3 overflow-hidden">
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Dose</p>
            <p className="text-body text-clinical-charcoal text-sm font-medium break-words">{item.dose}</p>
          </div>
          <div className="bg-clinical-cream rounded-lg p-3 overflow-hidden">
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Timing</p>
            <p className="text-body text-clinical-charcoal text-sm font-medium break-words">{item.timing}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-clinical-stone text-[14px]">{sourceIcon(item.sourced_from)}</span>
          <span className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider">{item.sourced_from.replace(/_/g, ' ')}</span>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">
          WHY THIS?
          <span className="material-symbols-outlined text-[14px] transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="mt-4 pt-4 border-t border-outline-variant/10 space-y-3">
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{item.why}</p>
                <p className="text-precision text-[0.6rem] text-clinical-stone italic">{item.evidence_note}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export const SupplementStack = ({ supplements }: { supplements: SupplementItem[] }) => {
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'moderate'>('all');
  const displayed = filter === 'all' ? supplements : supplements.filter(s => s.priority === filter);
  const counts = { critical: supplements.filter(s => s.priority === 'critical').length, high: supplements.filter(s => s.priority === 'high').length, moderate: supplements.filter(s => s.priority === 'moderate').length };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <SectionLabel icon="medication">Supplement Protocol</SectionLabel>
        <p className="text-body text-clinical-stone text-sm">{supplements.length} recommendations</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[{ id: 'all', label: `All (${supplements.length})` }, { id: 'critical', label: `Critical (${counts.critical})` }, { id: 'high', label: `High (${counts.high})` }, { id: 'moderate', label: `Moderate (${counts.moderate})` }].map(tab => (
          <button key={tab.id} onClick={() => setFilter(tab.id as any)} style={{ borderRadius: '4px' }}
            className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-1.5 border transition-all ${filter === tab.id ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone'}`}>{tab.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {displayed.map((item, i) => <SupplementCard key={item.nutrient} item={item} index={i} />)}
      </div>
    </div>
  );
};
