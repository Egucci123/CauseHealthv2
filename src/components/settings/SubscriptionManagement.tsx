// src/components/settings/SubscriptionManagement.tsx
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '../../lib/subscription';
import { useCreateCheckoutSession, useCreatePortalSession } from '../../hooks/useProfile';
import { useAuthStore } from '../../store/authStore';
import { RedeemCodeForm } from '../paywall/PaywallGate';
import { supabase } from '../../lib/supabase';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: '#1B4332' }, trialing: { label: 'Trial', color: '#D4A574' },
  past_due: { label: 'Past Due', color: '#C94F4F' }, canceled: { label: 'Canceled', color: '#131313' },
  inactive: { label: 'Free Plan', color: '#131313' }, free: { label: 'Free Plan', color: '#131313' },
};

const FEATURES = [
  'Optimal-range analysis (not just "normal")',
  'Watch list — watch-list patterns worth discussing earlier',
  'Doctor Prep PDF with ICD-10 codes (insurance-covered tests)',
  'Tests your doctor didn\'t order — root-cause workup',
  'Medication depletion mapping (CoQ10, B12, folate, Mg)',
  'Medication alternatives to discuss with your doctor',
  'Evidence-based supplement stack with alternatives',
  'Causal cascade — root → driven state → symptoms',
  'Cross-specialty synthesis (endo + cardio + gyn + GI)',
  'Educational expectations at 12-week retest',
  'Biological + Cardiometabolic Age scoring',
  'AI chat that reads your specific labs',
  'Lifetime access to every analysis you buy',
  'PDF export for all documents',
];

export const SubscriptionManagement = () => {
  const { status, isPro, isPastDue, isComp, compCode } = useSubscription();
  const checkout = useCreateCheckoutSession();
  const portal = useCreatePortalSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();

  useEffect(() => {
    const result = searchParams.get('subscription');
    if (result === 'success') {
      // ── OPTIMISTIC PRO UNLOCK ──
      // Stripe redirects back the moment payment confirms in the browser,
      // but the server-side webhook (which actually flips the DB) can lag
      // by 1–10s. Without optimistic state, the user lands on this page
      // still showing "Free Plan" and has to refresh — exactly the bug
      // Evan hit. We KNOW the user just paid (they came back with
      // ?subscription=success from a Stripe-hosted checkout), so flip the
      // zustand profile to Pro right now. Pro features unlock instantly.
      const auth = useAuthStore.getState();
      if (auth.profile) {
        useAuthStore.setState({
          profile: {
            ...auth.profile,
            subscriptionTier: 'pro',
            subscriptionStatus: 'active',
            // $19 unlock grants +1 upload credit (their first lab draw upload).
            // The webhook will set this server-side too — this is just the
            // optimistic patch so the upload button is unblocked the instant
            // they land back on the app.
            uploadCredits: (auth.profile.uploadCredits ?? 0) + 1,
            unlockPurchasedAt: auth.profile.unlockPurchasedAt ?? new Date().toISOString(),
          },
        });
      }
      // Belt-and-suspenders confirmation. We try two paths in parallel and
      // whichever wins, the user is unlocked:
      //
      //   1. Webhook path (canonical) — re-fetch the profile a few times
      //      until the Stripe webhook has updated the DB.
      //   2. Verify-payment path — call our verify-payment edge function
      //      with the session_id from the URL. It hits Stripe's API
      //      directly using the secret key, confirms the session is paid,
      //      and grants Pro + 1 credit even if the webhook never fires.
      //
      // The verify-payment path is the safety net for the bug where the
      // Stripe webhook destination is misconfigured / paused — without it,
      // a paying user would land here optimistically marked Pro but the
      // server-side state stays Free until manual intervention.
      const sessionId = searchParams.get('session_id');
      const fetchWithRetry = async () => {
        const delays = [0, 2000, 5000, 10000];
        for (const d of delays) {
          if (d > 0) await new Promise(r => setTimeout(r, d));
          try { await useAuthStore.getState().fetchProfile(); } catch {}
          const p = useAuthStore.getState().profile;
          if (p?.subscriptionTier === 'pro' && p?.subscriptionStatus === 'active') break;
        }
        qc.invalidateQueries({ queryKey: ['profile', user?.id] });
      };
      const verifyDirect = async () => {
        if (!sessionId) return;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) return;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ session_id: sessionId }),
            },
          );
          if (res.ok) {
            const j = await res.json();
            console.log('[SubscriptionManagement] verify-payment:', j);
            // After grant, refresh the profile so the UI shows the
            // server-confirmed state (period_end, customer_id, etc.).
            await useAuthStore.getState().fetchProfile();
            qc.invalidateQueries({ queryKey: ['profile', user?.id] });
          } else {
            console.warn('[SubscriptionManagement] verify-payment HTTP', res.status);
          }
        } catch (e) {
          console.warn('[SubscriptionManagement] verify-payment failed:', e);
        }
      };
      fetchWithRetry();
      verifyDirect();
      setSearchParams({});
    } else if (result === 'canceled') {
      setSearchParams({});
    }
  }, [searchParams, qc, user?.id, setSearchParams]);

  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.free;

  return (
    <div className="space-y-4">
      <div className="bg-clinical-white rounded-[10px] shadow-card p-6" style={{ borderTop: `3px solid ${statusInfo.color}` }}>
        <div className="flex items-start justify-between mb-6">
          <div><p className="text-precision text-[0.68rem] uppercase tracking-widest text-clinical-stone mb-0.5">Billing</p><h3 className="text-authority text-xl text-clinical-charcoal">Subscription</h3></div>
          <span className="text-precision text-[0.65rem] uppercase tracking-wider px-2.5 py-1" style={{ background: `${statusInfo.color}15`, color: statusInfo.color, borderRadius: '2px' }}>{statusInfo.label}</span>
        </div>

        {isPro ? (
          <div>
            {isComp ? (
              <div className="bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-lg p-4 mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[#D4A574] text-[18px]">redeem</span>
                  <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#D4A574]">Comp Access</p>
                </div>
                <p className="text-body text-clinical-charcoal text-sm font-semibold">Pro features unlocked via code{compCode ? ` (${compCode})` : ''}.</p>
                <p className="text-body text-clinical-stone text-xs mt-1">No card on file. Enjoy free access.</p>
              </div>
            ) : (
              <div className="bg-clinical-cream rounded-lg p-4 mb-5">
                <div className="flex items-baseline gap-1 mb-1"><span className="text-precision text-2xl font-bold text-clinical-charcoal">$19</span><span className="text-precision text-sm text-clinical-stone">per analysis</span></div>
                <p className="text-body text-sm text-clinical-stone">Lifetime access — no subscription</p>
              </div>
            )}
            {isPastDue && <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/20 rounded-lg p-3 mb-4"><p className="text-body text-sm text-[#C94F4F]">Your last payment failed. Update your payment method to keep access.</p></div>}
            {!isComp && (
              <button onClick={() => portal.mutate()} disabled={portal.isPending} className="w-full border border-outline-variant/15 text-clinical-charcoal text-sm font-medium py-2.5 hover:bg-clinical-cream transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{portal.isPending ? 'Redirecting...' : 'Manage Billing'}</button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-body text-sm text-clinical-stone mb-5">Pay once per lab analysis. No monthly subscription. Lifetime access to whatever you unlock.</p>
            <div className="bg-clinical-cream rounded-lg p-4 mb-5">
              <div className="flex items-baseline gap-1 mb-1"><span className="text-precision text-3xl font-bold text-clinical-charcoal">$19</span><span className="text-precision text-sm text-clinical-stone">one-time</span></div>
              <p className="text-body text-sm text-clinical-stone">Per lab analysis · Lifetime access</p>
            </div>
            <button onClick={() => checkout.mutate()} disabled={checkout.isPending} className="w-full bg-primary-container text-white text-sm font-semibold py-3 hover:bg-[#2D6A4F] transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{checkout.isPending ? 'Redirecting to checkout...' : 'Unlock for $19'}</button>
            {checkout.isError && (
              <div className="mt-3 bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-lg p-3">
                <p className="text-body text-[#C94F4F] text-sm">{(checkout.error as Error)?.message ?? 'Checkout failed. Please try again.'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {!isPro && (
        <>
          <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-[#D4A574] shadow-card p-6">
            <p className="text-precision text-[0.68rem] uppercase tracking-widest text-[#D4A574] mb-4">What's Included</p>
            <div className="space-y-3">{FEATURES.map(f => (
              <div key={f} className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container text-[14px] flex-shrink-0">check_circle</span>
                <span className="text-body text-sm text-clinical-charcoal">{f}</span>
              </div>
            ))}</div>
          </div>

          {/* Redeem code — for friends/family/influencer keys */}
          <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-primary-container shadow-card p-6">
            <p className="text-precision text-[0.68rem] uppercase tracking-widest text-primary-container mb-1">Have a code?</p>
            <p className="text-body text-sm text-clinical-stone mb-4">Enter a master code to unlock Pro access without payment.</p>
            <RedeemCodeForm />
          </div>
        </>
      )}
    </div>
  );
};
