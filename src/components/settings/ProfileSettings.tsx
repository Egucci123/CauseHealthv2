// src/components/settings/ProfileSettings.tsx
import { useState, useEffect } from 'react';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile';
import { useAuthStore } from '../../store/authStore';
// supabase import removed — sign out now goes through authStore

const GOALS = ['Weight Management', 'Energy Optimization', 'Autoimmune Support', 'Gut Health', 'Hormonal Balance', 'Cardiovascular Health', 'Cognitive Performance', 'Longevity', 'Athletic Recovery', 'Stress & Anxiety', 'Sleep Quality', 'Blood Sugar Control'];

// Pregnancy status options shown to biological-female users. Order
// matches the onboarding Step 1 dropdown so the experience is
// consistent across surfaces.
const PREGNANCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'not_pregnant',       label: 'Not pregnant, not trying' },
  { value: 'pregnant',           label: 'Currently pregnant' },
  { value: 'trying',             label: 'Trying to conceive (or could be pregnant)' },
  { value: 'breastfeeding',      label: 'Breastfeeding / postpartum' },
  { value: 'prefer_not_to_say',  label: 'Prefer not to say' },
];

export const ProfileSettings = () => {
  const { data: profile} = useProfile();
  const update = useUpdateProfile();
  const user = useAuthStore(s => s.user);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [pregnancyStatus, setPregnancyStatus] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setDob(profile.date_of_birth ?? '');
      setPregnancyStatus(profile.pregnancy_status ?? '');
      setGoals(profile.primary_goals ?? []);
    }
  }, [profile]);

  const toggleGoal = (g: string) => setGoals(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);

  const isFemale = (profile?.sex ?? '').toString().toLowerCase() === 'female';

  const handleSave = async () => {
    // Only write pregnancy_status when the user can answer it — female
    // users only. The DB trigger derives is_pregnant from this column,
    // so saving here automatically updates the rule-engine input on the
    // next lab analysis (clinical_facts_cache is keyed on a hash that
    // includes is_pregnant, so the cache invalidates correctly).
    const updates: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dob || null,
      primary_goals: goals,
    };
    if (isFemale && pregnancyStatus) {
      updates.pregnancy_status = pregnancyStatus;
    }
    await update.mutateAsync(updates);
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  if (!profile) return <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-primary-container shadow-card p-6 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-12 bg-[#E8E3DB] rounded mb-4" />)}</div>;

  return (
    <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-primary-container shadow-card p-6">
      <div className="mb-6"><p className="text-precision text-[0.68rem] uppercase tracking-widest text-primary-container mb-0.5">Account</p><h3 className="text-authority text-xl text-clinical-charcoal">Profile Settings</h3></div>

      <div className="mb-5"><label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-1.5">Email</label><div className="bg-clinical-cream rounded-lg px-3 py-2.5 text-body text-sm text-clinical-stone">{user?.email}</div></div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div><label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-1.5">First Name</label><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" className="w-full bg-clinical-cream rounded-lg px-3 py-2.5 text-body text-sm text-clinical-charcoal focus:outline-none focus:ring-1 focus:ring-primary-container/30 placeholder:text-clinical-stone/30" /></div>
        <div><label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-1.5">Last Name</label><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" className="w-full bg-clinical-cream rounded-lg px-3 py-2.5 text-body text-sm text-clinical-charcoal focus:outline-none focus:ring-1 focus:ring-primary-container/30 placeholder:text-clinical-stone/30" /></div>
      </div>

      <div className="mb-5"><label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-1.5">Date of Birth</label><input type="date" value={dob} onChange={e => setDob(e.target.value)} className="w-full bg-clinical-cream rounded-lg px-3 py-2.5 text-body text-sm text-clinical-charcoal focus:outline-none focus:ring-1 focus:ring-primary-container/30" /></div>

      {/* Pregnancy status — biological-female users only. Drives the
          β-hCG-first ordering, pregnancy-safe supplement filters, and
          hormone-panel interpretation. Saving here updates is_pregnant
          via the DB trigger; the next lab analysis flows through the
          new rule-engine state automatically. */}
      {isFemale && (
        <div className="mb-6 border-b border-outline-variant/10 pb-6">
          <label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-1.5">Pregnancy Status</label>
          <select
            value={pregnancyStatus}
            onChange={e => setPregnancyStatus(e.target.value)}
            className="w-full bg-clinical-cream rounded-lg px-3 py-2.5 text-body text-sm text-clinical-charcoal focus:outline-none focus:ring-1 focus:ring-primary-container/30"
          >
            <option value="">Select…</option>
            {PREGNANCY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-precision text-[0.6rem] text-clinical-stone/70 mt-2 leading-relaxed">
            Drives hormone-panel interpretation and keeps supplement recommendations pregnancy-safe. Update anytime; your next analysis will reflect the change.
          </p>
        </div>
      )}
      {!isFemale && <div className="mb-6 border-b border-outline-variant/10 pb-6" />}

      <div className="mb-6"><label className="text-precision text-[0.65rem] uppercase tracking-widest text-clinical-stone block mb-3">Health Goals</label>
        <div className="flex flex-wrap gap-2">{GOALS.map(g => <button key={g} onClick={() => toggleGoal(g)} className={`text-precision text-[0.65rem] uppercase tracking-wider px-3 py-1.5 transition-colors ${goals.includes(g) ? 'bg-primary-container text-white' : 'bg-clinical-cream text-clinical-stone hover:bg-[#E8E3DB]'}`} style={{ borderRadius: '2px' }}>{g}</button>)}</div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={update.isPending} className="bg-primary-container text-white text-sm font-semibold px-6 py-2.5 hover:bg-[#2D6A4F] transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{update.isPending ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}</button>
        <button onClick={() => useAuthStore.getState().signOut()} className="text-body text-sm text-[#C94F4F] hover:text-[#C94F4F]/80 transition-colors">Sign Out</button>
      </div>
    </div>
  );
};
