// supabase/functions/_shared/rules/depletionRules.ts
//
// MEDICATION → NUTRIENT DEPLETION TABLE
// =====================================
// Deterministic mapping from common Rx classes to the nutrients they
// deplete. Sources: Linus Pauling Institute, Drug-Induced Nutrient
// Depletions and Associated Symptoms (Pelton/LaValle 2012), Medscape
// drug-nutrient interaction tables.
//
// Universal rule: if a depletion fires, the supplement engine sees it
// and may recommend repletion. The narrative AI explains the link.

import { isOnMed } from '../medicationAliases.ts';

export interface DepletionFact {
  medClass: string;          // canonical key from medicationAliases
  /** Concrete symptoms a patient would actually feel from this depletion.
   *  Used by the Medications tab to show "Clinical Effects" chips. */
  clinicalEffects?: string[];
  /** Stable key to the matching counter-supplement in SUPPLEMENT_BASE.
   *  Lets the UI look up dose / form / timing / practical-note without
   *  duplicating that data here. Optional — falls back to generic prose
   *  when the supplement isn't in the registry. */
  recommendedSupplementKey?: string;
  medsMatched: string[];     // user's actual med names that matched
  nutrient: string;          // what's depleted
  mechanism: string;         // 1-line plain English
  monitoringTest: string | null;  // canonical retest key, if a test exists
  severity: 'high' | 'moderate' | 'low';
}

interface Input {
  medsLower: string;
  medsList: string[];
}

interface Rule {
  medClass: string;
  nutrient: string;
  mechanism: string;
  monitoringTest: string | null;
  severity: 'high' | 'moderate' | 'low';
  clinicalEffects?: string[];
  recommendedSupplementKey?: string;
}

const DEPLETION_RULES: Rule[] = [
  // Statins → CoQ10 (universal)
  { medClass: 'statin', nutrient: 'CoQ10', mechanism: 'Statins block HMG-CoA reductase, the same enzyme that produces CoQ10. Depletion drives muscle pain + fatigue.', monitoringTest: null, severity: 'high', clinicalEffects: ['Muscle pain or weakness', 'Exercise intolerance', 'Fatigue', 'Possible heart strain'], recommendedSupplementKey: 'coq10_100' },

  // Mesalamine / 5-ASA → folate
  { medClass: 'mesalamine_5asa', nutrient: 'Folate', mechanism: '5-ASA inhibits dihydrofolate reductase and blocks intestinal folate absorption. Long-term users develop functional deficiency.', monitoringTest: 'folate_workup', severity: 'high', clinicalEffects: ['Elevated homocysteine on labs', 'Anemia (macrocytic)', 'Hair thinning', 'Pregnancy / NTD risk if low'], recommendedSupplementKey: 'methylfolate' },

  // Metformin → B12 + folate
  { medClass: 'metformin', nutrient: 'Vitamin B12', mechanism: 'Metformin reduces ileal B12 absorption — 10–30% of long-term users develop deficiency, often missed on serum B12 alone.', monitoringTest: 'vit_b12_workup', severity: 'high', clinicalEffects: ['Numbness or tingling in hands/feet', 'Anemia', 'Brain fog', 'Elevated homocysteine'], recommendedSupplementKey: 'vit_b12_methyl' },
  { medClass: 'metformin', nutrient: 'Folate', mechanism: 'Metformin lowers serum folate alongside B12. Combined deficiency drives elevated homocysteine.', monitoringTest: 'folate_workup', severity: 'moderate', clinicalEffects: ['Elevated homocysteine', 'Cardiovascular risk', 'Anemia'], recommendedSupplementKey: 'methylfolate' },

  // PPIs → B12, magnesium, calcium
  { medClass: 'ppi', nutrient: 'Vitamin B12', mechanism: 'PPIs suppress gastric acid → reduced cleavage of dietary B12 from food protein. Long-term use linked to deficiency + dementia risk.', monitoringTest: 'vit_b12_workup', severity: 'high', clinicalEffects: ['Numbness or tingling', 'Anemia', 'Brain fog', 'Fatigue', 'Low mood'], recommendedSupplementKey: 'vit_b12_methyl' },
  { medClass: 'ppi', nutrient: 'Magnesium', mechanism: 'Long-term PPI use (>1 yr) impairs intestinal magnesium absorption. FDA black-box warning issued 2011.', monitoringTest: 'rbc_magnesium', severity: 'moderate', clinicalEffects: ['Muscle cramps', 'Irregular heartbeat', 'Low calcium symptoms', 'Sleep disturbance'], recommendedSupplementKey: 'mg_glycinate_300' },

  // Thiazide diuretics → potassium, magnesium, zinc
  { medClass: 'diuretic_thiazide', nutrient: 'Potassium', mechanism: 'Thiazides increase urinary K+ excretion. Hypokalemia drives arrhythmia + muscle cramps.', monitoringTest: 'cmp', severity: 'high', clinicalEffects: ['Muscle cramps', 'Arrhythmia risk', 'Weakness', 'Fatigue'] },
  { medClass: 'diuretic_thiazide', nutrient: 'Magnesium', mechanism: 'Thiazides increase urinary Mg loss alongside K+. Often co-deficient.', monitoringTest: 'rbc_magnesium', severity: 'moderate', clinicalEffects: ['Muscle cramps', 'Sleep disturbance', 'Arrhythmia risk'], recommendedSupplementKey: 'mg_glycinate_300' },

  // Loop diuretics → potassium, magnesium, B1
  { medClass: 'diuretic_loop', nutrient: 'Potassium', mechanism: 'Loop diuretics drive aggressive K+ wasting — more pronounced than thiazides.', monitoringTest: 'cmp', severity: 'high', clinicalEffects: ['Severe muscle cramps', 'Arrhythmia risk', 'Profound weakness'] },
  { medClass: 'diuretic_loop', nutrient: 'Thiamine (B1)', mechanism: 'Furosemide depletes thiamine, especially in heart-failure patients. Linked to high-output cardiac failure if severe.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Worsening heart failure symptoms', 'Fatigue', 'Cognitive complaints'], recommendedSupplementKey: 'b_complex_methyl' },

  // Oral steroids → vitamin D, calcium, potassium, B6
  { medClass: 'steroid_oral', nutrient: 'Vitamin D', mechanism: 'Glucocorticoids suppress intestinal calcium absorption + 1-α-hydroxylation. Drives osteoporosis risk on chronic use.', monitoringTest: 'vit_d_25oh', severity: 'high', clinicalEffects: ['Bone density loss', 'Higher infection rate', 'Muscle weakness'], recommendedSupplementKey: 'vit_d3_4000' },
  { medClass: 'steroid_oral', nutrient: 'Calcium', mechanism: 'Steroids reduce calcium absorption + increase urinary excretion. Bone-density loss within 6 months.', monitoringTest: 'ionized_calcium', severity: 'high', clinicalEffects: ['Osteoporosis risk', 'Bone fractures', 'Muscle cramps'] },

  // SSRIs → sodium (SIADH risk in elderly), B6/folate (functional)
  { medClass: 'ssri', nutrient: 'Sodium', mechanism: 'SSRIs occasionally cause SIADH (hyponatremia), especially in older adults — check Na on annual labs.', monitoringTest: 'cmp', severity: 'low', clinicalEffects: ['Confusion (elderly)', 'Headache', 'Nausea', 'Seizures if severe'] },

  // Anticoagulants (warfarin) → vitamin K balance
  { medClass: 'anticoagulant', nutrient: 'Vitamin K (balance, not depletion)', mechanism: 'Warfarin antagonizes Vitamin K — diet stability matters more than supplementation. Sudden K changes shift INR.', monitoringTest: 'inr_if_warfarin', severity: 'moderate', clinicalEffects: ['Diet variability shifts INR', 'Bruising', 'Bleeding risk if K varies'] },

  // Levothyroxine + iron interaction (depletes effective dose if co-administered)
  { medClass: 'thyroid_replacement', nutrient: 'Iron / Calcium / PPI separation', mechanism: 'Levothyroxine binds iron + calcium + PPI in gut → reduces absorption. Take 4 hours apart.', monitoringTest: 'thyroid_panel', severity: 'moderate', clinicalEffects: ['Reduced levothyroxine absorption', 'Rising TSH despite adequate dose'] },

  // GLP-1 agonists → B12 (lower stomach acid + slowed gastric emptying)
  { medClass: 'glp1', nutrient: 'Vitamin B12', mechanism: 'GLP-1 agonists slow gastric emptying + may reduce B12 absorption over months of use.', monitoringTest: 'vit_b12_workup', severity: 'low', clinicalEffects: ['Mild fatigue', 'Subtle cognitive complaints over months'], recommendedSupplementKey: 'vit_b12_methyl' },

  // ── Hormonal contraception → folate, B6, B12, magnesium, zinc, CoQ10
  // Well-documented OCP depletions (Palmery 2013, Wynn 1975, McArthur 1992).
  // Fires for combined OCPs, progestin-only, patch, ring, implant, and
  // hormonal IUDs. Universal across every female user reporting any
  // hormonal contraceptive in their med list.
  { medClass: 'hormonal_contraceptive', nutrient: 'Folate', mechanism: 'Hormonal contraceptives lower serum + RBC folate by 20–40%. Particularly important for any user considering pregnancy in the next 12 months.', monitoringTest: 'folate_workup', severity: 'high', clinicalEffects: ['Mood symptoms', 'Pregnancy risk', 'Elevated homocysteine'], recommendedSupplementKey: 'methylfolate' },
  { medClass: 'hormonal_contraceptive', nutrient: 'Vitamin B6', mechanism: 'Estrogen-based contraceptives compete with B6 for the same enzymatic pathways, driving functional deficiency that contributes to mood symptoms.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Mood symptoms (especially depression)', 'PMS-like symptoms despite OCP'], recommendedSupplementKey: 'vit_b6_p5p' },
  { medClass: 'hormonal_contraceptive', nutrient: 'Vitamin B12', mechanism: 'OCP use lowers serum B12 alongside folate. Effect is reversible on discontinuation but matters during use.', monitoringTest: 'vit_b12_workup', severity: 'moderate', clinicalEffects: ['Fatigue', 'Brain fog', 'Reversible on discontinuation'], recommendedSupplementKey: 'vit_b12_methyl' },
  { medClass: 'hormonal_contraceptive', nutrient: 'Magnesium', mechanism: 'Estrogen alters magnesium handling; long-term OCP users trend toward functional Mg deficiency that contributes to cramps and headaches.', monitoringTest: 'rbc_magnesium', severity: 'moderate', clinicalEffects: ['Cramps', 'Headaches', 'Sleep disturbance'], recommendedSupplementKey: 'mg_glycinate_300' },
  { medClass: 'hormonal_contraceptive', nutrient: 'Zinc', mechanism: 'Lower serum zinc has been documented in OCP users; relevant for skin, immune function, and hair health.', monitoringTest: null, severity: 'low', clinicalEffects: ['Skin breakouts', 'Frequent infections', 'Hair thinning'], recommendedSupplementKey: 'zinc_15' },
  { medClass: 'hormonal_contraceptive', nutrient: 'CoQ10', mechanism: 'OCP use lowers serum CoQ10 in supplementation trials; relevant for energy and cardiovascular protection.', monitoringTest: null, severity: 'low', clinicalEffects: ['Mild fatigue', 'Exercise intolerance'], recommendedSupplementKey: 'coq10_100' },

  // ── Methotrexate → folate
  // Direct folate antagonist. Folate co-prescription is standard of care
  // in rheumatology to reduce MTX side-effects, but the depletion is
  // universal across MTX users regardless of indication (IBD, psoriasis,
  // RA, ectopic, etc.).
  { medClass: 'methotrexate', nutrient: 'Folate', mechanism: 'Methotrexate directly inhibits dihydrofolate reductase. Folate co-supplementation (typically 1 mg/day or weekly 5 mg) reduces side effects and is standard of care alongside MTX.', monitoringTest: 'folate_workup', severity: 'high', clinicalEffects: ['Mouth sores', 'GI upset', 'Anemia', 'Liver strain', 'Hair loss'], recommendedSupplementKey: 'methylfolate' },

  // ── PPIs → calcium (added to the existing B12/Mg coverage)
  { medClass: 'ppi', nutrient: 'Calcium', mechanism: 'PPIs reduce gastric acid → impaired ionized calcium absorption. Linked to increased hip-fracture risk on long-term use (FDA warning 2010).', monitoringTest: 'ionized_calcium', severity: 'moderate', clinicalEffects: ['Higher fracture risk over time', 'Bone density loss'] },

  // ── Beta blockers → CoQ10 + melatonin
  { medClass: 'beta_blocker', nutrient: 'CoQ10', mechanism: 'Beta blockers (especially propranolol, metoprolol) inhibit CoQ10-dependent enzymes — exacerbates fatigue + exercise intolerance on chronic use.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Fatigue', 'Exercise intolerance', 'Cold extremities'], recommendedSupplementKey: 'coq10_100' },
  { medClass: 'beta_blocker', nutrient: 'Melatonin', mechanism: 'Beta blockers suppress nocturnal melatonin synthesis → contributes to the insomnia/vivid-dream side effects commonly reported.', monitoringTest: null, severity: 'low', clinicalEffects: ['Insomnia', 'Vivid dreams', 'Difficulty falling asleep'] },

  // ── Anticonvulsants → vitamin D, K, folate, B6
  { medClass: 'anticonvulsant', nutrient: 'Vitamin D', mechanism: 'Phenytoin, carbamazepine, phenobarbital, valproate induce hepatic CYP enzymes that catabolize 25-OH-D faster — accelerated bone loss documented within 12 months.', monitoringTest: 'vit_d_25oh', severity: 'high', clinicalEffects: ['Bone density loss', 'Fracture risk', 'Muscle weakness'], recommendedSupplementKey: 'vit_d3_4000' },
  { medClass: 'anticonvulsant', nutrient: 'Folate', mechanism: 'Long-term anticonvulsants lower serum folate; relevant for any patient of reproductive age (NTD prevention).', monitoringTest: 'folate_workup', severity: 'high', clinicalEffects: ['Elevated homocysteine', 'Pregnancy / NTD risk'], recommendedSupplementKey: 'methylfolate' },
  { medClass: 'anticonvulsant', nutrient: 'Vitamin K', mechanism: 'CYP-inducing anticonvulsants accelerate Vit K catabolism — relevant for newborns of treated mothers + bone health long-term.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Newborn bleeding risk if pregnant', 'Long-term bone health'] },

  // ── Levodopa / carbidopa → vitamin B6 + iron
  { medClass: 'levodopa', nutrient: 'Vitamin B6', mechanism: 'B6 accelerates peripheral decarboxylation of levodopa — high B6 intake REDUCES drug efficacy. Patients should avoid B6 supplementation while on levodopa.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Reduced drug efficacy if B6 high', 'Wearing-off effects'] },

  // ── Digoxin → magnesium + potassium (toxicity amplifier)
  { medClass: 'digoxin', nutrient: 'Magnesium', mechanism: 'Hypomagnesemia dramatically amplifies digoxin toxicity (arrhythmia risk). Mg + K must be monitored aggressively.', monitoringTest: 'rbc_magnesium', severity: 'high', clinicalEffects: ['Arrhythmia risk (amplifies digoxin toxicity)', 'Cramps', 'Weakness'], recommendedSupplementKey: 'mg_glycinate_300' },
  { medClass: 'digoxin', nutrient: 'Potassium', mechanism: 'Hypokalemia amplifies digoxin toxicity — common combo with concurrent diuretic therapy.', monitoringTest: 'cmp', severity: 'high', clinicalEffects: ['Severe arrhythmia risk', 'Toxicity amplification'] },

  // ── ACE inhibitors / ARBs → zinc
  { medClass: 'ace_inhibitor', nutrient: 'Zinc', mechanism: 'ACE inhibitors chelate zinc — long-term use linked to depressed serum zinc + altered taste/dysgeusia side effect.', monitoringTest: null, severity: 'low', clinicalEffects: ['Altered taste / dysgeusia', 'Slow wound healing', 'Hair thinning'], recommendedSupplementKey: 'zinc_15' },

  // ── Long-term antibiotics → microbiome / B vitamins
  { medClass: 'antibiotic_long_term', nutrient: 'B-Complex (microbiome-derived)', mechanism: 'Prolonged antibiotic exposure depletes gut flora that synthesize B vitamins (especially B12, biotin, K2). Probiotic restoration + B-complex during/after recommended.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Fatigue', 'Mood symptoms', 'Skin changes'], recommendedSupplementKey: 'b_complex_methyl' },

  // ── SGLT2 inhibitors → volume + magnesium
  { medClass: 'sglt2', nutrient: 'Magnesium', mechanism: 'SGLT2 inhibitors (empagliflozin, dapagliflozin) cause modest Mg wasting via osmotic diuresis. Monitor on long-term use.', monitoringTest: 'rbc_magnesium', severity: 'low', clinicalEffects: ['Mild cramps on chronic use'], recommendedSupplementKey: 'mg_glycinate_300' },

  // ── Bile-acid sequestrants → fat-soluble vitamins
  { medClass: 'bile_acid_sequestrant', nutrient: 'Fat-soluble vitamins (A, D, E, K)', mechanism: 'Cholestyramine / colesevelam bind bile salts → impaired fat-soluble vitamin absorption. Take other meds 1 hr before or 4 hr after.', monitoringTest: 'vit_d_25oh', severity: 'moderate', clinicalEffects: ['Bone density loss', 'Vision changes severe cases', 'Bleeding tendency'], recommendedSupplementKey: 'vit_d3_4000' },

  // ── Allopurinol → no major depletion but iron interaction
  { medClass: 'allopurinol', nutrient: 'Iron absorption alteration', mechanism: 'Allopurinol can increase iron absorption slightly + alter uric acid handling; relevant for patients with concurrent hemochromatosis risk.', monitoringTest: 'iron_panel', severity: 'low', clinicalEffects: ['Relevant only for hemochromatosis patients'] },

  // ────────────────────────────────────────────────────────────────────
  // UNIVERSAL EXPANSION — 2026-05-12-33
  // Closing the gap between the 44 MED_CLASSES in medicationAliases and
  // the depletion library. Each rule below is evidence-based and applies
  // to every user on that drug class, never patient-specific.
  // ────────────────────────────────────────────────────────────────────

  // ── Fibrates → CoQ10, homocysteine elevators
  { medClass: 'fibrate', nutrient: 'CoQ10', mechanism: 'Fibrates inhibit HMG-CoA reductase pathway downstream of statins → similar CoQ10 depletion mechanism. Relevant for muscle pain or fatigue on therapy.', monitoringTest: 'ck_if_muscle_symptoms', severity: 'moderate', clinicalEffects: ['Muscle pain', 'Fatigue', 'Exercise intolerance'], recommendedSupplementKey: 'coq10_100' },
  { medClass: 'fibrate', nutrient: 'Homocysteine elevation (B6/B12/Folate)', mechanism: 'Fibrates (gemfibrozil, fenofibrate) raise homocysteine 20-40% via interference with B-vitamin metabolism. Co-supplementation reduces the rise.', monitoringTest: 'homocysteine', severity: 'moderate', clinicalEffects: ['Elevated homocysteine on labs', 'Long-term CV risk'], recommendedSupplementKey: 'b_complex_methyl' },

  // ── H2 blockers → B12 (milder than PPI but real on long-term use)
  { medClass: 'h2_blocker', nutrient: 'Vitamin B12', mechanism: 'H2 blockers (famotidine, ranitidine, cimetidine) suppress gastric acid 50-70% → impaired B12 cleavage from food. Less severe than PPIs but measurable on >2-year use.', monitoringTest: 'vit_b12_workup', severity: 'low', clinicalEffects: ['Mild fatigue', 'Brain fog long-term use'], recommendedSupplementKey: 'vit_b12_methyl' },

  // ── ARBs → zinc (milder than ACE)
  { medClass: 'arb', nutrient: 'Zinc', mechanism: 'ARBs (losartan, valsartan, telmisartan) modestly lower serum zinc on long-term use, similar mechanism to ACE inhibitors but lower magnitude.', monitoringTest: null, severity: 'low', clinicalEffects: ['Mild taste changes', 'Skin sensitivity'], recommendedSupplementKey: 'zinc_15' },

  // ── Calcium channel blockers → magnesium (chronic use)
  { medClass: 'ccb', nutrient: 'Magnesium', mechanism: 'Dihydropyridine CCBs (amlodipine, nifedipine) compete with Mg at vascular L-type channels; chronic use linked to relative Mg depletion + ankle edema.', monitoringTest: 'rbc_magnesium', severity: 'low', clinicalEffects: ['Ankle edema', 'Mild cramps'], recommendedSupplementKey: 'mg_glycinate_300' },

  // ── SNRI → sodium (SIADH risk like SSRI)
  { medClass: 'snri', nutrient: 'Sodium', mechanism: 'SNRIs (venlafaxine, duloxetine, desvenlafaxine) occasionally cause SIADH (hyponatremia) similar to SSRIs, especially in older adults.', monitoringTest: 'cmp', severity: 'low', clinicalEffects: ['Confusion / disorientation', 'Headache', 'Nausea'] },

  // ── TCA → CoQ10
  { medClass: 'tca', nutrient: 'CoQ10', mechanism: 'Tricyclics (amitriptyline, nortriptyline, imipramine) inhibit mitochondrial CoQ-dependent enzymes — relevant for fatigue, orthostatic hypotension, and cardiac side effects.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Fatigue', 'Orthostatic hypotension', 'Cardiac side effects'], recommendedSupplementKey: 'coq10_100' },
  { medClass: 'tca', nutrient: 'Vitamin B2 (Riboflavin)', mechanism: 'TCAs reduce B2 absorption + utilization; co-supplementation has shown benefit for the headache indication.', monitoringTest: null, severity: 'low', clinicalEffects: ['Migraine prevention helped by repletion'], recommendedSupplementKey: 'riboflavin_b2' },

  // ── Benzodiazepines → melatonin (suppression of natural cycle)
  { medClass: 'benzodiazepine', nutrient: 'Melatonin', mechanism: 'Long-term benzo use suppresses endogenous melatonin synthesis. Withdrawal often unmasks insomnia until melatonin recovers (months).', monitoringTest: null, severity: 'low', clinicalEffects: ['Rebound insomnia after withdrawal', 'Sleep architecture disruption'] },

  // ── Inhaled steroids → vitamin D (high-dose chronic use)
  { medClass: 'inhaled_steroid', nutrient: 'Vitamin D', mechanism: 'High-dose inhaled corticosteroids (fluticasone, budesonide) accelerate 25-OH-D catabolism on chronic use. Smaller effect than oral steroids but measurable.', monitoringTest: 'vit_d_25oh', severity: 'low', clinicalEffects: ['Modest bone density effect on chronic high-dose use'], recommendedSupplementKey: 'vit_d3_4000' },

  // ── HRT estrogen (similar to OCP for folate/B6/Mg)
  { medClass: 'hrt_estrogen', nutrient: 'Folate', mechanism: 'Exogenous estrogen lowers serum + RBC folate 20-30% via same mechanism as oral contraceptives. Relevant for cardiovascular and bone health.', monitoringTest: 'folate_workup', severity: 'moderate', clinicalEffects: ['Cardiovascular risk', 'Mood symptoms'], recommendedSupplementKey: 'methylfolate' },
  { medClass: 'hrt_estrogen', nutrient: 'Vitamin B6', mechanism: 'Estrogen competes with B6 for the same enzymatic pathways — functional B6 deficiency contributes to mood symptoms.', monitoringTest: null, severity: 'low', clinicalEffects: ['Mood symptoms', 'Mild fatigue'], recommendedSupplementKey: 'vit_b6_p5p' },
  { medClass: 'hrt_estrogen', nutrient: 'Magnesium', mechanism: 'Estrogen alters magnesium handling; long-term HRT users trend toward functional Mg deficiency.', monitoringTest: 'rbc_magnesium', severity: 'low', clinicalEffects: ['Cramps', 'Headaches'], recommendedSupplementKey: 'mg_glycinate_300' },

  // ── Antithyroid → selenium
  { medClass: 'antithyroid', nutrient: 'Selenium', mechanism: 'Antithyroid drugs (methimazole, PTU) work alongside selenium-dependent deiodinases. Repletion has shown faster TSH normalization in Graves patients.', monitoringTest: null, severity: 'moderate', clinicalEffects: ['Slower TSH normalization', 'Eye symptoms (Graves)'], recommendedSupplementKey: 'selenium_200' },

  // ── Sulfonylureas → CoQ10 (mild, via mitochondrial K-ATP channels)
  { medClass: 'sulfonylurea', nutrient: 'CoQ10', mechanism: 'Sulfonylureas close mitochondrial K-ATP channels, modestly affecting CoQ-dependent electron transport. Relevant for fatigue complaints.', monitoringTest: null, severity: 'low', clinicalEffects: ['Mild fatigue', 'Exercise intolerance'], recommendedSupplementKey: 'coq10_100' },

  // ── Insulin → magnesium (intensive control hypomagnesemia)
  { medClass: 'insulin', nutrient: 'Magnesium', mechanism: 'Intensive insulin therapy shifts Mg intracellularly; chronic users have a 10-20% lower serum Mg than non-diabetic controls. Mg deficiency worsens insulin resistance.', monitoringTest: 'rbc_magnesium', severity: 'moderate', clinicalEffects: ['Worsening insulin resistance', 'Cramps', 'Sleep disturbance'], recommendedSupplementKey: 'mg_glycinate_300' },

  // ── Biologic IBD (anti-TNF / IL-23 / integrin inhibitors)
  { medClass: 'biologic_ibd', nutrient: 'Vitamin D', mechanism: 'IBD patients on biologics still have 50-60% Vit D deficiency rate; the biologic does not correct underlying malabsorption. Vit D modulates Th17/Treg balance and supports disease control.', monitoringTest: 'vit_d_25oh', severity: 'high', clinicalEffects: ['Reduced disease control', 'Higher infection rate', 'Bone density loss'], recommendedSupplementKey: 'vit_d3_4000' },
];

export function buildDepletionList(input: Input): DepletionFact[] {
  const out: DepletionFact[] = [];
  for (const rule of DEPLETION_RULES) {
    if (!isOnMed(input.medsLower, rule.medClass)) continue;
    const matched = matchedMedNames(input.medsList, rule.medClass, input.medsLower);
    out.push({
      medClass: rule.medClass,
      medsMatched: matched,
      nutrient: rule.nutrient,
      mechanism: rule.mechanism,
      monitoringTest: rule.monitoringTest,
      severity: rule.severity,
      clinicalEffects: rule.clinicalEffects,
      recommendedSupplementKey: rule.recommendedSupplementKey,
    });
  }
  return out;
}

// Try to identify which of the user's actual med names triggered the rule.
// Best-effort — falls back to the medClass key if we can't pinpoint.
function matchedMedNames(meds: string[], medClass: string, medsLower: string): string[] {
  const out: string[] = [];
  for (const m of meds) {
    if (isOnMed(m.toLowerCase(), medClass)) out.push(m);
  }
  return out.length ? out : [medClass];
}
