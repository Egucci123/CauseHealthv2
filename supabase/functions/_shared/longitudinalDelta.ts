// supabase/functions/_shared/longitudinalDelta.ts
//
// LONGITUDINAL ENGINE — universal comparison between two lab draws.
//
// When a user uploads draw #2, we compare every marker against draw #1
// to surface progress. The whole point of paying for a 12-week retest is
// to see whether the plan worked — this engine produces the data the AI
// (and UI) use to tell that story.
//
// UNIVERSAL CONTRACT:
//   - Works for any marker name (no hardcoded test list)
//   - Works for any patient / any condition
//   - "Improved" / "worsened" is inferred from optimal_flag tier movement,
//     not from hardcoded "lower is better" / "higher is better" tables
//   - Handles new markers (in current but not prior), retired markers
//     (in prior but not current), and identical re-uploads
//
// The flag-tier severity ladder (already used across the codebase):
//   critical_low / critical_high  → 3 (worst)
//   low / high                    → 2
//   watch                         → 1
//   healthy                       → 0 (best)
// Severity decreased = improvement, regardless of which direction the
// number moved. The marker's own flag carries the directional knowledge.

export interface LabValueRow {
  marker_name?: string | null;
  value?: number | string | null;
  unit?: string | null;
  optimal_flag?: string | null;
  standard_flag?: string | null;
}

export type MovementDirection = 'improved' | 'worsened' | 'stable' | 'new_marker' | 'unclear';

export interface MarkerMovement {
  marker: string;
  unit: string;
  /** Numeric prior value, or null if non-numeric / missing. */
  prior_value: number | null;
  /** Numeric current value, or null if non-numeric / missing. */
  current_value: number | null;
  /** Raw values as displayed (preserves "<5", "positive", etc. for non-numerics). */
  prior_display: string;
  current_display: string;
  /** current - prior (signed). null if either is non-numeric. */
  delta: number | null;
  /** Percent change: (delta / prior) * 100. null if prior is 0 / non-numeric. */
  pct_change: number | null;
  /** Severity tier of each draw (0 = healthy, 3 = critical). */
  prior_tier: number;
  current_tier: number;
  /** Universal direction. Derived from tier movement, NOT from hardcoded
   *  per-marker direction rules. */
  direction: MovementDirection;
  /** Magnitude bucket — used by UI to decide what's "noteworthy". */
  magnitude: 'major' | 'moderate' | 'minor' | 'none';
}

export interface ProgressSummary {
  /** ISO date string of the prior draw. */
  prior_draw_date: string;
  /** Weeks between prior and current draws (rounded). */
  weeks_between: number;
  /** All markers present in BOTH draws, with their movements. */
  movements: MarkerMovement[];
  /** Markers in current but not in prior (new tests). */
  new_markers: string[];
  /** Markers in prior but not in current (no longer tested). */
  retired_markers: string[];
  /** High-level rollup counts for headlines / UI summary. */
  rollup: {
    improved: number;
    worsened: number;
    stable: number;
    total_compared: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TIER_MAP: Record<string, number> = {
  healthy: 0,
  optimal: 0,
  normal: 0,
  watch: 1,
  watchlist: 1,
  borderline: 1,
  low: 2,
  high: 2,
  abnormal: 2,
  out_of_range: 2,
  critical: 3,
  critical_low: 3,
  critical_high: 3,
  urgent: 3,
};

function tierFromFlag(flag: string | null | undefined): number {
  if (!flag) return -1; // unknown — caller decides what to do
  const key = String(flag).trim().toLowerCase().replace(/[\s-]/g, '_');
  return TIER_MAP[key] ?? -1;
}

function asNumber(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeMarkerName(name: any): string {
  return String(name ?? '').trim().toLowerCase();
}

/** Pick the most informative flag — prefer optimal_flag (tighter), fall back to standard_flag. */
function bestFlag(row: LabValueRow): string | null {
  return row.optimal_flag ?? row.standard_flag ?? null;
}

/** Magnitude bucket. Uses tier change first (most clinically meaningful),
 *  then falls back to percent change for stable-tier movements. */
function magnitudeOf(priorTier: number, currentTier: number, pctChange: number | null): MarkerMovement['magnitude'] {
  const tierJump = Math.abs(currentTier - priorTier);
  if (tierJump >= 2) return 'major';
  if (tierJump === 1) return 'moderate';
  if (pctChange === null) return 'none';
  const absPct = Math.abs(pctChange);
  if (absPct >= 25) return 'moderate';
  if (absPct >= 10) return 'minor';
  return 'none';
}

/** Universal direction inference from tier movement.
 *
 *  Rule: the SEVERITY tier reflects "how off-target" the value is. Going
 *  from a higher (worse) tier to a lower (better) tier = improvement —
 *  regardless of whether the raw number went up or down. This is universal
 *  because the flag system itself encodes per-marker directional knowledge
 *  (e.g. "high" flag for LDL vs "low" flag for vitamin D both mean "off
 *  target," and "healthy" means "in target" for both). */
function directionOf(priorTier: number, currentTier: number, pctChange: number | null): MovementDirection {
  // Both flags missing → can't say
  if (priorTier === -1 && currentTier === -1) return 'unclear';

  // One flag missing → check pct change as a fallback signal
  if (priorTier === -1 || currentTier === -1) {
    if (pctChange === null) return 'unclear';
    if (Math.abs(pctChange) < 5) return 'stable';
    return 'unclear'; // we can't say improved/worsened without direction context
  }

  if (currentTier < priorTier) return 'improved';
  if (currentTier > priorTier) return 'worsened';
  // Same tier — check pct change (small movement within tier)
  if (pctChange === null) return 'stable';
  if (Math.abs(pctChange) < 5) return 'stable';
  // Within the same tier, can't infer improved/worsened universally
  return 'stable';
}

// ── Main entry ────────────────────────────────────────────────────────────

/** Compute the longitudinal progress summary between two lab draws.
 *  Universal — doesn't care about marker names or conditions, just compares
 *  what's in both arrays.
 *
 *  @param current  Latest draw's lab_values rows
 *  @param prior    Prior draw's lab_values rows
 *  @param priorDrawDate  ISO date string of the prior draw
 *  @param currentDrawDate  ISO date string of the current draw (defaults to today)
 */
export function computeProgressDeltas(
  current: LabValueRow[],
  prior: LabValueRow[],
  priorDrawDate: string,
  currentDrawDate: string = new Date().toISOString().slice(0, 10),
): ProgressSummary {
  // Build name-keyed maps. If duplicates (rare), last write wins.
  const priorByName = new Map<string, LabValueRow>();
  for (const r of prior) {
    const k = normalizeMarkerName(r.marker_name);
    if (k) priorByName.set(k, r);
  }
  const currentByName = new Map<string, LabValueRow>();
  for (const r of current) {
    const k = normalizeMarkerName(r.marker_name);
    if (k) currentByName.set(k, r);
  }

  const movements: MarkerMovement[] = [];
  const newMarkers: string[] = [];

  // Markers in current — either matched in prior (movement) or new
  for (const [k, currentRow] of currentByName.entries()) {
    const priorRow = priorByName.get(k);
    if (!priorRow) {
      newMarkers.push(String(currentRow.marker_name ?? ''));
      continue;
    }
    const priorNum = asNumber(priorRow.value);
    const currentNum = asNumber(currentRow.value);
    const delta = (priorNum !== null && currentNum !== null) ? currentNum - priorNum : null;
    const pctChange = (delta !== null && priorNum !== null && priorNum !== 0) ? (delta / priorNum) * 100 : null;
    const priorTier = tierFromFlag(bestFlag(priorRow));
    const currentTier = tierFromFlag(bestFlag(currentRow));
    const direction = directionOf(priorTier, currentTier, pctChange);
    const magnitude = magnitudeOf(priorTier, currentTier, pctChange);
    movements.push({
      marker: String(currentRow.marker_name ?? priorRow.marker_name ?? ''),
      unit: String(currentRow.unit ?? priorRow.unit ?? ''),
      prior_value: priorNum,
      current_value: currentNum,
      prior_display: String(priorRow.value ?? ''),
      current_display: String(currentRow.value ?? ''),
      delta,
      pct_change: pctChange,
      prior_tier: priorTier,
      current_tier: currentTier,
      direction,
      magnitude,
    });
  }

  // Markers in prior but not in current (retired / no longer tested)
  const retiredMarkers: string[] = [];
  for (const [k, priorRow] of priorByName.entries()) {
    if (!currentByName.has(k)) {
      retiredMarkers.push(String(priorRow.marker_name ?? ''));
    }
  }

  // Sort movements: most-noteworthy first.
  // Order: improved-major, worsened-major, improved-moderate, worsened-moderate,
  // others by absolute pct change descending.
  const dirRank: Record<MovementDirection, number> = {
    worsened: 0,    // Doctor needs to see degradation first
    improved: 1,    // Then wins
    new_marker: 2,
    stable: 3,
    unclear: 4,
  };
  const magRank: Record<MarkerMovement['magnitude'], number> = {
    major: 0, moderate: 1, minor: 2, none: 3,
  };
  movements.sort((a, b) => {
    if (magRank[a.magnitude] !== magRank[b.magnitude]) return magRank[a.magnitude] - magRank[b.magnitude];
    if (dirRank[a.direction] !== dirRank[b.direction]) return dirRank[a.direction] - dirRank[b.direction];
    const aPct = a.pct_change != null ? Math.abs(a.pct_change) : 0;
    const bPct = b.pct_change != null ? Math.abs(b.pct_change) : 0;
    return bPct - aPct;
  });

  // Compute weeks between draws
  const priorMs = new Date(priorDrawDate + 'T00:00:00Z').getTime();
  const currentMs = new Date(currentDrawDate + 'T00:00:00Z').getTime();
  const weeksBetween = Number.isFinite(priorMs) && Number.isFinite(currentMs)
    ? Math.max(0, Math.round((currentMs - priorMs) / (7 * 24 * 60 * 60 * 1000)))
    : 0;

  // Rollup
  const rollup = {
    improved: movements.filter(m => m.direction === 'improved').length,
    worsened: movements.filter(m => m.direction === 'worsened').length,
    stable: movements.filter(m => m.direction === 'stable').length,
    total_compared: movements.length,
  };

  return {
    prior_draw_date: priorDrawDate,
    weeks_between: weeksBetween,
    movements,
    new_markers: newMarkers,
    retired_markers: retiredMarkers,
    rollup,
  };
}

/** Render the prior-draw context block for the AI prompt. Universal —
 *  produces the same shape for any patient. Returns empty string when
 *  there's no prior draw (first-time user). */
export function renderPriorDrawForPrompt(summary: ProgressSummary | null): string {
  if (!summary || summary.movements.length === 0) return '';
  const { prior_draw_date, weeks_between, movements, rollup, new_markers, retired_markers } = summary;
  // Cap at 25 noteworthy movements to keep prompt size sane
  const noteworthy = movements
    .filter(m => m.magnitude !== 'none')
    .slice(0, 25);
  const lines: string[] = [];
  lines.push('=== PRIOR DRAW BASELINE (this is a retest — interpret CHANGES, not just current values) ===');
  lines.push(`Prior draw: ${prior_draw_date} (${weeks_between} weeks ago)`);
  lines.push(`Movement summary: ${rollup.improved} markers improved, ${rollup.worsened} worsened, ${rollup.stable} stable (${rollup.total_compared} compared)`);
  if (new_markers.length > 0) lines.push(`New markers added this draw: ${new_markers.slice(0, 10).join(', ')}`);
  if (retired_markers.length > 0) lines.push(`No longer tested: ${retired_markers.slice(0, 10).join(', ')}`);
  if (noteworthy.length > 0) {
    lines.push('');
    lines.push('Noteworthy movements (sorted: worsened-major first, then improved-major, then by magnitude):');
    for (const m of noteworthy) {
      const deltaStr = m.delta !== null ? `${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}` : 'n/a';
      const pctStr = m.pct_change !== null ? ` (${m.pct_change >= 0 ? '+' : ''}${m.pct_change.toFixed(0)}%)` : '';
      lines.push(`  - ${m.marker}: ${m.prior_display} → ${m.current_display} ${m.unit} | Δ ${deltaStr}${pctStr} | tier ${m.prior_tier}→${m.current_tier} | ${m.direction.toUpperCase()} (${m.magnitude})`);
    }
  }
  lines.push('');
  lines.push('LONGITUDINAL REASONING DIRECTIVES (universal — apply to every retest):');
  lines.push('1. HEADLINE must reference progress narrative — what worked, what didn\'t. NOT just current state.');
  lines.push('2. SUMMARY (2-3 sentences) frames the win/loss story before the next-step asks.');
  lines.push('3. SUPPLEMENT_STACK: drop or downgrade supplements whose target marker has reached optimal (move to maintenance dose). Keep + intensify for markers that didn\'t move enough. Add new ones for newly-emergent issues.');
  lines.push('4. PREDICTED_CHANGES_AI: use ACTUAL response rate from this 12-week window to recalibrate next-12-week predictions. Don\'t use generic effect-size estimates when you have real patient data.');
  lines.push('5. SUSPECTED_CONDITIONS: re-evaluate. Some may resolve (drop them). New patterns may emerge from the new data.');
  lines.push('6. ALREADY_AT_GOAL_AI: any marker that just hit optimal in this draw goes here so we don\'t re-recommend interventions for it.');
  lines.push('7. MODE: if the patient improved on multiple critical markers, the mode may shift (treatment → optimization).');
  lines.push('=== END PRIOR DRAW BASELINE ===');
  return lines.join('\n');
}
