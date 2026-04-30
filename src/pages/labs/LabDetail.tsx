// src/pages/labs/LabDetail.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AppShell } from '../../components/layout/AppShell';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Button } from '../../components/ui/Button';
import { LabMarkerCard } from '../../components/labs/LabMarkerCard';
import { CriticalBanner } from '../../components/labs/CriticalBanner';
import { TrajectoryStrip } from '../../components/labs/TrajectoryStrip';
import { detectCriticalFindings } from '../../lib/criticalFindings';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../../lib/subscription';
import { logEvent } from '../../lib/clientLog';

const CATEGORY_ORDER = ['liver', 'cardiovascular', 'metabolic', 'kidney', 'thyroid', 'hormones', 'nutrients', 'cbc', 'inflammation', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  liver: 'Liver Function', cardiovascular: 'Cardiovascular', metabolic: 'Metabolic', kidney: 'Kidney Function',
  thyroid: 'Thyroid', hormones: 'Hormones', nutrients: 'Nutrients & Vitamins', cbc: 'Complete Blood Count',
  inflammation: 'Inflammation', other: 'Other',
};

export const LabDetail = () => {
  const { drawId } = useParams<{ drawId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'all' | 'urgent' | 'monitor'>('all');
  const qc = useQueryClient();
  const { isPro } = useSubscription();

  // ── Retry-lock state — declared early so the mutation can read setRetriedAt ─
  // The actual retryLocked / polling logic lives below the useQuery call
  // because it depends on `data` and the query state.
  const [retriedAt, setRetriedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!retriedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retriedAt]);

  const retryAnalysis = useMutation({
    mutationFn: async () => {
      if (!drawId || !user) throw new Error('Missing context');
      setRetriedAt(Date.now());
      await supabase.from('lab_draws').update({ processing_status: 'processing', analysis_result: null }).eq('id', drawId);
      // Get fresh JWT and fire the function. We DON'T await the full response —
      // the function takes ~30s and blocking the UI on it is bad UX. Realtime
      // + 2s poll on the page will detect completion and refresh automatically.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ drawId, userId: user.id }),
        keepalive: true,
      }).catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-detail', drawId] });
      qc.invalidateQueries({ queryKey: ['labDraws'] });
    },
  });

  // Log LabDetail mount + drawId so I can trace 'wrong page on come-back' bugs
  useEffect(() => {
    logEvent('labdetail_mount', { drawId });
    return () => { logEvent('labdetail_unmount', { drawId }); };
  }, [drawId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lab-detail', drawId], enabled: !!drawId && !!user,
    queryFn: async () => {
      if (!drawId || !user) return null;
      const [drawRes, valuesRes] = await Promise.all([
        supabase.from('lab_draws').select('*').eq('id', drawId).eq('user_id', user.id).single(),
        supabase.from('lab_values').select('*').eq('draw_id', drawId).order('marker_category'),
      ]);
      if (drawRes.error || !drawRes.data) {
        logEvent('labdetail_fetch_no_draw', { drawId, error: drawRes.error?.message });
        throw new Error('Draw not found');
      }
      logEvent('labdetail_fetch_ok', {
        drawId,
        status: drawRes.data.processing_status,
        has_analysis: !!drawRes.data.analysis_result,
        values_count: valuesRes.data?.length ?? 0,
      });
      return { draw: drawRes.data, values: valuesRes.data ?? [], analysis: drawRes.data.analysis_result };
    },
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    // Poll fast (2s) while processing — analysis transitions happen mid-poll
    // and a 5s gap was leaving the UI on stale data even after completion.
    refetchInterval: (query) => {
      const status = query.state.data?.draw?.processing_status;
      return status === 'processing' ? 2000 : false;
    },
    // Keep polling even when the tab is in the background. Without this, a
    // user who switches tabs mid-analysis (very common — they're killing
    // 30 seconds doing something else) returns to a stale 'processing'
    // page because the browser throttled setInterval. Realtime subscription
    // is supposed to catch this but isn't 100% reliable in practice.
    refetchIntervalInBackground: true,
  });

  // ── Retry-lock release logic + active polling (depends on `data`) ─────
  // Hold "Analyzing…" UI from click until we observe a fresh complete state
  // in the cache. Without the dataUpdatedAt > retriedAt check, the lock
  // releases instantly because the cache still shows the OLD complete state.
  const queryState = qc.getQueryState(['lab-detail', drawId]);
  const dataUpdatedAt = queryState?.dataUpdatedAt ?? 0;
  const status = data?.draw?.processing_status;
  const retryLocked = (() => {
    if (!retriedAt) return false;
    const elapsed = now - retriedAt;
    if (elapsed >= 60_000) return false;                                // hard 60s ceiling
    if (
      dataUpdatedAt > retriedAt &&
      status === 'complete' &&
      data?.analysis
    ) {
      return false;
    }
    return true;
  })();

  // Active 3s polling during retry-lock — covers the gap before the native
  // refetchInterval kicks in (which only fires while cache shows 'processing').
  useEffect(() => {
    if (!retryLocked) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['lab-detail', drawId] });
    }, 3000);
    return () => clearInterval(t);
  }, [retryLocked, qc, drawId]);

  // Log every render-state change — what's actually on screen for this drawId.
  // Catches "URL says /labs/abc but the page is showing X" by capturing the
  // intended view state. Combined with page_snapshot (DOM heading) from
  // RouteLogger, I can compare intended vs rendered.
  useEffect(() => {
    if (isLoading) { logEvent('labdetail_render', { state: 'skeleton', drawId }); return; }
    if (isError) { logEvent('labdetail_render', { state: 'error', drawId }); return; }
    if (!data) { logEvent('labdetail_render', { state: 'no_data', drawId }); return; }
    const status = data.draw.processing_status;
    const renderState =
      status === 'processing' ? 'processing_analyzing'
      : status === 'failed' ? 'analysis_failed'
      : !data.analysis ? 'complete_no_analysis'
      : !isPro ? 'complete_locked'
      : 'complete_unlocked';
    logEvent('labdetail_render', {
      state: renderState,
      drawId,
      processing_status: status,
      has_analysis: !!data.analysis,
      values_count: data.values.length,
      is_pro: isPro,
    });
  }, [isLoading, isError, drawId, data, isPro]);

  // ── Realtime subscription: flip the moment the row updates server-side ──
  // Unique channel name per mount — re-using a name returns an existing
  // channel and calling .on() after .subscribe() throws on second mount.
  useEffect(() => {
    if (!drawId || !user) return;
    const uniqueId = `lab-draw-${drawId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const channel = supabase
      .channel(uniqueId)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lab_draws', filter: `id=eq.${drawId}` },
        () => { qc.invalidateQueries({ queryKey: ['lab-detail', drawId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [drawId, user, qc]);

  // ── Auto-trigger analyze-labs on landing if it hasn't run yet ─────────────
  // The previous page (LabUpload's confirmAndAnalyze) does a fire-and-forget
  // trigger but that races with React's redirect — sometimes the request
  // never makes it out. This is the durable fallback: when the user actually
  // lands on /labs/:drawId, if the draw has values + status=processing + no
  // analysis yet, fire analyze-labs from here. Idempotent server-side.
  // Once-per-mount via a ref so we don't spam if the query refetches.
  const triggeredOnMount = useRef(false);
  useEffect(() => {
    if (triggeredOnMount.current) return;
    if (!data || !drawId || !user) return;
    // Mark IMMEDIATELY on first valid data load — regardless of whether we
    // end up firing. This prevents the effect from re-running later when
    // a retry click changes data.draw.processing_status to 'processing' and
    // racing with the retry mutation's analyze-labs call.
    //
    // Previously the flag was only set after the fire, which meant:
    //   1. First mount: status=complete, needsTrigger=false, flag stays false
    //   2. Retry click: status=processing, needsTrigger=true, flag set, FIRES
    // The retry's mutation also fires analyze-labs concurrently → HTTP 500.
    // Now: flag set on first mount, retry click skipped entirely.
    triggeredOnMount.current = true;
    // Belt-and-suspenders: also skip if a retry just happened (< 60s ago).
    if (retryAnalysis.isPending) return;
    if (retriedAt && Date.now() - retriedAt < 60_000) return;
    const needsTrigger =
      data.draw.processing_status === 'processing' &&
      !data.analysis &&
      data.values.length > 0;
    if (!needsTrigger) return;
    logEvent('labdetail_auto_trigger_analyze', {
      drawId,
      values_count: data.values.length,
    });
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ drawId, userId: user.id }),
          // Note: NOT keepalive — we WANT this to be a normal long-lived request
          // since the user is on this page watching for the result. Realtime
          // subscription will flip the UI when the row updates.
        });
        logEvent('labdetail_auto_trigger_returned', { drawId });
      } catch (e: any) {
        logEvent('labdetail_auto_trigger_failed', { drawId, message: e?.message?.slice(0, 200) });
      }
    })();
  }, [data, drawId, user]);

  // Deterministic critical-findings detection — runs in code, never via AI.
  // Visible to free users too (safety > paywall).
  // MUST be before early returns (Rules of Hooks).
  const profile = useAuthStore.getState().profile;
  const ageNum = profile?.dateOfBirth
    ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31_557_600_000)
    : null;
  const criticalFindings = useMemo(
    () => detectCriticalFindings((data?.values ?? []) as any, { age: ageNum, sex: profile?.sex ?? null }),
    [data?.values, ageNum, profile?.sex],
  );

  // Skeleton until query resolves at least once. Realtime + 2s polling
  // refresh data silently in the background after that.
  if (!data) return (
    <AppShell pageTitle="Lab Results">
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-clinical-white rounded-[10px] p-8 animate-pulse border-t-[3px] border-[#E8E3DB]">
            <div className="h-5 bg-[#E8E3DB] rounded-sm w-1/3 mb-4" /><div className="h-12 bg-[#E8E3DB] rounded-sm w-1/4 mb-6" /><div className="h-2 bg-[#E8E3DB] rounded-sm w-full" />
          </div>
        ))}
      </div>
    </AppShell>
  );

  if (isError || (!isLoading && !data)) return (
    <AppShell pageTitle="Lab Results">
      <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#C94F4F] p-12 text-center">
        <span className="material-symbols-outlined text-[#C94F4F] text-5xl mb-4 block">error</span>
        <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Lab report not found</p>
        <p className="text-body text-clinical-stone mb-6">This lab report may have been deleted or doesn't exist.</p>
        <button onClick={() => navigate('/labs')} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Back to Lab History</button>
      </div>
    </AppShell>
  );

  if (!data) return (
    <AppShell pageTitle="Lab Results">
      <div className="text-center py-20">
        <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Lab report not found</p>
        <button onClick={() => navigate('/labs')} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">View All Lab Reports</button>
      </div>
    </AppShell>
  );

  const { draw, values, analysis } = data;

  const grouped = CATEGORY_ORDER.reduce<Record<string, typeof values>>((acc, cat) => {
    const catValues = values.filter((v: any) => v.marker_category === cat);
    if (catValues.length > 0) acc[cat] = catValues;
    return acc;
  }, {});

  // Out-of-range flags include both new (low/high/critical_*) and legacy (deficient/elevated)
  const isOutOfRange = (f: any) => ['low', 'high', 'critical_low', 'critical_high', 'deficient', 'elevated'].includes(f ?? '');
  const isWatch = (f: any) => ['watch', 'suboptimal_low', 'suboptimal_high'].includes(f ?? '');
  const isHealthy = (f: any) => ['healthy', 'optimal'].includes(f ?? '');

  const urgentCount = values.filter((v: any) => isOutOfRange(v.optimal_flag)).length;
  const monitorCount = values.filter((v: any) => isWatch(v.optimal_flag)).length;
  const optimalCount = values.filter((v: any) => isHealthy(v.optimal_flag)).length;

  // Match a lab card to its priority_finding. The AI is supposed to use the
  // EXACT marker name in finding.marker, but older analyses (and the model's
  // occasional drift) paraphrase ("bad cholesterol" instead of "LDL"). This
  // synonym table maps lab marker names to the lay-term phrases the AI tends
  // to use, so historical analyses still pair to the right card.
  const SYNONYMS: Record<string, string[]> = {
    'ldl': ['bad cholesterol', 'low density', 'ldl-c'],
    'hdl': ['good cholesterol', 'high density', 'hdl-c'],
    'vldl': ['very low density', 'vldl cholesterol'],
    'cholesterol, total': ['total cholesterol'],
    'rbc': ['red blood cell', 'red cell count'],
    'wbc': ['white blood cell', 'white cell count'],
    'hgb': ['hemoglobin'],
    'hemoglobin': ['hgb'],
    'hct': ['hematocrit'],
    'hematocrit': ['hct'],
    'plt': ['platelet'],
    'ast': ['sgot', 'liver enzyme ast'],
    'alt': ['sgpt', 'liver enzyme alt'],
    'tsh': ['thyroid stimulating hormone'],
    'a1c': ['hemoglobin a1c', 'hba1c', 'glycated hemoglobin'],
    'b12': ['cobalamin', 'vitamin b12'],
    '25-hydroxy vitamin d': ['25-oh vitamin d', 'vitamin d', 'calcidiol'],
    'cortisol': ['stress hormone'],
    'ferritin': ['iron stores'],
    'hs-crp': ['inflammation marker', 'high sensitivity crp', 'c-reactive protein'],
  };
  const buildSynonymBag = (s: string): string[] => {
    const lc = s.toLowerCase();
    const bag = [lc];
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (lc.includes(key)) bag.push(...syns);
      if (syns.some(syn => lc.includes(syn))) bag.push(key);
    }
    return bag;
  };
  const findAnalysis = (markerName: string) => {
    if (!analysis?.priority_findings?.length) return null;
    const markerBag = buildSynonymBag(markerName);
    return analysis.priority_findings.find((f: any) => {
      const findingName = (f?.marker ?? '').toLowerCase();
      if (!findingName) return false;
      // Exact / substring match either direction (original behavior)
      if (findingName.includes(markerName.toLowerCase())) return true;
      if (markerName.toLowerCase().includes(findingName)) return true;
      // Synonym match — every term in either bag tested both ways
      const findingBag = buildSynonymBag(findingName);
      return markerBag.some(m => findingBag.some(f2 => m.includes(f2) || f2.includes(m)));
    }) ?? null;
  };

  const getDisplayValues = () => {
    if (activeTab === 'urgent') return values.filter((v: any) => isOutOfRange(v.optimal_flag));
    if (activeTab === 'monitor') return values.filter((v: any) => isWatch(v.optimal_flag));
    return values;
  };

  return (
    <AppShell pageTitle="Lab Results">
      {/* Critical / Emergency banner — ALWAYS visible to ALL tiers (safety, no paywall) */}
      {criticalFindings.length > 0 && <CriticalBanner findings={criticalFindings} />}

      {/* Dark hero card — same DNA as Wellness Plan */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <button onClick={() => navigate('/labs/history')} className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase hover:text-[#D4A574] transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">folder</span>All Uploads
          </button>
          <div className="flex items-center gap-3">
            {(() => {
              // Single, deterministic "is the analysis running" signal:
              //   retryLocked: user clicked retry recently (60s window)
              //   isPending: mutation's DB update in flight
              //   processing: server is currently working
              // Removed the legacy "Stuck — Retry" state — it used draw.created_at
              // as a proxy for updated_at and falsely fired on re-runs of older
              // draws (created_at is hours old, so it always looked "stuck").
              // The retry-lock's 60s ceiling now handles genuine stuck cases.
              const isRunning =
                retryLocked ||
                retryAnalysis.isPending ||
                draw.processing_status === 'processing';
              return (
                <button
                  onClick={() => retryAnalysis.mutate()}
                  disabled={isRunning}
                  className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase hover:text-[#D4A574] transition-colors flex items-center gap-1 disabled:opacity-70"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isRunning ? 'animate-spin' : ''}`}>refresh</span>
                  {isRunning ? 'Running…' : 'Re-run Analysis'}
                </button>
              );
            })()}
            <button onClick={() => navigate('/labs/upload')} className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase hover:text-[#D4A574] transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">upload_file</span>Upload New
            </button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Your Bloodwork</p>
            <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">{draw.lab_name ?? 'Lab Report'}</h1>
            <p className="text-body text-on-surface-variant text-sm mt-2">{format(new Date(draw.draw_date), 'MMMM d, yyyy')}{draw.ordering_provider && ` · ${draw.ordering_provider}`}</p>
          </div>
          <button
            onClick={() => navigate(isPro ? '/doctor-prep' : '/settings?tab=subscription')}
            className={`inline-flex items-center gap-2 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] transition-colors flex-shrink-0 ${
              isPro ? 'bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal' : 'bg-white/10 hover:bg-white/20 text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{isPro ? 'description' : 'lock'}</span>
            {isPro ? 'Prep for Doctor' : 'Unlock Prep'}
          </button>
        </div>
        {/* Score chips inline — visible at a glance.
            Renamed under the new range model:
            Out of Range (was Urgent), Watch (was Monitor), Healthy (was Optimal). */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { count: urgentCount, label: 'Out of Range', color: '#C94F4F', tab: 'urgent' as const },
            { count: monitorCount, label: 'Watch', color: '#E8922A', tab: 'monitor' as const },
            { count: optimalCount, label: 'Healthy', color: '#2A9D8F', tab: 'all' as const },
          ].map(({ count, label, color, tab }) => (
            <button
              key={label}
              onClick={() => setActiveTab(activeTab === tab ? 'all' : tab)}
              className={`bg-white/5 hover:bg-white/10 rounded-[10px] p-3 border transition-all ${activeTab === tab ? 'border-white/30' : 'border-white/5'}`}
            >
              <div className="text-authority text-2xl font-bold" style={{ color }}>{count}</div>
              <div className="text-precision text-[0.55rem] text-on-surface-variant tracking-widest uppercase mt-0.5">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Status banner — shown PROMINENTLY above counts so user always knows
          if analysis is in flight or failed. Self-polling via useEffect for
          extra reliability if React Query's refetchInterval isn't triggering. */}
      {(retryLocked || (draw.processing_status === 'processing' && !analysis)) && (
        <div className="bg-gradient-to-r from-[#1B423A] to-[#2D6A4F] rounded-[14px] p-5 flex items-center gap-4 shadow-card">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-white/20" />
            <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
          <div className="flex-1">
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">Analyzing your bloodwork</p>
            <p className="text-body text-on-surface text-sm">
              Reading every marker, finding patterns, building your plan. About 45–90 seconds — this page updates automatically.
            </p>
          </div>
        </div>
      )}

      {/* Hide the failed banner during the retry-lock window — otherwise the
          user sees "Analysis failed" + Retry button while a retry is in
          flight, which is exactly the confusion that keeps reopening this bug. */}
      {!retryLocked && draw.processing_status === 'failed' && (
        <div className="rounded-[10px] p-6 flex items-center gap-4 bg-[#C94F4F]/10 border border-[#C94F4F]/30">
          <span className="material-symbols-outlined text-[24px] flex-shrink-0 text-[#C94F4F]">error</span>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">Analysis failed</p>
            <p className="text-body text-clinical-stone text-xs mt-0.5">
              {retryAnalysis.error
                ? `Error: ${(retryAnalysis.error as Error).message}`
                : 'The AI analysis timed out or encountered an error. Your lab values are saved — you can retry the analysis.'}
            </p>
          </div>
          <Button variant="primary" size="sm" icon="refresh"
            onClick={() => retryAnalysis.mutate()}
            disabled={retryAnalysis.isPending}
          >
            {retryAnalysis.isPending ? 'Retrying...' : 'Retry Analysis'}
          </Button>
        </div>
      )}

      {/* Free users see a teaser locked card. Pro users see the full AI analysis. */}
      {!isPro && analysis?.summary && (
        <Link to="/settings?tab=subscription" className="block bg-clinical-white rounded-[14px] border-t-[3px] border-[#D4A574] shadow-card p-6 hover:shadow-card-md transition-shadow">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-[#D4A574] text-[28px] flex-shrink-0">lock</span>
            <div className="flex-1 min-w-0">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">Pro · AI Analysis Locked</p>
              <p className="text-authority text-lg text-clinical-charcoal font-bold mb-1">Your labs have been analyzed.</p>
              <p className="text-body text-clinical-stone text-sm leading-relaxed mb-3">
                Unlock the full breakdown — what every abnormal value means, the patterns it reveals, the exact tests to ask your doctor for, and a 90-day plan to fix what's wrong.
              </p>
              <div className="inline-flex items-center gap-2 text-precision text-[0.65rem] font-bold tracking-widest uppercase text-primary-container">
                Unlock with Pro · $19/month
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </div>
            </div>
          </div>
        </Link>
      )}
      {isPro && analysis?.summary && (
        <div className="bg-[#131313] rounded-[10px] p-6">
          <SectionLabel light icon="insights" className="text-on-surface-variant">Analysis Summary</SectionLabel>
          <p className="text-body text-on-surface leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      {/* Trajectory strip — multi-draw trend on Watch + Out-of-Range markers.
          Component self-hides if no markers have 2+ draws of history. */}
      {isPro && (urgentCount > 0 || monitorCount > 0) && (
        <TrajectoryStrip
          values={values.filter((v: any) => isOutOfRange(v.optimal_flag) || isWatch(v.optimal_flag))}
        />
      )}

      {/* Hand-off to Doctor Prep — that's where test recommendations + ICD-10 codes live */}
      {isPro && analysis?.summary && (
        <button
          onClick={() => navigate('/doctor-prep')}
          className="w-full bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[14px] p-6 text-left hover:from-[#244F46] hover:to-[#163730] transition-all group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-[#D4A574]/20 rounded-[10px] flex items-center justify-center flex-shrink-0 group-hover:bg-[#D4A574]/30 transition-colors">
              <span className="material-symbols-outlined text-[#D4A574] text-[24px]">description</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">For Your Doctor</p>
              <p className="text-authority text-lg text-on-surface font-bold mb-1">Bring this to your appointment</p>
              <p className="text-body text-on-surface-variant text-sm leading-relaxed">
                Your Doctor Prep has the exact tests to ask for — Essential Baseline, Functional Medicine, and Longevity tiers — with ICD-10 codes so insurance covers them.
              </p>
              <div className="inline-flex items-center gap-1 text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#D4A574] mt-3">
                Open Doctor Prep
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Tab nav — same style as Wellness Plan */}
      <div className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto">
        {[{ id: 'all', label: `All (${values.length})` }, { id: 'urgent', label: `Out of Range (${urgentCount})` }, { id: 'monitor', label: `Watch (${monitorCount})` }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[90px] py-2.5 px-3 rounded-[8px] transition-all ${
              activeTab === tab.id ? 'bg-clinical-white shadow-card' : 'hover:bg-clinical-white/50'
            }`}
          >
            <span className={`text-precision text-[0.7rem] font-bold tracking-wider ${activeTab === tab.id ? 'text-clinical-charcoal' : 'text-clinical-stone'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'all' ? (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, catValues]) => (
            <div key={category}>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-authority text-lg text-clinical-charcoal font-bold">{CATEGORY_LABELS[category] ?? category}</h3>
                <span className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase">
                  {catValues.length} {catValues.length === 1 ? 'marker' : 'markers'}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {catValues.map((val: any) => <LabMarkerCard key={val.id} value={val} analysis={findAnalysis(val.marker_name)} onAddToPrep={() => navigate('/doctor-prep')} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Explainer banner — gives context for what Watch / Out-of-Range mean */}
          {activeTab === 'monitor' && monitorCount > 0 && (
            <div className="bg-[#E8922A]/10 border border-[#E8922A]/30 rounded-[10px] p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#B8763B] text-[20px] flex-shrink-0 mt-0.5">visibility</span>
              <div>
                <p className="text-body text-clinical-charcoal text-sm font-semibold leading-snug mb-1">These markers are technically in range — but trending the wrong way.</p>
                <p className="text-body text-clinical-stone text-xs leading-relaxed">Push these down with diet, movement, or supplementation. Recheck in 3 months — trajectory matters more than a single number.</p>
              </div>
            </div>
          )}
          {activeTab === 'urgent' && urgentCount > 0 && (
            <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-[10px] p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#C94F4F] text-[20px] flex-shrink-0 mt-0.5">priority_high</span>
              <div>
                <p className="text-body text-clinical-charcoal text-sm font-semibold leading-snug mb-1">These markers are outside the standard lab range.</p>
                <p className="text-body text-clinical-stone text-xs leading-relaxed">Bring these to your doctor. Your Doctor Prep PDF has the test recommendations and ICD-10 codes.</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {getDisplayValues().map((val: any) => <LabMarkerCard key={val.id} value={val} analysis={findAnalysis(val.marker_name)} onAddToPrep={() => navigate('/doctor-prep')} />)}
          </div>
        </div>
      )}

      <div className="border-t border-outline-variant/10 pt-6">
        <p className="text-precision text-[0.6rem] text-clinical-stone/60 tracking-wide leading-relaxed">
          This analysis is generated for educational purposes only. It does not constitute medical advice. Discuss all findings with your physician.
        </p>
      </div>
    </AppShell>
  );
};
