// src/pages/labs/LabHistory.tsx
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useLabDraws } from '../../hooks/useLabData';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLabUploadStore } from '../../store/labUploadStore';

export const LabHistory = () => {
  const navigate = useNavigate();
  const { data: draws, isLoading } = useLabDraws();
  const userId = useAuthStore(s => s.user?.id);
  const uploadPhase = useLabUploadStore(s => s.phase);
  const uploadMessage = useLabUploadStore(s => s.statusMessage);
  const uploadProgress = useLabUploadStore(s => s.progress);
  const isUploading = ['uploading', 'extracting'].includes(uploadPhase);
  const needsReview = uploadPhase === 'reviewing';
  const qc = useQueryClient();

  const retryAnalysis = useMutation({
    mutationFn: async (drawId: string) => {
      await supabase.from('lab_draws').update({ processing_status: 'processing' }).eq('id', drawId);
      // Fire and forget — continues even if user navigates away
      supabase.functions.invoke('analyze-labs', { body: { drawId, userId } })
        .then(() => { qc.invalidateQueries({ queryKey: ['labDraws'] }); qc.invalidateQueries({ queryKey: ['lab-detail', drawId] }); })
        .catch(console.warn);
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
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <SectionHeader title="Lab History" description="Your complete bloodwork history. Every draw. Every marker. Every trend." />
        <Button variant="primary" size="md" icon="upload_file" onClick={() => { useLabUploadStore.getState().reset(); navigate('/labs/upload'); }}>Upload New Labs</Button>
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

      {isLoading ? (
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
                  {draw.processingStatus === 'complete' ? (
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
                    <button
                      onClick={(e) => { e.stopPropagation(); retryAnalysis.mutate(draw.id); }}
                      disabled={retryAnalysis.isPending}
                      className="inline-flex items-center gap-1 bg-[#614018] text-[#FFDCBC] text-precision text-[0.6rem] px-2 py-0.5 font-bold hover:bg-[#4A3010] transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[12px]">refresh</span>
                      {retryAnalysis.isPending ? 'RETRYING...' : 'PROCESSING — TAP TO RETRY'}
                    </button>
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
