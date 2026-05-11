// supabase/functions/_shared/rules/testTiers/baseline-shared.ts
//
// UNIVERSAL ADULT BASELINE (both sexes, 18+)
// ==========================================
// Standard-of-care annual labs every PCP will order without pushback.
// Each rule includes age gates so a 24-year-old gets age-appropriate
// scope and a 60-year-old gets age-appropriate additions.
//
// IMPORTANT: Baseline tests are NOT suppressed by prior draws.
// Retests are clinically essential — they show trajectory over time.
// A normal A1c last year doesn't mean skip A1c this year. The doctor
// prep prose layer surfaces prior values for the PCP's context, but
// the recommendation stands.
//
// The single exception is Lp(a) — AHA / ESC guidance is explicitly
// "measure once in lifetime" because it's a genetic marker that
// doesn't change. That rule keeps its suppression.

import type { TestIndication } from './types.ts';

export const BASELINE_SHARED: TestIndication[] = [
  // ── ANNUAL CORE LABS (every adult 18+, retested every visit) ────────
  // These 7 tests are unambiguous standard of care. Retest annually
  // (or per visit) to track trajectory. NO drawn-suppression.

  {
    id: 'baseline_cmp_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'cmp', whyShort: 'Standard adult baseline — kidney, liver, electrolytes, glucose, calcium in one panel', trigger: 'd' }],
  },
  {
    id: 'baseline_cbc_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'cbc', whyShort: 'Standard adult baseline — anemia, leukemia, platelet, inflammation screen', trigger: 'd' }],
  },
  {
    id: 'baseline_lipid_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'lipid_panel', whyShort: 'Adult CV baseline — USPSTF every 4-6y from 35; ACC/AHA from 20', trigger: 'd' }],
  },
  {
    id: 'baseline_a1c_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'hba1c', whyShort: 'Three-month average glucose — USPSTF B grade 35-70 with overweight; standard annual after 30', trigger: 'd' }],
  },
  {
    id: 'baseline_tsh_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'thyroid_panel', whyShort: 'Thyroid baseline — ATA recommends every 5y from 35; many PCPs annual', trigger: 'd' }],
  },
  {
    id: 'baseline_vit_d_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'vit_d_25oh', whyShort: 'Vitamin D status — 40%+ adult deficiency; drives mood, bone, immunity', trigger: 'd' }],
  },
  {
    id: 'baseline_iron_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'iron_panel', whyShort: 'Iron stores + transport — anemia/hemochromatosis screen; fatigue + hair loss anchor', trigger: 'd' }],
  },
  {
    id: 'baseline_rbc_mg_universal',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'rbc_magnesium', whyShort: 'Intracellular Mg — sleep, muscle, glucose handling, cardiac rhythm', trigger: 'e' }],
  },

  // ── CARDIOVASCULAR DEEPENING ────────────────────────────────────────
  // ApoB at 30+, hs-CRP and GGT at 40+. These move with diet/lifestyle
  // — retest annually to track.

  {
    id: 'baseline_apob_30plus',
    triggers: [{ kind: 'age_min', value: 30 }],
    tests: [{ key: 'apob', whyShort: 'Apolipoprotein B — counts actual atherogenic particles; better CV predictor than LDL', trigger: 'd' }],
  },
  {
    id: 'baseline_hs_crp_age40',
    triggers: [{ kind: 'age_min', value: 40 }],
    tests: [{ key: 'hs_crp', whyShort: 'CV / metabolic inflammation baseline at age 40+ — amplifies risk stratification', trigger: 'd' }],
  },
  {
    id: 'baseline_ggt_age40',
    triggers: [{ kind: 'age_min', value: 40 }],
    tests: [{ key: 'ggt', whyShort: 'Liver baseline at 40+ — sensitive marker for biliary stress, NAFLD, alcohol-related injury', trigger: 'd' }],
  },

  // ── Lp(a) — ONCE-IN-LIFETIME (the one exception) ────────────────────
  // AHA/ESC: measure once in every adult. Doesn't change — genetic.
  // This is the only baseline rule that keeps a drawn-suppression gate.
  {
    id: 'baseline_lp_a_once',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'lpADrawn' },
    ],
    tests: [{ key: 'lp_a', whyShort: 'Once-in-lifetime genetic CV risk marker — AHA/ESC: measure once in every adult; ~20% have elevated', trigger: 'd' }],
  },

  // ── B12 + Folate ────────────────────────────────────────────────────
  // Age 50+ universal. Earlier with depleter meds or signal.

  {
    id: 'baseline_b12_age50',
    triggers: [{ kind: 'age_min', value: 50 }],
    tests: [{ key: 'vit_b12_workup', whyShort: 'Age 50+ B12 baseline — gastric acid declines, absorption drops; functional test catches deficiency basic B12 misses', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_age50',
    triggers: [{ kind: 'age_min', value: 50 }],
    tests: [{ key: 'folate_workup', whyShort: 'Age 50+ folate baseline — dietary + absorption changes; Serum + RBC catches functional deficiency', trigger: 'd' }],
  },
  {
    id: 'baseline_b12_med_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
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
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'onMesalamine' },
        { kind: 'meds_match', pattern: /\bmethotrexate\b|\bsulfasalazine\b/i },
      ]},
    ],
    tests: [{ key: 'folate_workup', whyShort: 'On a folate depleter (mesalamine / methotrexate / sulfasalazine) — Serum + RBC folate', trigger: 'd' }],
  },
  {
    id: 'baseline_b12_signal_under_50',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 49 },
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
];
