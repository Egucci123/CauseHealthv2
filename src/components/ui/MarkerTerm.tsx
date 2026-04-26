// src/components/ui/MarkerTerm.tsx
// Clickable marker name that opens an inline glossary popover.
// Tap-friendly — works on both mobile and desktop.

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { findGlossaryEntry } from '../../data/biomarkerGlossary';

interface MarkerTermProps {
  name: string;
  className?: string;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export const MarkerTerm = ({ name, className = '', showIcon = true, children }: MarkerTermProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const entry = findGlossaryEntry(name);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // If no glossary entry exists, just render the name without interactivity
  if (!entry) return <span className={className}>{children ?? name}</span>;

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 cursor-help border-b border-dotted border-clinical-stone/40 hover:border-primary-container transition-colors ${className}`}
        aria-expanded={open}
        aria-label={`What is ${entry.name}?`}
      >
        {children ?? name}
        {showIcon && (
          <span className="material-symbols-outlined text-[12px] text-clinical-stone/60">info</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-clinical-white rounded-[10px] shadow-card-md border border-outline-variant/20 p-5"
            style={{ left: 0 }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-clinical-stone hover:text-clinical-charcoal"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <p className="text-precision text-[0.55rem] text-primary-container font-bold tracking-widest uppercase mb-1">{entry.category}</p>
            <h4 className="text-authority text-base text-clinical-charcoal font-semibold mb-3 pr-6">{entry.name}</h4>

            <div className="space-y-3">
              <div>
                <p className="text-precision text-[0.55rem] text-clinical-stone tracking-widest uppercase mb-0.5">What it is</p>
                <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.whatItIs}</p>
              </div>
              <div>
                <p className="text-precision text-[0.55rem] text-clinical-stone tracking-widest uppercase mb-0.5">Why it matters</p>
                <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.whyItMatters}</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="bg-[#C94F4F]/5 border-l-2 border-[#C94F4F] rounded-r px-2.5 py-1.5">
                  <p className="text-precision text-[0.55rem] text-[#C94F4F] tracking-widest uppercase mb-0.5">If high</p>
                  <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.highMeans}</p>
                </div>
                <div className="bg-[#E8922A]/5 border-l-2 border-[#E8922A] rounded-r px-2.5 py-1.5">
                  <p className="text-precision text-[0.55rem] text-[#E8922A] tracking-widest uppercase mb-0.5">If low</p>
                  <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.lowMeans}</p>
                </div>
              </div>
              {entry.optimalNote && (
                <div className="bg-primary-container/5 border-l-2 border-primary-container rounded-r px-2.5 py-1.5">
                  <p className="text-precision text-[0.55rem] text-primary-container tracking-widest uppercase mb-0.5">Optimal vs Standard</p>
                  <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.optimalNote}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};
