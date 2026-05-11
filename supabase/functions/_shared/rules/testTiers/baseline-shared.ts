// supabase/functions/_shared/rules/testTiers/baseline-shared.ts
//
// UNIVERSAL ADULT BASELINE (both sexes, 18+)
// ==========================================
// Standard-of-care annual labs every PCP will order without pushback.
// Each rule includes age gates so a 24-year-old gets age-appropriate
// scope and a 60-year-old gets age-appropriate additions.
//
// Tests are emitted only if NOT recently drawn-healthy (suppression
// via testInjectors flags). Every test on this list has either USPSTF
// backing, society guidelines (AHA/ACC/ATA/NLA), or such ubiquitous
// standard-of-care status that refusal is indefensible.

import type { TestIndication } from './types.ts';

export const BASELINE_SHARED: TestIndication[] = [
  // ── ANNUAL CORE LABS (every adult 18+) ──────────────────────────────
  // These 7 tests are the unambiguous standard for any adult primary
  // care visit. Every PCP runs these or near-equivalent panels yearly.

  {
    id: 'baseline_cmp_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'cmpDrawn' },
    ],
    tests: [{ key: 'cmp', whyShort: 'Standard adult baseline — kidney, liver, electrolytes, glucose, calcium in one panel', trigger: 'd' }],
  },
  {
    id: 'baseline_cbc_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'cbcDrawn' },
    ],
    tests: [{ key: 'cbc', whyShort: 'Standard adult baseline — anemia, leukemia, platelet, inflammation screen', trigger: 'd' }],
  },
  {
    id: 'baseline_lipid_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'lipidDrawn' },
    ],
    tests: [{ key: 'lipid_panel', whyShort: 'Adult CV baseline — USPSTF every 4-6y from 35; ACC/AHA from 20', trigger: 'd' }],
  },
  {
    id: 'baseline_a1c_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'a1cDrawn' },
    ],
    tests: [{ key: 'hba1c', whyShort: 'Three-month average glucose — USPSTF B grade 35-70 with overweight; standard annual after 30', trigger: 'd' }],
  },
  {
    id: 'baseline_tsh_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'tshDrawnHealthy' },
    ],
    tests: [{ key: 'thyroid_panel', whyShort: 'Thyroid baseline — ATA recommends every 5y from 35; many PCPs annual', trigger: 'd' }],
  },
  {
    id: 'baseline_vit_d_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'vitDDrawnHealthy' },
    ],
    tests: [{ key: 'vit_d_25oh', whyShort: 'Vitamin D status — 40%+ adult deficiency; drives mood, bone, immunity', trigger: 'd' }],
  },

  // ── IRON PANEL — universal adult baseline ───────────────────────────
  // Standard for fatigue/hair loss workup, hemochromatosis screen,
  // mandatory in menstruating women (caught downstream in female baseline).
  {
    id: 'baseline_iron_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'ironPanelDrawnHealthy' },
    ],
    tests: [{ key: 'iron_panel', whyShort: 'Iron stores + transport — anemia/hemochromatosis screen; fatigue + hair loss anchor', trigger: 'd' }],
  },

  // ── RBC MAGNESIUM — functional baseline ─────────────────────────────
  // More sensitive than serum Mg (only 1% of body Mg is serum). Defensible
  // universally for sleep, muscle, glucose, CV rhythm. Order: cash $50.
  {
    id: 'baseline_rbc_mg_universal',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'rbcMgDrawn' },
    ],
    tests: [{ key: 'rbc_magnesium', whyShort: 'Intracellular Mg — sleep, muscle, glucose handling, cardiac rhythm', trigger: 'e' }],
  },

  // ── CARDIOVASCULAR DEEPENING (age 30+) ──────────────────────────────
  // Below 30 we hold these unless risk factors fire — would over-medicalize
  // healthy young adults. At 30+ they become defensible baseline.

  {
    id: 'baseline_apob_30plus',
    triggers: [
      { kind: 'age_min', value: 30 },
      { kind: 'flag_false', flag: 'apoBDrawn' },
    ],
    tests: [{ key: 'apob', whyShort: 'Apolipoprotein B — counts actual atherogenic particles; better CV predictor than LDL', trigger: 'd' }],
  },
  {
    id: 'baseline_lp_a_once',
    // Once-in-lifetime genetic CV risk — fire for any adult ≥18, suppress
    // if drawn. AHA/ESC: measure once in every adult. ~20% have elevated.
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'lpADrawn' },
    ],
    tests: [{ key: 'lp_a', whyShort: 'Once-in-lifetime genetic CV risk marker — AHA/ESC: measure once in every adult; ~20% have elevated levels', trigger: 'd' }],
  },

  // ── HS-CRP — CV inflammation baseline (age 40+ OR risk) ─────────────
  // USPSTF "insufficient evidence" for everyone, but AHA/ACC for
  // intermediate-risk. We fire at 40+ universal, or earlier with signal.
  // Pattern layer can also trigger this for younger adults with risk.
  {
    id: 'baseline_hs_crp_age40',
    triggers: [
      { kind: 'age_min', value: 40 },
      { kind: 'flag_false', flag: 'hsCrpDrawnHealthy' },
    ],
    tests: [{ key: 'hs_crp', whyShort: 'CV / metabolic inflammation baseline at age 40+ — amplifies risk stratification', trigger: 'd' }],
  },

  // ── NUTRITIONAL BASELINE (age 50+) ──────────────────────────────────
  // B12 + folate become near-universal after 50 due to age-related
  // gastric atrophy + dietary changes + medication exposure. Below 50
  // we keep these signal-driven (handled in patterns).

  {
    id: 'baseline_b12_age50',
    triggers: [
      { kind: 'age_min', value: 50 },
      { kind: 'flag_false', flag: 'b12DrawnHealthy' },
    ],
    tests: [{ key: 'vit_b12_workup', whyShort: 'Age 50+ B12 baseline — gastric acid declines, absorption drops; functional test catches deficiency basic B12 misses', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_age50',
    triggers: [
      { kind: 'age_min', value: 50 },
      { kind: 'flag_false', flag: 'folateDrawnHealthy' },
    ],
    tests: [{ key: 'folate_workup', whyShort: 'Age 50+ folate baseline — dietary + absorption changes; Serum + RBC catches functional deficiency', trigger: 'd' }],
  },

  // ── Medication-induced baseline labs (any age, drug-triggered) ──────
  // These fire universally when the patient is on a known depleter,
  // regardless of age. Standard of care once a depleter is on board.

  {
    id: 'baseline_b12_med_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'b12DrawnHealthy' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'onMetformin' },
        { kind: 'flag_true', flag: 'onPPI' },
        { kind: 'flag_true', flag: 'onGLP1' },
      ]},
    ],
    tests: [{ key: 'vit_b12_workup', whyShort: 'On a B12 depleter (metformin / PPI / GLP-1) — Serum B12 + MMA + Homocysteine catches functional deficiency', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_med_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'folateDrawnHealthy' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'onMesalamine' },
        { kind: 'meds_match', pattern: /\bmethotrexate\b|\bsulfasalazine\b/i },
      ]},
    ],
    tests: [{ key: 'folate_workup', whyShort: 'On a folate depleter (mesalamine / methotrexate / sulfasalazine) — Serum + RBC folate', trigger: 'd' }],
  },

  // ── B12 + Folate signal-driven for younger adults ───────────────────
  // Below age 50, we keep these signal-gated so asymptomatic young
  // adults don't get over-tested. Vegan/IBD/macrocytic/neuropathy/
  // fatigue+brain-fog all justify the workup.

  {
    id: 'baseline_b12_signal_under_50',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 49 },
      { kind: 'flag_false', flag: 'b12DrawnHealthy' },
      { kind: 'any', of: [
        { kind: 'condition_match', pattern: /\b(vegan|vegetarian|ibd|crohn|colitis|celiac|gastric bypass|atrophic gastritis|pernicious anemia)/i },
        { kind: 'flag_true', flag: 'macrocytic' },
        { kind: 'symptom_match', pattern: /\b(tingling|numbness|neuropathy|muscle twitching)/i },
        { kind: 'all', of: [
          { kind: 'flag_true', flag: 'hasFatigue' },
          { kind: 'symptom_match', pattern: /\bbrain fog\b/i },
        ]},
      ]},
    ],
    tests: [{ key: 'vit_b12_workup', whyShort: 'Diet / GI / macrocytic / fatigue+brain-fog signal — Serum B12 + MMA + Homocysteine catches functional deficiency', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_signal_under_50',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 49 },
      { kind: 'flag_false', flag: 'folateDrawnHealthy' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'macrocytic' },
        { kind: 'condition_match', pattern: /\b(alcohol use|alcoholism|ibd|crohn|colitis|celiac|sprue|epilepsy|seizure)/i },
        { kind: 'meds_match', pattern: /\b(phenytoin|carbamazepine|valproate|valproic|primidone)/i },
        { kind: 'all', of: [
          { kind: 'sex', is: 'female' },
          { kind: 'symptom_match', pattern: /\bfertility concerns?|trying to conceive\b/i },
        ]},
      ]},
    ],
    tests: [{ key: 'folate_workup', whyShort: 'Macrocytic / alcohol / GI malabsorption / anti-epileptic / TTC signal — Serum + RBC folate', trigger: 'd' }],
  },

  // ── GGT — earlier than 40 if signal ─────────────────────────────────
  {
    id: 'baseline_ggt_signal_under_40',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 39 },
      { kind: 'flag_false', flag: 'ggtDrawn' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'altElevated' },
        { kind: 'flag_true', flag: 'astElevated' },
        { kind: 'flag_true', flag: 'bilirubinElevated' },
        { kind: 'flag_true', flag: 'onStatin' },
        { kind: 'condition_match', pattern: /\b(alcohol use|alcoholism|nafld|fatty liver|hepatitis|cirrhos)/i },
      ]},
    ],
    tests: [{ key: 'ggt', whyShort: 'Liver enzyme abnormal / statin / NAFLD / alcohol signal — GGT anchors hepatic workup', trigger: 'd' }],
  },

  // ── Thyroid panel with symptoms — fire if not drawn or sx present ───
  // Universal at any age if thyroid-pattern symptoms present, regardless
  // of TSH being drawn. Pattern layer also handles in-grey-zone TSH cases.
  {
    id: 'baseline_thyroid_panel_with_sx',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'thyroidFullDrawn' },
      { kind: 'symptom_match', pattern: /\b(fatigue|tired|hair (loss|thin)|cold|weight gain|brain fog|constipation)/i },
    ],
    tests: [{ key: 'thyroid_panel', whyShort: 'Thyroid-pattern symptoms — full panel (TSH + Free T4 + Free T3) rules in/out hypothyroid spectrum', trigger: 'd' }],
  },

  // ── GGT — liver enzyme baseline (age 40+) ───────────────────────────
  // Marker of biliary stress + NAFLD risk + alcohol exposure. Universal
  // standard of care for adults 40+. Pattern layer fires it earlier if
  // ALT/AST abnormal or on statin.
  {
    id: 'baseline_ggt_age40',
    triggers: [
      { kind: 'age_min', value: 40 },
      { kind: 'flag_false', flag: 'ggtDrawn' },
    ],
    tests: [{ key: 'ggt', whyShort: 'Liver baseline at 40+ — sensitive marker for biliary stress, NAFLD, alcohol-related injury', trigger: 'd' }],
  },
];
