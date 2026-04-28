// src/hooks/useHealthScore.ts
import { useMemo } from 'react';
import type { LabValue, HealthScore } from '../types';

// Score weighting under the new Healthy / Watch / Out-of-range model.
// Healthy (within standard) = 1.0
// Watch (within standard but on Watch list) = 0.7 — still healthy, just
//   worth tracking. Old "suboptimal" was 0.5 which was too punitive given
//   how aggressive functional ranges are.
// Out of range mild (low/high) = 0.3
// Critical (critical_low/high, deficient, elevated) = 0
function weightFor(flag: string | null | undefined, standardFlag: string | null | undefined): number {
  if (!flag) {
    // No optimal flag — fall back to standard flag
    if (standardFlag === 'normal') return 1.0;
    if (standardFlag === 'low' || standardFlag === 'high') return 0.3;
    if (standardFlag === 'critical_low' || standardFlag === 'critical_high') return 0;
    return 1.0;
  }
  // New flags
  if (flag === 'healthy') return 1.0;
  if (flag === 'watch') return 0.7;
  if (flag === 'low' || flag === 'high') return 0.3;
  if (flag === 'critical_low' || flag === 'critical_high') return 0;
  // Legacy flags
  if (flag === 'optimal') return 1.0;
  if (flag === 'suboptimal_low' || flag === 'suboptimal_high') return 0.7;
  if (flag === 'deficient' || flag === 'elevated') return 0;
  return 1.0;
}

function bucketFor(flag: string | null | undefined): 'healthy' | 'watch' | 'out' {
  if (flag === 'healthy' || flag === 'optimal') return 'healthy';
  if (flag === 'watch' || flag === 'suboptimal_low' || flag === 'suboptimal_high') return 'watch';
  return 'out';
}

export function useHealthScore(currentValues: LabValue[] | undefined, previousValues: LabValue[] | undefined): HealthScore | null {
  return useMemo(() => {
    if (!currentValues || currentValues.length === 0) return null;
    const scoreable = currentValues.filter(v => v.standardLow !== null || v.standardHigh !== null || v.optimalLow !== null || v.optimalHigh !== null);
    if (scoreable.length === 0) return null;

    let optimalCount = 0, monitorCount = 0, urgentCount = 0;
    let weightedSum = 0;
    for (const v of scoreable) {
      weightedSum += weightFor(v.optimalFlag, v.standardFlag);
      const bucket = bucketFor(v.optimalFlag);
      if (bucket === 'healthy') optimalCount++;
      else if (bucket === 'watch') monitorCount++;
      else urgentCount++;
    }

    const total = scoreable.length;
    const score = Math.round((weightedSum / total) * 100);

    let previousScore: number | undefined;
    if (previousValues && previousValues.length > 0) {
      const ps = previousValues.filter(v => v.standardLow !== null || v.standardHigh !== null || v.optimalLow !== null || v.optimalHigh !== null);
      if (ps.length > 0) {
        let pSum = 0;
        for (const v of ps) pSum += weightFor(v.optimalFlag, v.standardFlag);
        previousScore = Math.round((pSum / ps.length) * 100);
      }
    }

    const trend: HealthScore['trend'] = previousScore === undefined ? 'new' : score > previousScore ? 'up' : score < previousScore ? 'down' : 'stable';
    const label = score >= 85 ? 'Healthy' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : score >= 30 ? 'Poor' : 'Critical';
    const color = score >= 85 ? '#1B4332' : score >= 70 ? '#D4A574' : score >= 50 ? '#E8922A' : '#C94F4F';

    return { score, label, color, totalMarkers: total, optimalCount, monitorCount, urgentCount, trend, previousScore };
  }, [currentValues, previousValues]);
}
