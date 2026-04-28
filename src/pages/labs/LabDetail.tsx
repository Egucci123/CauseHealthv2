// src/pages/labs/LabDetail.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AppShell } from '../../components/layout/AppShell';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Button } from '../../components/ui/Button';
import { LabMarkerCard } from '../../components/labs/LabMarkerCard';
import { CriticalBanner } from '../../components/labs/CriticalBanner';
import { detectCriticalFindings } from '../../lib/criticalFindings';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../../lib/subscription';

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

  const retryAnalysis = useMutation({
    mutationFn: async () => {
      if (!drawId || !user) throw new Error('Missing context');
      await supabase.from('lab_draws').update({ processing_status: 'processing', analysis_result: null }).eq('id', drawId);
      // Get a fresh JWT so the edge function can authenticate the user.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      // Raw fetch with keepalive — survives navigation
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lab-detail', drawId], enabled: !!drawId && !!user,
    queryFn: async () => {
      if (!drawId || !user) return null;
      const [drawRes, valuesRes] = await Promise.all([
        supabase.from('lab_draws').select('*').eq('id', drawId).eq('user_id', user.id).single(),
        supabase.from('lab_values').select('*').eq('draw_id', drawId).order('marker_category'),
      ]);
      if (drawRes.error || !drawRes.data) throw new Error('Draw not found');
      // Panel gaps stored in notes field (computed client-side), analysis in analysis_result (from AI)
      let panelGaps: any[] = [];
      try { panelGaps = JSON.parse(drawRes.data.notes ?? '{}')?.panel_gaps ?? []; } catch {}
      return { draw: drawRes.data, values: valuesRes.data ?? [], analysis: drawRes.data.analysis_result, panelGaps };
    },
    staleTime: 10 * 1000, refetchOnMount: 'always',
    // Poll while analysis is still processing
    refetchInterval: (query) => {
      const status = query.state.data?.draw?.processing_status;
      return status === 'processing' ? 5000 : false;
    },
  });

  // ── Backup poll for in-flight analysis ──
  // MUST be placed before any early returns to keep hook order stable across
  // renders (Rules of Hooks). Reads draw + analysis safely via optional chaining.
  useEffect(() => {
    const stillRunning = data?.draw?.processing_status === 'processing' && !data?.analysis;
    if (!stillRunning) return;
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['lab-detail', drawId] });
    }, 4000);
    return () => clearInterval(id);
  }, [data?.draw?.processing_status, data?.analysis, qc, drawId]);

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

  if (isLoading) return (
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

  const findAnalysis = (markerName: string) =>
    analysis?.priority_findings?.find((f: any) => f.marker.toLowerCase().includes(markerName.toLowerCase()) || markerName.toLowerCase().includes(f.marker.toLowerCase())) ?? null;

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
              const updatedAt = draw.updated_at ?? draw.created_at;
              const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : 0;
              const stuck = draw.processing_status === 'processing' && ageMs > 90_000;
              const isRunning = retryAnalysis.isPending || (draw.processing_status === 'processing' && !stuck);
              return (
                <button
                  onClick={() => retryAnalysis.mutate()}
                  disabled={retryAnalysis.isPending || isRunning}
                  className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase hover:text-[#D4A574] transition-colors flex items-center gap-1 disabled:opacity-70"
                >
                  <span className={`material-symbols-outlined text-[14px] ${isRunning ? 'animate-spin' : ''}`}>refresh</span>
                  {isRunning ? 'Running…' : stuck ? 'Stuck — Retry' : 'Re-run Analysis'}
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
        {/* Score chips inline — visible at a glance */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          {[
            { count: urgentCount, label: 'Urgent', color: '#C94F4F', tab: 'urgent' as const },
            { count: monitorCount, label: 'Monitor', color: '#E8922A', tab: 'monitor' as const },
            { count: optimalCount, label: 'Optimal', color: '#2A9D8F', tab: 'all' as const },
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
      {draw.processing_status === 'processing' && !analysis && (
        <div className="bg-gradient-to-r from-[#1B423A] to-[#2D6A4F] rounded-[14px] p-5 flex items-center gap-4 shadow-card">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-white/20" />
            <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
          <div className="flex-1">
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">Analyzing your bloodwork</p>
            <p className="text-body text-on-surface text-sm">
              Reading every marker, finding patterns, building your plan. About 30 seconds — this page updates automatically.
            </p>
          </div>
        </div>
      )}

      {draw.processing_status === 'failed' && (
        <div className="rounded-[10px] p-6 flex items-center gap-4 bg-[#C94F4F]/10 border border-[#C94F4F]/30">
          <span className="material-symbols-outlined text-[24px] flex-shrink-0 text-[#C94F4F]">error</span>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">Analysis failed</p>
            <p className="text-body text-clinical-stone text-xs mt-0.5">
              The AI analysis timed out or encountered an error. Your lab values are saved — you can retry the analysis.
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
        {[{ id: 'all', label: `All (${values.length})` }, { id: 'urgent', label: `Urgent (${urgentCount})` }, { id: 'monitor', label: `Monitor (${monitorCount})` }].map(tab => (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {getDisplayValues().map((val: any) => <LabMarkerCard key={val.id} value={val} analysis={findAnalysis(val.marker_name)} onAddToPrep={() => navigate('/doctor-prep')} />)}
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
