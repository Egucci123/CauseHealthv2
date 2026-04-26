// src/data/biomarkerGlossary.ts
// Plain-English definitions of every biomarker the app tracks.
// Each entry explains what the marker measures, why it matters, what high/low
// usually means, and the optimal vs. standard range distinction.

export interface BiomarkerGlossaryEntry {
  name: string;                // Canonical display name
  aliases: string[];           // Other names this marker is called
  category: string;            // For filtering
  whatItIs: string;            // Plain-English definition
  whyItMatters: string;        // Why a patient should care
  highMeans: string;           // What "above optimal" usually means
  lowMeans: string;            // What "below optimal" usually means
  optimalNote?: string;        // Why functional medicine optimal differs from standard
}

export const BIOMARKER_GLOSSARY: BiomarkerGlossaryEntry[] = [
  // ── METABOLIC ──────────────────────────────────────────────────────────────
  {
    name: 'Glucose (Fasting)', aliases: ['glucose', 'fasting glucose', 'glucose serum'], category: 'Metabolic',
    whatItIs: 'Sugar level in your blood after fasting overnight. Your body\'s primary fuel source.',
    whyItMatters: 'High fasting glucose is the earliest sign of insulin resistance and prediabetes. Optimal levels protect every organ system.',
    highMeans: 'Your body is having trouble managing blood sugar — early sign of insulin resistance. Above 100 = prediabetes; above 125 = diabetes.',
    lowMeans: 'Hypoglycemia. Can be from skipped meals, certain medications, or rare conditions like adrenal insufficiency.',
    optimalNote: 'Standard says <100 is "normal" but functional medicine targets 75-86 — research shows risk increases above 90.',
  },
  {
    name: 'Hemoglobin A1c', aliases: ['a1c', 'hba1c', 'hemoglobin a1c'], category: 'Metabolic',
    whatItIs: 'Average blood sugar over the past 3 months. A 90-day blood sugar report card.',
    whyItMatters: 'Catches blood sugar problems even when fasting glucose looks normal. Best long-term marker for insulin resistance and diabetes risk.',
    highMeans: 'Above 5.7 = prediabetes territory. Above 6.5 = diabetes. Even small elevations correlate with cardiovascular risk.',
    lowMeans: 'Usually means anemia or recent blood loss (since the test relies on red blood cell turnover) rather than low blood sugar.',
    optimalNote: 'Standard says <5.7 is "normal." Functional medicine targets 4.6-5.3 to maximize longevity.',
  },
  {
    name: 'Insulin (Fasting)', aliases: ['insulin', 'fasting insulin'], category: 'Metabolic',
    whatItIs: 'Hormone that lets cells absorb glucose from the bloodstream. Made by your pancreas.',
    whyItMatters: 'Fasting insulin rises YEARS before glucose does. The earliest warning of metabolic dysfunction.',
    highMeans: 'Insulin resistance — your cells aren\'t responding well, so your pancreas pumps out more. Drives weight gain, fatigue, brain fog.',
    lowMeans: 'Type 1 diabetes (autoimmune destruction of insulin-producing cells) or pancreatic dysfunction.',
    optimalNote: 'Most labs flag only >25. Functional medicine wants <8 — even <5 ideally for metabolic health.',
  },

  // ── LIPIDS ──────────────────────────────────────────────────────────────
  {
    name: 'Total Cholesterol', aliases: ['cholesterol', 'cholesterol total', 'total cholesterol'], category: 'Cardiovascular',
    whatItIs: 'Sum of all cholesterol types in your blood. Cholesterol itself is a building block for hormones and cell membranes.',
    whyItMatters: 'Elevated total cholesterol contributes to cardiovascular disease — but the SUBTYPES matter much more than the total.',
    highMeans: 'Could mean too much LDL, too much HDL, or both. The breakdown is what matters for risk.',
    lowMeans: 'Very low cholesterol (<140) can affect hormone production and cognitive function.',
    optimalNote: 'Total alone is incomplete — always look at HDL, LDL, triglycerides, and ApoB together.',
  },
  {
    name: 'LDL Cholesterol', aliases: ['ldl', 'ldl cholesterol'], category: 'Cardiovascular',
    whatItIs: 'Low-density lipoprotein. Carries cholesterol from the liver to tissues. Often called "bad cholesterol" but the real story is more nuanced.',
    whyItMatters: 'Elevated LDL — especially small dense particles — is a strong driver of atherosclerosis. ApoB is a more accurate measure.',
    highMeans: 'Increased cardiovascular risk, especially when combined with low HDL or high triglycerides. Pattern matters more than number alone.',
    lowMeans: 'Generally fine but very low LDL (<50) can affect hormone synthesis and cognition.',
    optimalNote: 'Standard: <100. Functional medicine prefers measuring particle number (LDL-P) and ApoB for true risk.',
  },
  {
    name: 'HDL Cholesterol', aliases: ['hdl', 'hdl cholesterol'], category: 'Cardiovascular',
    whatItIs: 'High-density lipoprotein. Removes cholesterol from arteries and returns it to the liver. The "cleanup crew."',
    whyItMatters: 'Higher HDL is protective. Low HDL is a strong predictor of insulin resistance and metabolic syndrome.',
    highMeans: 'Generally protective. Very high (>100) in some genetic conditions doesn\'t add additional benefit.',
    lowMeans: 'Increased cardiovascular and metabolic risk. Often paired with high triglycerides — classic insulin resistance pattern.',
    optimalNote: 'Optimal: >55 for women, >40 for men. Below those = metabolic dysfunction warning.',
  },
  {
    name: 'Triglycerides', aliases: ['triglycerides', 'tg'], category: 'Cardiovascular',
    whatItIs: 'Fat in your blood. Excess calories — especially from carbs — get stored as triglycerides.',
    whyItMatters: 'Elevated triglycerides + low HDL is the strongest insulin resistance pattern. Drives fatty liver disease.',
    highMeans: 'Insulin resistance, excess refined carbs, alcohol, or genetic dyslipidemia. Above 150 is concerning.',
    lowMeans: 'Generally fine. Very low triglycerides can occur with malnutrition or hyperthyroidism.',
    optimalNote: 'Standard: <150. Functional medicine targets <100 — and a Triglyceride/HDL ratio under 2 is gold standard.',
  },
  {
    name: 'ApoB (Apolipoprotein B)', aliases: ['apob', 'apolipoprotein b'], category: 'Cardiovascular',
    whatItIs: 'A protein attached to all atherogenic (artery-clogging) particles. Counts the actual particles, not just the cholesterol they carry.',
    whyItMatters: 'Better cardiovascular risk predictor than LDL. Each ApoB-containing particle can deposit in artery walls.',
    highMeans: 'Higher number of atherogenic particles. Risk increases linearly above 80 mg/dL.',
    lowMeans: 'Lower cardiovascular risk. Very low can occur with statin therapy or rare genetic conditions.',
    optimalNote: 'Optimal: <80 mg/dL. The new gold-standard cardiovascular risk marker, replacing LDL in many guidelines.',
  },
  {
    name: 'Lp(a) Lipoprotein(a)', aliases: ['lp(a)', 'lipoprotein a', 'lipoprotein(a)'], category: 'Cardiovascular',
    whatItIs: 'A genetic variant of LDL with an extra protein attached. Sticky and inflammatory.',
    whyItMatters: 'Independent genetic risk factor for heart disease. Test once in your lifetime — it doesn\'t change much.',
    highMeans: 'Elevated genetic cardiovascular risk regardless of other lipids. Can\'t be lowered easily but can be offset by aggressive risk reduction elsewhere.',
    lowMeans: 'Lower genetic cardiovascular risk.',
    optimalNote: 'Standard: <30 mg/dL or <75 nmol/L. About 20-25% of people have elevated Lp(a) and don\'t know it.',
  },

  // ── LIVER ──────────────────────────────────────────────────────────────
  {
    name: 'ALT (SGPT)', aliases: ['alt', 'sgpt', 'alanine aminotransferase'], category: 'Liver',
    whatItIs: 'An enzyme found mostly in liver cells. Released into the blood when liver cells are damaged or stressed.',
    whyItMatters: 'The most sensitive marker of liver inflammation. Rises with fatty liver disease, hepatitis, or medication injury.',
    highMeans: 'Liver cells are stressed or damaged. Causes: fatty liver, alcohol, hepatitis, medications (statins, acetaminophen).',
    lowMeans: 'Generally not concerning. Can occur with B6 deficiency.',
    optimalNote: 'Standard: <40-44 U/L. Functional medicine targets <20 — fatty liver disease starts well before "abnormal" range.',
  },
  {
    name: 'AST (SGOT)', aliases: ['ast', 'sgot', 'aspartate aminotransferase'], category: 'Liver',
    whatItIs: 'An enzyme in liver, heart, and muscle cells. Like ALT but less liver-specific.',
    whyItMatters: 'Combined with ALT, helps differentiate types of liver injury. AST/ALT ratio gives clinical clues.',
    highMeans: 'Liver, muscle, or heart stress. AST/ALT ratio >2 suggests alcoholic liver disease; <1 suggests fatty liver or hepatitis.',
    lowMeans: 'Generally not concerning.',
    optimalNote: 'Optimal: <22 U/L. Always interpret alongside ALT.',
  },
  {
    name: 'Bilirubin (Total)', aliases: ['bilirubin', 'bilirubin total', 'total bilirubin'], category: 'Liver',
    whatItIs: 'A yellow pigment produced when red blood cells are broken down. The liver clears it.',
    whyItMatters: 'High bilirubin can indicate liver disease, bile duct obstruction, or hemolysis (red blood cells breaking down too fast).',
    highMeans: 'Liver dysfunction, bile duct obstruction, hemolysis, or benign Gilbert syndrome (affects ~5% of population).',
    lowMeans: 'Generally not concerning.',
    optimalNote: 'Standard: <1.2 mg/dL. Mildly elevated bilirubin (1.0-1.5) with normal liver enzymes often = Gilbert syndrome (harmless but explains fatigue).',
  },
  {
    name: 'Alkaline Phosphatase', aliases: ['alkaline phosphatase', 'alp', 'alk phos'], category: 'Liver',
    whatItIs: 'Enzyme found in liver, bone, and intestines. Different forms come from different tissues.',
    whyItMatters: 'High ALP can indicate liver/bile duct disease OR bone activity (growth, fractures, bone disease).',
    highMeans: 'Bile duct obstruction, bone disorders (Paget\'s, vitamin D deficiency), or normal during growth/pregnancy.',
    lowMeans: 'Zinc or magnesium deficiency, malnutrition, or rare conditions.',
  },

  // ── KIDNEY ──────────────────────────────────────────────────────────────
  {
    name: 'Creatinine', aliases: ['creatinine', 'creatinine serum'], category: 'Kidney',
    whatItIs: 'Waste product from muscle metabolism. Filtered by the kidneys.',
    whyItMatters: 'Direct measure of kidney function. Also affected by muscle mass — low can mean low muscle.',
    highMeans: 'Reduced kidney function, dehydration, or high protein/creatine intake. Combine with eGFR for accuracy.',
    lowMeans: 'Low muscle mass — common in young women or anyone with sarcopenia. Not dangerous but worth investigating diet/exercise.',
  },
  {
    name: 'eGFR', aliases: ['egfr', 'estimated gfr', 'glomerular filtration rate'], category: 'Kidney',
    whatItIs: 'Estimated rate at which your kidneys filter blood. Calculated from creatinine, age, and sex.',
    whyItMatters: 'The single best measure of overall kidney function. Tracks kidney health over time.',
    highMeans: 'Excellent kidney function. Very high (>120) can occur with low muscle mass — may not reflect actual kidney function accurately.',
    lowMeans: 'Reduced kidney function. <60 = chronic kidney disease territory. Needs investigation.',
  },
  {
    name: 'BUN', aliases: ['bun', 'blood urea nitrogen', 'urea nitrogen'], category: 'Kidney',
    whatItIs: 'Nitrogen waste from protein breakdown. Filtered by kidneys but also affected by hydration and protein intake.',
    whyItMatters: 'Helps distinguish kidney problems from dehydration or low protein intake.',
    highMeans: 'Dehydration, high protein diet, GI bleeding, or kidney dysfunction.',
    lowMeans: 'Low protein intake, malnutrition, liver disease, or overhydration.',
  },

  // ── CBC ──────────────────────────────────────────────────────────────
  {
    name: 'WBC', aliases: ['wbc', 'white blood cell', 'leukocytes'], category: 'CBC',
    whatItIs: 'Total white blood cell count. Your immune system\'s soldiers.',
    whyItMatters: 'Elevated WBC suggests infection or inflammation. Low suggests immune dysfunction or bone marrow issues.',
    highMeans: 'Active infection, inflammation, stress, or rarely, leukemia. Look at the differential for clues.',
    lowMeans: 'Viral infection, autoimmune disease, medications, B12/folate deficiency, or bone marrow problems.',
  },
  {
    name: 'Hemoglobin', aliases: ['hemoglobin', 'hgb', 'hb'], category: 'CBC',
    whatItIs: 'Iron-containing protein in red blood cells that carries oxygen.',
    whyItMatters: 'Low hemoglobin = anemia, causes fatigue, brain fog, exercise intolerance. High can indicate dehydration or polycythemia.',
    highMeans: 'Dehydration, smoking, high altitude, sleep apnea, or polycythemia (myeloproliferative disorder).',
    lowMeans: 'Anemia from iron, B12, or folate deficiency, blood loss, or chronic disease.',
    optimalNote: 'Female optimal: 12.5-14.5 g/dL. Male optimal: 14.0-16.0 g/dL.',
  },
  {
    name: 'Hematocrit', aliases: ['hematocrit', 'hct'], category: 'CBC',
    whatItIs: 'Percentage of your blood that\'s red blood cells.',
    whyItMatters: 'Like hemoglobin — low means anemia, high means dehydration or polycythemia.',
    highMeans: 'Dehydration, polycythemia, high altitude, lung disease, sleep apnea.',
    lowMeans: 'Anemia.',
  },
  {
    name: 'Platelets', aliases: ['platelets', 'plt'], category: 'CBC',
    whatItIs: 'Cell fragments that help blood clot. Made in the bone marrow.',
    whyItMatters: 'Elevated platelets can signal inflammation, iron deficiency, or — rarely but importantly — myeloproliferative disorders.',
    highMeans: 'Iron deficiency, inflammation, infection, post-surgery, or essential thrombocythemia (myeloproliferative disorder, MPN).',
    lowMeans: 'Bleeding risk. Causes: viral illness, autoimmune (ITP), bone marrow disorders, alcohol, certain medications.',
    optimalNote: 'Optimal: 175-300 K/uL. >450 warrants JAK2 V617F testing to rule out essential thrombocythemia.',
  },
  {
    name: 'MCV', aliases: ['mcv', 'mean corpuscular volume', 'mean cell volume'], category: 'CBC',
    whatItIs: 'Average size of your red blood cells.',
    whyItMatters: 'Tells you the type of anemia even before hemoglobin drops. High MCV = B12/folate. Low MCV = iron.',
    highMeans: 'B12 or folate deficiency, alcohol, liver disease, hypothyroidism, or medications. Often precedes obvious anemia.',
    lowMeans: 'Iron deficiency, thalassemia trait, or chronic disease.',
  },
  {
    name: 'RDW', aliases: ['rdw', 'red cell distribution width'], category: 'CBC',
    whatItIs: 'Measure of how varied your red blood cells are in size.',
    whyItMatters: 'Elevated RDW is one of the earliest signs of nutrient deficiency or anemia — often before any other marker.',
    highMeans: 'Mixed anemia (iron + B12), inflammation, or aging-related changes. >13 warrants iron + B12/folate panel.',
    lowMeans: 'Generally not concerning.',
    optimalNote: 'Standard: <14.5%. Functional medicine targets <13%.',
  },

  // ── THYROID ──────────────────────────────────────────────────────────────
  {
    name: 'TSH', aliases: ['tsh', 'thyroid stimulating hormone'], category: 'Thyroid',
    whatItIs: 'Hormone from the pituitary gland that tells the thyroid how hard to work. Higher TSH = thyroid working harder than it should.',
    whyItMatters: 'The screening marker for thyroid disease. But "normal" TSH doesn\'t rule out thyroid problems.',
    highMeans: 'Subclinical or overt hypothyroidism. The thyroid is struggling. >2.5 in functional medicine = problem brewing.',
    lowMeans: 'Hyperthyroidism (too much thyroid hormone) or pituitary dysfunction. <1.0 may also signal autoimmune thyroid disease.',
    optimalNote: 'Standard: 0.4-4.5. Functional medicine targets 0.5-2.0. Above 2.5 in young adults often means subclinical hypothyroidism.',
  },
  {
    name: 'Free T3', aliases: ['free t3', 'ft3', 'triiodothyronine free'], category: 'Thyroid',
    whatItIs: 'The active thyroid hormone — the one your cells actually use.',
    whyItMatters: 'TSH alone misses many thyroid problems. Free T3 reveals if your body is converting T4 to active T3 properly.',
    highMeans: 'Hyperthyroidism or excess T3 supplementation.',
    lowMeans: 'Poor T4→T3 conversion (often from stress, low selenium, or gut dysbiosis) — even with normal TSH.',
    optimalNote: 'Optimal: 3.0-4.0 pg/mL. Most patients with hypothyroid symptoms but "normal" TSH have low Free T3.',
  },
  {
    name: 'Free T4', aliases: ['free t4', 'ft4', 't4 free'], category: 'Thyroid',
    whatItIs: 'The storage form of thyroid hormone, made by the thyroid gland.',
    whyItMatters: 'Combined with TSH, distinguishes primary thyroid disease from pituitary issues.',
    highMeans: 'Hyperthyroidism or excess thyroid medication.',
    lowMeans: 'Hypothyroidism — often with elevated TSH (primary) or with low TSH (pituitary dysfunction).',
  },
  {
    name: 'TPO Antibodies', aliases: ['tpo', 'thyroid peroxidase', 'tpo antibodies', 'anti-tpo'], category: 'Thyroid',
    whatItIs: 'Antibodies against your own thyroid gland. The fingerprint of Hashimoto\'s disease.',
    whyItMatters: 'Catches autoimmune thyroid disease BEFORE TSH changes. Many people have positive TPO for years before clinical hypothyroidism.',
    highMeans: 'Hashimoto\'s thyroiditis. Even with normal TSH, you\'re on the path to hypothyroidism.',
    lowMeans: 'No autoimmune thyroid disease detected.',
  },

  // ── INFLAMMATION ──────────────────────────────────────────────────────────────
  {
    name: 'hs-CRP', aliases: ['hs-crp', 'crp', 'c-reactive protein', 'high-sensitivity crp'], category: 'Inflammation',
    whatItIs: 'A protein made by the liver that rises with inflammation anywhere in the body.',
    whyItMatters: 'Strongest single marker of systemic inflammation. Predicts cardiovascular events independent of cholesterol.',
    highMeans: 'Active inflammation: infection, autoimmune disease, obesity-related inflammation, or cardiovascular risk.',
    lowMeans: 'Low inflammation — generally protective.',
    optimalNote: 'Optimal: <0.5 mg/L. >1.0 = elevated cardiovascular risk; >3.0 = high risk.',
  },
  {
    name: 'Homocysteine', aliases: ['homocysteine'], category: 'Inflammation',
    whatItIs: 'An amino acid byproduct that\'s normally cleared by B vitamins (B12, folate, B6).',
    whyItMatters: 'Elevated homocysteine increases cardiovascular and dementia risk. Often signals B vitamin deficiency or MTHFR gene variant.',
    highMeans: 'B12, folate, or B6 deficiency. Or MTHFR gene variant. Increases cardiovascular and stroke risk.',
    lowMeans: 'Generally protective. Can be low in pregnancy.',
    optimalNote: 'Optimal: 5-8 μmol/L. Above 10 needs B-vitamin support. Above 13 is significant cardiovascular risk.',
  },

  // ── NUTRIENTS ──────────────────────────────────────────────────────────────
  {
    name: 'Vitamin D (25-OH)', aliases: ['vitamin d', '25-hydroxy', '25-oh-d', 'vitamin d 25-hydroxy'], category: 'Nutrients',
    whatItIs: 'The storage form of vitamin D. Made by your skin from sunlight or from food/supplements.',
    whyItMatters: 'Affects bone, immune function, mood, hormone synthesis, and cardiovascular health. Widespread deficiency.',
    highMeans: 'Excessive supplementation. Toxicity is rare but possible above 100 ng/mL.',
    lowMeans: 'Deficiency. Causes fatigue, bone loss, immune dysfunction, depression. Common in winter and indoor lifestyles.',
    optimalNote: 'Standard: >30 ng/mL. Functional medicine targets 50-80 ng/mL for full benefit.',
  },
  {
    name: 'Vitamin B12', aliases: ['vitamin b12', 'b12', 'cobalamin'], category: 'Nutrients',
    whatItIs: 'Essential vitamin for nerve function, red blood cell formation, and DNA synthesis. Only found in animal foods.',
    whyItMatters: 'Deficiency causes fatigue, numbness, brain fog, megaloblastic anemia. Common in vegetarians, PPI users, and metformin users.',
    highMeans: 'Excessive supplementation, liver disease, or rarely myeloproliferative disorders.',
    lowMeans: 'Deficiency. Causes neurological damage if untreated. Test if levels <500 even though "standard low" is 200.',
    optimalNote: 'Standard: >200 pg/mL. Functional medicine targets 500-1000 — neurological symptoms appear well before "abnormal."',
  },
  {
    name: 'Folate', aliases: ['folate', 'folic acid', 'b9'], category: 'Nutrients',
    whatItIs: 'B vitamin essential for DNA synthesis, red blood cell formation, and homocysteine metabolism.',
    whyItMatters: 'Deficiency causes anemia, hair loss, depression. Critical in pregnancy.',
    highMeans: 'Excessive supplementation (common with synthetic folic acid). Can mask B12 deficiency.',
    lowMeans: 'Diet low in leafy greens, alcoholism, methotrexate use, or MTHFR gene variants.',
    optimalNote: 'Use methylfolate (5-MTHF), not synthetic folic acid — especially with MTHFR variants.',
  },
  {
    name: 'Ferritin', aliases: ['ferritin'], category: 'Nutrients',
    whatItIs: 'Iron storage protein. The most sensitive marker of iron status.',
    whyItMatters: 'Low ferritin causes fatigue, hair loss, brain fog, and exercise intolerance LONG before anemia shows.',
    highMeans: 'Iron overload (hemochromatosis), inflammation, or liver disease. Always interpret with iron saturation.',
    lowMeans: 'Iron deficiency. Treat even if hemoglobin is normal — symptoms appear at ferritin <30-50.',
    optimalNote: 'Functional iron deficiency: ferritin <30 even with normal hemoglobin. Female optimal 30-150; male 50-150.',
  },
  {
    name: 'Magnesium', aliases: ['magnesium'], category: 'Nutrients',
    whatItIs: 'Mineral involved in 300+ enzyme reactions. Critical for sleep, mood, blood pressure, and muscle function.',
    whyItMatters: 'Widely deficient (60% of Americans). Symptoms: cramps, anxiety, insomnia, headaches, palpitations.',
    highMeans: 'Kidney dysfunction or excessive supplementation.',
    lowMeans: 'Deficiency. Common with PPI use, diuretics, alcohol, and high stress.',
    optimalNote: 'Serum magnesium misses cellular deficiency. RBC magnesium is more accurate. Optimal serum: 2.0-2.5 mg/dL.',
  },

  // ── HORMONES ──────────────────────────────────────────────────────────────
  {
    name: 'Testosterone', aliases: ['testosterone', 'testosterone total', 'testosterone serum'], category: 'Hormones',
    whatItIs: 'Primary sex hormone. Both men and women have it — men in much higher amounts.',
    whyItMatters: 'Affects energy, libido, muscle mass, mood, and metabolism in both sexes.',
    highMeans: 'In females: PCOS, adrenal disorders. In males: rarely concerning unless from supplementation.',
    lowMeans: 'Hypogonadism (primary or secondary), aging, chronic stress, opioid use, or pituitary dysfunction.',
    optimalNote: 'Female optimal: 15-70 ng/dL. Male optimal: 600-900 ng/dL. Free testosterone often more meaningful than total.',
  },
  {
    name: 'Estradiol', aliases: ['estradiol', 'e2'], category: 'Hormones',
    whatItIs: 'The most potent estrogen. Drives female reproductive function; men have lower amounts.',
    whyItMatters: 'Levels vary dramatically by menstrual cycle phase in women. A single value means little without cycle context.',
    highMeans: 'Ovulation phase or luteal phase (in women), pregnancy, or rarely tumors.',
    lowMeans: 'Menopause, low body fat, hypothalamic amenorrhea, or pituitary dysfunction.',
    optimalNote: 'Premenopausal women: varies 30-400+ pg/mL by cycle day. Single test cannot diagnose "estrogen dominance."',
  },
  {
    name: 'Cortisol (AM)', aliases: ['cortisol', 'cortisol am', 'cortisol morning'], category: 'Hormones',
    whatItIs: 'Stress hormone made by adrenal glands. Naturally peaks in morning, drops in evening.',
    whyItMatters: 'Elevated AM cortisol = chronic stress or HPA-axis dysregulation. Low = adrenal insufficiency.',
    highMeans: 'Chronic stress, sleep deprivation, or rarely Cushing syndrome (tumor).',
    lowMeans: 'Adrenal insufficiency (Addison\'s disease) or chronic burnout.',
    optimalNote: 'Optimal AM: 6-18 μg/dL. Sustained elevation drives weight gain, anxiety, insomnia, immune suppression.',
  },
  {
    name: 'Prolactin', aliases: ['prolactin'], category: 'Hormones',
    whatItIs: 'Pituitary hormone primarily for lactation. Also affects fertility and stress response.',
    whyItMatters: 'Elevated prolactin can suppress sex hormones, cause irregular periods, infertility, low libido.',
    highMeans: 'Stress, sleep disruption, certain medications, hypothyroidism, or pituitary tumor (prolactinoma).',
    lowMeans: 'Pituitary dysfunction or excessive dopamine medication.',
    optimalNote: 'Optimal: 2-25 ng/mL (women), 2-15 ng/mL (men). >2-3× upper normal warrants pituitary MRI.',
  },
  {
    name: 'DHEA-Sulfate', aliases: ['dhea', 'dhea-s', 'dhea-sulfate', 'dheas'], category: 'Hormones',
    whatItIs: 'Adrenal hormone that\'s a precursor to estrogen and testosterone. Declines with age.',
    whyItMatters: 'Marker of adrenal health, vitality, and aging. Low DHEA-S correlates with chronic stress and burnout.',
    highMeans: 'PCOS in women, congenital adrenal hyperplasia, or adrenal tumor.',
    lowMeans: 'Chronic stress, burnout, adrenal insufficiency, or natural aging.',
    optimalNote: 'Optimal: 200-500 μg/dL (men), 100-400 μg/dL (women). Declines naturally with age.',
  },
];

/**
 * Find glossary entry by marker name. Uses fuzzy matching on aliases.
 */
export function findGlossaryEntry(markerName: string): BiomarkerGlossaryEntry | null {
  const n = markerName.toLowerCase().trim();
  // Try exact match on aliases first
  for (const entry of BIOMARKER_GLOSSARY) {
    if (entry.aliases.includes(n) || entry.name.toLowerCase() === n) return entry;
  }
  // Fuzzy: any alias is a substring of the marker name (or vice versa)
  for (const entry of BIOMARKER_GLOSSARY) {
    for (const alias of entry.aliases) {
      if (alias.length >= 3 && (n.includes(alias) || alias.includes(n))) return entry;
    }
  }
  return null;
}
