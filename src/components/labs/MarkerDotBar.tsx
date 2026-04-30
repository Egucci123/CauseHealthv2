// src/components/labs/MarkerDotBar.tsx
// Visual: a horizontal bar (red | yellow | green | yellow | red) with a dot showing where the value sits.
// 5-second comprehension. Tap the bar/dot for full detail.
import { useMemo } from 'react';

interface Props {
  value: number;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  standardLow?: number | null;
  standardHigh?: number | null;
  flag?: 'urgent' | 'monitor' | 'optimal' | string | null;
}

const colorForFlag = (flag?: string | null) => {
  if (flag === 'urgent') return '#C94F4F'; // red
  if (flag === 'monitor') return '#E8922A'; // amber
  if (flag === 'optimal') return '#2A9D8F'; // green
  return '#9CA3AF';
};

// Build a 3-zone bar: | low | in-range | high |
// Uses STANDARD ranges only — the functional-medicine "optimal" band is no
// longer rendered. Values inside standard show green; outside, red.
export const MarkerDotBar = ({ value, standardLow, standardHigh, flag }: Props) => {
  const layout = useMemo(() => {
    if (standardLow == null || standardHigh == null) return null;

    // Pad axis so dot has room when values are extreme
    const span = standardHigh - standardLow;
    const min = Math.min(standardLow - span * 0.5, value) * 0.95;
    const max = Math.max(standardHigh + span * 0.5, value) * 1.05;
    const range = max - min || 1;

    const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / range) * 100));

    return {
      dotPct: pct(value),
      sLowPct: pct(standardLow),
      sHighPct: pct(standardHigh),
    };
  }, [value, standardLow, standardHigh]);

  if (!layout) {
    return (
      <div className="text-precision text-[0.6rem] text-clinical-stone">No reference range</div>
    );
  }

  const dotColor = colorForFlag(flag);

  return (
    <div className="w-full">
      <div className="relative h-3 rounded-full overflow-hidden bg-clinical-cream">
        {/* Below standard (red) */}
        <div className="absolute top-0 bottom-0 bg-[#C94F4F]/80" style={{ left: 0, width: `${layout.sLowPct}%` }} />
        {/* Within standard (green) */}
        <div className="absolute top-0 bottom-0 bg-[#2A9D8F]/80" style={{ left: `${layout.sLowPct}%`, width: `${Math.max(0, layout.sHighPct - layout.sLowPct)}%` }} />
        {/* Above standard (red) */}
        <div className="absolute top-0 bottom-0 bg-[#C94F4F]/80" style={{ left: `${layout.sHighPct}%`, width: `${Math.max(0, 100 - layout.sHighPct)}%` }} />
        {/* Dot */}
        <div
          className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${layout.dotPct}%`, backgroundColor: dotColor }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-precision text-[0.55rem] text-clinical-stone tracking-wide">
        <span>Low</span>
        <span className="font-bold" style={{ color: dotColor }}>
          {value}
        </span>
        <span>High</span>
      </div>
    </div>
  );
};
