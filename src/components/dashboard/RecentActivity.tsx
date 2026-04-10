// src/components/dashboard/RecentActivity.tsx
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useLabDraws } from '../../hooks/useLabData';
import { useActivePlan } from '../../hooks/useWellnessPlan';
import { SectionLabel } from '../ui/SectionLabel';

interface ActivityItem { id: string; icon: string; iconColor: string; title: string; description: string; timestamp: string; }

export const RecentActivity = () => {
  const { data: draws } = useLabDraws();
  const { data: plan } = useActivePlan();

  const activities: ActivityItem[] = [];

  if (draws) draws.slice(0, 3).forEach(draw => {
    activities.push({ id: draw.id, icon: 'biotech', iconColor: '#1B4332', title: 'Lab results analyzed',
      description: `${draw.labName ?? 'Lab report'} · ${draw.processingStatus === 'complete' ? 'Analysis complete' : 'Processing...'}`, timestamp: draw.createdAt });
  });

  if (plan) activities.push({ id: plan.id, icon: 'favorite', iconColor: '#D4A574', title: 'Wellness plan generated',
    description: `${plan.planData?.supplementStack?.tier1?.length ?? 0} supplements recommended`, timestamp: plan.createdAt });

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (activities.length === 0) return null;

  return (
    <div>
      <SectionLabel>Recent Activity</SectionLabel>
      <div className="space-y-3">
        {activities.slice(0, 4).map(item => (
          <div key={item.id} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.iconColor}15` }}>
              <span className="material-symbols-outlined text-[16px]" style={{ color: item.iconColor }}>{item.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body text-clinical-charcoal text-sm font-medium">{item.title}</p>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mt-0.5">{item.description} · {formatDistanceToNow(parseISO(item.timestamp), { addSuffix: true })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
