// src/components/ui/FolderSection.tsx
// Collapsible labeled section with in-folder explanation
import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FolderSectionProps {
  icon: string;
  title: string;
  count?: number | string;
  countLabel?: string;
  explanation: string;
  children: ReactNode;
  defaultOpen?: boolean;
  accentColor?: string; // CSS color for icon and accent
}

export const FolderSection = ({
  icon, title, count, countLabel, explanation, children, defaultOpen = false, accentColor = '#1B4332',
}: FolderSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border border-outline-variant/10 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-clinical-cream/30 transition-colors"
        aria-expanded={open}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ color: accentColor }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-authority text-lg text-clinical-charcoal font-semibold">{title}</h3>
            {count != null && (
              <span className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">
                {count} {countLabel ?? 'item' + (typeof count === 'number' && count !== 1 ? 's' : '')}
              </span>
            )}
          </div>
        </div>
        <span
          className="material-symbols-outlined text-[20px] text-clinical-stone transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        >
          expand_more
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-outline-variant/10 pt-5">
              <div
                className="rounded-lg p-4 mb-5 border-l-4"
                style={{ backgroundColor: `${accentColor}08`, borderLeftColor: accentColor }}
              >
                <p className="text-precision text-[0.7rem] font-bold tracking-widest uppercase mb-1.5" style={{ color: accentColor }}>
                  What this is
                </p>
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{explanation}</p>
              </div>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
