// supabase/functions/_shared/rules/testTiers/imaging.ts
//
// IMAGING STUDIES — separated for doctor-prep clarity
// ===================================================
// Imaging recommendations distinct from blood labs. Each is age-gated
// and condition/risk-gated. Doctor prep renders these in their own
// section so the PCP can write the imaging order separately.

import type { TestIndication } from './types.ts';

export const IMAGING_INDICATIONS: TestIndication[] = [
  // ── Mammogram — Female 40+ ──────────────────────────────────────────
  // USPSTF B grade 50-74; ACS recommends starting 40. We fire 40+ per
  // ACS since insurance covers under ACA preventive at $0.
  {
    id: 'imaging_mammogram_female_40',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 40 },
    ],
    tests: [{ key: 'mammogram_if_due', whyShort: 'Adult female ≥40 — annual mammogram per ACS / biennial per USPSTF (50-74)', trigger: 'd' }],
  },

  // ── DEXA Bone Density — universal rules ─────────────────────────────
  // USPSTF B grade: women ≥65, men ≥70 universal. Earlier with risk:
  // diagnosed osteoporosis, fragility fracture, chronic steroids,
  // hypogonadism, low BMI, IBD, hyperparathyroidism.
  {
    id: 'imaging_dexa_high_risk_universal',
    triggers: [
      { kind: 'any', of: [
        // Path A — risk-factor-driven (any age ≥50)
        { kind: 'all', of: [
          { kind: 'age_min', value: 50 },
          { kind: 'any', of: [
            { kind: 'condition_match', pattern: /\b(osteoporo\w*|osteopen\w*|fragility fracture|hip fracture|vertebral.*fracture|low.?T|hypogonad\w*|ibd|crohn|colitis|hyperparathyroid)/i },
            { kind: 'meds_match', pattern: /\b(prednisone|prednisolone|methylprednisolone|dexamethasone|hydrocortisone|anastrozole|letrozole|exemestane)/i },
          ]},
        ]},
        // Path B — female ≥65 universal (USPSTF)
        { kind: 'all', of: [
          { kind: 'sex', is: 'female' },
          { kind: 'age_min', value: 65 },
        ]},
        // Path C — male ≥70 universal (USPSTF)
        { kind: 'all', of: [
          { kind: 'sex', is: 'male' },
          { kind: 'age_min', value: 70 },
        ]},
      ]},
    ],
    tests: [{ key: 'dexa_female_65_or_risk', whyShort: 'USPSTF: women ≥65, men ≥70 universal. Earlier with diagnosed osteoporosis, fragility fx, chronic steroids, aromatase inhibitor, hypogonadism, low BMI, IBD, hyperparathyroidism.', trigger: 'b' }],
  },

  // ── Abdominal Aortic Aneurysm (AAA) Ultrasound — male 65-75 if ever-smoker
  // USPSTF B grade — one-time ultrasound. ACA $0 covered.
  // We can't reliably detect smoker status yet, so fire for male 65-75
  // and let the AI prose layer add the "if you ever smoked" caveat.
  // TODO: tighten when smoker flag is wired in.

  // ── Coronary Artery Calcium (CAC) — risk-driven, not universal ──────
  // Reasonable for intermediate-risk CV patients age 40-75. Not USPSTF-
  // mandated, but ACC/AHA risk calculator includes it. Pattern layer
  // already triggers this for lipid abnormality + age + family hx
  // combinations — so we don't duplicate here.
];
