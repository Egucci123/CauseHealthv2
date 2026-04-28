// src/lib/labComparison.ts
// Compare lab values across multiple draws to surface trends.

import { supabase } from './supabase';
import type { LabValue } from '../types';

export interface MarkerHistory {
  drawId: string;
  drawDate: string;
  value: number;
  unit: string | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  optimalFlag: LabValue['optimalFlag'];
}

export interface MarkerComparison {
  markerName: string;
  current: MarkerHistory;
  previous: MarkerHistory | null;
  delta: number | null;          // current.value - previous.value
  deltaPct: number | null;       // (current - previous) / previous × 100
  direction: 'improving' | 'declining' | 'stable' | null;
}

/**
 * Determine if a value moved toward or away from optimal range.
 * "Improving" = moved toward the optimal midpoint.
 */
export function trendDirection(
  current: number,
  previous: number,
  optimalLow: number | null,
  optimalHigh: number | null,
): MarkerComparison['direction'] {
  if (current === previous) return 'stable';
  // Without optimal range, we can't determine direction
  if (optimalLow == null || optimalHigh == null) return null;

  const optimalMid = (optimalLow + optimalHigh) / 2;
  const currentDist = Math.abs(current - optimalMid);
  const previousDist = Math.abs(previous - optimalMid);

  // If current is within optimal range and previous wasn't → improving
  const currentInRange = current >= optimalLow && current <= optimalHigh;
  const previousInRange = previous >= optimalLow && previous <= optimalHigh;
  if (currentInRange && !previousInRange) return 'improving';
  if (!currentInRange && previousInRange) return 'declining';

  // Otherwise compare distance to midpoint
  if (Math.abs(currentDist - previousDist) < 0.01) return 'stable';
  return currentDist < previousDist ? 'improving' : 'declining';
}

/**
 * Fetch all historical values for a specific marker for a user.
 * Used to render sparklines and trend comparisons.
 */
export async function fetchMarkerHistory(
  userId: string,
  markerName: string,
): Promise<MarkerHistory[]> {
  // Match marker name case-insensitively, also strip extra whitespace
  const { data, error } = await supabase
    .from('lab_values')
    .select('draw_id, marker_name, value, unit, optimal_low, optimal_high, optimal_flag, draw_date, lab_draws!inner(draw_date, processing_status)')
    .eq('user_id', userId)
    .ilike('marker_name', markerName.trim());

  if (error || !data) return [];

  // Map and filter to only completed draws
  const history: MarkerHistory[] = data
    .filter((row: any) => row.lab_draws?.processing_status === 'complete')
    .map((row: any) => ({
      drawId: row.draw_id,
      drawDate: row.lab_draws?.draw_date || row.draw_date,
      value: Number(row.value),
      unit: row.unit ?? null,
      optimalLow: row.optimal_low,
      optimalHigh: row.optimal_high,
      optimalFlag: row.optimal_flag,
    }))
    .filter((h: MarkerHistory) => !isNaN(h.value) && !!h.drawDate);

  // Sort oldest first for sparkline
  history.sort((a, b) => new Date(a.drawDate).getTime() - new Date(b.drawDate).getTime());
  return history;
}

/**
 * Fetch history for many markers at once. Returns a map keyed by lower-cased
 * marker name. Used by trajectory-strip components that render N markers
 * instead of running N individual queries.
 */
export async function fetchMarkerHistoryBatch(
  userId: string,
  markerNames: string[],
): Promise<Map<string, MarkerHistory[]>> {
  const out = new Map<string, MarkerHistory[]>();
  if (markerNames.length === 0) return out;

  // Use OR clause to fetch all markers in one round trip
  const orClause = markerNames.map(n => `marker_name.ilike.${n.trim().replace(/,/g, '')}`).join(',');
  const { data, error } = await supabase
    .from('lab_values')
    .select('draw_id, marker_name, value, unit, optimal_low, optimal_high, optimal_flag, draw_date, lab_draws!inner(draw_date, processing_status)')
    .eq('user_id', userId)
    .or(orClause);

  if (error || !data) return out;

  for (const row of data as any[]) {
    if (row.lab_draws?.processing_status !== 'complete') continue;
    const value = Number(row.value);
    if (isNaN(value)) continue;
    const drawDate = row.lab_draws?.draw_date || row.draw_date;
    if (!drawDate) continue;
    const key = (row.marker_name as string).toLowerCase();
    const list = out.get(key) ?? [];
    list.push({
      drawId: row.draw_id,
      drawDate,
      value,
      unit: row.unit ?? null,
      optimalLow: row.optimal_low,
      optimalHigh: row.optimal_high,
      optimalFlag: row.optimal_flag,
    });
    out.set(key, list);
  }

  // Sort each marker's history oldest -> newest
  for (const [k, list] of out) {
    list.sort((a, b) => new Date(a.drawDate).getTime() - new Date(b.drawDate).getTime());
    out.set(k, list);
  }
  return out;
}

/**
 * Build comparison object from a marker's history.
 * Compares the most recent draw to the immediately previous one.
 */
export function buildComparison(
  markerName: string,
  history: MarkerHistory[],
): MarkerComparison | null {
  if (history.length === 0) return null;

  // History is sorted oldest → newest. Current is last; previous is second-to-last.
  const current = history[history.length - 1];
  const previous = history.length >= 2 ? history[history.length - 2] : null;

  if (!previous) {
    return {
      markerName, current, previous: null, delta: null, deltaPct: null, direction: null,
    };
  }

  const delta = current.value - previous.value;
  const deltaPct = previous.value !== 0 ? (delta / previous.value) * 100 : null;
  const direction = trendDirection(current.value, previous.value, current.optimalLow, current.optimalHigh);

  return { markerName, current, previous, delta, deltaPct, direction };
}
