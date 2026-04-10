// src/hooks/useHealthScore.ts
import { useMemo } from 'react';
import type { LabValue, HealthScore } from '../types';

export function useHealthScore(currentValues: LabValue[] | undefined, previousValues: LabValue[] | undefined): HealthScore | null {
  return useMemo(() => {
    if (!currentValues || currentValues.length === 0) return null;
    const scoreable = currentValues.filter(v => v.optimalLow !== null || v.optimalHigh !== null);
    if (scoreable.length === 0) return null;

    let optimalCount = 0, monitorCount = 0, urgentCount = 0;
    for (const v of scoreable) {
      if (v.optimalFlag === 'optimal') optimalCount++;
      else if (v.optimalFlag === 'suboptimal_low' || v.optimalFlag === 'suboptimal_high') monitorCount++;
      else if (v.optimalFlag === 'deficient' || v.optimalFlag === 'elevated') urgentCount++;
      else if (v.standardFlag === 'normal') optimalCount++;
      else monitorCount++;
    }

    const total = scoreable.length;
    const score = Math.round(((optimalCount * 1.0) + (monitorCount * 0.5)) / total * 100);

    let previousScore: number | undefined;
    if (previousValues && previousValues.length > 0) {
      const ps = previousValues.filter(v => v.optimalLow !== null || v.optimalHigh !== null);
      if (ps.length > 0) {
        let po = 0, pm = 0;
        for (const v of ps) { if (v.optimalFlag === 'optimal') po++; else if (v.optimalFlag?.includes('suboptimal')) pm++; }
        previousScore = Math.round(((po + pm * 0.5) / ps.length) * 100);
      }
    }

    const trend: HealthScore['trend'] = previousScore === undefined ? 'new' : score > previousScore ? 'up' : score < previousScore ? 'down' : 'stable';
    const label = score >= 85 ? 'Optimal' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : score >= 30 ? 'Poor' : 'Critical';
    const color = score >= 85 ? '#1B4332' : score >= 70 ? '#D4A574' : score >= 50 ? '#E8922A' : '#C94F4F';

    return { score, label, color, totalMarkers: total, optimalCount, monitorCount, urgentCount, trend, previousScore };
  }, [currentValues, previousValues]);
}
