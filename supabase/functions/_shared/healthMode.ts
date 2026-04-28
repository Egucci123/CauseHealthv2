// supabase/functions/_shared/healthMode.ts
// Single source of truth for "is this user mostly healthy" detection.
// Used by analyze-labs, generate-wellness-plan, generate-doctor-prep —
// and the client-side mirror in src/lib/healthMode.ts (kept in sync).

/**
 * Flags that indicate a marker needs attention. Includes new (healthy/watch/
 * low/high/critical_*) and legacy (suboptimal_/deficient/elevated) values.
 */
export const NEEDS_ATTENTION_FLAGS = new Set([
  'watch', 'low', 'high', 'critical_low', 'critical_high',
  'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated',
]);

/** Threshold below which a user counts as 'healthy mode' (mostly fine). */
export const HEALTHY_MODE_THRESHOLD = 0.25;

/**
 * Returns true if fewer than 25% of the user's markers need attention.
 * Returns false for users with 0 lab values (can't classify).
 */
export function isHealthyMode(labValues: Array<{ optimal_flag?: string | null }>): boolean {
  if (!labValues || labValues.length === 0) return false;
  const count = labValues.filter((v) => v.optimal_flag != null && NEEDS_ATTENTION_FLAGS.has(v.optimal_flag)).length;
  return (count / labValues.length) < HEALTHY_MODE_THRESHOLD;
}
