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
}

const DEPLETION_RULES: Rule[] = [
  // Statins → CoQ10 (universal)
  { medClass: 'statin', nutrient: 'CoQ10', mechanism: 'Statins block HMG-CoA reductase, the same enzyme that produces CoQ10. Depletion drives muscle pain + fatigue.', monitoringTest: null, severity: 'high' },

  // Mesalamine / 5-ASA → folate
  { medClass: 'mesalamine_5asa', nutrient: 'Folate', mechanism: '5-ASA inhibits dihydrofolate reductase and blocks intestinal folate absorption. Long-term users develop functional deficiency.', monitoringTest: 'folate_workup', severity: 'high' },

  // Metformin → B12 + folate
  { medClass: 'metformin', nutrient: 'Vitamin B12', mechanism: 'Metformin reduces ileal B12 absorption — 10–30% of long-term users develop deficiency, often missed on serum B12 alone.', monitoringTest: 'vit_b12_workup', severity: 'high' },
  { medClass: 'metformin', nutrient: 'Folate', mechanism: 'Metformin lowers serum folate alongside B12. Combined deficiency drives elevated homocysteine.', monitoringTest: 'folate_workup', severity: 'moderate' },

  // PPIs → B12, magnesium, calcium
  { medClass: 'ppi', nutrient: 'Vitamin B12', mechanism: 'PPIs suppress gastric acid → reduced cleavage of dietary B12 from food protein. Long-term use linked to deficiency + dementia risk.', monitoringTest: 'vit_b12_workup', severity: 'high' },
  { medClass: 'ppi', nutrient: 'Magnesium', mechanism: 'Long-term PPI use (>1 yr) impairs intestinal magnesium absorption. FDA black-box warning issued 2011.', monitoringTest: 'rbc_magnesium', severity: 'moderate' },

  // Thiazide diuretics → potassium, magnesium, zinc
  { medClass: 'diuretic_thiazide', nutrient: 'Potassium', mechanism: 'Thiazides increase urinary K+ excretion. Hypokalemia drives arrhythmia + muscle cramps.', monitoringTest: 'cmp', severity: 'high' },
  { medClass: 'diuretic_thiazide', nutrient: 'Magnesium', mechanism: 'Thiazides increase urinary Mg loss alongside K+. Often co-deficient.', monitoringTest: 'rbc_magnesium', severity: 'moderate' },

  // Loop diuretics → potassium, magnesium, B1
  { medClass: 'diuretic_loop', nutrient: 'Potassium', mechanism: 'Loop diuretics drive aggressive K+ wasting — more pronounced than thiazides.', monitoringTest: 'cmp', severity: 'high' },
  { medClass: 'diuretic_loop', nutrient: 'Thiamine (B1)', mechanism: 'Furosemide depletes thiamine, especially in heart-failure patients. Linked to high-output cardiac failure if severe.', monitoringTest: null, severity: 'moderate' },

  // Oral steroids → vitamin D, calcium, potassium, B6
  { medClass: 'steroid_oral', nutrient: 'Vitamin D', mechanism: 'Glucocorticoids suppress intestinal calcium absorption + 1-α-hydroxylation. Drives osteoporosis risk on chronic use.', monitoringTest: 'vit_d_25oh', severity: 'high' },
  { medClass: 'steroid_oral', nutrient: 'Calcium', mechanism: 'Steroids reduce calcium absorption + increase urinary excretion. Bone-density loss within 6 months.', monitoringTest: 'ionized_calcium', severity: 'high' },

  // SSRIs → sodium (SIADH risk in elderly), B6/folate (functional)
  { medClass: 'ssri', nutrient: 'Sodium', mechanism: 'SSRIs occasionally cause SIADH (hyponatremia), especially in older adults — check Na on annual labs.', monitoringTest: 'cmp', severity: 'low' },

  // Anticoagulants (warfarin) → vitamin K balance
  { medClass: 'anticoagulant', nutrient: 'Vitamin K (balance, not depletion)', mechanism: 'Warfarin antagonizes Vitamin K — diet stability matters more than supplementation. Sudden K changes shift INR.', monitoringTest: 'inr_if_warfarin', severity: 'moderate' },

  // Levothyroxine + iron interaction (depletes effective dose if co-administered)
  { medClass: 'thyroid_replacement', nutrient: 'Iron / Calcium / PPI separation', mechanism: 'Levothyroxine binds iron + calcium + PPI in gut → reduces absorption. Take 4 hours apart.', monitoringTest: 'thyroid_panel', severity: 'moderate' },

  // GLP-1 agonists → B12 (lower stomach acid + slowed gastric emptying)
  { medClass: 'glp1', nutrient: 'Vitamin B12', mechanism: 'GLP-1 agonists slow gastric emptying + may reduce B12 absorption over months of use.', monitoringTest: 'vit_b12_workup', severity: 'low' },
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
