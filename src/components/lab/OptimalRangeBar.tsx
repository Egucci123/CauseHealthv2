// src/components/lab/OptimalRangeBar.tsx
// THE signature UI element of CauseHealth.
// This appears on every single lab marker throughout the app

import { useEffect, useState } from 'react';

interface OptimalRangeBarProps {
  value: number;
  unit: string;
  optimalLow: number;
  optimalHigh: number;
  standardLow?: number;
  standardHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  showLabels?: boolean;
}

type Zone = 'critical' | 'warning' | 'optimal';

function getZone(
  value: number,
  optimalLow: number,
  optimalHigh: number,
): Zone {
  if (value >= optimalLow && value <= optimalHigh) return 'optimal';
  const distanceFromOptimal = Math.min(
    Math.abs(value - optimalLow),
    Math.abs(value - optimalHigh),
  );
  const optimalRange = optimalHigh - optimalLow;
  if (distanceFromOptimal > optimalRange * 0.5) return 'critical';
  return 'warning';
}

function getDotPosition(
  value: number,
  min: number,
  max: number,
): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export const OptimalRangeBar = ({
  value,
  unit,
  optimalLow,
  optimalHigh,
  standardLow,
  standardHigh,
  criticalLow,
  criticalHigh,
  showLabels = true,
}: OptimalRangeBarProps) => {
  const zone = getZone(value, optimalLow, optimalHigh);
  const [dotReady, setDotReady] = useState(false);

  // Determine the full range for the bar
  const absMin = criticalLow ?? standardLow ?? optimalLow * 0.3;
  const absMax = criticalHigh ?? standardHigh ?? optimalHigh * 2;

  const dotPosition = getDotPosition(value, absMin, absMax);

  // Animate dot to position after mount
  useEffect(() => {
    const timer = setTimeout(() => setDotReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Calculate zone widths as percentages of total range
  const totalRange = absMax - absMin;
  const deficientWidth = ((optimalLow - absMin) / totalRange) * 100;
  const optimalWidth = ((optimalHigh - optimalLow) / totalRange) * 100;
  const elevatedWidth = ((absMax - optimalHigh) / totalRange) * 100;

  // Split the non-optimal zones into low/high amber sections
  const lowAmberWidth = deficientWidth * 0.5;
  const deficientRoseWidth = deficientWidth * 0.5;
  const highAmberWidth = elevatedWidth * 0.5;
  const elevatedRoseWidth = elevatedWidth * 0.5;

  const dotClass = `range-bar-dot ${zone}`;

  return (
    <div className="w-full">
      {/* The bar track */}
      <div className="range-bar-track relative" style={{ height: '8px' }}>
        {/* Zone 1: Deficient (rose) */}
        <div
          className="range-bar-zone bg-[#C94F4F] h-full"
          style={{
            width: `${deficientRoseWidth}%`,
            borderRadius: '4px 0 0 4px',
          }}
        />
        {/* Zone 2: Suboptimal Low (amber) */}
        <div
          className="range-bar-zone bg-[#E8922A] h-full"
          style={{ width: `${lowAmberWidth}%` }}
        />
        {/* Zone 3: Optimal (gold) */}
        <div
          className="range-bar-zone bg-[#D4A574] h-full"
          style={{ width: `${optimalWidth}%` }}
        />
        {/* Zone 4: Suboptimal High (amber) */}
        <div
          className="range-bar-zone bg-[#E8922A] h-full"
          style={{ width: `${highAmberWidth}%` }}
        />
        {/* Zone 5: Elevated (rose) */}
        <div
          className="range-bar-zone bg-[#C94F4F] h-full"
          style={{
            width: `${elevatedRoseWidth}%`,
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
            Deficient
          </span>
          <span className="text-precision text-[0.6rem] text-[#D4A574] uppercase tracking-wider font-bold">
            Optimal
          </span>
          <span className="text-precision text-[0.6rem] text-clinical-stone/60 uppercase tracking-wider">
            Elevated
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
          Optimal: {optimalLow}–{optimalHigh}
        </span>
        {standardLow !== undefined && standardHigh !== undefined && (
          <span className="text-precision text-[0.68rem] text-clinical-stone">
            Standard: {standardLow}–{standardHigh}
          </span>
        )}
      </div>
    </div>
  );
};
