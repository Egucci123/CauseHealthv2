// src/pages/settings/Settings.tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { ProfileSettings } from '../../components/settings/ProfileSettings';
import { HealthProfileSettings } from '../../components/settings/HealthProfileSettings';
import { NotificationPreferences } from '../../components/settings/NotificationPreferences';
import { SubscriptionManagement } from '../../components/settings/SubscriptionManagement';
import { DataManagement } from '../../components/settings/DataManagement';
import { useSubscription } from '../../lib/subscription';

type Tab = 'profile' | 'health' | 'notifications' | 'subscription' | 'data';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' }, { id: 'health', label: 'Health Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'subscription', label: 'Subscription' }, { id: 'data', label: 'Your Data' },
];

export const Settings = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const { isPro, status } = useSubscription();

  useEffect(() => {
    const tab = searchParams.get('tab');
    const subResult = searchParams.get('subscription');
    if (tab === 'subscription' || subResult) setActiveTab('subscription');
  }, [searchParams]);

  return (
    <AppShell pageTitle="Settings">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Dark hero card */}
        <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Account</p>
              <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Settings.</h1>
              <p className="text-body text-on-surface-variant text-sm mt-2">Profile, health data, subscription, and the things only you control.</p>
            </div>
            {isPro && (
              <span className="inline-flex items-center gap-1 text-precision text-[0.6rem] font-bold tracking-widest uppercase bg-[#D4A574] text-clinical-charcoal px-2.5 py-1 rounded">
                Pro
              </span>
            )}
          </div>
        </div>

        {/* Tab nav — segmented control */}
        <div className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-[8px] transition-all relative ${
                  active ? 'bg-clinical-white shadow-card' : 'hover:bg-clinical-white/50'
                }`}
              >
                <span className={`text-precision text-[0.68rem] font-bold tracking-wider whitespace-nowrap ${active ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>
                  {tab.label}
                </span>
                {tab.id === 'subscription' && status === 'past_due' && <span className="absolute top-1 right-1 w-2 h-2 bg-[#C94F4F] rounded-full" />}
              </button>
            );
          })}
        </div>

        {activeTab === 'profile' && <ProfileSettings />}
        {activeTab === 'health' && <HealthProfileSettings />}
        {activeTab === 'notifications' && <NotificationPreferences />}
        {activeTab === 'subscription' && <SubscriptionManagement />}
        {activeTab === 'data' && <DataManagement />}
      </div>
    </AppShell>
  );
};
