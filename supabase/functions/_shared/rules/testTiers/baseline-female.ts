// supabase/functions/_shared/rules/testTiers/baseline-female.ts
//
// FEMALE BASELINE — additions to baseline-shared
// ==============================================
// Sex-specific tests every adult female PCP will order or refer for.
// Age-gated by USPSTF / ACS / ACOG / ASRM guidelines.

import type { TestIndication } from './types.ts';

export const BASELINE_FEMALE: TestIndication[] = [
  // ── Cervical Cancer Screening (Pap smear, with HPV co-test if ≥30) ──
  // USPSTF A grade. ACA $0 coverage. Universal 21-65.
  {
    id: 'baseline_pap_female_21_65',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 21 },
      { kind: 'age_max', value: 65 },
    ],
    tests: [{ key: 'pap_smear_female_21_65', whyShort: 'Adult female 21-65 — Pap every 3y (21-29) or Pap + HPV co-test every 5y (30-65) per USPSTF / ACS', trigger: 'd' }],
  },

  // ── Thyroid Antibodies — female baseline ────────────────────────────
  // Women have 5-8× higher autoimmune-thyroid risk. Once-in-lifetime
  // baseline defensible per ATA and functional medicine consensus.
  {
    id: 'baseline_thyroid_ab_female',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
    ],
    tests: [{ key: 'thyroid_antibodies_female_baseline', whyShort: 'Adult female — 5-8× higher autoimmune-thyroid risk than men; antibodies often precede TSH drift by years', trigger: 'e' }],
  },

  // ── STI Screening — sexually active female ≤25 ──────────────────────
  // USPSTF B grade. Universal annual for sexually active women ≤24,
  // and high-risk older women. We fire age ≤25 as conservative default.
  {
    id: 'baseline_sti_female_under_25',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 25 },
    ],
    tests: [{ key: 'sti_screen_sexually_active', whyShort: 'Adult female ≤25 — annual chlamydia + gonorrhea screening per CDC / USPSTF', trigger: 'd' }],
  },

  // ── AMH (Anti-Müllerian Hormone) — reproductive-age baseline ────────
  // ASRM-supported. Reasonable baseline for any reproductive-age female
  // considering pregnancy planning or just wanting to know ovarian reserve.
  {
    id: 'baseline_amh_reproductive_age',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 30 },
      { kind: 'age_max', value: 42 },
    ],
    tests: [{ key: 'amh_reproductive_age', whyShort: 'Reproductive-age baseline (30-42) — ovarian reserve check; valuable for family planning discussions', trigger: 'e' }],
  },
];
