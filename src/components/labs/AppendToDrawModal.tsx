// src/components/labs/AppendToDrawModal.tsx
//
// Small modal launched from LabDetail's "Add a missing report" button.
// Lets the user drop a PDF/photo of a lab report that belongs to the same
// blood draw — typically markers that came back later (CRP, advanced lipids,
// vitamin D, etc.) on a separate report sheet.
//
// Keeps it tight: one file at a time, clear status messages, auto-closes
// after success.
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppendToDraw, type AppendStatus } from '../../hooks/useAppendToDraw';

interface Props {
  drawId: string;
  drawDate: string;       // formatted date string ("January 25, 2026")
  open: boolean;
  onClose: () => void;
}

const statusCopy: Record<AppendStatus, string> = {
  idle: '',
  uploading: 'Uploading file…',
  reading: 'Reading the report…',
  extracting: 'Pulling out the lab values…',
  merging: 'Adding the new markers to your draw…',
  reanalyzing: 'Re-running analysis with the new data…',
  done: 'Done.',
  error: '',
};

export const AppendToDrawModal = ({ drawId, drawDate, open, onClose }: Props) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { append, isPending, status, errorMessage, result, reset } = useAppendToDraw(drawId);
  const [picked, setPicked] = useState<File | null>(null);

  const handleClose = () => {
    reset();
    setPicked(null);
    onClose();
  };

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPicked(f);
  };

  const handleConfirm = () => {
    if (!picked) return;
    append(picked);
  };

  if (!open) return null;

  const showResult = status === 'done' && result;
  const showError = status === 'error';
  const showProgress = isPending;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="bg-clinical-white rounded-[14px] shadow-card-md max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container mb-1">Add to existing draw</p>
              <h2 className="text-authority text-xl text-clinical-charcoal font-bold leading-tight">Add a missing report</h2>
              <p className="text-body text-clinical-stone text-sm mt-1">Adds new markers to your <span className="font-semibold text-clinical-charcoal">{drawDate}</span> draw. Original date and analysis stay.</p>
            </div>
            <button
              onClick={handleClose}
              className="text-clinical-stone/40 hover:text-clinical-stone flex-shrink-0"
              aria-label="Close"
              disabled={isPending}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* IDLE — file picker */}
          {!isPending && !showResult && !showError && (
            <>
              {!picked ? (
                <button
                  onClick={handlePick}
                  className="w-full border-2 border-dashed border-outline-variant/30 rounded-[10px] p-8 text-center hover:border-primary-container/50 hover:bg-clinical-cream/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-clinical-stone text-[36px] mb-2 block">upload_file</span>
                  <p className="text-body text-clinical-charcoal font-medium text-sm mb-1">Choose a PDF or photo</p>
                  <p className="text-body text-clinical-stone text-xs">Lab reports, single-marker results, follow-up panels — anything from the same draw.</p>
                </button>
              ) : (
                <div className="bg-clinical-cream/40 rounded-[10px] p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">description</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-clinical-charcoal font-medium text-sm truncate">{picked.name}</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">{(picked.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={() => setPicked(null)}
                    className="text-clinical-stone/60 hover:text-clinical-stone"
                    aria-label="Remove file"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleClose}
                  className="flex-1 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] border border-outline-variant/30 text-clinical-charcoal hover:bg-clinical-cream transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!picked}
                  className="flex-1 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] bg-primary-container text-white hover:bg-primary-container/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add to draw
                </button>
              </div>
            </>
          )}

          {/* PROGRESS */}
          {showProgress && (
            <div className="py-6 text-center">
              <div className="w-10 h-10 border-3 border-primary-container border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-body text-clinical-charcoal font-medium text-sm">{statusCopy[status]}</p>
              <p className="text-precision text-[0.6rem] text-clinical-stone mt-2 tracking-wide">This usually takes 30–60 seconds.</p>
            </div>
          )}

          {/* SUCCESS */}
          {showResult && result && (
            <div className="py-4">
              {result.appendedCount === 0 ? (
                <div className="text-center">
                  <span className="material-symbols-outlined text-[#D4A574] text-[36px] mb-2 block">info</span>
                  <p className="text-body text-clinical-charcoal font-medium text-sm mb-1">Nothing new to add</p>
                  <p className="text-body text-clinical-stone text-xs">All {result.skippedCount} markers in that file were already on this draw.</p>
                </div>
              ) : (
                <div className="text-center">
                  <span className="material-symbols-outlined text-primary-container text-[36px] mb-2 block">check_circle</span>
                  <p className="text-body text-clinical-charcoal font-medium text-sm mb-1">Added {result.appendedCount} new marker{result.appendedCount === 1 ? '' : 's'}.</p>
                  {result.skippedCount > 0 && (
                    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mb-3">Skipped {result.skippedCount} duplicate{result.skippedCount === 1 ? '' : 's'} that were already on this draw.</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 justify-center mb-4">
                    {result.newMarkerNames.slice(0, 6).map(m => (
                      <span key={m} className="text-precision text-[0.55rem] text-clinical-charcoal bg-clinical-cream px-2 py-1" style={{ borderRadius: '3px' }}>{m}</span>
                    ))}
                    {result.newMarkerNames.length > 6 && (
                      <span className="text-precision text-[0.55rem] text-clinical-stone px-2 py-1">+{result.newMarkerNames.length - 6} more</span>
                    )}
                  </div>
                  <p className="text-body text-clinical-stone text-xs leading-relaxed">Re-analysis is running. Refresh the lab page in ~30 seconds to see the updated picture.</p>
                </div>
              )}
              <button
                onClick={handleClose}
                className="w-full mt-4 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] bg-primary-container text-white hover:bg-primary-container/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {showError && (
            <div className="py-4">
              <div className="text-center mb-4">
                <span className="material-symbols-outlined text-[#C94F4F] text-[36px] mb-2 block">error</span>
                <p className="text-body text-clinical-charcoal font-medium text-sm mb-1">Something went wrong</p>
                <p className="text-body text-clinical-stone text-xs">{errorMessage}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  className="flex-1 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] border border-outline-variant/30 text-clinical-charcoal hover:bg-clinical-cream transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => { reset(); }}
                  className="flex-1 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-4 py-2.5 rounded-[8px] bg-primary-container text-white hover:bg-primary-container/90 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
