// src/pages/doctorprep/DoctorPrep.tsx
import { useState, useEffect, Component, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { ClinicalSummary } from '../../components/doctorprep/ClinicalSummary';
import { TestsToRequest } from '../../components/doctorprep/TestsToRequest';
import { PossibleConditionsCard } from '../../components/doctorprep/PossibleConditionsCard';
import { VisitCardStacks } from '../../components/doctorprep/VisitCardStacks';
import { MedicationsTab } from '../../components/doctorprep/MedicationsTab';
import { TabNav } from '../../components/ui/TabNav';
import { isHealthyMode as computeIsHealthyMode } from '../../lib/healthMode';
import { useLatestDoctorPrep, useGenerateDoctorPrep } from '../../hooks/useDoctorPrep';
import { useLatestLabDraw, useLatestLabValues } from '../../hooks/useLabData';
import { detectCriticalFindings } from '../../lib/criticalFindings';
import { useMemo } from 'react';
// Symptom-analysis cards removed from doctor prep — symptoms now surface in
// the Wellness Plan with how-addressed details. Doctor prep tests_to_request
// already covers symptom-driven test recommendations via the triage rule.
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { useAuthStore } from '../../store/authStore';
import { exportDoctorPrepPDF, exportPatientVisitGuidePDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

const TABS = [
  { id: 'visit',       label: 'At Your Visit',     shortLabel: 'Visit',   icon: 'fact_check' },
  { id: 'summary',     label: 'Clinical Summary',  shortLabel: 'Summary', icon: 'description' },
  { id: 'tests',       label: 'Suggested Tests',   shortLabel: 'Tests',   icon: 'biotech' },
  { id: 'medications', label: 'Medications',       shortLabel: 'Meds',    icon: 'medication' },
];

export const DoctorPrep = () => {
  const { profile, user } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'visit' | 'summary' | 'tests' | 'medications'>('visit');
  const { data: doc} = useLatestDoctorPrep();
  const { generate, generating } = useGenerateDoctorPrep();
  const { data: latestDraw } = useLatestLabDraw();
  const { data: latestValues } = useLatestLabValues();

  // Force-fresh on mount + realtime so the doctor prep appears the instant
  // generation completes — no manual refresh required. Same pattern as
  // WellnessPlanPage: invalidate-on-mount + realtime subscription + 90s
  // polling backstop.
  useEffect(() => {
    if (!user?.id) return;
    qc.invalidateQueries({ queryKey: ['doctor-prep', user.id] });
    const channelId = `doctor-prep-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_prep_documents', filter: `user_id=eq.${user.id}` },
        () => { qc.invalidateQueries({ queryKey: ['doctor-prep', user.id] }); }
      )
      .subscribe();
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > 90_000) { clearInterval(interval); return; }
      qc.invalidateQueries({ queryKey: ['doctor-prep', user.id] });
    }, 3000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [user?.id, qc]);

  const ageNum = profile?.dateOfBirth
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31_557_600_000)
    : null;
  const criticalFindings = useMemo(
    () => latestValues ? detectCriticalFindings(latestValues as any, { age: ageNum, sex: profile?.sex ?? null }) : [],
    [latestValues, ageNum, profile?.sex],
  );

  // Healthy-mode detection — uses _shared/healthMode logic (mirrored client-side).
  const isHealthyMode = useMemo(() => computeIsHealthyMode(latestValues as any), [latestValues]);

  // Panel-gap (Tier 1/2/3 baseline) computation removed entirely. Test
  // recommendations now come exclusively from the AI's tests_to_request
  // array, which is filtered by the strict triage rule (symptom OR med
  // depletion OR out-of-range marker OR early-detection pattern). No
  // hardcoded "every adult should have these" lists.

  const docCreatedAt = (doc as any)?._createdAt ? new Date((doc as any)._createdAt) : null;
  const drawCreatedAt = latestDraw?.createdAt ? new Date(latestDraw.createdAt) : null;
  const hasNewerLabs = doc && docCreatedAt && drawCreatedAt && drawCreatedAt > docCreatedAt;

  const handleGenerate = () => {
    generate().catch(err => console.error('[DoctorPrep] Generation error:', err));
  };

  const patientName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient';
  const handleExport = () => {
    if (!doc) return;
    exportDoctorPrepPDF(doc, patientName);
  };
  const handleExportPatientGuide = () => {
    if (!doc) return;
    exportPatientVisitGuidePDF(doc, patientName, isHealthyMode);
  };

  return (
    <AppShell pageTitle="Clinical Prep" showDisclaimer>
      {/* Dark hero card — matches Wellness Plan + Lab Detail */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">For Your Visit</p>
            <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Doctor Prep.</h1>
            <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">A clinical document your doctor takes seriously. ICD-10 codes, exact tests, prepared questions.</p>
          </div>
          {doc && !generating && (
            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto md:flex-shrink-0">
              <button
                onClick={handleExportPatientGuide}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white/10 hover:bg-white/20 text-on-surface rounded-[8px] transition-colors"
                title="Plain-English guide for you, with scripts and what to do if your doctor pushes back"
              >
                <span className="material-symbols-outlined text-[14px]">person</span>Your Guide
              </button>
              <button
                onClick={handleExport}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white/10 hover:bg-white/20 text-on-surface rounded-[8px] transition-colors"
                title="Clinical document for your doctor"
              >
                <span className="material-symbols-outlined text-[14px]">medical_services</span>Doctor PDF
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>Regenerate
              </button>
            </div>
          )}
        </div>
        {/* Stat chips inline at bottom of hero */}
        {doc && !generating && (
          <div className="flex flex-wrap gap-2 mt-5">
            {Array.isArray(doc.tests_to_request) && doc.tests_to_request.filter(t => t.priority === 'urgent').length > 0 && (
              <span className="text-precision text-[0.6rem] font-bold px-2.5 py-1 bg-[#C94F4F] text-white rounded">
                {doc.tests_to_request.filter(t => t.priority === 'urgent').length} priority
              </span>
            )}
            <span className="text-precision text-[0.6rem] font-bold px-2.5 py-1 bg-white/10 text-on-surface rounded">
              {(Array.isArray(doc.tests_to_request) ? doc.tests_to_request.length : 0) + (Array.isArray(doc.advanced_screening) ? doc.advanced_screening.length : 0)} suggestions
            </span>
            {Array.isArray(doc.advanced_screening) && doc.advanced_screening.length > 0 && (
              <span className="text-precision text-[0.6rem] font-bold px-2.5 py-1 bg-[#2A9D8F] text-white rounded">
                {doc.advanced_screening.length} early detection
              </span>
            )}
            <span className="text-precision text-[0.7rem] text-on-surface-variant tracking-wide ml-auto">
              Generated {doc.generated_at ? format(new Date(doc.generated_at), 'MMM d, yyyy') : 'recently'}
            </span>
          </div>
        )}
      </div>

      {hasNewerLabs && !generating && (
        <button onClick={handleGenerate} className="w-full bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 rounded-[10px] p-5 flex items-center gap-4 hover:bg-[#2A9D8F]/15 transition-colors text-left">
          <span className="material-symbols-outlined text-[#2A9D8F] text-[24px] flex-shrink-0">update</span>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">New lab results available</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone">Tap to regenerate with your latest bloodwork.</p>
          </div>
          <span className="material-symbols-outlined text-[#2A9D8F] text-[18px] flex-shrink-0">arrow_forward</span>
        </button>
      )}

      {doc === undefined ? (
        <div className="space-y-4 animate-pulse"><div className="h-32 bg-[#E8E3DB] rounded-[10px]" /><div className="h-64 bg-[#E8E3DB] rounded-[10px]" /></div>
      ) : generating ? (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
          <div className="w-14 h-14 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-5"><span className="material-symbols-outlined text-primary-container text-2xl animate-pulse">description</span></div>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Preparing your clinical document...</p>
          <p className="text-body text-clinical-stone max-w-xs mx-auto">Writing clinical summary, pulling ICD-10 codes, building test request list. About 45–90 seconds.</p>
          <div className="flex gap-2 justify-center mt-6">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary-container animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />)}
          </div>
          <p className="text-precision text-[0.6rem] text-clinical-stone mt-4">You can navigate away — generation continues in the background.</p>
        </div>
      ) : !doc ? (
        <PaywallGate
          feature="Doctor Prep"
          description="A clinical summary your doctor takes seriously — exact tests to ask for with ICD-10 codes, prepared questions, and visit-ready card stacks."
        >
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6 sm:p-12 text-center">
            <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">description</span>
            <p className="text-authority text-xl sm:text-2xl text-clinical-charcoal font-bold mb-3">Ready to prepare your appointment</p>
            <p className="text-body text-clinical-stone text-sm sm:text-base mb-2 max-w-sm mx-auto leading-relaxed">Generate a clinical document with your lab findings, ICD-10 codes, and specific test requests.</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mb-8">Best results when labs are uploaded and analyzed</p>
            <Button variant="primary" size="lg" loading={generating} onClick={handleGenerate} icon="auto_awesome" className="w-full sm:w-auto">Generate Clinical Summary</Button>
          </div>
        </PaywallGate>
      ) : (
        <div className="space-y-5">
          {/* Tab nav — same segmented-control style as Wellness Plan + Lab Detail */}
          <TabNav tabs={TABS} active={activeTab} onChange={(id) => setActiveTab(id as any)} variant="full" />

          {activeTab === 'visit' && (
            <>
              {/* Pro-only critical findings card with full differential — for the doctor */}
              {criticalFindings.length > 0 && (
                <div className="bg-clinical-white rounded-[14px] border-l-4 border-[#9A3A20] shadow-card p-6 mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[#9A3A20] text-[20px]">priority_high</span>
                    <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#9A3A20]">Critical findings · for your doctor</p>
                  </div>
                  <p className="text-authority text-base text-clinical-charcoal font-bold mb-4">
                    {criticalFindings.length === 1 ? 'One finding' : `${criticalFindings.length} findings`} the doctor should investigate first.
                  </p>
                  <div className="space-y-3">
                    {criticalFindings.map((f, i) => (
                      <div key={i} className="bg-clinical-cream/50 rounded-[10px] p-4 border-l-2 border-[#9A3A20]">
                        <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                          <span className="text-precision text-sm font-bold text-clinical-charcoal">{f.marker}</span>
                          <span className="text-precision text-base font-bold text-[#9A3A20]">{f.value}{f.unit ? ` ${f.unit}` : ''}</span>
                          <span className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-[#9A3A20] bg-[#9A3A20]/10 px-2 py-0.5 rounded">
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-body text-clinical-charcoal text-sm leading-relaxed mb-2">{f.doctorConcern}</p>
                        {f.icd10 && f.icd10.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {f.icd10.map(code => (
                              <span key={code} className="text-precision text-[0.6rem] font-bold text-clinical-charcoal bg-clinical-cream border border-outline-variant/30 px-2 py-0.5 rounded">
                                {code}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <VisitCardStacks doc={doc} />
            </>
          )}
          {activeTab === 'summary' && <ClinicalSummary doc={doc} />}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              <TestsToRequest tests={Array.isArray(doc.tests_to_request) ? doc.tests_to_request : []} advanced={Array.isArray(doc.advanced_screening) ? doc.advanced_screening : []} />
              {Array.isArray(doc.possible_conditions) && doc.possible_conditions.length > 0 && (
                <PossibleConditionsCard conditions={doc.possible_conditions} />
              )}
            </div>
          )}
          {activeTab === 'medications' && <MedicationsTab />}
        </div>
      )}
    </AppShell>
  );
};

// Error boundary prevents blank screen — shows error message instead of crashing
class DoctorPrepErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error: error.message }; }
  render() {
    if (this.state.hasError) {
      return (
        <AppShell pageTitle="Clinical Prep" showDisclaimer>
          <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-[10px] p-8 text-center">
            <span className="material-symbols-outlined text-[#C94F4F] text-4xl mb-3 block">error</span>
            <p className="text-body text-clinical-charcoal font-semibold mb-2">Something went wrong loading this document.</p>
            <p className="text-body text-clinical-stone text-sm mb-4">{this.state.error}</p>
            <button onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Try Again</button>
          </div>
        </AppShell>
      );
    }
    return this.props.children;
  }
}

export const DoctorPrepPage = () => <DoctorPrepErrorBoundary><DoctorPrep /></DoctorPrepErrorBoundary>;
