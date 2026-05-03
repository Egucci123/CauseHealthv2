// src/components/dashboard/ResearchDigest.tsx
// Surfaces the latest curated research update on the Dashboard. Goal:
// keep optimizers engaged between lab draws. Dismissible per-digest.
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { latestDigest } from '../../lib/researchDigest';
import { SectionLabel } from '../ui/SectionLabel';

const DISMISS_KEY = (uid: string) => `research_digest_dismissed_${uid}`;

export const ResearchDigest = ({ userId }: { userId: string }) => {
  const digest = latestDigest();
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY(userId));
      if (raw) setDismissed(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [userId]);

  if (!digest) return null;
  if (dismissed.includes(digest.publishedAt)) return null;

  const dismiss = () => {
    const next = [...dismissed, digest.publishedAt];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY(userId), JSON.stringify(next)); } catch { /* quota */ }
  };

  return (
    <div className="bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[14px] p-6 shadow-card relative">
      <button
        onClick={dismiss}
        className="absolute top-4 right-4 text-on-surface-variant/60 hover:text-on-surface transition-colors"
        aria-label="Dismiss digest"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>

      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-[8px] bg-[#D4A574]/20 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[#D4A574] text-[20px]">menu_book</span>
        </div>
        <div className="flex-1 min-w-0">
          <SectionLabel light className="mb-1 text-on-surface-variant">What's New In Research</SectionLabel>
          <p className="text-precision text-[0.7rem] text-on-surface-variant/60 tracking-widest uppercase">{format(new Date(digest.publishedAt), 'MMM d, yyyy')}</p>
        </div>
      </div>

      <h3 className="text-authority text-xl text-on-surface font-bold leading-tight mb-2 pr-6">{digest.title}</h3>
      <p className="text-body text-on-surface-variant text-sm leading-relaxed mb-4">{digest.takeaway}</p>

      <ul className="space-y-2 mb-4">
        {digest.bullets.map((b, i) => (
          <li key={i} className="text-body text-on-surface-variant text-sm leading-relaxed flex items-start gap-2">
            <span className="text-[#D4A574] flex-shrink-0">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-on-surface-variant/10 flex-wrap">
        {digest.source && (
          <p className="text-precision text-[0.6rem] text-on-surface-variant/70 italic">Source: {digest.source.name}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {digest.tags.map(t => (
            <span key={t} className="text-precision text-[0.7rem] font-bold tracking-wider uppercase text-[#D4A574] bg-[#D4A574]/10 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
