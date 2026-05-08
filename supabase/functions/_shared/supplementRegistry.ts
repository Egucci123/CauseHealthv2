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
//
// ─── CATEGORIZATION RULES (READ BEFORE ADDING A SUPPLEMENT) ────────────
//
// These are STRICT pharmacology-driven rules. Read all 6 before picking.
// If you can't decide between two, the supplement probably belongs in
// the one that matches its PRIMARY mechanism, not its secondary effect.
//
//   nutrient_repletion   — A vitamin or mineral the user is measurably
//                          deficient in OR a known dietary gap. (B12,
//                          B-complex, Vitamin D3, Iron, Zinc, Folate,
//                          Calcium+D for bone). Replacing what's
//                          missing.
//
//   liver_metabolic      — Direct hepatoprotection (Milk Thistle, NAC,
//                          TUDCA) OR liver-pathway metabolic intervention
//                          (Berberine — AMPK pathway). NOT for things
//                          that merely *touch* the liver. CoQ10 is NOT
//                          here — the liver makes CoQ10, doesn't need it.
//
//   inflammation_cardio  — Anti-inflammatory, lipid-modifying, CV-protective,
//                          or mitochondrial-energy supplements
//                          (Omega-3, Curcumin, Bergamot, CoQ10, Creatine).
//                          Mitochondrial / muscle-energy belongs here
//                          because muscle-pump and cardiac muscle share
//                          the mechanism.
//
//   gut_healing          — GI mucosal repair, probiotics, IBD-specific
//                          (L-Glutamine, S. boulardii, Butyrate, slippery
//                          elm). Direct gut-barrier or microbiome action.
//
//   sleep_stress         — Calming, sleep onset, cortisol/HPA, GABAergic
//                          (Magnesium Glycinate — evening, L-Theanine,
//                          Glycine, Ashwagandha, Phosphatidylserine).
//                          Mag goes here because the *primary* user-facing
//                          benefit is sleep, even when the trigger is a
//                          medication depletion (PPI/diuretic).
//
//   condition_therapy    — Disease-specific evidence-based adjunct with
//                          strong RCT/meta-analysis support for a
//                          confirmed dx (Selenium for Hashimoto's,
//                          Inositol for PCOS, Vitamin K2 for osteoporosis).
//                          NOT general optimization — that's
//                          inflammation_cardio.
//
// ─── DON'T MIX THESE UP ────────────────────────────────────────────────
//
//   ✗ CoQ10 in liver_metabolic           → inflammation_cardio
//   ✗ Creatine in condition_therapy      → inflammation_cardio
//   ✗ Magnesium in nutrient_repletion    → sleep_stress (unless lab-confirmed deficiency)
//   ✗ Vitamin D in liver_metabolic       → nutrient_repletion
//   ✗ B12 in inflammation_cardio         → nutrient_repletion
//   ✗ Berberine in nutrient_repletion    → liver_metabolic (or condition_therapy if T2D/PCOS)
//
// ─── TWO-AXIS ROUTING ──────────────────────────────────────────────────
//
// Every supplement has TWO routing fields:
//
//   `category`     — pharmacological grouping (above 6 categories)
//   `sourced_from` — WHY this user is getting it for the FIRST time:
//                    'lab_finding' | 'medication_depletion' |
//                    'disease_mechanism' | 'optimization'
//
// The UI renders by `category` BUT routes any `sourced_from === 'medication_depletion'`
// supplement into a separate "Medication Depletions" section at display
// time, regardless of category. So CoQ10 (category: inflammation_cardio,
// sourced_from: medication_depletion) shows under "Medication Depletions"
// for a statin user, but under "Inflammation & Cardio" for a non-statin
// user who gets it for general mitochondrial support.
//
// This gives users a clear "this is here because of your meds" section
// without polluting the categorical groups.

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
    entry: { emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel', dose: '100-200mg', timing: 'With breakfast (take with fat)', why_short: 'Statins block your body from making CoQ10', why: 'Statins inhibit the same pathway your body uses to make CoQ10 — the energy molecule muscle and heart cells depend on. Replacing it cuts statin-related fatigue and muscle aches.', practical_note: 'Take with the fattiest meal of the day — CoQ10 is fat-soluble and absorption drops 50%+ on an empty stomach. Ubiquinol is the absorbable form.', category: 'inflammation_cardio', alternatives: [{ name: 'CoQ10 (Ubiquinone)', form: 'Capsule', note: 'Cheaper but ~50% less bioavailable; needs higher dose (200-400mg)' }, { name: 'PQQ + CoQ10 combo', form: 'Capsule', note: 'PQQ supports mitochondrial production; pricier' }], priority: 'high', sourced_from: 'medication_depletion', evidence_note: 'Multiple RCTs support 100-200mg ubiquinol daily for statin users.' },
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

  // ── Lab-pattern targeted ──────────────────────────────────────────────
  {
    key: 'curcumin',
    alreadyTakingPatterns: [/\bcurcumin\b/i, /\bturmeric\b.*extract/i, /\bmeriva\b/i],
    entry: { emoji: '🌿', nutrient: 'Curcumin (Meriva or BCM-95)', form: 'Capsule (with phospholipid for absorption)', dose: '500-1000mg daily', timing: 'With breakfast (with fat)', why_short: 'Lowers hs-CRP via NF-kB modulation', why: 'Curcumin reduces hs-CRP, IL-6, and TNF-α through NF-kB pathway inhibition. Multiple meta-analyses support 500-1000mg of bioavailable curcumin (Meriva or BCM-95) for 8-12 weeks to cut CRP 0.4–1.2 mg/L.', practical_note: 'Bioavailability matters — plain turmeric capsules are mostly excreted. Use Meriva (phospholipid complex) or BCM-95. Take with the fattiest meal of the day. CAUTION: mild blood-thinning effect — avoid 2 wk before surgery; check with doctor if on warfarin or apixaban. Rare gallbladder caution if gallstones.', category: 'inflammation_cardio', alternatives: [{ name: 'Quercetin', form: 'Capsule', note: 'Different mechanism (mast-cell stabilizer); pairs well; cheaper' }, { name: 'NAC (N-Acetyl-Cysteine)', form: 'Capsule', note: 'Glutathione precursor; broad anti-inflammatory; complementary to curcumin' }], priority: 'high', sourced_from: 'lab_finding', evidence_note: 'Multiple Cochrane + meta-analyses support curcumin for inflammation marker reduction.' },
  },
  {
    key: 'bergamot',
    alreadyTakingPatterns: [/\bbergamot\b/i, /citrus bergamia/i],
    entry: { emoji: '🍋', nutrient: 'Bergamot Extract (Bergamonte / BPF)', form: 'Capsule (standardized to 38% polyphenols)', dose: '500-1000mg daily', timing: 'Before lunch and dinner', why_short: 'Lowers small dense LDL + raises large HDL', why: 'Bergamot polyphenolic fraction (BPF) reduces LDL-P, small dense LDL, and triglycerides while raising HDL — particularly effective for atherogenic-pattern dyslipidemia where standard cholesterol numbers look OK.', practical_note: 'Take 30 min before main meals. Standardized to 38%+ polyphenols (BPF) — generic bergamot is weaker. Safe with statins (often used alongside for additional 15-25% LDL drop). Mild interaction with calcium-channel blockers; check with doctor.', category: 'inflammation_cardio', alternatives: [{ name: 'Citrus Bergamia + Olive Polyphenols', form: 'Capsule', note: 'Combo product; broader CV protection' }, { name: 'Red Yeast Rice + CoQ10', form: 'Capsule', note: 'Statin-like effect; needs CoQ10 to offset; check with prescribing doctor if already on a statin' }], priority: 'high', sourced_from: 'lab_finding', evidence_note: 'Mollace 2011 + multiple RCTs for atherogenic dyslipidemia.' },
  },

  // ── Optimization-tier (longevity/general) ────────────────────────────
  {
    key: 'creatine',
    alreadyTakingPatterns: [/\bcreatine\b/i],
    entry: { emoji: '💪', nutrient: 'Creatine Monohydrate', form: 'Powder', dose: '5g', timing: 'Any time daily', why_short: 'Universal — strength, cognition, bone density', why: 'Creatine is one of the most studied supplements. Daily 5g supports muscle strength, cognitive function, and bone density. No loading required.', practical_note: 'Mix in any drink. Take consistently — a daily habit matters more than timing.', category: 'inflammation_cardio', alternatives: [{ name: 'Creatine HCl', form: 'Capsule', note: 'Pricier; some prefer for bloating' }], priority: 'moderate', sourced_from: 'optimization', evidence_note: '500+ RCTs across decades support 3-5g daily for healthy adults.' },
  },
  {
    key: 'omega_3',
    alreadyTakingPatterns: [/\bomega[- ]?3|fish oil|epa|dha\b/i, /algae oil/i],
    entry: { emoji: '🐟', nutrient: 'Omega-3 (EPA + DHA)', form: 'Softgel', dose: '2g combined EPA+DHA', timing: 'With food', why_short: 'CV protection, brain, anti-inflammatory', why: 'Omega-3s lower triglycerides, hs-CRP, and CV risk. 2g combined EPA+DHA daily from a third-party-tested fish oil or algal source.', practical_note: 'With the largest meal of the day for absorption. Refrigerate to prevent rancidity.', category: 'inflammation_cardio', alternatives: [{ name: 'Algal EPA/DHA', form: 'Softgel', note: 'Vegan; no fish burps' }, { name: 'Liquid fish oil', form: 'Liquid', note: 'Cheaper per gram for higher doses' }], priority: 'moderate', sourced_from: 'optimization', evidence_note: 'AHA recommends 1g+/day; longevity protocols target 2g+.' },
  },
];

const BY_KEY = new Map<string, SupplementDef>(REGISTRY.map(s => [s.key, s]));

// ─── RUNTIME CATEGORIZATION VALIDATOR ──────────────────────────────────
// Pharmacology-driven rules. Each rule is a regex against the supplement's
// nutrient name (case-insensitive). If matched, the entry MUST have the
// expected category. Mismatches log a warning at cold start so they're
// visible in Supabase logs and caught before they ship to a user.
//
// Add a new rule when you add a supplement to the registry — this is the
// safety net that prevents future CoQ10-as-liver mistakes.
const CATEGORY_RULES: Array<{ pattern: RegExp; expected: SupplementDef['entry']['category']; reason: string }> = [
  // Mitochondrial / muscle / heart energy
  { pattern: /\b(coq[\s-]?10|ubiquinol|ubiquinone|coenzyme\s*q)\b/i, expected: 'inflammation_cardio', reason: 'CoQ10 is mitochondrial/cardiac, not hepatic. The liver MAKES CoQ10.' },
  { pattern: /\bcreatine\b/i, expected: 'inflammation_cardio', reason: 'Creatine is general optimization (strength/cognition/CV), not condition-specific therapy.' },
  // Hepatoprotection (true liver supplements)
  { pattern: /\b(milk\s*thistle|silymarin|silybin|tudca|nac\b|n[\s-]?acetyl[\s-]?cysteine)/i, expected: 'liver_metabolic', reason: 'Direct hepatoprotection.' },
  // Nutrient/vitamin repletion
  { pattern: /\b(vitamin\s*d3?|cholecalciferol|25[\s-]?oh)\b/i, expected: 'nutrient_repletion', reason: 'Vitamin replacement. Even when triggered by steroid depletion, the user-facing purpose is repletion.' },
  { pattern: /\b(b[\s-]?12|cobalamin|methylcobalamin|adenosylcobalamin)\b/i, expected: 'nutrient_repletion', reason: 'Vitamin replacement.' },
  { pattern: /\bb[\s-]?complex\b/i, expected: 'nutrient_repletion', reason: 'Vitamin replacement.' },
  { pattern: /\bzinc\b/i, expected: 'nutrient_repletion', reason: 'Mineral replacement.' },
  { pattern: /\b(iron|ferrous|ferritin\s*support)\b/i, expected: 'nutrient_repletion', reason: 'Mineral replacement.' },
  { pattern: /\bfolate|folic acid\b/i, expected: 'nutrient_repletion', reason: 'Vitamin replacement.' },
  // Magnesium has dual mechanism but evening dose + GABA = sleep_stress primary
  { pattern: /^magnesium\s+(glycinate|threonate)\b/i, expected: 'sleep_stress', reason: 'Glycinate/threonate are dosed for GABA / sleep onset; primary user benefit is sleep.' },
  // Gut healing
  { pattern: /\b(l[\s-]?glutamine|s\.?\s*boulardii|saccharomyces|butyrate|tributyrin|slippery\s*elm|deglycyrrhizinated|dgl|aloe|colostrum)\b/i, expected: 'gut_healing', reason: 'Direct gut-barrier or microbiome action.' },
  // Sleep / stress / GABAergic
  { pattern: /\b(l[\s-]?theanine|ashwagandha|glycine|phosphatidylserine|melatonin|gaba|valerian|chamomile|passionflower)\b/i, expected: 'sleep_stress', reason: 'Calming / sleep / cortisol mechanism.' },
  // Anti-inflammatory / lipid / CV / mitochondrial
  { pattern: /\b(omega[\s-]?3|fish\s*oil|epa|dha|krill|algae\s*oil|curcumin|turmeric|bergamot|red\s*yeast\s*rice|berberine\s*phytosome|niacin|policosanol|phytosterol|garlic\s*extract|resveratrol|quercetin)\b/i, expected: 'inflammation_cardio', reason: 'Anti-inflammatory / lipid-modifying / CV / mitochondrial.' },
  // Disease-specific therapy
  { pattern: /\b(selenium|selenomethionine)\b/i, expected: 'condition_therapy', reason: 'Hashimoto\'s-specific (TPO Ab reduction).' },
  { pattern: /\binositol|ovasitol\b/i, expected: 'condition_therapy', reason: 'PCOS-specific.' },
  { pattern: /\bvitamin\s*k2|menaquinone|mk-?7|mk-?4\b/i, expected: 'condition_therapy', reason: 'Osteoporosis / arterial calcification (paired with D3).' },
  { pattern: /\b(calcium\s*[+\s]\s*vitamin\s*d|calcium\s*[+\s]\s*d3)\b/i, expected: 'nutrient_repletion', reason: 'Mineral + vitamin replacement (steroid-induced bone loss).' },
];

// Validator runs once at module load. Logs warnings — never throws — so
// a borderline categorization doesn't break a user's plan generation. The
// log line is grep-friendly: 'SUPPLEMENT_REGISTRY_VIOLATION' is unique.
function validateRegistry() {
  for (const def of REGISTRY) {
    const name = def.entry.nutrient;
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(name)) {
        if (def.entry.category !== rule.expected) {
          console.warn(
            `[SUPPLEMENT_REGISTRY_VIOLATION] ${def.key} ('${name}') is category='${def.entry.category}' but rule says '${rule.expected}'. Reason: ${rule.reason}`
          );
        }
        // First matching rule wins — don't double-report.
        break;
      }
    }
  }
}
// Run once. Cheap (~18 entries × ~17 regex tests = trivial).
validateRegistry();

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
