// supabase/functions/_shared/expectedFindings.ts
//
// EXPECTED-FINDING SUPPRESSOR
// ===========================
// Universal rule layer: when a known active condition explains a flagged
// lab value, EVERY downstream surface (Lab Analysis card, Wellness Plan
// headline, Doctor Prep) must acknowledge the value as "expected for
// your [condition]" rather than alarm the user.
//
// The Marisa Sirkin audit revealed why this matters. Marisa has Gilbert
// syndrome (E80.4); her total bilirubin was 1.8 mg/dL. The Doctor Prep
// correctly said "expected with Gilbert syndrome — no action needed,"
// but the Wellness Plan headline said "Bilirubin, Total 1.8 mg/dL needs
// attention." Same data, opposite messages on two surfaces. Trust killer.
//
// Fix: single source of truth. Run computeExpectedFindings() once in
// factsCache.loadOrComputeFacts() per analysis. The output array is
// stored in facts.expectedFindings and surfaced to every AI prompt as
// EXPECTED_FINDINGS. Each prompt is instructed:
//   "When a marker appears in EXPECTED_FINDINGS, do not alarm. Reference
//    the source condition. Do not recommend testing or supplements
//    against that marker alone — it is expected for this patient."
//
// Universal — add a row, every patient benefits. Each rule is a pure
// function of (labValues, conditions). No AI judgment involved at the
// suppression layer; AI only renders the explanation.

// hasCondition is intentionally NOT imported here. Each rule does its
// own focused regex on the lowercase conditions string — that keeps the
// suppression logic auditable and prevents alias drift from affecting
// downstream prompts. (Re-export below is for callers that want the
// helper without two imports.)

export interface ExpectedFindingsCtx {
  /** Active conditions joined lowercase, e.g. "gilbert syndrome|asthma|...". */
  conditionsLower: string;
  /** Biological sex. Some pregnancy-aware rules only apply to female. */
  sex: 'male' | 'female' | null;
  /** TRUE when the patient is pregnant / trying / breastfeeding / declined
   *  to answer (female). Drives the pregnancy-aware suppression rules
   *  (high prolactin, high estradiol, low FSH all become expected under
   *  pregnancy / lactation physiology). Read from profiles.is_pregnant,
   *  which the migration 20260511_pregnancy_status trigger derives from
   *  the user's explicit onboarding answer. */
  isPregnant: boolean;
  /** Lab values for this draw (raw rows). */
  labValues: Array<{
    marker_name?: string;
    value?: number | string | null;
    unit?: string | null;
    standard_high?: number | string | null;
    standard_low?: number | string | null;
    optimal_flag?: string | null;
  }>;
}

export interface ExpectedFinding {
  /** Stable id, e.g. 'gilbert_bilirubin'. Used for dedup + telemetry. */
  key: string;
  /** Exact marker name to suppress alarming language on. */
  marker: string;
  /** The active condition that explains the value. */
  conditionLabel: string;
  /** Short, plain-English explanation. < 200 chars. */
  rationale: string;
  /** Optional safety floor: if the marker exceeds this multiple of ULN,
   *  the suppression does NOT apply — escalation is warranted. */
  safetyCeiling?: { type: 'multiple_of_ULN' | 'absolute'; value: number };
}

interface ExpectedFindingRule {
  key: string;
  /** Predicate over the FULL context, not just conditionsLower. Lets a
   *  rule fire on isPregnant + sex without polluting the conditions
   *  string with virtual markers. */
  predicate: (ctx: ExpectedFindingsCtx) => boolean;
  conditionLabel: string;
  /** Marker matcher (case-insensitive regex on marker_name). */
  markerMatcher: RegExp;
  /** Plain-English rationale. < 200 chars. */
  rationale: string;
  /** Optional: only fire when the lab value's flag is in this set. */
  flagsToSuppress?: string[];
  /** Optional safety override — if exceeded, drop the suppression. */
  safetyCeiling?: { type: 'multiple_of_ULN' | 'absolute'; value: number };
}

// ──────────────────────────────────────────────────────────────────────
// Universal rule table. Add a row → covers every patient with the
// condition automatically. Conservative on inclusion: only add a rule
// when the relationship is well-established clinically AND the safety
// ceiling protects against missing a worsening case.
// ──────────────────────────────────────────────────────────────────────
const RULES: ExpectedFindingRule[] = [
  // ── Gilbert syndrome → bilirubin elevation expected ────────────────
  {
    key: 'gilbert_bilirubin',
    predicate: (ctx) => /\bgilbert/i.test(ctx.conditionsLower),
    conditionLabel: 'Gilbert syndrome',
    markerMatcher: /^bilirubin,?\s*total$|^total\s+bilirubin$/i,
    rationale:
      "Bilirubin in the 1–3 mg/dL range is expected with Gilbert syndrome — a benign inherited variant where the liver clears bilirubin more slowly. Not a sign of liver injury. No action needed unless symptoms or other liver markers change.",
    flagsToSuppress: ['high', 'critical_high', 'watch'],
    safetyCeiling: { type: 'absolute', value: 5.0 },
  },

  // ── Documented CKD → eGFR drift expected ────────────────────────────
  {
    key: 'ckd_egfr',
    predicate: (ctx) => /\bckd\b|chronic\s+kidney\s+disease|nephrop/i.test(ctx.conditionsLower),
    conditionLabel: 'chronic kidney disease',
    markerMatcher: /^egfr$|^estimated\s+gfr/i,
    rationale:
      "eGFR below 90 is expected with documented CKD — the reduced filtration is part of the diagnosis. Bring the trend (not the absolute value) to your nephrologist.",
    flagsToSuppress: ['low', 'critical_low', 'watch'],
    safetyCeiling: { type: 'absolute', value: 15 },
  },

  // ── Documented diabetes → A1c elevation expected ────────────────────
  {
    key: 't1d_a1c',
    predicate: (ctx) => /type\s*1\s*diabetes|t1dm\b|type\s*i\s*diabetes/i.test(ctx.conditionsLower),
    conditionLabel: 'type 1 diabetes',
    markerMatcher: /^(hemoglobin\s+)?a1c$|^hba1c$/i,
    rationale:
      "A1c reflects your overall glucose control with documented T1D — bring it to your endocrinologist as part of your usual follow-up. Sudden changes from your baseline are what warrant attention.",
    flagsToSuppress: ['high', 'critical_high', 'watch'],
    safetyCeiling: { type: 'absolute', value: 12 },
  },
  {
    key: 't2d_a1c',
    predicate: (ctx) => /type\s*2\s*diabetes|t2dm\b|type\s*ii\s*diabetes/i.test(ctx.conditionsLower),
    conditionLabel: 'type 2 diabetes',
    markerMatcher: /^(hemoglobin\s+)?a1c$|^hba1c$/i,
    rationale:
      "A1c reflects your overall glucose control with documented T2D — bring it to your physician as part of your usual diabetes follow-up. A jump from your baseline (rather than the absolute value) is what to flag.",
    flagsToSuppress: ['high', 'critical_high', 'watch'],
    safetyCeiling: { type: 'absolute', value: 12 },
  },

  // ── Pregnancy / lactation → HPG-axis shifts expected ────────────────
  //
  // The Marisa Sirkin audit (27F, prenatal vitamin) revealed the failure
  // mode that drives these rules. In pregnancy / breastfeeding, the HPG
  // axis is intentionally remodeled by chorionic gonadotropin, placental
  // estrogens, and prolactin. Common values:
  //   • Prolactin 100–500 ng/mL during pregnancy, 100–300 while nursing
  //   • Estradiol rises through the trimesters; postpartum stays elevated
  //     until lactation winds down
  //   • FSH suppressed by negative feedback from elevated estrogen
  //
  // Flagging these as "drift" or "hyperprolactinemia workup" misleads
  // the patient and her clinician. Suppression here makes every surface
  // acknowledge the physiologic state rather than chase a pituitary
  // workup.
  //
  // Predicate: sex === 'female' AND isPregnant === true. The is_pregnant
  // boolean is derived in DB from the user's explicit pregnancy_status
  // answer (pregnant / trying / breastfeeding / prefer_not_to_say).
  {
    key: 'pregnancy_prolactin',
    predicate: (ctx) => ctx.sex === 'female' && ctx.isPregnant === true,
    conditionLabel: 'pregnancy / lactation',
    markerMatcher: /^prolactin$/i,
    rationale:
      "Prolactin runs high during pregnancy and breastfeeding by design — it's how the body prepares and maintains milk supply. This elevation is physiologic, not a pituitary issue. Repeat after you finish breastfeeding (or after delivery if not nursing) — that's when a baseline value is meaningful.",
    flagsToSuppress: ['high', 'critical_high', 'watch'],
    // Safety ceiling: prolactin >300 ng/mL in a non-pregnant patient is
    // concerning. In pregnancy 200–500 can be normal. We set the ceiling
    // generously high (1000) so only truly extreme values escalate.
    safetyCeiling: { type: 'absolute', value: 1000 },
  },
  {
    key: 'pregnancy_estradiol',
    predicate: (ctx) => ctx.sex === 'female' && ctx.isPregnant === true,
    conditionLabel: 'pregnancy / lactation',
    markerMatcher: /^estradiol$|^e2$/i,
    rationale:
      "Estradiol climbs dramatically through pregnancy and stays elevated postpartum until cycles resume. A value at or above the standard reference range is expected during this window.",
    flagsToSuppress: ['high', 'critical_high', 'watch'],
  },
  {
    key: 'pregnancy_fsh_suppression',
    predicate: (ctx) => ctx.sex === 'female' && ctx.isPregnant === true,
    conditionLabel: 'pregnancy / lactation',
    markerMatcher: /^fsh$|^follicle[\s-]*stimulating/i,
    rationale:
      "FSH is suppressed during pregnancy and breastfeeding — high circulating estrogen and prolactin shut down the pituitary's signal to the ovaries. A low FSH in this context is expected, not a sign of ovarian failure.",
    flagsToSuppress: ['low', 'critical_low', 'watch'],
  },
  {
    key: 'pregnancy_lh_suppression',
    predicate: (ctx) => ctx.sex === 'female' && ctx.isPregnant === true,
    conditionLabel: 'pregnancy / lactation',
    markerMatcher: /^lh$|^luteinizing\s+hormone$/i,
    rationale:
      "LH is suppressed alongside FSH during pregnancy and breastfeeding — same negative-feedback mechanism. Expect to see it recover after lactation ends.",
    flagsToSuppress: ['low', 'critical_low', 'watch'],
  },
];

/**
 * Universal expected-finding computer.
 *
 * Returns a list of suppression entries: each says "this marker is
 * expected because of this condition — every downstream surface should
 * acknowledge rather than alarm."
 *
 * Pure function. No side effects. Safe to call from any cache layer.
 *
 * Safety ceiling: if a value exceeds the ceiling, the suppression is
 * dropped — the value warrants attention even with the explaining
 * condition.
 */
export function computeExpectedFindings(
  ctx: ExpectedFindingsCtx,
): ExpectedFinding[] {
  const out: ExpectedFinding[] = [];

  for (const rule of RULES) {
    if (!rule.predicate || !rule.markerMatcher) continue;
    if (!rule.predicate(ctx)) continue;

    for (const lab of ctx.labValues ?? []) {
      const name = String(lab.marker_name ?? '');
      if (!rule.markerMatcher.test(name)) continue;

      // Flag gate (if set) — only suppress for the specified flags.
      if (rule.flagsToSuppress && lab.optimal_flag) {
        if (!rule.flagsToSuppress.includes(String(lab.optimal_flag))) continue;
      }

      // Safety ceiling — preserve escalation when value is genuinely
      // dangerous despite the explaining condition.
      const val = typeof lab.value === 'number' ? lab.value : parseFloat(String(lab.value ?? ''));
      if (Number.isFinite(val) && rule.safetyCeiling) {
        if (rule.safetyCeiling.type === 'absolute' && val > rule.safetyCeiling.value) continue;
        if (rule.safetyCeiling.type === 'multiple_of_ULN') {
          const uln = typeof lab.standard_high === 'number'
            ? lab.standard_high
            : parseFloat(String(lab.standard_high ?? ''));
          if (Number.isFinite(uln) && val > uln * rule.safetyCeiling.value) continue;
        }
      }

      out.push({
        key: rule.key,
        marker: name,
        conditionLabel: rule.conditionLabel,
        rationale: rule.rationale,
        safetyCeiling: rule.safetyCeiling,
      });
    }
  }

  // Dedup on (key + marker).
  const seen = new Set<string>();
  return out.filter(e => {
    const id = `${e.key}::${e.marker.toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Convenience: true if a given marker name is on the suppression list
 *  for this patient. Used by outlier-rendering paths to swap alarming
 *  prose for the expected-finding rationale. */
export function isExpectedFinding(
  markerName: string,
  expected: ExpectedFinding[],
): ExpectedFinding | null {
  if (!expected?.length) return null;
  const lc = markerName.toLowerCase();
  return expected.find(e => e.marker.toLowerCase() === lc) ?? null;
}

// Re-export hasCondition so callers that already have access to this
// module don't need to import twice. (Lazy re-import to avoid an
// unused-import lint when the calling files don't reference it.)
export { hasCondition } from './conditionAliases.ts';
