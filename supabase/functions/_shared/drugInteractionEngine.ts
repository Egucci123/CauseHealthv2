// supabase/functions/_shared/drugInteractionEngine.ts
//
// SAFETY-CRITICAL ENGINE.
//
// Cross-checks every supplement the plan recommends (deterministic OR AI-generated)
// against the user's medication list. Blocks supplements that have a known
// interaction; for moderate cases, downgrades to a "discuss with pharmacist"
// caveat. Same dual-layer pattern as the rest of the architecture:
//
//   - Deterministic database below covers the high-prevalence interactions
//     that account for ~90% of real harm reports
//   - AI cross-check (in the wellness-plan prompt) handles the long tail
//
// Sources for the deterministic rules:
//   - NIH Office of Dietary Supplements interaction database
//   - MedlinePlus drug-supplement monographs
//   - DDInter open-access drug-drug interaction database
//   - FDA black-box warnings + drug labeling
//
// Adding a rule = appending to RULES below. Each rule declares:
//   - Which supplements it fires on (regex match against name/aliases)
//   - Which medication classes it conflicts with (uses isOnMed())
//   - Severity: 'block' (do not recommend) or 'caution' (recommend with warning)
//   - Why + what to tell the user

import { isOnMed, MED_CLASSES } from './medicationAliases.ts';

export type InteractionSeverity = 'block' | 'caution';

export interface InteractionRule {
  /** Stable id for audit. */
  key: string;
  /** Supplement-name patterns that trigger this rule. */
  supplementPatterns: RegExp[];
  /** Medication classes this conflicts with — keys from medicationAliases. */
  medClasses: string[];
  /** 'block' = remove from plan; 'caution' = keep but add warning. */
  severity: InteractionSeverity;
  /** One-liner for audit + UI. */
  reason: string;
  /** Plain-English warning to show the user when severity='caution'. */
  userWarning: string;
}

const RULES: InteractionRule[] = [
  // ── Anticoagulants (warfarin / DOACs) — bleeding risk ───────────────────
  {
    key: 'fish_oil_x_anticoagulant',
    supplementPatterns: [/\bfish[\s-]?oil\b/i, /\bomega[\s-]?3\b/i, /\bepa\b/i, /\bdha\b/i, /\bkrill\s*oil\b/i],
    medClasses: ['anticoagulant'],
    severity: 'caution',
    reason: 'High-dose omega-3 (>2g/day) may potentiate anticoagulant effect.',
    userWarning: 'You are on a blood thinner. Omega-3 / fish oil at high doses (>2g/day) can increase bleeding risk. Discuss dose with your pharmacist before adding.',
  },
  {
    key: 'turmeric_x_anticoagulant',
    supplementPatterns: [/\bturmeric\b/i, /\bcurcumin\b/i],
    medClasses: ['anticoagulant'],
    severity: 'block',
    reason: 'Curcumin has antiplatelet activity — additive bleeding risk on warfarin/DOACs.',
    userWarning: 'Turmeric / curcumin can increase bleeding risk on blood thinners. Do not add without your prescriber.',
  },
  {
    key: 'garlic_x_anticoagulant',
    supplementPatterns: [/\bgarlic\b.*\b(extract|capsule|supplement)\b/i, /\ballicin\b/i, /\baged\s*garlic\b/i],
    medClasses: ['anticoagulant'],
    severity: 'block',
    reason: 'Concentrated garlic extract has antiplatelet effects.',
    userWarning: 'Concentrated garlic supplements can increase bleeding on anticoagulants. Avoid.',
  },
  {
    key: 'ginkgo_x_anticoagulant',
    supplementPatterns: [/\bginkgo\b/i, /\bginkgo\s*biloba\b/i],
    medClasses: ['anticoagulant'],
    severity: 'block',
    reason: 'Ginkgo has well-documented antiplatelet activity.',
    userWarning: 'Ginkgo biloba significantly raises bleeding risk on blood thinners. Avoid.',
  },
  {
    key: 'vit_e_x_anticoagulant',
    supplementPatterns: [/vitamin\s*e\b/i, /\btocopherol\b/i],
    medClasses: ['anticoagulant'],
    severity: 'caution',
    reason: 'High-dose vitamin E (>400 IU) can potentiate anticoagulants.',
    userWarning: 'Doses of vitamin E above 400 IU may increase bleeding on blood thinners. Stick to ≤200 IU and ask your pharmacist.',
  },
  {
    key: 'vit_k_x_warfarin',
    supplementPatterns: [/vitamin\s*k\b/i, /\bk2\b/i, /\bmk[\s-]?7\b/i, /menaquinone/i, /phytonadione/i],
    medClasses: ['anticoagulant'],
    severity: 'block',
    reason: 'Vitamin K directly antagonizes warfarin and changes INR unpredictably.',
    userWarning: 'Vitamin K can directly counteract warfarin. Do not start without your prescriber adjusting your INR plan.',
  },

  // ── SSRIs / SNRIs / MAOIs — serotonin syndrome risk ─────────────────────
  {
    key: 'st_johns_x_ssri',
    supplementPatterns: [/st\.?\s*john'?s\s*wort/i, /hypericum/i],
    medClasses: ['ssri', 'snri', 'maoi'],
    severity: 'block',
    reason: 'St. John\'s Wort has MAOI activity — serotonin syndrome risk.',
    userWarning: 'St. John\'s Wort with antidepressants can cause serotonin syndrome (potentially fatal). Never combine.',
  },
  {
    key: '5htp_x_ssri',
    supplementPatterns: [/\b5[\s-]?htp\b/i, /5[\s-]?hydroxytryptophan/i],
    medClasses: ['ssri', 'snri', 'maoi'],
    severity: 'block',
    reason: 'Direct serotonin precursor — serotonin syndrome risk.',
    userWarning: '5-HTP combined with antidepressants can cause serotonin syndrome. Never combine without psychiatric supervision.',
  },
  {
    key: 'tryptophan_x_ssri',
    supplementPatterns: [/\bl[\s-]?tryptophan\b/i, /\btryptophan\b/i],
    medClasses: ['ssri', 'snri', 'maoi'],
    severity: 'block',
    reason: 'Serotonin precursor — additive serotonergic load.',
    userWarning: 'L-Tryptophan with antidepressants risks serotonin syndrome. Avoid.',
  },
  {
    key: 'sam_e_x_ssri',
    supplementPatterns: [/\bsam[\s-]?e\b/i, /s[\s-]?adenosyl/i],
    medClasses: ['ssri', 'snri', 'maoi'],
    severity: 'caution',
    reason: 'SAM-e has serotonergic activity.',
    userWarning: 'SAM-e plus antidepressants can additively raise serotonin. Discuss with your prescriber before adding.',
  },

  // ── Statins — myopathy / liver risk ─────────────────────────────────────
  {
    key: 'red_yeast_rice_x_statin',
    supplementPatterns: [/red\s*yeast\s*rice/i, /\brye?\b/i, /monacolin/i],
    medClasses: ['statin'],
    severity: 'block',
    reason: 'Red yeast rice contains monacolin K (lovastatin) — additive statin effect.',
    userWarning: 'Red yeast rice IS a statin (monacolin K). Adding it on top of your prescription doubles dose and risks myopathy/liver damage.',
  },
  {
    key: 'niacin_high_dose_x_statin',
    supplementPatterns: [/niacin\s*(high|1000|2000)/i, /nicotinic\s*acid/i],
    medClasses: ['statin'],
    severity: 'caution',
    reason: 'High-dose niacin + statin raises rhabdomyolysis risk.',
    userWarning: 'High-dose niacin (>500mg) with a statin can raise muscle breakdown risk. Discuss with your prescriber before stacking.',
  },

  // ── Diabetes meds — hypoglycemia stacking ───────────────────────────────
  {
    key: 'berberine_x_metformin',
    supplementPatterns: [/\bberberine\b/i],
    medClasses: ['metformin', 'sulfonylurea', 'insulin'],
    severity: 'caution',
    reason: 'Berberine independently lowers glucose — additive hypoglycemia risk.',
    userWarning: 'Berberine has metformin-like effects. Combining can cause low blood sugar. Monitor glucose closely and discuss with your prescriber.',
  },
  {
    key: 'cinnamon_high_x_diabetes',
    supplementPatterns: [/cinnamon\s*(extract|capsule|supplement|1000|2000)/i],
    medClasses: ['metformin', 'sulfonylurea', 'insulin'],
    severity: 'caution',
    reason: 'Concentrated cinnamon may potentiate glucose-lowering meds.',
    userWarning: 'Concentrated cinnamon supplements can amplify diabetes meds. Monitor glucose and discuss dose with your prescriber.',
  },
  {
    key: 'gymnema_x_diabetes',
    supplementPatterns: [/gymnema/i],
    medClasses: ['metformin', 'sulfonylurea', 'insulin'],
    severity: 'caution',
    reason: 'Gymnema lowers glucose — additive hypoglycemia.',
    userWarning: 'Gymnema sylvestre can lower blood sugar. Combined with diabetes meds, monitor for hypoglycemia.',
  },
  {
    key: 'chromium_x_diabetes',
    supplementPatterns: [/chromium\s*picolinate/i],
    medClasses: ['insulin', 'sulfonylurea'],
    severity: 'caution',
    reason: 'Chromium may modestly increase insulin sensitivity.',
    userWarning: 'Chromium picolinate can mildly potentiate insulin / sulfonylureas. Monitor glucose for the first 2 weeks.',
  },

  // ── Thyroid replacement — absorption interference ───────────────────────
  {
    key: 'iron_x_thyroid',
    supplementPatterns: [/\biron\b/i, /ferrous\s*(sulfate|fumarate|gluconate|bisglycinate)/i, /heme\s*iron/i],
    medClasses: ['thyroid_replacement'],
    severity: 'caution',
    reason: 'Iron blocks levothyroxine absorption when co-ingested.',
    userWarning: 'Iron blocks thyroid med absorption. Take iron 4 hours apart from your levothyroxine.',
  },
  {
    key: 'calcium_x_thyroid',
    supplementPatterns: [/\bcalcium\b/i, /\bcal[\s-]?(citrate|carbonate)\b/i],
    medClasses: ['thyroid_replacement'],
    severity: 'caution',
    reason: 'Calcium blocks levothyroxine absorption.',
    userWarning: 'Calcium blocks thyroid med absorption. Separate by 4 hours from your levothyroxine.',
  },
  {
    key: 'magnesium_x_thyroid',
    supplementPatterns: [/magnesium/i],
    medClasses: ['thyroid_replacement'],
    severity: 'caution',
    reason: 'Magnesium reduces levothyroxine absorption when co-ingested.',
    userWarning: 'Magnesium can reduce thyroid med absorption. Take it at night, not at the same time as your levothyroxine.',
  },

  // ── PPIs / antacids — absorption ────────────────────────────────────────
  // (no supplements blocked — but patient education needed)

  // ── ACE inhibitors / ARBs / K-sparing diuretics — hyperkalemia ──────────
  {
    key: 'potassium_x_ace_arb',
    supplementPatterns: [/^potassium\b/i, /\bk[\s+]?supplement/i, /\bpotassium\s*(citrate|chloride)\b/i],
    medClasses: ['ace_inhibitor', 'arb', 'k_sparing_diuretic'],
    severity: 'block',
    reason: 'Additive hyperkalemia risk — can be fatal.',
    userWarning: 'Potassium supplements with ACE inhibitors / ARBs / K-sparing diuretics can cause dangerous hyperkalemia. Do not take without prescriber supervision.',
  },

  // ── Lithium — narrow therapeutic index ──────────────────────────────────
  {
    key: 'nsaid_otc_x_lithium',
    supplementPatterns: [/\bibuprofen\b/i, /\bnaproxen\b/i, /\bnsaid\b/i],
    medClasses: ['lithium'],
    severity: 'block',
    reason: 'NSAIDs raise lithium levels — toxicity risk.',
    userWarning: 'Over-the-counter NSAIDs (ibuprofen, naproxen) can raise lithium to toxic levels. Use acetaminophen instead and ask your prescriber.',
  },

  // ── Immunosuppressants / Methotrexate — folate handling ────────────────
  {
    key: 'folic_acid_x_methotrexate',
    supplementPatterns: [/folic\s*acid/i],
    medClasses: ['methotrexate'],
    severity: 'caution',
    reason: 'Folic acid is sometimes intentionally given with methotrexate — but only on prescriber direction.',
    userWarning: 'Folic acid is often co-prescribed with methotrexate, but timing matters. Confirm with your rheumatologist before starting.',
  },

  // ── Generic CYP3A4 inducers — broad interaction ─────────────────────────
  // St. John's Wort already covered. Add separately for non-SSRI users:
  {
    key: 'st_johns_x_oc',
    supplementPatterns: [/st\.?\s*john'?s\s*wort/i, /hypericum/i],
    medClasses: ['oral_contraceptive'],
    severity: 'block',
    reason: 'St. John\'s Wort induces CYP3A4 — reduces oral contraceptive effectiveness.',
    userWarning: 'St. John\'s Wort can render birth control pills ineffective. Avoid if you rely on the pill for contraception.',
  },
];

export interface InteractionFinding {
  key: string;
  supplement: string;
  medication: string;
  severity: InteractionSeverity;
  reason: string;
  userWarning: string;
}

export interface InteractionScreenResult {
  /** All interactions found (any severity). */
  findings: InteractionFinding[];
  /** Supplement names to remove from the plan entirely. */
  blockedSupplements: string[];
  /** Supplement names to keep but flag with caution. */
  cautionSupplements: Array<{ name: string; warning: string }>;
}

/**
 * Screen a list of supplement names against the user's medications.
 * Returns the findings + which supplements to block/keep with caveat.
 */
export function screenInteractions(
  supplementNames: string[],
  medsLower: string,
): InteractionScreenResult {
  const findings: InteractionFinding[] = [];
  const blocked = new Set<string>();
  const caution = new Map<string, string>();

  if (!supplementNames?.length || !medsLower) {
    return { findings: [], blockedSupplements: [], cautionSupplements: [] };
  }

  for (const supplement of supplementNames) {
    if (!supplement) continue;
    for (const rule of RULES) {
      const supplementMatches = rule.supplementPatterns.some(re => re.test(supplement));
      if (!supplementMatches) continue;
      // Check each med class
      for (const medClass of rule.medClasses) {
        if (isOnMed(medsLower, medClass)) {
          // Find a friendly med-class label
          const def = MED_CLASSES.find(m => m.key === medClass);
          findings.push({
            key: rule.key,
            supplement,
            medication: def?.label ?? medClass,
            severity: rule.severity,
            reason: rule.reason,
            userWarning: rule.userWarning,
          });
          if (rule.severity === 'block') blocked.add(supplement);
          else if (!blocked.has(supplement)) caution.set(supplement, rule.userWarning);
        }
      }
    }
  }

  return {
    findings,
    blockedSupplements: [...blocked],
    cautionSupplements: [...caution.entries()].map(([name, warning]) => ({ name, warning })),
  };
}
