// src/lib/healthMode.ts
// Mirror of supabase/functions/_shared/healthMode.ts. Keep in sync.
// Threshold and flag list MUST match the server — otherwise Doctor Prep
// PDF variant might disagree with what the AI generated.

export const NEEDS_ATTENTION_FLAGS = new Set([
  'watch', 'low', 'high', 'critical_low', 'critical_high',
  'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated',
]);

export const HEALTHY_MODE_THRESHOLD = 0.25;

/**
 * Returns true if fewer than 25% of the user's markers need attention.
 * Accepts both camelCase (LabValue.optimalFlag) and snake_case (raw row)
 * shapes for convenience.
 */
export function isHealthyMode(
  labValues: Array<{ optimalFlag?: string | null; optimal_flag?: string | null }> | null | undefined,
): boolean {
  if (!labValues || labValues.length === 0) return false;
  const count = labValues.filter((v) => {
    const f = v.optimalFlag ?? v.optimal_flag;
    return f != null && NEEDS_ATTENTION_FLAGS.has(f);
  }).length;
  return (count / labValues.length) < HEALTHY_MODE_THRESHOLD;
}
