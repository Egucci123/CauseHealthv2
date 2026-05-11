// supabase/functions/_shared/rules/proseRules.ts
//
// CANONICAL PROSE LAYER — cross-surface connective tissue
// ========================================================
// For every condition, lab outlier, supplement, goal, and alert, this
// module produces ONE canonical sentence. That sentence is rendered
// IDENTICALLY on lab analysis, wellness plan, and doctor prep. The AI
// prose layer adds CONTEXT around these strings — it never replaces
// them. Same patient → same sentences across all three surfaces.
//
// Universal: applies to every patient with these patterns. Edit a
// canonical sentence here once → changes everywhere.
//
// Architecture rule: if a sentence appears on more than one surface and
// must read the same on each, it lives here. If it's surface-specific
// prose (e.g., the wellness "summary" or the doctor prep "clinical
// snapshot"), the AI writes it.

import type { ClinicalFacts, LabOutlierFact } from '../buildPlan.ts';
import type { SuspectedConditionFact } from './conditionRules.ts';
import type { SupplementCandidate } from './supplementRules.ts';
import type { GoalTarget } from './goalRules.ts';
import type { EmergencyAlertFact } from './alertRules.ts';

// ──────────────────────────────────────────────────────────────────────
// CANONICAL PROSE — what the patient reads on every surface
// ──────────────────────────────────────────────────────────────────────

export interface CanonicalCondition {
  key: string;
  one_liner: string;          // headline-style verdict, ≤140 chars
  evidence_sentence: string;  // why we flagged it (already in fact.evidence — echoed for clarity)
  patient_question: string;   // "what to ask your doctor" (already in fact — echoed)
  next_step_sentence: string; // ONE sentence on what to do next
}

export interface CanonicalOutlier {
  marker: string;
  flag: LabOutlierFact['flag'];
  one_liner: string;          // "ALT 97 IU/L is more than 2x the upper limit." (≤140 chars)
  what_it_means: string;      // ≤220 chars — calm, plain English
}

export interface CanonicalSupplement {
  key: string;
  one_liner: string;          // "CoQ10 100-200mg with breakfast — counters statin-driven depletion."
}

export interface CanonicalGoal {
  key: string;
  one_liner: string;          // "ALT goal: 49 IU/L in 12 weeks — a 49% drop with consistent adherence."
}

export interface CanonicalAlert {
  key: string;
  one_liner: string;          // "Potassium 2.3 mEq/L is in critical range — talk with your doctor today."
}

export interface CanonicalProseBundle {
  conditions: CanonicalCondition[];
  outliers: CanonicalOutlier[];
  supplements: CanonicalSupplement[];
  goals: CanonicalGoal[];
  alerts: CanonicalAlert[];
}

// ──────────────────────────────────────────────────────────────────────
// CONDITION ONE-LINERS — keyed by condition.key (stable across surfaces)
// ──────────────────────────────────────────────────────────────────────
const CONDITION_ONE_LINERS: Record<string, (c: SuspectedConditionFact) => string> = {
  nafld: (c) => `Fatty liver pattern with ${c.confidence === 'high' ? 'high' : 'moderate'} confidence — driven by insulin resistance and elevated triglycerides.`,
  hemoconcentration_dehydration: () => `Blood components reading high because plasma volume is low — most likely chronic underhydration, not overproduction.`,
  insulin_resistance_dyslipidemia: () => `Pattern of high triglycerides + low HDL + glucose drift fits early insulin resistance, before A1c crosses diabetic range.`,
  sleep_apnea: () => `Elevated red blood cell pattern + sleep symptoms fit nocturnal hypoxia — sleep apnea worth ruling out.`,
  inflammation_cv_amplifier: () => `Chronic inflammation (hs-CRP elevated) on top of metabolic risk — independently raises 10-yr cardiovascular risk.`,
  subclinical_hypothyroidism: () => `TSH in the upper-normal range with thyroid-pattern symptoms — early autoimmune thyroid worth confirming.`,
  hashimoto_or_hypothyroid: () => `Pattern fits Hashimoto's autoimmune thyroiditis — antibodies + Free T3/T4 confirm.`,
  pcos: () => `Cycle / acne / hirsutism pattern with metabolic markers fits PCOS — androgen + insulin workup confirms.`,
  undiagnosed_t2d: () => `A1c is in the diabetic range — confirmation lab plus next-step plan with your PCP.`,
  prediabetes: () => `A1c in the prediabetic range — early intervention typically reverses this in 6-12 months.`,
  iron_deficiency_anemia: () => `Iron stores low with anemia — repletion + screening for the cause is the next step.`,
  b12_deficiency: () => `B12 functionally low — methylcobalamin repletion + cause workup (PPI / metformin / GI absorption).`,
  hereditary_hemochromatosis: () => `Iron overload pattern — genetic testing rules out hereditary hemochromatosis.`,
  postmenopause: () => `FSH + symptoms fit postmenopause — confirms expected hormonal transition.`,
  low_testosterone_male: () => `Testosterone low — confirmation draw + workup for cause (sleep / metabolic / pituitary).`,
  vitamin_d_deficiency: () => `Vitamin D deficient — repletion typically restores levels in 12 weeks.`,
  atherogenic_dyslipidemia: () => `Particle pattern fits atherogenic dyslipidemia — ApoB + Lp(a) confirm.`,
  familial_hypercholesterolemia: () => `Cholesterol pattern fits familial hypercholesterolemia — genetic risk worth confirming.`,
  polymyalgia_rheumatica: () => `Age + inflammation + shoulder/hip pattern fits PMR — rheumatology referral worth considering.`,
  mm_red_flag: () => `CRAB-pattern markers raise multiple myeloma red flag — rule-out workup worth ordering.`,
};

const CONDITION_NEXT_STEPS: Record<string, string> = {
  nafld: `Liver ultrasound (or FibroScan if available) confirms; lifestyle + lipid control reverses early-stage NAFLD.`,
  hemoconcentration_dehydration: `2-week hydration trial (3 L/day + electrolytes) followed by repeat CBC + albumin.`,
  insulin_resistance_dyslipidemia: `Fasting Insulin + HOMA-IR + ApoB confirm. Lifestyle responds within 12 weeks.`,
  sleep_apnea: `STOP-BANG questionnaire is free; home sleep study (HSAT) is covered with positive screen.`,
  inflammation_cv_amplifier: `Repeat hs-CRP at 12 weeks. ApoB + CAC inform statin intensity.`,
  subclinical_hypothyroidism: `Free T3, Free T4, TPO antibodies, Tg antibodies — full thyroid workup.`,
  hashimoto_or_hypothyroid: `TPO + Tg antibodies + Free T4 — confirms autoimmune basis.`,
  pcos: `Total + Free testosterone, SHBG, DHEA-S, LH/FSH ratio, fasting insulin.`,
  undiagnosed_t2d: `Repeat A1c + fasting glucose. Endocrinology referral if confirmed.`,
  prediabetes: `Fasting Insulin + HOMA-IR. 12-week lifestyle intervention reverses ~60% of cases.`,
  iron_deficiency_anemia: `Iron Panel + ferritin + GI workup if no obvious cause.`,
  b12_deficiency: `MMA + homocysteine confirm tissue deficiency. Sublingual or IM repletion.`,
  hereditary_hemochromatosis: `HFE gene testing. Therapeutic phlebotomy if confirmed.`,
  postmenopause: `Bone density (DEXA), lipid optimization, GSM management discussion.`,
  low_testosterone_male: `Repeat AM testosterone + LH/FSH + prolactin + sleep study before TRT discussion.`,
  vitamin_d_deficiency: `D3 4000 IU daily, retest at 12 weeks. PTH + calcium if severely low.`,
  atherogenic_dyslipidemia: `ApoB, Lp(a), CAC score guide statin intensity.`,
  familial_hypercholesterolemia: `Lipid genetics; if confirmed, family screening + early statin.`,
  polymyalgia_rheumatica: `ESR + CRP + rheumatology referral; trial of low-dose prednisone is diagnostic.`,
  mm_red_flag: `SPEP, serum free light chains, immunofixation, 24-hour urine.`,
};

function buildConditionProse(c: SuspectedConditionFact): CanonicalCondition {
  const oneLiner = CONDITION_ONE_LINERS[c.key]?.(c)
    ?? `${c.name} pattern detected with ${c.confidence} confidence.`;
  const nextStep = CONDITION_NEXT_STEPS[c.key]
    ?? `Confirmatory tests + your PCP's interpretation guide next steps.`;
  return {
    key: c.key,
    one_liner: oneLiner.slice(0, 140),
    evidence_sentence: c.evidence,
    patient_question: c.what_to_ask_doctor,
    next_step_sentence: nextStep,
  };
}

// ──────────────────────────────────────────────────────────────────────
// LAB OUTLIER ONE-LINERS — same wording on every surface
// ──────────────────────────────────────────────────────────────────────
function buildOutlierProse(o: LabOutlierFact): CanonicalOutlier {
  const flag = o.flag;
  const m = o.marker;
  const v = o.value;
  const u = o.unit || '';

  // Universal templates per (marker family, flag).
  let oneLiner: string;
  let meaning: string;

  if (/^alt|sgpt|alanine/i.test(m)) {
    if (flag === 'critical_high' || (flag === 'high' && v >= 70)) {
      oneLiner = `ALT ${v} ${u} is more than 2× the upper reference limit.`;
      meaning = `Liver enzymes this high usually mean hepatic stress — fatty liver, medication side effect, or active inflammation. Imaging + GGT clarify the cause.`;
    } else {
      oneLiner = `ALT ${v} ${u} is above the lab's normal range.`;
      meaning = `Mild ALT elevation usually reflects metabolic strain, fatty infiltration, or medication effect. Recheck at 12 weeks tracks the trajectory.`;
    }
  } else if (/^ast|sgot|aspartate/i.test(m)) {
    oneLiner = `AST ${v} ${u} is above the lab's normal range.`;
    meaning = `AST elevation alongside ALT supports hepatic origin. The AST/ALT ratio helps distinguish causes — most non-alcoholic patterns stay <1.`;
  } else if (/triglyc/i.test(m)) {
    if (v >= 500) {
      oneLiner = `Triglycerides ${v} ${u} are in the very-high range.`;
      meaning = `Triglycerides above 500 raise pancreatitis risk and need aggressive control. Omega-3, dietary change, and possible medication are first-line.`;
    } else if (v >= 200) {
      oneLiner = `Triglycerides ${v} ${u} are above goal.`;
      meaning = `Triglycerides this high usually mean insulin resistance is brewing. Omega-3 + diet + sleep typically drop them 30-40% in 12 weeks.`;
    } else {
      oneLiner = `Triglycerides ${v} ${u} are mildly elevated.`;
      meaning = `Borderline triglycerides usually respond to omega-3 + cutting refined carbs.`;
    }
  } else if (/^ldl|ldl-c/i.test(m)) {
    oneLiner = `LDL ${v} ${u} is above the goal range.`;
    meaning = `LDL elevation drives cardiovascular plaque buildup over years. ApoB + Lp(a) refine the actual risk picture beyond the bare LDL number.`;
  } else if (/^hdl/i.test(m) && (flag === 'low' || flag === 'critical_low')) {
    oneLiner = `HDL ${v} ${u} is below the goal range.`;
    meaning = `Low HDL is part of the metabolic-syndrome pattern. Resistance training and omega-3 typically lift it within 12-16 weeks.`;
  } else if (/vitamin d|25.?hydroxy/i.test(m)) {
    if (v < 20) {
      oneLiner = `Vitamin D ${v} ${u} is severely deficient.`;
      meaning = `Severe deficiency drives fatigue, mood, immune function, and bone health. D3 4000 IU/day typically raises levels 10-15 ng/mL in 12 weeks.`;
    } else {
      oneLiner = `Vitamin D ${v} ${u} is in the in-range low end.`;
      meaning = `In-range-low vitamin D contributes to fatigue, mood, and immune dysregulation. D3 4000 IU/day with breakfast typically restores in 12 weeks.`;
    }
  } else if (/a1c|hba1c/i.test(m)) {
    if (v >= 6.5) {
      oneLiner = `A1c ${v}% is in the diabetic range.`;
      meaning = `A1c at this level suggests sustained glucose elevation. Repeat draw confirms; lifestyle + medication options follow.`;
    } else if (v >= 5.7) {
      oneLiner = `A1c ${v}% is in the prediabetic range.`;
      meaning = `Prediabetic A1c is reversible in most cases with lifestyle intervention. Fasting insulin + HOMA-IR identify the underlying driver.`;
    } else if (v >= 5.4) {
      oneLiner = `A1c ${v}% is at the upper edge of normal.`;
      meaning = `Watch-tier A1c suggests glucose handling is starting to drift. Early intervention here usually prevents progression to prediabetes.`;
    } else {
      oneLiner = `A1c ${v}% is within range.`;
      meaning = `A1c in the normal range — track at next retest.`;
    }
  } else if (/glucose|fasting glucose/i.test(m)) {
    oneLiner = `Glucose ${v} ${u} is ${flag === 'high' ? 'above' : 'in the upper part of'} the normal range.`;
    meaning = `Fasting glucose drift often appears before A1c does. Pair with fasting insulin for the full insulin-resistance picture.`;
  } else if (/^rbc|red blood/i.test(m) || /hematocrit|^hct/i.test(m) || /hemoglobin\b(?!\s*a1c)/i.test(m) || /\bhgb\b/i.test(m)) {
    oneLiner = `${m} ${v} ${u} is above the normal range.`;
    meaning = `Elevated red-cell markers can mean dehydration (concentrating the blood), nocturnal low oxygen, or a primary blood disorder — workup distinguishes them.`;
  } else if (/ferritin/i.test(m) && (flag === 'low' || flag === 'critical_low')) {
    oneLiner = `Ferritin ${v} ${u} is in the in-range low end.`;
    meaning = `Low ferritin often drives fatigue, hair shedding, and restless legs before hemoglobin drops. Iron repletion + cause workup are next.`;
  } else if (/hs[\s-]?crp|c[\s-]?reactive/i.test(m)) {
    if (v > 3.0) {
      oneLiner = `hs-CRP ${v} ${u} is in the high cardiovascular-risk range.`;
      meaning = `Sustained high-sensitivity CRP signals systemic inflammation — independently raises CV risk and amplifies metabolic concerns.`;
    } else {
      oneLiner = `hs-CRP ${v} ${u} is mildly elevated.`;
      meaning = `Low-grade inflammation usually responds to omega-3, sleep, and lower refined-carb intake within 8-12 weeks.`;
    }
  } else if (/albumin/i.test(m) && flag === 'high') {
    oneLiner = `Albumin ${v} ${u} is above the normal range.`;
    meaning = `Albumin doesn't rise physiologically — when it reads high, the most likely explanation is plasma concentration from dehydration.`;
  } else {
    // Universal fallback. Works for any marker.
    //
    // BUG-FIX (2026-05-10): the previous fallback treated any flag that
    // didn't contain "high" as "below the normal range" — which mislabeled
    // 'watch' values (within standard range but in the educational watch
    // tier) as below-range. Symptom: TSH 2.22 (upper-normal-watch) showed
    // as both "below the normal range" (here) and "upper-normal" (in
    // priority_findings) on the same page.
    //
    // Now distinguishes three flag classes:
    //   • critical_high / high  → "above the lab's normal range"
    //   • critical_low / low    → "below the lab's normal range"
    //   • watch                  → "within the standard range but in the
    //                              watch tier" (no above/below claim)
    if (flag === 'critical_high' || flag === 'high') {
      oneLiner = `${m} ${v} ${u} is above the lab's normal range.`;
      meaning = `${m} above-range. Discuss with your PCP; pair with a retest at 12 weeks if the cause is correctable.`;
    } else if (flag === 'critical_low' || flag === 'low') {
      oneLiner = `${m} ${v} ${u} is below the lab's normal range.`;
      meaning = `${m} below-range. Discuss with your PCP; pair with a retest at 12 weeks if the cause is correctable.`;
    } else {
      // 'watch' or anything else — within standard range but flagged.
      oneLiner = `${m} ${v} ${u} is within the standard reference range but in our educational watch tier.`;
      meaning = `Watch-tier ${m}. Not out of range — just a value worth tracking and discussing with your PCP at your next visit.`;
    }
  }

  return { marker: m, flag, one_liner: oneLiner.slice(0, 160), what_it_means: meaning.slice(0, 240) };
}

// ──────────────────────────────────────────────────────────────────────
// SUPPLEMENT ONE-LINERS — same on every surface
// ──────────────────────────────────────────────────────────────────────
function buildSupplementProse(s: SupplementCandidate): CanonicalSupplement {
  return {
    key: s.key,
    one_liner: `${s.nutrient} ${s.dose} (${s.timing.toLowerCase()}) — ${s.whyShort.toLowerCase()}.`.slice(0, 200),
  };
}

// ──────────────────────────────────────────────────────────────────────
// GOAL ONE-LINERS — same on every surface
// ──────────────────────────────────────────────────────────────────────
function buildGoalProse(g: GoalTarget): CanonicalGoal {
  return {
    key: g.key,
    one_liner: `${g.marker} target: ${g.goal} ${g.unit} in 12 weeks (${g.deltaText}).`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// ALERT ONE-LINERS — same on every surface
// ──────────────────────────────────────────────────────────────────────
function buildAlertProse(a: EmergencyAlertFact): CanonicalAlert {
  return {
    key: a.key,
    one_liner: a.message,
  };
}

// ──────────────────────────────────────────────────────────────────────
// MAIN ENTRY — produce the full canonical bundle for a ClinicalFacts.
// ──────────────────────────────────────────────────────────────────────
export function buildCanonicalProse(facts: ClinicalFacts): CanonicalProseBundle {
  return {
    conditions: facts.conditions.map(buildConditionProse),
    outliers: facts.labs.outliers.map(buildOutlierProse),
    supplements: facts.supplementCandidates.map(buildSupplementProse),
    goals: facts.goalTargets.map(buildGoalProse),
    alerts: facts.emergencyAlerts.map(buildAlertProse),
  };
}
