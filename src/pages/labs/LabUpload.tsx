// src/pages/labs/LabUpload.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { SectionHeader } from '../../components/ui/Card';
import { DropZone } from '../../components/labs/DropZone';
import { ExtractionProgress } from '../../components/labs/ExtractionProgress';
import { ReviewTable } from '../../components/labs/ReviewTable';
import { ManualEntry } from '../../components/labs/ManualEntry';
import { useLabUploadStore } from '../../store/labUploadStore';
import { useAuthStore } from '../../store/authStore';
import { logEvent } from '../../lib/clientLog';

export const LabUpload = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const { phase, progress, statusMessage, drawId, extraction, errorMessage, completedDrawId, reset, startUpload, confirmAndAnalyze, resumeFromDraw } = useLabUploadStore();

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

      <div className="max-w-2xl">
        {phase === 'idle' && (
          <div className="space-y-8">
            <DropZone onFilesSelect={handleUpload} />
            <div className="text-center">
              <p className="text-body text-clinical-stone text-sm mb-2">Don't have a PDF? No problem.</p>
              <button onClick={reset} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Enter Values Manually</button>
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
            <button onClick={reset} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors">Try a Different File</button>
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
            <div className="flex gap-3">
              <button onClick={reset} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Try Again</button>
              <span className="text-clinical-stone">·</span>
              <button onClick={reset} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase hover:text-clinical-charcoal transition-colors">Enter Manually</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
