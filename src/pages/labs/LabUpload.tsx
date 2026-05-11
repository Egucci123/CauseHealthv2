// src/pages/labs/LabUpload.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DropZone } from '../../components/labs/DropZone';
import { ExtractionProgress } from '../../components/labs/ExtractionProgress';
import { ReviewTable } from '../../components/labs/ReviewTable';
import { ManualEntry } from '../../components/labs/ManualEntry';
import { useLabUploadStore } from '../../store/labUploadStore';
import { useAuthStore } from '../../store/authStore';
import { logEvent } from '../../lib/clientLog';
import { PaywallGate } from '../../components/paywall/PaywallGate';
import { supabase } from '../../lib/supabase';

export const LabUpload = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const { phase, progress, statusMessage, drawId, extraction, errorMessage, completedDrawId, paymentTier, reset, enterManual, startUpload, confirmAndAnalyze, resumeFromDraw } = useLabUploadStore();

  // Returning from a $5 upload-pack Stripe checkout. Optimistic +1 credit so
  // the user can immediately upload again without waiting on the webhook,
  // then background-refetch the profile to confirm the real balance.
  // Plus: auto-resume the upload they had pending pre-paywall (files stashed
  // in IndexedDB before Stripe redirect — see lib/pendingUpload.ts).
  useEffect(() => {
    const result = searchParams.get('upload');
    if (result === 'success') {
      const auth = useAuthStore.getState();
      if (auth.profile) {
        useAuthStore.setState({
          profile: {
            ...auth.profile,
            uploadCredits: (auth.profile.uploadCredits ?? 0) + 1,
          },
        });
      }
      // Background-confirm — webhook may lag a few seconds.
      const fetchWithRetry = async () => {
        const delays = [0, 2000, 5000, 10000];
        for (const d of delays) {
          if (d > 0) await new Promise(r => setTimeout(r, d));
          try { await useAuthStore.getState().fetchProfile(); } catch {}
        }
      };
      // Belt-and-suspenders: also call verify-payment with the session_id
      // so we DON'T depend on the Stripe webhook firing. If the webhook is
      // misconfigured, this still grants the credit by hitting Stripe's API
      // directly and confirming the session is paid.
      const sessionId = searchParams.get('session_id');
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
            console.log('[LabUpload] verify-payment:', j);
            await useAuthStore.getState().fetchProfile();
          } else {
            console.warn('[LabUpload] verify-payment HTTP', res.status);
          }
        } catch (e) {
          console.warn('[LabUpload] verify-payment failed:', e);
        }
      };
      fetchWithRetry();
      verifyDirect();

      // Auto-resume the stashed upload — fire-and-forget so we don't block
      // the URL cleanup. If files are present in IndexedDB, kick off the
      // upload with them and clear the stash. If not (user clicked Cancel
      // on Stripe, or stash expired), we just land on the normal upload UI.
      (async () => {
        if (!user?.id) return;
        try {
          const { loadPendingUpload, clearPendingUpload } = await import('../../lib/pendingUpload');
          const files = await loadPendingUpload(user.id);
          if (files && files.length > 0) {
            logEvent('labupload_auto_resume_after_stripe', { file_count: files.length });
            await clearPendingUpload(user.id);
            // Small delay so the optimistic +1 credit is in zustand before
            // startUpload reads it (otherwise it'd hit the gate again).
            setTimeout(() => {
              const store = useLabUploadStore.getState();
              store.reset();
              store.startUpload(files, user.id);
            }, 100);
          }
        } catch (e) { console.warn('[LabUpload] auto-resume failed:', e); }
      })();

      setSearchParams({});
    } else if (result === 'canceled') {
      // User backed out of Stripe — files still in IndexedDB, they can
      // click Upload again and it'll try the same paywall flow OR they
      // can pick different files. Don't clear the stash on cancel —
      // the 1-hour TTL handles that.
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, user?.id]);

  const isActive = ['uploading', 'extracting', 'analyzing'].includes(phase);

  // Log every phase change so I can see the upload state machine in real time
  useEffect(() => {
    logEvent('labupload_phase', { phase, progress, statusMessage, drawId, completedDrawId });
  }, [phase, progress, statusMessage, drawId, completedDrawId]);

  // On mount, check for any in-flight draw and hydrate state from DB.
  // Fixes the "navigated away during review → came back to nothing" bug.
  useEffect(() => {
    if (!user) return;
    // STALE STATE GUARD: zustand store state persists at module level. If
    // the page mounts with an in-progress phase (uploading/extracting/
    // analyzing) but isRunning is false, that's STALE state from a stuck
    // attempt. The actual upload isn't running anymore. Reset to idle and
    // let resumeFromDraw decide what to show based on DB state.
    const { isRunning, phase: currentPhase } = useLabUploadStore.getState();
    const inProgressPhase = ['uploading', 'extracting', 'analyzing'].includes(currentPhase);
    if (inProgressPhase && !isRunning) {
      logEvent('labupload_stale_state_reset', { stalePhase: currentPhase });
      reset();
      // After reset, useEffect will re-fire with phase='idle' and call resume
      return;
    }
    if (phase === 'idle') {
      logEvent('labupload_resume_call', { userId: user.id });
      resumeFromDraw(user.id);
    }
  }, [user, phase, resumeFromDraw, reset]);

  useEffect(() => {
    if (phase === 'complete' && completedDrawId) {
      logEvent('labupload_redirect_to_detail', { completedDrawId });
      qc.invalidateQueries({ queryKey: ['labDraws'] });
      qc.invalidateQueries({ queryKey: ['latestLabDraw'] });
      qc.invalidateQueries({ queryKey: ['labValues'] });
      qc.invalidateQueries({ queryKey: ['priorityAlerts'] });
      qc.invalidateQueries({ queryKey: ['wellness-plan'] });
      qc.invalidateQueries({ queryKey: ['activePlan'] });
      qc.invalidateQueries({ queryKey: ['lab-detail'] });
      // Navigate IMMEDIATELY, no 800ms delay. The yellow 'Analysis complete'
      // intermediate screen is unwanted UX. Reset state on the way out so
      // any later visit to /labs/upload starts clean (no phantom complete
      // state that re-triggers this redirect).
      const targetId = completedDrawId;
      reset();
      navigate(`/labs/${targetId}`, { replace: true });
    }
  }, [phase, completedDrawId, navigate, qc, reset]);

  const handleUpload = (files: File[]) => {
    logEvent('labupload_handle_called', {
      file_count: files.length,
      has_user: !!user,
      user_id: user?.id ?? null,
    });
    if (!user) {
      logEvent('labupload_handle_blocked_no_user', {});
      return;
    }
    startUpload(files, user.id);
  };

  const handleConfirm = (values: Parameters<typeof confirmAndAnalyze>[0], overrides: Parameters<typeof confirmAndAnalyze>[1]) => {
    if (!user) return;
    confirmAndAnalyze(values, overrides, user.id);
  };

  return (
    <AppShell pageTitle="Upload Lab Results">
      <SectionHeader title="Upload Lab Report" description="Upload your bloodwork PDF to get root cause analysis, optimal range interpretation, and personalized recommendations." />

      <PaywallGate
        feature="Lab Upload"
        description="Upload your bloodwork to get full AI analysis, patterns-to-discuss differential, drug interaction screening, doctor prep, and a personalized wellness plan."
      >
      <div className="max-w-2xl">
        {phase === 'idle' && (
          <div className="space-y-8">
            <DropZone onFilesSelect={handleUpload} />
            <div className="text-center">
              <p className="text-body text-clinical-stone text-sm mb-2">Don't have a PDF? No problem.</p>
              <button onClick={enterManual} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Enter Values Manually</button>
            </div>
          </div>
        )}

        {isActive && (
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container">
            <ExtractionProgress phase={phase} message={statusMessage} progress={progress} />
            <p className="text-precision text-[0.6rem] text-clinical-stone text-center pb-4">You can navigate away — processing continues in the background.</p>
          </div>
        )}

        {/* phase === 'complete' is handled by the useEffect that navigates
            immediately to /labs/:drawId — no intermediate yellow square */}

        {phase === 'reviewing' && extraction && (
          <ReviewTable values={extraction.values} drawDate={extraction.draw_date} labName={extraction.lab_name}
            onConfirm={(values, overrides) => handleConfirm(values, overrides)} onStartOver={reset} loading={false} />
        )}

        {/* needs_payment phase — store sets this when credits=0. Surfaces a
            clear paywall card with an upload-pack ($5) or unlock ($19)
            checkout, so the user is never staring at a blank screen. */}
        {phase === 'needs_payment' && (
          <NeedsPaymentCard tier={paymentTier ?? 'unlock'} onCancel={() => { reset(); navigate('/dashboard'); }} />
        )}

        {phase === 'manual' && (
          <div className="space-y-6">
            <div className="bg-[#E8922A]/10 border border-[#E8922A]/30 rounded-lg p-5 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#E8922A] text-[18px] flex-shrink-0 mt-0.5">info</span>
              <div>
                <p className="text-body text-clinical-charcoal font-medium text-sm">{statusMessage}</p>
                <p className="text-body text-clinical-stone text-xs mt-0.5">Enter your values below — we'll analyze them the same way.</p>
              </div>
            </div>
            <ManualEntry drawId={drawId} onComplete={(id) => navigate(`/labs/${id}`)} />
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button onClick={reset} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Try a Different File</button>
              <button
                onClick={() => { reset(); navigate('/dashboard'); }}
                className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors"
              >
                Cancel — Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-6">
            <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-[10px] p-6">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[#C94F4F] text-[20px] flex-shrink-0">error</span>
                <div><p className="text-body text-clinical-charcoal font-semibold mb-1">Something went wrong</p><p className="text-body text-clinical-stone text-sm">{errorMessage}</p></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={reset} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Try Again</button>
              <span className="text-clinical-stone">·</span>
              <button onClick={reset} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors">Enter Manually</button>
              <span className="text-clinical-stone">·</span>
              <button
                onClick={() => { reset(); navigate('/dashboard'); }}
                className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
      </PaywallGate>
    </AppShell>
  );
};

// ── needs_payment paywall card ──────────────────────────────────────────
// Renders when labUploadStore sets phase='needs_payment' (credit balance
// is 0 and user needs to pay). Different from PaywallGate (which fires
// pre-unlock) — this fires for unlocked users who used their credit and
// need a $5 upload-pack to add another draw.
const NeedsPaymentCard = ({ tier, onCancel }: { tier: 'unlock' | 'upload_pack'; onCancel: () => void }) => {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUnlock = tier === 'unlock';
  const price = isUnlock ? '$19' : '$5';
  const headline = isUnlock ? 'Unlock CauseHealth' : 'Add a lab-upload credit';
  const description = isUnlock
    ? "One-time $19 unlocks your account and your first lab analysis. No subscription."
    : "Each new lab draw is $5 one-time. Append-to-existing-draw is always free.";

  const launch = async () => {
    setLaunching(true);
    setError(null);
    try {
      const fnName = isUnlock ? 'create-checkout-session' : 'create-upload-checkout';
      const { data, error: invokeErr } = await supabase.functions.invoke(fnName, { body: { origin: window.location.origin } });
      if (invokeErr || !(data as any)?.url) {
        setError((invokeErr as any)?.message ?? 'Could not start checkout.');
        setLaunching(false);
        return;
      }
      window.location.href = (data as any).url;
    } catch (e: any) {
      setError(e?.message ?? 'Could not start checkout.');
      setLaunching(false);
    }
  };

  return (
    <div className="bg-clinical-white rounded-[14px] shadow-card border-t-[3px] border-[#D4A574] p-6 sm:p-10 text-center max-w-xl mx-auto">
      <div className="w-14 h-14 bg-[#D4A574]/15 rounded-full flex items-center justify-center mx-auto mb-5">
        <span className="material-symbols-outlined text-[#D4A574] text-2xl">lock</span>
      </div>
      <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">
        {isUnlock ? 'Unlock to upload' : 'Add upload credit'}
      </p>
      <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">{headline}</p>
      <p className="text-body text-clinical-stone text-sm mb-6 max-w-sm mx-auto leading-relaxed">{description}</p>
      <p className="text-authority text-3xl text-clinical-charcoal font-bold mb-1">
        {price}<span className="text-base text-clinical-stone font-normal"> one-time</span>
      </p>
      <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide mb-6">No subscription</p>
      <div className="flex flex-col gap-3 max-w-sm mx-auto">
        <Button variant="primary" size="lg" icon="auto_awesome" className="w-full" loading={launching} onClick={launch}>
          {isUnlock ? 'Unlock for $19' : 'Add credit for $5'}
        </Button>
        {error && <p className="text-body text-[#C94F4F] text-xs leading-snug">{error}</p>}
        <button onClick={onCancel} className="text-precision text-[0.65rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors py-2">
          Cancel — Back to Dashboard
        </button>
      </div>
    </div>
  );
};
