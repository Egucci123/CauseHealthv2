// src/pages/symptoms/SymptomMapper.tsx
import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SymptomCard } from '../../components/symptoms/SymptomCard';
import { PatternAnalysis } from '../../components/symptoms/PatternAnalysis';
import { BodyMap } from '../../components/symptoms/BodyMap';
import { useSymptoms, useSymptomAnalysis, useRunSymptomAnalysis } from '../../hooks/useSymptoms';

const TABS = [{ id: 'symptoms', label: 'My Symptoms', icon: 'symptoms' }, { id: 'patterns', label: 'Pattern Analysis', icon: 'pattern' }];

export const SymptomMapper = () => {
  const [activeTab, setActiveTab] = useState<'symptoms' | 'patterns'>('symptoms');
  const [analyzing, setAnalyzing] = useState(false);
  const { data: symptoms, isLoading: symptomsLoading } = useSymptoms();
  const { data: analysis } = useSymptomAnalysis();
  const runAnalysis = useRunSymptomAnalysis();

  const handleRunAnalysis = async () => { setAnalyzing(true); setActiveTab('patterns'); try { await runAnalysis.mutateAsync(); } finally { setAnalyzing(false); } };

  const findSymptomAnalysis = (name: string) => analysis?.symptom_connections?.find(c => c.symptom.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.symptom.toLowerCase())) ?? null;
  const hasSymptoms = (symptoms?.length ?? 0) > 0;

  return (
    <AppShell pageTitle="Symptom Mapper">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <SectionHeader title="Symptom Mapper" description="Connect your symptoms to root causes — not just treatments." />
        {hasSymptoms && <Button variant="primary" size="md" icon="auto_awesome" loading={analyzing} onClick={handleRunAnalysis}>{analysis ? 'Re-Analyze' : 'Run Analysis'}</Button>}
      </div>

      {analysis?.summary && !analyzing && (
        <div className="bg-[#131313] rounded-[10px] p-6">
          <SectionLabel light icon="insights" className="text-on-surface-variant mb-3">Why I feel this way</SectionLabel>
          {(analysis as any).headline && (
            <p className="text-authority text-xl text-on-surface font-bold leading-tight mb-3">{(analysis as any).headline}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
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
        </div>
      )}

      <div className="flex border-b border-outline-variant/10">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-3 text-precision text-[0.68rem] font-bold tracking-wider uppercase border-b-2 transition-all ${activeTab === tab.id ? 'border-primary-container text-primary-container' : 'border-transparent text-clinical-stone hover:text-clinical-charcoal'}`}>
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>{tab.label}
            {tab.id === 'patterns' && analysis && <span className="text-precision text-[0.55rem] font-bold px-1.5 py-0.5 bg-primary-container text-white" style={{ borderRadius: '2px' }}>{analysis.patterns?.length ?? 0}</span>}
          </button>
        ))}
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

      {activeTab === 'patterns' && (
        <div>
          {analyzing ? (
            <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
              <div className="w-14 h-14 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-5"><span className="material-symbols-outlined text-primary-container text-2xl animate-pulse">pattern</span></div>
              <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Analyzing your symptoms...</p>
              <p className="text-body text-clinical-stone max-w-xs mx-auto">Connecting symptoms to labs, medications, and patterns. About 20 seconds.</p>
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
    </AppShell>
  );
};
