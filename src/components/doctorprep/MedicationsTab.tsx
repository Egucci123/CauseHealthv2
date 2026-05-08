// src/components/doctorprep/MedicationsTab.tsx
//
// Medications tab on the Clinical Prep page. Reuses the rich MedicationCard
// from the standalone /medications page (depletion profiles + healthier
// alternatives). Replaces the old "Current Medications" folded section that
// used to live inside the Clinical Summary tab — now a dedicated tab so users
// can review meds + their nutritional consequences alongside the visit
// document, and the doctor sees the medication list in the printed PDF.
import { useMedications } from '../../hooks/useMedications';
import { MedicationCard } from '../medications/MedicationCard';
import { SectionHeader } from '../ui/Card';

export const MedicationsTab = () => {
  const { data: medications, isLoading } = useMedications();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Your Medications"
        description="Each medication with its known nutritional depletions, recommended counter-supplements, and a list of healthier alternatives — pharmaceutical, natural, and lifestyle. Bring this to your visit so your doctor sees what each drug is silently depleting."
      />

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-32 bg-[#E8E3DB] rounded-[10px] animate-pulse" />)}
        </div>
      )}

      {!isLoading && (!medications || medications.length === 0) && (
        <div className="bg-clinical-white rounded-[10px] border border-outline-variant/15 p-6 sm:p-8 text-center">
          <span className="material-symbols-outlined text-clinical-stone text-[32px] mb-2 block">medication</span>
          <p className="text-body text-clinical-charcoal text-sm font-medium mb-1">No medications added yet</p>
          <p className="text-body text-clinical-stone text-xs">Add yours in Settings → Health Profile → Medications.</p>
        </div>
      )}

      {medications && medications.length > 0 && (
        <div className="space-y-4">
          {medications.map((med, i) => <MedicationCard key={med.id} medication={med} index={i} />)}
        </div>
      )}
    </div>
  );
};
