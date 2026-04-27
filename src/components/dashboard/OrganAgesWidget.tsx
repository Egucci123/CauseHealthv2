// src/components/dashboard/OrganAgesWidget.tsx
// Per-system "ages" — gives the user 4-5 motivating progress bars instead of one abstract score.
// Supports a darkMode where it lives inside a dark-green gradient card on the dashboard.
import { useMemo } from 'react';
import { useLatestLabValues } from '../../hooks/useLabData';
import { useAuthStore } from '../../store/authStore';
import { computeOrganAges } from '../../lib/organAges';

const COLOR = {
  younger: '#2A9D8F',
  'on-track': '#D4A574',
  older: '#C94F4F',
};

interface Props { darkMode?: boolean }

export const OrganAgesWidget = ({ darkMode = false }: Props) => {
  const { profile } = useAuthStore();
  const { data: values } = useLatestLabValues();

  const chronAge = useMemo(() => {
    if (!profile?.dateOfBirth) return null;
    const dob = new Date(profile.dateOfBirth);
    return Math.floor((Date.now() - dob.getTime()) / 31_557_600_000);
  }, [profile?.dateOfBirth]);

  const ages = useMemo(() => {
    if (!values || !chronAge) return [];
    return computeOrganAges(values as any, chronAge);
  }, [values, chronAge]);

  // Theme tokens — invert when on dark gradient
  const t = darkMode
    ? {
        eyebrow: 'text-[#D4A574]',
        body: 'text-on-surface',
        muted: 'text-on-surface-variant',
        cardBg: 'bg-white/5 backdrop-blur border border-white/10',
        barBg: 'bg-white/10',
        chronLine: 'bg-white/40',
        explainer: 'text-on-surface-variant/80',
      }
    : {
        eyebrow: 'text-clinical-stone',
        body: 'text-clinical-charcoal',
        muted: 'text-clinical-stone',
        cardBg: 'bg-clinical-cream/40',
        barBg: 'bg-clinical-stone/15',
        chronLine: 'bg-clinical-charcoal/40',
        explainer: 'text-clinical-stone',
      };

  if (!chronAge) return null;
  if (ages.length === 0) {
    return (
      <div>
        <p className={`text-precision text-[0.68rem] font-bold ${t.eyebrow} tracking-widest uppercase mb-3`}>Organ Ages</p>
        <p className={`text-body ${t.muted} text-sm`}>Upload labs to see how each system is aging.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className={`text-precision text-[0.65rem] font-bold ${t.eyebrow} tracking-widest uppercase mb-1`}>Organ Ages</p>
          <p className={`text-authority text-xl ${t.body} font-bold leading-tight`}>How each system is aging.</p>
        </div>
        <p className={`text-precision text-[0.6rem] ${t.muted}`}>You are <span className={`font-bold ${t.body}`}>{chronAge}</span></p>
      </div>

      <div className="space-y-3">
        {ages.map((a) => {
          const color = COLOR[a.status];
          const target = a.targetAge ?? a.age;
          const max = chronAge + 18;
          const min = Math.max(0, chronAge - 6);
          const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
          return (
            <div key={a.system} className={`${t.cardBg} rounded-[10px] p-3`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{a.emoji}</span>
                  <span className={`text-body ${t.body} text-sm font-semibold`}>{a.system}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-precision text-lg font-bold" style={{ color }}>{a.age}</span>
                  <span className={`text-precision text-[0.55rem] ${t.muted}`}>
                    {a.delta > 0 ? `+${a.delta}` : a.delta} vs. you
                  </span>
                </div>
              </div>
              <div className={`relative h-2 rounded-full ${t.barBg} overflow-hidden`}>
                <div className={`absolute top-0 bottom-0 w-px ${t.chronLine}`} style={{ left: `${pct(chronAge)}%` }} />
                {target !== a.age && (
                  <div className="absolute top-0 bottom-0 w-px bg-[#2A9D8F]" style={{ left: `${pct(target)}%` }} />
                )}
                <div className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 border-2 border-white shadow" style={{ left: `${pct(a.age)}%`, backgroundColor: color }} />
              </div>
              <p className={`text-precision text-[0.6rem] ${t.explainer} mt-1.5 leading-snug`}>{a.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
