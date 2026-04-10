// src/components/labs/ManualEntry.tsx
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/SectionLabel';

interface ManualEntryProps { drawId: string | null; onComplete: (drawId: string) => void; }

interface ManualValue { marker_name: string; value: string; unit: string; standard_low: string; standard_high: string; category: string; }

const PANELS: Record<string, Array<{ name: string; unit: string; category: string }>> = {
  'Metabolic (CMP)': [
    { name: 'Glucose, Serum', unit: 'mg/dL', category: 'metabolic' }, { name: 'BUN', unit: 'mg/dL', category: 'kidney' },
    { name: 'Creatinine', unit: 'mg/dL', category: 'kidney' }, { name: 'eGFR', unit: 'mL/min', category: 'kidney' },
    { name: 'ALT (SGPT)', unit: 'IU/L', category: 'liver' }, { name: 'AST (SGOT)', unit: 'IU/L', category: 'liver' },
    { name: 'Total Bilirubin', unit: 'mg/dL', category: 'liver' }, { name: 'Albumin', unit: 'g/dL', category: 'metabolic' },
  ],
  'Lipid Panel': [
    { name: 'Total Cholesterol', unit: 'mg/dL', category: 'cardiovascular' }, { name: 'LDL Cholesterol', unit: 'mg/dL', category: 'cardiovascular' },
    { name: 'HDL Cholesterol', unit: 'mg/dL', category: 'cardiovascular' }, { name: 'Triglycerides', unit: 'mg/dL', category: 'cardiovascular' },
  ],
  'CBC': [
    { name: 'WBC', unit: 'x10E3/uL', category: 'cbc' }, { name: 'RBC', unit: 'x10E6/uL', category: 'cbc' },
    { name: 'Hemoglobin', unit: 'g/dL', category: 'cbc' }, { name: 'Hematocrit', unit: '%', category: 'cbc' }, { name: 'Platelets', unit: 'x10E3/uL', category: 'cbc' },
  ],
  'Thyroid': [
    { name: 'TSH', unit: 'mIU/L', category: 'thyroid' }, { name: 'Free T3', unit: 'pg/mL', category: 'thyroid' }, { name: 'Free T4', unit: 'ng/dL', category: 'thyroid' },
  ],
  'Nutrients': [
    { name: 'Vitamin D, 25-OH', unit: 'ng/mL', category: 'nutrients' }, { name: 'Vitamin B12', unit: 'pg/mL', category: 'nutrients' },
    { name: 'Ferritin', unit: 'ng/mL', category: 'nutrients' }, { name: 'Magnesium', unit: 'mg/dL', category: 'nutrients' },
  ],
};

export const ManualEntry = ({ drawId, onComplete }: ManualEntryProps) => {
  const { user } = useAuthStore();
  const [activePanel, setActivePanel] = useState('Metabolic (CMP)');
  const [values, setValues] = useState<Record<string, ManualValue>>({});
  const [drawDate, setDrawDate] = useState('');
  const [labName, setLabName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateValue = (markerName: string, field: keyof ManualValue, val: string) => {
    setValues(prev => ({ ...prev, [markerName]: { ...prev[markerName], marker_name: markerName, category: PANELS[activePanel]?.find(m => m.name === markerName)?.category ?? 'other', [field]: val } }));
  };

  const enteredValues = Object.values(values).filter(v => v.value && parseFloat(v.value) > 0);

  const handleSave = async () => {
    if (!user || enteredValues.length === 0) return;
    setSaving(true); setError(null);
    try {
      let currentDrawId = drawId;
      if (!currentDrawId) {
        const { data: draw, error: drawError } = await supabase.from('lab_draws').insert({ user_id: user.id, draw_date: drawDate || new Date().toISOString().split('T')[0], lab_name: labName || null, processing_status: 'complete' }).select().single();
        if (drawError || !draw) throw new Error('Failed to create lab record');
        currentDrawId = draw.id;
      } else {
        await supabase.from('lab_draws').update({ draw_date: drawDate || new Date().toISOString().split('T')[0], lab_name: labName || null, processing_status: 'complete' }).eq('id', currentDrawId);
      }
      const dbValues = enteredValues.map(v => ({ draw_id: currentDrawId, user_id: user.id, marker_name: v.marker_name, marker_category: v.category, value: parseFloat(v.value), unit: v.unit, standard_low: v.standard_low ? parseFloat(v.standard_low) : null, standard_high: v.standard_high ? parseFloat(v.standard_high) : null, draw_date: drawDate || new Date().toISOString().split('T')[0] }));
      const { error: insertError } = await supabase.from('lab_values').insert(dbValues);
      if (insertError) throw new Error('Failed to save values');
      await supabase.functions.invoke('analyze-labs', { body: { drawId: currentDrawId, userId: user.id } });
      onComplete(currentDrawId!);
    } catch (err) { setError(String(err)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
        <SectionLabel>Lab Report Details</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Lab Date</label>
            <input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} style={{ borderRadius: '4px' }} className="w-full bg-clinical-cream border border-outline-variant/20 px-3 py-2 text-clinical-charcoal text-sm focus:border-primary-container focus:outline-none" /></div>
          <div><label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Lab Name (optional)</label>
            <input type="text" value={labName} onChange={e => setLabName(e.target.value)} placeholder="LabCorp, Quest, etc." style={{ borderRadius: '4px' }} className="w-full bg-clinical-cream border border-outline-variant/20 px-3 py-2 text-clinical-charcoal text-sm focus:border-primary-container focus:outline-none placeholder-clinical-stone/50" /></div>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {Object.keys(PANELS).map(panel => (
          <button key={panel} onClick={() => setActivePanel(panel)} style={{ borderRadius: '4px' }}
            className={`text-precision text-[0.6rem] font-bold tracking-wider uppercase px-3 py-2 border transition-all ${activePanel === panel ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone'}`}>{panel}</button>
        ))}
      </div>

      <div className="bg-clinical-white rounded-[10px] border border-outline-variant/10 overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-precision text-[0.68rem] text-clinical-stone border-b border-outline-variant/10 bg-clinical-cream">
            <th className="text-left px-5 py-3 font-medium">MARKER</th><th className="text-left px-3 py-3 font-medium">VALUE</th><th className="text-left px-3 py-3 font-medium">UNIT</th>
          </tr></thead>
          <tbody>
            {(PANELS[activePanel] ?? []).map(marker => {
              const val = values[marker.name];
              return (
                <tr key={marker.name} className={`border-b border-outline-variant/5 last:border-0 ${val?.value ? 'bg-primary-container/3' : ''}`}>
                  <td className="px-5 py-3"><p className="text-body text-clinical-charcoal text-sm">{marker.name}</p></td>
                  <td className="px-3 py-3"><input type="number" value={val?.value ?? ''} onChange={e => updateValue(marker.name, 'value', e.target.value)} placeholder="—" step="any" style={{ borderRadius: '3px' }}
                    className="w-24 bg-clinical-cream border border-outline-variant/15 px-2 py-1.5 text-precision text-sm text-clinical-charcoal focus:border-primary-container focus:outline-none placeholder-clinical-stone/30" /></td>
                  <td className="px-3 py-3"><span className="text-body text-clinical-stone text-sm">{marker.unit}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-lg p-4"><p className="text-body text-[#C94F4F] text-sm">{error}</p></div>}

      <div className="flex items-center justify-between gap-4">
        <p className="text-body text-clinical-stone text-sm">{enteredValues.length} value{enteredValues.length !== 1 ? 's' : ''} entered</p>
        <Button variant="primary" size="lg" loading={saving} disabled={enteredValues.length === 0 || saving} onClick={handleSave} icon="analytics" iconPosition="right">Save & Analyze</Button>
      </div>
    </div>
  );
};
