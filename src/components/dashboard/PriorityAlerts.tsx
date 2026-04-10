// src/components/dashboard/PriorityAlerts.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { PriorityAlert } from '../../types';
import { usePriorityAlerts, useDismissAlert } from '../../hooks/usePriorityAlerts';
import { SectionLabel } from '../ui/SectionLabel';
import { Badge } from '../ui/Badge';

const AlertSkeleton = () => (
  <div className="space-y-3">
    {[1, 2].map(i => (
      <div key={i} className="bg-clinical-white rounded-[10px] border-l-4 border-[#E8E3DB] p-5">
        <div className="h-3 bg-[#E8E3DB] rounded-sm w-1/4 mb-2 animate-pulse" />
        <div className="h-4 bg-[#E8E3DB] rounded-sm w-3/4 mb-1 animate-pulse" />
        <div className="h-3 bg-[#E8E3DB] rounded-sm w-full animate-pulse" />
      </div>
    ))}
  </div>
);

const AlertsEmpty = () => (
  <div className="bg-clinical-white rounded-[10px] p-8 text-center border border-outline-variant/10">
    <span className="material-symbols-outlined text-primary-container text-4xl mb-3 block">check_circle</span>
    <p className="text-body text-clinical-charcoal font-medium mb-1">No critical findings right now.</p>
    <p className="text-body text-clinical-stone text-sm">Upload your labs to get a full analysis.</p>
  </div>
);

const AlertCard = ({ alert, onDismiss }: { alert: PriorityAlert; onDismiss: () => void }) => {
  const navigate = useNavigate();
  const borderClass = { urgent: 'border-l-4 border-[#C94F4F]', monitor: 'border-l-4 border-[#E8922A]', optimal: 'border-l-4 border-[#D4A574]' }[alert.status];

  return (
    <motion.div layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, height: 0, marginBottom: 0 }} transition={{ duration: 0.2 }}
      className={`bg-clinical-white rounded-[10px] shadow-card ${borderClass} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge status={alert.status} />
            {alert.source && <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{alert.source}</span>}
          </div>
          <p className="text-body text-clinical-charcoal font-medium text-sm leading-snug">{alert.title}</p>
          {alert.description && <p className="text-body text-clinical-stone text-xs mt-1 leading-relaxed">{alert.description}</p>}
          {alert.actionLabel && alert.actionPath && (
            <button onClick={() => navigate(alert.actionPath!)} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline flex items-center gap-1 mt-2">
              {alert.actionLabel}<span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          )}
        </div>
        <button onClick={onDismiss} className="text-clinical-stone/40 hover:text-clinical-stone transition-colors flex-shrink-0" aria-label="Dismiss alert">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </motion.div>
  );
};

export const PriorityAlerts = () => {
  const { data: alerts, isLoading } = usePriorityAlerts();
  const { mutate: dismiss } = useDismissAlert();

  if (isLoading) return <div><SectionLabel className="mb-4">Priority Findings</SectionLabel><AlertSkeleton /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel className="mb-0">Priority Findings</SectionLabel>
        {alerts && alerts.length > 0 && <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{alerts.length} active</span>}
      </div>
      {!alerts || alerts.length === 0 ? <AlertsEmpty /> : (
        <div className="space-y-3">
          <AnimatePresence>
            {alerts.slice(0, 5).map(alert => <AlertCard key={alert.id} alert={alert} onDismiss={() => dismiss(alert.id)} />)}
          </AnimatePresence>
          {alerts.length > 5 && <button className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline w-full text-center py-2">View all {alerts.length} findings →</button>}
        </div>
      )}
    </div>
  );
};
