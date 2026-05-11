// supabase/functions/_shared/testIndications.ts
//
// UNIVERSAL DATA-DRIVEN TEST INDICATION REGISTRY
// ==============================================
// Replaces the hand-rolled if-chain in testInjectors.ts. Adding a new
// test-ordering pattern = ADD ONE ROW. No code edits to the engine.
//
// Architecture:
//
//   buildContextFlags(ctx)  — pre-computes a Flags object from raw input
//                             (already in testInjectors.ts; we re-use it)
//
//   TEST_INDICATIONS — the rows. Each one has:
//     • triggers (ALL must fire — uses `any`/`not` for OR/negation)
//     • tests (array of { key, whyShort, trigger })
//
//   evaluateTestIndications(f, ctx, add) — the one algorithm
//     • Iterates TEST_INDICATIONS
//     • Checks each row's triggers against pre-computed flags
//     • Emits each test via the `add` callback (legacy interface)
//
// Universal across every user. Same input → same output, byte-for-byte.

import type { InjectionContext } from './testInjectors.ts';

// ──────────────────────────────────────────────────────────────────────
// 1. TRIGGER LANGUAGE — small DSL for expressing the rule conditions
// ──────────────────────────────────────────────────────────────────────
//
// All Trigger variants are AND-combined inside an indication's `triggers`
// array. Use `any: [...]` for OR. Use `not: ...` for negation. That gives
// full boolean expressiveness without inventing more keywords.
//
// Flag names refer to keys on the Flags object returned by
// buildContextFlags(). Type-safety is loose by design — TypeScript can't
// fully verify string keys against the Flags shape, but the trade-off
// is worth it for the data-table readability.

export type FlagName = string;

export type Trigger =
  | { kind: 'age_min'; value: number }
  | { kind: 'age_max'; value: number }
  | { kind: 'age_known' }
  | { kind: 'sex'; is: 'male' | 'female' }
  | { kind: 'flag_true'; flag: FlagName }
  | { kind: 'flag_false'; flag: FlagName }
  | { kind: 'symptom_match'; pattern: RegExp }
  | { kind: 'condition_match'; pattern: RegExp }
  | { kind: 'meds_match'; pattern: RegExp }                            // raw medsLower regex
  | { kind: 'lab_value_between'; marker: RegExp; min: number; max: number }
  | { kind: 'lab_value_op'; marker: RegExp; op: '<' | '>' | '<=' | '>='; value: number }
  | { kind: 'tg_hdl_ratio_gte'; value: number }
  | { kind: 'any'; of: Trigger[] }
  | { kind: 'all'; of: Trigger[] }
  | { kind: 'not'; t: Trigger };

// Tier letter used by the legacy whyLong prefix `(trigger) whyShort`.
// Order roughly mirrors urgency: a = critical, b = condition-required,
// c = pattern-amplifier, d = baseline, e = early-detection.
export type TestTrigger = 'a' | 'b' | 'c' | 'd' | 'e';

export interface TestRef {
  /** Key into retestRegistry.ts. */
  key: string;
  /** 6–15-word patient-facing rationale. */
  whyShort: string;
  trigger: TestTrigger;
}

export interface TestIndication {
  /** Stable id for telemetry / debugging. */
  id: string;
  /** ALL must be true for the indication to fire. */
  triggers: Trigger[];
  /** Tests to emit when triggered. */
  tests: TestRef[];
}

// ──────────────────────────────────────────────────────────────────────
// 2. THE TABLE — every test recommendation lives here
// ──────────────────────────────────────────────────────────────────────
//
// Adding coverage for a new pattern = ADD A ROW. Use compound `any` /
// `not` triggers for OR / NOT. Group by category for readability only;
// order doesn't affect output.

export const TEST_INDICATIONS: TestIndication[] = [
  // ── UNIVERSAL ADULT BASELINE (age >= 18) ──────────────────────────
  // Each baseline test is its own row so the gate logic stays per-row.
  // Universal: if not drawn (or not drawn-healthy), include.

  {
    id: 'baseline_cmp',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'cmpDrawn' },
    ],
    tests: [{ key: 'cmp', whyShort: 'Standard adult baseline — liver, kidney, electrolytes, glucose, calcium', trigger: 'd' }],
  },
  {
    id: 'baseline_cbc',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'cbcDrawn' },
    ],
    tests: [{ key: 'cbc', whyShort: 'Standard adult baseline — red cells, white cells, platelets, inflammation patterns', trigger: 'd' }],
  },
  {
    id: 'baseline_lipid',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'lipidDrawn' },
    ],
    tests: [{ key: 'lipid_panel', whyShort: 'Standard adult cardiovascular risk panel — TC, LDL, HDL, TG, VLDL, non-HDL', trigger: 'd' }],
  },
  {
    id: 'baseline_a1c',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'a1cDrawn' },
    ],
    tests: [{ key: 'hba1c', whyShort: 'Three-month average blood sugar — catches dysglycemia before fasting glucose does', trigger: 'd' }],
  },
  {
    id: 'baseline_hs_crp',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'hsCrpDrawnHealthy' },
      // Signal-gated: only fire on cardiovascular risk, autoimmune, or
      // metabolic signal — not as a universal screen. USPSTF says
      // insufficient evidence for general-population screening.
      { kind: 'any', of: [
        { kind: 'age_min', value: 40 },
        { kind: 'condition_match', pattern: /\b(diabetes|hypertension|cad|coronary|stroke|tia|autoimmune|lupus|rheumatoid|psoriasis|ibd|crohn|colitis|family history.*coronary|family history.*cardiac)/i },
        { kind: 'flag_true', flag: 'ldlHigh' },
        { kind: 'flag_true', flag: 'tgHigh' },
        { kind: 'flag_true', flag: 'glucoseWatch' },
        { kind: 'flag_true', flag: 'hasJointSymptoms' },
      ]},
    ],
    tests: [{ key: 'hs_crp', whyShort: 'CV / metabolic / autoimmune signal — hs-CRP captures inflammation that amplifies risk', trigger: 'd' }],
  },
  {
    id: 'baseline_vit_d',
    triggers: [{ kind: 'age_min', value: 18 }],
    tests: [{ key: 'vit_d_25oh', whyShort: 'Vitamin D status — drives mood, immunity, bone, autoimmunity', trigger: 'd' }],
  },
  {
    id: 'baseline_b12_workup_no_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'b12DrawnHealthy' },
      // Signal-gated: only fire without an explicit B12 depleter med
      // when there's a real signal — vegan, age ≥65, macrocytic MCV,
      // tingling/neuropathy, fatigue cluster, IBD/celiac/malabsorption.
      // Asymptomatic young adults no longer get B12 workup by default.
      { kind: 'any', of: [
        { kind: 'age_min', value: 65 },
        { kind: 'condition_match', pattern: /\b(vegan|vegetarian|ibd|crohn|colitis|celiac|gastric bypass|atrophic gastritis|pernicious anemia)/i },
        { kind: 'flag_true', flag: 'macrocytic' },
        { kind: 'symptom_match', pattern: /\b(tingling|numbness|neuropathy|muscle twitching)/i },
        { kind: 'all', of: [
          { kind: 'flag_true', flag: 'hasFatigue' },
          { kind: 'symptom_match', pattern: /\bbrain fog\b/i },
        ]},
      ]},
    ],
    tests: [{ key: 'vit_b12_workup', whyShort: 'Age / diet / GI / macrocytic / fatigue+brain-fog signal — Serum B12 + MMA + Homocysteine catches functional deficiency the basic test misses', trigger: 'd' }],
  },
  {
    id: 'baseline_b12_workup_with_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'onMetformin' },
        { kind: 'flag_true', flag: 'onPPI' },
        { kind: 'flag_true', flag: 'onGLP1' },
      ]},
    ],
    tests: [{ key: 'vit_b12_workup', whyShort: 'On a B12 depleter (metformin / PPI / GLP-1) — Serum B12 + MMA + Homocysteine catches functional deficiency the basic test misses', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_workup_no_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'folateDrawnHealthy' },
      // Signal-gated: macrocytic, alcohol use, GI malabsorption, anti-
      // epileptics, methotrexate (caught upstream), or pregnancy planning.
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'macrocytic' },
        { kind: 'condition_match', pattern: /\b(alcohol use|alcoholism|ibd|crohn|colitis|celiac|sprue|epilepsy|seizure)/i },
        { kind: 'meds_match', pattern: /\b(phenytoin|carbamazepine|valproate|valproic|primidone|methotrexate|sulfasalazine|trimethoprim)/i },
        { kind: 'all', of: [
          { kind: 'sex', is: 'female' },
          { kind: 'symptom_match', pattern: /\bfertility concerns?|trying to conceive\b/i },
        ]},
      ]},
    ],
    tests: [{ key: 'folate_workup', whyShort: 'Macrocytic / alcohol / GI malabsorption / anti-epileptic / TTC signal — Serum + RBC folate', trigger: 'd' }],
  },
  {
    id: 'baseline_folate_workup_with_depleter',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'onMesalamine' },
        { kind: 'meds_match', pattern: /\bmethotrexate\b|\bsulfasalazine\b/i },
      ]},
    ],
    tests: [{ key: 'folate_workup', whyShort: 'On a folate depleter (mesalamine / methotrexate / sulfasalazine) — Serum + RBC folate catches the depletion before deficiency symptoms', trigger: 'd' }],
  },
  {
    id: 'baseline_iron_panel',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'ironPanelDrawnHealthy' },
      // Signal-gated: every menstruating female, plus signal-based for
      // both sexes (fatigue, hair loss, restless legs, IBD/celiac,
      // microcytic, vegan/vegetarian, age ≥65 for occult-loss screen).
      { kind: 'any', of: [
        { kind: 'all', of: [
          { kind: 'sex', is: 'female' },
          { kind: 'age_min', value: 18 },
          { kind: 'age_max', value: 55 },
        ]},
        { kind: 'flag_true', flag: 'hasFatigue' },
        { kind: 'flag_true', flag: 'hasHairLoss' },
        { kind: 'flag_true', flag: 'microcytic' },
        { kind: 'symptom_match', pattern: /\brestless legs\b/i },
        { kind: 'condition_match', pattern: /\b(ibd|crohn|colitis|celiac|vegan|vegetarian|gastric bypass)/i },
        { kind: 'age_min', value: 65 },
      ]},
    ],
    tests: [{ key: 'iron_panel', whyShort: 'Menstruating female / fatigue / hair loss / restless legs / GI malabsorption / age 65+ — iron stores + transport', trigger: 'd' }],
  },
  {
    id: 'baseline_ggt',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'ggtDrawn' },
      // Signal-gated: any liver-enzyme abnormality, alcohol concern,
      // statin user (rhabdo monitoring), known NAFLD, or BMI ≥30.
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'altElevated' },
        { kind: 'flag_true', flag: 'astElevated' },
        { kind: 'flag_true', flag: 'bilirubinElevated' },
        { kind: 'flag_true', flag: 'onStatin' },
        { kind: 'condition_match', pattern: /\b(alcohol use|alcoholism|nafld|fatty liver|hepatitis|cirrhos)/i },
      ]},
    ],
    tests: [{ key: 'ggt', whyShort: 'Liver enzyme abnormal / statin / NAFLD / alcohol signal — GGT anchors the hepatic workup', trigger: 'd' }],
  },
  {
    id: 'baseline_thyroid_no_full',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'thyroidFullDrawn' },
    ],
    tests: [{ key: 'thyroid_panel', whyShort: 'Full thyroid function — TSH alone misses central hypothyroidism + impaired T4→T3 conversion', trigger: 'd' }],
  },
  {
    id: 'baseline_thyroid_tsh_with_sx',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'tshDrawnHealthy' },
      { kind: 'symptom_match', pattern: /\b(fatigue|tired|hair (loss|thin)|cold|weight gain|brain fog|constipation)/i },
    ],
    tests: [{ key: 'thyroid_panel', whyShort: 'Thyroid-pattern symptoms with TSH not yet drawn-healthy — full thyroid panel rules in/out autoimmune thyroiditis', trigger: 'd' }],
  },
  {
    id: 'baseline_rbc_mg',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'rbcMgDrawn' },
    ],
    tests: [{ key: 'rbc_magnesium', whyShort: 'Intracellular Mg — sleep, muscle, glucose handling, cardiovascular rhythm', trigger: 'd' }],
  },
  {
    id: 'baseline_lp_a',
    triggers: [
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'lpADrawn' },
    ],
    tests: [{ key: 'lp_a', whyShort: 'Once-in-lifetime genetic CV risk marker — flags risk a normal lipid panel misses', trigger: 'd' }],
  },

  // ── Condition-driven tests ─────────────────────────────────────────
  {
    id: 'ibd_fecal_calprotectin',
    triggers: [{ kind: 'flag_true', flag: 'hasIBD' }],
    tests: [{ key: 'fecal_calprotectin', whyShort: 'IBD disease-activity marker — quarterly monitoring catches flares before symptoms', trigger: 'e' }],
  },
  {
    id: 'gi_sx_no_ibd_celiac',
    triggers: [
      { kind: 'flag_true',  flag: 'hasGISymptoms' },
      { kind: 'flag_false', flag: 'hasIBD' },
    ],
    tests: [{ key: 'celiac_serology', whyShort: 'Persistent GI symptoms without IBD dx — rules out celiac before workup escalates', trigger: 'a' }],
  },
  {
    id: 'hashimoto_antibodies',
    triggers: [{ kind: 'flag_true', flag: 'hasHashimotos' }],
    tests: [{ key: 'thyroid_antibodies', whyShort: 'Diagnosed Hashimotos — TPO + Tg Ab quantify autoimmune burden, track treatment response', trigger: 'b' }],
  },
  {
    id: 't2d_uacr',
    triggers: [{ kind: 'flag_true', flag: 'hasT2D' }],
    tests: [{ key: 'uacr', whyShort: 'Diagnosed T2D — UACR is the earliest sign of diabetic kidney disease (microalbuminuria)', trigger: 'b' }],
  },
  {
    id: 'htn_uacr',
    triggers: [{ kind: 'flag_true', flag: 'hasHTN' }],
    tests: [{ key: 'uacr', whyShort: 'Diagnosed hypertension — UACR catches early hypertensive nephropathy before creatinine rises', trigger: 'b' }],
  },
  {
    id: 'ckd_cystatin',
    triggers: [{ kind: 'flag_true', flag: 'hasCKD' }],
    tests: [{ key: 'cystatin_c_egfr', whyShort: 'Diagnosed CKD — cystatin-C-based eGFR is more accurate than creatinine in muscle-low patients', trigger: 'b' }],
  },
  {
    id: 'ckd_uacr',
    triggers: [{ kind: 'flag_true', flag: 'hasCKD' }],
    tests: [{ key: 'uacr', whyShort: 'Diagnosed CKD — quarterly UACR tracks proteinuria progression', trigger: 'b' }],
  },
  {
    id: 'ckd_pth',
    triggers: [{ kind: 'flag_true', flag: 'hasCKD' }],
    tests: [{ key: 'pth', whyShort: 'CKD bone-mineral disorder — PTH rises before calcium/phosphate change', trigger: 'b' }],
  },
  {
    id: 'lupus_ana',
    triggers: [{ kind: 'flag_true', flag: 'hasLupus' }],
    tests: [
      { key: 'ana_reflex', whyShort: 'Diagnosed lupus — ANA reflex titer + dsDNA Ab track flare activity', trigger: 'b' },
      { key: 'esr',         whyShort: 'Lupus / autoimmune monitoring — ESR pairs with hs-CRP for inflammatory burden', trigger: 'b' },
    ],
  },
  {
    id: 'ra_panel',
    triggers: [{ kind: 'flag_true', flag: 'hasRA' }],
    tests: [
      { key: 'rf_anti_ccp', whyShort: 'Diagnosed RA — anti-CCP + RF inform prognosis and biologic eligibility', trigger: 'b' },
      { key: 'esr',         whyShort: 'RA monitoring — ESR + hs-CRP track joint-inflammation activity', trigger: 'b' },
    ],
  },
  {
    id: 'osteo_workup',
    triggers: [{ kind: 'flag_true', flag: 'hasOsteo' }],
    tests: [
      { key: 'ctx_telopeptide', whyShort: 'Diagnosed osteoporosis — CTX bone-resorption marker tracks treatment response faster than DEXA', trigger: 'b' },
      { key: 'pth',             whyShort: 'Osteoporosis workup — secondary hyperparathyroidism is a missed reversible cause', trigger: 'b' },
      { key: 'ionized_calcium', whyShort: 'Pairs with PTH for parathyroid evaluation in bone-density loss', trigger: 'b' },
    ],
  },
  {
    id: 'cad_cac',
    triggers: [{ kind: 'flag_true', flag: 'hasCAD' }],
    tests: [{ key: 'cac_score', whyShort: 'Diagnosed CAD — CAC quantifies calcified plaque burden and informs statin intensity', trigger: 'b' }],
  },

  // ── Age + sex screening ───────────────────────────────────────────
  {
    id: 'psa_male_45',
    triggers: [
      { kind: 'age_known' },
      { kind: 'sex', is: 'male' },
      { kind: 'age_min', value: 45 },
    ],
    tests: [{ key: 'psa_if_male_45', whyShort: 'Adult male ≥45 — PSA baseline screens for prostate disease per AUA shared-decision guidelines', trigger: 'd' }],
  },
  {
    id: 'mammogram_female_40',
    triggers: [
      { kind: 'age_known' },
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 40 },
    ],
    tests: [{ key: 'mammogram_if_due', whyShort: 'Adult female ≥40 — annual mammogram per ACS / USPSTF', trigger: 'd' }],
  },

  // ── Female standard-of-care baseline ──────────────────────────────
  // Universal: every adult female should have these in her baseline
  // conversation with her PCP. Adding rows in this section covers any
  // female user regardless of what labs / symptoms / conditions she has.
  {
    id: 'pap_female_21_65',
    triggers: [
      { kind: 'age_known' },
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 21 },
      { kind: 'age_max', value: 65 },
    ],
    tests: [{ key: 'pap_smear_female_21_65', whyShort: 'Adult female 21–65 — Pap every 3 years (21–29) or Pap + HPV co-test every 5 years (30–65) per USPSTF / ACS', trigger: 'd' }],
  },
  {
    id: 'thyroid_antibodies_female_baseline',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'hasHashimotos' },
    ],
    tests: [{ key: 'thyroid_antibodies_female_baseline', whyShort: 'Adult female baseline — women have 5–8× higher autoimmune-thyroid risk than men; antibodies often precede TSH drift by years', trigger: 'e' }],
  },
  {
    id: 'dexa_female_65',
    triggers: [
      { kind: 'age_known' },
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 65 },
    ],
    tests: [{ key: 'dexa_female_65_or_risk', whyShort: 'Adult female ≥65 — USPSTF universal bone-density screen', trigger: 'd' }],
  },
  // STI screening for sexually active women < 25 is preventive guideline.
  // We do not currently collect sexual activity in onboarding; the
  // baseline reminder fires for 18–25 universally and the patient
  // discusses applicability with her PCP.
  {
    id: 'sti_screen_female_under_25',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 25 },
    ],
    tests: [{ key: 'sti_screen_sexually_active', whyShort: 'Adult female ≤25 — annual chlamydia + gonorrhea screening if sexually active per CDC / USPSTF', trigger: 'd' }],
  },

  // ── Medication-driven monitoring ──────────────────────────────────
  {
    id: 'steroid_dexa',
    triggers: [{ kind: 'flag_true', flag: 'onSteroid' }],
    tests: [{ key: 'dexa_if_long_term', whyShort: 'On chronic oral steroid — DEXA every 1–2 yr per ACR glucocorticoid-induced osteoporosis guideline', trigger: 'b' }],
  },
  {
    id: 'anticoagulant_inr',
    triggers: [{ kind: 'flag_true', flag: 'onAnticoagulant' }],
    tests: [{ key: 'inr_if_warfarin', whyShort: 'On anticoagulant — INR monitoring frequency dictated by drug class', trigger: 'b' }],
  },

  // ── Lipid-pattern follow-up (ApoB) ─────────────────────────────────
  {
    id: 'apob_statin',
    triggers: [
      { kind: 'flag_true',  flag: 'onStatin' },
      { kind: 'flag_false', flag: 'apoBDrawn' },
    ],
    tests: [{ key: 'apob', whyShort: 'On statin — ApoB measures particle count directly. Target <80 on statin; if higher, dose may be inadequate.', trigger: 'b' }],
  },
  {
    id: 'apob_lipid_abnormality',
    triggers: [
      { kind: 'flag_false', flag: 'onStatin' },
      { kind: 'flag_false', flag: 'apoBDrawn' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'tgHigh' },
        { kind: 'flag_true', flag: 'ldlHigh' },
        { kind: 'flag_true', flag: 'hdlLow'  },
      ]},
    ],
    tests: [{ key: 'apob', whyShort: 'Lipid abnormality — ApoB quantifies plaque-forming particle count, better predictor than LDL-C alone.', trigger: 'c' }],
  },

  // ── Hepatic patterns ──────────────────────────────────────────────
  {
    id: 'liver_us_alt_doubled_or_alt_tg',
    triggers: [{ kind: 'any', of: [
      { kind: 'flag_true', flag: 'altDoubled' },
      { kind: 'all' as any, of: [           // legacy AND helper
        { kind: 'flag_true', flag: 'altElevated' },
        { kind: 'flag_true', flag: 'tgHigh' },
      ]} as any,
    ]}],
    tests: [{ key: 'liver_ultrasound', whyShort: 'ALT >2x normal or ALT elevated with high triglycerides — non-invasive imaging to rule out fatty liver', trigger: 'c' }],
  },

  // ── Statin monitoring (CK) ────────────────────────────────────────
  {
    id: 'ck_statin_with_sx',
    triggers: [
      { kind: 'flag_true',  flag: 'onStatin' },
      { kind: 'flag_false', flag: 'ckDrawn' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'hasMuscleSymptoms' },
        { kind: 'flag_true', flag: 'hasJointSymptoms' },
      ]},
    ],
    tests: [{ key: 'ck_statin_baseline', whyShort: 'On statin + muscle/joint symptoms — rules out statin-induced myopathy', trigger: 'b' }],
  },
  {
    id: 'ck_statin_no_sx',
    triggers: [
      { kind: 'flag_true',  flag: 'onStatin' },
      { kind: 'flag_false', flag: 'ckDrawn' },
      { kind: 'not', t: { kind: 'any', of: [
        { kind: 'flag_true', flag: 'hasMuscleSymptoms' },
        { kind: 'flag_true', flag: 'hasJointSymptoms' },
      ]}},
    ],
    tests: [{ key: 'ck_statin_baseline', whyShort: 'On statin — routine baseline + 12-week follow-up per AHA/ACC monitoring', trigger: 'b' }],
  },

  // ── Metabolic syndrome amplifiers ─────────────────────────────────
  {
    id: 'uric_acid_metabolic',
    triggers: [
      { kind: 'flag_true', flag: 'tgHigh' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'glucoseWatch' },
        { kind: 'flag_true', flag: 'hdlLow' },
      ]},
      { kind: 'flag_false', flag: 'uricAcidDrawn' },
    ],
    tests: [{ key: 'uric_acid', whyShort: 'Metabolic syndrome pattern — gout risk + cardiovascular risk amplifier', trigger: 'c' }],
  },

  // ── Sleep apnea screen on polycythemia + pattern ──────────────────
  {
    id: 'sleep_apnea_polycythemia',
    triggers: [
      { kind: 'flag_true', flag: 'rbcElevated' },
      { kind: 'flag_true', flag: 'hctElevated' },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'tgHigh' },
        { kind: 'flag_true', flag: 'glucoseWatch' },
        { kind: 'flag_true', flag: 'hasSleepIssues' },
        { kind: 'flag_true', flag: 'hasWeightIssues' },
      ]},
    ],
    tests: [{ key: 'sleep_apnea_screening', whyShort: 'Elevated RBC + Hct with insulin resistance / sleep / weight pattern — possible obstructive sleep apnea', trigger: 'e' }],
  },

  // ── Anemia subtyping ───────────────────────────────────────────────
  {
    id: 'macrocytic_b_vitamin_workup',
    triggers: [{ kind: 'flag_true', flag: 'macrocytic' }],
    tests: [{ key: 'b_vitamin_workup_macrocytic', whyShort: 'MCV elevated — macrocytic pattern points to B12 or folate deficiency', trigger: 'c' }],
  },
  {
    id: 'microcytic_hgb_electrophoresis',
    triggers: [{ kind: 'flag_true', flag: 'microcytic' }],
    tests: [{ key: 'hgb_electrophoresis', whyShort: 'MCV low — if iron panel normal, screens for thalassemia trait', trigger: 'c' }],
  },

  // ── PTH + ionized Ca on severe Vit D or osteo ─────────────────────
  // Strict gating universal: severely deficient Vit D, OR known bone
  // disease, OR specific bone pain / fracture — not generic stiffness.
  {
    id: 'pth_osteo',
    triggers: [{ kind: 'flag_true', flag: 'hasOsteo' }],
    tests: [
      { key: 'pth',             whyShort: 'Diagnosed bone disease — rules out secondary hyperparathyroidism', trigger: 'c' },
      { key: 'ionized_calcium', whyShort: 'Pairs with PTH for hyperparathyroidism workup', trigger: 'c' },
    ],
  },
  {
    id: 'pth_severe_vitd',
    triggers: [
      { kind: 'flag_true', flag: 'vitaminDLow' },
      { kind: 'lab_value_op', marker: /\b(25.?hydroxy|vitamin d)/i, op: '<', value: 20 },
    ],
    tests: [
      { key: 'pth',             whyShort: 'Vit D severely low (<20) — rules out secondary hyperparathyroidism', trigger: 'c' },
      { key: 'ionized_calcium', whyShort: 'Pairs with PTH for hyperparathyroidism workup', trigger: 'c' },
    ],
  },
  {
    id: 'pth_bone_pain_fracture',
    triggers: [
      { kind: 'flag_true', flag: 'vitaminDLow' },
      { kind: 'any', of: [
        { kind: 'symptom_match',   pattern: /\b(bone pain|fracture|osteopenia|low bone density|stress fracture)\b/i },
        { kind: 'condition_match', pattern: /\b(bone pain|fracture|osteopenia)\b/i },
      ]},
    ],
    tests: [
      { key: 'pth',             whyShort: 'Bone pain or fracture history + low Vit D — rules out secondary hyperparathyroidism', trigger: 'c' },
      { key: 'ionized_calcium', whyShort: 'Pairs with PTH for hyperparathyroidism workup', trigger: 'c' },
    ],
  },

  // ── Adult male hormonal baseline ──────────────────────────────────
  {
    id: 'male_hormonal_no_trt',
    triggers: [
      { kind: 'sex', is: 'male' },
      { kind: 'age_min', value: 18 },
      { kind: 'flag_false', flag: 'onTRT' },
      { kind: 'any', of: [
        { kind: 'flag_false', flag: 'totalTestosteroneDrawnHealthy' },
        { kind: 'symptom_match', pattern: /\b(low libido|sex drive|erect|fatigue|weight gain|weight resist)/i },
      ]},
    ],
    tests: [{ key: 'testosterone_panel_male', whyShort: 'Comprehensive male hormonal baseline — Total + Free + Bioavailable + SHBG + Estradiol + LH + FSH', trigger: 'd' }],
  },

  // ── PCOS panel — adult female with PCOS-specific pattern ──────────
  //
  // Tightened 2026-05-12-5: amenorrhea / missed period / infertility
  // alone NO LONGER trigger PCOS (those signals are better-served by
  // the dedicated prolactin / POI / ovarian-reserve workups below).
  // PCOS panel now requires a true PCOS-specific marker:
  //   • Named condition (PCOS / polycystic ovary)
  //   • Hyperandrogenism signal (acne + hirsutism / excess hair)
  //   • Irregular cycles PAIRED WITH an insulin-resistance signal
  //     (weight resistance, A1c 5.4–6.4, BMI ≥27, or stated PCOS workup)
  {
    id: 'pcos_panel_female_pattern',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'any', of: [
        // Path A — already-named condition
        { kind: 'condition_match', pattern: /\b(pcos|polycystic ovary)\b/i },
        // Path B — true hyperandrogenism (acne + hirsutism)
        { kind: 'symptom_match', pattern: /\b(hirsut\w*|excess hair|acne)/i },
        // Path C — irregular cycles + insulin-resistance signal
        { kind: 'all', of: [
          { kind: 'symptom_match', pattern: /\b(irregular cycle\w*|irregular period\w*|missed period\w*|amenorrhea)/i },
          { kind: 'any', of: [
            { kind: 'flag_true', flag: 'hasWeightIssues' },
            { kind: 'lab_value_between', marker: /\b(a1c|hba1c)/i, min: 5.4, max: 6.4 },
            { kind: 'tg_hdl_ratio_gte', value: 3 },
          ]},
        ]},
      ]},
    ],
    tests: [{ key: 'pcos_panel', whyShort: 'PCOS-specific pattern (hyperandrogenism or cycle irregularity + insulin signal) — workup catches androgen excess + insulin-resistance link', trigger: 'e' }],
  },

  // ── Prolactin / pituitary workup — MALE symptom-driven ───────────
  //
  // Male hyperprolactinemia presents differently than female: classic
  // triad is gynecomastia + low libido / ED + (sometimes) galactorrhea.
  // Visual changes / new headaches add suspicion of macroprolactinoma
  // (men often present later, with bigger tumors). NO β-hCG (male).
  {
    id: 'prolactin_workup_male_symptom_driven',
    triggers: [
      { kind: 'sex', is: 'male' },
      { kind: 'age_min', value: 12 },
      { kind: 'any', of: [
        { kind: 'symptom_match', pattern: /\b(gynecomastia|breast tissue|man boobs)/i },
        { kind: 'symptom_match', pattern: /\b(galactorr\w*|nipple discharge|breast discharge)/i },
        { kind: 'symptom_match', pattern: /\b(visual change\w*|vision change\w*|peripheral vision|tunnel vision|bitemporal)/i },
        { kind: 'all', of: [
          { kind: 'flag_true', flag: 'hasLowLibido' },
          { kind: 'symptom_match', pattern: /\b(headache\w*|migraine\w*)/i },
        ]},
      ]},
    ],
    tests: [
      { key: 'prolactin', whyShort: 'Gynecomastia / galactorrhea / visual changes / low-libido + headache — rule out male hyperprolactinemia / macroprolactinoma', trigger: 'b' },
      { key: 'thyroid_panel', whyShort: 'Primary hypothyroidism is a reversible cause of elevated prolactin — rule out before pituitary imaging', trigger: 'c' },
    ],
  },

  // ── Male bone-health workup — DEXA for high-risk older males ─────
  //
  // USPSTF: men ≥70 universal. Earlier if risk factors: family hx
  // osteoporosis, low T, glucocorticoid use, prior fragility fracture.
  {
    id: 'dexa_male_high_risk',
    triggers: [
      { kind: 'sex', is: 'male' },
      { kind: 'any', of: [
        { kind: 'all', of: [
          { kind: 'age_min', value: 50 },
          { kind: 'any', of: [
            { kind: 'condition_match', pattern: /\b(osteoporo\w*|osteopen\w*|fragility fracture|low.?T|hypogonad\w*)/i },
            { kind: 'meds_match', pattern: /\b(prednisone|prednisolone|methylprednisolone|dexamethasone|hydrocortisone)/i },
          ]},
        ]},
        { kind: 'age_min', value: 70 },
      ]},
    ],
    tests: [
      { key: 'dexa_female_65_or_risk', whyShort: 'Adult male ≥50 with family hx osteoporosis, low T, or chronic steroids — DEXA per USPSTF / NOF risk-based screening', trigger: 'c' },
    ],
  },

  // ── Prolactin / pituitary workup — FEMALE symptom-driven ─────────
  //
  // Classic galactorrhea, visual changes, or amenorrhea with new
  // headaches → rule out hyperprolactinemia / pituitary adenoma.
  // β-hCG first (pregnancy), then prolactin + TSH.
  {
    id: 'prolactin_workup_symptom_driven',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 12 },
      { kind: 'any', of: [
        { kind: 'symptom_match', pattern: /\b(galactorr\w*|nipple discharge|breast discharge)/i },
        { kind: 'symptom_match', pattern: /\b(visual change\w*|vision change\w*|peripheral vision|tunnel vision|bitemporal)/i },
        { kind: 'all', of: [
          { kind: 'symptom_match', pattern: /\b(amenorrhea|missed period\w*|absent period\w*|no period\w*)/i },
          { kind: 'symptom_match', pattern: /\b(headache\w*|migraine\w*)/i },
        ]},
      ]},
    ],
    tests: [
      { key: 'beta_hcg_pregnancy_rule_out', whyShort: 'Rule out pregnancy first — most common cause of secondary amenorrhea / elevated prolactin', trigger: 'a' },
      { key: 'prolactin', whyShort: 'Galactorrhea / visual changes / amenorrhea + headache cluster — rule out hyperprolactinemia / pituitary adenoma', trigger: 'b' },
      { key: 'thyroid_panel', whyShort: 'Primary hypothyroidism is a common reversible cause of elevated prolactin — rule out before pituitary imaging', trigger: 'c' },
    ],
  },

  // ── Premature Ovarian Insufficiency (POI) workup — under 40 ──────
  //
  // Female 18–40 with menopausal-spectrum symptoms (hot flashes,
  // night sweats) or amenorrhea ≥3 months → FSH + estradiol + AMH.
  // POI affects ~1% of women and missed diagnosis has serious bone /
  // cardiac / cognitive consequences.
  {
    id: 'poi_workup_under_40',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 40 },
      { kind: 'any', of: [
        { kind: 'symptom_match', pattern: /\b(hot flash\w*|night sweat\w*|vasomotor)/i },
        { kind: 'symptom_match', pattern: /\b(amenorrhea|missed period\w*|absent period\w*|irregular period\w*)/i },
      ]},
    ],
    tests: [
      { key: 'lh_fsh', whyShort: 'POI workup under 40 — elevated FSH (>25–40 mIU/mL) on two draws 4+ weeks apart confirms ovarian insufficiency', trigger: 'b' },
      { key: 'estradiol_progesterone_testosterone', whyShort: 'Low estradiol (<50 pg/mL) with elevated FSH supports POI diagnosis', trigger: 'b' },
      { key: 'amh_reproductive_age', whyShort: 'Very low AMH supports diminished ovarian reserve in POI workup', trigger: 'c' },
      { key: 'prolactin', whyShort: 'Rule out hyperprolactinemia as cause of secondary amenorrhea before pursuing POI', trigger: 'c' },
    ],
  },

  // ── Perimenopause panel — 40–55F with vasomotor / cycle changes ──
  {
    id: 'perimenopause_panel_40_55',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 40 },
      { kind: 'age_max', value: 55 },
      { kind: 'any', of: [
        { kind: 'symptom_match', pattern: /\b(hot flash\w*|night sweat\w*|vasomotor)/i },
        { kind: 'symptom_match', pattern: /\b(insomnia|sleep disrupt\w*|night wak\w*|waking during night|unrefreshing sleep|difficulty falling asleep)/i },
        { kind: 'symptom_match', pattern: /\b(mood swing\w*|irritab\w*)/i },
        { kind: 'symptom_match', pattern: /\b(irregular cycle\w*|irregular period\w*|cycle chang\w*|skipped period\w*)/i },
      ]},
    ],
    tests: [
      { key: 'lh_fsh', whyShort: 'Perimenopause anchor — FSH trending upward across cycles (less reliable in peri but standard workup)', trigger: 'c' },
      { key: 'estradiol_progesterone_testosterone', whyShort: 'Estradiol + progesterone trends help characterize where in transition you are', trigger: 'c' },
    ],
  },

  // ── Ovarian reserve (AMH) — 32–42F with infertility concern ──────
  {
    id: 'ovarian_reserve_amh_32_42',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 32 },
      { kind: 'age_max', value: 42 },
      { kind: 'any', of: [
        { kind: 'symptom_match',   pattern: /\b(infertil\w*|fertility concerns?|trying to conceive|ttc|cannot conceive)/i },
        { kind: 'condition_match', pattern: /\b(infertil\w*|subfertil\w*)/i },
      ]},
    ],
    tests: [
      { key: 'amh_reproductive_age', whyShort: 'Age 32–42 + infertility concern — AMH is the most accurate ovarian-reserve marker, draw any cycle day', trigger: 'b' },
      { key: 'lh_fsh', whyShort: 'Day-3 FSH + LH anchor ovarian reserve workup alongside AMH', trigger: 'c' },
      { key: 'estradiol_progesterone_testosterone', whyShort: 'Day-3 estradiol contextualizes FSH (high E2 can mask elevated FSH)', trigger: 'c' },
    ],
  },

  // ── Female androgen / HSDD panel — low libido + fatigue cluster ──
  //
  // Adult female with low libido + fatigue (with or without low mood)
  // and NO PCOS-pattern → rule out female androgen deficiency / HSDD.
  // PCOS-pattern users get the dedicated PCOS panel (which is more
  // comprehensive); this rule is for the non-PCOS phenotype.
  {
    id: 'female_androgen_panel_low_libido',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'age_min', value: 18 },
      { kind: 'age_max', value: 55 },
      { kind: 'flag_true', flag: 'hasLowLibido' },
      { kind: 'flag_true', flag: 'hasFatigue' },
      { kind: 'not', t: { kind: 'symptom_match', pattern: /\b(hirsut\w*|excess hair|acne)/i } },
      { kind: 'not', t: { kind: 'condition_match', pattern: /\b(pcos|polycystic ovary)\b/i } },
    ],
    tests: [
      { key: 'female_androgen_panel', whyShort: 'Low libido + fatigue without PCOS-pattern — rule out female androgen deficiency / HSDD; Total T, Free T, SHBG, DHEA-S characterize axis', trigger: 'c' },
      { key: 'prolactin', whyShort: 'Hyperprolactinemia is a reversible cause of low libido + fatigue', trigger: 'c' },
    ],
  },

  // ── Fasting insulin + HOMA-IR on early metabolic pattern ──────────
  // 4 alternative conditions trigger this. Each is independent.
  {
    id: 'fasting_insulin_tg_high',
    triggers: [
      { kind: 'flag_false', flag: 'fastingInsulinDrawn' },
      { kind: 'lab_value_op', marker: /\btriglyceride/i, op: '>=', value: 150 },
    ],
    tests: [{ key: 'fasting_insulin_homa_ir', whyShort: 'Triglycerides ≥150 — fasting insulin catches hyperinsulinemia A1c misses; tracks response 4-6 weeks faster than A1c', trigger: 'c' }],
  },
  {
    id: 'fasting_insulin_a1c_watch',
    triggers: [
      { kind: 'flag_false', flag: 'fastingInsulinDrawn' },
      { kind: 'lab_value_between', marker: /\b(a1c|hba1c)/i, min: 5.4, max: 6.4 },
    ],
    tests: [{ key: 'fasting_insulin_homa_ir', whyShort: 'A1c in watch range (5.4–6.4%) — fasting insulin reveals insulin resistance before A1c crosses 5.7', trigger: 'c' }],
  },
  {
    id: 'fasting_insulin_glucose_watch',
    triggers: [
      { kind: 'flag_false', flag: 'fastingInsulinDrawn' },
      { kind: 'lab_value_between', marker: /\bglucose/i, min: 95, max: 125 },
    ],
    tests: [{ key: 'fasting_insulin_homa_ir', whyShort: 'Fasting glucose 95–125 — fasting insulin catches metabolic drift A1c misses', trigger: 'c' }],
  },
  {
    id: 'fasting_insulin_tg_hdl_ratio',
    triggers: [
      { kind: 'flag_false', flag: 'fastingInsulinDrawn' },
      { kind: 'tg_hdl_ratio_gte', value: 3 },
    ],
    tests: [{ key: 'fasting_insulin_homa_ir', whyShort: 'TG/HDL ratio ≥3 — early-IR marker; fasting insulin tracks response 4-6 weeks faster than A1c', trigger: 'c' }],
  },
  {
    id: 'fasting_insulin_weight_resist',
    triggers: [
      { kind: 'flag_false', flag: 'fastingInsulinDrawn' },
      { kind: 'flag_true',  flag: 'hasWeightIssues' },
    ],
    tests: [{ key: 'fasting_insulin_homa_ir', whyShort: 'Weight resistance reported — fasting insulin catches hyperinsulinemia driving the resistance', trigger: 'c' }],
  },

  // ── PREGNANCY-SPECIFIC CARE ──────────────────────────────────────
  //
  // Universal coverage for any pregnant user. These rules supplement
  // (not replace) the standard prenatal workup ordered by OB/GYN.
  // Engine signals these for the doctor-prep document so users can
  // verify their OB ordered them.
  {
    id: 'prenatal_panel_baseline',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'flag_true', flag: 'isPregnant' },
    ],
    tests: [
      { key: 'cbc', whyShort: 'Prenatal anemia screen — universal in every trimester', trigger: 'b' },
      { key: 'iron_panel', whyShort: 'Pregnancy iron requirements increase 3× — ferritin baseline + ongoing monitoring', trigger: 'b' },
      { key: 'thyroid_panel', whyShort: 'Pregnancy alters thyroid binding globulin — TSH target <2.5 in first trimester, <3.0 thereafter', trigger: 'b' },
      { key: 'vit_d_25oh', whyShort: 'Vitamin D status — fetal bone development + maternal preeclampsia risk', trigger: 'c' },
    ],
  },
  {
    id: 'gdm_screening_24_28w',
    // Gestational diabetes screening — universal at 24-28 weeks per ACOG.
    // We can't compute gestational age, so fire for any pregnant user
    // and let the OB time the actual draw. The recommendation surfaces.
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'flag_true', flag: 'isPregnant' },
    ],
    tests: [{ key: 'hba1c', whyShort: 'Gestational diabetes screen — 1-hour 50g glucose challenge at 24-28w per ACOG (universal in every pregnancy)', trigger: 'b' }],
  },
  {
    id: 'preeclampsia_surveillance',
    triggers: [
      { kind: 'sex', is: 'female' },
      { kind: 'flag_true', flag: 'isPregnant' },
    ],
    tests: [
      { key: 'uacr', whyShort: 'Proteinuria surveillance — preeclampsia screen at every prenatal visit', trigger: 'b' },
      { key: 'cmp', whyShort: 'CMP for liver enzymes (HELLP) + creatinine + uric acid — preeclampsia workup', trigger: 'b' },
    ],
  },

  // ── IBD-concern workup — chronic GI + malabsorption signal ───────
  //
  // Chronic diarrhea or loose stools with one or more red flags
  // (weight loss, low ferritin, low albumin, persistent abdominal
  // pain ≥ moderate) → fecal calprotectin is the key IBD vs IBS
  // discriminator. Universal across both sexes.
  {
    id: 'fecal_calprotectin_ibd_concern',
    triggers: [
      { kind: 'symptom_match', pattern: /\b(diarrhea|loose stool\w*)/i },
      { kind: 'any', of: [
        { kind: 'symptom_match', pattern: /\b(unexplained weight loss|weight loss)/i },
        { kind: 'symptom_match', pattern: /\b(abdominal pain)/i },
        { kind: 'lab_value_op', marker: /^ferritin/i, op: '<', value: 30 },
        { kind: 'lab_value_op', marker: /^albumin/i, op: '<', value: 3.5 },
      ]},
    ],
    tests: [{ key: 'fecal_calprotectin', whyShort: 'Chronic diarrhea + weight loss / low ferritin / low albumin / abdominal pain — fecal calprotectin is the key IBD-vs-IBS discriminator (<50 = IBS; >250 = active IBD)', trigger: 'b' }],
  },

  // ── Autonomic / POTS workup — long-COVID-style cluster ───────────
  //
  // Heart palpitations + dizziness on standing + (exercise
  // intolerance OR brain fog) → autonomic dysfunction / POTS.
  // First-line clinical workup is orthostatic vitals + 12-lead EKG.
  // No lab can rule out POTS but EKG rules out arrhythmia.
  {
    id: 'autonomic_pots_workup',
    triggers: [
      // Two paths:
      //  A) Palpitations + orthostatic / dizziness  (alone justifies EKG)
      //  B) Palpitations alone WITH a long-COVID-style symptom cluster
      //     (fatigue / exercise intolerance / brain fog) — also EKG-worthy
      { kind: 'any', of: [
        { kind: 'all', of: [
          { kind: 'symptom_match', pattern: /\b(heart palpitation\w*|palpitation\w*)/i },
          { kind: 'symptom_match', pattern: /\b(dizziness on standing|orthostatic|lightheaded)/i },
        ]},
        { kind: 'all', of: [
          { kind: 'symptom_match', pattern: /\b(heart palpitation\w*|palpitation\w*)/i },
          { kind: 'any', of: [
            { kind: 'symptom_match', pattern: /\b(reduced exercise tolerance|exercise intolerance)/i },
            { kind: 'flag_true', flag: 'hasFatigue' },
            { kind: 'symptom_match', pattern: /\bbrain fog\b/i },
          ]},
        ]},
      ]},
    ],
    tests: [{ key: 'ekg_if_dose_high', whyShort: 'Palpitations + dizziness on standing + exercise intolerance — 12-lead EKG rules out arrhythmia; orthostatic vitals + tilt-table workup if EKG normal (POTS / dysautonomia / long-COVID pattern)', trigger: 'b' }],
  },

  // ── Hashimoto early grey-zone (TSH 2.5–10 with sx) ────────────────
  {
    id: 'thyroid_antibodies_early_grey_zone',
    triggers: [
      { kind: 'lab_value_between', marker: /\btsh\b/i, min: 2.5, max: 10 },
      { kind: 'any', of: [
        { kind: 'flag_true', flag: 'hasFatigue' },
        { kind: 'flag_true', flag: 'hasHairLoss' },
        { kind: 'flag_true', flag: 'hasWeightIssues' },
        { kind: 'flag_true', flag: 'hasMoodIssues' },
        { kind: 'flag_true', flag: 'hasColdHeatIntolerance' },
      ]},
    ],
    tests: [{ key: 'thyroid_antibodies', whyShort: "TSH 2.5–10 (early-Hashimoto's grey zone) + thyroid-pattern symptoms — TPO + Tg Ab catch autoimmune thyroiditis years before TSH crosses 4.5", trigger: 'e' }],
  },
];

// ──────────────────────────────────────────────────────────────────────
// 3. THE MATCHER — one algorithm, runs against every user
// ──────────────────────────────────────────────────────────────────────

// Generic matcher — uses string-keyed flag lookups. Type-loose because
// Flags object is computed at runtime; rule rows reference flag names
// by string.
type FlagBag = Record<string, unknown>;
type AddFn = (key: string, whyShort: string, trigger: TestTrigger) => void;

/** Universal matcher. Iterates TEST_INDICATIONS and emits via `add`. */
export function evaluateTestIndications(f: FlagBag, ctx: InjectionContext, add: AddFn): void {
  for (const ind of TEST_INDICATIONS) {
    const allTriggersHit = ind.triggers.every(t => matchTrigger(t, f, ctx));
    if (!allTriggersHit) continue;
    for (const ref of ind.tests) {
      add(ref.key, ref.whyShort, ref.trigger);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 4. TRIGGER EVALUATION
// ──────────────────────────────────────────────────────────────────────

function matchTrigger(t: Trigger | { kind: 'all'; of: Trigger[] }, f: FlagBag, ctx: InjectionContext): boolean {
  switch (t.kind) {
    case 'age_min':
      return (Number(f.age ?? 0)) >= t.value;
    case 'age_max':
      return (Number(f.age ?? 999)) <= t.value;
    case 'age_known':
      return f.ageKnown === true;
    case 'sex':
      return String(f.sex ?? '').toLowerCase() === t.is;
    case 'flag_true':
      return Boolean(f[t.flag]);
    case 'flag_false':
      return !f[t.flag];
    case 'symptom_match':
      return t.pattern.test(ctx.symptomsLower);
    case 'condition_match':
      return t.pattern.test(ctx.conditionsLower);
    case 'meds_match':
      return t.pattern.test(ctx.medsLower);
    case 'lab_value_op': {
      const v = extractLabValue(ctx.labsLower, t.marker);
      if (v == null) return false;
      switch (t.op) {
        case '<':  return v <  t.value;
        case '<=': return v <= t.value;
        case '>':  return v >  t.value;
        case '>=': return v >= t.value;
      }
      return false;
    }
    case 'lab_value_between': {
      const v = extractLabValue(ctx.labsLower, t.marker);
      return v != null && v >= t.min && v <= t.max;
    }
    case 'tg_hdl_ratio_gte': {
      const tg  = extractLabValue(ctx.labsLower, /\btriglyceride/i);
      const hdl = extractLabValue(ctx.labsLower, /\bhdl/i);
      if (tg == null || hdl == null || hdl <= 0) return false;
      return (tg / hdl) >= t.value;
    }
    case 'any':
      return t.of.some(sub => matchTrigger(sub, f, ctx));
    case 'all':
      return t.of.every(sub => matchTrigger(sub, f, ctx));
    case 'not':
      return !matchTrigger(t.t, f, ctx);
  }
}

function extractLabValue(labsLower: string, markerPattern: RegExp): number | null {
  const lines = labsLower.split('\n');
  for (const line of lines) {
    if (!markerPattern.test(line)) continue;
    // Grab the first decimal/integer number on the line. Handles forms
    // like "tsh: 3.02 ..." and "triglyceride 327 mg/dl".
    const m = line.match(/(\d+\.?\d*)/);
    if (m) return Number(m[1]);
  }
  return null;
}
