// src/components/wellness/SupplementStack.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SupplementItem } from '../../hooks/useWellnessPlan';
import { SectionLabel } from '../ui/SectionLabel';

function priorityConfig(p: string) {
  if (p === 'critical') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'CRITICAL' };
  if (p === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'HIGH' };
  if (p === 'optimize') return { border: 'border-t-[3px] border-[#2A9D8F]', badge: 'bg-[#2A9D8F] text-white', text: 'OPTIMIZE' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'MODERATE' };
}

function sourceIcon(s: string) { return s === 'lab_finding' ? 'biotech' : s === 'medication_depletion' ? 'medication' : s === 'optimization' ? 'trending_up' : 'symptoms'; }

const SupplementCard = ({ item, index }: { item: SupplementItem; index: number }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = priorityConfig(item.priority);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className={`bg-clinical-white rounded-[10px] shadow-card ${cfg.border} overflow-hidden`}>
      <div className="p-6">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[10px] bg-gradient-to-br from-[#1B423A] to-[#0F2A24] flex items-center justify-center flex-shrink-0 shadow-card">
              <span className="text-authority text-lg font-bold text-[#D4A574] leading-none">{item.rank}</span>
            </div>
            <div className="min-w-0">
              <h4 className="text-body text-clinical-charcoal font-semibold break-words leading-tight">{item.nutrient}</h4>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide break-words mt-0.5">{item.form}</p>
            </div>
          </div>
          <span className={`${cfg.badge} text-precision text-[0.7rem] font-bold px-2 py-0.5 flex-shrink-0`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
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
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'moderate' | 'optimize'>('all');
  // Always sort by rank — AI gives a goal-aligned order that the user
  // should see top-down. Many users only take top 2-3.
  const sorted = [...supplements].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const displayed = filter === 'all' ? sorted : sorted.filter(s => s.priority === filter);
  const counts = { critical: sorted.filter(s => s.priority === 'critical').length, high: sorted.filter(s => s.priority === 'high').length, moderate: sorted.filter(s => s.priority === 'moderate').length, optimize: sorted.filter(s => s.priority === 'optimize').length };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <SectionLabel icon="medication">Supplement Protocol</SectionLabel>
        <p className="text-body text-clinical-stone text-sm">{supplements.length} recommendations · ranked by your goals</p>
      </div>
      {supplements.length > 3 && (
        <div className="bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-[10px] p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#B8915F] text-[20px] flex-shrink-0 mt-0.5">tips_and_updates</span>
          <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
            Ranked 1 to {supplements.length} by what matters most for your goals. If you can only take a few, start with <strong>#1</strong> and add the rest as budget allows.
          </p>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {[{ id: 'all', label: `All (${supplements.length})` }, { id: 'critical', label: `Critical (${counts.critical})` }, { id: 'high', label: `High (${counts.high})` }, { id: 'moderate', label: `Moderate (${counts.moderate})` }, ...(counts.optimize > 0 ? [{ id: 'optimize', label: `Optimize (${counts.optimize})` }] : [])].map(tab => (
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
