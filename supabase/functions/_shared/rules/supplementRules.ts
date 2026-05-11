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

    // ── Thyroid drift (TSH watch/high, low Free T3) ────────────────────
    // Universal: any patient with TSH in the upper-normal-watch tier or
    // overtly above range benefits from selenium + zinc support for the
    // T4→T3 conversion pathway and antibody modulation. Pregnancy-safe
    // at these doses. Marisa Sirkin (TSH 3.02 watch) is the canonical
    // case that exposed the gap.
    if (/^tsh$/i.test(o.marker) && (o.flag === 'high' || o.flag === 'critical_high' || (o.flag === 'watch' && o.value >= 2.0))) {
      push({
        emoji: '💊', nutrient: 'Selenium (selenomethionine)', form: 'Capsule',
        dose: '200 mcg/day', timing: 'Morning with food',
        whyShort: 'Thyroid antibody and conversion support',
        why: `TSH ${o.value} mIU/L — selenium 200 mcg lowers TPO antibodies in meta-analyses (Toulis 2010) and supports T4→T3 conversion. Stays well under the 400 mcg upper limit.`,
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Brazil nuts', form: 'Whole food', note: '1–2 nuts/day delivers ~70-160 mcg selenium naturally.' },
        ],
      });
      push({
        emoji: '💊', nutrient: 'Zinc picolinate', form: 'Capsule',
        dose: '15 mg/day', timing: 'Evening with food',
        whyShort: 'T4→T3 conversion cofactor',
        why: `Zinc is a required cofactor for deiodinase enzymes that convert T4 to active T3. With TSH ${o.value}, zinc repletion supports the conversion pathway.`,
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Zinc bisglycinate', form: 'Capsule', note: 'Equivalent absorption, may be gentler on the stomach.' },
        ],
      });
    }

    // ── Isolated thyroid antibody elevation (TPO / TgAb) ───────────────
    // Hashimoto's can fire even with normal TSH — antibody positivity
    // precedes overt dysfunction by years. Selenium has the strongest
    // evidence for lowering TPO antibodies; vitamin D supports tolerance.
    // Universal — fires on any user with positive TPO or TgAb regardless
    // of TSH state.
    if (/tpo|thyroid peroxidase|thyroglobulin antibod/i.test(o.marker) && (o.flag === 'high' || o.flag === 'critical_high' || (o.flag === 'watch' && o.value >= 35))) {
      if (!seen.has('selenium_selenomethionine')) {
        push({
          emoji: '💊', nutrient: 'Selenium (selenomethionine)', form: 'Capsule',
          dose: '200 mcg/day', timing: 'Morning with food',
          whyShort: 'Lower thyroid antibodies',
          why: `${o.marker} ${o.value} — selenium 200 mcg/day lowered TPO antibodies 21–40% across RCTs (Toulis 2010 meta-analysis). Conservative dose well under the 400 mcg upper limit.`,
          category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'lab_finding',
          alternatives: [
            { name: 'Brazil nuts', form: 'Whole food', note: '1–2 nuts/day delivers ~70–160 mcg selenium naturally.' },
          ],
        });
      }
      // Vit D — autoimmune-tolerance support; fires only if not already
      // added by the vit-D pathway or alreadyOptimalFilter.
      if (!seen.has('vit_d3_4000')) {
        push(vitaminDCandidate('lab_finding',
          `${o.marker} positive — vitamin D status correlates inversely with thyroid antibody titers; D3 4000 IU/day with 12-week recheck supports immune tolerance.`));
      }
    }

    // Free T3 low → same support + tyrosine precursor
    if (/free\s*t3|^t3,?\s*free/i.test(o.marker) && (o.flag === 'low' || o.flag === 'critical_low' || (o.flag === 'watch' && o.value < 3.0))) {
      push({
        emoji: '💊', nutrient: 'L-Tyrosine', form: 'Capsule',
        dose: '500 mg/day', timing: 'Morning, empty stomach',
        whyShort: 'Thyroid hormone precursor',
        why: `Free T3 ${o.value} — L-tyrosine is the amino-acid backbone for T4/T3 synthesis. Conservative dose; pair with selenium for full pathway support.`,
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }

    // ── AM Cortisol elevation → stress-axis support ────────────────────
    // Universal: high morning cortisol with stress/fatigue symptoms is
    // a chronic-stress signature. Adaptogens are pregnancy-gated in the
    // final filter; phosphatidylserine and L-theanine are not.
    if (/cortisol.*am|cortisol\s*-\s*am|^cortisol$/i.test(o.marker) && (o.flag === 'high' || o.flag === 'critical_high')) {
      push({
        emoji: '🧘', nutrient: 'Phosphatidylserine', form: 'Softgel',
        dose: '300 mg/day', timing: 'Evening',
        whyShort: 'Lowers elevated cortisol',
        why: `AM cortisol ${o.value} — phosphatidylserine 300 mg blunts elevated cortisol in stress and exercise-overtraining studies (Monteleone 1992, Starks 2008). Pregnancy-safe.`,
        category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'L-Theanine', form: 'Capsule', note: 'Alternative for daytime stress modulation, 200 mg twice daily.' },
        ],
      });
      push({
        emoji: '🌿', nutrient: 'Ashwagandha (KSM-66)', form: 'Capsule',
        dose: '600 mg/day', timing: 'With breakfast',
        whyShort: 'Adaptogenic cortisol modulation',
        why: `AM cortisol ${o.value} — KSM-66 ashwagandha 600 mg/day reduced cortisol 27–30% in RCTs (Chandrasekhar 2012, Salve 2019). Pregnancy-contraindicated.`,
        category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Rhodiola rosea', form: 'Capsule', note: '300 mg/day — alternative adaptogen, more energizing, also pregnancy-contraindicated.' },
        ],
      });
    }

    // ── Lipid panel ────────────────────────────────────────────────────
    if (/^hdl/i.test(o.marker) && (o.flag === 'low' || o.flag === 'critical_low' || (o.flag === 'watch' && o.value < 50))) {
      push({
        emoji: '💊', nutrient: 'Niacin (nicotinic acid)', form: 'Sustained-release tablet',
        dose: '500 mg/day', timing: 'Evening with food',
        whyShort: 'Raise low HDL',
        why: `HDL ${o.value} mg/dL — niacin remains the most effective non-pharmacologic HDL-raiser (5–15 mg/dL increase). Flush is normal; SR forms reduce it.`,
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Inositol Hexanicotinate', form: 'Capsule', note: 'Flush-free niacin alternative; smaller HDL effect.' },
        ],
      });
    }

    if ((/^ldl(\s|$|-c)/i.test(o.marker) && o.value > 130) ||
        (/apo.?b/i.test(o.marker) && o.value > 100)) {
      push({
        emoji: '💊', nutrient: 'Red Yeast Rice (with CoQ10)', form: 'Capsule',
        dose: '1200 mg/day (10 mg monacolin K)', timing: 'With dinner',
        whyShort: 'Lower elevated LDL / ApoB',
        why: `${o.marker} ${o.value} — RYR delivers a natural-form statin (monacolin K); add CoQ10 to offset CoQ10 depletion. Avoid if already on a prescription statin.`,
        category: 'inflammation_cardio', priority: 'high', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Bergamot extract', form: 'Capsule', note: 'Citrus bergamot 500–1000 mg/day — 15–25% LDL reduction in trials.' },
          { name: 'Plant sterols', form: 'Softgel', note: '2 g/day blocks cholesterol absorption — additive with diet changes.' },
        ],
      });
    }

    // ── Glycemic drift ────────────────────────────────────────────────
    if (/a1c|hba1c/i.test(o.marker) && (o.flag === 'high' || o.flag === 'critical_high' || (o.flag === 'watch' && o.value >= 5.5))) {
      push({
        emoji: '💊', nutrient: 'Berberine HCl', form: 'Capsule',
        dose: '500 mg three times daily', timing: 'With each main meal',
        whyShort: 'A1c reduction comparable to metformin',
        why: `A1c ${o.value}% — berberine 1500 mg/day shows comparable A1c reduction to metformin in meta-analyses (Yin 2008). Pregnancy-contraindicated.`,
        category: 'liver_metabolic', priority: 'high', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Chromium picolinate', form: 'Capsule', note: '400 mcg/day — pregnancy-safe alternative for glucose handling.' },
          { name: 'Alpha-lipoic acid', form: 'Capsule', note: '600 mg/day — supports insulin sensitivity + nerve health.' },
        ],
      });
    }
    if (/fasting\s*glucose|^glucose$/i.test(o.marker) && o.flag !== 'low' && o.value >= 95) {
      push({
        emoji: '💊', nutrient: 'Chromium picolinate', form: 'Capsule',
        dose: '400 mcg/day', timing: 'With largest meal',
        whyShort: 'Insulin-receptor sensitivity',
        why: `Glucose ${o.value} mg/dL — chromium is a cofactor for insulin signaling. Pregnancy-safe at this dose.`,
        category: 'liver_metabolic', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }

    // ── Homocysteine elevation → methylated B-complex ──────────────────
    if (/homocysteine/i.test(o.marker) && o.value > 10) {
      push({
        emoji: '💊', nutrient: 'Methylated B-complex', form: 'Capsule',
        dose: '1 capsule/day', timing: 'Morning with food',
        whyShort: 'Lower elevated homocysteine',
        why: `Homocysteine ${o.value} µmol/L — methylated B6/B9/B12 lowers homocysteine 25–30% in supplementation trials.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }

    // ── ALT/AST already covered below; expand AST too ──────────────────
    if (/^ast|sgot|aspartate/i.test(o.marker) && (o.flag === 'high' || o.value > 35)) {
      push({
        emoji: '💊', nutrient: 'N-Acetylcysteine (NAC)', form: 'Capsule',
        dose: '600 mg twice daily', timing: 'With food',
        whyShort: 'Hepatic glutathione support',
        why: `AST ${o.value} — NAC is the glutathione precursor and the standard for hepatic oxidative stress.`,
        category: 'liver_metabolic', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [],
      });
    }

    // ── Uric acid elevation ────────────────────────────────────────────
    if (/uric\s*acid/i.test(o.marker) && o.value > 6.5) {
      push({
        emoji: '🍒', nutrient: 'Tart Cherry Extract', form: 'Capsule',
        dose: '500 mg/day', timing: 'Evening',
        whyShort: 'Lower elevated uric acid',
        why: `Uric acid ${o.value} mg/dL — tart cherry concentrate lowers uric acid and reduces gout flare frequency in RCTs (Schlesinger 2012).`,
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'lab_finding',
        alternatives: [
          { name: 'Quercetin', form: 'Capsule', note: '500 mg/day — supports uric-acid clearance and is anti-inflammatory.' },
        ],
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

  // ── Condition-driven (expanded) ───────────────────────────────────
  // PCOS → inositol + NAC (well-established for insulin sensitivity +
  // ovulation in PCOS). Pregnancy-safe.
  if (/\bpcos\b|polycystic\s+ovar/i.test(input.conditionsLower)) {
    push({
      emoji: '💊', nutrient: 'Myo-Inositol + D-Chiro-Inositol (40:1)', form: 'Powder',
      dose: '2 g twice daily', timing: 'Morning + evening with food',
      whyShort: 'Insulin sensitivity + ovulation support in PCOS',
      why: 'Myo + D-chiro inositol at the 40:1 physiologic ratio improves insulin signaling, restores ovulation, and lowers androgens in PCOS RCTs (Nordio 2012).',
      category: 'condition_therapy', priority: 'high', sourcedFrom: 'disease_mechanism',
      alternatives: [
        { name: 'NAC', form: 'Capsule', note: '600 mg twice daily — alternative for insulin sensitivity + ovulation.' },
      ],
    });
  }

  // Hashimoto's / autoimmune thyroid → selenium (already covered by TSH
  // outlier rule if present); add vitamin D as a thyroid antibody
  // modulator since most Hashimoto patients are vitamin-D-insufficient.
  if (/\bhashimoto|autoimmune\s+thyroid/i.test(input.conditionsLower) && !seen.has('vit_d3_4000')) {
    push(vitaminDCandidate('disease_mechanism',
      'Hashimoto patients trend toward vitamin D insufficiency; D3 supplementation associates with lower TPO antibodies.'));
  }

  // T2D → berberine (already added if A1c outlier fires) + chromium + ALA
  if (/type\s*2\s*diabetes|t2dm/i.test(input.conditionsLower) && !seen.has('berberine')) {
    push({
      emoji: '💊', nutrient: 'Alpha-Lipoic Acid', form: 'Capsule',
      dose: '600 mg/day', timing: 'Morning, empty stomach',
      whyShort: 'Insulin sensitivity + nerve support',
      why: 'ALA improves insulin sensitivity and is the standard for diabetic neuropathy (1200 mg/day for neuropathy).',
      category: 'condition_therapy', priority: 'high', sourcedFrom: 'disease_mechanism',
      alternatives: [],
    });
  }

  // Hypertension → magnesium + CoQ10 (CoQ10 already deferred to depletion
  // path if statin; this catches non-statin hypertension)
  if (/hypertens|high\s+blood\s+pressure/i.test(input.conditionsLower) && !seen.has('mg_glycinate')) {
    push({
      emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
      dose: '300 mg/day', timing: 'Evening',
      whyShort: 'Modest BP reduction in hypertension',
      why: 'Magnesium supplementation lowers systolic BP 2–4 mmHg in meta-analyses (Zhang 2016) — additive to first-line therapy.',
      category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'disease_mechanism',
      alternatives: [],
    });
  }

  // Anxiety / depression as documented conditions
  if (/\b(anxiety|gad|panic)\b/i.test(input.conditionsLower) && !seen.has('mg_glycinate')) {
    push({
      emoji: '🌿', nutrient: 'L-Theanine', form: 'Capsule',
      dose: '200 mg twice daily', timing: 'As needed for stress, max 400 mg/day',
      whyShort: 'Calm focus without sedation',
      why: 'L-theanine raises alpha-brainwave activity and lowers subjective stress without sedation. Pregnancy-safe.',
      category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'disease_mechanism',
      alternatives: [],
    });
  }

  // ── 4. Symptom-driven (universal — fires off the in-app symptom selector) ─
  // EVERY user's symptoms should map to at least one supplement candidate.
  // These rules are deliberately wide-net + dose-conservative + pregnancy-
  // gated at the final filter. They use `seen` to avoid duplicating
  // anything already added by lab/condition rules.

  // Fatigue (any severity) → B-complex + magnesium baseline
  if (/(fatigue|tired|exhaust|low energy|energy crash)/i.test(input.symptomsLower)) {
    if (!seen.has('methylated_b_complex')) {
      push({
        emoji: '💊', nutrient: 'Methylated B-Complex', form: 'Capsule',
        dose: '1 capsule/day', timing: 'Morning with food',
        whyShort: 'Energy + mitochondrial cofactor support',
        why: 'Methylated B-vitamins (B6 P5P, methylfolate, methylcobalamin) bypass MTHFR conversion issues and support energy metabolism.',
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
    if (!seen.has('coq10_ubiquinol')) {
      push({
        emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel',
        dose: '100 mg/day', timing: 'With breakfast (with fat)',
        whyShort: 'Mitochondrial energy production',
        why: 'CoQ10 is the rate-limiting electron carrier in the mitochondrial respiratory chain — supplementation supports cellular energy in fatigue.',
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
  }

  // Brain fog / concentration → omega-3 (DHA-rich) + B-complex
  if (/(brain fog|concentrat|focus|memory)/i.test(input.symptomsLower)) {
    if (!seen.has('omega3') && !input.hasShellfishAllergy) {
      push({
        emoji: '🐟', nutrient: 'Omega-3 (high-DHA)', form: 'Triglyceride-form softgel',
        dose: '2000 mg/day (700–1000 mg DHA)', timing: 'With largest meal',
        whyShort: 'Cognitive function + brain inflammation',
        why: 'DHA is the dominant structural fat in neural membranes; supplementation supports cognitive performance and lowers neuroinflammation.',
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [
          { name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy or vegan preference.' },
        ],
      });
    }
    if (!seen.has('mg_l_threonate') && !seen.has('mg_glycinate')) {
      push({
        emoji: '💊', nutrient: 'Magnesium L-Threonate', form: 'Capsule',
        dose: '1.5–2 g/day (split dose)', timing: 'Afternoon + evening',
        whyShort: 'Crosses blood-brain barrier for cognition',
        why: 'L-threonate is the only magnesium form clinically shown to raise CNS magnesium (Slutsky 2010); supports memory and cognition.',
        category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
  }

  // Mood swings / depressed mood / anxiety
  if (/(mood swing|mood\s|depress|anxiety|anxious|panic|irritab)/i.test(input.symptomsLower)) {
    if (!seen.has('mg_glycinate')) {
      push({
        emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
        dose: '300 mg/day', timing: 'Evening',
        whyShort: 'Mood + stress modulation',
        why: 'Magnesium supports GABA tone and HPA-axis regulation; supplementation lowers depression scores in trials (Tarleton 2017).',
        category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
    if (!seen.has('omega3') && !input.hasShellfishAllergy) {
      push({
        emoji: '🐟', nutrient: 'Omega-3 (EPA-dominant)', form: 'Triglyceride-form softgel',
        dose: '2000 mg/day (≥1000 mg EPA)', timing: 'With largest meal',
        whyShort: 'EPA-dominant omega-3 for mood',
        why: 'EPA:DHA ratios ≥2:1 show the strongest antidepressant effect in meta-analyses (Sublette 2011).',
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [
          { name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy.' },
        ],
      });
    }
  }

  // Insomnia / sleep onset / night waking (existing rule retained — moved here for cohesion)
  if (/(insomn|sleep onset|difficulty falling asleep|wake at night|night.?wake)/i.test(input.symptomsLower) && !seen.has('mg_glycinate')) {
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

  // Bowel symptoms — split constipation vs diarrhea vs alternating
  if (/(constipat)/i.test(input.symptomsLower)) {
    push({
      emoji: '💊', nutrient: 'Magnesium Citrate', form: 'Capsule',
      dose: '400 mg/day', timing: 'Evening',
      whyShort: 'Gentle osmotic laxative for constipation',
      why: 'Magnesium citrate draws water into the colon; the most-recommended OTC magnesium for constipation. Pregnancy-safe at this dose.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }
  if (/(diarrh|loose stool)/i.test(input.symptomsLower) || /(alternating bowel|ibs|irritable bowel)/i.test(input.symptomsLower)) {
    push({
      emoji: '🦠', nutrient: 'Probiotic (multi-strain, ≥30B CFU)', form: 'Capsule',
      dose: '1 capsule/day', timing: 'Morning, empty stomach',
      whyShort: 'Bowel-pattern stabilization',
      why: 'Multi-strain probiotics reduce both diarrhea and abdominal pain in IBS and gut-microbiome-driven bowel-pattern disruption.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'L-Glutamine', form: 'Powder', note: '5 g/day — gut-barrier support for the same pattern.' },
      ],
    });
  }

  // Joint pain → omega-3 + curcumin
  if (/(joint pain|arthriti|achy joints)/i.test(input.symptomsLower)) {
    if (!seen.has('curcumin_bioavailable')) {
      push({
        emoji: '💊', nutrient: 'Curcumin (Meriva or BCM-95)', form: 'Capsule with phospholipid carrier',
        dose: '500 mg twice daily', timing: 'With meals',
        whyShort: 'Anti-inflammatory for joint pain',
        why: 'Bioavailable curcumin matches NSAIDs for OA pain in RCTs (Daily 2016) without GI side effects.',
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
    if (!seen.has('omega3') && !input.hasShellfishAllergy) {
      push({
        emoji: '🐟', nutrient: 'Omega-3 (EPA/DHA)', form: 'Triglyceride-form softgel',
        dose: '2000 mg/day', timing: 'With largest meal',
        whyShort: 'Joint-inflammation modulation',
        why: 'Omega-3 lowers joint inflammation markers and morning stiffness in joint-pain RCTs.',
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [
          { name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy.' },
        ],
      });
    }
  }

  // Headaches / migraines → magnesium + riboflavin (B2)
  if (/(headache|migrain)/i.test(input.symptomsLower)) {
    if (!seen.has('mg_glycinate')) {
      push({
        emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
        dose: '400 mg/day', timing: 'Evening',
        whyShort: 'Migraine prevention (American Headache Society Level B)',
        why: 'Magnesium 400 mg/day is American Headache Society Level B evidence for migraine prevention; pregnancy-safe at this dose.',
        category: 'sleep_stress', priority: 'high', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
    push({
      emoji: '💊', nutrient: 'Riboflavin (B2)', form: 'Capsule',
      dose: '400 mg/day', timing: 'Morning with food',
      whyShort: 'Migraine prevention',
      why: 'Riboflavin 400 mg/day reduced migraine frequency in 2-3 RCTs; works via mitochondrial energy metabolism. Pregnancy-safe.',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Hair loss / thinning → biotin + iron-bisglycinate gate + zinc
  if (/(hair loss|hair thinning|hair shed)/i.test(input.symptomsLower)) {
    push({
      emoji: '💊', nutrient: 'Biotin', form: 'Capsule',
      dose: '5 mg/day', timing: 'Morning',
      whyShort: 'Hair / nail keratin support',
      why: 'Biotin supplementation supports keratin synthesis in hair follicles; note: discontinue 48 h before any lab draw, as biotin interferes with immunoassays (TSH, troponin).',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
    if (!seen.has('iron_bisglycinate') && !seen.has('iron_heme')) {
      // No iron rec without ferritin — gate it. If ferritin not drawn,
      // recommend the test rather than blind iron.
      push({
        emoji: '💊', nutrient: 'Zinc picolinate', form: 'Capsule',
        dose: '15 mg/day', timing: 'Evening with food',
        whyShort: 'Hair-cycle support',
        why: 'Zinc deficiency is a well-documented driver of telogen effluvium; 15 mg is conservative and safe long-term.',
        category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
  }

  // Cold intolerance / always cold → iron status gate + thyroid support
  // (selenium/zinc handled by TSH rule)
  if (/(cold intolerance|always cold|cold hands|cold feet)/i.test(input.symptomsLower)) {
    // No iron without ferritin trigger; rule defers to ferritin lab path.
    // Selenium/zinc fire on TSH watch (handled above).
    // Add iodine ONLY if no hyperthyroid signal — conservative.
    // Skip iodine for safety; addressed by Doctor Prep test orders instead.
  }

  // PMS / cramps / breast tenderness (female-only, pregnancy-gated)
  if (input.sex === 'female' && /(pms|premenstrual|cramps|painful period|breast tender|cyclical mood)/i.test(input.symptomsLower)) {
    if (!seen.has('mg_glycinate')) {
      push({
        emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
        dose: '300 mg/day', timing: 'Evening',
        whyShort: 'PMS / cramp reduction',
        why: 'Magnesium 300 mg/day reduced PMS severity and dysmenorrhea pain in placebo-controlled trials (Walker 1998, Quaranta 2007). Pregnancy-safe at this dose.',
        category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
    push({
      emoji: '💊', nutrient: 'Vitamin B6 (P5P)', form: 'Capsule',
      dose: '50 mg/day', timing: 'Morning with food',
      whyShort: 'PMS mood + bloating',
      why: 'B6 50 mg/day improved PMS mood and breast tenderness in meta-analysis (Wyatt 1999). P5P is the active form, no conversion needed.',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
    push({
      emoji: '🌿', nutrient: 'Vitex (Chasteberry)', form: 'Standardized extract',
      dose: '20–40 mg/day', timing: 'Morning, daily for 3+ months',
      whyShort: 'PMS / luteal-phase support',
      why: 'Vitex (Vitex agnus-castus) reduced PMS symptom scores 50%+ vs placebo (Schellenberg 2001). Takes 2–3 cycles for full effect. Pregnancy-contraindicated.',
      category: 'condition_therapy', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Hot flashes / night sweats (female-only, pregnancy-gated for botanicals)
  if (input.sex === 'female' && /(hot flash|night sweat|vasomotor)/i.test(input.symptomsLower)) {
    push({
      emoji: '🌿', nutrient: 'Black Cohosh', form: 'Standardized extract',
      dose: '40 mg/day', timing: 'Morning with food',
      whyShort: 'Hot-flash frequency reduction',
      why: 'Black cohosh 40 mg/day reduced hot-flash frequency 26% vs placebo (Wuttke 2003 meta-analysis). Pregnancy- and breastfeeding-contraindicated.',
      category: 'condition_therapy', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Sage extract', form: 'Capsule', note: 'Alternative botanical for night sweats; less studied.' },
      ],
    });
    push({
      emoji: '💊', nutrient: 'Vitamin E', form: 'Mixed tocopherols softgel',
      dose: '400 IU/day', timing: 'With largest meal',
      whyShort: 'Mild hot-flash reduction',
      why: 'Vitamin E 400 IU/day modestly reduced hot-flash frequency in menopause trials (Ziaei 2007). Pregnancy-safe at this dose.',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Acne (any sex; adds hormonal-acne support for female)
  if (/(acne|breakouts|pimples|cystic acne)/i.test(input.symptomsLower)) {
    push({
      emoji: '💊', nutrient: 'Zinc Picolinate', form: 'Capsule',
      dose: '30 mg/day', timing: 'Evening with food',
      whyShort: 'Acne severity reduction',
      why: 'Zinc 30 mg/day matched moderate-dose antibiotics for inflammatory acne in head-to-head trials (Dreno 2001); supports skin barrier and reduces sebum production.',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
    if (!seen.has('omega3') && !input.hasShellfishAllergy) {
      push({
        emoji: '🐟', nutrient: 'Omega-3 (EPA/DHA)', form: 'Triglyceride-form softgel',
        dose: '1500 mg/day', timing: 'With largest meal',
        whyShort: 'Anti-inflammatory for acne',
        why: 'Omega-3 reduces inflammatory acne lesions vs placebo (Jung 2014); modulates skin prostaglandin balance.',
        category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [
          { name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy.' },
        ],
      });
    }
    // Female-specific hormonal acne support — DIM (preg-gated for safety)
    if (input.sex === 'female') {
      push({
        emoji: '🌿', nutrient: 'DIM (Diindolylmethane)', form: 'Capsule',
        dose: '100 mg/day', timing: 'Morning with food',
        whyShort: 'Estrogen-metabolism support for hormonal acne',
        why: 'DIM shifts estrogen metabolism toward the 2-hydroxylation pathway and is used clinically for hormonal acne. Pregnancy-contraindicated.',
        category: 'condition_therapy', priority: 'moderate', sourcedFrom: 'symptom_pattern',
        alternatives: [],
      });
    }
  }

  // Bloating / gas / heaviness after meals
  if (/(bloat|\bgas\b|heavy after meal|distended|abdominal distention)/i.test(input.symptomsLower)) {
    push({
      emoji: '💊', nutrient: 'Digestive Enzymes (full-spectrum)', form: 'Capsule',
      dose: '1 capsule per meal', timing: 'With each main meal',
      whyShort: 'Improve digestion + reduce bloating',
      why: 'Broad-spectrum digestive enzymes (amylase, lipase, protease + DPP-IV) reduce post-prandial bloating in functional-dyspepsia trials. Generally well tolerated.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Betaine HCl', form: 'Capsule', note: 'For low-stomach-acid bloating; not for users on PPIs or with ulcer history.' },
      ],
    });
    push({
      emoji: '🌿', nutrient: 'Ginger Root Extract', form: 'Capsule',
      dose: '500 mg twice daily', timing: 'With meals',
      whyShort: 'Gastric motility + nausea support',
      why: 'Ginger accelerates gastric emptying and reduces bloating + nausea in functional-dyspepsia and IBS trials. Pregnancy-safe at this dose.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Acid reflux / heartburn / GERD-like
  if (/(reflux|heartburn|gerd|acid regurg|throat burn)/i.test(input.symptomsLower)) {
    push({
      emoji: '🌿', nutrient: 'DGL (Deglycyrrhizinated Licorice)', form: 'Chewable tablet',
      dose: '380 mg, 15 min before meals', timing: '2–3 times daily before meals',
      whyShort: 'Mucosal protection for reflux',
      why: 'DGL supports esophageal and gastric mucosal protection without the blood-pressure risk of full licorice. Used clinically as an adjunct to acid-suppression.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Slippery Elm', form: 'Capsule', note: 'Mucilaginous fiber — soothes mucosa.' },
      ],
    });
    push({
      emoji: '💊', nutrient: 'Melatonin', form: 'Sublingual tablet',
      dose: '3 mg at bedtime', timing: 'Nightly, 30 min before bed',
      whyShort: 'Reduce nocturnal acid reflux',
      why: 'Melatonin reduced GERD symptom scores in head-to-head trials with omeprazole (Pereira 2006). Pregnancy-safe at this dose.',
      category: 'gut_healing', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Low libido (any sex)
  if (/(low libido|low sex drive|sexual dysfunction|loss of interest in sex)/i.test(input.symptomsLower)) {
    push({
      emoji: '🌿', nutrient: 'Maca (Lepidium meyenii)', form: 'Powder or capsule',
      dose: '1500–3000 mg/day', timing: 'Morning',
      whyShort: 'Libido + sexual function support',
      why: 'Maca improved subjective libido in placebo-controlled trials across both sexes (Shin 2010). Generally well tolerated; pregnancy data limited so pregnancy-cautious.',
      category: 'condition_therapy', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Allergies / hives / seasonal rhinitis
  if (/(allergies|seasonal allerg|hives|hay fever|rhinitis|allergic)/i.test(input.symptomsLower)) {
    push({
      emoji: '💊', nutrient: 'Quercetin', form: 'Capsule',
      dose: '500 mg twice daily', timing: 'With meals',
      whyShort: 'Mast-cell stabilization',
      why: 'Quercetin stabilizes mast cells and reduces histamine release; used clinically for allergy support. Pregnancy data limited — use cautiously.',
      category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Stinging Nettle', form: 'Capsule', note: 'Alternative natural antihistamine.' },
      ],
    });
  }

  // Frequent infections / always sick
  if (/(frequent infection|sick often|always sick|low immun|catch.*cold)/i.test(input.symptomsLower)) {
    if (!seen.has('vit_d3_4000')) {
      push(vitaminDCandidate('symptom_pattern',
        'Frequent infections — vitamin D supports immune function; deficiency strongly associated with respiratory infection frequency.'));
    }
    push({
      emoji: '💊', nutrient: 'Zinc Picolinate', form: 'Capsule',
      dose: '15 mg/day', timing: 'Evening with food',
      whyShort: 'Immune-function support',
      why: 'Zinc is a cofactor for >300 enzymes including those critical for T-cell function. Daily 15 mg shortens cold duration in supplementation trials.',
      category: 'nutrient_repletion', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // Stress / burnout / overwhelm → adaptogen (pregnancy-gated)
  if (/(stress|burnout|overwhelm|anxious thoughts)/i.test(input.symptomsLower) && !seen.has('ashwagandha')) {
    push({
      emoji: '🌿', nutrient: 'Ashwagandha (KSM-66)', form: 'Capsule',
      dose: '600 mg/day', timing: 'With breakfast',
      whyShort: 'Adaptogenic stress + cortisol modulation',
      why: 'KSM-66 ashwagandha 600 mg/day lowered perceived-stress scores 44% and cortisol 27% vs placebo (Chandrasekhar 2012). Pregnancy-contraindicated.',
      category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'L-Theanine', form: 'Capsule', note: '200 mg twice daily — pregnancy-safe stress alternative.' },
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

  // ── Universal foundational baseline (backstop) ─────────────────────
  //
  // Fires ONLY when no lab/depletion/condition/symptom rules produced
  // a candidate. This is the "healthy adult opens the app for the first
  // time and everything is fine" case — without this, they'd see an
  // empty supplement page.
  //
  // Three universally-evidence-supported, dose-conservative, pregnancy-
  // safe supplements that virtually every adult benefits from at these
  // doses. Sourced from peer-reviewed adult-baseline literature, not
  // from disease/symptom matching — so they rank LOWEST and are
  // naturally pushed out for users with actual findings.
  if (out.length === 0) {
    push(vitaminDCandidate('symptom_pattern',
      'Baseline support — most US adults have suboptimal vitamin D status; 1000 IU/day with annual retest is a conservative starting point.'));
    push({
      emoji: '🐟', nutrient: 'Omega-3 (EPA/DHA)', form: 'Triglyceride-form softgel',
      dose: '1000 mg/day', timing: 'With largest meal',
      whyShort: 'Baseline anti-inflammatory support',
      why: 'Omega-3 supplementation supports cardiovascular and cognitive health at population scale; 1000 mg/day is a safe maintenance dose for adults without specific lipid abnormalities.',
      category: 'inflammation_cardio', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [
        { name: 'Algal omega-3', form: 'Softgel', note: 'For shellfish/fish allergy or vegan preference.' },
      ],
    });
    push({
      emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
      dose: '200 mg/day', timing: 'Evening',
      whyShort: 'Baseline magnesium support',
      why: 'Population intake data consistently shows magnesium below the RDA; glycinate is gentle and supports sleep, stress, and muscle function at maintenance doses.',
      category: 'sleep_stress', priority: 'moderate', sourcedFrom: 'symptom_pattern',
      alternatives: [],
    });
  }

  // ── Final filters: allergy / pregnancy ─────────────────────────────
  const filtered = out.filter(c => {
    // Shellfish/fish allergy → drop fish oil (algal alt remains)
    if (input.hasShellfishAllergy && /omega-?3|fish oil/i.test(c.nutrient) && !/algal|algae|vegan/i.test(c.nutrient)) return false;

    // Pregnancy contraindications. Conservative — when in doubt, drop.
    // The is_pregnant flag is derived from the user's explicit onboarding
    // answer (pregnant / trying / breastfeeding / prefer-not-to-say for
    // female users). Items in this regex have either teratogenic risk,
    // uterine-contraction risk, hormonal-axis effects unsafe in
    // pregnancy, or unstudied safety profiles.
    if (input.isPregnant) {
      const pregContra = /(kava|comfrey|ashwagandha|berberine|black cohosh|dong quai|saw palmetto|red\s+yeast\s+rice|monacolin|bergamot|niacin|nicotinic\s+acid|high.?dose\s+vitamin\s+a|retinol|chasteberry|vitex|\bdim\b|diindolylmethane|sage|maca|quercetin)/i;
      if (pregContra.test(c.nutrient)) return false;
    }
    return true;
  });

  // ── Top-6 selection by clinical relevance ──────────────────────────
  // Rule library generates everything it CAN justify; this step picks the
  // 6 most clinically relevant for the user. Universal sort key:
  //   1. priority: critical (0) > high (1) > moderate (2)
  //   2. source:   medication_depletion (0) > lab_finding (1) >
  //                disease_mechanism (2) > symptom_pattern (3)
  //
  // Rationale for the source ordering:
  //   • depletion-driven supplements close an active drug-induced gap →
  //     highest leverage
  //   • lab-driven supplements address a specifically-flagged biomarker
  //     → direct response to data
  //   • condition-driven supplements address an active diagnosis →
  //     standard of care
  //   • symptom-driven supplements address user-reported symptoms →
  //     useful but secondary to the above
  //
  // Cap at 6 so the wellness plan reads as a focused stack, not a wall.
  // Adjust SUPPLEMENT_TOP_N to change the cap globally.
  const SUPPLEMENT_TOP_N = 6;
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, moderate: 2 };
  const SOURCE_RANK: Record<string, number> = {
    medication_depletion: 0,
    lab_finding: 1,
    disease_mechanism: 2,
    symptom_pattern: 3,
  };
  filtered.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 9;
    const pb = PRIORITY_RANK[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    const sa = SOURCE_RANK[a.sourcedFrom] ?? 9;
    const sb = SOURCE_RANK[b.sourcedFrom] ?? 9;
    return sa - sb;
  });
  return filtered.slice(0, SUPPLEMENT_TOP_N);
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
