// src/components/paywall/PaywallGate.tsx
// Wraps any feature behind a paywall. If the user is paid (pro or comp), shows
// the children unchanged. Otherwise shows a clean upgrade card with redeem-code escape.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../../lib/subscription';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';

interface Props {
  feature: string;          // "Wellness Plan", "Doctor Prep", etc.
  description?: string;     // 1-line value prop
  children: React.ReactNode;
}

export const PaywallGate = ({ feature, description, children }: Props) => {
  const { isPro } = useSubscription();
  if (isPro) return <>{children}</>;
  return <PaywallCard feature={feature} description={description} />;
};

const PaywallCard = ({ feature, description }: { feature: string; description?: string }) => {
  const [showRedeem, setShowRedeem] = useState(false);
  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card border-t-[3px] border-[#D4A574] p-10 text-center max-w-xl mx-auto">
      <div className="w-14 h-14 bg-[#D4A574]/15 rounded-full flex items-center justify-center mx-auto mb-5">
        <span className="material-symbols-outlined text-[#D4A574] text-2xl">lock</span>
      </div>
      <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Unlock this analysis</p>
      <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">{feature}</p>
      {description && (
        <p className="text-body text-clinical-stone text-sm mb-6 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      <p className="text-authority text-3xl text-clinical-charcoal font-bold mb-1">$19<span className="text-base text-clinical-stone font-normal"> one-time</span></p>
      <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide mb-6">Lifetime access · No subscription</p>
      <div className="flex flex-col gap-3 max-w-sm mx-auto">
        <Link to="/settings?tab=subscription">
          <Button variant="primary" size="lg" icon="auto_awesome" className="w-full">Unlock for $19</Button>
        </Link>

        {/* "Have a code?" — much more visible than the prior 10px monospace
            link. Now a full-width secondary button with brand-gold border so
            it reads as a real, clickable alternative. */}
        <button
          onClick={() => setShowRedeem(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-clinical-cream/60 border border-[#D4A574]/40 hover:border-[#D4A574] hover:bg-clinical-cream transition-colors"
          style={{ borderRadius: '6px' }}
        >
          <span className="material-symbols-outlined text-[#D4A574] text-[18px]">redeem</span>
          <span className="text-body text-clinical-charcoal text-sm font-semibold">
            {showRedeem ? 'Hide code field' : 'Have a code?'}
          </span>
        </button>

        {showRedeem && <RedeemCodeForm compact />}
      </div>
    </div>
  );
};

export const RedeemCodeForm = ({ compact = false }: { compact?: boolean }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fetchProfile = useAuthStore.getState().fetchProfile;

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true); setResult(null);
    try {
      const rpcResult = await Promise.race([
        supabase.rpc('redeem_comp_code', { p_code: code.trim() }),
        new Promise<{ data: null; error: { message: string } }>(resolve =>
          setTimeout(() => resolve({ data: null, error: { message: 'Network is slow — try again in a moment.' } }), 10_000)),
      ]);
      const { data, error } = rpcResult as any;
      if (error) {
        setResult({ ok: false, msg: error.message });
      } else if (data?.ok) {
        setResult({ ok: true, msg: 'Code redeemed! Pro access unlocked.' });
        // ── Optimistic profile update ──
        // Don't wait for fetchProfile to round-trip — we KNOW the new tier
        // server-side. Patch the zustand profile NOW so isPro flips to true
        // immediately and every gated component re-renders Pro features
        // without a manual refresh. fetchProfile still runs in the background
        // for eventual full sync, but the UI doesn't depend on it.
        const auth = useAuthStore.getState();
        if (auth.profile) {
          useAuthStore.setState({
            profile: {
              ...auth.profile,
              subscriptionTier: (data.tier ?? 'comp') as any,
              subscriptionStatus: 'active',
              subscriptionExpiresAt: data.expires_at ?? null,
              compCodeUsed: code.trim().toUpperCase(),
              // Code redemption grants +1 upload credit (parity with $19
              // unlock). The DB-side RPC already did this; we patch local
              // state so the upload button is unlocked instantly without
              // waiting for fetchProfile.
              uploadCredits: (auth.profile.uploadCredits ?? 0) + 1,
            },
          });
        }
        // Background sync — don't await
        fetchProfile().catch(() => {});
        setCode('');
      } else {
        setResult({ ok: false, msg: data?.error ?? 'Could not redeem code' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: String(e?.message ?? e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${compact ? '' : 'max-w-md'}`}>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          style={{ borderRadius: '4px' }}
          className="flex-1 bg-clinical-cream border border-outline-variant/20 px-3 py-2.5 text-clinical-charcoal text-precision text-sm tracking-widest font-bold focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none"
          onKeyDown={e => { if (e.key === 'Enter') handleRedeem(); }}
        />
        <Button variant="secondary" size="md" loading={loading} onClick={handleRedeem} disabled={!code.trim()}>Redeem</Button>
      </div>
      {result && (
        <p className={`text-precision text-[0.65rem] font-bold tracking-wide ${result.ok ? 'text-[#2A9D8F]' : 'text-[#C94F4F]'}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
};
