// src/pages/wellness/WellnessPlanPage.tsx
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SupplementStack } from '../../components/wellness/SupplementStack';
import { LifestyleInterventions } from '../../components/wellness/LifestyleInterventions';
import { ActionPlan } from '../../components/wellness/ActionPlan';
import { useWellnessPlan, useGenerateWellnessPlan } from '../../hooks/useWellnessPlan';
import { useAuthStore } from '../../store/authStore';
import { exportWellnessPlanPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

const WellnessSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="h-24 bg-[#E8E3DB] rounded-[10px]" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[1,2,3,4].map(i => <div key={i} className="h-48 bg-[#E8E3DB] rounded-[10px]" />)}</div>
    <div className="h-64 bg-[#E8E3DB] rounded-[10px]" />
  </div>
);

const GeneratingState = () => (
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
    <div className="w-16 h-16 bg-primary-container/10 rounded-full flex items-center justify-center mx-auto mb-6">
      <span className="material-symbols-outlined text-primary-container text-3xl animate-pulse">favorite</span>
    </div>
    <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Building your wellness plan...</p>
    <p className="text-body text-clinical-stone max-w-sm mx-auto leading-relaxed">We're analyzing your lab results to build a personalized protocol. This takes about 20 seconds.</p>
    <div className="flex gap-2 justify-center mt-6">
      {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary-container animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />)}
    </div>
    <p className="text-precision text-[0.6rem] text-clinical-stone mt-4">You can navigate away — generation continues in the background.</p>
  </div>
);

const EmptyState = ({ onGenerate, loading }: { onGenerate: () => void; loading: boolean }) => (
  <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
    <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">favorite</span>
    <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">Your wellness plan is ready to generate</p>
    <p className="text-body text-clinical-stone mb-2 max-w-sm mx-auto leading-relaxed">We'll analyze your lab results, medications, and symptoms to create a personalized supplement protocol and 90-day action plan.</p>
    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mb-8">Takes approximately 20 seconds</p>
    <Button variant="primary" size="lg" loading={loading} onClick={onGenerate} icon="auto_awesome">Generate My Wellness Plan</Button>
  </div>
);

export const WellnessPlanPage = () => {
  const { profile } = useAuthStore();
  const { data: plan, isLoading } = useWellnessPlan();
  const { generate, generating } = useGenerateWellnessPlan();

  const handleGenerate = () => {
    generate().catch(err => console.error('[WellnessPlan] Generation error:', err));
  };

  const handleExportPDF = () => {
    if (!plan) return;
    exportWellnessPlanPDF(plan, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  return (
    <AppShell pageTitle="Wellness Protocol">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <SectionHeader title="Wellness Protocol" description={plan?.plan_mode === 'optimization'
          ? "Your personalized longevity protocol — optimizing from a strong baseline."
          : "Your personalized supplement stack and 90-day action plan, built from your lab results, medications, and symptoms."} />
        {plan && !generating && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <Button variant="secondary" size="md" icon="download" onClick={handleExportPDF}>Export PDF</Button>
            <Button variant="ghost" size="md" icon="refresh" onClick={handleGenerate}>Regenerate</Button>
          </div>
        )}
      </div>

      {isLoading ? <WellnessSkeleton />
        : generating ? <GeneratingState />
        : !plan ? <EmptyState onGenerate={handleGenerate} loading={generating} />
        : (
        <div className="space-y-10">
          <div className="bg-[#131313] rounded-[10px] p-6">
            <div className="flex justify-between items-start mb-4">
              <SectionLabel light icon="auto_awesome" className="text-on-surface-variant">AI Analysis</SectionLabel>
              <div className="flex items-center gap-2">
                {plan.plan_mode === 'optimization' && (
                  <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 bg-[#2A9D8F] text-white" style={{ borderRadius: '2px' }}>LONGEVITY MODE</span>
                )}
                <span className="text-precision text-[0.6rem] text-on-surface-variant">Generated {plan.generated_at ? format(new Date(plan.generated_at), 'MMM d, yyyy') : 'recently'}</span>
              </div>
            </div>
            <p className="text-body text-on-surface leading-relaxed text-lg">{plan.summary}</p>
          </div>
          <SupplementStack supplements={plan.supplement_stack ?? []} />
          <LifestyleInterventions interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }} />
          <ActionPlan actionPlan={plan.action_plan ?? { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } }} retestTimeline={plan.retest_timeline ?? []} />
          <div className="border border-outline-variant/10 rounded-lg p-5">
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed">{plan.disclaimer}</p>
          </div>
        </div>
      )}
    </AppShell>
  );
};
