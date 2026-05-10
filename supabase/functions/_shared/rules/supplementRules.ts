// supabase/functions/_shared/rules/supplementRules.ts
//
// DETERMINISTIC SUPPLEMENT CANDIDATE BUILDER
// ==========================================
// For every (depletion + lab outlier + condition pattern), produce a
// SupplementCandidate with everything except the rationale prose. The
// narrative AI fills only `practical_note` + `evidence_note` — names,
// doses, timing, categories are deterministic.
//
// Rules:
//   1. Each med depletion fires its repletion supplement.
//   2. Each lab outlier with a known repletion fires the supplement.
//   3. Condition-driven (UC → glutamine, T2D → berberine consideration).
//   4. Allergy filter: shellfish → no fish oil; pregnancy → no kava etc.

import type { DepletionFact } from './depletionRules.ts';
import type { LabOutlierFact } from '../buildPlan.ts';

export interface SupplementCandidate {
  /** Stable cross-surface key. Same supplement → same key on lab analysis,
   * wellness plan, doctor prep. Examples: 'coq10_ubiquinol',
   * 'vit_d3_4000', 'omega3_high_dose', 'methylfolate_5mthf',
   * 'mg_glycinate', 'milk_thistle_silymarin', 'l_glutamine'. */
  key: string;
  emoji: string;
  nutrient: string;
  form: string;
  dose: string;
  timing: string;
  whyShort: string;             // 6-10 word reason
  why: string;                  // 1 sentence linking to lab/depletion/condition
  category: 'sleep_stress' | 'gut_healing' | 'liver_metabolic' | 'inflammation_cardio' | 'nutrient_repletion' | 'condition_therapy';
  priority: 'critical' | 'high' | 'moderate';
  sourcedFrom: 'lab_finding' | 'medication_depletion' | 'disease_mechanism' | 'symptom_pattern';
  alternatives: { name: string; form: string; note: string }[];
}

interface Input {
  age: number | null;
  sex: 'male' | 'female' | null;
  depletions: DepletionFact[];
  outliers: LabOutlierFact[];
  conditionsLower: string;
  symptomsLower: string;
  supplementsLower: string;
  isPregnant: boolean;
  hasShellfishAllergy: boolean;
  hasSulfaAllergy: boolean;
}

// Universal gating helpers — only recommend a depletion-repletion
// supplement if the relevant lab marker confirms deficiency. If the lab
// wasn't drawn yet, defer — the test is already on the order sheet, the
// supplement starts after results return. Avoids the "every UC patient
// on mesalamine gets methylfolate without ever testing folate" problem.
function isMarkerLow(outliers: LabOutlierFact[], pat: RegExp): boolean {
  return outliers.some(o => pat.test(o.marker) && (o.flag === 'low' || o.flag === 'critical_low' || (o.flag === 'watch' && o.value < belowOptimalThreshold(o.marker))));
}
function belowOptimalThreshold(marker: string): number {
  // Thresholds below which a Watch-tier reading still implies repletion.
  // Universal — applies to any patient.
  if (/vitamin d|25.?hydroxy/i.test(marker)) return 30;          // <30 = repletion zone
  if (/^b[\s-]?12|cobalamin/i.test(marker)) return 400;          // <400 = functional deficiency
  if (/folate/i.test(marker)) return 5;                          // <5 ng/mL = repletion zone
  if (/ferritin/i.test(marker)) return 50;                       // <50 = restless legs / fatigue zone
  if (/magnesium/i.test(marker)) return 2.0;                     // RBC Mg
  return 0;
}

/** Universal supplement-key registry. Maps known nutrient strings to a
 * stable cross-surface key. Same supplement → same key on lab analysis,
 * wellness plan, doctor prep. Slug fallback for anything not pre-listed. */
const SUPPLEMENT_KEY_MAP: Array<[RegExp, string]> = [
  [/coq10|ubiquinol|ubiquinone/i, 'coq10_ubiquinol'],
  [/methylcobalamin|^b[\s-]?12 |cobalamin/i, 'methylcobalamin_b12'],
  [/methylfolate|5-?mthf|folinic/i, 'methylfolate_5mthf'],
  [/magnesium glycinate/i, 'mg_glycinate'],
  [/magnesium l-?threonate/i, 'mg_l_threonate'],
  [/vitamin d3|^vit d/i, 'vit_d3_4000'],
  [/omega-?3|epa.?dha|fish oil/i, 'omega3'],
  [/algae omega/i, 'omega3_algae'],
  [/iron bisglycinate|iron \(gentle/i, 'iron_bisglycinate'],
  [/heme iron/i, 'iron_heme'],
  [/curcumin|meriva|bcm-?95/i, 'curcumin_bioavailable'],
  [/milk thistle|silymarin/i, 'milk_thistle_silymarin'],
  [/l-?glutamine|glutamine/i, 'l_glutamine'],
  [/zinc carnosine/i, 'zinc_carnosine'],
  [/slippery elm/i, 'slippery_elm'],
  [/berberine/i, 'berberine'],
  [/inositol/i, 'inositol'],
  [/chromium/i, 'chromium'],
];
function keyForNutrient(nutrient: string): string {
  for (const [pat, key] of SUPPLEMENT_KEY_MAP) {
    if (pat.test(nutrient)) return key;
  }
  // Slug fallback. Universal — any future nutrient gets a stable key.
  return String(nutrient).toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'unknown_supplement';
}

export function buildSupplementCandidates(input: Input): SupplementCandidate[] {
  const out: SupplementCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: Omit<SupplementCandidate, 'key'> & { key?: string }) => {
    // Auto-derive the key from the nutrient name unless explicitly set.
    // This means existing push() call sites don't need to set `key`
    // manually — the registry map below handles known supplements and
    // a slug fallback covers any new ones.
    const key = c.key ?? keyForNutrient(c.nutrient);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, key } as SupplementCandidate);
  };

  // ── 1. Med-driven depletions ────────────────────────────────────────
  // GATING RULE (universal):
  //   - CoQ10: always recommend on statin (no PCP-standard test for CoQ10
  //     levels, statin-driven depletion is established science)
  //   - All other depletion repletions: ONLY recommend if the relevant
  //     lab is FLAGGED in outliers as low/critical_low/watch-below-optimal.
  //     If the test wasn't drawn yet, the supplement defers — the test is
  //     already on the order sheet from the deterministic test engine.
  for (const d of input.depletions) {
    if (d.nutrient === 'CoQ10') {
      push({
        emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel',
        dose: '100-200mg', timing: 'With breakfast (take with fat)',
        whyShort: 'Statins block your body from making CoQ10',
        why: `${d.medsMatched.join(' / ')} depletes CoQ10 — repletion eases statin-related muscle and energy symptoms. (No standard test for CoQ10 levels — repletion is empirical.)`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Ubiquinone', form: 'Softgel', note: 'Cheaper but ~30% lower bioavailability than ubiquinol.' },
          { name: 'CoQ10 + PQQ', form: 'Capsule', note: 'Combined mitochondrial support — pricier.' },
        ],
      });
    }
    if (d.nutrient === 'Vitamin B12' && isMarkerLow(input.outliers, /^b[\s-]?12|cobalamin/i)) {
      push({
        emoji: '💊', nutrient: 'Methylcobalamin (B12)', form: 'Sublingual lozenge',
        dose: '1000 mcg/day', timing: 'Morning, empty stomach',
        whyShort: 'Replete confirmed-low B12',
        why: `Lab confirms low B12 + on ${d.medsMatched.join(' / ')} (drug-driven depletion). Methylcobalamin is the active form, no MTHFR conversion needed.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Cyanocobalamin B12', form: 'Tablet', note: 'Cheaper, requires conversion to active form.' },
        ],
      });
    }
    if (d.nutrient === 'Folate' && isMarkerLow(input.outliers, /folate/i)) {
      push({
        emoji: '💊', nutrient: 'Methylfolate (5-MTHF)', form: 'Capsule',
        dose: '400-800 mcg/day', timing: 'Morning with food',
        whyShort: 'Replete confirmed-low folate',
        why: `Lab confirms low folate + on ${d.medsMatched.join(' / ')} (which blocks folate absorption). Methylfolate is the bioavailable active form.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Folinic acid', form: 'Capsule', note: 'Alternative if methylfolate causes overstimulation.' },
        ],
      });
    }
    if (d.nutrient === 'Magnesium' && isMarkerLow(input.outliers, /magnesium/i)) {
      push({
        emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
        dose: '300 mg', timing: 'Evening (7 PM), 2–3 hours before bed',
        whyShort: 'Replete confirmed-low Mg',
        why: `Lab confirms low magnesium + on ${d.medsMatched.join(' / ')}. Glycinate form is gentle on the gut.`,
        category: 'sleep_stress', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Magnesium L-Threonate', form: 'Capsule', note: 'Crosses blood-brain barrier — for cognitive symptoms.' },
        ],
      });
    }
    if (d.nutrient === 'Vitamin D' && isMarkerLow(input.outliers, /vitamin d|25.?hydroxy/i)) {
      push(vitaminDCandidate('medication_depletion', `Lab confirms low vitamin D + on ${d.medsMatched.join(' / ')}. Repletion + 12-week recheck.`));
    }
  }

  // ── 2. Lab-driven outliers ──────────────────────────────────────────
  for (const o of input.outliers) {
    if (/vitamin d|25.?hydroxy/i.test(o.marker) && (o.flag === 'low' || o.flag === 'critical_low' || (o.flag === 'watch' && o.value < 40))) {
      push(vitaminDCandidate('lab_finding', `Vitamin D ${o.value} — ${o.flag === 'low' ? 'deficient' : 'in-range low'}; supplementation typically raises 10-15 ng/mL in 12 weeks.`));
    }
    if (/triglyceride/i.test(o.marker) && o.value >= 150 && !input.hasShellfishAllergy) {
      push({
        emoji: '💊', nutrient: 'Omega-3 (EPA/DHA)', form: 'Triglyceride-based softgel',
        dose: o.value >= 300 ? '3000 mg/day (1500 EPA + 1500 DHA)' : '2000 mg/day (1000 EPA + 1000 DHA)',
        timing: 'With largest meal',
        whyShort: 'Lower elevated triglycerides + inflammation',
        why: `Triglycerides ${o.value} — well above goal. Omega-3 typical drop 20-40% with adherence.`,
        category: 'inflammation_cardio',
        priority: o.value >= 300 ? 'critical' : 'high',
        sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Vegan algae omega-3', form: 'Softgel', note: 'For shellfish/fish allergy or vegan preference; same EPA/DHA effect.' },
        ],
      });
    }
    if (/ferritin/i.test(o.marker) && (o.flag === 'low' || (o.flag === 'watch' && o.value < 50))) {
      push({
        emoji: '💊', nutrient: 'Iron (gentle, low-dose)', form: 'Iron bisglycinate',
        dose: '25-50 mg every other day',
        timing: 'Morning, empty stomach with vitamin C 250 mg',
        whyShort: 'Replete low ferritin without GI side effects',
        why: `Ferritin ${o.value} — bisglycinate is better tolerated than ferrous sulfate; alternate-day dosing actually improves absorption (Stoffel 2017).`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Heme iron polypeptide', form: 'Capsule', note: 'Best-absorbed form; pricier.' },
        ],
      });
    }
    if (/(b[\s-]?12|cobalamin)/i.test(o.marker) && (o.flag === 'low' || o.value < 400)) {
      // Already covered if depletion fires; this catches lab-only deficiency.
      push({
        emoji: '💊', nutrient: 'Methylcobalamin (B12)', form: 'Sublingual lozenge',
        dose: '1000 mcg/day', timing: 'Morning, empty stomach',
        whyShort: 'Replete low B12 directly',
        why: `B12 ${o.value} — sublingual bypasses absorption issues common with PPI / metformin / age.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }
    if (/hs[\s-]?crp|c[\s-]?reactive/i.test(o.marker) && o.value > 1.0) {
      push({
        emoji: '💊', nutrient: 'Curcumin (Meriva or BCM-95)', form: 'Capsule with phospholipid carrier',
        dose: '500 mg twice daily', timing: 'With meals',
        whyShort: 'Reduce systemic inflammation',
        why: `hs-CRP ${o.value} — curcumin meta-analyses show 20-40% reduction with bioavailable forms.`,
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }
  }

  // ── 3. Condition-driven ──────────────────────────────────────────────
  if (/\b(uc|ulcerative colitis|crohn|ibd)\b/i.test(input.conditionsLower)) {
    push({
      emoji: '🛡️', nutrient: 'L-Glutamine', form: 'Powder (mix in water)',
      dose: '5g daily', timing: 'Morning, empty stomach',
      whyShort: 'Gut barrier repair for IBD',
      why: 'L-glutamine is the primary fuel for enterocytes — supports mucosal repair during IBD remission.',
      category: 'gut_healing', priority: 'high', sourcedFrom: 'disease_mechanism',
      alternatives: [
        { name: 'Slippery elm', form: 'Capsule', note: 'Mucilaginous fiber — soothes gut lining.' },
        { name: 'Zinc carnosine', form: 'Capsule', note: 'Targeted gut-lining repair, well-studied for ulcers.' },
      ],
    });
  }

  if (/(insomn|sleep onset|difficulty falling asleep|wake at night|night.?wake)/i.test(input.symptomsLower) && !seen.has('magnesium glycinate')) {
    push({
      emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
      dose: '300 mg', timing: 'Evening (7 PM), 2–3 hours before bed',
      whyShort: 'Sleep onset delay or night waking',
      why: 'Magnesium glycinate crosses the blood-brain barrier and supports GABA tone — most-studied form for sleep latency.',
      category: 'sleep_stress', priority: 'high', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Magnesium L-Threonate', form: 'Capsule', note: 'For added cognitive benefit.' },
      ],
    });
  }

  if (/\b(alt|sgpt)\b/i.test(JSON.stringify(input.outliers)) || input.outliers.some(o => /^alt$|sgpt/i.test(o.marker) && o.value > 50)) {
    push({
      emoji: '💊', nutrient: 'Milk Thistle (Silymarin)', form: 'Extract standardized to 80% silymarin',
      dose: '300 mg', timing: 'With lunch',
      whyShort: 'Hepatoprotection during liver-enzyme elevation',
      why: 'Silymarin is the best-studied hepatoprotective botanical — stabilizes hepatocyte membranes during enzyme elevation.',
      category: 'liver_metabolic', priority: 'high', sourcedFrom: 'lab_finding',
      alternatives: [],
    });
  }

  // ── 4. Allergy / pregnancy filters ──────────────────────────────────
  return out.filter(c => {
    if (input.hasShellfishAllergy && /omega-?3|fish oil/i.test(c.nutrient)) return false;
    if (input.isPregnant && /(kava|comfrey|ashwagandha|berberine|black cohosh|dong quai|saw palmetto)/i.test(c.nutrient)) return false;
    return true;
  });
}

function vitaminDCandidate(sourcedFrom: SupplementCandidate['sourcedFrom'], why: string): SupplementCandidate {
  return {
    emoji: '💊', nutrient: 'Vitamin D3', form: 'Softgel with mixed tocopherols',
    dose: '4000 IU/day', timing: 'With breakfast',
    whyShort: 'Replete low vitamin D',
    why,
    category: 'nutrient_repletion', priority: 'high', sourcedFrom,
    alternatives: [
      { name: 'Vitamin D3 + K2', form: 'Softgel', note: 'K2 directs calcium to bone, away from arteries — good for higher doses.' },
    ],
  };
}
