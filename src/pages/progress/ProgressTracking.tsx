// src/pages/progress/ProgressTracking.tsx
//
// Progress page revamp — Phase 1.
//
// Old: 3 generic stat tiles + 5 disconnected sliders + hardcoded 6 lab markers.
// New: AdherenceHero showing protocol adherence vs the wellness plan, weekly
// progress, streak counter, and the existing tabbed deep-dive (check-in,
// trends, lab trends). The tabs stay because returning users want to drill
// in; the hero is the new "what matters this week" summary.
//
// Phase 2 (next session): personalized check-in questions, weekly AI coach
// note, forecast vs reality cards. Phase 1.5: nightly push notifications.

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { AdherenceHero } from '../../components/progress/AdherenceHero';
import { StreakCounter } from '../../components/progress/StreakCounter';
import { CheckInForm } from '../../components/progress/CheckInForm';
import { SupplementChecklist } from '../../components/dashboard/SupplementChecklist';
import { ComplianceCalendar } from '../../components/progress/ComplianceCalendar';
import { WellbeingTrend } from '../../components/progress/WellbeingTrend';
import { LabTrendChart } from '../../components/progress/LabTrendChart';
import { useProgressEntries, useTodayEntry } from '../../hooks/useProgress';

const KEY_MARKERS = [
  { markerName: 'Ferritin', displayName: 'Ferritin', unit: 'ng/mL', optimalMin: 50, optimalMax: 150 },
  { markerName: 'Vitamin D', displayName: 'Vitamin D', unit: 'ng/mL', optimalMin: 50, optimalMax: 80 },
  { markerName: 'TSH', displayName: 'TSH', unit: 'mIU/L', optimalMin: 0.5, optimalMax: 2.0 },
  { markerName: 'Hemoglobin A1c', displayName: 'HbA1c', unit: '%', optimalMin: 4.6, optimalMax: 5.5 },
  { markerName: 'Vitamin B12', displayName: 'Vitamin B12', unit: 'pg/mL', optimalMin: 600, optimalMax: 900 },
  { markerName: 'Magnesium', displayName: 'Magnesium', unit: 'mg/dL', optimalMin: 2.0, optimalMax: 2.5 },
];

const TABS = [
  { id: 'checkin', label: 'Daily Check-In', icon: 'edit_note' },
  { id: 'trends', label: 'Trends', icon: 'trending_up' },
  { id: 'labs', label: 'Lab Trends', icon: 'biotech' },
] as const;

type Tab = typeof TABS[number]['id'];

export const ProgressTracking = () => {
  const [activeTab, setActiveTab] = useState<Tab>('checkin');
  const { data: entries = [] } = useProgressEntries(90);
  const { data: todayEntry } = useTodayEntry();

  // Today's date — shown in the header so users always see what calendar
  // day the app is treating as "today". Avoids timezone confusion.
  const todayLine = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <AppShell pageTitle="Progress">
      {/* Today's date pill — clarifies which day all logging targets */}
      <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone -mb-4">{todayLine}</p>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <AdherenceHero />

      {/* ── Header strip with streak + today badge ───────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <StreakCounter entries={entries} />
          {todayEntry && (
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-primary-container/10 border border-primary-container/20 rounded-[6px]">
              <span className="material-symbols-outlined text-primary-container text-[16px]">check_circle</span>
              <span className="text-precision text-[0.68rem] text-primary-container font-bold uppercase tracking-wider">Checked in today</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex border-b border-outline-variant/10 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-precision text-[0.68rem] font-bold tracking-wider uppercase border-b-2 transition-all flex-shrink-0 ${activeTab === tab.id ? 'border-primary-container text-primary-container' : 'border-transparent text-clinical-stone hover:text-clinical-charcoal'}`}>
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      {!entries ? (
        <div className="space-y-4 animate-pulse">{[1, 2].map(i => <div key={i} className="bg-clinical-white rounded-[10px] border-t-[3px] border-[#E8E3DB] p-6"><div className="h-4 bg-[#E8E3DB] rounded w-1/3 mb-3" /><div className="h-24 bg-[#E8E3DB] rounded" /></div>)}</div>
      ) : (
        <>
          {activeTab === 'checkin' && (
            <div className="space-y-6">
              <CheckInForm todayEntry={todayEntry ?? null} onSaved={() => setActiveTab('trends')} />
              {/* Supplement check-off — directly under check-in so users
                  finish wellbeing log + supplement log in one motion. Reuses
                  the dashboard component (single source of truth). */}
              <SupplementChecklist />
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="space-y-6">
              {entries.length === 0 ? (
                <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
                  <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">trending_up</span>
                  <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3">No check-ins yet</p>
                  <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto">Log your first daily check-in to start tracking your wellbeing trends.</p>
                  <button onClick={() => setActiveTab('checkin')} className="px-6 py-3 bg-primary-container text-white text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity" style={{ borderRadius: '6px' }}>Log Today's Check-In</button>
                </div>
              ) : (
                <><ComplianceCalendar entries={entries} /><WellbeingTrend entries={entries} /></>
              )}
            </div>
          )}

          {activeTab === 'labs' && (
            <div className="space-y-4">
              <div className="bg-[#131313] rounded-[10px] p-4">
                <p className="text-body text-on-surface text-sm leading-relaxed">Lab trends require at least 2 completed lab uploads. Only markers found in your panels are shown. Upload additional labs in <a href="/labs" className="text-[#D4A574] hover:underline">Lab Analysis</a>.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {KEY_MARKERS.map(m => <LabTrendChart key={m.markerName} {...m} />)}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};
