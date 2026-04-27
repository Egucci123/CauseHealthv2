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

// Build a 5-zone bar: |urgent-low | monitor-low | optimal | monitor-high | urgent-high|
// Use standard ranges to extend the axis when present.
export const MarkerDotBar = ({ value, optimalLow, optimalHigh, standardLow, standardHigh, flag }: Props) => {
  const layout = useMemo(() => {
    if (optimalLow == null || optimalHigh == null) return null;

    const sLow = standardLow ?? optimalLow * 0.7;
    const sHigh = standardHigh ?? optimalHigh * 1.3;
    // Pad axis so dot has room when values are extreme
    const min = Math.min(sLow, value, optimalLow) * 0.95;
    const max = Math.max(sHigh, value, optimalHigh) * 1.05;
    const span = max - min || 1;

    const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

    const dotPct = pct(value);
    const sLowPct = pct(sLow);
    const oLowPct = pct(optimalLow);
    const oHighPct = pct(optimalHigh);
    const sHighPct = pct(sHigh);

    return { dotPct, sLowPct, oLowPct, oHighPct, sHighPct };
  }, [value, optimalLow, optimalHigh, standardLow, standardHigh]);

  if (!layout) {
    return (
      <div className="text-precision text-[0.6rem] text-clinical-stone">No optimal range</div>
    );
  }

  const dotColor = colorForFlag(flag);

  return (
    <div className="w-full">
      <div className="relative h-3 rounded-full overflow-hidden bg-clinical-cream">
        {/* Standard-low zone (red) */}
        <div className="absolute top-0 bottom-0 bg-[#C94F4F]/80" style={{ left: 0, width: `${layout.sLowPct}%` }} />
        {/* Monitor-low zone (amber) */}
        <div className="absolute top-0 bottom-0 bg-[#E8922A]/80" style={{ left: `${layout.sLowPct}%`, width: `${Math.max(0, layout.oLowPct - layout.sLowPct)}%` }} />
        {/* Optimal zone (green) */}
        <div className="absolute top-0 bottom-0 bg-[#2A9D8F]/80" style={{ left: `${layout.oLowPct}%`, width: `${Math.max(0, layout.oHighPct - layout.oLowPct)}%` }} />
        {/* Monitor-high zone (amber) */}
        <div className="absolute top-0 bottom-0 bg-[#E8922A]/80" style={{ left: `${layout.oHighPct}%`, width: `${Math.max(0, layout.sHighPct - layout.oHighPct)}%` }} />
        {/* Standard-high zone (red) */}
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
