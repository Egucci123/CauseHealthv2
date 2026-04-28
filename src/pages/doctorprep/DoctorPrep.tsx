// src/pages/doctorprep/DoctorPrep.tsx
import { useState, Component, type ReactNode } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { ClinicalSummary } from '../../components/doctorprep/ClinicalSummary';
import { TestsToRequest } from '../../components/doctorprep/TestsToRequest';
import { VisitCardStacks } from '../../components/doctorprep/VisitCardStacks';
import { AdditionalTesting, type PanelGap } from '../../components/doctorprep/AdditionalTesting';
import { computePanelGaps, computeProactiveScreenings } from '../../store/labUploadStore';
import { useSymptoms } from '../../hooks/useSymptoms';
import { useLatestDoctorPrep, useGenerateDoctorPrep } from '../../hooks/useDoctorPrep';
import { useLatestLabDraw, useLatestLabValues } from '../../hooks/useLabData';
import { detectCriticalFindings } from '../../lib/criticalFindings';
import { useMemo } from 'react';
import { useSymptomAnalysis } from '../../hooks/useSymptoms';
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { useAuthStore } from '../../store/authStore';
import { exportDoctorPrepPDF, exportPatientVisitGuidePDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

const TABS = [
  { id: 'visit', label: 'At Your Visit', icon: 'fact_check' },
  { id: 'summary', label: 'Clinical Summary', icon: 'description' },
  { id: 'tests', label: 'Suggested Tests', icon: 'biotech' },
];

export const DoctorPrep = () => {
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'visit' | 'summary' | 'tests'>('visit');
  const { data: doc, isLoading } = useLatestDoctorPrep();
  const { generate, generating } = useGenerateDoctorPrep();
  const { data: latestDraw } = useLatestLabDraw();
  const { data: latestValues } = useLatestLabValues();
  const { data: symptomAnalysis } = useSymptomAnalysis();
  const { data: symptoms } = useSymptoms();

  const ageNum = profile?.dateOfBirth
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31_557_600_000)
    : null;
  const criticalFindings = useMemo(
    () => latestValues ? detectCriticalFindings(latestValues as any, { age: ageNum, sex: profile?.sex ?? null }) : [],
    [latestValues, ageNum, profile?.sex],
  );

  // Healthy-mode detection — same threshold as the edge function (<25% need attention).
  const isHealthyMode = useMemo(() => {
    if (!latestValues || latestValues.length === 0) return false;
    const needsAttentionFlags = new Set(['watch', 'low', 'high', 'critical_low', 'critical_high', 'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated']);
    const count = latestValues.filter((v: any) => needsAttentionFlags.has(v.optimalFlag ?? v.optimal_flag)).length;
    return (count / latestValues.length) < 0.25;
  }, [latestValues]);

  // Compute panel gaps fresh from latest lab values + proactive screenings
  // for healthy / longevity-focused users. Don't trust cached notes.panel_gaps.
  const panelGaps: PanelGap[] = useMemo(() => {
    const baseGaps: PanelGap[] = (() => {
      if (!latestValues || latestValues.length === 0) return [];
      const tested = new Set<string>(
        latestValues.map((v: any) => (v.markerName ?? v.marker_name ?? '').toLowerCase()).filter(Boolean)
      );
      return computePanelGaps(tested) as PanelGap[];
    })();

    // Detect GI symptoms for the gut-microbiome trigger
    const giKeywords = ['bloat', 'gas', 'diarrhea', 'constipation', 'reflux', 'heartburn', 'ibs', 'cramp', 'nausea', 'stool'];
    const hasGiSymptoms = (symptoms ?? []).some((s: any) =>
      giKeywords.some(k => (s.symptom ?? '').toLowerCase().includes(k))
    );

    const proactive = computeProactiveScreenings({
      age: ageNum,
      sex: profile?.sex ?? null,
      primaryGoal: profile?.primaryGoals?.[0] ?? null,
      isHealthyMode,
      hasGiSymptoms,
    }) as PanelGap[];

    // Dedupe by test name — proactive screenings should never collide with
    // panel gaps (different test types) but be safe.
    const seen = new Set<string>();
    return [...baseGaps, ...proactive].filter(g => {
      const key = g.test_name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [latestValues, ageNum, profile?.sex, profile?.primaryGoals, isHealthyMode, symptoms]);

  const docCreatedAt = (doc as any)?._createdAt ? new Date((doc as any)._createdAt) : null;
  const drawCreatedAt = latestDraw?.createdAt ? new Date(latestDraw.createdAt) : null;
  const hasNewerLabs = doc && docCreatedAt && drawCreatedAt && drawCreatedAt > docCreatedAt;

  const handleGenerate = () => {
    generate().catch(err => console.error('[DoctorPrep] Generation error:', err));
  };

  const patientName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient';
  const handleExport = () => {
    if (!doc) return;
    exportDoctorPrepPDF(doc, patientName, panelGaps);
  };
  const handleExportPatientGuide = () => {
    if (!doc) return;
    exportPatientVisitGuidePDF(doc, patientName, panelGaps, isHealthyMode);
  };

  return (
    <AppShell pageTitle="Clinical Prep">
      {/* Dark hero card — matches Wellness Plan + Lab Detail */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">For Your Visit</p>
            <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Doctor Prep.</h1>
            <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">A clinical document your doctor takes seriously. ICD-10 codes, exact tests, prepared questions.</p>
          </div>
          {doc && !generating && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={handleExportPatientGuide}
                className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white/10 hover:bg-white/20 text-on-surface rounded-[8px] transition-colors"
                title="Plain-English guide for you, with scripts and what to do if your doctor pushes back"
              >
                <span className="material-symbols-outlined text-[14px]">person</span>Your Guide
              </button>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white/10 hover:bg-white/20 text-on-surface rounded-[8px] transition-colors"
                title="Clinical document for your doctor"
              >
                <span className="material-symbols-outlined text-[14px]">medical_services</span>Doctor PDF
              </button>
              <button
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors"
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
            <span className="text-precision text-[0.55rem] text-on-surface-variant tracking-wide ml-auto">
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
        <PaywallGate
          feature="Doctor Prep"
          description="A clinical summary your doctor takes seriously — exact tests to ask for with ICD-10 codes, prepared questions, and visit-ready card stacks."
        >
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
            <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">description</span>
            <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Ready to prepare your appointment</p>
            <p className="text-body text-clinical-stone mb-2 max-w-sm mx-auto leading-relaxed">Generate a clinical document with your lab findings, ICD-10 codes, and specific test requests.</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mb-8">Best results when labs are uploaded and analyzed</p>
            <Button variant="primary" size="lg" loading={generating} onClick={handleGenerate} icon="auto_awesome">Generate Clinical Summary</Button>
          </div>
        </PaywallGate>
      ) : (
        <div className="space-y-5">
          {/* Tab nav — same segmented-control style as Wellness Plan + Lab Detail */}
          <div className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[8px] transition-all ${
                  activeTab === tab.id ? 'bg-clinical-white shadow-card' : 'hover:bg-clinical-white/50'
                }`}
              >
                <span className={`material-symbols-outlined text-[16px] ${activeTab === tab.id ? 'text-primary-container' : 'text-clinical-stone'}`}>{tab.icon}</span>
                <span className={`text-precision text-[0.68rem] font-bold tracking-wider ${activeTab === tab.id ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>{tab.label}</span>
              </button>
            ))}
          </div>

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
                          <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-[#9A3A20] bg-[#9A3A20]/10 px-2 py-0.5 rounded">
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
              <VisitCardStacks doc={doc} symptomAnalysis={symptomAnalysis} />
            </>
          )}
          {activeTab === 'summary' && <ClinicalSummary doc={doc} />}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              <TestsToRequest tests={Array.isArray(doc.tests_to_request) ? doc.tests_to_request : []} advanced={Array.isArray(doc.advanced_screening) ? doc.advanced_screening : []} />
              <AdditionalTesting gaps={panelGaps} />
            </div>
          )}
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
        <AppShell pageTitle="Clinical Prep">
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
