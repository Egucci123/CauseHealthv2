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
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div><p className="text-precision text-[0.68rem] uppercase tracking-widest text-clinical-stone mb-1">Account</p><h1 className="text-authority text-3xl text-clinical-charcoal">Settings</h1></div>
          {isPro && <span className="text-precision text-[0.65rem] uppercase tracking-wider bg-primary-container/10 text-primary-container px-3 py-1.5" style={{ borderRadius: '2px' }}>Pro</span>}
        </div>

        <div className="flex gap-1 mb-7">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`text-precision text-[0.68rem] uppercase tracking-widest px-4 py-2.5 whitespace-nowrap transition-colors relative ${activeTab === tab.id ? 'bg-primary-container text-white' : 'bg-clinical-white text-clinical-stone hover:bg-clinical-cream'}`} style={{ borderRadius: '6px' }}>
              {tab.label}
              {tab.id === 'subscription' && status === 'past_due' && <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C94F4F] rounded-full" />}
            </button>
          ))}
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
