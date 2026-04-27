// src/pages/Dashboard.tsx
import { AppShell } from '../components/layout/AppShell';
import { HealthScoreRing } from '../components/dashboard/HealthScoreRing';
import { BiologicalAgeWidget } from '../components/dashboard/BiologicalAgeWidget';
import { TodayCard } from '../components/dashboard/TodayCard';
import { OrganAgesWidget } from '../components/dashboard/OrganAgesWidget';
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
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AppShell pageTitle="Intelligence Hub">
      {/* Dark hero card — clean text only. Score lives below in its own light card. */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">{dateLine}</p>
        <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">
          {greeting()}{firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">Your health, summarized. Today's actions, what's changing in your bloodwork, what's calling for attention.</p>
      </div>

      {/* Today card — biggest call-to-action */}
      <PrimaryCard status="brand" padding="lg">
        <TodayCard />
      </PrimaryCard>

      <QuickActions />

      {/* Score + Bio age row — both on light cards so the colored ring is readable */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PrimaryCard status="brand" padding="lg">
          <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-6">Health Intelligence Score</p>
          <HealthScoreRing score={healthScore} loading={valuesLoading} analyzing={hasProcessingDraw} />
        </PrimaryCard>
        <PrimaryCard status="brand" padding="lg">
          <BiologicalAgeWidget />
        </PrimaryCard>
      </div>

      {/* Organ ages — dark green gradient card matching the Wellness forecast */}
      <div className="bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[14px] p-6 shadow-card">
        <OrganAgesWidget darkMode />
      </div>

      {/* Priority alerts: full width — these are the urgent findings */}
      <PrimaryCard status="brand" padding="lg">
        <PriorityAlerts />
      </PrimaryCard>

      {/* Lab + supplement context */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PrimaryCard status="brand" padding="lg">
          <LabSummary />
        </PrimaryCard>
        <PrimaryCard status="brand" padding="lg">
          <SupplementChecklist />
        </PrimaryCard>
      </div>

      {/* Meds + recent activity at the bottom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PrimaryCard status="brand" padding="lg">
          <MedicationSnapshot />
        </PrimaryCard>
        <PrimaryCard status="brand" padding="lg">
          <RecentActivity />
        </PrimaryCard>
      </div>
    </AppShell>
  );
};
