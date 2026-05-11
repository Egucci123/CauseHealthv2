// supabase/functions/_shared/borderlineDetector.ts
//
// BORDERLINE-ZONE DETECTOR — universal early-detection layer.
// ===========================================================
// Product positioning: CauseHealth catches the values that are still
// "in normal range" but pressed against either end of the range. A
// healthy doctor reading a paper report would see "in range" and move
// on; we surface it as a watch signal, paired with related markers and
// symptoms, so the user can ask informed questions.
//
// Zones, computed against the LAB'S OWN standard reference range
// (standard_low / standard_high columns on lab_values):
//
//                       ┌── range top 15% ──┐
//   reference_low────────────────────────────reference_high
//   ↓        ↓                  ↓            ↓        ↓
//   out_low  borderline_low    safe_zone    borderline_high  out_high
//
//   - borderline_low:   value within bottom 15% of the reference range
//   - borderline_high:  value within top 15% of the reference range
//   - safe_zone:        value in middle 70% of the reference range
//   - out_low / out_high: value outside the reference range entirely
//
// Why 15%: chosen so a typical lab range like Hgb 13.5–17.5 (men) gives
// a ~0.6 g/dL borderline zone at each end — clinically meaningful drift
// without false-flagging tiny mid-range fluctuations. Adjustable per-
// marker if a more conservative or aggressive zone is justified.
//
// IMPORTANT: this layer is INDEPENDENT of the legacy `optimal_flag`
// system. Optimal ranges were a "functional medicine" framing that
// didn't match how we want to position the product. Borderline zones
// are a universal observation about every lab value — no clinical
// opinion required, just "is this value pressed against either end
// of the range your own lab printed on the report?"

export type BorderlineZone =
  | 'out_low'
  | 'borderline_low'
  | 'safe_zone'
  | 'borderline_high'
  | 'out_high'
  | 'unknown';

export interface BorderlineInput {
  marker_name?: string | null;
  value?: number | string | null;
  standard_low?: number | string | null;
  standard_high?: number | string | null;
}

export interface BorderlineResult {
  marker: string;
  value: number | null;
  zone: BorderlineZone;
  /** Where in the range the value sits, 0.0 = at standard_low, 1.0 = at standard_high. */
  positionPct: number | null;
  /** True if the value sits within the configured borderline zone (top or bottom 15% by default). */
  isBorderline: boolean;
}

/** Default borderline-zone width as a fraction of the reference range.
 *  15% gives meaningful margin without false-flagging mid-range noise.
 *  Some markers (e.g. ferritin in males) override this — see PER_MARKER_OVERRIDES. */
const DEFAULT_BORDERLINE_PCT = 0.15;

/** Per-marker overrides for the borderline-zone width. Most markers use
 *  the default 15%; these have wider or narrower windows because the
 *  clinical literature supports a different threshold for "concerning
 *  drift" vs. "in safe range."
 *
 *  Marker patterns are anchored start-of-string so they never collide
 *  with compound markers (same regex hardening as canonical.ts). */
const PER_MARKER_OVERRIDES: Array<{ pattern: RegExp; pct: number }> = [
  // RBC indices: drift is meaningful at ~10% — early iron deficiency can
  // be missed if we wait for the bottom 15%.
  { pattern: /^mcv$|^mean corpuscular volume$/i, pct: 0.10 },
  { pattern: /^mch$|^mean corpuscular hemoglobin$/i, pct: 0.10 },
  { pattern: /^mchc$|^mean corpuscular hemoglobin concentration$/i, pct: 0.10 },
  // GGT: liver early-stress signal — keep tight 10% so it surfaces.
  { pattern: /^ggt$|^gamma[\s-]?glutamyl|^gamma\s*gt$/i, pct: 0.10 },
  // Fasting glucose: pre-prediabetic zone (90–99) is well-established;
  // 15% of typical lab range (70–99) would only flag 95+. Use 20% so
  // 90+ flags as borderline-high.
  { pattern: /^(?:fasting\s+)?glucose(?:,?\s*(?:serum|plasma|fasting|random))?$/i, pct: 0.20 },
  // Hemoglobin A1c: 5.4–5.6% pre-prediabetic zone. Lab range usually
  // 4.0–5.6, so 20% catches the well-established functional drift.
  { pattern: /^(?:hemoglobin\s*a1c|hba1c|hgba1c|a1c|glycated\s*hemoglobin)$/i, pct: 0.20 },
];

/** Look up the per-marker override or return the default. */
function widthFor(markerName: string): number {
  const lc = String(markerName ?? '');
  for (const o of PER_MARKER_OVERRIDES) {
    if (o.pattern.test(lc)) return o.pct;
  }
  return DEFAULT_BORDERLINE_PCT;
}

function num(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Classify a single lab value's borderline zone using the lab's own
 * reference range. Returns 'unknown' if reference bounds are missing
 * (some markers have only a low or only a high — handled below). */
export function detectBorderlineZone(input: BorderlineInput): BorderlineResult {
  const marker = String(input.marker_name ?? '');
  const value = num(input.value);
  const lo = num(input.standard_low);
  const hi = num(input.standard_high);

  if (value === null) {
    return { marker, value: null, zone: 'unknown', positionPct: null, isBorderline: false };
  }

  // No bounds at all — can't classify.
  if (lo === null && hi === null) {
    return { marker, value, zone: 'unknown', positionPct: null, isBorderline: false };
  }

  const pctWidth = widthFor(marker);

  // Out-of-range checks — independent of borderline width.
  if (lo !== null && value < lo) {
    return { marker, value, zone: 'out_low', positionPct: -1, isBorderline: false };
  }
  if (hi !== null && value > hi) {
    return { marker, value, zone: 'out_high', positionPct: 2, isBorderline: false };
  }

  // One-sided ranges (e.g., LDL: only standard_high; ferritin: only
  // standard_low). Check borderline against the bound that's defined.
  if (lo === null && hi !== null) {
    const window = hi * pctWidth;
    if (value >= hi - window) {
      return { marker, value, zone: 'borderline_high', positionPct: 1 - (hi - value) / window, isBorderline: true };
    }
    return { marker, value, zone: 'safe_zone', positionPct: 0.5, isBorderline: false };
  }
  if (hi === null && lo !== null) {
    const window = Math.max(Math.abs(lo) * pctWidth, 1);
    if (value <= lo + window) {
      return { marker, value, zone: 'borderline_low', positionPct: (value - lo) / window, isBorderline: true };
    }
    return { marker, value, zone: 'safe_zone', positionPct: 0.5, isBorderline: false };
  }

  // Two-sided range — the common case.
  const range = hi! - lo!;
  if (range <= 0) {
    return { marker, value, zone: 'unknown', positionPct: null, isBorderline: false };
  }
  const window = range * pctWidth;
  const positionPct = (value - lo!) / range;

  if (value <= lo! + window) {
    return { marker, value, zone: 'borderline_low', positionPct, isBorderline: true };
  }
  if (value >= hi! - window) {
    return { marker, value, zone: 'borderline_high', positionPct, isBorderline: true };
  }
  return { marker, value, zone: 'safe_zone', positionPct, isBorderline: false };
}

/** Helper: classify all labs in one pass. Used by buildPlan. */
export function detectBorderlineZones(
  labs: BorderlineInput[],
): Array<BorderlineResult & { rawIndex: number }> {
  return labs.map((l, i) => ({ ...detectBorderlineZone(l), rawIndex: i }));
}

/** Helper: filter to only the borderline-or-out values, sorted by
 *  proximity to the edge (most extreme first). Used by pattern rules
 *  to find "borderline-high or out-of-range" without listing every
 *  borderline value. */
export function getMeaningfulFlags(
  labs: BorderlineInput[],
): Array<BorderlineResult & { rawIndex: number }> {
  return detectBorderlineZones(labs)
    .filter((b) => b.zone !== 'safe_zone' && b.zone !== 'unknown')
    .sort((a, b) => {
      // Out-of-range first (positionPct -1 or 2), then borderline by edge proximity.
      const score = (r: BorderlineResult) =>
        r.zone === 'out_low' || r.zone === 'out_high' ? -1
        : r.zone === 'borderline_low' ? (r.positionPct ?? 0)
        : 1 - (r.positionPct ?? 1);
      return score(a) - score(b);
    });
}

/** Pretty-print helper for evidence strings: "MCV 86.1 fL (borderline-low)". */
export function describeFlag(b: BorderlineResult, unit?: string): string {
  const u = unit ? ` ${unit}` : '';
  switch (b.zone) {
    case 'out_low':         return `${b.marker} ${b.value}${u} (below range)`;
    case 'out_high':        return `${b.marker} ${b.value}${u} (above range)`;
    case 'borderline_low':  return `${b.marker} ${b.value}${u} (borderline-low)`;
    case 'borderline_high': return `${b.marker} ${b.value}${u} (borderline-high)`;
    default:                return `${b.marker} ${b.value}${u}`;
  }
}
