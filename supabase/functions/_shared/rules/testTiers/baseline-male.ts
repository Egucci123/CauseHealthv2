// supabase/functions/_shared/rules/testTiers/baseline-male.ts
//
// MALE BASELINE — additions to baseline-shared
// ============================================
// Sex-specific tests every adult male PCP will order or refer for.
// Age-gated by current USPSTF / ACS / ACC guidelines.

import type { TestIndication } from './types.ts';

export const BASELINE_MALE: TestIndication[] = [
  // ── PSA — Prostate cancer screening ─────────────────────────────────
  // USPSTF C grade 55-69 (individualized discussion). Most PCPs offer at 50+.
  // Earlier (45+) for Black men and family history (USPSTF + ACS guidance).
  {
    id: 'baseline_psa_male_50_70',
    triggers: [
      { kind: 'sex', is: 'male' },
      { kind: 'age_min', value: 50 },
      { kind: 'age_max', value: 70 },
    ],
    tests: [{ key: 'psa_if_male_45', whyShort: 'Adult male 50-70 — PSA discussion per USPSTF C grade; standard PCP offering', trigger: 'd' }],
  },
  {
    id: 'baseline_psa_male_45_high_risk',
    // Black men / family history of prostate cancer — start at 45.
    triggers: [
      { kind: 'sex', is: 'male' },
      { kind: 'age_min', value: 45 },
      { kind: 'age_max', value: 49 },
      { kind: 'any', of: [
        { kind: 'condition_match', pattern: /\b(black|african[\s-]american|family history.*prostate|prostate cancer)/i },
      ]},
    ],
    tests: [{ key: 'psa_if_male_45', whyShort: 'Black men or family hx prostate cancer — start PSA at 45 per USPSTF / ACS', trigger: 'd' }],
  },

  // ── Future male-specific additions (testosterone baseline, etc.)
  //
  // NOTE: Universal Testosterone Panel for every adult male is debated.
  // Endocrine Society recommends only with symptoms (not universal screen).
  // We keep T panel symptom-driven via the pattern layer (low-libido,
  // erectile dysfunction, fatigue clusters) rather than as baseline.
];
