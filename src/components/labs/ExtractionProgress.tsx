// src/components/labs/ExtractionProgress.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PHASE_MESSAGES: Record<string, string[]> = {
  uploading: ['Uploading to secure storage...', 'File received securely.'],
  extracting: ['Reading your lab report...', 'Identifying test panels...', 'Extracting individual values...', 'Cross-referencing marker names...'],
  analyzing: ['Comparing against optimal ranges...', 'Reviewing your medications...', 'Identifying patterns...', 'Connecting to your symptoms...', 'Generating your analysis...'],
};

interface ExtractionProgressProps { phase: string; message: string; progress: number; }

export const ExtractionProgress = ({ phase, message, progress }: ExtractionProgressProps) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = PHASE_MESSAGES[phase] ?? [];

  useEffect(() => {
    if (messages.length <= 1) return;
    setMessageIndex(0);
    const interval = setInterval(() => setMessageIndex(i => (i + 1) % messages.length), 2500);
    return () => clearInterval(interval);
  }, [phase, messages.length]);

  const displayMessage = messages[messageIndex] ?? message;

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
    </div>
  );
};
