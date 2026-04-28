// supabase/functions/_shared/goals.ts
// Single source of truth for user goal labels. Used by generate-wellness-plan
// and generate-doctor-prep to convert goal IDs into prompt-friendly text.
// Add new goals here once and they show up in both functions.

export const GOAL_LABELS: Record<string, string> = {
  understand_labs: 'Understand my bloodwork',
  energy: 'Fix my energy and brain fog',
  off_medications: 'Reduce my medications',
  hair_regrowth: 'Regrow my hair',
  heart_health: 'Improve heart health',
  gut_health: 'Fix my gut',
  weight: 'Lose weight',
  hormones: 'Balance my hormones',
  doctor_prep: 'Prepare for a doctor visit',
  longevity: 'Longevity and prevention',
  autoimmune: 'Manage autoimmune disease',
  pain: 'Reduce pain',
};

/** Format a list of goal IDs as a readable, comma-separated string. */
export function formatGoals(goalIds: string[] | null | undefined, fallback = 'Not specified'): string {
  if (!goalIds || goalIds.length === 0) return fallback;
  return goalIds.map(g => GOAL_LABELS[g] ?? g).join(', ');
}
