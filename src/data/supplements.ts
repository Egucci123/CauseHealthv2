// src/data/supplements.ts
// Comprehensive supplement database with LAB INTERACTION data.
// This is critical clinical context — many supplements alter lab values
// and must be considered when interpreting bloodwork.

export interface SupplementEntry {
  name: string;                    // Canonical display name
  category: SupplementCategory;
  aliases: string[];               // Other names/forms users might call it
  description: string;             // What it is, why people take it
  /** Lab markers that this supplement directly alters or interferes with */
  labInteractions: LabInteraction[];
  /** Common reasons users take this */
  commonUses: string[];
  /** Is this commonly recommended for medication-induced depletion? */
  depletesFor?: string[];          // e.g., ["statins", "PPIs"]
}

/** Common dose dropdown options for each supplement.
 * Keyed by canonical names matching SUPPLEMENT_DB exactly so direct lookups never miss.
 * getCommonDoses also falls back to fuzzy match for custom-typed entries.
 */
export const COMMON_DOSES: Record<string, string[]> = {
  // Vitamins
  'Vitamin D3 (Cholecalciferol)': ['1,000 IU', '2,000 IU', '4,000 IU', '5,000 IU', '8,000 IU', '10,000 IU', '50,000 IU weekly'],
  'Vitamin K2 (MK-7)': ['90 mcg', '100 mcg', '180 mcg', '200 mcg', '300 mcg'],
  'Vitamin B12 (Methylcobalamin)': ['500 mcg', '1,000 mcg', '2,500 mcg', '5,000 mcg'],
  'Methylfolate (5-MTHF)': ['400 mcg', '800 mcg', '1,000 mcg', '5 mg', '15 mg'],
  'Vitamin C (Ascorbic Acid)': ['500 mg', '1,000 mg', '2,000 mg', '3,000 mg'],
  'Niacin (Vitamin B3)': ['100 mg', '250 mg', '500 mg', '1,000 mg', '2,000 mg'],
  'Biotin (B7)': ['1,000 mcg', '5,000 mcg', '10,000 mcg'],
  'Multivitamin': ['1 capsule', '2 capsules', '1 packet'],

  // Minerals
  'Magnesium (Glycinate / Citrate / Malate)': ['200 mg', '300 mg', '400 mg', '500 mg', '600 mg'],
  'Zinc (Bisglycinate / Picolinate)': ['15 mg', '25 mg', '30 mg', '50 mg'],
  'Iron (Ferrous Bisglycinate)': ['18 mg', '25 mg', '45 mg', '65 mg'],
  'Calcium': ['500 mg', '1,000 mg', '1,200 mg'],

  // Fats/Performance
  'Omega-3 (Fish Oil / EPA/DHA)': ['1 g', '2 g', '3 g', '4 g'],
  'CoQ10 (Ubiquinol)': ['100 mg', '200 mg', '300 mg', '400 mg'],
  'Creatine Monohydrate': ['3 g', '5 g', '10 g'],
  'Whey Protein': ['20 g', '25 g', '30 g', '40 g'],
  'Collagen Peptides': ['10 g', '15 g', '20 g'],

  // Metabolic/Anti-inflammatory
  'Berberine': ['500 mg', '1,000 mg', '1,500 mg'],
  'NAC (N-Acetyl Cysteine)': ['600 mg', '1,200 mg', '1,800 mg'],
  'Curcumin (Turmeric Extract)': ['500 mg', '1,000 mg', '1,500 mg'],
  'Quercetin': ['250 mg', '500 mg', '1,000 mg'],
  'Resveratrol': ['100 mg', '250 mg', '500 mg'],
  'TMG (Trimethylglycine / Betaine)': ['500 mg', '1,000 mg', '2,000 mg', '3,000 mg'],
  'SAM-e': ['200 mg', '400 mg', '800 mg', '1,200 mg'],

  // Adaptogens
  'Ashwagandha (KSM-66)': ['300 mg', '600 mg', '1,200 mg'],
  'Rhodiola Rosea': ['200 mg', '400 mg', '600 mg'],
  "Lion's Mane": ['500 mg', '1,000 mg', '2,000 mg'],

  // Hormones
  'DHEA': ['10 mg', '25 mg', '50 mg'],
  'Testosterone (TRT)': ['100 mg/wk', '150 mg/wk', '200 mg/wk'],
  'Saw Palmetto': ['160 mg', '320 mg'],

  // Sleep/Mood
  'L-Theanine': ['100 mg', '200 mg', '400 mg'],
  'Melatonin': ['0.3 mg', '1 mg', '3 mg', '5 mg', '10 mg'],

  // Other
  'Probiotic': ['10 billion CFU', '25 billion CFU', '50 billion CFU', '100 billion CFU'],
  'NMN / NR (NAD+ Boosters)': ['250 mg', '500 mg', '1,000 mg'],

  // Common short aliases (when user types custom, fuzzy match lands here)
  'Vitamin D': ['1,000 IU', '2,000 IU', '4,000 IU', '5,000 IU', '8,000 IU', '10,000 IU', '50,000 IU weekly'],
  'Vitamin K': ['90 mcg', '100 mcg', '180 mcg', '200 mcg', '300 mcg'],
  'Vitamin B12': ['500 mcg', '1,000 mcg', '2,500 mcg', '5,000 mcg'],
  'Vitamin C': ['500 mg', '1,000 mg', '2,000 mg', '3,000 mg'],
  'Vitamin A': ['5,000 IU', '10,000 IU', '25,000 IU'],
  'Vitamin E': ['200 IU', '400 IU', '800 IU'],
  'B12': ['500 mcg', '1,000 mcg', '2,500 mcg', '5,000 mcg'],
  'Folate': ['400 mcg', '800 mcg', '1,000 mcg'],
  'Magnesium': ['200 mg', '300 mg', '400 mg', '500 mg', '600 mg'],
  'Zinc': ['15 mg', '25 mg', '30 mg', '50 mg'],
  'Iron': ['18 mg', '25 mg', '45 mg', '65 mg'],
  'Selenium': ['100 mcg', '200 mcg'],
  'Iodine': ['150 mcg', '225 mcg', '12.5 mg'],
  'Potassium': ['99 mg', '500 mg', '1,000 mg'],
  'Omega-3': ['1 g', '2 g', '3 g', '4 g'],
  'Fish Oil': ['1 g', '2 g', '3 g', '4 g'],
  'CoQ10': ['100 mg', '200 mg', '300 mg', '400 mg'],
  'Ubiquinol': ['100 mg', '200 mg', '300 mg'],
  'Creatine': ['3 g', '5 g', '10 g'],
  'Collagen': ['10 g', '15 g', '20 g'],
  'NAC': ['600 mg', '1,200 mg', '1,800 mg'],
  'TMG': ['500 mg', '1,000 mg', '2,000 mg', '3,000 mg'],
  'Curcumin': ['500 mg', '1,000 mg', '1,500 mg'],
  'Turmeric': ['500 mg', '1,000 mg', '1,500 mg'],
  'Ashwagandha': ['300 mg', '600 mg', '1,200 mg'],
  'Rhodiola': ['200 mg', '400 mg', '600 mg'],
  'Niacin': ['100 mg', '250 mg', '500 mg', '1,000 mg', '2,000 mg'],
  'Inositol': ['1 g', '2 g', '4 g'],
  'Glycine': ['1 g', '3 g', '5 g'],
  'Taurine': ['500 mg', '1,000 mg', '2,000 mg'],
  'L-Glutamine': ['5 g', '10 g', '15 g'],
  'L-Arginine': ['1 g', '3 g', '5 g'],
  'L-Citrulline': ['3 g', '6 g', '8 g'],
  'Glutathione': ['250 mg', '500 mg', '1,000 mg'],
};

// Generic dose options when supplement is not in the database — covers most real-world labels
const FALLBACK_DOSES = ['1 capsule', '2 capsules', '1 tablet', '2 tablets', '1 scoop', '1 tsp', '1 tbsp', 'As directed'];

/** Get common doses for a supplement by name. Falls back to generic options. */
export function getCommonDoses(supplementName: string): string[] {
  if (!supplementName) return FALLBACK_DOSES;
  if (COMMON_DOSES[supplementName]) return COMMON_DOSES[supplementName];
  const lower = supplementName.toLowerCase();
  // Exact case-insensitive
  for (const [key, doses] of Object.entries(COMMON_DOSES)) {
    if (key.toLowerCase() === lower) return doses;
  }
  // Partial match (either direction)
  for (const [key, doses] of Object.entries(COMMON_DOSES)) {
    const k = key.toLowerCase();
    if (lower.includes(k) || k.includes(lower)) return doses;
  }
  return FALLBACK_DOSES;
}

export type SupplementCategory =
  | 'Vitamin' | 'Mineral' | 'Amino Acid' | 'Herb' | 'Probiotic' | 'Hormone'
  | 'Performance' | 'Anti-inflammatory' | 'Adaptogen' | 'Metabolic' | 'Other';

export interface LabInteraction {
  marker: string;                  // The lab marker affected (e.g., "Creatinine", "TSH")
  effect: 'raises' | 'lowers' | 'falsely_alters' | 'masks';
  magnitude: 'mild' | 'moderate' | 'significant';
  note: string;                    // Plain-English clinical note
}

export const SUPPLEMENTS: SupplementEntry[] = [
  // ── CRITICAL LAB INTERFERENCES (MUST KNOW) ─────────────────────────────────
  {
    name: 'Biotin (B7)',
    category: 'Vitamin',
    aliases: ['biotin', 'b7', 'vitamin b7'],
    description: 'B-vitamin commonly taken for hair, skin, and nails. INTERFERES WITH MANY LAB ASSAYS.',
    labInteractions: [
      { marker: 'TSH', effect: 'falsely_alters', magnitude: 'significant', note: 'Biotin interferes with immunoassays — can falsely lower TSH or falsely elevate Free T3/T4. Stop biotin 48-72 hours before thyroid testing.' },
      { marker: 'Free T3', effect: 'falsely_alters', magnitude: 'significant', note: 'Falsely elevated on biotin >5mg/day.' },
      { marker: 'Free T4', effect: 'falsely_alters', magnitude: 'significant', note: 'Falsely elevated on biotin >5mg/day.' },
      { marker: 'Troponin', effect: 'falsely_alters', magnitude: 'significant', note: 'CRITICAL: biotin can falsely lower troponin — has masked heart attacks in ER patients. Stop 48hrs before any cardiac workup.' },
      { marker: 'Vitamin D, 25-Hydroxy', effect: 'falsely_alters', magnitude: 'moderate', note: 'Some assays affected.' },
      { marker: 'Cortisol', effect: 'falsely_alters', magnitude: 'moderate', note: 'Can interfere with some cortisol immunoassays.' },
    ],
    commonUses: ['Hair growth', 'Nail strength', 'Skin health'],
  },
  {
    name: 'Creatine Monohydrate',
    category: 'Performance',
    aliases: ['creatine', 'creatine monohydrate', 'creatine hcl'],
    description: 'Performance supplement for muscle/cognitive benefit. Raises serum creatinine — important to know when interpreting kidney function.',
    labInteractions: [
      { marker: 'Creatinine', effect: 'raises', magnitude: 'moderate', note: 'Creatine supplementation raises serum creatinine 0.1-0.3 mg/dL. This is NOT kidney damage — it\'s a known artifact. Do not interpret as kidney dysfunction without other markers.' },
      { marker: 'eGFR', effect: 'falsely_alters', magnitude: 'moderate', note: 'eGFR is calculated from creatinine, so it appears falsely lowered. Use cystatin C-based eGFR if true kidney function needed.' },
      { marker: 'BUN/Creatinine Ratio', effect: 'falsely_alters', magnitude: 'mild', note: 'Ratio appears artificially low.' },
    ],
    commonUses: ['Muscle performance', 'Cognitive function', 'Recovery'],
  },
  {
    name: 'Vitamin D3 (Cholecalciferol)',
    category: 'Vitamin',
    aliases: ['vitamin d', 'd3', 'cholecalciferol', 'vitamin d3'],
    description: 'Most common vitamin deficiency. Affects bone, immune, and hormone health.',
    labInteractions: [
      { marker: 'Vitamin D, 25-Hydroxy', effect: 'raises', magnitude: 'significant', note: 'Direct effect — supplementation raises this marker. Levels >50 ng/mL often reflect supplementation, not endogenous status.' },
      { marker: 'Calcium', effect: 'raises', magnitude: 'mild', note: 'High-dose D3 can mildly raise serum calcium via increased absorption.' },
    ],
    commonUses: ['Bone health', 'Immune support', 'Mood'],
    depletesFor: ['Statins', 'Corticosteroids', 'Anticonvulsants'],
  },
  {
    name: 'Vitamin B12 (Methylcobalamin)',
    category: 'Vitamin',
    aliases: ['b12', 'vitamin b12', 'methylcobalamin', 'cyanocobalamin'],
    description: 'Essential for nerves, red blood cells, and DNA. Critical for vegetarians, PPI users, metformin users.',
    labInteractions: [
      { marker: 'Vitamin B12', effect: 'raises', magnitude: 'significant', note: 'Supplementation dramatically raises serum B12 (often >2000 pg/mL). Once supplementing, serum B12 no longer reflects body stores — use methylmalonic acid (MMA) for true deficiency assessment.' },
      { marker: 'Homocysteine', effect: 'lowers', magnitude: 'moderate', note: 'B12 (with folate) lowers homocysteine.' },
      { marker: 'MCV', effect: 'lowers', magnitude: 'mild', note: 'If B12 was deficient, MCV may decrease as red blood cells normalize.' },
    ],
    commonUses: ['Energy', 'Neurological function', 'Vegan supplementation'],
    depletesFor: ['PPIs', 'Metformin', 'Mesalamine'],
  },
  {
    name: 'Methylfolate (5-MTHF)',
    category: 'Vitamin',
    aliases: ['methylfolate', 'folate', 'folic acid', 'l-methylfolate', '5-mthf'],
    description: 'Active form of folate. Methylated form bypasses MTHFR gene variants.',
    labInteractions: [
      { marker: 'Folate', effect: 'raises', magnitude: 'significant', note: 'Direct effect on serum folate.' },
      { marker: 'Homocysteine', effect: 'lowers', magnitude: 'significant', note: 'Folate (especially methylfolate) lowers homocysteine — most effective single intervention.' },
      { marker: 'MCV', effect: 'lowers', magnitude: 'mild', note: 'If folate was deficient, MCV decreases.' },
    ],
    commonUses: ['Methylation support', 'MTHFR variant', 'Pregnancy', 'Mood'],
    depletesFor: ['Mesalamine', 'Methotrexate', 'Oral contraceptives'],
  },
  {
    name: 'Iron (Ferrous Bisglycinate)',
    category: 'Mineral',
    aliases: ['iron', 'iron supplement', 'ferrous bisglycinate', 'ferrous sulfate'],
    description: 'For iron deficiency. Best absorbed with vitamin C, away from coffee/dairy.',
    labInteractions: [
      { marker: 'Iron', effect: 'raises', magnitude: 'significant', note: 'Direct supplementation raises serum iron. Best to draw labs at trough (12+ hrs post-dose).' },
      { marker: 'Ferritin', effect: 'raises', magnitude: 'significant', note: 'Iron stores increase over weeks. Monitor monthly.' },
      { marker: 'Iron Saturation', effect: 'raises', magnitude: 'moderate', note: 'Calculated from iron/TIBC.' },
      { marker: 'Hemoglobin', effect: 'raises', magnitude: 'moderate', note: 'If anemic, hemoglobin recovers over 2-3 months.' },
    ],
    commonUses: ['Anemia', 'Heavy menstrual bleeding', 'Pregnancy', 'Hair loss'],
  },
  {
    name: 'Niacin (Vitamin B3)',
    category: 'Vitamin',
    aliases: ['niacin', 'b3', 'vitamin b3', 'nicotinic acid', 'inositol hexaniacinate'],
    description: 'B-vitamin used at high doses for cholesterol management.',
    labInteractions: [
      { marker: 'HDL Cholesterol', effect: 'raises', magnitude: 'significant', note: 'High-dose niacin (1-3g) raises HDL 15-35%. Most effective HDL-raising intervention.' },
      { marker: 'Triglycerides', effect: 'lowers', magnitude: 'significant', note: 'Niacin lowers triglycerides 20-50%.' },
      { marker: 'LDL Cholesterol', effect: 'lowers', magnitude: 'moderate', note: 'Modest LDL reduction.' },
      { marker: 'ALT (SGPT)', effect: 'raises', magnitude: 'moderate', note: 'High-dose niacin can elevate liver enzymes — monitor LFTs.' },
      { marker: 'Glucose (Fasting)', effect: 'raises', magnitude: 'mild', note: 'Niacin can raise fasting glucose. Caution in prediabetics.' },
      { marker: 'Uric Acid', effect: 'raises', magnitude: 'mild', note: 'Niacin can precipitate gout in susceptible individuals.' },
    ],
    commonUses: ['Cholesterol management', 'Pellagra (rare)'],
  },
  {
    name: 'Omega-3 (Fish Oil / EPA/DHA)',
    category: 'Anti-inflammatory',
    aliases: ['omega 3', 'omega-3', 'fish oil', 'epa', 'dha', 'epa/dha'],
    description: 'Anti-inflammatory fatty acids. Cardiovascular and cognitive benefits.',
    labInteractions: [
      { marker: 'Triglycerides', effect: 'lowers', magnitude: 'significant', note: 'High-dose EPA/DHA (2-4g) lowers triglycerides 20-50%.' },
      { marker: 'hs-CRP', effect: 'lowers', magnitude: 'moderate', note: 'Reduces inflammation marker over weeks.' },
      { marker: 'HDL Cholesterol', effect: 'raises', magnitude: 'mild', note: 'Modest HDL increase.' },
      { marker: 'LDL Cholesterol', effect: 'raises', magnitude: 'mild', note: 'Can mildly raise LDL — usually large buoyant particles, not atherogenic.' },
    ],
    commonUses: ['Cardiovascular health', 'Inflammation', 'Brain', 'Joints'],
  },
  {
    name: 'Berberine',
    category: 'Herb',
    aliases: ['berberine', 'berberine hcl'],
    description: 'Plant alkaloid with metformin-like effects on glucose and lipids.',
    labInteractions: [
      { marker: 'Glucose (Fasting)', effect: 'lowers', magnitude: 'significant', note: 'AMPK activation reduces fasting glucose 10-20%.' },
      { marker: 'Hemoglobin A1c', effect: 'lowers', magnitude: 'significant', note: 'Lowers A1c 0.3-0.7% over 3 months.' },
      { marker: 'Triglycerides', effect: 'lowers', magnitude: 'moderate', note: 'Reduces triglycerides via lipid metabolism effects.' },
      { marker: 'LDL Cholesterol', effect: 'lowers', magnitude: 'moderate', note: 'Reduces LDL 15-25%.' },
    ],
    commonUses: ['Insulin resistance', 'Type 2 diabetes', 'PCOS', 'Cholesterol'],
  },
  {
    name: 'Magnesium (Glycinate / Citrate / Malate)',
    category: 'Mineral',
    aliases: ['magnesium', 'mag', 'magnesium glycinate', 'magnesium citrate', 'magnesium malate', 'magnesium oxide'],
    description: 'Essential mineral for sleep, muscle, mood, blood pressure. Widely deficient.',
    labInteractions: [
      { marker: 'Magnesium', effect: 'raises', magnitude: 'mild', note: 'Serum magnesium poorly reflects total body stores. RBC magnesium is more accurate. Don\'t expect dramatic changes in serum.' },
      { marker: 'Calcium', effect: 'mild', magnitude: 'mild', note: 'Magnesium and calcium balance — high mag can compete with calcium absorption.' } as any,
    ],
    commonUses: ['Sleep', 'Anxiety', 'Muscle cramps', 'Migraines', 'Constipation'],
    depletesFor: ['PPIs', 'Diuretics', 'Corticosteroids'],
  },
  {
    name: 'Zinc (Bisglycinate / Picolinate)',
    category: 'Mineral',
    aliases: ['zinc', 'zinc bisglycinate', 'zinc picolinate', 'zinc gluconate'],
    description: 'Trace mineral for immune function, wound healing, hormone production.',
    labInteractions: [
      { marker: 'Zinc', effect: 'raises', magnitude: 'moderate', note: 'Serum zinc rises with supplementation but is a poor marker of total stores.' },
      { marker: 'Copper', effect: 'lowers', magnitude: 'moderate', note: 'High-dose zinc (>40mg) competes with copper absorption — long-term use can cause copper deficiency. Monitor copper if zinc is high-dose.' },
    ],
    commonUses: ['Immune support', 'Acne', 'Wound healing', 'Testosterone support'],
    depletesFor: ['ACE inhibitors', 'Diuretics', 'PPIs'],
  },
  {
    name: 'CoQ10 (Ubiquinol)',
    category: 'Anti-inflammatory',
    aliases: ['coq10', 'ubiquinol', 'ubiquinone', 'coenzyme q10'],
    description: 'Mitochondrial support. Critical for statin users — statins block CoQ10 synthesis.',
    labInteractions: [
      { marker: 'CK (Creatine Kinase)', effect: 'lowers', magnitude: 'moderate', note: 'May reduce statin-induced CK elevation by supporting mitochondrial function.' },
      { marker: 'ALT (SGPT)', effect: 'mild', magnitude: 'mild', note: 'Generally protective effect on liver.' } as any,
    ],
    commonUses: ['Statin myopathy prevention', 'Energy', 'Heart failure', 'Migraine'],
    depletesFor: ['Statins', 'Beta blockers'],
  },
  {
    name: 'Curcumin (Turmeric Extract)',
    category: 'Anti-inflammatory',
    aliases: ['curcumin', 'turmeric', 'turmeric extract', 'meriva', 'bcm-95'],
    description: 'Active compound from turmeric. Strong anti-inflammatory.',
    labInteractions: [
      { marker: 'hs-CRP', effect: 'lowers', magnitude: 'moderate', note: 'Reduces inflammation marker.' },
      { marker: 'ALT (SGPT)', effect: 'lowers', magnitude: 'mild', note: 'Hepatoprotective effects in NAFLD.' },
      { marker: 'Triglycerides', effect: 'lowers', magnitude: 'mild', note: 'Modest effect.' },
    ],
    commonUses: ['Joint pain', 'IBD', 'Inflammation', 'Brain health'],
  },
  {
    name: 'NAC (N-Acetyl Cysteine)',
    category: 'Amino Acid',
    aliases: ['nac', 'n-acetyl cysteine', 'acetylcysteine'],
    description: 'Glutathione precursor. Antioxidant and mucolytic.',
    labInteractions: [
      { marker: 'ALT (SGPT)', effect: 'lowers', magnitude: 'mild', note: 'Hepatoprotective via glutathione support.' },
      { marker: 'Homocysteine', effect: 'lowers', magnitude: 'mild', note: 'Can mildly lower homocysteine.' },
    ],
    commonUses: ['Liver support', 'Respiratory', 'PCOS', 'Mental health (OCD)'],
  },
  {
    name: 'DHEA',
    category: 'Hormone',
    aliases: ['dhea', '7-keto dhea'],
    description: 'Adrenal hormone precursor. Often supplemented for low DHEA-S.',
    labInteractions: [
      { marker: 'DHEA-Sulfate', effect: 'raises', magnitude: 'significant', note: 'Direct effect — supplementation raises DHEA-S.' },
      { marker: 'Testosterone', effect: 'raises', magnitude: 'moderate', note: 'DHEA converts to testosterone in some individuals.' },
      { marker: 'Estradiol', effect: 'raises', magnitude: 'moderate', note: 'DHEA can convert to estrogens, especially in women.' },
    ],
    commonUses: ['Adrenal support', 'Aging', 'Libido', 'Mood'],
  },
  {
    name: 'Testosterone (TRT)',
    category: 'Hormone',
    aliases: ['testosterone', 'trt', 'testosterone replacement'],
    description: 'Hormone replacement for low T. Prescription only.',
    labInteractions: [
      { marker: 'Testosterone', effect: 'raises', magnitude: 'significant', note: 'Direct supplementation. Trough/peak depends on injection cycle.' },
      { marker: 'Free Testosterone', effect: 'raises', magnitude: 'significant', note: 'Active form increases proportionally.' },
      { marker: 'Estradiol', effect: 'raises', magnitude: 'moderate', note: 'Aromatization of testosterone to estradiol.' },
      { marker: 'Hematocrit', effect: 'raises', magnitude: 'moderate', note: 'TRT can cause secondary polycythemia. Monitor and may need phlebotomy if Hct >54.' },
      { marker: 'Hemoglobin', effect: 'raises', magnitude: 'moderate', note: 'Same mechanism as hematocrit elevation.' },
      { marker: 'PSA', effect: 'raises', magnitude: 'mild', note: 'Mild PSA elevation possible. Monitor.' },
      { marker: 'LH', effect: 'lowers', magnitude: 'significant', note: 'Exogenous T suppresses pituitary LH.' },
      { marker: 'FSH', effect: 'lowers', magnitude: 'significant', note: 'Exogenous T suppresses FSH — affects fertility.' },
    ],
    commonUses: ['Low testosterone', 'Hypogonadism'],
  },
  {
    name: 'Whey Protein',
    category: 'Performance',
    aliases: ['whey protein', 'whey', 'protein powder'],
    description: 'Concentrated dairy protein. Common for fitness/recovery.',
    labInteractions: [
      { marker: 'BUN', effect: 'raises', magnitude: 'mild', note: 'High protein intake raises urea nitrogen — not kidney dysfunction.' },
      { marker: 'Creatinine', effect: 'raises', magnitude: 'mild', note: 'Slight elevation with high protein intake.' },
    ],
    commonUses: ['Muscle building', 'Recovery', 'Protein intake'],
  },
  {
    name: 'Vitamin C (Ascorbic Acid)',
    category: 'Vitamin',
    aliases: ['vitamin c', 'ascorbic acid', 'sodium ascorbate', 'liposomal vitamin c'],
    description: 'Antioxidant. High doses can interfere with several lab tests.',
    labInteractions: [
      { marker: 'Glucose (Fasting)', effect: 'falsely_alters', magnitude: 'mild', note: 'High-dose vitamin C can interfere with some glucose meters/tests, falsely lowering readings.' },
      { marker: 'Uric Acid', effect: 'lowers', magnitude: 'mild', note: 'Can lower uric acid — beneficial for gout risk.' },
    ],
    commonUses: ['Immune', 'Antioxidant', 'Iron absorption'],
  },

  // ── ADAPTOGENS ─────────────────────────────────────────────────────────
  {
    name: 'Ashwagandha (KSM-66)',
    category: 'Adaptogen',
    aliases: ['ashwagandha', 'ksm-66', 'withania somnifera'],
    description: 'Adaptogenic herb for stress, sleep, and hormone balance.',
    labInteractions: [
      { marker: 'Cortisol', effect: 'lowers', magnitude: 'moderate', note: 'Reduces cortisol 14-32% in stressed individuals (RCT data).' },
      { marker: 'Testosterone', effect: 'raises', magnitude: 'mild', note: 'Modest testosterone increase in men with low T.' },
      { marker: 'TSH', effect: 'falsely_alters', magnitude: 'mild', note: 'May modulate thyroid — caution in hyperthyroid; could lower TSH artificially.' },
    ],
    commonUses: ['Stress', 'Sleep', 'Anxiety', 'Testosterone support'],
  },
  {
    name: 'Rhodiola Rosea',
    category: 'Adaptogen',
    aliases: ['rhodiola', 'rhodiola rosea', 'golden root'],
    description: 'Adaptogenic herb for fatigue, cognitive performance, and mood.',
    labInteractions: [
      { marker: 'Cortisol', effect: 'lowers', magnitude: 'mild', note: 'Modest cortisol reduction in chronic stress.' },
    ],
    commonUses: ['Fatigue', 'Mental performance', 'Mood'],
  },

  // ── COMMON BUT FEWER LAB EFFECTS ─────────────────────────────────────────
  {
    name: 'Multivitamin',
    category: 'Vitamin',
    aliases: ['multivitamin', 'multi', 'mvi'],
    description: 'Combination of vitamins and minerals. Effects depend on formulation.',
    labInteractions: [
      { marker: 'Folate', effect: 'raises', magnitude: 'mild', note: 'If contains folic acid/folate.' },
      { marker: 'Vitamin B12', effect: 'raises', magnitude: 'mild', note: 'If contains B12.' },
      { marker: 'Iron', effect: 'raises', magnitude: 'mild', note: 'If contains iron — most do not.' },
    ],
    commonUses: ['General supplementation', 'Nutritional insurance'],
  },
  {
    name: 'Probiotic',
    category: 'Probiotic',
    aliases: ['probiotic', 'probiotics', 'lactobacillus', 'bifidobacterium'],
    description: 'Live beneficial bacteria for gut health.',
    labInteractions: [],
    commonUses: ['Gut health', 'IBS/IBD', 'Post-antibiotic', 'Immune'],
  },
  {
    name: 'Collagen Peptides',
    category: 'Performance',
    aliases: ['collagen', 'collagen peptides', 'hydrolyzed collagen'],
    description: 'Protein supplement for skin, joint, and connective tissue support.',
    labInteractions: [
      { marker: 'BUN', effect: 'raises', magnitude: 'mild', note: 'Mild elevation from protein content.' },
    ],
    commonUses: ['Skin', 'Joints', 'Hair'],
  },
  {
    name: 'L-Theanine',
    category: 'Amino Acid',
    aliases: ['l-theanine', 'theanine', 'suntheanine'],
    description: 'Amino acid from tea. Promotes calm without sedation.',
    labInteractions: [],
    commonUses: ['Anxiety', 'Focus', 'Sleep quality'],
  },
  {
    name: 'Melatonin',
    category: 'Hormone',
    aliases: ['melatonin'],
    description: 'Sleep hormone. Used for circadian rhythm support.',
    labInteractions: [],
    commonUses: ['Sleep', 'Jet lag', 'Shift work'],
  },
  {
    name: 'Vitamin K2 (MK-7)',
    category: 'Vitamin',
    aliases: ['vitamin k', 'vitamin k2', 'k2', 'mk-7', 'menaquinone'],
    description: 'Directs calcium to bones, away from arteries. Often paired with vitamin D.',
    labInteractions: [
      { marker: 'INR', effect: 'lowers', magnitude: 'significant', note: 'CRITICAL: K2 can interfere with warfarin, lowering INR. Inform doctor if on blood thinners.' },
      { marker: 'PT (Prothrombin Time)', effect: 'lowers', magnitude: 'significant', note: 'Same warfarin interaction concern.' },
    ],
    commonUses: ['Bone health', 'Cardiovascular', 'With vitamin D'],
  },
  {
    name: 'Calcium',
    category: 'Mineral',
    aliases: ['calcium', 'calcium citrate', 'calcium carbonate'],
    description: 'For bone health, especially in older adults or low dietary intake.',
    labInteractions: [
      { marker: 'Calcium', effect: 'raises', magnitude: 'mild', note: 'Direct mild elevation.' },
    ],
    commonUses: ['Bone health', 'Osteoporosis'],
    depletesFor: ['Corticosteroids', 'PPIs (use citrate, not carbonate)'],
  },
  {
    name: 'Lion\'s Mane',
    category: 'Herb',
    aliases: ["lion's mane", 'lions mane', 'hericium erinaceus'],
    description: 'Mushroom for cognitive support and nerve growth.',
    labInteractions: [],
    commonUses: ['Cognitive function', 'Neuropathy', 'Mood'],
  },
  {
    name: 'Resveratrol',
    category: 'Anti-inflammatory',
    aliases: ['resveratrol', 'trans-resveratrol'],
    description: 'Polyphenol from grapes/wine. Studied for longevity.',
    labInteractions: [
      { marker: 'hs-CRP', effect: 'lowers', magnitude: 'mild', note: 'Anti-inflammatory effect.' },
    ],
    commonUses: ['Longevity', 'Cardiovascular', 'Anti-aging'],
  },
  {
    name: 'NMN / NR (NAD+ Boosters)',
    category: 'Anti-inflammatory',
    aliases: ['nmn', 'nr', 'nicotinamide riboside', 'nicotinamide mononucleotide'],
    description: 'NAD+ precursors. Studied for cellular aging and energy.',
    labInteractions: [],
    commonUses: ['Longevity', 'Energy', 'Cellular health'],
  },
  {
    name: 'Quercetin',
    category: 'Anti-inflammatory',
    aliases: ['quercetin'],
    description: 'Flavonoid for immune and inflammatory support.',
    labInteractions: [
      { marker: 'hs-CRP', effect: 'lowers', magnitude: 'mild', note: 'Anti-inflammatory effect.' },
    ],
    commonUses: ['Allergies', 'Immune', 'Inflammation'],
  },
  {
    name: 'TMG (Trimethylglycine / Betaine)',
    category: 'Amino Acid',
    aliases: ['tmg', 'betaine', 'trimethylglycine', 'betaine hcl'],
    description: 'Methyl donor. Lowers homocysteine.',
    labInteractions: [
      { marker: 'Homocysteine', effect: 'lowers', magnitude: 'significant', note: 'Methyl donor — direct lowering effect.' },
    ],
    commonUses: ['Methylation', 'Homocysteine reduction', 'Liver support'],
  },
  {
    name: 'SAM-e',
    category: 'Amino Acid',
    aliases: ['sam-e', 'same', 's-adenosyl methionine'],
    description: 'Methyl donor for mood, joint, and liver support.',
    labInteractions: [
      { marker: 'Homocysteine', effect: 'lowers', magnitude: 'mild', note: 'Methyl donor effect.' },
      { marker: 'ALT (SGPT)', effect: 'lowers', magnitude: 'mild', note: 'Hepatoprotective in NAFLD.' },
    ],
    commonUses: ['Depression', 'Joint pain', 'Liver health'],
  },
  {
    name: 'Saw Palmetto',
    category: 'Herb',
    aliases: ['saw palmetto'],
    description: 'Herb for prostate health and androgen modulation.',
    labInteractions: [
      { marker: 'PSA', effect: 'lowers', magnitude: 'mild', note: 'Can mildly lower PSA — be aware when interpreting prostate cancer screening.' },
      { marker: 'DHT', effect: 'lowers', magnitude: 'mild', note: '5-alpha reductase inhibitor (mild).' } as any,
    ],
    commonUses: ['BPH', 'Hair loss (DHT-mediated)'],
  },
  // ── Expanded supplement database ────────────────────────────────────────────
  // Vitamins
  { name: 'Vitamin A (Retinol)', category: 'Vitamin', aliases: ['retinol', 'vitamin a'], description: 'Fat-soluble vitamin for vision, immunity, skin.', labInteractions: [{ marker: 'Vitamin A', effect: 'raises', magnitude: 'moderate', note: 'High doses raise serum retinol; toxicity risk over 25,000 IU long-term.' }], commonUses: ['Vision', 'Skin', 'Immunity'] },
  { name: 'Vitamin E (Tocopherol)', category: 'Vitamin', aliases: ['vitamin e', 'tocopherol', 'mixed tocopherols'], description: 'Antioxidant fat-soluble vitamin.', labInteractions: [{ marker: 'INR', effect: 'raises', magnitude: 'mild', note: 'High-dose mildly thins blood — caution with warfarin.' }], commonUses: ['Antioxidant', 'Skin'] },
  { name: 'Vitamin B1 (Thiamine)', category: 'Vitamin', aliases: ['thiamine', 'b1'], description: 'Energy metabolism, nerve function.', labInteractions: [], commonUses: ['Nerve health', 'Energy', 'Alcohol-related deficiency'] },
  { name: 'Vitamin B2 (Riboflavin)', category: 'Vitamin', aliases: ['riboflavin', 'b2'], description: 'Energy production, migraine prevention.', labInteractions: [], commonUses: ['Migraine prevention', 'Energy'] },
  { name: 'Vitamin B5 (Pantothenic Acid)', category: 'Vitamin', aliases: ['pantothenic acid', 'b5'], description: 'Adrenal and energy support.', labInteractions: [], commonUses: ['Adrenal support', 'Skin'] },
  { name: 'Vitamin B6 (P5P)', category: 'Vitamin', aliases: ['b6', 'pyridoxine', 'p5p', 'pyridoxal-5-phosphate'], description: 'Neurotransmitter and homocysteine metabolism.', labInteractions: [{ marker: 'Homocysteine', effect: 'lowers', magnitude: 'moderate', note: 'B6 + folate + B12 lowers homocysteine.' }], commonUses: ['Mood', 'PMS', 'Homocysteine'] },
  // Minerals
  { name: 'Selenium', category: 'Mineral', aliases: ['selenium', 'selenomethionine'], description: 'Trace mineral for thyroid and antioxidant function.', labInteractions: [{ marker: 'TPO antibodies', effect: 'lowers', magnitude: 'moderate', note: '200 mcg daily lowers thyroid antibodies in Hashimoto\'s.' } as any], commonUses: ['Thyroid', 'Antioxidant'] },
  { name: 'Iodine', category: 'Mineral', aliases: ['iodine', 'iodoral', 'kelp', 'lugol\'s'], description: 'Essential for thyroid hormone production.', labInteractions: [{ marker: 'TSH', effect: 'falsely_alters', magnitude: 'moderate', note: 'High doses can swing TSH up or down.' }], commonUses: ['Thyroid', 'Breast health'] },
  { name: 'Potassium', category: 'Mineral', aliases: ['potassium', 'potassium citrate'], description: 'Electrolyte for blood pressure and muscle function.', labInteractions: [{ marker: 'Potassium', effect: 'raises', magnitude: 'moderate', note: 'Caution with ACE inhibitors and ARBs (hyperkalemia).' }], commonUses: ['Blood pressure', 'Muscle cramps'] },
  { name: 'Calcium', category: 'Mineral', aliases: ['calcium', 'calcium citrate', 'calcium carbonate'], description: 'Bone mineral.', labInteractions: [{ marker: 'Calcium', effect: 'raises', magnitude: 'mild', note: 'Take with vitamin K2 to direct to bone, not arteries.' }], commonUses: ['Bone health', 'Osteoporosis'] },
  { name: 'Boron', category: 'Mineral', aliases: ['boron'], description: 'Trace mineral for bone and hormone health.', labInteractions: [], commonUses: ['Bone health', 'Testosterone support'] },
  { name: 'Copper', category: 'Mineral', aliases: ['copper'], description: 'Trace mineral; balanced with zinc.', labInteractions: [{ marker: 'Ceruloplasmin', effect: 'raises', magnitude: 'moderate', note: 'Long-term zinc without copper depletes copper.' } as any], commonUses: ['Iron metabolism', 'Connective tissue'] },
  { name: 'Manganese', category: 'Mineral', aliases: ['manganese'], description: 'Trace mineral for bone and antioxidant enzymes.', labInteractions: [], commonUses: ['Bone health'] },
  { name: 'Chromium', category: 'Mineral', aliases: ['chromium', 'chromium picolinate'], description: 'Insulin sensitivity support.', labInteractions: [{ marker: 'Fasting glucose', effect: 'lowers', magnitude: 'mild', note: 'Mild glucose-lowering effect.' }], commonUses: ['Blood sugar', 'Cravings'] },
  { name: 'Molybdenum', category: 'Mineral', aliases: ['molybdenum'], description: 'Detox enzyme cofactor.', labInteractions: [], commonUses: ['Detox', 'Sulfite tolerance'] },
  { name: 'Lithium Orotate', category: 'Mineral', aliases: ['lithium', 'lithium orotate'], description: 'Low-dose lithium for mood and cognition.', labInteractions: [], commonUses: ['Mood', 'Brain health'] },
  { name: 'Silica', category: 'Mineral', aliases: ['silica', 'horsetail'], description: 'Connective tissue and hair support.', labInteractions: [], commonUses: ['Hair', 'Skin', 'Joints'] },
  // Amino acids / Aminos
  { name: 'L-Glutamine', category: 'Amino Acid', aliases: ['glutamine', 'l-glutamine'], description: 'Gut lining repair and immune support.', labInteractions: [], commonUses: ['Gut health', 'Recovery'] },
  { name: 'L-Arginine', category: 'Amino Acid', aliases: ['arginine', 'l-arginine'], description: 'Nitric oxide precursor; circulation.', labInteractions: [], commonUses: ['Circulation', 'Pump'] },
  { name: 'L-Citrulline', category: 'Amino Acid', aliases: ['citrulline', 'l-citrulline'], description: 'Nitric oxide and endurance support.', labInteractions: [], commonUses: ['Endurance', 'Pump'] },
  { name: 'L-Carnitine', category: 'Amino Acid', aliases: ['carnitine', 'acetyl-l-carnitine', 'alcar'], description: 'Fatty acid transport; mitochondrial energy.', labInteractions: [{ marker: 'TMAO', effect: 'raises', magnitude: 'mild', note: 'Long-term may raise cardiovascular marker TMAO.' } as any], commonUses: ['Energy', 'Brain', 'Athletic performance'] },
  { name: 'L-Tyrosine', category: 'Amino Acid', aliases: ['tyrosine', 'l-tyrosine'], description: 'Dopamine and thyroid hormone precursor.', labInteractions: [], commonUses: ['Focus', 'Mood', 'Thyroid'] },
  { name: 'L-Tryptophan', category: 'Amino Acid', aliases: ['tryptophan'], description: 'Serotonin precursor for sleep and mood.', labInteractions: [], commonUses: ['Sleep', 'Mood'] },
  { name: '5-HTP', category: 'Amino Acid', aliases: ['5-htp', '5-hydroxytryptophan'], description: 'Direct serotonin precursor.', labInteractions: [], commonUses: ['Sleep', 'Mood'] },
  { name: 'Glycine', category: 'Amino Acid', aliases: ['glycine'], description: 'Inhibitory amino for sleep and collagen.', labInteractions: [], commonUses: ['Sleep', 'Skin', 'Liver detox'] },
  { name: 'Taurine', category: 'Amino Acid', aliases: ['taurine'], description: 'Conditional amino for heart, eyes, mitochondria.', labInteractions: [], commonUses: ['Cardiovascular', 'Energy'] },
  { name: 'Beta-Alanine', category: 'Amino Acid', aliases: ['beta alanine', 'beta-alanine'], description: 'Carnosine precursor; muscular endurance.', labInteractions: [], commonUses: ['Endurance', 'Performance'] },
  { name: 'BCAA (Branched-Chain Amino Acids)', category: 'Amino Acid', aliases: ['bcaa', 'leucine', 'isoleucine', 'valine'], description: 'Recovery and muscle protein synthesis.', labInteractions: [], commonUses: ['Recovery', 'Muscle preservation'] },
  { name: 'EAA (Essential Amino Acids)', category: 'Amino Acid', aliases: ['eaa', 'essential amino acids'], description: 'Full essential amino spectrum.', labInteractions: [], commonUses: ['Recovery', 'Protein synthesis'] },
  { name: 'Glutathione', category: 'Amino Acid', aliases: ['glutathione', 'gsh'], description: 'Master antioxidant.', labInteractions: [], commonUses: ['Detox', 'Liver', 'Antioxidant'] },
  // Adaptogens / Mushrooms / Herbs
  { name: 'Holy Basil (Tulsi)', category: 'Adaptogen', aliases: ['tulsi', 'holy basil'], description: 'Adaptogen for stress and blood sugar.', labInteractions: [], commonUses: ['Stress', 'Blood sugar'] },
  { name: 'Schisandra', category: 'Adaptogen', aliases: ['schisandra'], description: 'Liver-supportive adaptogen.', labInteractions: [], commonUses: ['Liver', 'Stress', 'Endurance'] },
  { name: 'Eleuthero (Siberian Ginseng)', category: 'Adaptogen', aliases: ['eleuthero', 'siberian ginseng'], description: 'Energy and immune adaptogen.', labInteractions: [], commonUses: ['Energy', 'Immunity'] },
  { name: 'Panax Ginseng', category: 'Adaptogen', aliases: ['ginseng', 'korean ginseng', 'panax ginseng'], description: 'Energy, cognition, libido.', labInteractions: [], commonUses: ['Energy', 'Libido', 'Cognition'] },
  { name: 'Maca', category: 'Adaptogen', aliases: ['maca', 'maca root'], description: 'Andean root for hormone balance and energy.', labInteractions: [], commonUses: ['Libido', 'Energy', 'Hormone balance'] },
  { name: 'Reishi', category: 'Adaptogen', aliases: ['reishi', 'ganoderma'], description: 'Calming immune-modulating mushroom.', labInteractions: [], commonUses: ['Sleep', 'Immunity', 'Stress'] },
  { name: 'Cordyceps', category: 'Adaptogen', aliases: ['cordyceps'], description: 'Mushroom for endurance and ATP production.', labInteractions: [], commonUses: ['Energy', 'Endurance'] },
  { name: 'Chaga', category: 'Adaptogen', aliases: ['chaga'], description: 'Antioxidant immune mushroom.', labInteractions: [], commonUses: ['Immunity', 'Antioxidant'] },
  { name: 'Turkey Tail', category: 'Adaptogen', aliases: ['turkey tail', 'trametes'], description: 'Beta-glucan immune mushroom.', labInteractions: [], commonUses: ['Immunity', 'Gut'] },
  { name: 'Lion\'s Mane', category: 'Adaptogen', aliases: ['lions mane', "lion's mane", 'hericium'], description: 'Nerve growth factor mushroom for cognition.', labInteractions: [], commonUses: ['Brain', 'Memory', 'Nerve repair'] },
  // Anti-inflammatory / herbs
  { name: 'Boswellia', category: 'Anti-inflammatory', aliases: ['boswellia', 'frankincense'], description: 'Anti-inflammatory for joints and gut.', labInteractions: [], commonUses: ['Joint pain', 'IBD'] },
  { name: 'Ginger', category: 'Anti-inflammatory', aliases: ['ginger', 'zingiber'], description: 'Anti-inflammatory and digestive.', labInteractions: [], commonUses: ['Nausea', 'Joints', 'Digestion'] },
  { name: 'Quercetin', category: 'Anti-inflammatory', aliases: ['quercetin'], description: 'Flavonoid antioxidant; mast cell stabilizer.', labInteractions: [], commonUses: ['Allergies', 'Inflammation'] },
  { name: 'Resveratrol', category: 'Anti-inflammatory', aliases: ['resveratrol'], description: 'Polyphenol for longevity and cardiovascular health.', labInteractions: [], commonUses: ['Longevity', 'Cardiovascular'] },
  { name: 'Pterostilbene', category: 'Anti-inflammatory', aliases: ['pterostilbene'], description: 'Resveratrol analog with better bioavailability.', labInteractions: [], commonUses: ['Longevity', 'Cognition'] },
  { name: 'Bromelain', category: 'Anti-inflammatory', aliases: ['bromelain'], description: 'Pineapple enzyme for inflammation.', labInteractions: [], commonUses: ['Sinus', 'Inflammation'] },
  { name: 'Pycnogenol', category: 'Anti-inflammatory', aliases: ['pycnogenol', 'pine bark extract'], description: 'Pine bark antioxidant.', labInteractions: [], commonUses: ['Circulation', 'Skin'] },
  { name: 'Astaxanthin', category: 'Anti-inflammatory', aliases: ['astaxanthin'], description: 'Carotenoid antioxidant for skin and eyes.', labInteractions: [], commonUses: ['Skin', 'Eyes', 'Antioxidant'] },
  // Metabolic / longevity
  { name: 'NMN / NR (NAD+ Boosters)', category: 'Metabolic', aliases: ['nmn', 'nr', 'nicotinamide mononucleotide', 'nicotinamide riboside'], description: 'NAD+ precursors for cellular energy.', labInteractions: [], commonUses: ['Longevity', 'Energy'] },
  { name: 'Spermidine', category: 'Metabolic', aliases: ['spermidine'], description: 'Polyamine that triggers autophagy.', labInteractions: [], commonUses: ['Longevity', 'Autophagy'] },
  { name: 'Urolithin A', category: 'Metabolic', aliases: ['urolithin a', 'mitopure'], description: 'Mitophagy activator from pomegranate metabolites.', labInteractions: [], commonUses: ['Mitochondria', 'Muscle'] },
  { name: 'Fisetin', category: 'Metabolic', aliases: ['fisetin'], description: 'Senolytic flavonoid.', labInteractions: [], commonUses: ['Longevity', 'Senescent cell clearance'] },
  { name: 'Alpha-Lipoic Acid', category: 'Metabolic', aliases: ['ala', 'alpha lipoic acid', 'alpha-lipoic acid'], description: 'Antioxidant and insulin sensitizer.', labInteractions: [{ marker: 'Fasting glucose', effect: 'lowers', magnitude: 'mild', note: 'Improves insulin sensitivity.' }], commonUses: ['Diabetes', 'Neuropathy'] },
  { name: 'Inositol (Myo + D-chiro)', category: 'Metabolic', aliases: ['inositol', 'myo-inositol', 'd-chiro-inositol'], description: 'PCOS and insulin sensitivity support.', labInteractions: [{ marker: 'Fasting insulin', effect: 'lowers', magnitude: 'moderate', note: 'Helpful for PCOS-related insulin resistance.' }], commonUses: ['PCOS', 'Insulin sensitivity', 'Mood'] },
  // Sleep / mood / nervous system
  { name: 'GABA', category: 'Other', aliases: ['gaba'], description: 'Inhibitory neurotransmitter for relaxation.', labInteractions: [], commonUses: ['Anxiety', 'Sleep'] },
  { name: 'Magnesium L-Threonate', category: 'Mineral', aliases: ['magtein', 'magnesium l-threonate'], description: 'Brain-penetrating magnesium for cognition.', labInteractions: [], commonUses: ['Brain', 'Memory', 'Sleep'] },
  { name: 'Apigenin', category: 'Other', aliases: ['apigenin'], description: 'Chamomile flavonoid for sleep.', labInteractions: [], commonUses: ['Sleep', 'Calm'] },
  { name: 'Magnolia Bark', category: 'Herb', aliases: ['magnolia bark', 'honokiol'], description: 'Anxiolytic herb.', labInteractions: [], commonUses: ['Anxiety', 'Sleep'] },
  { name: 'Passionflower', category: 'Herb', aliases: ['passionflower', 'passiflora'], description: 'Calming herb.', labInteractions: [], commonUses: ['Anxiety', 'Sleep'] },
  { name: 'Valerian Root', category: 'Herb', aliases: ['valerian'], description: 'Sleep-promoting herb.', labInteractions: [], commonUses: ['Sleep'] },
  { name: 'Chamomile', category: 'Herb', aliases: ['chamomile'], description: 'Calming herb.', labInteractions: [], commonUses: ['Sleep', 'Digestion'] },
  { name: 'Lemon Balm', category: 'Herb', aliases: ['lemon balm', 'melissa'], description: 'Calming herb.', labInteractions: [], commonUses: ['Anxiety', 'Sleep', 'Cold sores'] },
  { name: 'Phosphatidylserine', category: 'Other', aliases: ['phosphatidylserine', 'ps'], description: 'Phospholipid for cortisol reduction and brain.', labInteractions: [{ marker: 'Cortisol', effect: 'lowers', magnitude: 'mild', note: 'Lowers exercise-induced cortisol.' }], commonUses: ['Stress', 'Cognition'] },
  // Gut / Probiotics
  { name: 'Saccharomyces boulardii', category: 'Probiotic', aliases: ['s boulardii', 'saccharomyces'], description: 'Beneficial yeast for diarrhea and gut.', labInteractions: [], commonUses: ['Diarrhea', 'Gut health'] },
  { name: 'Lactobacillus rhamnosus GG', category: 'Probiotic', aliases: ['lgg', 'rhamnosus'], description: 'Studied probiotic strain.', labInteractions: [], commonUses: ['Gut health', 'Immunity'] },
  { name: 'Bifidobacterium', category: 'Probiotic', aliases: ['bifido', 'bifidobacterium'], description: 'Colon-residing probiotic genus.', labInteractions: [], commonUses: ['Gut health', 'Constipation'] },
  { name: 'Soil-Based Probiotics', category: 'Probiotic', aliases: ['sbo', 'spore probiotic', 'megaspore'], description: 'Spore-forming probiotics.', labInteractions: [], commonUses: ['Gut health', 'IBS'] },
  { name: 'Prebiotic Fiber (PHGG / Inulin)', category: 'Probiotic', aliases: ['phgg', 'inulin', 'prebiotic'], description: 'Fermentable fibers feed gut bacteria.', labInteractions: [], commonUses: ['Gut health', 'Constipation'] },
  { name: 'Digestive Enzymes', category: 'Other', aliases: ['digestive enzymes', 'pancreatin'], description: 'Helps digest fats, proteins, carbs.', labInteractions: [], commonUses: ['Bloating', 'Indigestion'] },
  { name: 'Betaine HCl', category: 'Other', aliases: ['betaine hcl', 'hcl'], description: 'Stomach acid support.', labInteractions: [], commonUses: ['Low stomach acid', 'Bloating'] },
  // Specific conditions / women
  { name: 'Vitex (Chasteberry)', category: 'Herb', aliases: ['vitex', 'chasteberry', 'agnus castus'], description: 'Cycle support, prolactin modulation.', labInteractions: [{ marker: 'Prolactin', effect: 'lowers', magnitude: 'mild', note: 'Mild prolactin reduction.' }], commonUses: ['PMS', 'Cycle regulation', 'PCOS'] },
  { name: 'Spearmint Tea', category: 'Herb', aliases: ['spearmint'], description: 'Anti-androgen for PCOS.', labInteractions: [{ marker: 'Total testosterone', effect: 'lowers', magnitude: 'mild', note: 'Lowers free + total T in PCOS.' }], commonUses: ['PCOS', 'Hirsutism'] },
  { name: 'DIM (Diindolylmethane)', category: 'Other', aliases: ['dim'], description: 'Estrogen metabolism modulator.', labInteractions: [{ marker: 'Estrogen metabolites', effect: 'falsely_alters', magnitude: 'moderate', note: 'Shifts 2:16-OH ratio.' }], commonUses: ['Estrogen dominance', 'Acne'] },
  { name: 'Calcium D-Glucarate', category: 'Other', aliases: ['calcium d-glucarate', 'd-glucarate'], description: 'Liver detox / estrogen clearance.', labInteractions: [], commonUses: ['Estrogen detox'] },
  // Heart / circulation
  { name: 'Hawthorn', category: 'Herb', aliases: ['hawthorn'], description: 'Heart-supportive herb.', labInteractions: [], commonUses: ['Heart health', 'Mild hypertension'] },
  { name: 'Garlic Extract', category: 'Herb', aliases: ['garlic', 'allicin', 'aged garlic'], description: 'Cardiovascular support.', labInteractions: [{ marker: 'Blood pressure', effect: 'lowers', magnitude: 'mild', note: 'Aged garlic lowers BP modestly.' } as any], commonUses: ['Blood pressure', 'Cholesterol'] },
  { name: 'Nattokinase', category: 'Other', aliases: ['nattokinase'], description: 'Fibrinolytic enzyme.', labInteractions: [{ marker: 'INR', effect: 'raises', magnitude: 'mild', note: 'Mild blood thinner — caution with anticoagulants.' }], commonUses: ['Circulation', 'Clot risk'] },
  { name: 'Bergamot Extract', category: 'Other', aliases: ['bergamot', 'citrus bergamot'], description: 'Citrus polyphenol for cholesterol.', labInteractions: [{ marker: 'LDL', effect: 'lowers', magnitude: 'moderate', note: 'Bergamot can lower LDL 20-30%.' }], commonUses: ['Cholesterol'] },
  { name: 'Red Yeast Rice', category: 'Other', aliases: ['red yeast rice', 'monacolin k'], description: 'Natural statin — lowers LDL.', labInteractions: [{ marker: 'LDL', effect: 'lowers', magnitude: 'moderate', note: 'Natural statin; same depletions as pharmaceutical statins.' }, { marker: 'CoQ10', effect: 'lowers', magnitude: 'moderate', note: 'Take with CoQ10.' }], commonUses: ['Cholesterol'] },
  { name: 'Plant Sterols', category: 'Other', aliases: ['plant sterols', 'phytosterols'], description: 'Block cholesterol absorption.', labInteractions: [{ marker: 'LDL', effect: 'lowers', magnitude: 'mild', note: 'Modest LDL reduction.' }], commonUses: ['Cholesterol'] },
  // Hair / Skin / Performance
  { name: 'MSM', category: 'Other', aliases: ['msm', 'methylsulfonylmethane'], description: 'Sulfur for joints, skin, hair.', labInteractions: [], commonUses: ['Joints', 'Hair', 'Skin'] },
  { name: 'Hyaluronic Acid', category: 'Other', aliases: ['hyaluronic acid', 'ha'], description: 'Joint and skin hydration.', labInteractions: [], commonUses: ['Joints', 'Skin'] },
  { name: 'Glucosamine + Chondroitin', category: 'Other', aliases: ['glucosamine', 'chondroitin'], description: 'Joint support.', labInteractions: [], commonUses: ['Joint pain', 'Osteoarthritis'] },
  // Greens / Superfoods
  { name: 'Spirulina', category: 'Other', aliases: ['spirulina'], description: 'Algae nutrient powerhouse.', labInteractions: [], commonUses: ['Nutrient density', 'Detox'] },
  { name: 'Chlorella', category: 'Other', aliases: ['chlorella'], description: 'Algae for detox and chlorophyll.', labInteractions: [], commonUses: ['Detox', 'Heavy metals'] },
  { name: 'Greens Powder', category: 'Other', aliases: ['greens powder', 'ag1', 'athletic greens', 'superfood'], description: 'Multi-greens blend.', labInteractions: [{ marker: 'Vitamin K', effect: 'raises', magnitude: 'mild', note: 'Greens have vitamin K — caution with warfarin.' }], commonUses: ['Nutrient density'] },
  { name: 'Beetroot', category: 'Other', aliases: ['beetroot', 'beet powder'], description: 'Nitric oxide and circulation.', labInteractions: [], commonUses: ['Blood pressure', 'Endurance'] },
  // Energy / Stimulants
  { name: 'Caffeine', category: 'Other', aliases: ['caffeine'], description: 'CNS stimulant.', labInteractions: [], commonUses: ['Energy', 'Focus'] },
  { name: 'Yerba Mate', category: 'Herb', aliases: ['yerba mate'], description: 'South American caffeinated tea.', labInteractions: [], commonUses: ['Energy', 'Focus'] },
  { name: 'Green Tea Extract (EGCG)', category: 'Herb', aliases: ['green tea', 'egcg', 'matcha'], description: 'Polyphenol antioxidant.', labInteractions: [{ marker: 'ALT', effect: 'raises', magnitude: 'mild', note: 'High-dose EGCG can raise liver enzymes.' }], commonUses: ['Antioxidant', 'Metabolism'] },
  // Bone / Hormones
  { name: 'Pregnenolone', category: 'Hormone', aliases: ['pregnenolone'], description: 'Master hormone precursor.', labInteractions: [], commonUses: ['Hormone balance', 'Memory'] },
  { name: 'Progesterone (Topical)', category: 'Hormone', aliases: ['progesterone cream'], description: 'Bioidentical progesterone for hormone balance.', labInteractions: [{ marker: 'Progesterone', effect: 'raises', magnitude: 'moderate', note: 'Raises serum progesterone.' }], commonUses: ['PMS', 'Perimenopause'] },
  // Liver / Detox
  { name: 'Milk Thistle', category: 'Herb', aliases: ['milk thistle', 'silymarin'], description: 'Liver-protective antioxidant.', labInteractions: [{ marker: 'ALT', effect: 'lowers', magnitude: 'mild', note: 'Mild ALT reduction in NAFLD.' }], commonUses: ['Liver', 'Detox'] },
  { name: 'Dandelion Root', category: 'Herb', aliases: ['dandelion'], description: 'Liver and digestive support.', labInteractions: [], commonUses: ['Liver', 'Bloating'] },
  { name: 'Activated Charcoal', category: 'Other', aliases: ['activated charcoal'], description: 'Adsorbent for binding toxins.', labInteractions: [], commonUses: ['Digestive upset', 'Detox'] },
  // Other commonly-taken
  { name: 'CBD', category: 'Other', aliases: ['cbd', 'cannabidiol'], description: 'Cannabinoid for sleep, anxiety, pain.', labInteractions: [], commonUses: ['Sleep', 'Anxiety', 'Pain'] },
  { name: 'Multivitamin', category: 'Vitamin', aliases: ['multi', 'multivitamin', 'one a day'], description: 'Daily multinutrient.', labInteractions: [], commonUses: ['Insurance baseline'] },
  { name: 'Prenatal Vitamin', category: 'Vitamin', aliases: ['prenatal'], description: 'Pregnancy / preconception multivitamin.', labInteractions: [], commonUses: ['Pregnancy', 'Preconception'] },
  { name: 'Electrolytes', category: 'Mineral', aliases: ['electrolytes', 'lmnt', 'liquid iv'], description: 'Sodium/potassium/magnesium blend.', labInteractions: [], commonUses: ['Hydration', 'Cramps', 'Energy'] },
];

export function searchSupplements(query: string): SupplementEntry[] {
  if (!query || query.trim().length < 2) return SUPPLEMENTS.slice(0, 12);
  const q = query.toLowerCase().trim();
  const matches = SUPPLEMENTS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.aliases.some(a => a.toLowerCase().includes(q)) ||
    s.commonUses.some(u => u.toLowerCase().includes(q))
  );
  return matches.slice(0, 20);
}

export function findSupplement(nameOrAlias: string): SupplementEntry | null {
  const q = nameOrAlias.toLowerCase().trim();
  return SUPPLEMENTS.find(s =>
    s.name.toLowerCase() === q || s.aliases.some(a => a.toLowerCase() === q)
  ) ?? SUPPLEMENTS.find(s =>
    s.name.toLowerCase().includes(q) || s.aliases.some(a => a.toLowerCase().includes(q))
  ) ?? null;
}

/**
 * Get all lab interactions for a list of user supplements.
 * Used by AI prompts to know what supplements might be affecting lab values.
 */
export function getLabInteractionsForSupplements(supplementNames: string[]): {
  supplement: string;
  interactions: LabInteraction[];
}[] {
  return supplementNames
    .map(name => {
      const entry = findSupplement(name);
      return entry ? { supplement: entry.name, interactions: entry.labInteractions } : null;
    })
    .filter((x): x is { supplement: string; interactions: LabInteraction[] } => x !== null && x.interactions.length > 0);
}

export const SUPPLEMENT_CATEGORIES: SupplementCategory[] = [
  'Vitamin', 'Mineral', 'Amino Acid', 'Herb', 'Adaptogen',
  'Anti-inflammatory', 'Hormone', 'Performance', 'Probiotic', 'Metabolic', 'Other',
];
