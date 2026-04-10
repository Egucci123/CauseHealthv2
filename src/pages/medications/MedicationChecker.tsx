// src/pages/medications/MedicationChecker.tsx
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MedicationCard } from '../../components/medications/MedicationCard';
import { InteractionChecker } from '../../components/medications/InteractionChecker';
import { DepletionProtocol } from '../../components/medications/DepletionProtocol';
import { useActiveMedications } from '../../hooks/useMedications';
import { useNavigate } from 'react-router-dom';

const MedSkeleton = () => (
  <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="bg-clinical-white rounded-[10px] border-t-[3px] border-[#E8E3DB] p-6 animate-pulse"><div className="h-5 bg-[#E8E3DB] rounded-sm w-1/3 mb-2" /><div className="h-3 bg-[#E8E3DB] rounded-sm w-1/4" /></div>)}</div>
);

export const MedicationChecker = () => {
  const navigate = useNavigate();
  const { data: medications, isLoading } = useActiveMedications();
  const medNames = (medications ?? []).map(m => m.name);

  return (
    <AppShell pageTitle="Medication Intelligence">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <SectionHeader title="Medication Intelligence" description="Every drug you take has nutritional consequences most doctors never discuss. This is your full depletion map." />
        <Button variant="secondary" size="md" icon="settings" onClick={() => navigate('/settings')}>Edit Medications</Button>
      </div>

      {isLoading ? <MedSkeleton /> : !medications?.length ? (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
          <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">medication</span>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">No medications added</p>
          <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto leading-relaxed">Add your medications to see your full nutritional depletion profile.</p>
          <Button variant="primary" size="lg" icon="add" onClick={() => navigate('/settings')}>Add Medications</Button>
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <h3 className="text-authority text-2xl text-clinical-charcoal font-bold mb-6">My Medications</h3>
            <div className="space-y-6">
              {medications.map((med, i) => <MedicationCard key={med.id} medication={med} index={i} />)}
            </div>
          </section>
          <section><InteractionChecker medications={medications} /></section>
          <section><DepletionProtocol medicationNames={medNames} /></section>
          <div className="border border-outline-variant/10 rounded-lg p-5">
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed">Drug-nutrient depletion information is for educational purposes only. Always discuss supplement protocols with your prescribing physician. Do not stop or change medications based on this information.</p>
          </div>
        </div>
      )}
    </AppShell>
  );
};
