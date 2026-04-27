// src/components/dashboard/OrganAgesWidget.tsx
// Per-system "ages" — gives the user 4-5 motivating progress bars instead of one abstract score.
import { useMemo } from 'react';
import { useLatestLabValues } from '../../hooks/useLabData';
import { useAuthStore } from '../../store/authStore';
import { computeOrganAges } from '../../lib/organAges';

const COLOR = {
  younger: '#2A9D8F',
  'on-track': '#D4A574',
  older: '#C94F4F',
};

export const OrganAgesWidget = () => {
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

  if (!chronAge) return null;
  if (ages.length === 0) {
    return (
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Organ Ages</p>
        <p className="text-body text-clinical-stone text-sm">Upload labs to see how each system is aging.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Organ Ages</p>
        <p className="text-precision text-[0.6rem] text-clinical-stone">You are <span className="font-bold text-clinical-charcoal">{chronAge}</span></p>
      </div>

      <div className="space-y-3">
        {ages.map((a) => {
          const color = COLOR[a.status];
          const target = a.targetAge ?? a.age;
          // Bar position: shows where this organ sits on a 0..max axis (max = chronAge + 18)
          const max = chronAge + 18;
          const min = Math.max(0, chronAge - 6);
          const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
          return (
            <div key={a.system} className="bg-clinical-cream/40 rounded-[10px] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{a.emoji}</span>
                  <span className="text-body text-clinical-charcoal text-sm font-semibold">{a.system}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-precision text-lg font-bold" style={{ color }}>{a.age}</span>
                  <span className="text-precision text-[0.55rem] text-clinical-stone">
                    {a.delta > 0 ? `+${a.delta}` : a.delta} vs. you
                  </span>
                </div>
              </div>
              {/* Bar */}
              <div className="relative h-2 rounded-full bg-clinical-stone/15 overflow-hidden">
                {/* Chronological age marker (vertical line) */}
                <div className="absolute top-0 bottom-0 w-px bg-clinical-charcoal/40" style={{ left: `${pct(chronAge)}%` }} />
                {/* Target line */}
                {target !== a.age && (
                  <div className="absolute top-0 bottom-0 w-px bg-[#2A9D8F]" style={{ left: `${pct(target)}%` }} />
                )}
                {/* Current age dot */}
                <div className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 border-2 border-white shadow" style={{ left: `${pct(a.age)}%`, backgroundColor: color }} />
              </div>
              <p className="text-precision text-[0.6rem] text-clinical-stone mt-1.5 leading-snug">{a.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
