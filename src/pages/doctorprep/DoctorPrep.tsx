// src/pages/doctorprep/DoctorPrep.tsx
import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ClinicalSummary } from '../../components/doctorprep/ClinicalSummary';
import { TestsToRequest } from '../../components/doctorprep/TestsToRequest';
import { useLatestDoctorPrep, useGenerateDoctorPrep } from '../../hooks/useDoctorPrep';
import { useAuthStore } from '../../store/authStore';
import { exportDoctorPrepPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

const TABS = [{ id: 'summary', label: 'Clinical Summary', icon: 'description' }, { id: 'tests', label: 'Tests to Request', icon: 'biotech' }];

export const DoctorPrep = () => {
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'summary' | 'tests'>('summary');
  const { data: doc, isLoading } = useLatestDoctorPrep();
  const { generate, generating } = useGenerateDoctorPrep();

  const handleGenerate = () => {
    generate().catch(err => console.error('[DoctorPrep] Generation error:', err));
  };

  const handleExport = () => {
    if (!doc) return;
    exportDoctorPrepPDF(doc, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  return (
    <AppShell pageTitle="Clinical Prep">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <SectionHeader title="Doctor Prep" description="Your clinical document — ready to hand to your physician. ICD-10 codes included." />
        {doc && !generating && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <Button variant="secondary" size="md" icon="print" onClick={handleExport}>Print / Export PDF</Button>
            <Button variant="ghost" size="md" icon="refresh" loading={generating} onClick={handleGenerate}>Regenerate</Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4 animate-pulse"><div className="h-32 bg-[#E8E3DB] rounded-[10px]" /><div className="h-64 bg-[#E8E3DB] rounded-[10px]" /></div>
      ) : generating ? (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
          <div className="w-14 h-14 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-5"><span className="material-symbols-outlined text-primary-container text-2xl animate-pulse">description</span></div>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Preparing your clinical document...</p>
          <p className="text-body text-clinical-stone max-w-xs mx-auto">Writing clinical summary, pulling ICD-10 codes, building test request list. About 20 seconds.</p>
          <div className="flex gap-2 justify-center mt-6">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary-container animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />)}
          </div>
          <p className="text-precision text-[0.6rem] text-clinical-stone mt-4">You can navigate away — generation continues in the background.</p>
        </div>
      ) : !doc ? (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
          <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">description</span>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Ready to prepare your appointment</p>
          <p className="text-body text-clinical-stone mb-2 max-w-sm mx-auto leading-relaxed">Generate a clinical document with your lab findings, ICD-10 codes, and specific test requests.</p>
          <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mb-8">Best results when labs are uploaded and analyzed</p>
          <Button variant="primary" size="lg" loading={generating} onClick={handleGenerate} icon="auto_awesome">Generate Clinical Summary</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Info bar */}
          <div className="flex items-center justify-between bg-clinical-white rounded-[10px] border border-outline-variant/15 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-[20px]">check_circle</span>
              <div>
                <p className="text-body text-clinical-charcoal font-semibold text-sm">Document ready</p>
                <p className="text-precision text-[0.6rem] text-clinical-stone">Generated {format(new Date(doc.generated_at), 'MMMM d, yyyy · h:mm a')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {doc.tests_to_request?.filter(t => t.priority === 'urgent').length > 0 && (
                <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-[#C94F4F] text-white" style={{ borderRadius: '3px' }}>{doc.tests_to_request.filter(t => t.priority === 'urgent').length} URGENT TESTS</span>
              )}
              <span className="text-precision text-[0.6rem] font-bold px-2 py-1 bg-surface-container text-on-surface-variant" style={{ borderRadius: '3px' }}>{doc.tests_to_request?.length ?? 0} TESTS TOTAL</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-outline-variant/10">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 text-precision text-[0.68rem] font-bold tracking-wider uppercase border-b-2 transition-all ${activeTab === tab.id ? 'border-primary-container text-primary-container' : 'border-transparent text-clinical-stone hover:text-clinical-charcoal'}`}>
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && <ClinicalSummary doc={doc} />}
          {activeTab === 'tests' && <TestsToRequest tests={doc.tests_to_request ?? []} />}
        </div>
      )}
    </AppShell>
  );
};
