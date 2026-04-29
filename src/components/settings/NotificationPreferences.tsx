// src/components/settings/NotificationPreferences.tsx
import { useProfile, useUpdateProfile } from '../../hooks/useProfile';

const ToggleRow = ({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between py-4 border-b border-outline-variant/5 last:border-0">
    <div><p className="text-body text-sm font-medium text-clinical-charcoal">{label}</p><p className="text-body text-xs text-clinical-stone mt-0.5">{description}</p></div>
    <button onClick={() => onChange(!value)} className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-primary-container' : 'bg-clinical-stone/20'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-clinical-white shadow transition-transform duration-200 mt-0.5 ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export const NotificationPreferences = () => {
  const { data: profile} = useProfile();
  const update = useUpdateProfile();
  const toggle = (field: string, value: boolean) => update.mutate({ [field]: value });

  if (!profile) return <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-primary-container shadow-card p-6 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-[#E8E3DB] rounded mb-2" />)}</div>;

  return (
    <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-primary-container shadow-card p-6">
      <div className="mb-6"><p className="text-precision text-[0.68rem] uppercase tracking-widest text-primary-container mb-0.5">Preferences</p><h3 className="text-authority text-xl text-clinical-charcoal">Notifications</h3></div>
      <ToggleRow label="Lab Result Alerts" description="Notify when new lab analysis is ready" value={profile?.notification_lab_results ?? true} onChange={v => toggle('notification_lab_results', v)} />
      <ToggleRow label="Daily Check-In Reminder" description="Remind you to log your daily check-in" value={profile?.notification_check_in_reminder ?? true} onChange={v => toggle('notification_check_in_reminder', v)} />
      <ToggleRow label="Wellness Plan Updates" description="Alert when your wellness plan is updated" value={profile?.notification_wellness_updates ?? true} onChange={v => toggle('notification_wellness_updates', v)} />
      <ToggleRow label="Supplement Reminders" description="Morning reminder to take your supplements" value={profile?.notification_supplement_reminder ?? false} onChange={v => toggle('notification_supplement_reminder', v)} />
    </div>
  );
};
