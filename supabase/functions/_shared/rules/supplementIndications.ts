// supabase/functions/_shared/rules/supplementIndications.ts
//
// UNIVERSAL DATA-DRIVEN SUPPLEMENT ENGINE
// =======================================
// Replaces the hand-rolled if/else chain in supplementRules.ts with a
// single algorithm that iterates a data table.
//
// Adding coverage for a new pattern = ADD ONE ROW to INDICATIONS.
// No new code. No new if-statements. No engine modification.
//
// Architecture:
//
//   SUPPLEMENT_BASE — canonical supplement definitions
//     • One entry per supplement (name, dose, form, timing, alternatives)
//     • Pregnancy / allergy contraindication flags
//
//   INDICATIONS — what triggers each supplement
//     • Each row: { triggers, gates, supplements }
//     • triggers fire on labs / symptoms / conditions / medications / age
//     • gates filter by sex / age / pregnancy
//
//   evaluateIndications() — the one algorithm
//     • Iterates INDICATIONS
//     • For each, checks triggers + gates against input
//     • Emits SupplementCandidate per supplement referenced
//     • Dedups by supplement key
//     • Applies final pregnancy / allergy filters
//     • Sorts by priority + source
//     • Caps at top N (configurable)
//
// Universal across every user pattern. Same input → same output, byte-
// for-byte deterministic.

import type { DepletionFact } from './depletionRules.ts';
import type { LabOutlierFact, SymptomEntry } from '../buildPlan.ts';
import type { SupplementCandidate } from './supplementRules.ts';

// ──────────────────────────────────────────────────────────────────────
// 1. SUPPLEMENT BASE — canonical definitions (one row per supplement)
// ──────────────────────────────────────────────────────────────────────

export interface SupplementBase {
  emoji: string;
  nutrient: string;
  form: string;
  dose: string;
  timing: string;
  category: SupplementCandidate['category'];
  defaultWhyShort: string;
  /** Default explanatory note. Indication-level `why` can override. */
  defaultWhy: string;
  /** Canned "when/how to take + interactions + absorption tips" note.
   *  ~1 sentence. Pre-written per supplement so the AI doesn't have to
   *  generate it on every call — saves ~$0.005-0.01/gen. */
  practicalNote?: string;
  /** Canned "mechanism + typical response time + magnitude" note.
   *  ~1 sentence. Pre-written per supplement; same cost savings. */
  evidenceNote?: string;
  /** Drops if patient is pregnant / trying / breastfeeding. */
  pregnancyContraindicated?: boolean;
  /** Drops if patient reported shellfish or fish allergy
   *  (algal alternative remains). */
  fishOilLike?: boolean;
  alternatives?: SupplementCandidate['alternatives'];
}

export const SUPPLEMENT_BASE: Record<string, SupplementBase> = {
  // ── Vitamins ───────────────────────────────────────────────────────
  vit_d3_4000: {
    emoji: '💊',
    nutrient: 'Vitamin D3',
    form: 'Softgel with mixed tocopherols',
    dose: '4000 IU/day',
    timing: 'With breakfast',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Replete low vitamin D',
    defaultWhy: 'Vitamin D supports immunity, mood, bone, and metabolic health; supplementation typically raises 25-OH levels 10–15 ng/mL in 12 weeks.',
    practicalNote: 'Take with the fattiest meal of the day — Vitamin D is fat-soluble and absorption drops 30-50% on an empty stomach.',
    evidenceNote: '4000 IU/day raises 25-OH-D by ~10-15 ng/mL in 12 weeks. Target level 40-60 ng/mL per Endocrine Society / functional medicine consensus.',
    alternatives: [
      { name: 'Vitamin D3 + K2', form: 'Softgel', note: 'K2 directs calcium to bone, away from arteries — good for higher doses.' },
    ],
  },
  vit_d3_1000: {
    emoji: '💊',
    nutrient: 'Vitamin D3',
    form: 'Softgel',
    dose: '1000 IU/day',
    timing: 'With breakfast',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Baseline vitamin D support',
    defaultWhy: 'Most US adults have suboptimal vitamin D; 1000 IU/day with annual retest is a conservative maintenance dose.',
  },
  vit_b12_methyl: {
    emoji: '💊',
    nutrient: 'Methylcobalamin (B12)',
    form: 'Sublingual lozenge',
    dose: '1000 mcg/day',
    timing: 'Morning, empty stomach',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Replete low B12',
    defaultWhy: 'Methylcobalamin is the active form (no MTHFR conversion needed); sublingual bypasses absorption issues common with PPI/metformin/age.',
    practicalNote: 'Hold under the tongue for 60-90 seconds before swallowing. Sublingual absorption bypasses gastric issues that cause low B12 (PPIs, metformin, atrophic gastritis).',
    evidenceNote: '1000 mcg/day raises serum B12 + drops MMA and homocysteine within 4-8 weeks. Methylcobalamin works even with MTHFR variants that block cyanocobalamin conversion.',
  },
  methylfolate: {
    emoji: '💊',
    nutrient: 'Methylfolate (5-MTHF)',
    form: 'Capsule',
    dose: '400-800 mcg/day',
    timing: 'Morning with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Replete low folate',
    defaultWhy: 'Methylfolate is the bioavailable active form, important for users on mesalamine / methotrexate / hormonal contraception.',
    practicalNote: 'Take in the morning — methylfolate is stimulating for some. If you feel jittery, switch to folinic acid (gentler alternative).',
    evidenceNote: '400-800 mcg/day raises RBC folate and drops homocysteine in 8-12 weeks. Methylfolate is preferred over folic acid for users with MTHFR variants (~40% of population).',
    alternatives: [{ name: 'Folinic acid', form: 'Capsule', note: 'Alternative if methylfolate causes overstimulation.' }],
  },
  vit_b6_p5p: {
    emoji: '💊',
    nutrient: 'Vitamin B6 (P5P)',
    form: 'Capsule',
    dose: '50 mg/day',
    timing: 'Morning with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'B6 active form',
    defaultWhy: 'P5P is the active coenzyme form of B6, important for users on hormonal contraception and for PMS support.',
  },
  vit_e_400: {
    emoji: '💊',
    nutrient: 'Vitamin E (mixed tocopherols)',
    form: 'Softgel',
    dose: '400 IU/day',
    timing: 'With largest meal',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Mild hot-flash reduction',
    defaultWhy: 'Vitamin E 400 IU/day modestly reduced hot-flash frequency in menopause trials (Ziaei 2007). Pregnancy-safe at this dose.',
  },
  b_complex_methyl: {
    emoji: '💊',
    nutrient: 'Methylated B-Complex',
    form: 'Capsule',
    dose: '1 capsule/day',
    timing: 'Morning with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Energy + mitochondrial cofactor support',
    defaultWhy: 'Methylated B-vitamins (B6 P5P, methylfolate, methylcobalamin) bypass MTHFR conversion issues and support energy metabolism.',
    practicalNote: 'Take in the morning with food — B vitamins can be stimulating and may disrupt sleep if taken late. Bright yellow urine is normal (B2 excretion).',
    evidenceNote: 'Methylated B-complex (active forms of B6/folate/B12) supports energy metabolism + methylation cycle. Typical response: improved energy and mental clarity in 2-4 weeks of consistent use.',
  },
  biotin_5mg: {
    emoji: '💊',
    nutrient: 'Biotin',
    form: 'Capsule',
    dose: '5 mg/day',
    timing: 'Morning',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Hair / nail keratin support',
    defaultWhy: 'Biotin supports keratin synthesis. Note: discontinue 48 h before any lab draw — biotin interferes with TSH, troponin, and other immunoassays.',
  },
  riboflavin_b2: {
    emoji: '💊',
    nutrient: 'Riboflavin (B2)',
    form: 'Capsule',
    dose: '400 mg/day',
    timing: 'Morning with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Migraine prevention',
    defaultWhy: 'Riboflavin 400 mg/day reduced migraine frequency in 2–3 RCTs via mitochondrial energy support. Pregnancy-safe.',
  },

  // ── Minerals ────────────────────────────────────────────────────────
  mg_glycinate_300: {
    emoji: '💊',
    nutrient: 'Magnesium Glycinate',
    form: 'Capsule',
    dose: '300 mg/day',
    timing: 'Evening (7 PM), 2–3 hours before bed',
    category: 'sleep_stress',
    defaultWhyShort: 'Sleep / stress / mood support',
    defaultWhy: 'Glycinate crosses the blood-brain barrier and supports GABA tone; most-studied form for sleep latency and stress modulation.',
    practicalNote: 'Take 2-3 hours before bed for sleep benefit. Magnesium glycinate is the gentlest form on the GI tract — no laxative effect at this dose.',
    evidenceNote: 'Mg 300 mg/day improves sleep latency 15-20 min and subjective sleep quality in 2-3 RCTs. Supports GABA tone, muscle relaxation, and HPA-axis modulation.',
    alternatives: [{ name: 'Magnesium L-Threonate', form: 'Capsule', note: 'For added cognitive benefit.' }],
  },
  mg_glycinate_200: {
    emoji: '💊',
    nutrient: 'Magnesium Glycinate',
    form: 'Capsule',
    dose: '200 mg/day',
    timing: 'Evening',
    category: 'sleep_stress',
    defaultWhyShort: 'Baseline magnesium support',
    defaultWhy: 'Population intake data shows magnesium below RDA; glycinate is gentle and supports sleep, stress, muscle function.',
  },
  mg_glycinate_400: {
    emoji: '💊',
    nutrient: 'Magnesium Glycinate',
    form: 'Capsule',
    dose: '400 mg/day',
    timing: 'Evening',
    category: 'sleep_stress',
    defaultWhyShort: 'Migraine prevention',
    defaultWhy: 'Magnesium 400 mg/day is American Headache Society Level B evidence for migraine prevention.',
  },
  mg_citrate: {
    emoji: '💊',
    nutrient: 'Magnesium Citrate',
    form: 'Capsule',
    dose: '400 mg/day',
    timing: 'Evening',
    category: 'gut_healing',
    defaultWhyShort: 'Gentle osmotic laxative',
    defaultWhy: 'Magnesium citrate draws water into the colon; the most-recommended OTC magnesium for constipation. Pregnancy-safe at this dose.',
  },
  mg_l_threonate: {
    emoji: '💊',
    nutrient: 'Magnesium L-Threonate',
    form: 'Capsule',
    dose: '1.5–2 g/day (split dose)',
    timing: 'Afternoon + evening',
    category: 'sleep_stress',
    defaultWhyShort: 'CNS magnesium / cognition',
    defaultWhy: 'L-threonate is the only magnesium form clinically shown to raise CNS magnesium (Slutsky 2010); supports memory and cognition.',
  },
  zinc_15: {
    emoji: '💊',
    nutrient: 'Zinc picolinate',
    form: 'Capsule',
    dose: '15 mg/day',
    timing: 'Evening with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Cofactor / immune / hair / thyroid conversion',
    defaultWhy: 'Zinc is a cofactor for >300 enzymes including deiodinase (T4→T3) and T-cell function; 15 mg is a safe long-term dose.',
    alternatives: [{ name: 'Zinc bisglycinate', form: 'Capsule', note: 'Equivalent absorption, may be gentler on the stomach.' }],
  },
  zinc_30: {
    emoji: '💊',
    nutrient: 'Zinc Picolinate',
    form: 'Capsule',
    dose: '30 mg/day',
    timing: 'Evening with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Acne severity reduction',
    defaultWhy: 'Zinc 30 mg/day matched moderate-dose antibiotics for inflammatory acne (Dreno 2001); supports skin barrier + sebum control.',
  },
  selenium_200: {
    emoji: '💊',
    nutrient: 'Selenium (selenomethionine)',
    form: 'Capsule',
    dose: '200 mcg/day',
    timing: 'Morning with food',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Thyroid antibody / conversion support',
    defaultWhy: 'Selenium lowered TPO antibodies 21–40% across RCTs (Toulis 2010); cofactor for deiodinase. Well under 400 mcg upper limit.',
    alternatives: [{ name: 'Brazil nuts', form: 'Whole food', note: '1–2 nuts/day delivers ~70–160 mcg selenium naturally.' }],
  },
  chromium_400: {
    emoji: '💊',
    nutrient: 'Chromium picolinate',
    form: 'Capsule',
    dose: '400 mcg/day',
    timing: 'With largest meal',
    category: 'liver_metabolic',
    defaultWhyShort: 'Insulin sensitivity',
    defaultWhy: 'Chromium is a cofactor for insulin signaling; supports glucose handling at conservative doses. Pregnancy-safe.',
  },
  iron_bisglycinate: {
    emoji: '💊',
    nutrient: 'Iron (gentle, low-dose)',
    form: 'Iron bisglycinate',
    dose: '25-50 mg every other day',
    timing: 'Morning, empty stomach with vitamin C 250 mg',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Replete low ferritin without GI side effects',
    defaultWhy: 'Bisglycinate is better tolerated than ferrous sulfate; alternate-day dosing improves absorption (Stoffel 2017).',
    alternatives: [{ name: 'Heme iron polypeptide', form: 'Capsule', note: 'Best-absorbed form; pricier.' }],
  },

  // ── Fats / Omega-3 ──────────────────────────────────────────────────
  omega3_1000: {
    emoji: '🐟',
    nutrient: 'Omega-3 (EPA/DHA)',
    form: 'Triglyceride-form softgel',
    dose: '1000 mg/day',
    timing: 'With largest meal',
    category: 'cardio',
    defaultWhyShort: 'Anti-inflammatory baseline',
    defaultWhy: 'Omega-3 supports cardiovascular and cognitive health; 1000 mg/day is a safe maintenance dose.',
    fishOilLike: true,
    alternatives: [{ name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy or vegan preference.' }],
  },
  omega3_2000: {
    emoji: '🐟',
    nutrient: 'Omega-3 (EPA/DHA)',
    form: 'Triglyceride-form softgel',
    dose: '2000 mg/day',
    timing: 'With largest meal',
    category: 'cardio',
    defaultWhyShort: 'Anti-inflammatory / cognitive support',
    defaultWhy: 'Higher-dose omega-3 supports joint, mood, and cognitive inflammation modulation.',
    practicalNote: 'Take with the largest fatty meal of the day for max absorption. Triglyceride form absorbs ~70% better than ethyl ester. Refrigerate after opening to prevent rancidity.',
    evidenceNote: 'EPA/DHA at 2g/day lowers inflammation markers (hs-CRP, IL-6) and improves joint/mood symptoms in 8-12 weeks. Typical TG drop: 15-25%.',
    fishOilLike: true,
    alternatives: [{ name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy.' }],
  },
  omega3_high_tg: {
    emoji: '💊',
    nutrient: 'Omega-3 (EPA/DHA, high-dose)',
    form: 'Triglyceride-form softgel',
    dose: '3000 mg/day (1500 EPA + 1500 DHA)',
    timing: 'With largest meal',
    category: 'cardio',
    defaultWhyShort: 'Triglyceride reduction',
    defaultWhy: 'Omega-3 lowers triglycerides 20–40% with adherence; used for elevated TG.',
    practicalNote: 'Split into 2 doses with biggest two meals if 3g causes burping. Triglyceride form is essential at this dose for absorption. If on warfarin, discuss with PCP (mild antiplatelet effect).',
    evidenceNote: 'High-dose omega-3 (3-4g EPA/DHA) drops triglycerides 25-40% in 12 weeks. AHA endorses for TG >500. Reduces ApoB-particle count alongside.',
    fishOilLike: true,
    alternatives: [{ name: 'Vegan algae omega-3', form: 'Softgel', note: 'Same EPA/DHA effect; for shellfish/fish allergy.' }],
  },

  // ── Botanicals / Adaptogens ─────────────────────────────────────────
  ashwagandha_600: {
    emoji: '🌿',
    nutrient: 'Ashwagandha (KSM-66)',
    form: 'Capsule',
    dose: '600 mg/day',
    timing: 'With breakfast',
    category: 'sleep_stress',
    defaultWhyShort: 'Adaptogenic cortisol modulation',
    defaultWhy: 'KSM-66 ashwagandha 600 mg/day reduced cortisol 27–30% and perceived stress in RCTs (Chandrasekhar 2012, Salve 2019). Pregnancy-contraindicated.',
    practicalNote: 'Take with breakfast for steady daytime cortisol blunting. KSM-66 is the most-studied root extract — avoid leaf extracts (different effect). Discontinue 2 weeks before any surgery.',
    evidenceNote: '600 mg/day KSM-66 dropped morning cortisol 27-30% + perceived-stress scores by 30-44% in 8-week RCTs. Best evidence for chronic-stress adrenal modulation.',
    pregnancyContraindicated: true,
    alternatives: [{ name: 'Rhodiola rosea', form: 'Capsule', note: '300 mg/day — alternative adaptogen, more energizing; also pregnancy-contraindicated.' }],
  },
  l_theanine: {
    emoji: '🌿',
    nutrient: 'L-Theanine',
    form: 'Capsule',
    dose: '200 mg twice daily',
    timing: 'As needed for stress, max 400 mg/day',
    category: 'sleep_stress',
    defaultWhyShort: 'Calm focus without sedation',
    defaultWhy: 'L-theanine raises alpha-brainwave activity and lowers subjective stress without sedation. Pregnancy-safe.',
  },
  phosphatidylserine: {
    emoji: '🧘',
    nutrient: 'Phosphatidylserine',
    form: 'Softgel',
    dose: '300 mg/day',
    timing: 'Evening',
    category: 'sleep_stress',
    defaultWhyShort: 'Lowers elevated cortisol',
    defaultWhy: 'Phosphatidylserine 300 mg blunts elevated cortisol in stress / overtraining studies (Monteleone 1992, Starks 2008). Pregnancy-safe.',
    practicalNote: 'Take in the evening — PS blunts the cortisol awakening response. Pairs well with Ashwagandha (different mechanism). Sunflower-derived is fine for soy allergies.',
    evidenceNote: '300 mg/day PS dropped elevated cortisol in stressed adults and overtrained athletes (Monteleone 1992, Starks 2008). Effects measurable in 2-4 weeks.',
    alternatives: [{ name: 'L-Theanine', form: 'Capsule', note: 'Alternative for daytime stress, 200 mg twice daily.' }],
  },
  vitex: {
    emoji: '🌿',
    nutrient: 'Vitex (Chasteberry)',
    form: 'Standardized extract',
    dose: '20–40 mg/day',
    timing: 'Morning, daily for 3+ months',
    category: 'condition_therapy',
    defaultWhyShort: 'PMS / luteal-phase support',
    defaultWhy: 'Vitex agnus-castus reduced PMS symptom scores 50%+ vs placebo (Schellenberg 2001). Takes 2–3 cycles for full effect.',
    pregnancyContraindicated: true,
  },
  black_cohosh: {
    emoji: '🌿',
    nutrient: 'Black Cohosh',
    form: 'Standardized extract',
    dose: '40 mg/day',
    timing: 'Morning with food',
    category: 'condition_therapy',
    defaultWhyShort: 'Hot-flash frequency reduction',
    defaultWhy: 'Black cohosh 40 mg/day reduced hot-flash frequency 26% vs placebo (Wuttke 2003 meta-analysis).',
    pregnancyContraindicated: true,
    alternatives: [{ name: 'Sage extract', form: 'Capsule', note: 'Alternative botanical for night sweats; less studied.' }],
  },
  dim: {
    emoji: '🌿',
    nutrient: 'DIM (Diindolylmethane)',
    form: 'Capsule',
    dose: '100 mg/day',
    timing: 'Morning with food',
    category: 'condition_therapy',
    defaultWhyShort: 'Estrogen-metabolism support',
    defaultWhy: 'DIM shifts estrogen metabolism toward the 2-hydroxylation pathway; used clinically for hormonal acne.',
    pregnancyContraindicated: true,
  },
  maca: {
    emoji: '🌿',
    nutrient: 'Maca (Lepidium meyenii)',
    form: 'Powder or capsule',
    dose: '1500–3000 mg/day',
    timing: 'Morning',
    category: 'condition_therapy',
    defaultWhyShort: 'Libido + sexual function support',
    defaultWhy: 'Maca improved subjective libido in placebo-controlled trials across both sexes (Shin 2010).',
    pregnancyContraindicated: true,
  },
  quercetin: {
    emoji: '💊',
    nutrient: 'Quercetin',
    form: 'Capsule',
    dose: '500 mg twice daily',
    timing: 'With meals',
    category: 'inflammation',
    defaultWhyShort: 'Mast-cell stabilization for allergies',
    defaultWhy: 'Quercetin stabilizes mast cells and reduces histamine release. Pregnancy data limited.',
    pregnancyContraindicated: true,
    alternatives: [{ name: 'Stinging Nettle', form: 'Capsule', note: 'Alternative natural antihistamine.' }],
  },
  curcumin: {
    emoji: '💊',
    nutrient: 'Curcumin (Meriva or BCM-95)',
    form: 'Capsule with phospholipid carrier',
    dose: '500 mg twice daily',
    timing: 'With meals',
    category: 'inflammation',
    defaultWhyShort: 'Reduce inflammation',
    defaultWhy: 'Bioavailable curcumin reduces inflammation markers 20–40% (curcumin meta-analyses); matches NSAIDs for OA pain.',
    practicalNote: 'Use phospholipid (Meriva) or BCM-95 forms — plain curcumin has <1% bioavailability. Take with food for fat absorption. Mild antiplatelet effect — discuss with PCP if on blood thinners.',
    evidenceNote: 'Bioavailable curcumin (1g/day) drops CRP 20-40% and matches ibuprofen for OA pain in head-to-head trials. Mucosal benefit in mild-moderate UC at 2g/day.',
  },
  milk_thistle: {
    emoji: '💊',
    nutrient: 'Milk Thistle (Silymarin)',
    form: 'Extract standardized to 80% silymarin',
    dose: '300 mg',
    timing: 'With lunch',
    category: 'liver_metabolic',
    defaultWhyShort: 'Hepatoprotection',
    defaultWhy: 'Silymarin is the best-studied hepatoprotective botanical — stabilizes hepatocyte membranes during enzyme elevation.',
    practicalNote: 'Take with lunch — silymarin is poorly water-soluble; food slows transit and improves absorption. Use 80% silymarin standardization (not "milk thistle seed" without standardization).',
    evidenceNote: 'Silymarin lowers ALT and AST in NAFLD / drug-induced injury (10-15 point drop typical at 12 weeks). Stabilizes hepatocyte membranes; safe for long-term use.',
  },
  berberine: {
    emoji: '💊',
    nutrient: 'Berberine HCl',
    form: 'Capsule',
    dose: '500 mg three times daily',
    timing: 'With each main meal',
    category: 'liver_metabolic',
    defaultWhyShort: 'A1c / insulin sensitivity',
    defaultWhy: 'Berberine 1500 mg/day shows A1c reduction comparable to metformin in meta-analyses (Yin 2008).',
    practicalNote: 'Take with each meal — short half-life means TID dosing matters. May cause initial GI upset; start at 1 capsule/day, build to 3 over 1-2 weeks. Avoid in pregnancy.',
    evidenceNote: 'Berberine 1.5 g/day dropped A1c 0.5-1.0% and fasting glucose 15-30 mg/dL in T2D RCTs (Yin 2008 meta-analysis). Effect size comparable to metformin.',
    pregnancyContraindicated: true,
    alternatives: [{ name: 'Chromium picolinate', form: 'Capsule', note: '400 mcg/day — pregnancy-safe glucose support.' }],
  },
  niacin: {
    emoji: '💊',
    nutrient: 'Niacin (nicotinic acid)',
    form: 'Sustained-release tablet',
    dose: '500 mg/day',
    timing: 'Evening with food',
    category: 'cardio',
    defaultWhyShort: 'Raise low HDL',
    defaultWhy: 'Niacin remains the most effective non-pharmacologic HDL-raiser (5–15 mg/dL increase). Flush is normal; SR forms reduce it.',
    pregnancyContraindicated: true,
    alternatives: [{ name: 'Inositol Hexanicotinate', form: 'Capsule', note: 'Flush-free niacin alternative; smaller HDL effect.' }],
  },
  red_yeast_rice: {
    emoji: '💊',
    nutrient: 'Red Yeast Rice (with CoQ10)',
    form: 'Capsule',
    dose: '1200 mg/day (10 mg monacolin K)',
    timing: 'With dinner',
    category: 'cardio',
    defaultWhyShort: 'Lower elevated LDL / ApoB',
    defaultWhy: 'RYR delivers a natural-form statin (monacolin K); add CoQ10 to offset depletion. Avoid if already on a prescription statin.',
    practicalNote: 'Take with dinner — RYR works on overnight cholesterol synthesis. NEVER combine with prescription statin (additive monacolin = rhabdomyolysis risk). Pair with CoQ10 100mg to offset depletion.',
    evidenceNote: 'RYR 10mg monacolin K drops LDL 20-30% in 8-12 weeks — mechanism identical to lovastatin. Meta-analyses show parity with low-dose statin therapy for primary prevention.',
    pregnancyContraindicated: true,
    alternatives: [
      { name: 'Bergamot extract', form: 'Capsule', note: 'Citrus bergamot 500–1000 mg/day — 15–25% LDL reduction in trials.' },
      { name: 'Plant sterols', form: 'Softgel', note: '2 g/day blocks cholesterol absorption.' },
    ],
  },
  tart_cherry: {
    emoji: '🍒',
    nutrient: 'Tart Cherry Extract',
    form: 'Capsule',
    dose: '500 mg/day',
    timing: 'Evening',
    category: 'inflammation',
    defaultWhyShort: 'Lower elevated uric acid',
    defaultWhy: 'Tart cherry concentrate lowers uric acid and reduces gout flare frequency (Schlesinger 2012).',
    alternatives: [{ name: 'Quercetin', form: 'Capsule', note: '500 mg/day — anti-inflammatory + uric-acid clearance.' }],
  },
  nac_600: {
    emoji: '💊',
    nutrient: 'N-Acetylcysteine (NAC)',
    form: 'Capsule',
    dose: '600 mg twice daily',
    timing: 'With food',
    category: 'liver_metabolic',
    defaultWhyShort: 'Glutathione precursor / hepatic support',
    defaultWhy: 'NAC is the glutathione precursor and the standard for hepatic oxidative stress.',
    practicalNote: 'Take with food — empty stomach can cause mild GI upset. NAC has a slight sulfur odor (normal). Discontinue 2 weeks before scheduled surgery (mild antiplatelet effect).',
    evidenceNote: 'NAC at 1200 mg/day raises hepatic glutathione + drops ALT/AST 10-20 points in NAFLD/drug-induced injury within 8-12 weeks. Standard antidote for acetaminophen toxicity.',
  },
  ala_600: {
    emoji: '💊',
    nutrient: 'Alpha-Lipoic Acid',
    form: 'Capsule',
    dose: '600 mg/day',
    timing: 'Morning, empty stomach',
    category: 'condition_therapy',
    defaultWhyShort: 'Insulin sensitivity / nerve support',
    defaultWhy: 'ALA improves insulin sensitivity and is the standard for diabetic neuropathy (1200 mg for neuropathy).',
    practicalNote: 'Take on empty stomach — ALA absorption drops 30% with food. R-ALA (stereoisomer) is more bioavailable than racemic. Monitor blood sugar if on insulin (may lower glucose).',
    evidenceNote: 'ALA 600-1200 mg/day improves insulin sensitivity (15-20% HOMA-IR drop) and is approved in Germany for diabetic neuropathy at 1200 mg.',
  },
  inositol_40_1: {
    emoji: '💊',
    nutrient: 'Myo-Inositol + D-Chiro-Inositol (40:1)',
    form: 'Powder',
    dose: '2 g twice daily',
    timing: 'Morning + evening with food',
    category: 'condition_therapy',
    defaultWhyShort: 'PCOS insulin / ovulation support',
    defaultWhy: 'Myo + D-chiro inositol at the 40:1 physiologic ratio improves insulin signaling and ovulation in PCOS (Nordio 2012).',
    alternatives: [{ name: 'NAC', form: 'Capsule', note: '600 mg twice daily — alternative for PCOS support.' }],
  },
  l_tyrosine: {
    emoji: '💊',
    nutrient: 'L-Tyrosine',
    form: 'Capsule',
    dose: '500 mg/day',
    timing: 'Morning, empty stomach',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Thyroid hormone precursor',
    defaultWhy: 'L-tyrosine is the amino-acid backbone for T4/T3 synthesis. Conservative dose; pair with selenium.',
  },
  l_glutamine: {
    emoji: '🛡️',
    nutrient: 'L-Glutamine',
    form: 'Powder (mix in water)',
    dose: '5g daily',
    timing: 'Morning, empty stomach',
    category: 'gut_healing',
    defaultWhyShort: 'Gut barrier repair',
    defaultWhy: 'L-glutamine is the primary fuel for enterocytes — supports mucosal repair during IBD remission.',
    practicalNote: 'Mix in water on empty stomach — glutamine is absorbed by intestinal cells directly. Tastes neutral. Avoid in active cancer or severe liver disease (precaution).',
    evidenceNote: 'L-glutamine 5-10 g/day supports intestinal mucosal repair in IBD remission + post-surgical recovery. Primary fuel source for enterocytes (intestinal cells).',
    alternatives: [
      { name: 'Slippery elm', form: 'Capsule', note: 'Mucilaginous fiber — soothes gut lining.' },
      { name: 'Zinc carnosine', form: 'Capsule', note: 'Targeted gut-lining repair.' },
    ],
  },
  coq10_100: {
    emoji: '💊',
    nutrient: 'CoQ10 (Ubiquinol)',
    form: 'Softgel',
    dose: '100 mg/day',
    timing: 'With breakfast (with fat)',
    category: 'nutrient_repletion',
    defaultWhyShort: 'Mitochondrial / statin support',
    defaultWhy: 'CoQ10 supports cellular energy; endogenous synthesis declines with age 40+ and is depleted by statins.',
    practicalNote: 'Take with the fattiest meal — CoQ10 is fat-soluble (absorption drops 50% on empty stomach). Ubiquinol form preferred over ubiquinone for age 40+ (better conversion). No statin interaction.',
    evidenceNote: 'CoQ10 100-200 mg/day reverses statin-induced muscle pain in 4-8 weeks (Caso 2007). Supports mitochondrial energy production; relevant for fatigue + age 40+.',
    alternatives: [
      { name: 'Ubiquinone', form: 'Softgel', note: '~30% lower bioavailability than ubiquinol but cheaper.' },
    ],
  },
  digestive_enzymes: {
    emoji: '💊',
    nutrient: 'Digestive Enzymes (full-spectrum)',
    form: 'Capsule',
    dose: '1 capsule per meal',
    timing: 'With each main meal',
    category: 'gut_healing',
    defaultWhyShort: 'Improve digestion / reduce bloating',
    defaultWhy: 'Full-spectrum enzymes (amylase, lipase, protease + DPP-IV) reduce post-prandial bloating.',
    alternatives: [{ name: 'Betaine HCl', form: 'Capsule', note: 'For low-stomach-acid bloating; avoid with PPIs / ulcer history.' }],
  },
  ginger: {
    emoji: '🌿',
    nutrient: 'Ginger Root Extract',
    form: 'Capsule',
    dose: '500 mg twice daily',
    timing: 'With meals',
    category: 'gut_healing',
    defaultWhyShort: 'Gastric motility / nausea support',
    defaultWhy: 'Ginger accelerates gastric emptying and reduces bloating + nausea in functional-dyspepsia and IBS trials.',
  },
  dgl: {
    emoji: '🌿',
    nutrient: 'DGL (Deglycyrrhizinated Licorice)',
    form: 'Chewable tablet',
    dose: '380 mg, 15 min before meals',
    timing: '2–3 times daily before meals',
    category: 'gut_healing',
    defaultWhyShort: 'Mucosal protection for reflux',
    defaultWhy: 'DGL supports esophageal and gastric mucosal protection without the blood-pressure risk of full licorice.',
    alternatives: [{ name: 'Slippery Elm', form: 'Capsule', note: 'Mucilaginous fiber — soothes mucosa.' }],
  },
  melatonin_3: {
    emoji: '💊',
    nutrient: 'Melatonin',
    form: 'Sublingual tablet',
    dose: '3 mg at bedtime',
    timing: 'Nightly, 30 min before bed',
    category: 'gut_healing',
    defaultWhyShort: 'Reduce nocturnal reflux',
    defaultWhy: 'Melatonin reduced GERD symptom scores in head-to-head trials with omeprazole (Pereira 2006). Pregnancy-safe at this dose.',
  },
  probiotic: {
    emoji: '🦠',
    nutrient: 'Probiotic (multi-strain, ≥30B CFU)',
    form: 'Capsule',
    dose: '1 capsule/day',
    timing: 'Morning, empty stomach',
    category: 'gut_healing',
    practicalNote: 'Take on empty stomach with cool water — stomach acid kills probiotics; food slows transit. Refrigerate. Look for multi-strain + ≥30B CFU + delayed-release capsule.',
    evidenceNote: 'Multi-strain probiotics reduce diarrhea + abdominal pain in IBS, normalize bowel patterns, and modestly extend remission in UC (VSL#3-style formulations).',
    defaultWhyShort: 'Bowel-pattern stabilization',
    defaultWhy: 'Multi-strain probiotics reduce diarrhea + abdominal pain in IBS and microbiome-driven bowel disruption.',
    alternatives: [{ name: 'L-Glutamine', form: 'Powder', note: '5 g/day — gut-barrier support.' }],
  },
};

// ──────────────────────────────────────────────────────────────────────
// 2. TRIGGER DEFINITIONS — what a row matches against
// ──────────────────────────────────────────────────────────────────────

export type FlagState =
  | 'high'
  | 'critical_high'
  | 'low'
  | 'critical_low'
  | 'watch'
  | 'any_high'    // high OR critical_high
  | 'any_low'     // low OR critical_low
  | 'any_outlier'; // any non-normal flag

export interface Trigger {
  /** What kind of input triggers this. */
  kind: 'lab' | 'symptom' | 'condition' | 'medication';

  /** Lab marker regex (lab triggers only). */
  marker?: RegExp;
  /** Acceptable flag states (lab triggers only). */
  states?: FlagState[];
  /** Optional value threshold further constraining the lab match. */
  valueThreshold?: { op: '<' | '>' | '<=' | '>='; value: number };

  /** Symptom / condition regex (symptom / condition triggers). */
  pattern?: RegExp;

  /** Medication class key (medication triggers only). */
  medClass?: string;
}

export interface IndicationGate {
  sex?: 'male' | 'female';
  ageMin?: number;
  ageMax?: number;
}

export interface SupplementRef {
  /** Key into SUPPLEMENT_BASE. */
  key: string;
  priority?: 'critical' | 'high' | 'moderate';
  sourcedFrom?: SupplementCandidate['sourcedFrom'];
  /** Override the supplement's defaultWhy. Can include {marker}, {value},
   *  {flag} placeholders that the matcher interpolates. */
  why?: string;
  /** Override defaultWhyShort. */
  whyShort?: string;
}

export interface Indication {
  /** Stable id for telemetry / debugging. */
  id: string;
  /** ANY trigger matching is enough to fire the indication. */
  triggers: Trigger[];
  /** ALL gates must pass for the supplement(s) to be emitted. */
  gates?: IndicationGate;
  /** Supplements to emit when this indication fires. */
  supplements: SupplementRef[];
}

// ──────────────────────────────────────────────────────────────────────
// 3. THE TABLE — every supplement recommendation lives here
// ──────────────────────────────────────────────────────────────────────
//
// Adding coverage for a new pattern = ADD A ROW. No code edits to the
// engine. The data IS the engine.
//
// Order doesn't matter — the final sort handles priority. Group by body
// system for readability only.

export const INDICATIONS: Indication[] = [
  // ── Medication depletions (empirical — no lab required) ────────────
  {
    id: 'statin_coq10',
    triggers: [{ kind: 'medication', medClass: 'statin' }],
    supplements: [{
      key: 'coq10_100',
      priority: 'high',
      sourcedFrom: 'medication_depletion',
      why: 'Statins block HMG-CoA reductase, the same enzyme that produces CoQ10. Repletion eases statin-related muscle and energy symptoms. (No standard test for CoQ10 — empirical repletion.)',
    }],
  },

  // ── Thyroid pathway ────────────────────────────────────────────────
  {
    id: 'tsh_watch_high_selenium_zinc',
    triggers: [{ kind: 'lab', marker: /^tsh$/i, states: ['watch', 'high', 'critical_high'], valueThreshold: { op: '>=', value: 2.0 } }],
    supplements: [
      { key: 'selenium_200', priority: 'moderate', sourcedFrom: 'lab_finding', whyShort: 'Thyroid antibody / conversion support' },
      { key: 'zinc_15',      priority: 'moderate', sourcedFrom: 'lab_finding', whyShort: 'T4→T3 conversion cofactor' },
    ],
  },
  {
    id: 'thyroid_antibodies_high',
    triggers: [{ kind: 'lab', marker: /tpo|thyroid peroxidase|thyroglobulin antibod/i, states: ['high', 'critical_high', 'watch'], valueThreshold: { op: '>=', value: 35 } }],
    supplements: [
      { key: 'selenium_200', priority: 'high', sourcedFrom: 'lab_finding' },
      { key: 'vit_d3_4000',  priority: 'high', sourcedFrom: 'lab_finding', whyShort: 'Autoimmune-tolerance support' },
    ],
  },
  {
    id: 'free_t3_low',
    triggers: [{ kind: 'lab', marker: /free\s*t3|^t3,?\s*free/i, states: ['low', 'critical_low', 'watch'], valueThreshold: { op: '<', value: 3.0 } }],
    supplements: [{ key: 'l_tyrosine', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },

  // ── Adrenal / cortisol ─────────────────────────────────────────────
  {
    id: 'cortisol_am_high',
    triggers: [{ kind: 'lab', marker: /cortisol.*am|cortisol\s*-\s*am|^cortisol$/i, states: ['any_high'] }],
    supplements: [
      { key: 'phosphatidylserine', priority: 'moderate', sourcedFrom: 'lab_finding' },
      { key: 'ashwagandha_600',    priority: 'moderate', sourcedFrom: 'lab_finding' },
    ],
  },

  // ── Lipid panel ────────────────────────────────────────────────────
  {
    id: 'tg_high',
    triggers: [{ kind: 'lab', marker: /triglyc|triglicér/i, states: ['any_high', 'watch'], valueThreshold: { op: '>=', value: 150 } }],
    supplements: [{ key: 'omega3_high_tg', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'hdl_low',
    triggers: [{ kind: 'lab', marker: /\bhdl\b|colesterol hdl/i, states: ['any_low', 'watch'], valueThreshold: { op: '<', value: 50 } }],
    supplements: [{ key: 'niacin', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'ldl_apob_high',
    triggers: [
      { kind: 'lab', marker: /(?<!v)\bldl\b|(?<!v)colesterol ldl/i, states: ['any_high', 'watch'], valueThreshold: { op: '>', value: 130 } },
      { kind: 'lab', marker: /apo.?b/i,         states: ['any_high', 'watch'], valueThreshold: { op: '>', value: 100 } },
    ],
    supplements: [{ key: 'red_yeast_rice', priority: 'high', sourcedFrom: 'lab_finding' }],
  },

  // ── Glycemic ───────────────────────────────────────────────────────
  {
    id: 'a1c_drift',
    triggers: [{ kind: 'lab', marker: /a1c|hba1c/i, states: ['any_high', 'watch'], valueThreshold: { op: '>=', value: 5.5 } }],
    supplements: [{ key: 'berberine', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'glucose_drift',
    triggers: [{ kind: 'lab', marker: /fasting\s*glucose|^glucose$/i, states: ['watch', 'high', 'critical_high'], valueThreshold: { op: '>=', value: 95 } }],
    supplements: [{ key: 'chromium_400', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },

  // ── Inflammation / hepatic ─────────────────────────────────────────
  {
    id: 'hs_crp_high',
    triggers: [{ kind: 'lab', marker: /hs[\s-]?crp|c[\s-]?reactive/i, states: ['any_high', 'watch'], valueThreshold: { op: '>', value: 1.0 } }],
    supplements: [{ key: 'curcumin', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'homocysteine_high',
    triggers: [{ kind: 'lab', marker: /homocysteine/i, states: ['any_high'], valueThreshold: { op: '>', value: 10 } }],
    supplements: [{ key: 'b_complex_methyl', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'ast_high',
    triggers: [{ kind: 'lab', marker: /^ast|sgot|aspartate/i, states: ['any_high'], valueThreshold: { op: '>', value: 35 } }],
    supplements: [{ key: 'nac_600', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'alt_high',
    triggers: [{ kind: 'lab', marker: /^alt$|sgpt/i, states: ['any_high'], valueThreshold: { op: '>', value: 50 } }],
    supplements: [{ key: 'milk_thistle', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'uric_acid_high',
    triggers: [{ kind: 'lab', marker: /uric\s*acid/i, states: ['any_high'], valueThreshold: { op: '>', value: 6.5 } }],
    supplements: [{ key: 'tart_cherry', priority: 'moderate', sourcedFrom: 'lab_finding' }],
  },

  // ── Nutrient repletion (lab-confirmed) ─────────────────────────────
  {
    id: 'vit_d_low',
    triggers: [{ kind: 'lab', marker: /vitamin d|25.?hydroxy/i, states: ['low', 'critical_low'] }],
    supplements: [{ key: 'vit_d3_4000', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'vit_d_watch_below_40',
    triggers: [{ kind: 'lab', marker: /vitamin d|25.?hydroxy/i, states: ['watch'], valueThreshold: { op: '<', value: 40 } }],
    supplements: [{ key: 'vit_d3_4000', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'ferritin_low',
    triggers: [{ kind: 'lab', marker: /ferritin/i, states: ['low', 'critical_low'] }],
    supplements: [{ key: 'iron_bisglycinate', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'ferritin_watch_below_50',
    triggers: [{ kind: 'lab', marker: /ferritin/i, states: ['watch'], valueThreshold: { op: '<', value: 50 } }],
    supplements: [{ key: 'iron_bisglycinate', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'b12_low',
    triggers: [{ kind: 'lab', marker: /(b[\s-]?12|cobalamin)/i, states: ['low', 'critical_low'] }],
    supplements: [{ key: 'vit_b12_methyl', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'b12_below_400',
    triggers: [{ kind: 'lab', marker: /(b[\s-]?12|cobalamin)/i, states: ['watch'], valueThreshold: { op: '<', value: 400 } }],
    supplements: [{ key: 'vit_b12_methyl', priority: 'high', sourcedFrom: 'lab_finding' }],
  },

  // 2026-05-12-39 — missing folate indications. Without these, a confirmed
  // low folate lab would not push methylfolate into the supplement stack.
  {
    id: 'folate_low',
    triggers: [
      { kind: 'lab', marker: /^folate\b|^serum\s+folate\b|^rbc\s+folate\b/i, states: ['low', 'critical_low'] },
    ],
    supplements: [{ key: 'methylfolate', priority: 'high', sourcedFrom: 'lab_finding' }],
  },
  {
    id: 'folate_watch',
    triggers: [
      { kind: 'lab', marker: /^folate\b|^serum\s+folate\b|^rbc\s+folate\b/i, states: ['watch'], valueThreshold: { op: '<', value: 6 } },
    ],
    supplements: [{ key: 'methylfolate', priority: 'high', sourcedFrom: 'lab_finding' }],
  },

  // Homocysteine high → methylated B's (methylfolate + B12 + B6 pathway)
  // Indirect folate signal — elevated Hcy often reflects functional folate /
  // B12 / B6 deficiency even when serum values are borderline.
  {
    id: 'homocysteine_elevated_methylated_b',
    triggers: [
      { kind: 'lab', marker: /homocysteine/i, states: ['any_high'], valueThreshold: { op: '>', value: 10 } },
    ],
    supplements: [
      { key: 'methylfolate', priority: 'moderate', sourcedFrom: 'lab_finding' },
      { key: 'vit_b12_methyl', priority: 'moderate', sourcedFrom: 'lab_finding' },
    ],
  },

  // 2026-05-12-42 — depletion-driven supplements are LAB-GATED ONLY.
  // The new architecture: every medication-driven depletion auto-adds a
  // monitoring test to the doctor-prep test list (see buildPlan.ts). The
  // counter-supplement only fires AFTER the lab confirms a measurable
  // deficiency. This eliminates empirical supplementation risk (Vit D
  // accumulation, iron overload, masking-B12-deficiency via empirical
  // folate, etc.).
  //
  // STANDARD-OF-CARE EXCEPTION: methotrexate + folate co-supplementation.
  // This is the established rheumatology standard — folic acid (or folinic
  // acid) is co-prescribed with MTX from day 1 to prevent toxicity. Not
  // a "treat-empirically" decision; it's pharmacologically required.
  // Every other drug class waits for lab confirmation.
  {
    id: 'methotrexate_empirical_folate',
    triggers: [{ kind: 'medication', medClass: 'methotrexate' }],
    supplements: [{ key: 'methylfolate', priority: 'critical', sourcedFrom: 'medication_depletion', whyShort: 'Methotrexate is a folate antagonist — folate co-supplementation is standard of care' }],
  },

  // ── Conditions ─────────────────────────────────────────────────────
  {
    // IBD (UC / Crohn) — the standard IBD supplement stack. Diagnosed
    // patients deserve the full GI-axis support, not just L-Glutamine.
    // Universal across both diseases (UC + Crohn share core mechanisms).
    // Critical priority — IBD is an active chronic disease driving real
    // morbidity; supplements should not be cap-cut by lipid-pattern stack.
    id: 'ibd',
    triggers: [{ kind: 'condition', pattern: /\b(uc|ulcerative colitis|crohn|ibd|inflammatory bowel)\b/i }],
    supplements: [
      { key: 'l_glutamine',      priority: 'critical', sourcedFrom: 'disease_mechanism', whyShort: 'Primary enterocyte fuel — supports mucosal repair in IBD remission' },
      { key: 'probiotic',        priority: 'critical', sourcedFrom: 'disease_mechanism', whyShort: 'Multi-strain probiotic — IBD-microbiome support; VSL#3-style formulations have UC remission evidence' },
      { key: 'curcumin',         priority: 'critical', sourcedFrom: 'disease_mechanism', whyShort: 'Curcumin reduces colonic inflammation in mild-moderate UC trials' },
      // 2026-05-12-41: empirical Vit D for IBD = 1000 IU safe baseline. IBD
      // patients have 60% Vit D deficiency rate per evidence so it's worth
      // recommending, but at the safe empirical dose. Lab-confirmed low Vit
      // D upgrades this to 4000 IU automatically via vit_d_low rule.
      { key: 'vit_d3_1000',      priority: 'high',     sourcedFrom: 'disease_mechanism', whyShort: 'IBD patients have 60% deficiency rate; Vit D modulates Th17/Treg balance' },
      { key: 'omega3_2000',      priority: 'high',     sourcedFrom: 'disease_mechanism', whyShort: 'EPA/DHA reduce mucosal prostaglandin synthesis' },
      { key: 'vit_b12_methyl',   priority: 'moderate', sourcedFrom: 'disease_mechanism', whyShort: 'Terminal-ileum disease + biologic use → B12 malabsorption risk' },
    ],
  },
  {
    id: 'pcos',
    triggers: [{ kind: 'condition', pattern: /\bpcos\b|polycystic\s+ovar/i }],
    supplements: [{ key: 'inositol_40_1', priority: 'high', sourcedFrom: 'disease_mechanism' }],
  },
  {
    id: 'hashimoto',
    triggers: [{ kind: 'condition', pattern: /\bhashimoto|autoimmune\s+thyroid/i }],
    // 2026-05-12-41: empirical Vit D for Hashimoto uses SAFE dose 1000 IU
    // instead of therapeutic 4000 IU. 4000 IU is only fired by lab-confirmed
    // low Vit D (vit_d_low / vit_d_watch_below_40 rules). Lower empirical
    // dose avoids fat-soluble accumulation in patients whose Vit D status
    // is unknown.
    supplements: [{ key: 'vit_d3_1000', priority: 'moderate', sourcedFrom: 'disease_mechanism' }],
  },
  {
    id: 't2d',
    triggers: [{ kind: 'condition', pattern: /type\s*2\s*diabetes|t2dm/i }],
    supplements: [{ key: 'ala_600', priority: 'high', sourcedFrom: 'disease_mechanism' }],
  },
  {
    id: 'hypertension',
    triggers: [{ kind: 'condition', pattern: /hypertens|high\s+blood\s+pressure/i }],
    supplements: [{ key: 'mg_glycinate_300', priority: 'moderate', sourcedFrom: 'disease_mechanism' }],
  },
  {
    id: 'anxiety_dx',
    triggers: [{ kind: 'condition', pattern: /\b(anxiety|gad|panic)\b/i }],
    supplements: [{ key: 'l_theanine', priority: 'moderate', sourcedFrom: 'disease_mechanism' }],
  },

  // ── Symptoms ───────────────────────────────────────────────────────
  {
    id: 'fatigue_b_complex',
    triggers: [{ kind: 'symptom', pattern: /(fatigue|tired|exhaust|low energy|energy crash)/i }],
    supplements: [{ key: 'b_complex_methyl', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'fatigue_coq10_age40',
    triggers: [{ kind: 'symptom', pattern: /(fatigue|tired|exhaust|low energy|energy crash)/i }],
    gates: { ageMin: 40 },
    supplements: [{ key: 'coq10_100', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Age-related mitochondrial support' }],
  },
  {
    id: 'brain_fog',
    triggers: [{ kind: 'symptom', pattern: /(brain fog|concentrat|focus|memory)/i }],
    supplements: [
      { key: 'omega3_2000',    priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Cognitive / neural support' },
      { key: 'mg_l_threonate', priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },
  {
    id: 'mood_anxiety',
    triggers: [{ kind: 'symptom', pattern: /(mood swing|mood\s|depress|anxiety|anxious|panic|irritab)/i }],
    supplements: [
      { key: 'mg_glycinate_300', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Mood / stress modulation' },
      { key: 'omega3_2000',      priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'EPA-dominant omega-3 for mood' },
    ],
  },
  {
    id: 'insomnia',
    triggers: [{ kind: 'symptom', pattern: /(insomn|sleep onset|difficulty falling asleep|wake at night|night.?wake)/i }],
    supplements: [{ key: 'mg_glycinate_300', priority: 'high', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'constipation',
    triggers: [{ kind: 'symptom', pattern: /(constipat)/i }],
    supplements: [{ key: 'mg_citrate', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'bowel_irregularity',
    triggers: [{ kind: 'symptom', pattern: /(diarrh|loose stool|alternating bowel|ibs|irritable bowel)/i }],
    supplements: [{ key: 'probiotic', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'joint_pain',
    triggers: [{ kind: 'symptom', pattern: /(joint pain|arthriti|achy joints)/i }],
    supplements: [
      { key: 'curcumin',    priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'omega3_2000', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Joint-inflammation modulation' },
    ],
  },
  {
    id: 'headache_migraine',
    triggers: [{ kind: 'symptom', pattern: /(headache|migrain)/i }],
    supplements: [
      { key: 'mg_glycinate_400', priority: 'high', sourcedFrom: 'symptom_pattern' },
      { key: 'riboflavin_b2',    priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },
  {
    id: 'hair_loss',
    triggers: [{ kind: 'symptom', pattern: /(hair loss|hair thinning|hair shed)/i }],
    supplements: [
      { key: 'biotin_5mg', priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'zinc_15',    priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Hair-cycle support' },
    ],
  },
  {
    id: 'stress_burnout',
    triggers: [{ kind: 'symptom', pattern: /(stress|burnout|overwhelm|anxious thoughts)/i }],
    supplements: [{ key: 'ashwagandha_600', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },

  // ── Female-specific symptoms ───────────────────────────────────────
  {
    id: 'pms_cramps',
    triggers: [{ kind: 'symptom', pattern: /(pms|premenstrual|cramps|painful period|breast tender|cyclical mood)/i }],
    gates: { sex: 'female' },
    supplements: [
      { key: 'mg_glycinate_300', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'PMS / cramp reduction' },
      { key: 'vit_b6_p5p',       priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'PMS mood + bloating' },
      { key: 'vitex',            priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },
  {
    id: 'hot_flashes',
    triggers: [{ kind: 'symptom', pattern: /(hot flash|night sweat|vasomotor)/i }],
    gates: { sex: 'female' },
    supplements: [
      { key: 'black_cohosh', priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'vit_e_400',    priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },
  {
    id: 'acne_universal',
    triggers: [{ kind: 'symptom', pattern: /(acne|breakouts|pimples|cystic acne)/i }],
    supplements: [
      { key: 'zinc_30',     priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'omega3_2000', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Anti-inflammatory for acne' },
    ],
  },
  {
    id: 'acne_female_dim',
    triggers: [{ kind: 'symptom', pattern: /(acne|breakouts|pimples|cystic acne)/i }],
    gates: { sex: 'female' },
    supplements: [{ key: 'dim', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },

  // ── GI ─────────────────────────────────────────────────────────────
  {
    id: 'bloating',
    triggers: [{ kind: 'symptom', pattern: /(bloat|\bgas\b|heavy after meal|distended|abdominal distention)/i }],
    supplements: [
      { key: 'digestive_enzymes', priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'ginger',            priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },
  {
    id: 'reflux',
    triggers: [{ kind: 'symptom', pattern: /(reflux|heartburn|gerd|acid regurg|throat burn)/i }],
    supplements: [
      { key: 'dgl',         priority: 'moderate', sourcedFrom: 'symptom_pattern' },
      { key: 'melatonin_3', priority: 'moderate', sourcedFrom: 'symptom_pattern' },
    ],
  },

  // ── Sexual / immune / allergic ──────────────────────────────────────
  {
    id: 'low_libido',
    triggers: [{ kind: 'symptom', pattern: /(low libido|low sex drive|sexual dysfunction|loss of interest in sex)/i }],
    supplements: [{ key: 'maca', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'allergies',
    triggers: [{ kind: 'symptom', pattern: /(allergies|seasonal allerg|hives|hay fever|rhinitis|allergic)/i }],
    supplements: [{ key: 'quercetin', priority: 'moderate', sourcedFrom: 'symptom_pattern' }],
  },
  {
    id: 'frequent_infections',
    triggers: [{ kind: 'symptom', pattern: /(frequent infection|sick often|always sick|low immun|catch.*cold)/i }],
    supplements: [
      // 2026-05-12-41: empirical Vit D dose = 1000 IU (safe baseline).
      // Therapeutic 4000 IU only fires from lab-confirmed deficiency.
      { key: 'vit_d3_1000', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Immune-function support' },
      { key: 'zinc_15',     priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Immune-function cofactor' },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────
// 4. UNIVERSAL FOUNDATIONAL BASELINE (fires only if INDICATIONS produce
//    nothing — healthy adult, no flags, no symptoms, no conditions)
// ──────────────────────────────────────────────────────────────────────
export const FOUNDATIONAL_BASELINE: SupplementRef[] = [
  { key: 'vit_d3_1000',      priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Baseline vitamin D support' },
  { key: 'omega3_1000',      priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Baseline anti-inflammatory support' },
  { key: 'mg_glycinate_200', priority: 'moderate', sourcedFrom: 'symptom_pattern', whyShort: 'Baseline magnesium support' },
];

// ──────────────────────────────────────────────────────────────────────
// 5. THE MATCHER + EMITTER — one algorithm, runs against every user
// ──────────────────────────────────────────────────────────────────────

export interface EvaluateInput {
  age: number | null;
  sex: 'male' | 'female' | null;
  outliers: LabOutlierFact[];
  symptomsLower: string;
  conditionsLower: string;
  medsLower: string;
  depletions: DepletionFact[];
  isPregnant: boolean;
  hasShellfishAllergy: boolean;
  /** 2026-05-12-46: full labs string (lowered) including normal markers.
   *  Used to suppress nutrient-repletion supplements when the target
   *  nutrient was MEASURED and is NORMAL — even if a disease / symptom /
   *  drug trigger would otherwise fire it. "Don't supplement what's
   *  measured normal" — universal safety rule. */
  labsLower?: string;
}

export interface EvaluateOptions {
  /** Cap on the final returned stack. Default 6. */
  topN?: number;
}

/** Universal matcher. Returns candidates AFTER pregnancy/allergy filter
 *  and after priority sort + topN cap. */
export function evaluateIndications(
  input: EvaluateInput,
  opts: EvaluateOptions = {},
): SupplementCandidate[] {
  const topN = opts.topN ?? 6;
  const out: SupplementCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenNutrient = new Set<string>();

  // Normalize nutrient names for dose-variant dedup. mg_glycinate_200 +
  // mg_glycinate_300 + mg_glycinate_400 all render as "Magnesium
  // Glycinate" — only one should appear in the final stack.
  const normalizeNutrient = (s: string): string =>
    s.toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const ind of INDICATIONS) {
    // Trigger match: ANY trigger must fire.
    const triggerHit = ind.triggers.find(t => matchesTrigger(t, input));
    if (!triggerHit) continue;

    // Gates: ALL must pass.
    if (!passesGates(ind.gates, input)) continue;

    // Emit each supplement referenced by this indication.
    for (const ref of ind.supplements) {
      const base = SUPPLEMENT_BASE[ref.key];
      if (!base) continue; // unknown key — skip silently rather than crash

      // Pregnancy + allergy filters apply at emit time so we never
      // produce a candidate we'd just have to drop later.
      if (input.isPregnant && base.pregnancyContraindicated) continue;
      if (input.hasShellfishAllergy && base.fishOilLike && !/algal|algae|vegan/i.test(base.nutrient)) continue;

      // Dedup by supplement key — same supplement only added once even
      // if multiple indications fire it.
      if (seenKeys.has(ref.key)) continue;
      // Dedup by nutrient display name — catches dose-variant keys
      // (mg_glycinate_200 / _300 / _400 all = "Magnesium Glycinate").
      const normNutrient = normalizeNutrient(base.nutrient);
      if (seenNutrient.has(normNutrient)) continue;
      seenKeys.add(ref.key);
      seenNutrient.add(normNutrient);

      // Capture the severity of the triggering signal so we can pick the
      // BEST candidate per category (highest severity wins ties). Lab
      // triggers carry severityRank from the outlier; other trigger
      // kinds default to 0. Universal — applies to every candidate.
      const triggerSeverityRank = triggerSeverityFor(triggerHit, input);

      out.push({
        key: ref.key,
        emoji: base.emoji,
        nutrient: base.nutrient,
        form: base.form,
        dose: base.dose,
        timing: base.timing,
        whyShort: ref.whyShort ?? base.defaultWhyShort,
        why: ref.why ? interpolate(ref.why, triggerHit, input) : base.defaultWhy,
        category: base.category,
        priority: ref.priority ?? 'moderate',
        sourcedFrom: ref.sourcedFrom ?? 'lab_finding',
        alternatives: base.alternatives ?? [],
        practicalNote: base.practicalNote,
        evidenceNote: base.evidenceNote,
        triggerSeverityRank,
      } as SupplementCandidate);
    }
  }

  // Foundational baseline backstop — only if zero indications fired.
  if (out.length === 0) {
    for (const ref of FOUNDATIONAL_BASELINE) {
      const base = SUPPLEMENT_BASE[ref.key];
      if (!base) continue;
      if (input.isPregnant && base.pregnancyContraindicated) continue;
      if (input.hasShellfishAllergy && base.fishOilLike && !/algal|algae|vegan/i.test(base.nutrient)) continue;
      out.push({
        key: ref.key,
        emoji: base.emoji,
        nutrient: base.nutrient,
        form: base.form,
        dose: base.dose,
        timing: base.timing,
        whyShort: ref.whyShort ?? base.defaultWhyShort,
        why: base.defaultWhy,
        practicalNote: base.practicalNote,
        evidenceNote: base.evidenceNote,
        category: base.category,
        priority: ref.priority ?? 'moderate',
        sourcedFrom: ref.sourcedFrom ?? 'symptom_pattern',
        alternatives: base.alternatives ?? [],
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2026-05-12-46 — MEASURED-NORMAL SUPPRESSION (universal safety rule)
  // For nutrient-repletion supplements: if the patient's bloodwork
  // includes a measurement for the target nutrient AND that measurement
  // is NORMAL/healthy (no outlier flag), suppress the empirical
  // recommendation regardless of what trigger fired it.
  //
  // Example: IBD condition fires B12 (disease_mechanism). But if the
  // patient's labs show B12 = 600 pg/mL (normal), the engine drops the
  // B12 recommendation. "Don't supplement what's measured normal."
  //
  // EXCEPTION: lab_finding source is kept — if a lab fires the
  // supplement, the lab obviously says it's not normal.
  // ─────────────────────────────────────────────────────────────────────
  const NUTRIENT_MARKER_PATTERNS: Array<{ supplementKey: RegExp; marker: RegExp }> = [
    { supplementKey: /^vit_b12_methyl$/,            marker: /\b(b.?12|cobalamin|vitamin b.?12|vitamina b.?12)\b/i },
    { supplementKey: /^methylfolate$/,              marker: /\b(folate|folic acid|rbc folate|serum folate|folato|ácido fólico|acido folico)\b/i },
    { supplementKey: /^iron_bisglycinate$/,         marker: /\b(ferritin|ferritina)\b/i },
    { supplementKey: /^(vit_d3_1000|vit_d3_4000)$/, marker: /\b(vitamin d|vitamina d|25.?hydroxy|25.?oh|calcidiol)\b/i },
    { supplementKey: /^mg_/,                        marker: /\b(magnesium|rbc magnesium|serum magnesium|magnesio)\b/i },
    { supplementKey: /^selenium/,                   marker: /\bselenium\b/i },
    { supplementKey: /^zinc/,                       marker: /\bzinc\b/i },
    { supplementKey: /^riboflavin_b2$/,             marker: /\b(riboflavin|vitamin b.?2)\b/i },
    { supplementKey: /^vit_b6_p5p$/,                marker: /\b(vitamin b.?6|pyridoxal|b.?6 plasma)\b/i },
    { supplementKey: /^vit_e_/,                     marker: /\bvitamin e|tocopherol\b/i },
    { supplementKey: /^biotin/,                     marker: /\bbiotin\b/i },
  ];
  const labsTextLower = (input.labsLower ?? '').toLowerCase();
  const markerMeasuredNormal = (markerPattern: RegExp): boolean => {
    if (!labsTextLower) return false;
    const lines = labsTextLower.split('\n');
    for (const line of lines) {
      if (!markerPattern.test(line)) continue;
      // 2026-05-13-50: suppress on normal/healthy/optimal AS WELL AS high/critical_high.
      // Don't supplement what's measured normal — and CRITICALLY, never supplement
      // what's measured HIGH. Fat-soluble vitamins (D, A, E, K) cause real toxicity
      // when stacked on top of an already-elevated baseline. Iron toxicity if
      // ferritin already high. Mg / zinc / selenium overdose risk.
      // Real case: Vit D 104 ng/mL (high) was getting D3 1000 IU recommended —
      // would push the patient toward hypercalcemia.
      if (/\[(normal|healthy|optimal|high|critical_high|watch)\]/.test(line)) return true;
    }
    return false;
  };
  const filtered = out.filter(c => {
    // Only consider suppression for empirical sources. Lab-finding
    // means a lab fired the rule — never suppress.
    if (c.sourcedFrom === 'lab_finding') return true;
    const match = NUTRIENT_MARKER_PATTERNS.find(m => m.supplementKey.test(c.key));
    if (!match) return true; // not a nutrient-repletion supplement
    if (markerMeasuredNormal(match.marker)) return false; // measured-normal → drop
    return true;
  });
  out.length = 0;
  out.push(...filtered);

  // Sort by (priority, source). Same ordering as the legacy engine so
  // callers see consistent ranking.
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, moderate: 2 };
  const SOURCE_RANK: Record<string, number> = {
    medication_depletion: 0,
    lab_finding: 1,
    disease_mechanism: 2,
    symptom_pattern: 3,
  };
  out.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 9;
    const pb = PRIORITY_RANK[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    const sa = SOURCE_RANK[a.sourcedFrom] ?? 9;
    const sb = SOURCE_RANK[b.sourcedFrom] ?? 9;
    if (sa !== sb) return sa - sb;
    // Tiebreaker: more severe triggering outlier wins. ALT 97 (rank 50)
    // beats A1c 5.5 watch (rank 20) when both produce high+lab supplements.
    const va = a.triggerSeverityRank ?? 0;
    const vb = b.triggerSeverityRank ?? 0;
    return vb - va; // higher severity first
  });

  // CATEGORY POLICY (Evan audit, 2026-05-12-31) — UNIVERSAL:
  //
  //  • medication_depletion source: UNLIMITED. Each med-driven nutrient
  //    depletion needs its own supplement (statin → CoQ10, metformin →
  //    B12, PPI → Mg, OCP → folate). One depletion = one supplement.
  //
  //  • All other categories: exactly ONE supplement per category. The
  //    pick is the TOP of the sorted list for that category, where sort
  //    order is priority → source → triggerSeverityRank. This guarantees
  //    the most-clinically-important supplement per category lands (e.g.
  //    Milk Thistle from ALT 97 beats Berberine from A1c 5.5 watch
  //    because ALT outlier has a higher severityRank).
  //
  //  Rationale: depletions are mechanistic and stack additively (statin
  //  patient on metformin needs BOTH CoQ10 and B12). The other supplement
  //  categories are organ/system support — one well-chosen supplement per
  //  system is enough; adding two creates confusion without clinical lift.
  //
  //  Categories that allow 1 each: nutrient_repletion, sleep_stress,
  //  gut_healing, liver_metabolic, inflammation_cardio, condition_therapy.
  const balanced: SupplementCandidate[] = [];
  const seenCategories = new Set<string>();

  for (const c of out) {
    // Rule 1: keep every medication_depletion-sourced supplement (each
    // depletion needs its own counter-supplement; additive not competitive).
    if (c.sourcedFrom === 'medication_depletion') {
      balanced.push(c);
      continue;
    }
    // Rule 2 (2026-05-12-40): lab-confirmed nutrient repletion is ALSO
    // additive — never override another nutrient_repletion supplement.
    // A confirmed low folate AND a confirmed low Vit D AND a confirmed
    // low B12 are three separate objective deficiencies, each needs its
    // own counter-supplement. They do not "compete" for a category slot
    // because each addresses a different specific deficiency the patient
    // measurably has. This matches the unlimited-depletions principle:
    // every objective signal gets its own supplement.
    if (c.category === 'nutrient_repletion' && c.sourcedFrom === 'lab_finding') {
      balanced.push(c);
      continue;
    }
    // Rule 3: one supplement per non-depletion / non-lab-repletion
    // category. Because `out` is sorted (priority → source → severity),
    // the FIRST entry seen for each category is the best fit.
    const cat = c.category ?? 'unspecified';
    if (seenCategories.has(cat)) continue;
    balanced.push(c);
    seenCategories.add(cat);
  }

  // Safety cap — should rarely fire since the natural limit is
  // 1 (per category) × 6 (categories) + N depletions.
  if (balanced.length > topN && topN > 0) {
    return balanced.slice(0, topN);
  }
  return balanced;
}

// ──────────────────────────────────────────────────────────────────────
// 6. INTERNAL — trigger/gate matchers
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns the severity rank of the outlier that fired this trigger, or
 * 0 if non-lab trigger (condition / symptom / medication). Used as a
 * tiebreaker so the supplement driven by the most-severe lab wins when
 * priority + source are equal (e.g. ALT 97 critical_high beats A1c 5.5
 * watch even though both produce a high-priority lab_finding candidate).
 */
function triggerSeverityFor(t: Trigger, input: EvaluateInput): number {
  if (t.kind !== 'lab' || !t.marker) return 0;
  const matched = input.outliers.find(o => t.marker!.test(o.marker));
  return matched?.severityRank ?? 0;
}

function matchesTrigger(t: Trigger, input: EvaluateInput): boolean {
  switch (t.kind) {
    case 'lab': {
      if (!t.marker || !t.states) return false;
      const matching = input.outliers.find(o => t.marker!.test(o.marker));
      if (!matching) return false;
      const flag = String(matching.flag ?? '').toLowerCase();
      const stateOk = t.states.some(s => stateMatches(s, flag));
      if (!stateOk) return false;
      if (t.valueThreshold) {
        const { op, value } = t.valueThreshold;
        const v = matching.value;
        if (op === '<'  && !(v <  value)) return false;
        if (op === '<=' && !(v <= value)) return false;
        if (op === '>'  && !(v >  value)) return false;
        if (op === '>=' && !(v >= value)) return false;
      }
      return true;
    }
    case 'symptom':
      return !!t.pattern && t.pattern.test(input.symptomsLower);
    case 'condition':
      return !!t.pattern && t.pattern.test(input.conditionsLower);
    case 'medication':
      // Medication trigger matches if the depletion list has an entry
      // for this medClass. Universal — depletionRules.ts has already
      // mapped med text to canonical classes.
      return !!t.medClass && input.depletions.some(d => d.medClass === t.medClass);
  }
}

function stateMatches(want: FlagState, actual: string): boolean {
  if (want === 'any_high') return actual === 'high' || actual === 'critical_high';
  if (want === 'any_low')  return actual === 'low'  || actual === 'critical_low';
  if (want === 'any_outlier') return actual !== '' && actual !== 'normal' && actual !== 'healthy' && actual !== 'optimal';
  return actual === want;
}

function passesGates(gates: IndicationGate | undefined, input: EvaluateInput): boolean {
  if (!gates) return true;
  if (gates.sex && input.sex !== gates.sex) return false;
  if (gates.ageMin !== undefined && (input.age ?? 0) < gates.ageMin) return false;
  if (gates.ageMax !== undefined && (input.age ?? 0) > gates.ageMax) return false;
  return true;
}

function interpolate(template: string, trigger: Trigger, input: EvaluateInput): string {
  // Allow simple {marker} / {value} / {flag} substitutions in
  // indication-level `why` overrides. Lab triggers only.
  if (trigger.kind !== 'lab' || !trigger.marker) return template;
  const matching = input.outliers.find(o => trigger.marker!.test(o.marker));
  if (!matching) return template;
  return template
    .replace(/\{marker\}/g, matching.marker)
    .replace(/\{value\}/g, String(matching.value))
    .replace(/\{flag\}/g,  String(matching.flag));
}
