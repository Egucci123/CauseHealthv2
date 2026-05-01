// src/pages/labs/LabHistory.tsx
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useLabDraws } from '../../hooks/useLabData';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLabUploadStore } from '../../store/labUploadStore';

export const LabHistory = () => {
  const navigate = useNavigate();
  const { data: draws} = useLabDraws();
  // NOTE: previously auto-redirected to the single draw's detail page when
  // draws.length === 1. That created a loop where "All Uploads" from a lab
  // detail bounced right back to the same detail (looked broken to the user).
  // Always show the list now — even with 1 draw, users want to see their
  // upload history page.
  const userId = useAuthStore(s => s.user?.id);
  const uploadPhase = useLabUploadStore(s => s.phase);
  const uploadMessage = useLabUploadStore(s => s.statusMessage);
  const uploadProgress = useLabUploadStore(s => s.progress);
  const isUploading = ['uploading', 'extracting'].includes(uploadPhase);
  const needsReview = uploadPhase === 'reviewing';
  const qc = useQueryClient();

  // Local lock: track which drawIds were just retried, with the timestamp.
  // The retry mutation completes in ~300ms (just the DB update), but the
  // actual analyze-labs call runs ~30s in the background. Without this
  // lock, the button snaps back to "RETRY ANALYSIS" the moment the DB
  // update finishes — making it look like retry failed. We hold the
  // "Analyzing…" UI for 60s (or until status flips to 'complete'),
  // whichever comes first.
  const [retryingAt, setRetryingAt] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (Object.keys(retryingAt).length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryingAt]);

  const isRetrying = (drawId: string, status: string) => {
    const startedAt = retryingAt[drawId];
    if (!startedAt) return false;
    // Clear the lock once status has moved past 'failed' for >2s, OR after 60s ceiling.
    if (now - startedAt > 60_000) return false;
    if (status === 'complete' && now - startedAt > 2_000) return false;
    return true;
  };

  const retryAnalysis = useMutation({
    mutationFn: async (drawId: string) => {
      setRetryingAt(prev => ({ ...prev, [drawId]: Date.now() }));
      await supabase.from('lab_draws').update({ processing_status: 'processing' }).eq('id', drawId);
      // Raw fetch detached from React lifecycle — survives navigation
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ drawId, userId }),
        keepalive: true,
      }).catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labDraws'] }),
  });

  const deleteDraw = useMutation({
    mutationFn: async (drawId: string) => {
      // Delete dependent records first (foreign keys), then the draw
      await supabase.from('wellness_plans').delete().eq('draw_id', drawId);
      await supabase.from('lab_values').delete().eq('draw_id', drawId);
      await supabase.from('lab_draws').delete().eq('id', drawId).eq('user_id', userId!);
    },
    onSuccess: () => {
      useLabUploadStore.getState().reset();
      qc.invalidateQueries({ queryKey: ['labDraws'] });
      qc.invalidateQueries({ queryKey: ['latestLabDraw'] });
      qc.invalidateQueries({ queryKey: ['wellness-plan'] });
      qc.invalidateQueries({ queryKey: ['activePlan'] });
    },
  });

  const handleDelete = (e: React.MouseEvent, drawId: string) => {
    e.stopPropagation(); // Don't navigate to detail page
    if (confirm('Delete this lab report and all its values? This cannot be undone.')) {
      deleteDraw.mutate(drawId);
    }
  };

  return (
    <AppShell pageTitle="Lab Analytics">
      {/* Dark hero card */}
      <div className="bg-[#131313] rounded-[14px] p-6 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">All Your Labs</p>
            <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">Lab History.</h1>
            <p className="text-body text-on-surface-variant text-sm mt-2 max-w-md">Every draw, every marker, every trend over time. The whole story of your bloodwork.</p>
          </div>
          <button
            onClick={() => { useLabUploadStore.getState().reset(); navigate('/labs/upload'); }}
            className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-[#D4A574] hover:bg-[#B8915F] text-clinical-charcoal rounded-[8px] transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[14px]">upload_file</span>
            Upload New Labs
          </button>
        </div>
      </div>

      {/* Active upload banner */}
      {isUploading && (
        <button onClick={() => navigate('/labs/upload')} className="w-full bg-primary-container/10 border border-primary-container/30 rounded-[10px] p-5 flex items-center gap-4 hover:bg-primary-container/15 transition-colors text-left">
          <div className="w-10 h-10 bg-primary-container/20 rounded-full flex items-center justify-center flex-shrink-0">
            <div className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">Lab upload in progress</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone truncate">{uploadMessage}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-20 h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
              <div className="h-full bg-primary-container rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className="material-symbols-outlined text-primary-container text-[18px]">arrow_forward</span>
          </div>
        </button>
      )}

      {needsReview && (
        <button onClick={() => navigate('/labs/upload')} className="w-full bg-[#E8922A]/10 border border-[#E8922A]/30 rounded-[10px] p-5 flex items-center gap-4 hover:bg-[#E8922A]/15 transition-colors text-left">
          <div className="w-10 h-10 bg-[#E8922A]/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[#E8922A] text-[20px]">rate_review</span>
          </div>
          <div className="flex-1">
            <p className="text-body text-clinical-charcoal font-semibold text-sm">Lab values ready for review</p>
            <p className="text-precision text-[0.6rem] text-clinical-stone">{uploadMessage}</p>
          </div>
          <span className="material-symbols-outlined text-[#E8922A] text-[18px] flex-shrink-0">arrow_forward</span>
        </button>
      )}

      {/* Skeleton until query resolves. Empty array = loaded with no items
          (show empty state). Undefined = still loading (skeleton). */}
      {!draws ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-clinical-white rounded-[10px] p-6 animate-pulse">
              <div className="h-4 bg-[#E8E3DB] rounded-sm w-1/4 mb-2" />
              <div className="h-3 bg-[#E8E3DB] rounded-sm w-1/2" />
            </div>
          ))}
        </div>
      ) : !draws?.length ? (
        <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
          <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">biotech</span>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">No lab reports yet</p>
          <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto">Upload your first bloodwork PDF to start tracking your health over time.</p>
          <Button variant="primary" size="lg" icon="upload_file" onClick={() => navigate('/labs/upload')}>Upload My First Labs</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {draws.map((draw) => (
            <div key={draw.id} className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-6 hover:shadow-card-md transition-shadow">
              <div className="flex justify-between items-start">
                <button onClick={() => navigate(`/labs/${draw.id}`)} className="flex-1 text-left">
                  <p className="text-authority text-xl text-clinical-charcoal font-semibold">{draw.labName ?? 'Lab Report'}</p>
                  <p className="text-body text-clinical-stone text-sm mt-1">{format(new Date(draw.drawDate), 'MMMM d, yyyy')}</p>
                </button>
                <div className="flex items-center gap-3">
                  {/* Local retry lock takes precedence — prevents flicker between
                      'failed' and 'processing' during the analyze-labs window. */}
                  {isRetrying(draw.id, draw.processingStatus) ? (
                    <span className="inline-flex items-center gap-1 bg-[#614018] text-[#FFDCBC] text-precision text-[0.6rem] px-2 py-0.5 font-bold">
                      <div className="w-2 h-2 border border-[#FFDCBC] border-t-transparent rounded-full animate-spin" />
                      ANALYZING…
                    </span>
                  ) : draw.processingStatus === 'complete' ? (
                    <span className="inline-block bg-primary-container text-white text-precision text-[0.6rem] px-2 py-0.5 font-bold">ANALYZED</span>
                  ) : draw.processingStatus === 'failed' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); retryAnalysis.mutate(draw.id); }}
                      disabled={retryAnalysis.isPending}
                      className="inline-flex items-center gap-1 bg-[#C94F4F] text-white text-precision text-[0.6rem] px-2 py-0.5 font-bold hover:bg-[#B04040] transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[12px]">refresh</span>
                      {retryAnalysis.isPending ? 'RETRYING...' : 'RETRY ANALYSIS'}
                    </button>
                  ) : draw.processingStatus === 'processing' ? (
                    <span className="inline-flex items-center gap-1 bg-[#614018] text-[#FFDCBC] text-precision text-[0.6rem] px-2 py-0.5 font-bold">
                      <div className="w-2 h-2 border border-[#FFDCBC] border-t-transparent rounded-full animate-spin" />
                      PROCESSING
                    </span>
                  ) : (
                    <span className="inline-block bg-surface-container text-on-surface-variant text-precision text-[0.6rem] px-2 py-0.5 font-bold">PENDING</span>
                  )}
                  <button
                    onClick={(e) => handleDelete(e, draw.id)}
                    className="text-clinical-stone/40 hover:text-[#C94F4F] transition-colors p-1"
                    title="Delete this lab report"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                  <button onClick={() => navigate(`/labs/${draw.id}`)} className="text-clinical-stone">
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
};
