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

export const LabUpload = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const { phase, progress, statusMessage, drawId, extraction, errorMessage, completedDrawId, reset, startUpload, confirmAndAnalyze, resumeFromDraw } = useLabUploadStore();

  const isActive = ['uploading', 'extracting', 'analyzing'].includes(phase);

  // On mount, check for any in-flight draw and hydrate state from DB.
  // Fixes the "navigated away during review → came back to nothing" bug.
  useEffect(() => {
    if (!user) return;
    if (phase === 'idle') resumeFromDraw(user.id);
  }, [user, phase, resumeFromDraw]);

  useEffect(() => {
    if (phase === 'complete' && completedDrawId) {
      qc.invalidateQueries({ queryKey: ['labDraws'] });
      qc.invalidateQueries({ queryKey: ['latestLabDraw'] });
      qc.invalidateQueries({ queryKey: ['labValues'] });
      qc.invalidateQueries({ queryKey: ['priorityAlerts'] });
      qc.invalidateQueries({ queryKey: ['wellness-plan'] });
      qc.invalidateQueries({ queryKey: ['activePlan'] });
      qc.invalidateQueries({ queryKey: ['lab-detail'] });
      setTimeout(() => { reset(); navigate(`/labs/${completedDrawId}`, { replace: true }); }, 800);
    }
  }, [phase, completedDrawId, navigate, qc]);

  const handleUpload = (files: File[]) => {
    if (!user) return;
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

        {phase === 'complete' && (
          <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-[#D4A574] p-10 text-center">
            <span className="material-symbols-outlined text-[#D4A574] text-5xl mb-4 block">check_circle</span>
            <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">Analysis complete.</p>
            <p className="text-body text-clinical-stone">Redirecting to your results...</p>
          </div>
        )}

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
