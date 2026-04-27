// src/pages/Dashboard.tsx
import { AppShell } from '../components/layout/AppShell';
import { HealthScoreRing } from '../components/dashboard/HealthScoreRing';
import { BiologicalAgeWidget } from '../components/dashboard/BiologicalAgeWidget';
import { TodayCard } from '../components/dashboard/TodayCard';
import { PriorityAlerts } from '../components/dashboard/PriorityAlerts';
import { SupplementChecklist } from '../components/dashboard/SupplementChecklist';
import { LabSummary } from '../components/dashboard/LabSummary';
import { MedicationSnapshot } from '../components/dashboard/MedicationSnapshot';
import { QuickActions } from '../components/dashboard/QuickActions';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { PrimaryCard } from '../components/ui/Card';
import { useAuthStore } from '../store/authStore';
import { useLatestLabValues, useLabDraws } from '../hooks/useLabData';
import { useHealthScore } from '../hooks/useHealthScore';

export const Dashboard = () => {
  const { profile } = useAuthStore();
  const { data: latestValues, isLoading: valuesLoading } = useLatestLabValues();
  const { data: allDraws } = useLabDraws();
  const healthScore = useHealthScore(latestValues, undefined);
  const hasProcessingDraw = allDraws?.some(d => d.processingStatus === 'processing');

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = profile?.firstName ?? '';

  return (
    <AppShell pageTitle="Intelligence Hub">
      <div className="space-y-8">
        <div className="border-b border-[#414844]/10 pb-6">
          <h2 className="text-authority text-4xl text-clinical-charcoal font-bold">
            {greeting()}{firstName ? `, ${firstName}` : ''}.
          </h2>
          <p className="text-body text-clinical-stone mt-2 text-lg">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <PrimaryCard status="brand" padding="lg">
          <TodayCard />
        </PrimaryCard>

        <QuickActions />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <PrimaryCard status="brand" padding="lg">
              <BiologicalAgeWidget />
            </PrimaryCard>
            <PrimaryCard status="brand" padding="lg">
              <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-6">Health Intelligence Score</p>
              <HealthScoreRing score={healthScore} loading={valuesLoading} analyzing={hasProcessingDraw} />
            </PrimaryCard>
            <PrimaryCard status="brand" padding="lg">
              <SupplementChecklist />
            </PrimaryCard>
          </div>
          <div className="lg:col-span-8 space-y-6">
            <PrimaryCard status="brand" padding="lg">
              <PriorityAlerts />
            </PrimaryCard>
            <PrimaryCard status="brand" padding="lg">
              <LabSummary />
            </PrimaryCard>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PrimaryCard status="brand" padding="lg">
            <MedicationSnapshot />
          </PrimaryCard>
          <PrimaryCard status="brand" padding="lg">
            <RecentActivity />
          </PrimaryCard>
        </div>
      </div>
    </AppShell>
  );
};
