// supabase/functions/_shared/supplementRegistry.ts
//
// SINGLE SOURCE OF TRUTH for every supplement the app may recommend.
//
// Disease-mechanism supplements (UC → L-glutamine, Hashimoto's → selenium,
// PCOS → inositol, etc.) and medication-depletion empiricals (statin →
// CoQ10, metformin → B12, PPI → magnesium, steroid → calcium+D) ALL live
// here as keyed entries.
//
// Adding a supplement: pick canonical key (snake_case). Add to the right
// `referencedFromConditions` / `referencedFromMeds` set so the generic
// injector picks it up. Never write a one-off if-block in an edge function.
//
// The condition-registry's `pathwayHints.requiredSupplements` and the med-
// registry's `empiricalSupp` reference KEYS in this file. That coupling
// is what makes the architecture universal: add a condition with
// requiredSupplements: ['inositol'] and the engine fires inositol for
// that user automatically. No edge-function code change needed.

export interface SupplementDef {
  key: string;
  // The full plan_data.supplement_stack entry shape — exactly what the UI
  // renders. Stored here so injectors don't have to construct it inline.
  entry: {
    emoji: string;
    nutrient: string;
    form: string;
    dose: string;
    timing: string;
    why_short: string;        // 6-12 word reason
    why: string;              // 1 sentence
    practical_note: string;   // timing/interaction guidance
    category: 'sleep_stress' | 'gut_healing' | 'liver_metabolic' | 'inflammation_cardio' | 'nutrient_repletion' | 'condition_therapy';
    alternatives: Array<{ name: string; form: string; note: string }>;
    priority: 'critical' | 'high' | 'moderate';
    sourced_from: 'lab_finding' | 'medication_depletion' | 'disease_mechanism' | 'optimization';
    evidence_note: string;
  };
  // Aliases used to detect whether the user is already supplementing this.
  // If any pattern matches the user's current-supplement list (or the AI's
  // already-generated stack), DON'T re-recommend.
  alreadyTakingPatterns: RegExp[];
}

const REGISTRY: SupplementDef[] = [
  // ── Medication-depletion empiricals ───────────────────────────────────
  {
    key: 'coq10',
    alreadyTakingPatterns: [/\b(coq[\s-]?10|ubiquinol|ubiquinone|coenzyme\s*q)\b/i],
    entry: { emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel', dose: '100-200mg', timing: 'With breakfast (take with fat)', why_short: 'Statins block your body from making CoQ10', why: 'Statins inhibit the same pathway your body uses to make CoQ10 — the energy molecule muscle and heart cells depend on. Replacing it cuts statin-related fatigue and muscle aches.', practical_note: 'Take with the fattiest meal of the day — CoQ10 is fat-soluble and absorption drops 50%+ on an empty stomach. Ubiquinol is the absorbable form.', category: 'liver_metabolic', alternatives: [{ name: 'CoQ10 (Ubiquinone)', form: 'Capsule', note: 'Cheaper but ~50% less bioavailable; needs higher dose (200-400mg)' }, { name: 'PQQ + CoQ10 combo', form: 'Capsule', note: 'PQQ supports mitochondrial production; pricier' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple RCTs support 100-200mg ubiquinol daily for statin users.' },
  },
  {
    key: 'b12_methyl',
    alreadyTakingPatterns: [/\b(b[\s-]?12|cobalamin|methylcobalamin|adenosylcobalamin)\b/i],
    entry: { emoji: '💊', nutrient: 'Vitamin B12 (Methylcobalamin)', form: 'Sublingual', dose: '500-1000mcg', timing: 'Morning, away from food', why_short: 'Metformin / PPI blocks B12 absorption over time', why: 'Long-term metformin or PPI use reduces B12 absorption in the gut. Subclinical B12 deficiency causes fatigue, brain fog, and nerve symptoms before serum levels drop.', practical_note: 'Sublingual absorbs through cheek tissue — bypasses gut blockade. Morning, away from food and coffee.', category: 'nutrient_repletion', alternatives: [{ name: 'Adenosylcobalamin', form: 'Sublingual', note: 'Active mitochondrial form; some prefer for energy' }, { name: 'B12 Liquid drops', form: 'Liquid', note: 'Easier to titrate dose; same absorption' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Studies show 10-30% of long-term metformin users develop B12 deficiency.' },
  },
  {
    key: 'magnesium_glycinate',
    alreadyTakingPatterns: [/magnesium\s*(glycinate|threonate|citrate|malate)/i, /\bmag glycinate\b/i],
    entry: { emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule', dose: '300-400mg elemental', timing: 'Evening', why_short: 'Drug class wastes magnesium; restore stores', why: 'PPIs, diuretics, and steroids all increase urinary magnesium loss. Glycinate is the gentle form — supports sleep, blood pressure, insulin sensitivity.', practical_note: 'Bedtime — activates GABA pathways for calming sleep. Take 2hrs apart from antibiotics, 4hrs from levothyroxine. Glycinate avoids the laxative effect.', category: 'sleep_stress', alternatives: [{ name: 'Magnesium Threonate', form: 'Capsule', note: 'Crosses blood-brain barrier; better for cognition + sleep' }, { name: 'Magnesium Citrate', form: 'Powder', note: 'Cheaper; has mild laxative effect' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'FDA black-box warning on PPI-induced hypomagnesemia.' },
  },
  {
    key: 'milk_thistle',
    alreadyTakingPatterns: [/\bmilk\s*thistle|silymarin|silybin\b/i],
    entry: { emoji: '🌿', nutrient: 'Milk Thistle (Silymarin)', form: 'Capsule (standardized 80% silymarin)', dose: '200-400mg daily', timing: 'With breakfast (with food for absorption)', why_short: 'Liver protection on hepatotoxic meds', why: 'Hepatotoxic medications (statins, methotrexate, isoniazid, valproate) stress the liver over time. Silymarin protects hepatocytes with 30+ years of safety evidence.', practical_note: 'With breakfast or any meal containing fat. Standardized to 80% silymarin is the studied form. Safe long-term — no significant drug interactions even alongside multiple liver-processed meds.', category: 'liver_metabolic', alternatives: [{ name: 'NAC (N-Acetyl-Cysteine)', form: 'Capsule', note: 'Glutathione precursor; complementary; can stack with milk thistle' }, { name: 'TUDCA', form: 'Capsule', note: 'Bile-acid liver protective; targets bile-flow issues; pricier' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple meta-analyses support silymarin for drug-induced and chronic liver injury.' },
  },
  {
    key: 'calcium_with_d',
    alreadyTakingPatterns: [/\bcalcium\b.*\bd[3]?\b|calcium\s+with\s+d|cal[-+]?d/i],
    entry: { emoji: '💊', nutrient: 'Calcium + Vitamin D3', form: 'Tablet', dose: '500mg Ca + 2000 IU D3', timing: 'With dinner', why_short: 'Steroids leach bone minerals', why: 'Oral corticosteroids reduce calcium absorption and accelerate bone loss. Calcium + D3 maintains bone density during treatment.', practical_note: 'With dinner so the fat helps D3 absorb. CRITICAL: take 4hrs apart from any thyroid med (levothyroxine) and iron supplement — calcium blocks both.', category: 'nutrient_repletion', alternatives: [{ name: 'Calcium Citrate alone', form: 'Tablet', note: 'Better absorbed if you have low stomach acid' }, { name: 'D3 + K2 combo', form: 'Softgel', note: 'Routes calcium to bone, away from arteries' }], priority: 'critical', sourced_from: 'medication_depletion', evidence_note: 'ACR guidelines recommend Ca+D for any patient on >5mg prednisone for >3 months.' },
  },
  {
    key: 'rbc_magnesium_glycinate_long_term',
    alreadyTakingPatterns: [/magnesium\s*(glycinate|threonate)/i],
    entry: { emoji: '💊', nutrient: 'Magnesium Glycinate (long-term PPI)', form: 'Capsule', dose: '300-400mg elemental', timing: 'Evening', why_short: 'PPIs deplete magnesium chronically', why: 'Long-term PPI use is a documented cause of hypomagnesemia. Glycinate form is gentle on gut.', practical_note: 'Bedtime; 2hrs apart from antibiotics; 4hrs from levothyroxine.', category: 'sleep_stress', alternatives: [{ name: 'Magnesium Threonate', form: 'Capsule', note: 'Better for cognition' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'FDA black-box warning on PPI-induced hypomagnesemia.' },
  },
  {
    key: 'vit_d_3',
    alreadyTakingPatterns: [/vitamin\s*d3?\b|cholecalciferol|\bd3\b/i],
    entry: { emoji: '☀️', nutrient: 'Vitamin D3', form: 'Softgel', dose: '2000-5000 IU', timing: 'With breakfast (fat-soluble)', why_short: 'Steroid use depletes D; restore stores', why: 'Long-term steroid use lowers vitamin D and calcium absorption. D3 plus K2 directs calcium to bones not arteries.', practical_note: 'With the fattiest meal of the day. Target a blood level of 50-70 ng/mL.', category: 'nutrient_repletion', alternatives: [{ name: 'D3 + K2 combo softgel', form: 'Softgel', note: 'Saves a slot on the stack' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Endocrine Society recommends 1500-2000 IU/day baseline.' },
  },

  // ── Disease-mechanism supplements ─────────────────────────────────────
  {
    key: 'l_glutamine',
    alreadyTakingPatterns: [/\bl[\s-]?glutamine\b/i],
    entry: { emoji: '🛡️', nutrient: 'L-Glutamine', form: 'Powder (mix in water)', dose: '5g daily', timing: 'Morning, empty stomach', why_short: 'Gut barrier repair for IBD', why: 'L-glutamine is the primary fuel for intestinal cells; well-evidenced for IBD mucosal healing.', practical_note: 'Morning on empty stomach with water. Tasteless powder, easy to dose. Safe long-term; no interactions with mesalamine or biologics.', category: 'gut_healing', alternatives: [{ name: 'L-Glutamine capsules', form: 'Capsule', note: 'Convenient travel option; pricier per gram' }, { name: 'GI Restore powder', form: 'Powder blend', note: 'Combo product; saves stack count if budget allows' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple clinical trials show benefit in UC mucosal healing.' },
  },
  {
    key: 's_boulardii',
    alreadyTakingPatterns: [/\bs\.?\s*boulardii|saccharomyces|probiotic|visbiome|vsl/i],
    entry: { emoji: '🦠', nutrient: 'Saccharomyces boulardii', form: 'Capsule', dose: '500mg (5 billion CFU) twice daily', timing: 'With breakfast and dinner', why_short: 'Strain-specific IBD remission support', why: 'S. boulardii is the most-studied probiotic for IBD remission maintenance; reduces flare frequency.', practical_note: 'With meals to survive stomach acid. Safe with biologics (yeast-based, not bacteria, so no immunosuppression concern). 2hrs apart from antibiotics.', category: 'gut_healing', alternatives: [{ name: 'Visbiome (multi-strain)', form: 'Capsule, refrigerated', note: 'Most-studied multi-strain UC probiotic; pricier' }, { name: 'VSL#3', form: 'Sachets', note: 'Higher CFU count; used in clinical UC trials' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs in UC and Crohn\'s remission maintenance.' },
  },
  {
    key: 'butyrate',
    alreadyTakingPatterns: [/\bbutyrate|tributyrin\b/i],
    entry: { emoji: '⚡', nutrient: 'Butyrate (Tributyrin SR)', form: 'Capsule (sustained-release)', dose: '500-1000mg twice daily', timing: 'With breakfast and dinner', why_short: 'Colonocyte fuel + barrier repair', why: 'Butyrate is the primary energy source for colon cells; sustained-release delivers to lower GI where IBD inflammation sits.', practical_note: 'With meals — fat aids absorption. Tributyrin SR > sodium butyrate (less odor, better delivery). Safe with all UC meds.', category: 'gut_healing', alternatives: [{ name: 'Sodium Butyrate', form: 'Capsule', note: 'Cheaper but smelly' }, { name: 'Calcium-Magnesium Butyrate', form: 'Capsule', note: 'Buffered, gentler on stomach' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Direct mucosal energy substrate; supported in UC remission protocols.' },
  },
  {
    key: 'selenium',
    alreadyTakingPatterns: [/\bselenium\b/i, /selenomethionine/i],
    entry: { emoji: '🦋', nutrient: 'Selenium (Selenomethionine)', form: 'Capsule', dose: '200mcg daily', timing: 'With breakfast', why_short: 'Lowers TPO antibodies in Hashimoto\'s', why: 'Selenomethionine reduces thyroid peroxidase antibodies and supports T4-to-T3 conversion.', practical_note: 'With breakfast. Do NOT exceed 400mcg/day (toxicity). Safe with levothyroxine.', category: 'condition_therapy', alternatives: [{ name: 'Brazil nuts (1-2 daily)', form: 'Whole food', note: 'Each nut has ~70-100mcg selenium; cheapest option' }, { name: 'Selenium Yeast', form: 'Capsule', note: 'Multiple forms blended' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Meta-analyses show TPO Ab reduction with 200mcg selenium for 3-6 months.' },
  },
  {
    key: 'berberine',
    alreadyTakingPatterns: [/\bberberine\b/i, /dihydroberberine/i],
    entry: { emoji: '🌿', nutrient: 'Berberine HCl', form: 'Capsule', dose: '500mg three times daily with meals', timing: 'With breakfast, lunch, dinner', why_short: 'Comparable to metformin for glucose control', why: 'Berberine activates AMPK, lowers fasting glucose, A1c, triglycerides, and LDL. Comparable to metformin in head-to-head studies.', practical_note: 'With each meal — short half-life requires 3x/day. GI upset first 1-2 weeks; ramp from 500mg/day. AVOID with statin if liver enzymes elevated. Pregnancy: do not take.', category: 'condition_therapy', alternatives: [{ name: 'Berberine Phytosome', form: 'Capsule', note: 'Once-daily; 5x more bioavailable; pricier' }, { name: 'Dihydroberberine', form: 'Capsule', note: 'Better absorbed; gentler on GI' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs show comparable efficacy to metformin for fasting glucose and A1c.' },
  },
  {
    key: 'inositol',
    alreadyTakingPatterns: [/\binositol\b/i, /\bovasitol\b/i],
    entry: { emoji: '🌸', nutrient: 'Myo-inositol + D-chiro-inositol (40:1)', form: 'Powder or capsule', dose: '4g myo + 100mg D-chiro daily, split', timing: 'Morning and evening with meals', why_short: 'PCOS-specific insulin sensitization', why: 'The 40:1 ratio mimics natural ovarian tissue; restores ovulation and insulin sensitivity in PCOS.', practical_note: 'Split into 2 doses with meals. Effects build over 3 months. Safe in pregnancy. No interactions with metformin.', category: 'condition_therapy', alternatives: [{ name: 'Myo-inositol only', form: 'Powder', note: 'Cheaper; nearly as effective for most cases' }, { name: 'Ovasitol packets (40:1)', form: 'Single-serve', note: 'Pre-measured; convenient; pricier per gram' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Multiple RCTs for PCOS insulin sensitivity and ovulation.' },
  },
  {
    key: 'vit_k2_mk7',
    alreadyTakingPatterns: [/vitamin\s*k2|menaquinone|mk-?7|mk-?4/i],
    entry: { emoji: '🦴', nutrient: 'Vitamin K2 (MK-7)', form: 'Softgel', dose: '180mcg daily', timing: 'With dinner (pair with vitamin D + fatty meal)', why_short: 'Routes calcium to bone, away from arteries', why: 'K2 activates osteocalcin (binds calcium to bone) and matrix-Gla protein (prevents arterial calcification). Standard pairing with vitamin D and calcium.', practical_note: 'With dinner alongside vitamin D. CRITICAL: do NOT take if on warfarin (affects INR). Safe with NOACs (apixaban, rivaroxaban) but inform doctor.', category: 'condition_therapy', alternatives: [{ name: 'Vitamin K2 (MK-4)', form: 'Capsule', note: 'Shorter-acting; usually 3x/day; more bone research backing' }, { name: 'D3 + K2 combo softgel', form: 'Softgel', note: 'Combines two daily supps into one' }], priority: 'high', sourced_from: 'disease_mechanism', evidence_note: 'Strong evidence for bone density and arterial calcification reduction.' },
  },

  // ── Optimization-tier (longevity/general) ────────────────────────────
  {
    key: 'creatine',
    alreadyTakingPatterns: [/\bcreatine\b/i],
    entry: { emoji: '💪', nutrient: 'Creatine Monohydrate', form: 'Powder', dose: '5g', timing: 'Any time daily', why_short: 'Universal — strength, cognition, bone density', why: 'Creatine is one of the most studied supplements. Daily 5g supports muscle strength, cognitive function, and bone density. No loading required.', practical_note: 'Mix in any drink. Take consistently — a daily habit matters more than timing.', category: 'condition_therapy', alternatives: [{ name: 'Creatine HCl', form: 'Capsule', note: 'Pricier; some prefer for bloating' }], priority: 'moderate', sourced_from: 'optimization', evidence_note: '500+ RCTs across decades support 3-5g daily for healthy adults.' },
  },
  {
    key: 'omega_3',
    alreadyTakingPatterns: [/\bomega[- ]?3|fish oil|epa|dha\b/i, /algae oil/i],
    entry: { emoji: '🐟', nutrient: 'Omega-3 (EPA + DHA)', form: 'Softgel', dose: '2g combined EPA+DHA', timing: 'With food', why_short: 'CV protection, brain, anti-inflammatory', why: 'Omega-3s lower triglycerides, hs-CRP, and CV risk. 2g combined EPA+DHA daily from a third-party-tested fish oil or algal source.', practical_note: 'With the largest meal of the day for absorption. Refrigerate to prevent rancidity.', category: 'inflammation_cardio', alternatives: [{ name: 'Algal EPA/DHA', form: 'Softgel', note: 'Vegan; no fish burps' }, { name: 'Liquid fish oil', form: 'Liquid', note: 'Cheaper per gram for higher doses' }], priority: 'moderate', sourced_from: 'optimization', evidence_note: 'AHA recommends 1g+/day; longevity protocols target 2g+.' },
  },
];

const BY_KEY = new Map<string, SupplementDef>(REGISTRY.map(s => [s.key, s]));

export function getSupplement(key: string): SupplementDef | undefined {
  return BY_KEY.get(key);
}

/**
 * Push a supplement entry into the plan.supplement_stack by canonical key.
 * Skips if user is already taking it (matches alreadyTakingPatterns) or if
 * the AI's stack already has it. Returns true if inserted.
 */
export function pushSupplementByKey(
  supplementStack: any[],
  key: string,
  alreadyTakingText: string,    // user's currently-taking + AI-generated stack text combined
): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;
  // Already represented?
  if (def.alreadyTakingPatterns.some(re => re.test(alreadyTakingText))) return false;
  // Belt-and-suspenders: if anything already in the stack has the same canonical key, skip
  if (supplementStack.some(s => s?._key === key)) return false;
  supplementStack.push({ ...def.entry, _key: key });
  return true;
}

export const SUPPLEMENT_REGISTRY = REGISTRY;
