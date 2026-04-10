// src/components/dashboard/MedicationSnapshot.tsx
import { useNavigate } from 'react-router-dom';
import { useMedications } from '../../hooks/useMedications';
import { MEDICATIONS } from '../../data/medications';
import { SectionLabel } from '../ui/SectionLabel';
import { SeverityBadge } from '../ui/Badge';

export const MedicationSnapshot = () => {
  const navigate = useNavigate();
  const { data: meds } = useMedications();

  if (!meds || meds.length === 0) return null;

  const medsWithDepletions = meds.map(med => {
    const dbMed = MEDICATIONS.find(m => m.generic.toLowerCase() === med.name.toLowerCase());
    return { ...med, depletes: dbMed?.depletes ?? [] };
  }).filter(m => m.depletes.length > 0);

  if (medsWithDepletions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel className="mb-0">Medication Depletions</SectionLabel>
        <button onClick={() => navigate('/medications')} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">View all</button>
      </div>
      <div className="space-y-2">
        {medsWithDepletions.slice(0, 3).map(med => (
          <div key={med.id} className="bg-clinical-white rounded-lg border border-outline-variant/10 px-4 py-3 flex items-center justify-between">
            <div><p className="text-body text-clinical-charcoal text-sm font-medium">{med.name}</p><p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{med.depletes.length} depletion{med.depletes.length !== 1 ? 's' : ''} identified</p></div>
            <SeverityBadge severity="critical" />
          </div>
        ))}
      </div>
    </div>
  );
};
