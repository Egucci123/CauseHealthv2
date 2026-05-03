// src/components/settings/DataManagement.tsx
import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../hooks/useProfile';
import { useLabDraws } from '../../hooks/useLabData';
import { useMedications } from '../../hooks/useMedications';
import { useSymptoms } from '../../hooks/useSymptoms';

export const DataManagement = () => {
  const user = useAuthStore(s => s.user);
  const { data: profile } = useProfile();
  const { data: labDraws = [] } = useLabDraws();
  const { data: meds = [] } = useMedications();
  const { data: symptoms = [] } = useSymptoms();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    const userId = user?.id;
    if (!userId) return;
    // Fetch ALL user data for complete export
    const [condRes, wpRes, dpRes, lvRes, paRes, detRes] = await Promise.allSettled([
      supabase.from('conditions').select('*').eq('user_id', userId),
      supabase.from('wellness_plans').select('*').eq('user_id', userId),
      supabase.from('doctor_prep_documents').select('*').eq('user_id', userId),
      supabase.from('lab_values').select('*').eq('user_id', userId),
      supabase.from('priority_alerts').select('*').eq('user_id', userId),
      supabase.from('detections').select('*').eq('user_id', userId),
    ]);
    const getData = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value.data ?? [] : [];
    const exportData = {
      exported_at: new Date().toISOString(),
      profile: { first_name: profile?.first_name, last_name: profile?.last_name, date_of_birth: profile?.date_of_birth, sex: profile?.sex },
      conditions: getData(condRes),
      medications: meds,
      symptoms,
      lab_draws: labDraws,
      lab_values: getData(lvRes),
      wellness_plans: getData(wpRes),
      doctor_prep_documents: getData(dpRes),
      priority_alerts: getData(paRes),
      detections: getData(detRes),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `causehealth-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    for (const table of ['detections', 'priority_alerts', 'conditions', 'doctor_prep_documents', 'wellness_plans', 'lab_values', 'lab_draws', 'symptoms', 'medications']) {
      await supabase.from(table).delete().eq('user_id', user!.id);
    }
    await useAuthStore.getState().signOut();
  };

  return (
    <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-[#C94F4F] shadow-card p-6">
      <div className="mb-6"><p className="text-precision text-[0.68rem] uppercase tracking-widest text-[#C94F4F] mb-0.5">Privacy</p><h3 className="text-authority text-xl text-clinical-charcoal">Your Data</h3></div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[{ label: 'Lab Draws', value: labDraws.length }, { label: 'Medications', value: meds.length }, { label: 'Symptoms', value: symptoms.length }].map(item => (
          <div key={item.label} className="bg-clinical-cream rounded-lg p-3 text-center">
            <span className="text-precision text-xl font-bold text-clinical-charcoal block">{item.value}</span>
            <span className="text-precision text-[0.6rem] uppercase tracking-wider text-clinical-stone">{item.label}</span>
          </div>
        ))}
      </div>

      <button onClick={handleExport} className="w-full border border-outline-variant/15 text-clinical-charcoal text-sm font-medium py-2.5 hover:bg-clinical-cream transition-colors mb-3" style={{ borderRadius: '6px' }}>Export All Data (JSON)</button>

      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} className="w-full text-body text-sm text-[#C94F4F] hover:text-[#C94F4F]/80 transition-colors py-2">Delete Account</button>
      ) : (
        <div className="bg-[#C94F4F]/5 border border-[#C94F4F]/20 rounded-lg p-4">
          <p className="text-body text-sm text-[#C94F4F] mb-3 font-medium">This will permanently delete all your health data and cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-[#C94F4F] text-white text-sm font-semibold py-2 hover:bg-[#C94F4F]/90 transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{deleting ? 'Deleting...' : 'Yes, Delete Everything'}</button>
            <button onClick={() => setConfirmDelete(false)} className="flex-1 border border-outline-variant/15 text-clinical-charcoal text-sm py-2 hover:bg-clinical-cream transition-colors" style={{ borderRadius: '6px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
