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
