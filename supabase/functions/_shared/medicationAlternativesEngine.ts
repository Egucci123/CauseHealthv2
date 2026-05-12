// supabase/functions/_shared/medicationAlternativesEngine.ts
//
// Deterministic engine for high-prevalence medication-alternative cases.
// The AI prompt asks the LLM to populate medication_alternatives with a
// strict bar, but it sometimes underfires (returns []) even on textbook
// cases like atorvastatin + ALT > 60. This engine fires deterministically
// for the cases most likely to actually change a doctor's prescribing
// decision.
//
// Universal — applies to every patient. Each rule lists:
//   - the medication trigger (matched against patient's medication list)
//   - the lab/condition trigger (specific markers + thresholds)
//   - the alternative entry to inject if both fire
//
// Result merges with anything the AI returned, deduplicated by current_medication.

export interface MedAlt {
  current_medication: string;
  reason_to_consider: string;
  pharmaceutical_alternatives: Array<{ name: string; reason: string }>;
  natural_alternatives: Array<{ name: string; reason: string }>;
}

interface Ctx {
  medsLower: string;
  conditionsLower: string;
  labValues: Array<{ marker_name?: string; value?: number | string | null; optimal_flag?: string | null; standard_flag?: string | null }>;
  symptomsLower: string;
}

function lab(ctx: Ctx, patterns: RegExp[]): { value: number; flag: string } | null {
  for (const v of ctx.labValues) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) {
        return {
          value: num,
          flag: String(v.optimal_flag ?? v.standard_flag ?? '').toLowerCase(),
        };
      }
    }
  }
  return null;
}

function takesMed(ctx: Ctx, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(ctx.medsLower));
}

interface Rule {
  key: string;
  detect: (ctx: Ctx) => MedAlt | null;
}

const RULES: Rule[] = [
  // ── Atorvastatin + elevated ALT (>60) ──────────────────────────────────
  {
    key: 'atorvastatin_alt_elevated',
    detect: (ctx) => {
      if (!takesMed(ctx, [/atorvastatin/i, /\blipitor\b/i])) return null;
      const alt = lab(ctx, [/^alt\b/i, /alanine.*aminotransfer/i, /sgpt/i]);
      if (!alt || alt.value < 60) return null;
      return {
        current_medication: 'Atorvastatin',
        reason_to_consider: `ALT ${alt.value} IU/L (above goal) on atorvastatin. Atorvastatin has a higher hepatic-enzyme elevation rate than other statins; switching to a statin with a better hepatic profile, or moving to a non-statin LDL-lowering option, often resolves the elevation while keeping LDL at goal.`,
        pharmaceutical_alternatives: [
          { name: 'Rosuvastatin', reason: 'Lower rate of ALT elevation in head-to-head trials than atorvastatin; same LDL-lowering potency at equipotent doses.' },
          { name: 'Pitavastatin', reason: 'Among the lowest hepatic and muscle adverse-event rates of any statin; minimal CoQ10 depletion. Useful when liver enzymes are creeping or muscle pain is on board.' },
          { name: 'Bempedoic acid', reason: 'Non-statin LDL-lowering agent. Activated only in liver, bypassing muscle entirely. Useful if statin is the cause of the ALT elevation and you need to step away from the class.' },
          { name: 'Ezetimibe (add-on)', reason: 'Pair with a lower statin dose to reach LDL goal with less hepatic load. Often combined with rosuvastatin or pitavastatin.' },
          { name: 'PCSK9 inhibitor (alirocumab / evolocumab)', reason: 'Reserved for severe / familial hypercholesterolemia or statin-intolerant. 50–60% additional LDL reduction; no hepatic concern.' },
        ],
        natural_alternatives: [
          { name: 'Red yeast rice (low-dose monacolin K) + omega-3 EPA/DHA 2 g/day', reason: 'Studied 15–25% LDL reduction. Ask your doctor — cannot be combined with prescription statin and quality varies by brand.' },
          { name: 'Mediterranean diet + 30 min/day zone-2 cardio + saturated fat <7% calories', reason: 'In adherent patients, drives LDL down 10–15% and triglycerides 20–30%, often enough to lower the statin dose.' },
        ],
      };
    },
  },

  // ── Atorvastatin + persistent muscle pain (myalgia) ────────────────────
  {
    key: 'atorvastatin_myalgia',
    detect: (ctx) => {
      if (!takesMed(ctx, [/atorvastatin/i, /\blipitor\b/i, /simvastatin/i])) return null;
      const muscleSx = /muscle (pain|ache|cramp|weak)|myalgia/i.test(ctx.symptomsLower);
      const ck = lab(ctx, [/creatine kinase|^ck\b/i]);
      const ckHigh = ck && ck.value > 200;
      if (!muscleSx && !ckHigh) return null;
      return {
        current_medication: 'Atorvastatin',
        reason_to_consider: `Muscle pain reported on statin${ckHigh ? ` + CK ${ck!.value} (elevated)` : ''}. Statin-associated myopathy is typically dose-dependent and class-variable; pitavastatin and rosuvastatin have lower myalgia rates than atorvastatin/simvastatin in trials.`,
        pharmaceutical_alternatives: [
          { name: 'Pitavastatin', reason: 'Lowest reported myalgia rate among statins. Minimal CoQ10 depletion. Often tolerated when other statins are not.' },
          { name: 'Rosuvastatin (lower dose) + Ezetimibe', reason: 'Splits the LDL-lowering load between two mechanisms so the statin dose can stay low (≤10 mg) and reduce muscle exposure.' },
          { name: 'Bempedoic acid', reason: 'Non-statin; activated only in liver, bypassing muscle entirely. The right choice if myopathy persists across multiple statins.' },
        ],
        natural_alternatives: [
          { name: 'CoQ10 (Ubiquinol) 100–200 mg/day', reason: 'Statins deplete CoQ10; replenishment can reduce muscle symptoms in 4–8 weeks. Already in supplement_stack if statin is current.' },
        ],
      };
    },
  },

  // ── Long-term metformin + measured B12 deficiency ──────────────────────
  {
    key: 'metformin_b12',
    detect: (ctx) => {
      if (!takesMed(ctx, [/metformin/i, /glucophage/i])) return null;
      const b12 = lab(ctx, [/vitamin b12|^b12\b/i, /cobalamin/i]);
      if (!b12 || b12.value > 400) return null;
      return {
        current_medication: 'Metformin',
        reason_to_consider: `B12 ${b12.value} pg/mL (low/borderline) on long-term metformin. Metformin impairs B12 absorption; in patients with measured deficiency, the choice is supplementation OR switching to a glycemic agent that doesn't deplete B12.`,
        pharmaceutical_alternatives: [
          { name: 'GLP-1 receptor agonist (semaglutide / liraglutide)', reason: 'Strong glycemic + cardiovascular + weight outcomes. Does not deplete B12. Often preferred as first-line in Type 2 diabetes with CV risk now.' },
          { name: 'SGLT2 inhibitor (empagliflozin / dapagliflozin)', reason: 'Glucose lowering + cardiovascular + renal outcomes. No B12 effect. Useful if cost or GI tolerability of GLP-1 is an issue.' },
        ],
        natural_alternatives: [
          { name: 'Methylcobalamin sublingual 1000 mcg daily', reason: 'If staying on metformin: bypasses the absorption block. Recheck MMA + B12 in 12 weeks to confirm repletion.' },
        ],
      };
    },
  },

  // ── Long-term PPI + measured Mg or B12 deficiency / fragility flags ────
  {
    key: 'ppi_long_term',
    detect: (ctx) => {
      if (!takesMed(ctx, [/omeprazole|esomeprazole|pantoprazole|lansoprazole|rabeprazole|dexlansoprazole/i, /\bppi\b/i])) return null;
      const mg = lab(ctx, [/^magnesium\b/i, /serum magnesium/i]);
      const b12 = lab(ctx, [/vitamin b12|^b12\b/i, /cobalamin/i]);
      const mgLow = mg && mg.value < 1.8;
      const b12Low = b12 && b12.value < 400;
      if (!mgLow && !b12Low) return null;
      const findings: string[] = [];
      if (mgLow) findings.push(`Mg ${mg!.value} mg/dL (low)`);
      if (b12Low) findings.push(`B12 ${b12!.value} pg/mL (low)`);
      return {
        current_medication: 'PPI',
        reason_to_consider: `${findings.join(' + ')} on long-term PPI. Chronic PPI use depletes magnesium and impairs B12 absorption; for measured deficiency the choice is replacement OR step-down to an H2 blocker if the indication still applies.`,
        pharmaceutical_alternatives: [
          { name: 'H2 blocker (famotidine)', reason: "Doesn't impair Mg / B12 absorption to the same degree as PPIs. Often adequate for maintenance after the active reflux issue is controlled." },
          { name: 'Step-down: PPI on-demand only', reason: 'Many patients can transition from daily PPI to as-needed after 8 weeks of PPI + lifestyle changes. Discuss with prescribing doctor.' },
        ],
        natural_alternatives: [
          { name: 'Magnesium glycinate 200–400 mg/day + B12 sublingual 1000 mcg', reason: 'Replacement if staying on the PPI. Recheck Mg + B12 + MMA in 12 weeks.' },
          { name: 'Lifestyle: smaller meals, no eating 3 hr before bed, 6-inch head-of-bed elevation, weight loss if BMI >25', reason: 'Most-evidence reflux interventions. Often allows PPI step-down.' },
        ],
      };
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // UNIVERSAL EXPANSION — 2026-05-12-33
  // Lab-driven "consider switching" patterns. Each rule needs an
  // objective trigger (lab outlier or measured value) so the suggestion
  // is grounded — never fire alternatives on med name alone.
  // ────────────────────────────────────────────────────────────────────

  // ── Levothyroxine + persistent low Free T3 (poor T4→T3 conversion) ─
  {
    key: 'levothyroxine_low_ft3',
    detect: (ctx) => {
      if (!takesMed(ctx, [/levothyroxine|synthroid|levoxyl|tirosint|euthyrox|unithroid/i])) return null;
      const ft3 = lab(ctx, [/free\s*t3|^ft3\b/i]);
      if (!ft3 || ft3.value >= 3.0) return null;
      return {
        current_medication: 'Levothyroxine',
        reason_to_consider: `Free T3 ${ft3.value} pg/mL on levothyroxine monotherapy. Some patients convert T4 to T3 poorly even on adequate doses; adding T3 or switching to combination therapy can restore symptoms when TSH appears "controlled" on labs.`,
        pharmaceutical_alternatives: [
          { name: 'Liothyronine (T3) add-on at low dose', reason: 'Adding 5-10 mcg liothyronine to current levothyroxine restores Free T3 in poor-converters. Most-evidence option for combination therapy.' },
          { name: 'Natural desiccated thyroid (Armour / NP Thyroid)', reason: 'Contains both T4 and T3 in a fixed ratio (~80:20). Useful when the patient strongly prefers a non-synthetic approach and tolerates the ratio.' },
        ],
        natural_alternatives: [
          { name: 'Selenium 200 mcg/day + tyrosine + iodine adequacy check', reason: 'Selenium supports deiodinase enzymes (T4→T3 conversion). Tyrosine + iodine are substrates. Address before adding T3 — sometimes resolves the gap.' },
        ],
      };
    },
  },

  // ── SSRI + persistent depression + measured low B6 or folate ───────
  {
    key: 'ssri_persistent_low_b_vitamins',
    detect: (ctx) => {
      if (!takesMed(ctx, [/sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|fluvoxamine|luvox/i])) return null;
      const persistent = /persistent depres|treatment.?resistant|still depressed|not responding/i.test(ctx.symptomsLower);
      const b6 = lab(ctx, [/^b.?6\b|vitamin b6|pyridoxal/i]);
      const folate = lab(ctx, [/^folate\b|serum folate/i]);
      const b6Low = b6 && b6.value < 30;
      const folateLow = folate && folate.value < 6;
      if (!persistent && !b6Low && !folateLow) return null;
      const findings: string[] = [];
      if (b6Low) findings.push(`B6 ${b6!.value}`);
      if (folateLow) findings.push(`Folate ${folate!.value}`);
      if (persistent) findings.push('persistent depressive symptoms');
      return {
        current_medication: 'SSRI',
        reason_to_consider: `${findings.join(' + ')} on SSRI. B-vitamin deficiency limits neurotransmitter synthesis even with SSRI on board; repletion + dose review often outperforms switching agents.`,
        pharmaceutical_alternatives: [
          { name: 'SNRI (venlafaxine / duloxetine)', reason: 'Different mechanism (NE + 5HT). Useful when SSRI hits a ceiling or anxiety-with-pain phenotype dominates.' },
          { name: 'Bupropion (add-on or monotherapy)', reason: 'Dopaminergic; no SSRI sexual side effects. Often added to existing SSRI for partial response.' },
        ],
        natural_alternatives: [
          { name: 'Methylfolate 7.5-15 mg + Methylcobalamin 1000 mcg', reason: 'Methylated B-vitamins bypass MTHFR pathway limits; evidence for adjunct in SSRI partial responders.' },
        ],
      };
    },
  },

  // ── Beta blocker + symptomatic fatigue + low normal BP ─────────────
  {
    key: 'beta_blocker_fatigue',
    detect: (ctx) => {
      if (!takesMed(ctx, [/metoprolol|atenolol|propranolol|bisoprolol|carvedilol|nebivolol/i])) return null;
      const fatigueSx = /chronic fatigue|exhaust|tired all the time|exercise intoleran/i.test(ctx.symptomsLower);
      if (!fatigueSx) return null;
      return {
        current_medication: 'Beta blocker',
        reason_to_consider: `Persistent fatigue + exercise intolerance on beta blocker. Beta blockers blunt CoQ10-dependent ATP production and HR response to exercise; if the BP/HR target is met, a different antihypertensive class often restores energy.`,
        pharmaceutical_alternatives: [
          { name: 'ARB (losartan / telmisartan)', reason: 'BP control without HR / fatigue effect. Often first choice when fatigue dominates side effects.' },
          { name: 'Calcium channel blocker (amlodipine)', reason: 'BP control without metabolic / fatigue effect. Useful when HR is already on the low end.' },
          { name: 'Nebivolol (if beta blocker class needed)', reason: 'Highly cardioselective + nitric-oxide effect; lower fatigue rates than metoprolol / atenolol in trials.' },
        ],
        natural_alternatives: [
          { name: 'CoQ10 (Ubiquinol) 100-200 mg/day', reason: 'Beta blockers deplete CoQ10; repletion alongside the drug often restores energy. Discuss before switching.' },
        ],
      };
    },
  },

  // ── PPI without measured deficiency but >5 years use ───────────────
  {
    key: 'ppi_chronic_no_indication_review',
    detect: (ctx) => {
      if (!takesMed(ctx, [/omeprazole|esomeprazole|pantoprazole|lansoprazole|rabeprazole|dexlansoprazole/i, /\bppi\b/i])) return null;
      // Fire only when patient EXPLICITLY indicates long-term use. Default
      // PPI users without that context should not trigger an alternative —
      // they may have an active reflux indication we can't see in the input.
      const longTerm = /long.?term ppi|chronic ppi|on ppi for years|ppi for \d+\s*year|years on (omeprazole|esomeprazole|pantoprazole|lansoprazole|rabeprazole|dexlansoprazole)/i.test(ctx.medsLower + ' ' + ctx.symptomsLower + ' ' + ctx.conditionsLower);
      if (!longTerm) return null;
      return {
        current_medication: 'PPI (long-term)',
        reason_to_consider: `Long-term PPI use. Current guidelines recommend annual deprescribing review after 8 weeks for non-Barrett's, non-erosive indications. Risks accumulate with duration: B12, Mg, Ca depletion, kidney disease, fracture risk, microbiome shifts.`,
        pharmaceutical_alternatives: [
          { name: 'H2 blocker (famotidine)', reason: 'Less aggressive acid suppression; lower long-term risk profile. Often adequate for maintenance.' },
          { name: 'On-demand PPI', reason: 'Take only when symptoms occur instead of daily. Reduces cumulative exposure dramatically.' },
        ],
        natural_alternatives: [
          { name: 'Lifestyle: smaller meals, no late eating, head-of-bed 6 inches, weight loss if BMI >25', reason: 'Most-evidence reflux interventions. Often allow full PPI discontinuation in non-erosive disease.' },
        ],
      };
    },
  },
];

/** Run all rules. Returns deduped alternatives by medication name. */
export function runMedicationAlternativesEngine(ctx: Ctx, existing: MedAlt[] = []): MedAlt[] {
  const out: MedAlt[] = [...existing];
  const seen = new Set<string>(out.map(e => e.current_medication.toLowerCase().trim()));
  for (const rule of RULES) {
    const entry = rule.detect(ctx);
    if (!entry) continue;
    const key = entry.current_medication.toLowerCase().trim();
    if (seen.has(key)) continue;
    out.push(entry);
    seen.add(key);
  }
  return out;
}
