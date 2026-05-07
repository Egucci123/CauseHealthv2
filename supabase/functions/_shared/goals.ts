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

/** Goal-specific branching guidance for generate-wellness-plan. The wellness
 *  plan structure (workouts, today_actions, lifestyle_interventions, action
 *  plan phases) branches on the user's PRIMARY goal. Previously all 10
 *  paragraphs lived in the prompt; now only the relevant one is injected
 *  per call (~450 tokens saved on the other 9). */
export const GOAL_BRANCH: Record<string, string> = {
  longevity:       '3 zone-2 + 3 strength + 1 mobility/wk; protein 1g/lb; TRE 12-14h, 30g fiber, sauna, cold. Phases: metabolic (1) → strength+VO2max (2) → track (3).',
  energy:          'Light zone-2 weeks 1-4, ramp strength weeks 5-12, no HIIT until baseline. Morning sun, protein breakfast, no screens 1h pre-bed, cool bedroom. Phases: foundation (1) → production (2) → resilience (3).',
  weight:          '4 strength + 2-3 zone-2 low-impact; protein every meal, 10-min walk after meals, no liquid calories, TRE 14-16h. Phases: insulin sensitivity (1) → recomp (2) → maintenance (3).',
  hormones:        'Heavy compound strength 3x + zone-2 2x; sleep 8h, sun exposure, zinc/cholesterol-rich meals, BF% 12-18%(M)/18-25%(F), alcohol <3/wk. Phases: foundation (1) → optimize (2) → maintain (3).',
  gut_health:      'Gentle zone-2 + yoga weeks 1-4; chew thoroughly, stop eating 3h pre-bed, food/symptom journal, 30g fiber, fermented foods, low-FODMAP trial if relevant. Phases: triggers (1) → repair (2) → reintroduce (3).',
  off_medications: 'NEVER recommend stopping meds; work WITH the doctor toward reduction. Lifestyle changes for insulin resistance / BP / lipids. Phases: habits (1) → improvement (2) → revisit (3).',
  heart_health:    '4 zone-2 + 2 strength + flex; 30g fiber, omega-3 food, 30-min walk, home BP weekly, Mediterranean. Phases: lipid+inflammation (1) → cardio capacity (2) → maintain (3).',
  hair_regrowth:   'Protein at breakfast, scalp massage 5min/day, sleep 8h, iron-rich food; address ferritin <50, full thyroid, stress, no harsh treatments. Phases: nutrition (1) → scalp+cycle (2) → maintain (3).',
  autoimmune:      'Gentle zone-2 + strength, NO overtraining; anti-inflammatory diet, identify triggers, sleep non-negotiable. Phases: lower inflammation (1) → triggers (2) → remission (3).',
  pain:            'Gentle movement, build strength carefully, daily mobility; anti-inflammatory diet, omega-3, magnesium, sleep, stress, weight if relevant.',
  // Fallback for understand_labs / doctor_prep / unknown — no goal-specific
  // tilt, just use the universal rules in the system prompt.
  understand_labs: 'No goal-specific tilt — apply the universal rules; balance all body systems with no specific structural anchor.',
  doctor_prep:     'No goal-specific tilt — apply the universal rules; structure the plan around what the doctor needs to see at the next visit.',
};

/** Resolve the primary goal's branch paragraph. Returns the universal
 *  fallback if the goal isn't recognized. */
export function goalBranchFor(primaryGoal: string | null | undefined): string {
  const key = String(primaryGoal ?? '').trim();
  return GOAL_BRANCH[key] ?? GOAL_BRANCH.understand_labs;
}
