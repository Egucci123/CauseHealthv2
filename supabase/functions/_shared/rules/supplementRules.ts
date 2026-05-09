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

export function buildSupplementCandidates(input: Input): SupplementCandidate[] {
  const out: SupplementCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: SupplementCandidate) => {
    const k = c.nutrient.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  // ── 1. Med-driven depletions ────────────────────────────────────────
  for (const d of input.depletions) {
    if (d.nutrient === 'CoQ10') {
      push({
        emoji: '💊', nutrient: 'CoQ10 (Ubiquinol)', form: 'Softgel',
        dose: '100-200mg', timing: 'With breakfast (take with fat)',
        whyShort: 'Statins block your body from making CoQ10',
        why: `${d.medsMatched.join(' / ')} depletes CoQ10 — repletion eases statin-related muscle and energy symptoms.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Ubiquinone', form: 'Softgel', note: 'Cheaper but ~30% lower bioavailability than ubiquinol.' },
          { name: 'CoQ10 + PQQ', form: 'Capsule', note: 'Combined mitochondrial support — pricier.' },
        ],
      });
    }
    if (d.nutrient === 'Vitamin B12') {
      push({
        emoji: '💊', nutrient: 'Methylcobalamin (B12)', form: 'Sublingual lozenge',
        dose: '1000 mcg/day', timing: 'Morning, empty stomach',
        whyShort: 'Repletes drug-driven B12 depletion',
        why: `${d.medsMatched.join(' / ')} depletes B12 — methylcobalamin is the active form, no MTHFR conversion needed.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Cyanocobalamin B12', form: 'Tablet', note: 'Cheaper, requires conversion to active form.' },
        ],
      });
    }
    if (d.nutrient === 'Folate') {
      push({
        emoji: '💊', nutrient: 'Methylfolate (5-MTHF)', form: 'Capsule',
        dose: '400-800 mcg/day', timing: 'Morning with food',
        whyShort: 'Repletes drug-driven folate depletion',
        why: `${d.medsMatched.join(' / ')} blocks folate — methylfolate is the bioavailable active form.`,
        category: 'nutrient_repletion', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Folinic acid', form: 'Capsule', note: 'Alternative if methylfolate causes overstimulation.' },
        ],
      });
    }
    if (d.nutrient === 'Magnesium') {
      push({
        emoji: '💊', nutrient: 'Magnesium Glycinate', form: 'Capsule',
        dose: '300 mg', timing: 'Evening (7 PM), 2–3 hours before bed',
        whyShort: 'Repletes drug-driven Mg depletion',
        why: `${d.medsMatched.join(' / ')} depletes magnesium — glycinate form is gentle on the gut.`,
        category: 'sleep_stress', priority: 'high', sourcedFrom: 'medication_depletion',
        alternatives: [
          { name: 'Magnesium L-Threonate', form: 'Capsule', note: 'Crosses blood-brain barrier — for cognitive symptoms.' },
        ],
      });
    }
    if (d.nutrient === 'Vitamin D') {
      push(vitaminDCandidate('medication_depletion', `${d.medsMatched.join(' / ')} suppresses vitamin D — repletion + monitoring needed.`));
    }
  }

  // ── 2. Lab-driven outliers ──────────────────────────────────────────
  for (const o of input.outliers) {
    if (/vitamin d|25.?hydroxy/i.test(o.marker) && (o.flag === 'low' || o.flag === 'critical_low' || (o.flag === 'watch' && o.value < 40))) {
      push(vitaminDCandidate('lab_finding', `Vitamin D ${o.value} — ${o.flag === 'low' ? 'deficient' : 'suboptimal'}; supplementation typically raises 10-15 ng/mL in 12 weeks.`));
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
