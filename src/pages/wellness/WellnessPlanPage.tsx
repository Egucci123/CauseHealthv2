// src/pages/wellness/WellnessPlanPage.tsx
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { FolderSection } from '../../components/ui/FolderSection';
import { SupplementStack } from '../../components/wellness/SupplementStack';
import { LifestyleInterventions } from '../../components/wellness/LifestyleInterventions';
import { ActionPlan } from '../../components/wellness/ActionPlan';
import { useWellnessPlan, useGenerateWellnessPlan } from '../../hooks/useWellnessPlan';
import { useLatestLabDraw } from '../../hooks/useLabData';
import { useAuthStore } from '../../store/authStore';
import { exportWellnessPlanPDF } from '../../lib/exportPDF';
import { format } from 'date-fns';

const WellnessSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-24 bg-[#E8E3DB] rounded-[10px]" />
    {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-[#E8E3DB] rounded-[10px]" />)}
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
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { data: plan, isLoading } = useWellnessPlan();
  const { generate, generating } = useGenerateWellnessPlan();
  const { data: latestDraw } = useLatestLabDraw();

  const planCreatedAt = (plan as any)?._createdAt ? new Date((plan as any)._createdAt) : null;
  const drawCreatedAt = latestDraw?.createdAt ? new Date(latestDraw.createdAt) : null;
  const hasNewerLabs = plan && planCreatedAt && drawCreatedAt && drawCreatedAt > planCreatedAt;

  const handleGenerate = () => {
    generate().catch(err => console.error('[WellnessPlan] Generation error:', err));
  };

  const handleExportPDF = () => {
    if (!plan) return;
    exportWellnessPlanPDF(plan, `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Patient');
  };

  const supplementCount = plan?.supplement_stack?.length ?? 0;
  const retestCount = plan?.retest_timeline?.length ?? 0;

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

      {hasNewerLabs && !generating && (
        <button onClick={handleGenerate} className="w-full bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 rounded-[10px] p-5 flex items-center gap-4 hover:bg-[#2A9D8F]/15 transition-colors text-left">
          <span className="material-symbols-outlined text-[#2A9D8F] text-[24px] flex-shrink-0">update</span>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">New lab results available</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone">Tap to regenerate your wellness plan with your latest bloodwork.</p>
          </div>
          <span className="material-symbols-outlined text-[#2A9D8F] text-[18px] flex-shrink-0">arrow_forward</span>
        </button>
      )}

      {isLoading ? <WellnessSkeleton />
        : generating ? <GeneratingState />
        : !plan ? <EmptyState onGenerate={handleGenerate} loading={generating} />
        : (
        <div className="space-y-4">
          {/* Always-visible AI summary header */}
          <div className="bg-[#131313] rounded-[10px] p-6">
            <div className="flex justify-between items-start mb-4">
              <SectionLabel light icon="auto_awesome" className="text-on-surface-variant">Your Plan At A Glance</SectionLabel>
              <div className="flex items-center gap-2">
                {plan.plan_mode === 'optimization' && (
                  <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 bg-[#2A9D8F] text-white" style={{ borderRadius: '2px' }}>LONGEVITY MODE</span>
                )}
                <span className="text-precision text-[0.6rem] text-on-surface-variant">Generated {plan.generated_at ? format(new Date(plan.generated_at), 'MMM d, yyyy') : 'recently'}</span>
              </div>
            </div>
            <p className="text-body text-on-surface leading-relaxed text-lg">{plan.summary}</p>
          </div>

          <FolderSection
            icon="medication"
            title="Supplement Protocol"
            count={supplementCount}
            countLabel={supplementCount === 1 ? 'supplement' : 'supplements'}
            explanation="Lab-backed supplements, ranked by clinical priority. Each one targets a specific abnormal value in your bloodwork — never guesswork. Untested nutrients are listed in the retest panel below, not here."
            defaultOpen
          >
            <SupplementStack supplements={plan.supplement_stack ?? []} />
          </FolderSection>

          <FolderSection
            icon="restaurant"
            title="Lifestyle Interventions"
            countLabel="categories"
            count={4}
            explanation="Diet, sleep, exercise, and stress strategies targeting your specific lab patterns. These work alongside your supplements — most clinical changes happen here, not in the bottle."
          >
            <LifestyleInterventions interventions={plan.lifestyle_interventions ?? { diet: [], sleep: [], exercise: [], stress: [] }} />
          </FolderSection>

          <FolderSection
            icon="event"
            title="Your 90-Day Action Plan"
            countLabel="phases"
            count={3}
            explanation="Three phases — stabilize, optimize, maintain — broken into specific weekly actions. Don't try to do everything at once; the plan is paced for sustainable change."
          >
            <ActionPlan
              actionPlan={plan.action_plan ?? { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } }}
              retestTimeline={[]}
              planKey={plan.generated_at ?? 'default'}
            />
          </FolderSection>

          <FolderSection
            icon="science"
            title="Recommended Retest at Week 12"
            count={retestCount}
            countLabel={retestCount === 1 ? 'marker' : 'markers'}
            explanation="These are the markers from your CURRENT bloodwork to recheck after the protocol — they tell you whether the plan worked. For NEW tests to discuss with your doctor right now (like JAK2, celiac panel, hormone panels), see your Clinical Prep document."
            accentColor="#1B423A"
          >
            <div className="space-y-3">
              {plan.retest_timeline && plan.retest_timeline.length > 0 ? (
                plan.retest_timeline.map((r, i) => (
                  <div key={i} className="bg-clinical-cream rounded-lg p-4 border-l-4 border-primary-container">
                    <div className="flex justify-between items-start gap-3 mb-1.5">
                      <p className="text-body text-clinical-charcoal font-semibold text-sm">{r.marker}</p>
                      <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-primary-container flex-shrink-0">{r.retest_at}</span>
                    </div>
                    <p className="text-body text-clinical-stone text-xs leading-relaxed">{r.why}</p>
                  </div>
                ))
              ) : (
                <p className="text-body text-clinical-stone text-sm">No retests recommended.</p>
              )}
              <button
                onClick={() => navigate('/doctor-prep')}
                className="w-full mt-2 bg-primary-container/5 border border-primary-container/20 rounded-lg p-4 flex items-center gap-3 hover:bg-primary-container/10 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-primary-container text-[20px]">description</span>
                <div className="flex-1">
                  <p className="text-body text-clinical-charcoal font-semibold text-sm">Looking for new tests to add?</p>
                  <p className="text-precision text-[0.6rem] text-clinical-stone">Your Clinical Prep has the full diagnostic test list with ICD-10 codes.</p>
                </div>
                <span className="material-symbols-outlined text-primary-container text-[18px]">arrow_forward</span>
              </button>
            </div>
          </FolderSection>

          <div className="border border-outline-variant/10 rounded-lg p-5">
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed">{plan.disclaimer}</p>
          </div>
        </div>
      )}
    </AppShell>
  );
};
