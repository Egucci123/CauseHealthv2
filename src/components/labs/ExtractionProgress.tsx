// src/components/labs/ExtractionProgress.tsx
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExtractionProgressProps { phase: string; message: string; progress: number; }

export const ExtractionProgress = ({ phase, message, progress }: ExtractionProgressProps) => {
  // Always show the actual `message` from the store. No more auto-rotation:
  // when progress was stuck at 0% the rotating fake messages made it look
  // like things were happening when they weren't.
  const displayMessage = message || `${phase}...`;

  // Watchdog: if progress hasn't moved in 30s, surface a "stuck" hint so the
  // user can refresh and retry instead of waiting forever on a frozen UI.
  const [stuck, setStuck] = useState(false);
  const lastProgress = useRef(progress);
  const lastChange = useRef(Date.now());
  useEffect(() => {
    if (progress !== lastProgress.current) {
      lastProgress.current = progress;
      lastChange.current = Date.now();
      setStuck(false);
    }
    const id = setInterval(() => {
      if (Date.now() - lastChange.current > 30_000) setStuck(true);
    }, 5000);
    return () => clearInterval(id);
  }, [progress]);

  return (
    <div className="flex flex-col items-center py-12 px-6 text-center">
      <div className="relative w-20 h-20 mb-8">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#E8E3DB" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1B4332" strokeWidth="6" strokeLinecap="butt"
            strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-precision text-sm text-clinical-charcoal font-bold">{progress}%</span>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={displayMessage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}
          className="text-authority text-xl text-clinical-charcoal font-semibold mb-2">{displayMessage}</motion.p>
      </AnimatePresence>
      <p className="text-body text-clinical-stone text-sm">
        {phase === 'uploading' && 'Your file is encrypted during transfer.'}
        {phase === 'extracting' && 'Reading every value from your report.'}
        {phase === 'analyzing' && 'Connecting your results to your health context.'}
      </p>
      <div className="flex gap-2 mt-6">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-primary-container"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }} />
        ))}
      </div>
      {stuck && (
        <div className="mt-6 max-w-sm bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-[10px] p-4">
          <p className="text-body text-clinical-charcoal text-sm font-semibold mb-1">This is taking longer than usual.</p>
          <p className="text-body text-clinical-stone text-xs leading-relaxed mb-3">Network might be slow or something hung. Refresh the page and try again — your files were saved and you can resume.</p>
          <button
            onClick={() => window.location.reload()}
            className="text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-1.5 bg-[#C94F4F] text-white rounded-[6px] hover:bg-[#A03434] transition-colors"
          >
            Refresh & Retry
          </button>
        </div>
      )}
    </div>
  );
};
