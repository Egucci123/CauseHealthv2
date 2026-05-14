// src/components/labs/ReviewTable.tsx
import { useState } from 'react';
import type { ExtractedValue } from '../../store/labUploadStore';
import { SectionLabel } from '../ui/SectionLabel';
import { Button } from '../ui/Button';

interface ReviewTableProps {
  values: ExtractedValue[]; drawDate: string | null; labName: string | null;
  onConfirm: (values: ExtractedValue[], overrides: { drawDate?: string; labName?: string }) => void;
  onStartOver: () => void; loading: boolean;
}

const CATEGORIES = ['metabolic', 'cardiovascular', 'liver', 'kidney', 'thyroid', 'hormones', 'nutrients', 'cbc', 'inflammation', 'other'];

export const ReviewTable = ({ values: initialValues, drawDate, labName, onConfirm, onStartOver, loading }: ReviewTableProps) => {
  const [values, setValues] = useState<ExtractedValue[]>(initialValues);
  const [editDrawDate, setEditDrawDate] = useState(drawDate ?? '');
  const [editLabName, setEditLabName] = useState(labName ?? '');
  const [filter, setFilter] = useState<string>('all');

  const updateValue = (id: string, field: keyof ExtractedValue, newVal: string | number) => setValues(prev => prev.map(v => v.id === id ? { ...v, [field]: newVal } : v));
  const removeValue = (id: string) => setValues(prev => prev.filter(v => v.id !== id));
  const addManualValue = () => setValues(prev => [...prev, { id: crypto.randomUUID(), marker_name: '', value: 0, unit: '', standard_low: null, standard_high: null, standard_flag: 'normal', category: 'other' }]);

  const filteredValues = filter === 'all' ? values : values.filter(v => v.category === filter);
  const categories = [...new Set(values.map(v => v.category))];

  // ── Hardening: classify rows that need a second look ──
  // Severity tiers (visual only — doesn't block confirm):
  //   • critical: standard_flag in critical_high/critical_low — red
  //   • warn:    validation/sanity/ref/dedup/disambig notes, low confidence — amber
  //   • info:    auto-corrected (decimal fix), 2nd-pass confirmed — neutral
  const flaggedRows = values.filter(v =>
    v.standard_flag === 'critical_high' || v.standard_flag === 'critical_low'
    || v.validation_warning || v.sanity_warning || v.ref_mismatch_warning
    || v.dedup_note || v.confidence === 'low'
  );
  const criticalCount = values.filter(v => v.standard_flag === 'critical_high' || v.standard_flag === 'critical_low').length;
  const warnCount = flaggedRows.length - criticalCount;

  return (
    <div className="space-y-6">
      <div className="bg-primary-container/5 border border-primary-container/20 rounded-[10px] p-5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-primary-container text-[20px] flex-shrink-0 mt-0.5">check_circle</span>
          <div>
            <p className="text-body text-primary-container font-semibold">{values.length} values extracted. Please verify they look correct.</p>
            <p className="text-body text-clinical-stone text-sm mt-0.5">Edit any incorrect values before confirming.</p>
          </div>
        </div>
      </div>

      {/* Hardening summary banner — only renders when there's something to flag. */}
      {(criticalCount > 0 || warnCount > 0) && (
        <div className="bg-[#FFF4E5] border border-[#E89D3C]/30 rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#B86E15] text-[20px] flex-shrink-0 mt-0.5">warning</span>
            <div className="flex-1">
              <p className="text-body text-[#B86E15] font-semibold">
                {criticalCount > 0 && <>{criticalCount} critical value{criticalCount > 1 ? 's' : ''}{warnCount > 0 ? ' · ' : ''}</>}
                {warnCount > 0 && <>{warnCount} row{warnCount > 1 ? 's' : ''} flagged for review</>}
              </p>
              <p className="text-body text-[#8B5512] text-sm mt-0.5">
                Hover the ⚠ icon next to a row to see why. You can edit any value before confirming.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
        <SectionLabel>Lab Report Details</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Lab Date</label>
            <input type="date" value={editDrawDate} onChange={e => setEditDrawDate(e.target.value)} style={{ borderRadius: '4px' }}
              className="w-full bg-clinical-cream border border-outline-variant/20 px-3 py-2 text-clinical-charcoal text-body text-sm focus:border-primary-container focus:outline-none" />
          </div>
          <div>
            <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Laboratory Name</label>
            <input type="text" value={editLabName} onChange={e => setEditLabName(e.target.value)} placeholder="LabCorp, Quest, etc." style={{ borderRadius: '4px' }}
              className="w-full bg-clinical-cream border border-outline-variant/20 px-3 py-2 text-clinical-charcoal text-body text-sm focus:border-primary-container focus:outline-none placeholder-clinical-stone/50" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('all')} style={{ borderRadius: '4px' }}
          className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-1.5 border transition-all ${filter === 'all' ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone'}`}>
          All ({values.length})
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{ borderRadius: '4px' }}
            className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-1.5 border transition-all ${filter === cat ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone'}`}>
            {cat} ({values.filter(v => v.category === cat).length})
          </button>
        ))}
      </div>

      <div className="bg-clinical-white rounded-[10px] overflow-x-auto border border-outline-variant/10">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr className="text-precision text-[0.68rem] text-clinical-stone border-b border-outline-variant/10 bg-clinical-cream">
              <th className="px-2 py-3 font-medium w-8" />
              <th className="text-left px-3 py-3 font-medium">MARKER</th>
              <th className="text-left px-3 py-3 font-medium">VALUE</th>
              <th className="text-left px-3 py-3 font-medium">UNIT</th>
              <th className="text-left px-3 py-3 font-medium hidden md:table-cell">CATEGORY</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredValues.map(val => {
              // Compose the per-row warning tooltip from all annotation fields.
              // Critical lab flag dominates; then warnings; then info-level notes.
              const isCritical = val.standard_flag === 'critical_high' || val.standard_flag === 'critical_low';
              const warnMsgs = [
                val.validation_warning,
                val.sanity_warning,
                val.ref_mismatch_warning,
                val.dedup_note,
                val.confidence === 'low' ? 'Vision model reported LOW confidence on this value — verify against your source image.' : null,
              ].filter(Boolean) as string[];
              const infoMsgs = [
                val.validation_note,
                val.disambiguation_note,
                val.reconciliation_note,
                val.original_value != null ? `Originally extracted as ${val.original_value} ${val.unit ?? ''}; auto-corrected.` : null,
              ].filter(Boolean) as string[];
              const tier: 'critical' | 'warn' | 'info' | null = isCritical ? 'critical' : warnMsgs.length ? 'warn' : infoMsgs.length ? 'info' : null;
              const tooltipText = [
                isCritical ? `Lab flagged as ${val.standard_flag}` : null,
                ...warnMsgs, ...infoMsgs,
              ].filter(Boolean).join('\n\n');
              const badge = tier === 'critical' ? { icon: 'error', color: '#C94F4F', bg: '#FFE8E8' }
                          : tier === 'warn'     ? { icon: 'warning', color: '#B86E15', bg: '#FFF4E5' }
                          : tier === 'info'     ? { icon: 'info', color: '#3A6B8C', bg: '#E8F1FB' }
                          : null;
              return (
              <tr key={val.id} className={`border-b border-outline-variant/5 last:border-0 hover:bg-clinical-cream/30 transition-colors ${tier === 'critical' ? 'bg-[#FFF7F7]' : tier === 'warn' ? 'bg-[#FFFCF5]' : ''}`}>
                <td className="px-2 py-3 align-middle">
                  {badge && (
                    <span title={tooltipText} className="inline-flex items-center justify-center w-6 h-6 rounded-full cursor-help" style={{ backgroundColor: badge.bg }}>
                      <span className="material-symbols-outlined text-[14px]" style={{ color: badge.color }}>{badge.icon}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3"><input type="text" value={val.marker_name} onChange={e => updateValue(val.id, 'marker_name', e.target.value)} className="text-body text-clinical-charcoal text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary-container/30 rounded px-1 w-full min-w-[120px]" /></td>
                <td className="px-3 py-3"><input type="number" value={val.value} onChange={e => updateValue(val.id, 'value', parseFloat(e.target.value) || 0)} className="text-precision text-sm text-clinical-charcoal bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary-container/30 rounded px-1 w-24" step="any" /></td>
                <td className="px-3 py-3"><input type="text" value={val.unit} onChange={e => updateValue(val.id, 'unit', e.target.value)} className="text-body text-clinical-stone text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary-container/30 rounded px-1 w-20" /></td>
                <td className="px-3 py-3 hidden md:table-cell">
                  <select value={val.category} onChange={e => updateValue(val.id, 'category', e.target.value)} style={{ borderRadius: '3px' }}
                    className="text-precision text-[0.6rem] text-clinical-stone bg-transparent border border-outline-variant/10 px-2 py-1 focus:outline-none uppercase tracking-wider">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3"><button onClick={() => removeValue(val.id)} className="text-clinical-stone/40 hover:text-[#C94F4F] transition-colors"><span className="material-symbols-outlined text-[16px]">close</span></button></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={addManualValue} className="flex items-center gap-2 text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">
        <span className="material-symbols-outlined text-[14px]">add</span>Add Missing Value
      </button>

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-outline-variant/10">
        <button onClick={onStartOver} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold hover:text-clinical-charcoal transition-colors">Start Over</button>
        <Button variant="primary" size="lg" loading={loading} disabled={values.length === 0 || loading} onClick={() => onConfirm(values, { drawDate: editDrawDate, labName: editLabName })} icon="analytics" iconPosition="right">
          Confirm & Analyze ({values.length} values)
        </Button>
      </div>
    </div>
  );
};
