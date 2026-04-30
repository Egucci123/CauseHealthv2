// src/components/lab/OptimalRangeBar.tsx
// Range bar — shows where the patient's value falls relative to the
// STANDARD reference range (the lab's reported normal). The "optimal"
// functional-medicine range is no longer the basis of this chart per
// product direction: we don't flag values as concerning just because
// they fall outside a narrower "optimal" band when they're well within
// standard.

import { useEffect, useState } from 'react';

interface OptimalRangeBarProps {
  value: number;
  unit: string;
  // Kept for prop compatibility — no longer used to compute zones or labels.
  optimalLow?: number;
  optimalHigh?: number;
  standardLow?: number;
  standardHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  showLabels?: boolean;
}

type Zone = 'low' | 'in_range' | 'high';

function getZone(
  value: number,
  standardLow: number,
  standardHigh: number,
): Zone {
  if (value < standardLow) return 'low';
  if (value > standardHigh) return 'high';
  return 'in_range';
}

function getDotPosition(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export const OptimalRangeBar = ({
  value,
  unit,
  standardLow,
  standardHigh,
  criticalLow,
  criticalHigh,
  showLabels = true,
}: OptimalRangeBarProps) => {
  const [dotReady, setDotReady] = useState(false);

  // Without a standard range we can't draw a meaningful bar.
  if (standardLow == null || standardHigh == null) {
    return (
      <div className="flex gap-4">
        <span className="text-precision text-[0.68rem] text-clinical-stone">
          <span className="text-clinical-charcoal font-medium">
            Value: {value} {unit}
          </span>
        </span>
      </div>
    );
  }

  const zone = getZone(value, standardLow, standardHigh);

  // Bar spans from criticalLow (or 30% below standardLow) to criticalHigh
  // (or 2× standardHigh) so the dot has somewhere to go when it's well
  // outside the normal range.
  const standardSpan = standardHigh - standardLow;
  const absMin = criticalLow ?? Math.max(0, standardLow - standardSpan * 0.5);
  const absMax = criticalHigh ?? standardHigh + standardSpan * 0.5;
  const dotPosition = getDotPosition(value, absMin, absMax);

  useEffect(() => {
    const timer = setTimeout(() => setDotReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const totalRange = absMax - absMin;
  const lowWidth = ((standardLow - absMin) / totalRange) * 100;
  const inRangeWidth = ((standardHigh - standardLow) / totalRange) * 100;
  const highWidth = ((absMax - standardHigh) / totalRange) * 100;

  const dotClass = `range-bar-dot ${zone === 'in_range' ? 'optimal' : 'critical'}`;

  return (
    <div className="w-full">
      {/* The bar track */}
      <div className="range-bar-track relative" style={{ height: '8px' }}>
        {/* Below standard (rose) */}
        <div
          className="range-bar-zone bg-[#C94F4F] h-full"
          style={{
            width: `${lowWidth}%`,
            borderRadius: '4px 0 0 4px',
          }}
        />
        {/* Within standard (green) */}
        <div
          className="range-bar-zone bg-[#2A9D8F] h-full"
          style={{ width: `${inRangeWidth}%` }}
        />
        {/* Above standard (rose) */}
        <div
          className="range-bar-zone bg-[#C94F4F] h-full"
          style={{
            width: `${highWidth}%`,
            borderRadius: '0 4px 4px 0',
          }}
        />

        {/* Dot indicator */}
        <div
          className={dotClass}
          style={{
            left: dotReady ? `${dotPosition}%` : '0%',
            transition: dotReady
              ? 'left 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              : 'none',
          }}
        />
      </div>

      {/* Zone labels */}
      {showLabels && (
        <div className="flex justify-between mt-1 mb-3">
          <span className="text-precision text-[0.6rem] text-clinical-stone/60 uppercase tracking-wider">
            Low
          </span>
          <span className="text-precision text-[0.6rem] text-[#2A9D8F] uppercase tracking-wider font-bold">
            In Range
          </span>
          <span className="text-precision text-[0.6rem] text-clinical-stone/60 uppercase tracking-wider">
            High
          </span>
        </div>
      )}

      {/* Data row */}
      <div className="flex gap-6 mt-2">
        <span className="text-precision text-[0.68rem] text-clinical-stone">
          <span className="text-clinical-charcoal font-medium">
            Value: {value} {unit}
          </span>
        </span>
        <span className="text-precision text-[0.68rem] text-clinical-stone">
          Standard: {standardLow}–{standardHigh}
        </span>
      </div>
    </div>
  );
};
