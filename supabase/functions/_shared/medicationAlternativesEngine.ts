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
