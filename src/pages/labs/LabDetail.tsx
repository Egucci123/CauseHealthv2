// src/pages/labs/LabDetail.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AppShell } from '../../components/layout/AppShell';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Button } from '../../components/ui/Button';
import { LabMarkerCard } from '../../components/labs/LabMarkerCard';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useState } from 'react';

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

  const retryAnalysis = useMutation({
    mutationFn: async () => {
      if (!drawId || !user) throw new Error('Missing context');
      await supabase.from('lab_draws').update({ processing_status: 'processing' }).eq('id', drawId);
      const { error } = await supabase.functions.invoke('analyze-labs', { body: { drawId, userId: user.id } });
      if (error) throw error;
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
      return { draw: drawRes.data, values: valuesRes.data ?? [], analysis: drawRes.data.analysis_result };
    },
    staleTime: 5 * 60 * 1000,
    // Poll while analysis is still processing
    refetchInterval: (query) => {
      const status = query.state.data?.draw?.processing_status;
      return status === 'processing' ? 5000 : false;
    },
  });

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

  const urgentCount = values.filter((v: any) => ['deficient', 'elevated'].includes(v.optimal_flag ?? '')).length;
  const monitorCount = values.filter((v: any) => ['suboptimal_low', 'suboptimal_high'].includes(v.optimal_flag ?? '')).length;
  const optimalCount = values.filter((v: any) => v.optimal_flag === 'optimal').length;

  const findAnalysis = (markerName: string) =>
    analysis?.priority_findings?.find((f: any) => f.marker.toLowerCase().includes(markerName.toLowerCase()) || markerName.toLowerCase().includes(f.marker.toLowerCase())) ?? null;

  const getDisplayValues = () => {
    if (activeTab === 'urgent') return values.filter((v: any) => ['deficient', 'elevated'].includes(v.optimal_flag ?? ''));
    if (activeTab === 'monitor') return values.filter((v: any) => ['suboptimal_low', 'suboptimal_high'].includes(v.optimal_flag ?? ''));
    return values;
  };

  return (
    <AppShell pageTitle="Lab Results">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <button onClick={() => navigate('/labs')} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-primary-container transition-colors flex items-center gap-1 mb-2">
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>All Labs
          </button>
          <h2 className="text-authority text-4xl text-clinical-charcoal font-bold">{draw.lab_name ?? 'Lab Report'}</h2>
          <p className="text-body text-clinical-stone mt-1">{format(new Date(draw.draw_date), 'MMMM d, yyyy')}{draw.ordering_provider && ` · ${draw.ordering_provider}`}</p>
        </div>
        <Button variant="secondary" size="md" icon="description" onClick={() => navigate('/doctor-prep')}>Prep for Doctor</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[{ count: urgentCount, label: 'Urgent', color: '#C94F4F' }, { count: monitorCount, label: 'Monitor', color: '#E8922A' }, { count: optimalCount, label: 'Optimal', color: '#D4A574' }].map(({ count, label, color }) => (
          <div key={label} className="bg-clinical-white rounded-[10px] shadow-card p-5 text-center cursor-pointer hover:shadow-card-md transition-shadow"
            onClick={() => { if (label === 'Urgent') setActiveTab(activeTab === 'urgent' ? 'all' : 'urgent'); if (label === 'Monitor') setActiveTab(activeTab === 'monitor' ? 'all' : 'monitor'); if (label === 'Optimal') setActiveTab('all'); }}>
            <div className="text-authority text-3xl font-bold" style={{ color }}>{count}</div>
            <div className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mt-1">{label}</div>
          </div>
        ))}
      </div>

      {(draw.processing_status === 'failed' || (draw.processing_status === 'processing' && !analysis)) && (
        <div className={`rounded-[10px] p-6 flex items-center gap-4 ${draw.processing_status === 'failed' ? 'bg-[#C94F4F]/10 border border-[#C94F4F]/30' : 'bg-[#614018]/10 border border-[#614018]/30'}`}>
          <span className="material-symbols-outlined text-[24px] flex-shrink-0" style={{ color: draw.processing_status === 'failed' ? '#C94F4F' : '#E8922A' }}>
            {draw.processing_status === 'failed' ? 'error' : 'hourglass_top'}
          </span>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">
              {draw.processing_status === 'failed' ? 'Analysis failed' : 'Analysis in progress'}
            </p>
            <p className="text-body text-clinical-stone text-xs mt-0.5">
              {draw.processing_status === 'failed'
                ? 'The AI analysis timed out or encountered an error. Your lab values are saved — you can retry the analysis.'
                : 'Your lab values are being analyzed. This page will update automatically.'}
            </p>
          </div>
          {(draw.processing_status === 'failed' || draw.processing_status === 'processing') && (
            <Button variant="primary" size="sm" icon="refresh"
              onClick={() => retryAnalysis.mutate()}
              disabled={retryAnalysis.isPending}
            >
              {retryAnalysis.isPending ? 'Retrying...' : 'Retry Analysis'}
            </Button>
          )}
        </div>
      )}

      {analysis?.summary && (
        <div className="bg-[#131313] rounded-[10px] p-6">
          <SectionLabel light icon="insights" className="text-on-surface-variant">Analysis Summary</SectionLabel>
          <p className="text-body text-on-surface leading-relaxed">{analysis.summary}</p>
          {analysis.missing_tests?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-outline-variant/20">
              <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold mb-2">Tests to Request</p>
              <div className="flex flex-wrap gap-2">
                {analysis.missing_tests.map((t: any) => (
                  <span key={t.test_name} className="text-precision text-[0.6rem] text-on-surface bg-surface-container px-2 py-1 font-medium" style={{ borderRadius: '3px' }}>{t.test_name}</span>
                ))}
              </div>
            </div>
          )}
          {analysis.panel_gaps?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-outline-variant/20">
              <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold mb-3">
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">add_circle</span>
                Recommended Additional Testing
              </p>
              {['essential', 'recommended', 'advanced'].map(tier => {
                const tierGaps = analysis.panel_gaps.filter((g: any) => g.category === tier);
                if (!tierGaps.length) return null;
                return (
                  <div key={tier} className="mb-3">
                    <p className="text-precision text-[0.55rem] text-on-surface-variant/70 tracking-widest uppercase mb-1.5">
                      {tier === 'essential' ? 'Essential Baseline' : tier === 'recommended' ? 'Functional Medicine' : 'Longevity & Optimization'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tierGaps.map((g: any) => (
                        <span key={g.test_name}
                          className="text-precision text-[0.6rem] text-on-surface px-2 py-1 font-medium cursor-help"
                          style={{
                            borderRadius: '3px',
                            backgroundColor: tier === 'essential' ? 'rgba(201,79,79,0.15)' : tier === 'recommended' ? 'rgba(232,146,42,0.15)' : 'rgba(42,157,143,0.15)',
                          }}
                          title={g.why_needed}
                        >
                          {g.test_name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {[{ id: 'all', label: `All (${values.length})` }, { id: 'urgent', label: `Urgent (${urgentCount})` }, { id: 'monitor', label: `Monitor (${monitorCount})` }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ borderRadius: '4px' }}
            className={`text-precision text-[0.68rem] font-bold tracking-wider uppercase px-4 py-2 border transition-all ${activeTab === tab.id ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-primary-container/30'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'all' ? (
        Object.entries(grouped).map(([category, catValues]) => (
          <div key={category}>
            <SectionLabel icon="category" className="mb-4">{CATEGORY_LABELS[category] ?? category}</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {catValues.map((val: any) => <LabMarkerCard key={val.id} value={val} analysis={findAnalysis(val.marker_name)} onAddToPrep={() => navigate('/doctor-prep')} />)}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
