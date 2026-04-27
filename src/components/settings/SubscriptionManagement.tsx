// src/components/settings/SubscriptionManagement.tsx
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '../../lib/subscription';
import { useCreateCheckoutSession, useCreatePortalSession } from '../../hooks/useProfile';
import { useAuthStore } from '../../store/authStore';
import { RedeemCodeForm } from '../paywall/PaywallGate';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: '#1B4332' }, trialing: { label: 'Trial', color: '#D4A574' },
  past_due: { label: 'Past Due', color: '#C94F4F' }, canceled: { label: 'Canceled', color: '#131313' },
  inactive: { label: 'Free Plan', color: '#131313' }, free: { label: 'Free Plan', color: '#131313' },
};

const FEATURES = ['Unlimited lab uploads & AI analysis', 'Personalized wellness plan', 'Medication depletion checker', 'AI symptom root cause analysis', 'Doctor prep documents with ICD-10 codes', 'Progress tracking & trend charts', 'Supplement compliance heatmap', 'PDF export for all documents'];

export const SubscriptionManagement = () => {
  const { status, isPro, isPastDue, isComp, compCode } = useSubscription();
  const checkout = useCreateCheckoutSession();
  const portal = useCreatePortalSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();

  useEffect(() => {
    const result = searchParams.get('subscription');
    if (result === 'success') { setTimeout(() => { qc.invalidateQueries({ queryKey: ['profile', user?.id] }); setSearchParams({}); }, 2000); }
    else if (result === 'canceled') setSearchParams({});
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
                <div className="flex items-baseline gap-1 mb-1"><span className="text-precision text-2xl font-bold text-clinical-charcoal">$19</span><span className="text-precision text-sm text-clinical-stone">/month</span></div>
                <p className="text-body text-sm text-clinical-stone">CauseHealth Pro</p>
              </div>
            )}
            {isPastDue && <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/20 rounded-lg p-3 mb-4"><p className="text-body text-sm text-[#C94F4F]">Your last payment failed. Update your payment method to keep access.</p></div>}
            {!isComp && (
              <button onClick={() => portal.mutate()} disabled={portal.isPending} className="w-full border border-outline-variant/15 text-clinical-charcoal text-sm font-medium py-2.5 hover:bg-clinical-cream transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{portal.isPending ? 'Redirecting...' : 'Manage Billing'}</button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-body text-sm text-clinical-stone mb-5">You're on the free plan. Upgrade to unlock all AI-powered features.</p>
            <div className="bg-clinical-cream rounded-lg p-4 mb-5">
              <div className="flex items-baseline gap-1 mb-1"><span className="text-precision text-3xl font-bold text-clinical-charcoal">$19</span><span className="text-precision text-sm text-clinical-stone">/month</span></div>
              <p className="text-body text-sm text-clinical-stone">CauseHealth Pro — cancel anytime</p>
            </div>
            <button onClick={() => checkout.mutate()} disabled={checkout.isPending} className="w-full bg-primary-container text-white text-sm font-semibold py-3 hover:bg-[#2D6A4F] transition-colors disabled:opacity-60" style={{ borderRadius: '6px' }}>{checkout.isPending ? 'Redirecting to checkout...' : 'Upgrade to Pro'}</button>
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
