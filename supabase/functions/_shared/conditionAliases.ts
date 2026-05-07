// supabase/functions/_shared/conditionAliases.ts
//
// SINGLE SOURCE OF TRUTH for every condition the app reasons about.
//
// Every injector, every prompt branch, every retest rule uses `hasCondition()`
// here instead of inlining their own regex. When a user types "Hypothyroidism"
// and we want it to trigger the Hashimoto's pathway, we add an alias HERE —
// once — and every code path benefits.
//
// Tiers:
//   1 = full clinical pathway (specific tests, supplements, monitoring)
//   2 = category-fallback (autoimmune → standard autoimmune workup)
//   3 = rare/under-supported (AI reasons from first principles, audit-flagged)
//
// Adding a condition: pick canonical key (snake_case), aliases (every synonym
// users actually type — not just textbook names), icd10, category, tier.
//
// Adding an alias: append to `aliases` array. NEVER weaken existing aliases.

export type ConditionCategory =
  | 'cardiovascular' | 'metabolic' | 'autoimmune' | 'hormonal'
  | 'gi' | 'thyroid' | 'mental_health' | 'neurological'
  | 'musculoskeletal' | 'kidney' | 'respiratory' | 'sleep'
  | 'skin' | 'nutritional' | 'oncology' | 'reproductive'
  | 'infectious' | 'environmental';

export interface ConditionDef {
  key: string;                       // canonical id, e.g. 'hashimotos'
  label: string;                     // user-facing name
  category: ConditionCategory;
  tier: 1 | 2 | 3;
  icd10: string;
  aliases: RegExp[];                 // EVERYTHING users might type for this
  // Optional: this condition is implied when ANY of these other keys are present
  impliedBy?: string[];              // canonical condition keys
  // Optional: this condition is implied when user is on a med matching any of these med-class keys
  impliedByMed?: string[];           // medication-class keys (see medicationAliases)
  // Notes for downstream injectors — what this condition's full pathway requires
  pathwayHints?: {
    requiredTests?: string[];        // retest registry keys
    requiredSupplements?: string[];  // supplement registry keys
  };
}

// ── TIER 1 — full pathway ──────────────────────────────────────────────────
// These conditions have specific monitoring tests, evidence-based supplements,
// and condition-specific reasoning. The bulk of the app's value lives here.
const T1: ConditionDef[] = [
  {
    key: 'hashimotos',
    label: "Hashimoto's / Hypothyroidism",
    category: 'thyroid',
    tier: 1,
    icd10: 'E06.3',
    // Critical: "Hypothyroidism" must trigger the Hashimoto's pathway. This
    // was the Nona Lynn bug — she typed "Hypothyroidism" and the regex only
    // caught "hashimoto". Single biggest universal fix in this whole pivot.
    aliases: [
      /\bhashimoto/i,
      /autoimmune thyroid/i,
      /chronic thyroiditis/i,
      /\bhypothyroid/i,
      /underactive thyroid/i,
      /low thyroid/i,
      /\bhypo\W*thyroid/i,
    ],
    // On any thyroid replacement → infer hypothyroid pathway even if user
    // didn't enter the dx in onboarding. The med IS the de-facto diagnosis.
    impliedByMed: ['thyroid_replacement'],
    pathwayHints: {
      requiredTests: ['thyroid_panel', 'thyroid_antibodies', 'reverse_t3', 'iron_panel', 'vit_d_25oh', 'vit_b12'],
      requiredSupplements: ['selenium'],
    },
  },
  {
    key: 'graves',
    label: 'Graves / Hyperthyroidism',
    category: 'thyroid',
    tier: 1,
    icd10: 'E05.0',
    aliases: [
      /\bgraves\b/i,
      /\bhyperthyroid/i,
      /overactive thyroid/i,
      /thyrotoxico/i,
    ],
    impliedByMed: ['antithyroid'],
    pathwayHints: {
      requiredTests: ['thyroid_panel', 'tsi_antibodies', 'thyroid_antibodies'],
    },
  },
  {
    key: 'ibd',
    label: 'IBD (UC / Crohn\'s)',
    category: 'gi',
    tier: 1,
    icd10: 'K50.90',
    aliases: [
      /ulcerative colitis/i,
      /\buc\b/i,
      /\bcrohn/i,
      /\bibd\b/i,
      /inflammatory bowel/i,
      /indeterminate colitis/i,
    ],
    impliedByMed: ['mesalamine_5asa', 'biologic_ibd'],
    pathwayHints: {
      requiredTests: ['fecal_calprotectin', 'celiac_serology', 'iron_panel', 'vit_d_25oh', 'vit_b12_workup', 'folate_workup', 'hs_crp'],
      requiredSupplements: ['l_glutamine', 's_boulardii', 'butyrate'],
    },
  },
  {
    key: 't2d',
    label: 'Type 2 Diabetes / Prediabetes',
    category: 'metabolic',
    tier: 1,
    icd10: 'E11.9',
    aliases: [
      /type ?2 ?diabet/i,
      /\bt2d(m)?\b/i,
      /\bdiabetes\b/i,
      /\bdiabetic\b/i,
      /diabetes mellitus type ?2/i,
      /\bprediabet/i,
      /pre[-\s]diabet/i,
      /\binsulin resistance\b/i,
      /\bdm\b/i,
    ],
    impliedByMed: ['metformin', 'sglt2', 'glp1', 'sulfonylurea', 'insulin'],
    pathwayHints: {
      requiredTests: ['hba1c', 'fasting_insulin_homa_ir', 'lipid_panel', 'uacr', 'egfr'],
      requiredSupplements: ['berberine'],
    },
  },
  {
    key: 'pcos',
    label: 'PCOS (Polycystic Ovary Syndrome)',
    category: 'reproductive',
    tier: 1,
    icd10: 'E28.2',
    aliases: [
      /\bpcos\b/i,
      /polycystic ovar/i,
      /poly cystic ovar/i,
    ],
    pathwayHints: {
      requiredTests: ['androgen_panel', 'fasting_insulin_homa_ir', 'shbg', 'lipid_panel'],
      requiredSupplements: ['inositol'],
    },
  },
  {
    key: 'hypertension',
    label: 'High Blood Pressure',
    category: 'cardiovascular',
    tier: 1,
    icd10: 'I10',
    aliases: [
      /\bhypertension\b/i,
      /\bhtn\b/i,
      /high blood pressure/i,
      /\bhi\W*bp\b/i,
    ],
    impliedByMed: ['ace_inhibitor', 'arb', 'beta_blocker', 'ccb', 'diuretic_thiazide', 'diuretic_loop'],
    pathwayHints: {
      requiredTests: ['cmp', 'uacr', 'lipid_panel', 'hba1c', 'rbc_magnesium'],
    },
  },
  {
    key: 'ckd',
    label: 'Chronic Kidney Disease',
    category: 'kidney',
    tier: 1,
    icd10: 'N18.9',
    aliases: [
      /\bckd\b/i,
      /chronic kidney/i,
      /kidney disease/i,
      /renal disease/i,
      /\bnephropath/i,
    ],
    pathwayHints: {
      requiredTests: ['cystatin_c_egfr', 'uacr', 'pth', 'vit_d_25oh', 'iron_panel'],
    },
  },
  {
    key: 'cad',
    label: 'Coronary Artery / Heart Disease',
    category: 'cardiovascular',
    tier: 1,
    icd10: 'I25.10',
    aliases: [
      /\bcad\b/i,
      /coronary/i,
      /heart failure/i,
      /\bchf\b/i,
      /heart disease/i,
      /atherosclero/i,
      /myocardial/i,
      /\bmi\b.*history/i,
      /post[-\s]?mi/i,
      /\bischem/i,
    ],
    impliedByMed: ['statin'],
    pathwayHints: {
      requiredTests: ['lipid_panel', 'apob', 'lp_a', 'hs_crp', 'nt_probnp_if_hf', 'hba1c', 'cac_score'],
    },
  },
  {
    key: 'lupus',
    label: 'Lupus / SLE',
    category: 'autoimmune',
    tier: 1,
    icd10: 'M32.9',
    aliases: [
      /\blupus\b/i,
      /\bsle\b/i,
      /systemic lupus/i,
    ],
    pathwayHints: {
      requiredTests: ['esr', 'hs_crp', 'ana_reflex', 'cbc', 'cmp', 'uacr'],
    },
  },
  {
    key: 'ra',
    label: 'Rheumatoid Arthritis',
    category: 'autoimmune',
    tier: 1,
    icd10: 'M06.9',
    aliases: [
      /\bra\b(?!.*restless)/i,        // "RA" but not "restless ra…"
      /rheumatoid/i,
      /psoriatic arthritis/i,
    ],
    pathwayHints: {
      requiredTests: ['esr', 'hs_crp', 'rf_anti_ccp', 'cbc'],
    },
  },
  {
    key: 'osteoporosis',
    label: 'Osteoporosis / Osteopenia',
    category: 'musculoskeletal',
    tier: 1,
    icd10: 'M81.0',
    aliases: [
      /osteoporos/i,
      /osteopen/i,
      /low bone density/i,
      /\bdexa\b.*low/i,
    ],
    impliedByMed: ['steroid_oral'],
    pathwayHints: {
      requiredTests: ['vit_d_25oh', 'pth', 'ionized_calcium', 'ctx_telopeptide'],
      requiredSupplements: ['vit_k2_mk7'],
    },
  },
  {
    key: 'hyperlipidemia',
    label: 'High Cholesterol / Hyperlipidemia',
    category: 'cardiovascular',
    tier: 1,
    icd10: 'E78.5',
    aliases: [
      /high cholesterol/i,
      /hyperlipid/i,
      /dyslipid/i,
      /high (ldl|triglyceride)/i,
      /elevated (cholesterol|ldl|triglyc)/i,
    ],
    impliedByMed: ['statin', 'pcsk9', 'ezetimibe', 'fibrate'],
    pathwayHints: {
      requiredTests: ['lipid_panel_extended', 'apob', 'lp_a', 'hs_crp', 'cac_score'],
    },
  },
  {
    key: 'nafld',
    label: 'Fatty Liver / NAFLD',
    category: 'metabolic',
    tier: 1,
    icd10: 'K76.0',
    aliases: [
      /fatty liver/i,
      /\bnafld\b/i,
      /\bmafld\b/i,
      /hepatic steatosis/i,
      /\bnash\b/i,
      /steatohepat/i,
    ],
    pathwayHints: {
      requiredTests: ['liver_panel', 'ggt', 'fasting_insulin_homa_ir', 'liver_ultrasound'],
      requiredSupplements: ['milk_thistle'],
    },
  },
  {
    key: 'celiac',
    label: 'Celiac Disease',
    category: 'autoimmune',
    tier: 1,
    icd10: 'K90.0',
    aliases: [
      /celiac/i,
      /coeliac/i,
      /gluten enteropathy/i,
    ],
    pathwayHints: {
      requiredTests: ['celiac_serology', 'iron_panel', 'vit_d_25oh', 'vit_b12_workup', 'folate_workup'],
    },
  },
  {
    key: 'ms',
    label: 'Multiple Sclerosis',
    category: 'autoimmune',
    tier: 1,
    icd10: 'G35',
    aliases: [
      /multiple sclerosis/i,
      /\bms\b(?!.*\b(stop|signs|symptoms|excel)\b)/i,    // "MS" but not "MS Excel"
    ],
    pathwayHints: {
      requiredTests: ['vit_d_25oh', 'vit_b12_workup', 'cbc'],
    },
  },
  {
    key: 'fibromyalgia',
    label: 'Fibromyalgia',
    category: 'musculoskeletal',
    tier: 1,
    icd10: 'M79.7',
    aliases: [
      /fibromyalg/i,
      /\bfm\b.*pain/i,
    ],
    pathwayHints: {
      requiredTests: ['vit_d_25oh', 'rbc_magnesium', 'tsh', 'hs_crp', 'iron_panel'],
    },
  },
  {
    key: 'endometriosis',
    label: 'Endometriosis',
    category: 'reproductive',
    tier: 1,
    icd10: 'N80.9',
    aliases: [
      /endometrios/i,
      /\bendo\b.*pain/i,
    ],
    pathwayHints: {
      requiredTests: ['cbc', 'iron_panel', 'hs_crp'],
    },
  },
  {
    key: 'menopause_postmenopause',
    label: 'Menopause / Postmenopause',
    category: 'hormonal',
    tier: 1,
    icd10: 'N95.1',
    aliases: [
      /menopaus/i,
      /post[-\s]?menopaus/i,
      /perimenopaus/i,
      /climacteric/i,
    ],
    // The lab pattern (FSH > 30 in female) implies this even without a stated dx
    pathwayHints: {
      requiredTests: ['lipid_panel_extended', 'hs_crp', 'thyroid_panel', 'vit_d_25oh', 'shbg', 'estradiol_progesterone_testosterone', 'cac_score_if_age_45'],
    },
  },
  {
    key: 'low_testosterone_male',
    label: 'Low Testosterone (Male)',
    category: 'hormonal',
    tier: 1,
    icd10: 'E29.1',
    aliases: [
      /low testosterone/i,
      /low\W*t\b/i,
      /hypogonadism/i,
      /androgen deficien/i,
    ],
    impliedByMed: ['trt'],
    pathwayHints: {
      requiredTests: ['testosterone_total_free', 'shbg', 'estradiol_male', 'lh_fsh', 'prolactin', 'cbc_if_trt'],
    },
  },
  {
    key: 'depression',
    label: 'Depression',
    category: 'mental_health',
    tier: 1,
    icd10: 'F32.9',
    aliases: [
      /\bdepression\b/i,
      /depressive/i,
      /\bmdd\b/i,
      /major depressive/i,
    ],
    impliedByMed: ['ssri', 'snri', 'tca', 'maoi'],
    pathwayHints: {
      requiredTests: ['vit_d_25oh', 'vit_b12_workup', 'tsh', 'iron_panel', 'am_cortisol_if_hpa'],
    },
  },
  {
    key: 'anxiety',
    label: 'Anxiety',
    category: 'mental_health',
    tier: 1,
    icd10: 'F41.9',
    aliases: [
      /\banxiety\b/i,
      /\bgad\b/i,
      /\banxiety disorder/i,
      /panic disorder/i,
    ],
    pathwayHints: {
      requiredTests: ['rbc_magnesium', 'tsh', 'vit_d_25oh', 'am_cortisol_if_hpa'],
    },
  },
  {
    key: 'sleep_apnea',
    label: 'Sleep Apnea (OSA)',
    category: 'sleep',
    tier: 1,
    icd10: 'G47.30',
    aliases: [
      /sleep apnea/i,
      /\bosa\b/i,
      /obstructive sleep/i,
    ],
    pathwayHints: {
      requiredTests: ['cbc', 'a1c', 'lipid_panel'],
    },
  },
  {
    key: 'migraine',
    label: 'Migraine',
    category: 'neurological',
    tier: 1,
    icd10: 'G43.909',
    aliases: [
      /migraine/i,
      /chronic headache/i,
    ],
    pathwayHints: {
      requiredTests: ['rbc_magnesium', 'vit_d_25oh', 'cbc'],
    },
  },
  {
    key: 'asthma',
    label: 'Asthma',
    category: 'respiratory',
    tier: 1,
    icd10: 'J45.909',
    aliases: [
      /asthma/i,
      /reactive airway/i,
    ],
    impliedByMed: ['inhaled_steroid', 'beta_agonist_inhaler'],
    pathwayHints: {
      requiredTests: ['vit_d_25oh', 'eosinophil_count', 'total_ige_if_allergic'],
    },
  },
  {
    key: 'psoriasis',
    label: 'Psoriasis',
    category: 'autoimmune',
    tier: 1,
    icd10: 'L40.9',
    aliases: [
      /psorias/i,
    ],
    pathwayHints: {
      requiredTests: ['hs_crp', 'lipid_panel', 'a1c'],
    },
  },
  {
    key: 'long_covid',
    label: 'Long COVID',
    category: 'autoimmune',  // closest fit pathologically
    tier: 1,
    icd10: 'U09.9',
    aliases: [
      /long[-\s]?covid/i,
      /post[-\s]?covid/i,
      /post[-\s]?acute sequelae/i,
      /\bpasc\b/i,
    ],
    pathwayHints: {
      requiredTests: ['hs_crp', 'd_dimer', 'cbc', 'cmp', 'tsh', 'vit_d_25oh', 'iron_panel'],
    },
  },
  {
    key: 'gerd',
    label: 'GERD / Acid Reflux',
    category: 'gi',
    tier: 1,
    icd10: 'K21.9',
    aliases: [
      /\bgerd\b/i,
      /acid reflux/i,
      /heartburn/i,
      /reflux disease/i,
    ],
    impliedByMed: ['ppi', 'h2_blocker'],
    pathwayHints: {
      requiredTests: ['vit_b12_workup', 'rbc_magnesium', 'iron_panel'],
    },
  },
  {
    key: 'ibs',
    label: 'IBS (Irritable Bowel Syndrome)',
    category: 'gi',
    tier: 1,
    icd10: 'K58.9',
    aliases: [
      /\bibs\b/i,
      /irritable bowel/i,
    ],
    pathwayHints: {
      requiredTests: ['celiac_serology', 'cmp', 'cbc', 'fecal_calprotectin'],
    },
  },
  {
    key: 'sjogrens',
    label: "Sjögren's",
    category: 'autoimmune',
    tier: 1,
    icd10: 'M35.0',
    aliases: [
      /sjogren/i,
      /sjögren/i,
    ],
    pathwayHints: {
      requiredTests: ['ana_reflex', 'esr', 'hs_crp', 'ssa_ssb_antibodies'],
    },
  },
  {
    key: 'gout',
    label: 'Gout',
    category: 'musculoskeletal',
    tier: 1,
    icd10: 'M10.9',
    aliases: [
      /\bgout\b/i,
      /uric acid arthritis/i,
    ],
    impliedByMed: ['allopurinol', 'febuxostat'],
    pathwayHints: {
      requiredTests: ['uric_acid', 'lipid_panel', 'a1c', 'kidney_function'],
    },
  },
  {
    key: 'afib',
    label: 'Atrial Fibrillation',
    category: 'cardiovascular',
    tier: 1,
    icd10: 'I48.91',
    aliases: [
      /atrial fib/i,
      /\bafib\b/i,
      /\ba[-\s]?fib\b/i,
    ],
    impliedByMed: ['anticoagulant'],
    pathwayHints: {
      requiredTests: ['thyroid_panel', 'cmp', 'cbc', 'rbc_magnesium', 'lipid_panel'],
    },
  },
  {
    key: 'familial_hypercholesterolemia',
    label: 'Familial Hypercholesterolemia',
    category: 'cardiovascular',
    tier: 1,
    icd10: 'E78.01',
    aliases: [
      /familial hypercholesterol/i,
      /\bfh\b.*chol/i,
      /heterozygous fh/i,
      /homozygous fh/i,
    ],
    pathwayHints: {
      requiredTests: ['lipid_panel_extended', 'apob', 'lp_a', 'cac_score'],
    },
  },
];

// ── TIER 2 — category-fallback ─────────────────────────────────────────────
// These conditions fall into a known category but we don't have a full
// pathway yet. They get the category-level standard workup. Examples: less
// common autoimmunes get the autoimmune-class basics (hs-CRP, vit D, iron,
// gut workup, omega-3 emphasis). Add specific pathways over time.
//
// Auto-generated from src/data/conditions.ts categories. The aliases for
// each are simply the condition name itself (case-insensitive substring).
const T2_CATEGORY_DEFAULTS: Record<ConditionCategory, { tests: string[]; supplements?: string[] }> = {
  autoimmune:        { tests: ['hs_crp', 'esr', 'vit_d_25oh', 'iron_panel'], supplements: [] },
  cardiovascular:    { tests: ['lipid_panel_extended', 'apob', 'hs_crp', 'hba1c'] },
  metabolic:         { tests: ['hba1c', 'fasting_insulin_homa_ir', 'lipid_panel', 'liver_panel'] },
  hormonal:          { tests: ['shbg', 'thyroid_panel', 'vit_d_25oh'] },
  thyroid:           { tests: ['thyroid_panel', 'thyroid_antibodies', 'reverse_t3'] },
  gi:                { tests: ['cmp', 'cbc', 'fecal_calprotectin', 'celiac_serology'] },
  mental_health:     { tests: ['vit_d_25oh', 'vit_b12_workup', 'tsh', 'rbc_magnesium'] },
  neurological:      { tests: ['vit_b12_workup', 'vit_d_25oh', 'rbc_magnesium'] },
  musculoskeletal:   { tests: ['vit_d_25oh', 'hs_crp', 'rbc_magnesium'] },
  kidney:            { tests: ['cystatin_c_egfr', 'uacr', 'pth', 'vit_d_25oh'] },
  respiratory:       { tests: ['vit_d_25oh', 'cbc'] },
  sleep:             { tests: ['cbc', 'a1c', 'lipid_panel'] },
  skin:              { tests: ['hs_crp', 'vit_d_25oh', 'iron_panel'] },
  nutritional:       { tests: ['cmp', 'cbc', 'vit_b12_workup', 'iron_panel', 'vit_d_25oh'] },
  reproductive:      { tests: ['shbg', 'thyroid_panel', 'iron_panel', 'vit_d_25oh'] },
  oncology:          { tests: ['cbc', 'cmp', 'hs_crp'] },
  infectious:        { tests: ['cbc', 'hs_crp'] },
  environmental:     { tests: ['cbc', 'cmp'] },
};

// ── Public API ─────────────────────────────────────────────────────────────
const ALL: ConditionDef[] = [...T1];

const BY_KEY = new Map<string, ConditionDef>(ALL.map(c => [c.key, c]));

/** Match a condition key against the user's stated condition text. */
export function hasCondition(userConditionsText: string, key: string): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;
  return def.aliases.some(re => re.test(userConditionsText));
}

/** Returns the canonical condition def for a key, or undefined. */
export function getCondition(key: string): ConditionDef | undefined {
  return BY_KEY.get(key);
}

/** All condition keys the user appears to have (Tier 1 only). Order preserved. */
export function detectConditions(userConditionsText: string): string[] {
  const hits: string[] = [];
  for (const c of ALL) {
    if (c.aliases.some(re => re.test(userConditionsText))) hits.push(c.key);
  }
  return hits;
}

/**
 * Detect conditions including those *implied* by medications. e.g., a user
 * on Armour Thyroid but who didn't enter "Hypothyroidism" in onboarding —
 * we still want the Hashimoto's pathway to fire.
 *
 * `medClassKeys` is the list of medication-class keys (from medicationAliases)
 * the user is on.
 */
export function detectConditionsIncludingImplied(
  userConditionsText: string,
  medClassKeys: string[]
): { explicit: string[]; implied: string[]; all: string[] } {
  const explicit = detectConditions(userConditionsText);
  const explicitSet = new Set(explicit);
  const implied: string[] = [];
  for (const c of ALL) {
    if (explicitSet.has(c.key)) continue;
    const byMed = (c.impliedByMed ?? []).some(mk => medClassKeys.includes(mk));
    const byCond = (c.impliedBy ?? []).some(ck => explicitSet.has(ck));
    if (byMed || byCond) implied.push(c.key);
  }
  return { explicit, implied, all: [...explicit, ...implied] };
}

/** Given a user-typed condition string we don't have in Tier 1, return the
 *  category fallback tests + supplements. Used for the long tail of 140+
 *  conditions the picker exposes. */
export function categoryFallbackForCondition(
  rawConditionText: string,
  pickerCategory: ConditionCategory
): { tests: string[]; supplements: string[] } {
  void rawConditionText; // kept for future heuristics
  const def = T2_CATEGORY_DEFAULTS[pickerCategory];
  return {
    tests: def?.tests ?? [],
    supplements: def?.supplements ?? [],
  };
}

/** Helpful for prompt-building: one-liner describing what condition we matched. */
export function describeMatchedConditions(userConditionsText: string): string {
  const hits = detectConditions(userConditionsText);
  if (hits.length === 0) return 'none recognized in Tier 1';
  return hits.map(k => BY_KEY.get(k)!.label).join(', ');
}

export const CONDITION_REGISTRY = ALL;
export const CONDITION_CATEGORY_DEFAULTS = T2_CATEGORY_DEFAULTS;

// ── Condition-specific test panels for the wellness-plan prompt ────────
// Each entry corresponds to a canonical condition key returned by
// detectConditions(). The text is what gets injected into the prompt's
// retest_timeline guidance — only conditions the patient actually has
// fire (vs the previous static block listing all 13 panels on every call).
const CONDITION_TEST_PANELS: Record<string, string> = {
  ibd:                    'IBD (UC/Crohn\'s): Fecal Calprotectin, Celiac Serology, Iron Panel, Vit D + B12 + Folate workups',
  hashimotos:             'Hashimoto\'s: TSH+Free T3+Free T4, TPO Ab + Tg Ab if not done',
  graves:                 'Graves: TSH+Free T3+Free T4 + TSI Ab',
  t2d:                    'T2D/prediabetes: A1c, Fasting Insulin + HOMA-IR, Lipid Panel, UACR, eGFR',
  pcos:                   'PCOS: Total+Free T, DHEA-S, LH:FSH, SHBG, Fasting Insulin + HOMA-IR',
  hypertension:           'Hypertension: BMP/CMP, UACR, Lipid Panel, A1c',
  ckd:                    'CKD: Cystatin C+eGFR, UACR, BMP, PTH, Vit D, Iron Panel',
  cad:                    'CHF/CAD: Lipid + ApoB, hs-CRP, NT-proBNP if HF, A1c',
  lupus:                  'Lupus/RA/SLE: ESR+hs-CRP, ANA reflex (only if ANA+), CBC, CMP, UACR',
  ra:                     'Lupus/RA/SLE: ESR+hs-CRP, ANA reflex (only if ANA+), CBC, CMP, UACR',
  osteoporosis:           'Osteoporosis: Calcium, Vit D, PTH, DEXA if 50+ or long-term steroids',
  depression:             'Mood disorders: TSH, Vit D, B12+MMA, hs-CRP',
  anxiety:                'Mood disorders: TSH, Vit D, B12+MMA, hs-CRP',
  // Chronic-fatigue panel maps off self-reported fatigue, not a diagnosis,
  // so it isn't in this registry — fatigue is covered by the symptom→test map.
};

/** Build the condition-specific test panel block for the wellness-plan
 *  user message. Returns only the lines for conditions this patient has.
 *  Empty string if no matches (no need to show the section header).
 *
 *  Saves ~150 tokens per call vs the 13-line static block.
 */
export function conditionTestPanelsFor(detectedKeys: string[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const key of detectedKeys) {
    const text = CONDITION_TEST_PANELS[key];
    if (!text || seen.has(text)) continue;
    seen.add(text);
    lines.push(`     ${text}`);
  }
  if (lines.length === 0) return '';
  return `   CONDITION-SPECIFIC TESTS (for this patient's diagnosed conditions — layer ON TOP of standard panels, not replace):\n${lines.join('\n')}\n`;
}
