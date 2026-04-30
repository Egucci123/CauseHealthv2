// src/pages/symptoms/SymptomMapper.tsx
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { SymptomCard } from '../../components/symptoms/SymptomCard';
import { PatternAnalysis } from '../../components/symptoms/PatternAnalysis';
import { BodyMap } from '../../components/symptoms/BodyMap';
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { useSubscription } from '../../lib/subscription';
import { useSymptoms, useSymptomAnalysis } from '../../hooks/useSymptoms';
import { useSymptomAnalysisStore } from '../../store/symptomAnalysisStore';
import { useAuthStore } from '../../store/authStore';
import { PerformanceAudit } from '../../components/symptoms/PerformanceAudit';

const TABS = [
  { id: 'symptoms', label: 'My Symptoms', icon: 'symptoms' },
  { id: 'patterns', label: 'Pattern Analysis', icon: 'pattern' },
  { id: 'audit', label: 'Performance Audit', icon: 'tune' },
];

type TabId = 'symptoms' | 'patterns' | 'audit';

export const SymptomMapper = () => {
  const [activeTab, setActiveTab] = useState<TabId>('symptoms');
  const { data: symptoms, isLoading: symptomsLoading } = useSymptoms();
  const { data: analysis } = useSymptomAnalysis();
  const { isPro } = useSubscription();
  const userId = useAuthStore(s => s.user?.id);
  const qc = useQueryClient();
  const { isAnalyzing, startedAt, startAnalysis, markComplete } = useSymptomAnalysisStore();
  const analyzing = isAnalyzing;

  // Poll for completion while analyzing — survives navigation because the
  // store lives outside React.
  useEffect(() => {
    if (!isAnalyzing) return;
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['symptom-analysis'] });
    }, 3000);
    return () => clearInterval(id);
  }, [isAnalyzing, qc]);

  // When a NEW analysis lands (created_at after we started), mark complete.
  useEffect(() => {
    if (!isAnalyzing || !startedAt || !analysis) return;
    const createdAt = (analysis as any)._createdAt;
    if (!createdAt) return;
    if (new Date(createdAt).getTime() >= startedAt - 5000) {
      markComplete();
    }
  }, [isAnalyzing, startedAt, analysis, markComplete]);

  const handleRunAnalysis = () => {
    if (!isPro || !userId) return; // safety: paywall card handles UI
    setActiveTab('patterns');
    startAnalysis(userId);
  };

  const findSymptomAnalysis = (name: string) => analysis?.symptom_connections?.find(c => c.symptom.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.symptom.toLowerCase())) ?? null;
  const hasSymptoms = (symptoms?.length ?? 0) > 0;

  return (
    <AppShell pageTitle="Symptom Mapper">
      {/* Dark hero card — body map lives inside when analysis exists */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Why I Feel This Way</p>
            {analysis?.summary && (analysis as any).headline ? (
              <h1 className="text-authority text-2xl md:text-3xl text-on-surface font-bold leading-tight">{(analysis as any).headline}</h1>
            ) : (
              <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Symptom Mapper.</h1>
            )}
            <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">Connect your symptoms to root causes — not just treatments.</p>
          </div>
          {hasSymptoms && isPro && (
            <button
              onClick={handleRunAnalysis}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors disabled:opacity-60 flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
              {analyzing ? 'Analyzing…' : analysis ? 'Re-Analyze' : 'Run Analysis'}
            </button>
          )}
        </div>

        {/* Body map + summary inside hero when analysis exists */}
        {analysis?.summary && !analyzing && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mt-5 pt-5 border-t border-white/10">
            <div className="md:col-span-1 flex justify-center">
              <BodyMap
                systems={Array.from(new Set((analysis.patterns ?? []).flatMap((p: any) => p.body_systems ?? [])))}
                size={180}
              />
            </div>
            <div className="md:col-span-2">
              <p className="text-body text-on-surface leading-relaxed">{analysis.summary}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tab nav — same segmented control as Wellness + Lab Detail + Doctor Prep */}
      <div className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const patternCount = tab.id === 'patterns' ? (analysis?.patterns?.length ?? 0) : 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-[8px] transition-all ${
                active ? 'bg-clinical-white shadow-card' : 'hover:bg-clinical-white/50'
              }`}
            >
              <span className={`material-symbols-outlined text-[16px] ${active ? 'text-primary-container' : 'text-clinical-stone'}`}>{tab.icon}</span>
              <span className={`text-precision text-[0.68rem] font-bold tracking-wider ${active ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>{tab.label}</span>
              {tab.id === 'patterns' && analysis && patternCount > 0 && (
                <span className={`text-precision text-[0.55rem] font-bold px-1.5 py-0.5 rounded ${active ? 'bg-primary-container text-white' : 'bg-clinical-stone/15 text-clinical-stone'}`}>{patternCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'symptoms' && (
        <div>
          {symptomsLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="bg-clinical-white rounded-[10px] border-l-4 border-[#E8E3DB] p-5 animate-pulse"><div className="flex items-center gap-4"><div className="w-8 h-8 bg-[#E8E3DB] rounded-full" /><div className="flex-1"><div className="h-4 bg-[#E8E3DB] rounded-sm w-1/3 mb-2" /><div className="h-3 bg-[#E8E3DB] rounded-sm w-1/5" /></div></div></div>)}</div>
          ) : !hasSymptoms ? (
            <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
              <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">symptoms</span>
              <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">No symptoms logged</p>
              <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto">Log your symptoms during onboarding or in Settings to see your root cause map.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {!analysis && (
                <div className="bg-clinical-white rounded-[10px] border border-outline-variant/15 p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3"><span className="material-symbols-outlined text-primary-container text-[20px]">auto_awesome</span><p className="text-body text-clinical-charcoal text-sm font-medium">Run analysis to connect your symptoms to root causes.</p></div>
                  <Button variant="primary" size="sm" loading={analyzing} onClick={handleRunAnalysis}>Run Now</Button>
                </div>
              )}
              {symptoms!.map((s, i) => <SymptomCard key={s.id} symptom={s} analysis={findSymptomAnalysis(s.symptom)} index={i} />)}
            </div>
          )}
        </div>
      )}

      {activeTab === 'patterns' && !isPro ? (
        <PaywallGate
          feature="Symptom Pattern Analysis"
          description="Map your symptoms to root causes. The AI cross-references your labs, medications, and symptoms to identify patterns and the exact tests to ask your doctor for."
        >
          <div />
        </PaywallGate>
      ) : activeTab === 'patterns' && (
        <div>
          {analyzing ? (
            <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
              <div className="w-14 h-14 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-5"><span className="material-symbols-outlined text-primary-container text-2xl animate-pulse">pattern</span></div>
              <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Analyzing your symptoms...</p>
              <p className="text-body text-clinical-stone max-w-xs mx-auto">Connecting symptoms to labs, medications, and patterns. About 1–2 minutes.</p>
            </div>
          ) : !analysis ? (
            <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
              <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">pattern</span>
              <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">No analysis yet</p>
              <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto">Run the symptom analysis to identify patterns and root causes.</p>
              <Button variant="primary" size="lg" icon="auto_awesome" loading={analyzing} onClick={handleRunAnalysis} disabled={!hasSymptoms}>Run Analysis</Button>
            </div>
          ) : (
            <PatternAnalysis patterns={analysis.patterns ?? []} autoimmuneFlags={analysis.autoimmune_flags ?? []} priorityActions={analysis.priority_actions ?? []} />
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        userId ? <PerformanceAudit userId={userId} /> : <p className="text-body text-clinical-stone text-sm">Sign in to use the Performance Audit.</p>
      )}
    </AppShell>
  );
};
