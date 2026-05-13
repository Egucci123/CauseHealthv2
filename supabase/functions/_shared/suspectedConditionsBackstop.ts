// supabase/functions/_shared/suspectedConditionsBackstop.ts
//
// DETERMINISTIC SAFETY NET for the universal differential-diagnosis layer.
//
// The AI does open-ended differential diagnosis — that's the universal layer
// (it can find condition #1001 by reasoning from the data). But the AI is
// imperfect: sometimes it forgets the obvious ones. This file is the
// backstop that ensures the most-common high-prevalence cases are NEVER
// dropped, regardless of what the AI returned.
//
// Architecture:
//   - AI = open-ended reasoning (handles the long tail)
//   - This file = deterministic floor for must-not-miss cases
//
// Each entry declares:
//   - When the suspicion fires (lab thresholds + condition exclusions + symptom matches)
//   - The structured suspected_condition entry to inject if missing
//
// Universal in the same way the rest of the architecture is: every patient
// runs through every check. Each check produces a finding only if its
// triggers match the patient's specific data.

import { hasCondition } from './conditionAliases.ts';
import { isOnMed } from './medicationAliases.ts';
import { detectBorderlineZone, type BorderlineZone } from './borderlineDetector.ts';
import { MARKER_SYSTEMS, type MarkerSystem } from './markerSystems.ts';

export interface SuspectedConditionEntry {
  /** Stable cross-surface key — e.g., 'nafld', 'osa', 'hemoconcentration'.
   * Lab analysis, wellness plan, doctor prep all route by this key.
   * Set automatically by runSuspectedConditionsBackstop from the rule.key.
   * Optional on AI-emitted entries (legacy v1); v2 always populates it. */
  key?: string;
  name: string;
  category: 'endocrine' | 'cardiovascular' | 'hematology' | 'gi' | 'kidney' | 'autoimmune' | 'reproductive' | 'neuro' | 'musculoskeletal' | 'metabolic' | 'respiratory' | 'mental_health' | 'infectious' | 'oncology' | 'nutritional' | 'other';
  confidence: 'high' | 'moderate' | 'low';
  evidence: string;
  confirmatory_tests: string[];
  icd10: string;
  what_to_ask_doctor: string;
  /** Where it came from — backstop entries are auditable as 'deterministic'. */
  source?: 'ai' | 'deterministic';
}

interface BackstopCtx {
  age: number | null;
  sex: string | null;
  conditionsLower: string;
  symptomsLower: string;
  medsLower: string;
  labValues: Array<{
    marker_name?: string;
    value?: number | string | null;
    unit?: string | null;
    optimal_flag?: string | null;
    /** Lab's own reference low (e.g. lab range 13.5–17.5 for Hgb male). */
    standard_low?: number | string | null;
    /** Lab's own reference high. */
    standard_high?: number | string | null;
  }>;
  /** AI-returned suspected conditions (lowercase names) — used to dedup. */
  aiSuspectedNamesLower: string[];
}

function mark(labs: any[], patterns: RegExp[]): { value: number; flag: string; unit: string; standard_high: number | null; standard_low: number | null; marker_name: string } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? v.marker ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) {
        const stdHigh = typeof v.standard_high === 'number' ? v.standard_high
          : (v.standard_high != null && Number.isFinite(parseFloat(String(v.standard_high))) ? parseFloat(String(v.standard_high)) : null);
        const stdLow = typeof v.standard_low === 'number' ? v.standard_low
          : (v.standard_low != null && Number.isFinite(parseFloat(String(v.standard_low))) ? parseFloat(String(v.standard_low)) : null);
        return {
          value: num,
          flag: (v.optimal_flag ?? v.flag ?? '').toLowerCase(),
          unit: String(v.unit ?? ''),
          standard_high: stdHigh,
          standard_low: stdLow,
          marker_name: name,
        };
      }
    }
  }
  return null;
}

/**
 * Find a marker AND classify its borderline zone against the lab's own
 * reference range. Used by correlation rules that connect-the-dots
 * across multiple markers in a "borderline-high / borderline-low" zone.
 *
 * Returns null if no marker matches the patterns.
 * Otherwise returns { value, zone, isBorderline } where zone is one of:
 *   'out_low' | 'borderline_low' | 'safe_zone' | 'borderline_high'
 *   | 'out_high' | 'unknown'
 */
function markBorderline(
  labs: any[],
  patterns: RegExp[],
): { value: number; zone: BorderlineZone; isBorderline: boolean; isHighSide: boolean; isLowSide: boolean } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? '');
    if (!patterns.some(re => re.test(name))) continue;
    const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
    if (!Number.isFinite(num)) continue;
    const result = detectBorderlineZone({
      marker_name: name,
      value: num,
      standard_low: v.standard_low,
      standard_high: v.standard_high,
    });
    return {
      value: num,
      zone: result.zone,
      isBorderline: result.isBorderline,
      isHighSide: result.zone === 'borderline_high' || result.zone === 'out_high',
      isLowSide: result.zone === 'borderline_low' || result.zone === 'out_low',
    };
  }
  return null;
}

function symptom(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

interface BackstopRule {
  /** Stable id for audit. */
  key: string;
  /** Skip if AI already raised this — heuristic match against `aiSuspectedNamesLower`. */
  alreadyRaisedIf: RegExp[];
  /** Skip if user already has this on their conditions list (it's not "suspected" if confirmed). */
  skipIfDx: string[];     // condition registry keys
  /** Returns the entry to inject, or null if triggers don't fire. */
  detect: (ctx: BackstopCtx) => SuspectedConditionEntry | null;
}

const RULES: BackstopRule[] = [
  // ── Hemoconcentration / dehydration (universal, must-not-miss) ─────────
  // Real-case validation (Mitchell, 28yo): the AI jumped straight to
  // OSA / chronic hypoxemia → EPO-driven erythrocytosis as the explanation
  // for high RBC/Hgb/Hct. But hemoconcentration from chronic underhydration
  // is a much simpler explanation and statistically more common — every
  // blood component reads "high" because plasma volume is low.
  //
  // The signature: HIGH albumin (the most specific marker — albumin doesn't
  // physiologically rise, it concentrates) + at least one of HIGH Hgb / Hct /
  // RBC. Optionally supported by upper-half urine specific gravity and mild
  // creatinine bump. Hydration trial first is non-invasive, free, and
  // reverses the pattern in 1–2 weeks if dehydration is the cause. OSA
  // workup escalates only if hydration trial fails.
  //
  // Universal — fires on every patient where the chemistry pattern matches,
  // regardless of age/sex/symptoms. Not constrained to suspicion of OSA.
  {
    key: 'hemoconcentration_dehydration',
    // Only skip if the AI raised hemoconcentration AS THE PRIMARY condition
    // (name starts with one of these terms). If the AI just mentioned it in
    // passing inside a combined name like "high red blood cell count (likely
    // OSA or hemoconcentration)", we still want the backstop to fire its
    // hydration-trial-first entry — otherwise the user gets sent for an
    // expensive sleep study before the cheap dehydration rule-out.
    alreadyRaisedIf: [/^hemoconcentr/i, /^dehydrat/i, /^chronic underhydrat/i, /^underhydrat/i],
    skipIfDx: [],
    detect: (ctx) => {
      const albumin = mark(ctx.labValues, [/^albumin\b/i]);
      // Exclude "Hemoglobin A1c" — different marker, would pull A1c % as if it were Hgb g/dL
      const hgb = mark(ctx.labValues, [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i]);
      const hct = mark(ctx.labValues, [/^hematocrit\b/i]);
      const rbc = mark(ctx.labValues, [/red blood cell count|^rbc\b/i]);
      const cre = mark(ctx.labValues, [/^creatinine\b/i]);
      const sg = mark(ctx.labValues, [/specific gravity/i]);

      // Albumin is the keystone — it has to be high for this to be hemoconc
      // rather than absolute erythrocytosis. Use clinical threshold of >5.0
      // (most labs cap normal at 5.0–5.1). If albumin isn't measured, we
      // can't distinguish hemoconc from real erythrocytosis — skip.
      if (!albumin || albumin.value <= 5.0) return null;

      // At least one RBC-line marker has to be high to make this relevant.
      const hgbHigh = hgb && hgb.value > (hgb.value > 100 ? 17.5 /* female */ : 17.5);
      // Use sex-aware threshold: 17 g/dL female, 18 g/dL male — but sex isn't
      // always reliable, so use a loose 16.5+ threshold and let pattern carry.
      const isHgbHigh = hgb && hgb.value >= 16.5;
      const isHctHigh = hct && hct.value >= 49;
      const isRbcHigh = rbc && rbc.value >= 5.5;
      if (!isHgbHigh && !isHctHigh && !isRbcHigh) return null;

      // Build evidence string
      const cluesArr: string[] = [`Albumin ${albumin.value} g/dL (high — concentrated)`];
      if (hgb && isHgbHigh) cluesArr.push(`Hgb ${hgb.value} g/dL`);
      if (hct && isHctHigh) cluesArr.push(`Hct ${hct.value}%`);
      if (rbc && isRbcHigh) cluesArr.push(`RBC ${rbc.value} M/uL`);
      if (cre && cre.value > 1.1) cluesArr.push(`Cre ${cre.value} mg/dL (mild)`);
      if (sg && sg.value >= 1.020) cluesArr.push(`Urine SG ${sg.value} (concentrated)`);
      const clues = cluesArr.join(', ');

      return {
        name: 'Hemoconcentration / chronic underhydration (rule-out before erythrocytosis)',
        category: 'metabolic',
        confidence: 'high',
        evidence: `${clues}. All your blood numbers look high because the water part of your blood is low — like soup that\'s been boiled down. Albumin is the giveaway: it can only go up if you\'re low on water. This is way more common than a real blood disease in someone fit.`,
        confirmatory_tests: [
          'Hydration trial (3L water/day + electrolytes) for 14 days',
          'Repeat CBC + albumin after trial',
          'Urine specific gravity (random sample)',
        ],
        icd10: 'E86.0',
        what_to_ask_doctor: "My albumin, hemoglobin, and hematocrit are all high together. Could this just be from not drinking enough water instead of a blood disease? Can I try drinking more water for 2 weeks and recheck before doing more tests?",
        source: 'deterministic',
      };
    },
  },

  // ── Hashimoto's thyroiditis / Hypothyroidism (universal) ───────────────
  // Real-case validation (PMC12988615) caught this rule was too narrow:
  //   - Only checked TSH + 3 specific symptoms (fatigue, hair loss, cold)
  //   - Ignored TPO antibodies entirely (the most specific Hashimoto marker)
  //   - Capped TSH at <10 (overt hypothyroid never fired)
  //   - Missed all the broader hypothyroid symptom cluster
  // Now fires on ANY of: TPO+, TgAb+, low free T4, overt TSH, subclinical TSH+symptoms.
  {
    key: 'hashimoto_or_hypothyroid',
    alreadyRaisedIf: [/hashimoto/i, /hypothyroid/i, /autoimmune thyroid/i, /chronic thyroiditis/i, /thyroid dysfunction/i],
    skipIfDx: ['hashimotos'],
    detect: (ctx) => {
      const tsh = mark(ctx.labValues, [/^tsh\b/i]);
      const tpo = mark(ctx.labValues, [/tpo|thyroid peroxidase/i]);
      const tgab = mark(ctx.labValues, [/thyroglobulin antibod/i]);
      const ft4 = mark(ctx.labValues, [/free t4|t4,?\s*free/i]);

      // ── Trigger A: TPO antibodies positive (most specific) ──────────
      // TPO upper limit varies by lab (typically 9-35 IU/mL). Use 35 as
      // conservative threshold — any value above that is positive.
      if (tpo && tpo.value > 35) {
        return {
          name: "Hashimoto's thyroiditis (autoimmune)",
          category: 'endocrine',
          confidence: 'high',
          evidence: `TPO antibodies ${tpo.value} IU/mL (positive)${tsh ? ` + TSH ${tsh.value} mIU/L` : ''}${ft4 && ft4.value < 0.9 ? ` + Free T4 ${ft4.value} ng/dL (low)` : ''}. TPO+ is the most specific marker for Hashimoto's.`,
          confirmatory_tests: ['Thyroglobulin Antibodies', 'Free T4', 'Free T3', 'Reverse T3', 'Thyroid Ultrasound'],
          icd10: 'E06.3',
          what_to_ask_doctor: "My TPO antibodies came back positive. That points to Hashimoto's, an autoimmune thyroid problem. Can we talk about treatment and how often to check it?",
          source: 'deterministic',
        };
      }

      // ── Trigger B: TgAb positive without TPO data ───────────────────
      if (tgab && tgab.value > 40 && (!tpo || tpo.value <= 35)) {
        return {
          name: "Autoimmune thyroid disease (TgAb+)",
          category: 'endocrine',
          confidence: 'moderate',
          evidence: `Thyroglobulin antibodies ${tgab.value} IU/mL (positive). TgAb+ alone is suggestive of autoimmune thyroid involvement.`,
          confirmatory_tests: ['TPO Antibodies', 'Free T4', 'Free T3', 'Reverse T3'],
          icd10: 'E06.3',
          what_to_ask_doctor: "My thyroglobulin antibodies came back positive. Can we run a TPO antibody test to confirm autoimmune thyroid disease?",
          source: 'deterministic',
        };
      }

      if (!tsh) return null;

      // ── Trigger C: Overt hypothyroidism (TSH ≥ 10 OR TSH high + low Free T4) ──
      const overtByTsh = tsh.value >= 10;
      const overtByPattern = tsh.value >= 4.5 && ft4 && ft4.value < 0.9;
      if (overtByTsh || overtByPattern) {
        return {
          name: 'Overt hypothyroidism (rule-out Hashimoto vs other causes)',
          category: 'endocrine',
          confidence: 'high',
          evidence: `TSH ${tsh.value} mIU/L${ft4 ? ` + Free T4 ${ft4.value} ng/dL` : ''} fits overt hypothyroidism. Most common cause in adults is Hashimoto's.`,
          confirmatory_tests: ['TPO Antibodies', 'Thyroglobulin Antibodies', 'Free T4', 'Free T3'],
          icd10: 'E03.9',
          what_to_ask_doctor: "My TSH is in the clearly-low-thyroid range. Can we confirm with TPO antibodies and start treatment?",
          source: 'deterministic',
        };
      }

      // ── Trigger D: Above-range TSH 4.5–10 with Free T4 NOT drawn ────
      //
      // Universal coverage gap fix (2026-05-12 audit). When TSH crosses
      // the lab's upper reference (typically 4.5) but Free T4 is missing
      // from the panel, we still need to surface this. Without Free T4
      // we can't distinguish overt from subclinical, but TSH alone
      // ≥4.5 is already a hard signal — the right answer is "get a
      // full thyroid panel + antibodies." Confidence: high (TSH out
      // of standard range is unambiguous), name: hypothyroid pattern.
      if (tsh.value >= 4.5 && tsh.value < 10 && !ft4) {
        return {
          name: 'Hypothyroid pattern — TSH above range, Free T4 needed',
          category: 'endocrine',
          confidence: 'high',
          evidence: `TSH ${tsh.value} mIU/L is above the standard lab reference (~4.5). Free T4 wasn't drawn — without it we can't separate overt from subclinical hypothyroidism, but the TSH alone is enough to act on.`,
          confirmatory_tests: ['Free T4', 'Free T3', 'Reverse T3', 'TPO Antibodies', 'Thyroglobulin Antibodies (Tg-Ab)'],
          icd10: 'E03.9',
          what_to_ask_doctor: "My TSH is above the standard lab reference range. Can we get a full thyroid panel (Free T4, Free T3) and thyroid antibodies (TPO, Tg-Ab) to see if this is Hashimoto's or another cause?",
          source: 'deterministic',
        };
      }

      // The Hashimoto's-specific card is reserved for HIGH-CONFIDENCE
      // signals only: positive antibodies (Trigger A or B above) or overt
      // hypothyroidism (Trigger C). The borderline-TSH + symptoms pattern
      // is covered by the separate 'subclinical_hypothyroidism' rule
      // below — same recommended workup, but framed as "early thyroid
      // pattern worth tracking" instead of "you have Hashimoto's." That
      // separation prevents alarming naming on a value that's still
      // within standard lab reference range while still surfacing the
      // borderline signal with a useful confirmatory-test list.
      return null;
    },
  },

  // ── PCOS (female only) ─────────────────────────────────────────────────
  {
    key: 'pcos',
    alreadyRaisedIf: [/pcos/i, /polycystic/i],
    skipIfDx: ['pcos'],
    detect: (ctx) => {
      if ((ctx.sex ?? '').toLowerCase() !== 'female') return null;
      const totalT = mark(ctx.labValues, [/^testosterone, total/i, /^total testosterone/i]);
      const dheaS = mark(ctx.labValues, [/^dhea\s*sulfate/i]);
      const lh = mark(ctx.labValues, [/^lh\b/i]);
      const fsh = mark(ctx.labValues, [/^fsh\b/i]);
      const a1c = mark(ctx.labValues, [/^hemoglobin a1c/i, /^a1c\b/i]);
      const acne = symptom(ctx.symptomsLower, [/\bacne\b/i]);
      const cycleIssues = symptom(ctx.symptomsLower, [/irregular (cycle|period)/i, /heavy period/i, /missed period/i, /infertil/i]);
      const weight = symptom(ctx.symptomsLower, [/weight gain/i, /can'?t lose weight/i]);

      const tHigh = totalT && totalT.value > 50;
      const dheaHigh = dheaS && dheaS.value > 250;
      const lhFshRatio = (lh && fsh && fsh.value > 0) ? lh.value / fsh.value : null;
      const lhRatioElev = lhFshRatio != null && lhFshRatio > 2;
      const a1cElev = a1c && a1c.value >= 5.7;

      const hits = [tHigh, dheaHigh, lhRatioElev, acne, cycleIssues, weight].filter(Boolean).length;
      if (hits >= 2 && (tHigh || dheaHigh || lhRatioElev)) {
        const ev: string[] = [];
        if (tHigh) ev.push(`Total T ${totalT!.value} ng/dL`);
        if (dheaHigh) ev.push(`DHEA-S ${dheaS!.value}`);
        if (lhRatioElev) ev.push(`LH:FSH ratio ${lhFshRatio!.toFixed(1)}`);
        if (a1cElev) ev.push(`A1c ${a1c!.value}%`);
        if (acne) ev.push('acne');
        if (cycleIssues) ev.push('cycle issues');
        return {
          name: 'Polycystic Ovary Syndrome (PCOS)',
          category: 'reproductive',
          confidence: hits >= 4 ? 'high' : 'moderate',
          evidence: `Female with androgen + cycle/acne/insulin pattern: ${ev.join(', ')}.`,
          confirmatory_tests: ['Free Testosterone', 'SHBG', 'Fasting Insulin + HOMA-IR', 'Pelvic Ultrasound'],
          icd10: 'E28.2',
          what_to_ask_doctor: "My hormone numbers and cycle issues fit PCOS. Can we run a full androgen panel and fasting insulin, and think about a pelvic ultrasound?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Type 2 Diabetes (diagnostic threshold, undiagnosed) ────────────────
  // Universal: A1c ≥ 6.5% OR fasting glucose ≥ 126 mg/dL on a single draw
  // already meets ADA diagnostic criteria. If the user has no T2D dx on
  // file, this fires as a high-confidence suspected condition. The AI
  // sometimes treats diagnostic-threshold cases as critical findings only,
  // so this backstop ensures the diagnosis itself surfaces in the
  // differential — that's where users actually look for "what could this be."
  {
    key: 'undiagnosed_t2d',
    alreadyRaisedIf: [/type 2 diab/i, /\bt2d\b/i, /diabetes mellitus/i, /\bdm2\b/i, /diabetic\b/i],
    skipIfDx: ['t2d'],
    detect: (ctx) => {
      const a1c = mark(ctx.labValues, [/^hemoglobin a1c/i, /^a1c\b/i, /glycohemoglobin/i]);
      // Exclude "Glucose Tolerance Test", "Glucose, Random", "Glucose, 2-hr post" etc.
      // — those are OGTT/post-load values that would falsely trigger diabetes flags.
      const glucose = mark(ctx.labValues, [/^glucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i, /^fasting glucose/i]);
      const a1cDx = a1c && a1c.value >= 6.5;
      const glucDx = glucose && glucose.value >= 126;
      if (a1cDx || glucDx) {
        const ev: string[] = [];
        if (a1cDx) ev.push(`A1c ${a1c!.value}% (≥6.5% = ADA diagnostic)`);
        if (glucDx) ev.push(`fasting glucose ${glucose!.value} mg/dL (≥126 = ADA diagnostic)`);
        return {
          name: 'Type 2 Diabetes (undiagnosed)',
          category: 'metabolic',
          confidence: 'high',
          evidence: `Labs meet ADA diagnostic criteria for diabetes despite no diagnosis on file: ${ev.join(', ')}.`,
          confirmatory_tests: ['Repeat HbA1c on a separate day to confirm', 'Fasting glucose (repeat)', 'Fasting Insulin + HOMA-IR', 'Comprehensive metabolic panel + UACR (kidney)', 'Lipid panel (extended)', 'Dilated eye exam (baseline retinopathy screen)'],
          icd10: 'E11.9',
          what_to_ask_doctor: "My A1c and blood sugar are in the diabetes range. Can we recheck with a second blood draw and start a plan? I\'d also like a kidney check (UACR) and an eye exam.",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Prediabetes ────────────────────────────────────────────────────────
  {
    key: 'prediabetes',
    alreadyRaisedIf: [/prediab/i, /pre[- ]diab/i, /insulin resistance/i, /metabolic syndrome/i],
    skipIfDx: ['t2d'],
    detect: (ctx) => {
      const a1c = mark(ctx.labValues, [/^hemoglobin a1c/i, /^a1c\b/i]);
      // Exclude "Glucose Tolerance Test", "Glucose, Random", "Glucose, 2-hr post" etc.
      // — those are OGTT/post-load values that would falsely trigger diabetes flags.
      const glucose = mark(ctx.labValues, [/^glucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i, /^fasting glucose/i]);
      const insulin = mark(ctx.labValues, [/^insulin\b/i, /fasting insulin/i]);
      // 2026-05-12-24: Lowered A1c threshold 5.7 → 5.6 (catches early
      // pre-diabetic drift the standard ADA threshold misses). Glucose
      // KEPT at ADA standard ≥100 — A1c is the more reliable early marker
      // and Glucose 95-99 with metabolic signal is already caught by
      // insulin_resistance_dyslipidemia rule.
      const a1cPre = a1c && a1c.value >= 5.6 && a1c.value < 6.5;
      const glucElev = glucose && glucose.value >= 100 && glucose.value < 126;
      const insElev = insulin && insulin.value >= 10;
      if (a1cPre || glucElev || insElev) {
        const ev: string[] = [];
        if (a1cPre) ev.push(`A1c ${a1c!.value}%`);
        if (glucElev) ev.push(`fasting glucose ${glucose!.value} mg/dL`);
        if (insElev) ev.push(`fasting insulin ${insulin!.value}`);
        return {
          name: 'Prediabetes / Insulin Resistance',
          category: 'metabolic',
          confidence: 'high',
          evidence: `Glycemic markers in prediabetic range: ${ev.join(', ')}.`,
          confirmatory_tests: ['Fasting Insulin + HOMA-IR', 'HbA1c (repeat in 3 months)', 'Lipid panel (extended)', 'UACR'],
          icd10: 'R73.09',
          what_to_ask_doctor: "My blood sugar markers are in the prediabetes range. Can we add a fasting insulin (HOMA-IR) test and talk about whether to try lifestyle changes alone or add metformin?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── NAFLD / Fatty liver ────────────────────────────────────────────────
  {
    key: 'nafld',
    alreadyRaisedIf: [/nafld/i, /fatty liver/i, /hepatic steatosis/i, /\bnash\b/i],
    skipIfDx: ['nafld'],
    detect: (ctx) => {
      const alt = mark(ctx.labValues, [/\balt\b/i, /\bsgpt\b/i, /alanine[\s-]?aminotransferase/i]);
      const ast = mark(ctx.labValues, [/\bast\b/i, /\bsgot\b/i, /aspartate[\s-]?aminotransferase/i]);
      const ggt = mark(ctx.labValues, [/\bggt\b/i, /gamma[\s-]?glutamyl/i]);
      const tg = mark(ctx.labValues, [/triglyc/i]);
      const a1c = mark(ctx.labValues, [/hemoglobin a1c/i, /\ba1c\b/i, /\bhba1c\b/i]);
      // 2026-05-13-56: respect each lab's own reference range — see comment
      // in hepatic_stress_pattern for rationale.
      const isAboveOwnRange = (m: { value: number; flag: string; standard_high: number | null } | null, abs: number) => {
        if (!m) return false;
        if (m.flag === 'normal' || m.flag === 'healthy' || m.flag === 'optimal') return false;
        return m.value > (m.standard_high ?? abs);
      };
      const altHigh = isAboveOwnRange(alt, 35);
      const altDoubled = alt && alt.value >= (alt.standard_high ? alt.standard_high * 2 : 70);
      const astHigh = isAboveOwnRange(ast, 35);
      const ggtHigh = isAboveOwnRange(ggt, 50);
      const tgHigh = tg && tg.value > 150;
      const tgVeryHigh = tg && tg.value >= 250;        // strong IR signal
      const irPattern = (a1c && a1c.value >= 5.4) || tgHigh;
      if (altHigh && irPattern) {
        const ev: string[] = [`ALT ${alt!.value}`];
        if (ast && ast.value > 35) ev.push(`AST ${ast.value}`);
        if (ggt && ggt.value > 30) ev.push(`GGT ${ggt.value}`);
        if (tgHigh) ev.push(`TG ${tg!.value}`);
        if (a1c && a1c.value >= 5.4) ev.push(`A1c ${a1c.value}%`);
        // Confidence escalation rules — universal across patients:
        //   HIGH if ALT >2× ULN + metabolic signal (TG high or A1c watch+)
        //   HIGH if ALT high + AST high + GGT high (3-marker hepatic stress)
        //   HIGH if ALT high + TG ≥250 (strong IR + hepatic combo)
        //   MODERATE otherwise
        const isHigh =
          (altDoubled && irPattern) ||
          (altHigh && astHigh && ggtHigh) ||
          (altHigh && tgVeryHigh);
        return {
          name: 'NAFLD (Non-alcoholic Fatty Liver Disease)',
          category: 'gi',
          confidence: isHigh ? 'high' : 'moderate',
          evidence: `Your liver numbers are high and your blood-sugar markers say your body isn\'t using insulin well: ${ev.join(', ')}. This combo points to fat building up in the liver.`,
          confirmatory_tests: ['Liver Ultrasound', 'GGT', 'Fasting Insulin + HOMA-IR', 'FibroScan if available'],
          icd10: 'K76.0',
          what_to_ask_doctor: "My liver numbers are high and my blood-sugar markers look off. Can I get a liver ultrasound (or a FibroScan) to check for fatty liver?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Hepatic stress / alcoholic-liver-pattern ──────────────────────────
  //
  // NAFLD rule above requires a metabolic signal (A1c or TG). That
  // misses the alcoholic-liver phenotype: elevated ALT + AST + GGT
  // without any metabolic component. AST/ALT > 1 and MCV ≥ 100 are
  // additional alcoholic-pattern indicators (de Ritis ratio + macrocytic).
  //
  // Universal across both sexes. Fires regardless of self-reported
  // alcohol use (we can't trust under-reporting). Name framed as
  // "hepatic stress" to avoid stigma; ICD-10 K76.9 is generic-liver.
  {
    key: 'hepatic_stress_pattern',
    alreadyRaisedIf: [/nafld/i, /fatty liver/i, /alcoholic liver/i, /hepatitis/i, /cirrhos/i, /\bnash\b/i],
    skipIfDx: ['nafld', 'alcoholic_liver_disease', 'cirrhosis'],
    detect: (ctx) => {
      const alt = mark(ctx.labValues, [/\balt\b/i, /\bsgpt\b/i, /alanine[\s-]?aminotransferase/i]);
      const ast = mark(ctx.labValues, [/\bast\b/i, /\bsgot\b/i, /aspartate[\s-]?aminotransferase/i]);
      const ggt = mark(ctx.labValues, [/\bggt\b/i, /gamma[\s-]?glutamyl/i]);
      const mcv = mark(ctx.labValues, [/\bmcv\b/i]);
      // 2026-05-13-56: respect each lab's own reference range. Hard-coded 35
      // misfired for users whose lab uses 0-70 ranges (Tim case — ALT 37 is
      // normal at his lab, but the global 35 threshold flagged it as elevated).
      // Use the lab's standard_high when available, else fall back to the
      // textbook absolute. Also require flag to indicate actual elevation.
      const isAboveOwnRange = (m: { value: number; flag: string; standard_high: number | null } | null, abs: number) => {
        if (!m) return false;
        if (m.flag === 'normal' || m.flag === 'healthy' || m.flag === 'optimal') return false;
        const threshold = m.standard_high ?? abs;
        return m.value > threshold;
      };
      const altHigh = isAboveOwnRange(alt, 35);
      const astHigh = isAboveOwnRange(ast, 35);
      const ggtHigh = isAboveOwnRange(ggt, 50);
      // Need at least 2 of (ALT, AST, GGT) elevated to fire.
      const elevatedCount = [altHigh, astHigh, ggtHigh].filter(Boolean).length;
      if (elevatedCount < 2) return null;
      const ev: string[] = [];
      if (altHigh) ev.push(`ALT ${alt!.value}`);
      if (astHigh) ev.push(`AST ${ast!.value}`);
      if (ggtHigh) ev.push(`GGT ${ggt!.value}`);
      // Alcoholic-pattern indicators (informational, not gating).
      const astAltRatio = (alt && ast && alt.value > 0) ? (ast.value / alt.value) : 0;
      const astDominant = astAltRatio >= 1.5;             // classic alcoholic ratio
      const macrocytic = mcv && mcv.value >= 100;
      if (astDominant) ev.push(`AST/ALT ${astAltRatio.toFixed(1)} (high — alcoholic pattern)`);
      if (macrocytic) ev.push(`MCV ${mcv!.value} (macrocytic — supports alcoholic pattern)`);
      const isHigh = elevatedCount === 3 || astDominant || macrocytic;
      return {
        name: 'Hepatic stress pattern — rule out alcohol-related or NAFLD',
        category: 'gi',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `Liver enzymes elevated: ${ev.join(', ')}. ${astDominant || macrocytic ? 'The AST/ALT ratio and/or macrocytic red cells point toward alcohol-related liver stress; NAFLD remains in the differential.' : 'Both alcohol-related liver disease and NAFLD can produce this pattern.'}`,
        confirmatory_tests: ['Liver Ultrasound', 'GGT', 'Hepatitis B + C serology', 'Ferritin + Iron Studies (rule out hemochromatosis)', 'Fasting Insulin + HOMA-IR'],
        icd10: 'K76.9',
        what_to_ask_doctor: "My liver enzymes are elevated. Can we get a liver ultrasound, hepatitis B and C screening, and iron studies to figure out what's driving this? I'd also like to honestly review my alcohol intake.",
        source: 'deterministic',
      };
    },
  },

  // ── Hemochromatosis — iron overload ───────────────────────────────────
  //
  // Ferritin > 300 ng/mL (males) or > 200 (females) + transferrin
  // saturation > 45% is the classic screening pattern. Genetic
  // confirmation via HFE testing. Catches the most-missed treatable
  // genetic disease in adults — 1 in 200 NW European descent carry
  // homozygous C282Y. Untreated → cirrhosis, diabetes, cardiomyopathy.
  {
    key: 'hemochromatosis',
    alreadyRaisedIf: [/hemochromatos|iron overload|hfe/i],
    skipIfDx: ['hemochromatosis'],
    detect: (ctx) => {
      const ferritin = mark(ctx.labValues, [/^ferritin/i]);
      const transSat = mark(ctx.labValues, [/transferrin\s*saturation|tsat|iron\s*sat/i]);
      // Exclude "Iron Saturation", "Iron Binding Capacity (TIBC)", "Iron, % Saturation"
      // — serum iron is the target marker. The compound names would yield 27%, 310 µg/dL etc.
      const iron = mark(ctx.labValues, [/^iron\b(?!.*(?:saturation|\bsat\b|binding|tibc|%|capacity))/i]);
      if (!ferritin) return null;
      const isFemale = ctx.sex === 'female';
      const ferritinHigh = ferritin.value > (isFemale ? 200 : 300);
      const tsatHigh = transSat && transSat.value > 45;
      const ironHigh = iron && iron.value > 175;
      if (!ferritinHigh) return null;
      // High confidence if BOTH ferritin elevated AND TSat > 45
      const isHigh = (ferritinHigh && tsatHigh) || (ferritinHigh && ferritin.value > 500);
      return {
        name: 'Iron overload pattern — rule out hemochromatosis',
        category: 'endocrine',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `Ferritin ${ferritin.value} ng/mL is above the standard ${isFemale ? '200' : '300'} threshold${tsatHigh ? ` + transferrin saturation ${transSat!.value}% (>45)` : ''}${ironHigh ? ` + serum iron ${iron!.value} µg/dL` : ''}. This is the classic hemochromatosis screening pattern — 1 in 200 people of NW European descent carry the homozygous C282Y mutation. Untreated iron overload drives cirrhosis, diabetes, and cardiomyopathy by midlife.`,
        confirmatory_tests: ['HFE Genetic Testing (C282Y / H63D)', 'Repeat Ferritin + Transferrin Saturation (fasting)', 'Liver Panel + ALT/AST', 'Hepatic MRI (R2*) if ferritin > 1000 or LFTs abnormal'],
        icd10: 'E83.110',
        what_to_ask_doctor: "My ferritin is elevated and the transferrin saturation pattern looks like iron overload. Can we run HFE genetic testing for hemochromatosis and a fasting repeat to confirm? If positive, therapeutic phlebotomy is highly effective when caught early.",
        source: 'deterministic',
      };
    },
  },

  // ── Cushing syndrome — endogenous cortisol excess ─────────────────────
  //
  // AM cortisol elevated + classic body changes (central obesity,
  // moon face, buffalo hump, purple striae) OR uncontrolled HTN + DM
  // + osteoporosis cluster. Adrenal tumor, pituitary tumor, ectopic
  // ACTH, or exogenous steroid (rule out FIRST).
  {
    key: 'cushing_syndrome_workup',
    alreadyRaisedIf: [/cushing/i],
    skipIfDx: ['cushing'],
    detect: (ctx) => {
      const cortisol = mark(ctx.labValues, [/cortisol/i]);
      const onSteroid = /prednisone|prednisolone|methylprednisolone|dexamethasone|hydrocortisone/i.test(ctx.medsLower);
      if (onSteroid) return null; // exogenous — different workup
      // 2026-05-12-24: lowered cortisol threshold 23 → 19 µg/dL to
      // catch borderline elevations (close-call audit found 17% rate
      // at 20-23 range). Confidence drops to moderate at 19-22.
      if (!cortisol || cortisol.value < 19) return null;
      const sx = ctx.symptomsLower ?? '';
      const cushingSx: string[] = [];
      if (/weight gain|central obes|moon face|buffalo/i.test(sx)) cushingSx.push('central body changes');
      if (/purple|stretch mark|striae/i.test(sx)) cushingSx.push('striae');
      if (/easy brui/i.test(sx)) cushingSx.push('easy bruising');
      if (/muscle weakness/i.test(sx)) cushingSx.push('proximal muscle weakness');
      const conds = ctx.conditionsLower ?? '';
      const cushingConds: string[] = [];
      if (/hypertension|htn/i.test(conds)) cushingConds.push('HTN');
      if (/diabetes/i.test(conds)) cushingConds.push('diabetes');
      if (/osteoporo/i.test(conds)) cushingConds.push('osteoporosis');
      const clusterStrong = cushingSx.length >= 2 || (cushingSx.length >= 1 && cushingConds.length >= 2);
      return {
        name: 'Cortisol excess — rule out Cushing syndrome',
        category: 'endocrine',
        confidence: clusterStrong ? 'high' : 'moderate',
        evidence: `AM cortisol ${cortisol.value} µg/dL is above the standard reference${cushingSx.length ? `, with classic Cushing features (${cushingSx.join(', ')})` : ''}${cushingConds.length ? ` and the HTN/DM/osteoporosis cluster (${cushingConds.join(', ')})` : ''}. Common reversible causes — sleep deprivation, recent stress, draw-time variability, exogenous estrogen — should be ruled out first, then formal Cushing screening.`,
        confirmatory_tests: ['24-hour Urinary Free Cortisol (×2)', 'Late-night Salivary Cortisol (×2)', 'Low-dose Dexamethasone Suppression Test (1 mg overnight)', 'ACTH (paired with cortisol)', 'Pituitary MRI if ACTH-dependent confirmed'],
        icd10: 'E24.9',
        what_to_ask_doctor: "My morning cortisol is elevated. Can we set up a Cushing screen — 24-hour urinary free cortisol, late-night salivary cortisol, and a low-dose dexamethasone suppression test? Two of those positive would confirm cortisol excess and we'd then check ACTH to find the source.",
        source: 'deterministic',
      };
    },
  },

  // ── Primary aldosteronism (Conn syndrome) — HTN + low K ──────────────
  //
  // Pattern: hypokalemia (K < 3.5) + HTN, especially treatment-resistant
  // or young-onset. Most common SECONDARY cause of HTN — present in 5-10%
  // of all HTN, 20% of resistant HTN. Treatable with MR antagonist or
  // adrenalectomy.
  {
    key: 'primary_aldosteronism',
    alreadyRaisedIf: [/aldosteron|conn syndrome/i],
    skipIfDx: ['primary_aldosteronism'],
    detect: (ctx) => {
      const k = mark(ctx.labValues, [/^potassium/i, /\bk\+?\b/i]);
      const hasHtn = /hypertension|htn|high blood pressure/i.test(ctx.conditionsLower ?? '') ||
                    /high blood pressure/i.test(ctx.symptomsLower ?? '');
      const onMultipleAntihtn = (ctx.medsLower ?? '').match(/\b(lisinopril|losartan|amlodipine|metoprolol|hydrochlorothiazide|atenolol|valsartan|carvedilol|nifedipine|enalapril|olmesartan)\b/gi);
      const onThreePlus = onMultipleAntihtn && onMultipleAntihtn.length >= 3;
      const kLow = k && k.value < 3.5;
      if (!hasHtn) return null;
      if (!kLow && !onThreePlus) return null;
      // 2026-05-13-49: Note diuretic-induced hypokalemia BEFORE the aldosteronism
      // workup if the patient is on a K-wasting diuretic. HCTZ / thiazides /
      // furosemide cause hypokalemia far more often than Conn syndrome —
      // honest clinician's stepwise approach: rule out the obvious first.
      const onKWastingDiuretic = (ctx.medsLower ?? '').match(/\b(hydrochlorothiazide|hctz|chlorthalidone|indapamide|furosemide|lasix|torsemide|bumetanide|metolazone)\b/i);
      const diureticCaveat = (kLow && onKWastingDiuretic)
        ? ` First step: confirm this isn't simple ${onKWastingDiuretic[0].toUpperCase()}-induced hypokalemia — discuss reducing or swapping the diuretic (or adding K supplementation) and rechecking K in 2-4 weeks. If K stays low after that, then proceed with ARR screening.`
        : '';
      return {
        name: 'Hypertension workup — rule out primary aldosteronism',
        category: 'endocrine',
        confidence: (kLow && onThreePlus) ? 'high' : 'moderate',
        evidence: `${kLow ? `Potassium ${k!.value} mEq/L (low) ` : ''}${kLow && onThreePlus ? '+ ' : ''}${onThreePlus ? `on ${onMultipleAntihtn!.length} antihypertensives ` : ''}with established HTN. Primary aldosteronism is present in 5-10% of all HTN and 20% of treatment-resistant HTN — most missed treatable HTN cause. Worth the screen; treatment (spironolactone or adrenalectomy) often normalizes BP.${diureticCaveat}`,
        confirmatory_tests: ['Aldosterone-to-Renin Ratio (ARR) — morning fasting', 'Plasma Aldosterone Concentration', 'Plasma Renin Activity', 'Adrenal CT if ARR confirms', 'Adrenal vein sampling if unilateral source suspected'],
        icd10: 'E26.9',
        what_to_ask_doctor: "My potassium is low and I'm on multiple BP meds. Can we run an aldosterone-to-renin ratio to screen for primary aldosteronism? It's the most-missed treatable cause of HTN — if positive, spironolactone often normalizes things.",
        source: 'deterministic',
      };
    },
  },

  // ── Supraphysiologic testosterone — anabolic / TRT exposure pattern ───
  //
  // Universal in males: total testosterone ≥ 1.5x upper lab reference
  // (typically > 10 ng/mL or > 1000 ng/dL US) almost always means one of:
  //   1. Anabolic-androgenic steroid use (AAS) — most common in 25-55yo gym
  //      population; rising rapidly with telehealth TRT clinics
  //   2. Supraphysiologic TRT dose (legitimate prescription, dose too high)
  //   3. SARMs / pro-hormones (less common but rising)
  //   4. Testicular Leydig cell tumor — rare but must rule out, esp. older men
  //   5. Adrenal androgen-secreting tumor — rare
  // The biohacker / r/Biohackers / r/ResearchCompounds / r/Testosterone audience
  // disproportionately presents with this profile. Most PCPs see a high T,
  // congratulate the patient, and miss the side-effect monitoring (erythrocytosis,
  // HDL suppression, hepatic stress from oral compounds, prostate, fertility).
  // 2026-05-13-50: critical universal addition. Detected on the first day of
  // launch (r/Biohackers traffic).
  {
    key: 'supraphysiologic_testosterone',
    alreadyRaisedIf: [/anabolic|supraphysiolog|aas (use|abuse)|trt (over|excess)|testosterone (excess|abuse)|leydig/i],
    skipIfDx: [],
    detect: (ctx) => {
      // Male only — female ranges differ entirely
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      if (!isMale) return null;
      const t = mark(ctx.labValues, [/^testosterone[,\s]+total/i, /^total testosterone/i, /^testosterona[,\s]+total/i, /^total testosterona/i, /^testosterone$/i, /^testosterona$/i]);
      if (!t) return null;
      // Universal threshold: ≥ 1.5x the lab's own upper limit when known,
      // else fall back to absolute thresholds (ng/dL ≥ 1300 or ng/mL ≥ 11).
      const stdHigh = typeof t.standard_high === 'number' ? t.standard_high : null;
      const supraThreshold = stdHigh ? stdHigh * 1.5 : (t.unit?.toLowerCase().includes('ng/ml') ? 11 : 1300);
      if (t.value < supraThreshold) return null;
      // Build evidence — pull other anabolic-pattern markers when present
      const hct = mark(ctx.labValues, [/^hematocrit\b/i, /^hct\b/i, /^hematocrito\b/i]);
      const hdl = mark(ctx.labValues, [/^hdl\b/i, /\bhdl\b/i, /colesterol hdl/i]);
      const alt = mark(ctx.labValues, [/^alt\b|sgpt|alanine[\s-]?amin/i]);
      const cluesArr: string[] = [`Testosterone ${t.value} ${t.unit} (${stdHigh ? `>${(supraThreshold).toFixed(0)} = 1.5× upper ${stdHigh}` : 'supraphysiologic'})`];
      if (hct && hct.value >= 50) cluesArr.push(`Hct ${hct.value}% (high — anabolic erythropoiesis)`);
      if (hdl && hdl.value < 40) cluesArr.push(`HDL ${hdl.value} mg/dL (low — classic AAS effect)`);
      if (alt && alt.value > 40) cluesArr.push(`ALT ${alt.value} U/L (high — possible oral compound hepatic stress)`);
      return {
        name: 'Supraphysiologic testosterone — anabolic / TRT exposure review',
        category: 'endocrine',
        confidence: 'high',
        evidence: `${cluesArr.join(', ')}. Total T at or above 1.5× the lab's upper limit is almost always exogenous (anabolic steroid use, supraphysiologic TRT dose, SARMs / pro-hormones) — rarely a Leydig cell tumor or adrenal source. Need to differentiate cause AND establish ongoing monitoring (erythrocytosis, lipid, hepatic, prostate, fertility) regardless of source.`,
        confirmatory_tests: ['LH + FSH (suppressed = exogenous source confirmed; elevated = primary testicular or tumor)', 'Estradiol (Sensitive, LC-MS/MS) — aromatization on supraphysiologic T drives gynecomastia / fluid retention', 'SHBG — typically low on exogenous T', 'Free + Bioavailable Testosterone — confirms biologically active fraction', 'Repeat AM fasting Total T (8-10 AM) to confirm', 'Hematocrit + Hgb — therapeutic phlebotomy threshold typically ≥54%', 'Lipid Panel (HDL especially) — track AAS-mediated suppression', 'Liver Panel + GGT — esp. if on oral compounds (methylated AAS)', 'PSA + DRE — anabolic exposure accelerates BPH/prostate trajectories', 'Sperm analysis if fertility relevant — exogenous T suppresses spermatogenesis'],
        icd10: 'E27.5',
        what_to_ask_doctor: "My total testosterone is significantly above the upper limit. I'd like to honestly review what's driving this — whether prescribed TRT, over-the-counter compounds, or something I should investigate. We need LH/FSH to figure out if the source is internal or external, plus ongoing monitoring of my hematocrit, lipids, liver, and prostate.",
        source: 'deterministic',
      };
    },
  },

  // ── Leukocytosis pattern — needs differential workup ──────────────────
  //
  // Universal: WBC > 12 x10³/uL OR neutrophils > 10 x10³/uL with elevated
  // lymphocytes %↓ suggests infection, inflammation, steroid/anabolic
  // effect, or — rarely — early myeloproliferative disorder. Most PCPs
  // either repeat the CBC and call it normal-variant, OR over-react to
  // CML. Right step: clinical context + repeat in 4-6 weeks + manual
  // differential + LDH + smear if persistent.
  {
    key: 'leukocytosis_differential',
    alreadyRaisedIf: [/leukocyt|wbc elevated|neutrophil/i, /leukem/i],
    skipIfDx: ['leukemia', 'cml', 'aml', 'cll'],
    detect: (ctx) => {
      const wbc = mark(ctx.labValues, [/^wbc\b|^leucocitos\b|^white blood cell/i]);
      const neut = mark(ctx.labValues, [/^neutrophil(?!.*%)|^neutrófilos(?!\s*%)/i]);
      const lymphPct = mark(ctx.labValues, [/^lymphocyte.*%|^linfocitos\s*%/i]);
      const wbcHigh = wbc && wbc.value > 12;
      const neutHigh = neut && neut.value > 10;
      const lymphLow = lymphPct && lymphPct.value < 20;
      // Lymphocyte-predominant pattern (mono / EBV / CMV / pertussis / CLL):
      // Lymph % ≥ 50 even with borderline-high or normal WBC is a different
      // story than neutrophilic leukocytosis — points at viral / atypical
      // lymphocytic process rather than bacterial / stress / anabolic.
      const lymphHigh = lymphPct && lymphPct.value >= 50;
      const wbcBorderline = wbc && wbc.value >= 10;
      const lymphocyticPattern = lymphHigh && (wbcBorderline || wbcHigh);
      if (!wbcHigh && !neutHigh && !lymphocyticPattern) return null;
      // Branch on pattern shape — same condition surface, different framing.
      if (lymphocyticPattern && !neutHigh) {
        const cluesL: string[] = [];
        if (wbc) cluesL.push(`WBC ${wbc.value} ${wbc.unit}`);
        cluesL.push(`Lymphocytes ${lymphPct!.value}% (≥50 — lymphocyte-predominant)`);
        return {
          name: 'Lymphocyte-predominant leukocytosis — viral / atypical workup',
          category: 'hematology',
          confidence: (wbc && wbc.value > 15) ? 'high' : 'moderate',
          evidence: `${cluesL.join(', ')}. Differential includes: acute viral infection (EBV / mono — most common in 15-30yo; CMV; acute HIV seroconversion; viral hepatitis; pertussis in unvaccinated); chronic lymphocytic leukemia (CLL) if persistent in 50+; T-cell lymphoma (less common). The right next step is a peripheral smear (atypical lymphocytes are classic for mono) + heterophile (Monospot) + EBV/CMV serology if symptomatic, OR flow cytometry if persistent in adults > 50.`,
          confirmatory_tests: ['Peripheral Blood Smear (atypical lymphocytes — Downey cells = mono)', 'Heterophile antibody (Monospot) — pos in 85% of EBV mono after week 1', 'EBV serology (VCA IgM + IgG, EBNA) if Monospot negative but suspicion high', 'CMV serology (IgM + IgG) — mono-like illness when EBV negative', 'HIV 4th-gen Ag/Ab test — acute HIV seroconversion mimics mono', 'LDH (elevated in lymphoproliferative)', 'Flow Cytometry if persistent > 3 months OR age > 50 (rules out CLL)'],
          icd10: 'D72.820',
          what_to_ask_doctor: "My lymphocyte count is high. If I've had a recent viral illness, can we run a Monospot and EBV/CMV serology? If this persists past 3 months or I have any swollen lymph nodes, I'd like flow cytometry to rule out CLL.",
          source: 'deterministic',
        };
      }
      const cluesArr: string[] = [];
      if (wbcHigh) cluesArr.push(`WBC ${wbc!.value} ${wbc!.unit} (>12)`);
      if (neutHigh) cluesArr.push(`Neutrophils ${neut!.value} ${neut!.unit} (>10)`);
      if (lymphLow) cluesArr.push(`Lymphocytes ${lymphPct!.value}% (<20 — stress-leukogram shift)`);
      // Common drivers to mention in evidence
      const drivers: string[] = ['active infection (most common — bacterial)', 'systemic inflammation', 'steroid / anabolic exposure (endogenous or exogenous)', 'chronic stress / smoking', 'early myeloproliferative disorder (CML, ET, PV — rare but rules-out)'];
      return {
        name: 'Leukocytosis — needs differential workup',
        category: 'hematology',
        confidence: (wbc && wbc.value > 15) ? 'high' : 'moderate',
        evidence: `${cluesArr.join(', ')}. Differential includes: ${drivers.join('; ')}. The right next step is clinical context + a repeat CBC with manual differential in 4-6 weeks — most reactive leukocytosis resolves; persistent elevation needs hematology workup. Don't accept "normal variant" without a repeat.`,
        confirmatory_tests: ['CBC with Manual Differential (repeat in 4-6 weeks)', 'Peripheral Blood Smear (immature forms / left shift / blasts)', 'LDH (elevated in MPN, hemolysis, inflammation)', 'Uric Acid (elevated in MPN turnover)', 'CRP + ESR (separates infection/inflammation from MPN)', 'Procalcitonin if bacterial infection suspected', 'JAK2 V617F + BCR-ABL if persistent or atypical features'],
        icd10: 'D72.829',
        what_to_ask_doctor: "My white blood cell count is elevated. Before assuming this is a passing infection, can we do a repeat CBC with manual differential in 4-6 weeks, plus LDH and a peripheral smear, to rule out anything chronic?",
        source: 'deterministic',
      };
    },
  },

  // ── Anabolic-induced erythrocytosis — high Hct + high T ───────────────
  //
  // Universal: Hct ≥ 50 in a male WITH supraphysiologic T (≥ lab upper)
  // is almost always anabolic-driven erythropoiesis — NOT primary
  // erythrocytosis or sleep apnea. Treatment is dose reduction +
  // therapeutic phlebotomy (target Hct < 52). Most PCPs jump to sleep
  // study without considering the obvious anabolic axis.
  {
    key: 'anabolic_erythrocytosis',
    alreadyRaisedIf: [/anabolic.*erythrocyt|erythrocyt.*anabolic|trt.*erythrocyt|polycyt|trt.*phlebotomy|therapeutic phlebotomy/i],
    skipIfDx: [],
    detect: (ctx) => {
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      if (!isMale) return null;
      const hct = mark(ctx.labValues, [/^hematocrit\b/i, /^hct\b/i, /^hematocrito\b/i]);
      const t = mark(ctx.labValues, [/^testosterone[,\s]+total/i, /^total testosterone/i, /^testosterona[,\s]+total/i, /^total testosterona/i, /^testosterone$/i, /^testosterona$/i]);
      if (!hct || !t) return null;
      if (hct.value < 50) return null;
      const stdHigh = typeof t.standard_high === 'number' ? t.standard_high : null;
      const tHigh = stdHigh ? t.value >= stdHigh : (t.unit?.toLowerCase().includes('ng/ml') ? t.value >= 7 : t.value >= 900);
      if (!tHigh) return null;
      const phlebotomyThreshold = hct.value >= 54;
      return {
        name: phlebotomyThreshold
          ? 'Anabolic-induced erythrocytosis — therapeutic phlebotomy threshold reached'
          : 'Anabolic-induced erythrocytosis — dose review + monitor',
        category: 'hematology',
        confidence: 'high',
        evidence: `Hct ${hct.value}% in a male with Testosterone ${t.value} ${t.unit} (${stdHigh ? `vs lab upper ${stdHigh}` : 'high'}). Exogenous testosterone (AAS or TRT) suppresses hepcidin and directly stimulates erythropoiesis — this is the most common cause of new erythrocytosis in adult men. ${phlebotomyThreshold ? 'Hct ≥54% meets standard threshold for therapeutic phlebotomy and a TRT dose reduction.' : 'Hct 50-53% warrants TRT/AAS dose reduction or split-dose, plus repeat Hct in 6-8 weeks.'} Sleep apnea workup is reasonable to add but the anabolic axis is the dominant driver here.`,
        confirmatory_tests: ['Therapeutic Phlebotomy (450 mL) if Hct ≥ 54% — drops Hct ~3% per unit', 'TRT dose review with prescriber: split into 2× weekly injections, lower total dose, or consider transdermal', 'Repeat CBC + Hct in 6-8 weeks after intervention', 'Ferritin baseline before phlebotomy (will drop after donations — supplement iron only if ferritin <30)', 'Home sleep apnea test if BMI ≥30 or snoring (additive to anabolic erythropoiesis, not alternative explanation)', 'Erythropoietin level if T is suppressed but Hct still rising (rules out primary polycythemia / JAK2)'],
        icd10: 'D75.1',
        what_to_ask_doctor: "My hematocrit is high and my testosterone is also elevated. Can we treat this as anabolic-induced erythrocytosis first — TRT/dose adjustment plus therapeutic phlebotomy if needed — before jumping to a sleep study? I want my Hct under 52% and a plan to keep it there.",
        source: 'deterministic',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  PATTERN-COVERAGE FILL — universal detectors for single-marker
  //  abnormalities flagged silent by pattern-coverage-map.ts (2026-05-13).
  //  Each detector below was a "silent zone" before. Universal: fires for
  //  ANY patient with the lab pattern, regardless of demographics.
  // ═══════════════════════════════════════════════════════════════════════

  // ── Severe anemia (Hgb < 8) — transfusion threshold workup ────────────
  {
    key: 'severe_anemia_workup',
    alreadyRaisedIf: [/severe anemia|transfusion/i],
    skipIfDx: [],
    detect: (ctx) => {
      const hgb = mark(ctx.labValues, [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i, /^hemoglobina\b(?!\s*a1c)/i]);
      if (!hgb || hgb.value >= 8) return null;
      return {
        name: 'Severe anemia — urgent workup',
        category: 'hematology',
        confidence: 'high',
        evidence: `Hgb ${hgb.value} ${hgb.unit} — below the standard transfusion-consideration threshold (8 g/dL) and well below typical adult reference. This is urgent, not routine: rules out acute bleeding, hemolysis, marrow failure, severe nutrient deficiency. Don't wait for repeat — workup now.`,
        confirmatory_tests: ['CBC with Differential (urgent)', 'Reticulocyte Count (separates production vs destruction)', 'Iron Panel + Ferritin', 'B12 + Folate + Methylmalonic Acid', 'LDH + Haptoglobin + Indirect Bilirubin (hemolysis workup)', 'Peripheral Blood Smear', 'Stool occult blood / FIT (GI bleed rule-out)', 'Reticulocyte Count', 'Iron Studies'],
        icd10: 'D64.9',
        what_to_ask_doctor: "My hemoglobin is severely low. I need an urgent workup — reticulocyte count, iron studies, B12/folate, LDH and haptoglobin for hemolysis, and a stool occult blood test. I don't want to wait for a repeat in a month.",
        source: 'deterministic',
      };
    },
  },

  // ── Severe hypertriglyceridemia (TG ≥ 500) — pancreatitis risk ────────
  {
    key: 'severe_hypertriglyceridemia',
    alreadyRaisedIf: [/severe hypertriglyc|pancreatitis risk/i],
    skipIfDx: [],
    detect: (ctx) => {
      const tg = mark(ctx.labValues, [/^triglyc|^triglicér/i]);
      if (!tg || tg.value < 500) return null;
      return {
        name: 'Severe hypertriglyceridemia — pancreatitis risk',
        category: 'cardio',
        confidence: 'high',
        evidence: `Triglycerides ${tg.value} ${tg.unit} — at or above 500 mg/dL puts you in the acute pancreatitis risk zone. Anything ≥ 1000 is high-risk and warrants urgent intervention. Most common drivers: uncontrolled diabetes, alcohol, hypothyroidism, nephrotic syndrome, certain meds (estrogens, retinoids, thiazides), or familial chylomicronemia.`,
        confirmatory_tests: ['Repeat Fasting Lipid Panel (12-hr fast — non-fasting inflates TG)', 'Hemoglobin A1c + Fasting Glucose', 'TSH', 'ApoB + Lipoprotein Electrophoresis (rule out familial chylomicronemia)', 'Liver Panel', 'Lipase (rule out subclinical pancreatitis)', 'Urinalysis (proteinuria — nephrotic)', 'Genetic testing if persistent severe + family history'],
        icd10: 'E78.1',
        what_to_ask_doctor: "My triglycerides are dangerously high — pancreatitis range. I'd like to recheck fasting, screen for diabetes and thyroid, and start a fibrate or high-dose omega-3 immediately. Also check lipase to make sure there's no subclinical pancreatitis already.",
        source: 'deterministic',
      };
    },
  },

  // ── Thrombocytopenia (Plt < 100) — universal workup ───────────────────
  {
    key: 'thrombocytopenia_workup',
    alreadyRaisedIf: [/thrombocytopen|low platelet/i, /itp|ttp|hus|dic/i],
    skipIfDx: ['itp', 'ttp'],
    detect: (ctx) => {
      const plt = mark(ctx.labValues, [/^platelets?\b|^plaquetas\b/i]);
      if (!plt || plt.value >= 150) return null;
      const isSevere = plt.value < 50;
      const isUrgent = plt.value < 20;
      return {
        name: isUrgent ? 'Severe thrombocytopenia — urgent hematology' : isSevere ? 'Significant thrombocytopenia — workup needed' : 'Thrombocytopenia — workup needed',
        category: 'hematology',
        confidence: isSevere ? 'high' : 'moderate',
        evidence: `Platelets ${plt.value} ${plt.unit} (below 150). ${isUrgent ? 'Bleeding risk is significant at this level — urgent hematology referral. ' : isSevere ? 'Spontaneous bleeding risk rises sharply below 50. ' : ''}Differential: ITP (immune-mediated), drug-induced (heparin, quinine, sulfa, NSAIDs, valproate), liver disease with splenomegaly, marrow failure, TTP/HUS (always check MAHA pattern), pregnancy, viral infection, alcohol, chronic disease consumption.`,
        confirmatory_tests: ['Repeat CBC with Manual Differential', 'Peripheral Blood Smear (schistocytes = TTP/HUS — emergency)', 'Reticulocyte + LDH + Haptoglobin + Indirect Bilirubin (MAHA workup)', 'Liver Panel + INR', 'HIV + Hepatitis B + C serology', 'Coombs (DAT) if hemolysis suspected', 'ANA if autoimmune signals', 'Vitamin B12 + Folate (megaloblastic causes)', 'Pregnancy test if female of reproductive age'],
        icd10: 'D69.6',
        what_to_ask_doctor: "My platelet count is low. Can we run a peripheral smear to rule out TTP/HUS, plus reticulocyte/LDH/haptoglobin/bilirubin for MAHA, check HIV and hepatitis, and review my meds for drug-induced causes?",
        source: 'deterministic',
      };
    },
  },

  // ── Neutropenia (ANC < 1.5) — universal workup ────────────────────────
  {
    key: 'neutropenia_workup',
    alreadyRaisedIf: [/neutropen|low neutroph/i],
    skipIfDx: [],
    detect: (ctx) => {
      const neut = mark(ctx.labValues, [/^neutrophil(?!.*%)|^neutrófilos(?!\s*%)/i]);
      if (!neut || neut.value >= 1.5) return null;
      const isSevere = neut.value < 0.5;
      return {
        name: isSevere ? 'Severe neutropenia — infection precautions' : 'Neutropenia — workup needed',
        category: 'hematology',
        confidence: isSevere ? 'high' : 'moderate',
        evidence: `Neutrophils ${neut.value} ${neut.unit}. ${isSevere ? 'Severe neutropenia (ANC <0.5) means high infection risk — fever workup is empiric IV antibiotics until proven otherwise. ' : ''}Differential: drug-induced (chemo, antibiotics, antithyroids, antipsychotics, sulfasalazine), viral infection (active or recovery phase), autoimmune, B12/folate/copper deficiency, congenital benign neutropenia (esp. African ancestry: Duffy-null phenotype), marrow infiltration, hypersplenism.`,
        confirmatory_tests: ['Repeat CBC with Manual Differential', 'Peripheral Blood Smear', 'Vitamin B12 + Folate + Copper', 'HIV + Hepatitis B + C + EBV serology', 'ANA + RF (autoimmune)', 'Review every medication for marrow-toxic agents', 'Flow Cytometry if persistent or progressive'],
        icd10: 'D70.9',
        what_to_ask_doctor: "My neutrophils are low. Can we figure out the cause — review my meds for marrow toxicity, screen for viral infection (HIV, hepatitis, EBV), and check B12/folate/copper deficiency? I need to know my baseline so I can react fast if I get a fever.",
        source: 'deterministic',
      };
    },
  },

  // ── Hyperkalemia (K > 5.5) — cardiac risk ─────────────────────────────
  {
    key: 'hyperkalemia_workup',
    alreadyRaisedIf: [/hyperkalem|high potassium/i],
    skipIfDx: [],
    detect: (ctx) => {
      const k = mark(ctx.labValues, [/^potassium|^potasio/i]);
      if (!k || k.value <= 5.4) return null;
      const isCritical = k.value >= 6.0;
      return {
        name: isCritical ? 'Critical hyperkalemia — urgent ECG + intervention' : 'Hyperkalemia — cardiac risk + workup',
        category: 'renal_endocrine',
        confidence: isCritical ? 'high' : 'moderate',
        evidence: `Potassium ${k.value} ${k.unit}${isCritical ? ' — at this level, cardiac arrhythmia risk is significant and an ECG is mandatory (look for peaked T waves, widened QRS).' : ' (above 5.4).'} Differential: ACE/ARB or spironolactone, NSAID-induced renal hypoperfusion, CKD, adrenal insufficiency, rhabdomyolysis, hemolyzed sample (most common false-positive). Always recheck with a clean draw before assuming pathology.`,
        confirmatory_tests: ['Repeat Potassium with NO tourniquet, fast-spin, no fist-pumping (hemolyzed sample is the #1 cause of falsely high K)', 'ECG immediately if K ≥ 6.0', 'Creatinine + eGFR + BUN', 'Aldosterone + Renin (rule out hyporeninemic hypoaldosteronism)', 'AM Cortisol (rule out adrenal insufficiency)', 'Review meds: ACE/ARB, spironolactone, NSAIDs, trimethoprim, potassium supplements', 'Urinalysis + UACR'],
        icd10: 'E87.5',
        what_to_ask_doctor: "My potassium is high. First — can we recheck with a clean draw to rule out hemolysis? If real, I need an ECG, a med review for K-retaining drugs, kidney check, and aldosterone/cortisol screening for adrenal insufficiency.",
        source: 'deterministic',
      };
    },
  },

  // ── Hypoglycemia (Glu < 70 fasting) — differential workup ─────────────
  {
    key: 'hypoglycemia_workup',
    alreadyRaisedIf: [/hypoglycem|low (blood )?sugar/i],
    skipIfDx: ['hypoglycemia'],
    detect: (ctx) => {
      const glu = mark(ctx.labValues, [/\bglucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i, /^glucosa/i]);
      if (!glu || glu.value >= 70) return null;
      return {
        name: 'Hypoglycemia — Whipple triad workup',
        category: 'metabolic',
        confidence: 'moderate',
        evidence: `Glucose ${glu.value} ${glu.unit}${glu.value < 55 ? ' — below the Whipple-triad threshold (55)' : ''}. Differential: reactive hypoglycemia, insulinoma, exogenous insulin / sulfonylurea, adrenal insufficiency, severe liver disease, alcohol with depleted glycogen, sepsis, factitious. A single low draw is often artefact — repeat fasting + post-meal pattern matters.`,
        confirmatory_tests: ['Repeat fasting Glucose + concurrent Insulin + C-peptide (rules out insulinoma vs exogenous insulin)', 'Proinsulin (insulinoma)', 'Beta-Hydroxybutyrate', 'AM Cortisol + ACTH (adrenal insufficiency)', '72-hour fast if recurrent unexplained hypoglycemia', 'Sulfonylurea screen (factitious)', 'Liver Panel'],
        icd10: 'E16.2',
        what_to_ask_doctor: "My glucose came back low. Was it a fasting draw? Can we do a repeat fasting glucose with insulin + C-peptide together to rule out insulinoma vs exogenous insulin, plus check AM cortisol for adrenal insufficiency?",
        source: 'deterministic',
      };
    },
  },

  // ── Hyponatremia (Na < 135) — differential workup ─────────────────────
  {
    key: 'hyponatremia_workup',
    alreadyRaisedIf: [/hyponatrem|low sodium/i],
    skipIfDx: [],
    detect: (ctx) => {
      const na = mark(ctx.labValues, [/^sodium|^sodio/i, /\bna\b/i]);
      if (!na || na.value >= 135) return null;
      const isModerate = na.value < 130;
      const isSevere = na.value < 125;
      return {
        name: isSevere ? 'Severe hyponatremia — urgent workup' : isModerate ? 'Hyponatremia — differential workup' : 'Mild hyponatremia — context-driven workup',
        category: 'renal_endocrine',
        confidence: isModerate ? 'high' : 'moderate',
        evidence: `Sodium ${na.value} ${na.unit}. ${isSevere ? 'Severe — neurologic symptoms (confusion, seizure) emerge at this level. ' : ''}Differential drives entirely by volume status: hypovolemic (GI losses, diuretics, adrenal insufficiency), euvolemic (SIADH — most common; meds like SSRIs, anticonvulsants; hypothyroidism), hypervolemic (CHF, cirrhosis, nephrotic). Pseudohyponatremia (hyperglycemia, hypertriglyceridemia, paraproteinemia) is the false-positive to rule out first.`,
        confirmatory_tests: ['Repeat Sodium with serum osmolality + urine osmolality + urine sodium (the SIADH workup triad)', 'Glucose + Triglycerides + Total Protein (rule out pseudohyponatremia)', 'TSH (hypothyroidism)', 'AM Cortisol + ACTH (adrenal insufficiency)', 'BUN + Creatinine', 'Comprehensive medication review (SSRIs, thiazides, carbamazepine, NSAIDs, DDAVP)', 'Volume status exam'],
        icd10: 'E87.1',
        what_to_ask_doctor: "My sodium is low. We need to figure out if this is real or pseudo-hyponatremia. Can we run serum + urine osmolality, urine sodium, TSH, AM cortisol, and review my meds for SIADH-causing drugs?",
        source: 'deterministic',
      };
    },
  },

  // ── PSA elevation (≥ 4) — prostate workup ─────────────────────────────
  {
    key: 'psa_elevation_workup',
    alreadyRaisedIf: [/psa elevat|prostate (workup|cancer)/i, /bph/i],
    skipIfDx: ['prostate_cancer'],
    detect: (ctx) => {
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      if (!isMale) return null;
      const psa = mark(ctx.labValues, [/^psa\b|^prostate.specific|antígeno prostático/i]);
      if (!psa || psa.value < 4) return null;
      return {
        name: 'PSA elevation — prostate workup',
        category: 'urology',
        confidence: psa.value >= 10 ? 'high' : 'moderate',
        evidence: `PSA ${psa.value} ${psa.unit} (above standard threshold of 4 ng/mL). ${psa.value >= 10 ? 'Risk of prostate cancer rises significantly above 10. ' : ''}Differential: BPH (most common), prostatitis, recent ejaculation/cycling/DRE (false elevation), prostate cancer. Free/Total PSA ratio and PSA velocity refine risk.`,
        confirmatory_tests: ['Free PSA + Free/Total PSA Ratio (<10% = higher cancer risk)', 'Repeat PSA in 6 weeks (after abstaining from ejaculation 48 hours, cycling 24 hours, no DRE)', 'PSA Velocity (yearly trend)', 'PSA Density (if prostate volume known)', 'Urinalysis + Culture (rule out prostatitis)', 'Multiparametric prostate MRI if persistent elevation or rising velocity', 'Urology referral for biopsy decision'],
        icd10: 'R97.20',
        what_to_ask_doctor: "My PSA is elevated. Before jumping to biopsy, can we get a free/total PSA ratio, recheck in 6 weeks with proper prep (no ejaculation 48h, no biking 24h, no DRE pre-draw), check for prostatitis, and consider a prostate MRI?",
        source: 'deterministic',
      };
    },
  },

  // ── Low HDL alone — atherogenic risk modifier ─────────────────────────
  {
    key: 'low_hdl_workup',
    alreadyRaisedIf: [/low hdl/i],
    skipIfDx: [],
    detect: (ctx) => {
      const hdl = mark(ctx.labValues, [/^hdl\b|\bhdl\b|colesterol hdl/i]);
      if (!hdl) return null;
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      const threshold = isMale ? 40 : 50;
      if (hdl.value >= threshold) return null;
      return {
        name: 'Low HDL — atherogenic risk + workup',
        category: 'cardio',
        confidence: 'moderate',
        evidence: `HDL ${hdl.value} ${hdl.unit} (below ${isMale ? '40 male' : '50 female'} threshold). HDL alone is a weak CV predictor but signals one of: metabolic syndrome / insulin resistance (most common), anabolic steroid use (suppresses HDL ~50%), genetic apoA-I variants, severe hypertriglyceridemia, certain meds. ApoB matters more for atherogenic-particle risk — the right next step is to count particles, not just chase HDL.`,
        confirmatory_tests: ['ApoB (atherogenic particle count — the actual CV predictor)', 'Lp(a) — once-in-lifetime genetic screen', 'Fasting Insulin + HOMA-IR (insulin resistance is the most common driver)', 'Total Cholesterol + LDL + non-HDL (full lipid context)', 'hs-CRP', 'Hemoglobin A1c'],
        icd10: 'E78.6',
        what_to_ask_doctor: "My HDL is low. I know HDL alone isn't great evidence, but it's a signal — can we get ApoB and Lp(a) for the actual atherogenic risk picture, plus fasting insulin to check for insulin resistance which is the most common driver?",
        source: 'deterministic',
      };
    },
  },

  // ── Hypertriglyceridemia (150-499) — mild/moderate workup ─────────────
  {
    key: 'hypertriglyceridemia_mild_moderate',
    alreadyRaisedIf: [/hypertriglyc|severe hypertriglyc|metabolic syndrome/i],
    skipIfDx: [],
    detect: (ctx) => {
      const tg = mark(ctx.labValues, [/^triglyc|^triglicér/i]);
      if (!tg || tg.value < 150 || tg.value >= 500) return null;
      return {
        name: 'Hypertriglyceridemia — workup + intervention',
        category: 'cardio',
        confidence: tg.value >= 200 ? 'high' : 'moderate',
        evidence: `Triglycerides ${tg.value} ${tg.unit} (150-499 zone). Most often driven by insulin resistance / metabolic syndrome, alcohol intake, refined-carb diet, hypothyroidism, certain meds (estrogens, thiazides, retinoids). High-dose omega-3 (EPA/DHA 2-4g/day) reliably drops TG 20-30%. Addressing the insulin axis (low-carb pattern + exercise + weight loss + GLP-1 if appropriate) drops further.`,
        confirmatory_tests: ['Repeat Fasting Lipid Panel (must be 12-hr fast)', 'Fasting Insulin + HOMA-IR', 'Hemoglobin A1c', 'TSH', 'Liver Panel (rule out NAFLD)', 'ApoB (atherogenic particle count)', 'Urinalysis (proteinuria suggests nephrotic)'],
        icd10: 'E78.1',
        what_to_ask_doctor: "My triglycerides are elevated. Most likely insulin resistance — can we check fasting insulin, A1c, TSH, and a liver panel for NAFLD? Then we can build a real plan instead of just adding a statin.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated Lp(a) — genetic CV risk ──────────────────────────────────
  {
    key: 'elevated_lp_a',
    alreadyRaisedIf: [/elevated lp\(a\)|lipoprotein.a high/i],
    skipIfDx: [],
    detect: (ctx) => {
      const lpa = mark(ctx.labValues, [/^lp\(a\)|^lipoprotein.?\(?a\)?|^lp-a/i]);
      if (!lpa) return null;
      // Universal threshold: ≥ 75 nmol/L (≈ 30 mg/dL) — AHA/ESC consensus.
      const isHighNmol = lpa.unit.toLowerCase().includes('nmol') && lpa.value >= 75;
      const isHighMg = lpa.unit.toLowerCase().includes('mg') && lpa.value >= 30;
      if (!isHighNmol && !isHighMg) return null;
      return {
        name: 'Elevated Lp(a) — genetic CV risk',
        category: 'cardio',
        confidence: 'high',
        evidence: `Lp(a) ${lpa.value} ${lpa.unit}. Elevated Lp(a) is genetic — set at birth, not modifiable by lifestyle. ~20% of adults have elevated levels. Independent risk factor for ASCVD, aortic stenosis, and recurrent CV events. Doesn't lower with statins. Treatment is aggressive control of every OTHER risk factor (LDL/ApoB target tighter, BP target tighter), plus eligibility for emerging PCSK9 / Lp(a)-directed therapies.`,
        confirmatory_tests: ['Confirm with second measurement (mass = mg/dL; molar = nmol/L — labs differ)', 'ApoB (the modifiable lipid target now becomes tighter — <80 mg/dL)', 'CAC Score (calcium burden in someone with genetic CV risk)', 'Family screening — first-degree relatives need Lp(a)', 'Coronary stress test or CT-angiogram if symptomatic + high CAC'],
        icd10: 'E78.5',
        what_to_ask_doctor: "My Lp(a) is elevated. That's a genetic risk I can't lower — but I want a tighter ApoB target (under 80), a CAC score for actual plaque burden, and Lp(a) testing for my immediate family because this is inherited.",
        source: 'deterministic',
      };
    },
  },

  // ── Isolated AST elevation — workup ───────────────────────────────────
  {
    key: 'isolated_ast_elevation',
    alreadyRaisedIf: [/hepatic stress|nafld|isolated ast|ast elevation/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ast = mark(ctx.labValues, [/^ast\b|sgot|aspartate[\s-]?amin/i]);
      const alt = mark(ctx.labValues, [/^alt\b|sgpt|alanine[\s-]?amin/i]);
      if (!ast || ast.value <= 40) return null;
      // Only fire if AST is high AND ALT is normal (or near it).
      // Hepatic_stress already handles ALT-and-AST together.
      if (alt && alt.value > 40) return null;
      return {
        name: 'Isolated AST elevation — non-hepatic workup',
        category: 'gi',
        confidence: 'moderate',
        evidence: `AST ${ast.value} U/L with normal ALT. AST is also released from muscle, heart, and RBCs — isolated elevation often points away from liver. Differential: recent exercise (heavy lifting, marathon), muscle injury / rhabdomyolysis, statin myopathy, hemolysis, thyroid disease, alcohol (typically AST > ALT 2:1), early NAFLD progressing.`,
        confirmatory_tests: ['Repeat AST + ALT after 48 hours of rest (rules out exercise/muscle source)', 'Creatine Kinase (CK) — muscle marker', 'LDH + Haptoglobin (rule out hemolysis)', 'TSH', 'GGT (true hepatic vs muscle origin — GGT high = liver)', 'Liver Ultrasound if persistent + GGT elevated'],
        icd10: 'R74.01',
        what_to_ask_doctor: "My AST is high but my ALT is normal. That's often muscle, not liver — can we recheck after 48 hours of rest plus check CK to confirm it's not liver origin?",
        source: 'deterministic',
      };
    },
  },

  // ── Isolated AlkPhos elevation — biliary vs bone workup ───────────────
  {
    key: 'isolated_alkphos_elevation',
    alreadyRaisedIf: [/isolated alk phos|cholestasis|alk phos elevation/i],
    skipIfDx: [],
    detect: (ctx) => {
      const alp = mark(ctx.labValues, [/^alkaline\s*phosphatase|^alk\s*phos|^alp\b|^fosfatasa alcalina/i]);
      if (!alp || alp.value <= 130) return null;
      return {
        name: 'Alkaline phosphatase elevation — biliary vs bone',
        category: 'gi',
        confidence: 'moderate',
        evidence: `Alkaline Phosphatase ${alp.value} U/L. AlkPhos comes from liver/biliary AND from bone — the differential splits there. GGT is the discriminator: high GGT = biliary; normal GGT = bone source (Paget's, healing fracture, metastases, vitamin D deficiency, hyperparathyroidism, growing adolescent).`,
        confirmatory_tests: ['GGT (key discriminator — high = biliary, normal = bone)', 'AlkPhos Isoenzymes / Heat-Stable AlkPhos (bone vs liver separation)', 'Calcium + Phosphorus + PTH + 25-OH Vitamin D (bone workup)', 'Bilirubin (Total + Direct) — biliary obstruction', 'Right Upper Quadrant Ultrasound if biliary suspected', 'Bone scan if persistent bone-source pattern'],
        icd10: 'R74.8',
        what_to_ask_doctor: "My alkaline phosphatase is high. Is the source liver or bone? Can we get GGT to separate — if GGT is normal, this is bone and we should check PTH, Vit D, calcium, phosphorus.",
        source: 'deterministic',
      };
    },
  },

  // ── Isolated GGT elevation (no ALT/AST) — already has discussion ─────
  // The discussion point in proseTemplates already covers this clinically.
  // Adding a formal condition card so the wellness plan / doctor prep show it
  // as its own pattern.
  {
    key: 'isolated_ggt_elevation',
    alreadyRaisedIf: [/isolated ggt|alcohol pattern|hepatic stress/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ggt = mark(ctx.labValues, [/^ggt\b|gamma[\s-]?glutamyl/i]);
      const alt = mark(ctx.labValues, [/^alt\b|sgpt/i]);
      const ast = mark(ctx.labValues, [/^ast\b|sgot/i]);
      if (!ggt || ggt.value <= 60) return null;
      if (alt && alt.value > 40) return null;
      if (ast && ast.value > 40) return null;
      return {
        name: 'Isolated GGT elevation — alcohol vs metabolic liver',
        category: 'gi',
        confidence: 'moderate',
        evidence: `GGT ${ggt.value} U/L with normal AST/ALT. Most common driver in adults: alcohol intake (even moderate — GGT is very sensitive). Other drivers: NAFLD / early metabolic liver stress, medications (statins, anticonvulsants, antibiotics), biliary disease, smoking. Honest alcohol-intake review is the highest-yield next step.`,
        confirmatory_tests: ['Liver Panel (full) repeated in 4-6 weeks after a 3-week alcohol-abstinence trial', 'Hemoglobin A1c + Fasting Insulin + HOMA-IR (metabolic liver pattern)', 'Right Upper Quadrant Ultrasound (NAFLD)', 'Bilirubin Total + Direct', 'Medication review (statins, anticonvulsants are common drivers)'],
        icd10: 'R74.01',
        what_to_ask_doctor: "My GGT is elevated alone. Can we do an honest alcohol intake review, repeat the liver panel after a 3-week abstinence trial, and check for NAFLD with an ultrasound + insulin resistance markers?",
        source: 'deterministic',
      };
    },
  },

  // ── Low testosterone (male) — hypogonadism workup ─────────────────────
  {
    key: 'low_testosterone_male',
    alreadyRaisedIf: [/hypogonad|low (t|testosterone)/i, /supraphysiolog/i],
    skipIfDx: ['hypogonadism'],
    detect: (ctx) => {
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      if (!isMale) return null;
      const t = mark(ctx.labValues, [/^testosterone[,\s]+total|^total testosterone|^testosterona[,\s]+total|^total testosterona|^testosterone$|^testosterona$/i]);
      if (!t) return null;
      // Convert to ng/dL universal threshold (300 ng/dL is endocrine society cutoff)
      const isNgPerMl = t.unit.toLowerCase().includes('ng/ml');
      const valueNgDl = isNgPerMl ? t.value * 100 : t.value;
      if (valueNgDl >= 300) return null;
      return {
        name: 'Low testosterone (male) — hypogonadism workup',
        category: 'endocrine',
        confidence: 'high',
        evidence: `Total Testosterone ${t.value} ${t.unit} (≈${valueNgDl.toFixed(0)} ng/dL) — below the Endocrine Society 300 ng/dL threshold for adult males. Symptoms (low libido, ED, fatigue, weight resistance, mood, low muscle mass) plus two AM fasting low values confirm hypogonadism. Then split: primary (testicular — LH/FSH high) vs secondary (pituitary/hypothalamic — LH/FSH normal or low) drives the workup.`,
        confirmatory_tests: ['Repeat AM (8-10 AM) fasting Total Testosterone — single low value isn\'t diagnostic', 'Free + Bioavailable Testosterone + SHBG', 'LH + FSH (primary vs secondary split)', 'Prolactin (rule out prolactinoma if LH low)', 'Estradiol (Sensitive, LC-MS/MS) — aromatization issues', 'TSH', 'AM Cortisol (secondary hypogonadism workup)', 'Iron Panel + Ferritin (hemochromatosis impairs testicular function)', 'Pituitary MRI if LH/FSH low + prolactin abnormal', 'Sperm analysis if fertility relevant'],
        icd10: 'E29.1',
        what_to_ask_doctor: "My testosterone is below 300. Can we confirm with a second AM fasting draw, then run LH/FSH to split primary vs secondary hypogonadism, plus prolactin, estradiol, and TSH? I want to understand the cause before starting TRT.",
        source: 'deterministic',
      };
    },
  },

  // ── Vitamin D toxicity / excess (>100 ng/mL) ──────────────────────────
  {
    key: 'vitamin_d_excess',
    alreadyRaisedIf: [/vitamin d (toxic|excess|hypervitamin)/i],
    skipIfDx: [],
    detect: (ctx) => {
      const d = mark(ctx.labValues, [/^25.?hydroxy.*vitamin d|^vitamin d.*25|^25\(?oh\)?d|^25-hydroxyvitamin|^vitamin d\b|^vitamina d 25oh|^calcidiol/i]);
      if (!d) return null;
      // Universal threshold: ng/mL ≥ 100 OR nmol/L ≥ 250 (these are equivalent)
      const isNgPerMl = d.unit.toLowerCase().includes('ng/ml');
      const isNmolPerL = d.unit.toLowerCase().includes('nmol');
      if (isNgPerMl && d.value < 100) return null;
      if (isNmolPerL && d.value < 250) return null;
      if (!isNgPerMl && !isNmolPerL) return null;
      return {
        name: 'Vitamin D excess — toxicity surveillance',
        category: 'endocrine',
        confidence: 'high',
        evidence: `25-OH Vitamin D ${d.value} ${d.unit}. Above 100 ng/mL (250 nmol/L) raises concern for hypervitaminosis — most common cause is over-supplementation, occasionally granulomatous disease (sarcoid, TB, lymphoma) which produces 1,25-OH-D extrarenally. Drives hypercalcemia → kidney stones, soft-tissue calcification, neuropsych symptoms.`,
        confirmatory_tests: ['STOP all Vitamin D supplementation immediately', 'Serum Calcium + Ionized Calcium + Phosphorus + PTH (hypercalcemia workup)', '24-hour Urine Calcium (hypercalciuria)', '1,25-OH Vitamin D (rules out granulomatous source)', 'Repeat 25-OH Vitamin D in 8-12 weeks after stopping supplement', 'BUN + Creatinine + eGFR (renal effect)', 'Chest X-ray + ACE level if granulomatous suspected'],
        icd10: 'E67.3',
        what_to_ask_doctor: "My Vitamin D is above 100. I need to STOP supplementing, check my calcium and PTH for hypercalcemia, get a 24-hour urine calcium, and recheck D in 8-12 weeks. If calcium is also high, we need to rule out granulomatous disease.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated CRP / hs-CRP — inflammation differential ─────────────────
  {
    key: 'elevated_crp_inflammation',
    alreadyRaisedIf: [/elevated crp|inflammation pattern/i],
    skipIfDx: [],
    detect: (ctx) => {
      const crp = mark(ctx.labValues, [/hs[-\s]?crp|c[-\s]?reactive protein|^crp\b|^proteína c reactiva/i]);
      if (!crp || crp.value <= 3) return null;
      const isHigh = crp.value > 10;
      return {
        name: isHigh ? 'Markedly elevated CRP — active inflammation' : 'Elevated CRP — inflammation workup',
        category: 'inflammation',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `CRP ${crp.value} ${crp.unit}. ${isHigh ? 'Above 10 mg/L = significant active inflammation — usually acute infection, flare of autoimmune disease, or recent injury/surgery. ' : 'Between 3 and 10 = chronic low-grade inflammation. '}Differential: subclinical infection, autoimmune disease, obesity/insulin resistance, smoking, periodontal disease, recent injury. Independent CV risk factor at any level above optimal.`,
        confirmatory_tests: ['Repeat hs-CRP in 4-6 weeks (acute spikes resolve; chronic stays up)', 'ESR (different inflammation marker — discordance with CRP is informative)', 'Complete Blood Count + Differential', 'Ferritin (acute-phase reactant)', 'ANA + RF + anti-CCP if autoimmune signals', 'Urinalysis + Hemoglobin A1c + Lipid Panel (metabolic inflammation)', 'Dental review (periodontal is a common silent source)'],
        icd10: 'R74.0',
        what_to_ask_doctor: "My CRP is elevated. Can we recheck in 4-6 weeks, run ESR for comparison, screen autoimmune (ANA, RF, anti-CCP) if I have joint symptoms, and check for metabolic inflammation (A1c, lipids)? Also worth asking my dentist about periodontal disease.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated ESR — chronic inflammation ───────────────────────────────
  {
    key: 'elevated_esr_chronic_inflammation',
    alreadyRaisedIf: [/elevated esr|inflammation pattern|elevated crp/i],
    skipIfDx: [],
    detect: (ctx) => {
      const esr = mark(ctx.labValues, [/^esr\b|sed rate|sedimentation rate/i]);
      if (!esr || esr.value <= 30) return null;
      return {
        name: 'Elevated ESR — chronic inflammation workup',
        category: 'inflammation',
        confidence: 'moderate',
        evidence: `ESR ${esr.value} ${esr.unit}. ESR rises slowly (days) compared to CRP (hours) — picks up chronic, smoldering inflammation. Differential: autoimmune (lupus, RA, vasculitis — esp. giant cell arteritis if over 60), chronic infection (TB, osteomyelitis, endocarditis), malignancy (multiple myeloma, lymphoma), anemia (raises ESR independently). Discordance with CRP is informative — high ESR + normal CRP often points at myeloma, anemia, or pregnancy.`,
        confirmatory_tests: ['hs-CRP for comparison', 'Complete Blood Count', 'SPEP + Free Light Chains (myeloma rule-out, esp. age 50+)', 'ANA + RF + anti-CCP', 'Temporal Artery Biopsy if age >50 + headache/jaw claudication/vision changes (giant cell arteritis)', 'Imaging directed by symptoms', 'Ferritin'],
        icd10: 'R70.0',
        what_to_ask_doctor: "My ESR is high. ESR catches chronic stuff CRP misses. Can we compare with CRP, check SPEP + free light chains for myeloma if I'm over 50, and screen autoimmune with ANA/RF/anti-CCP?",
        source: 'deterministic',
      };
    },
  },

  // ── High estradiol in male — aromatization / anabolic context ─────────
  {
    key: 'elevated_estradiol_male',
    alreadyRaisedIf: [/elevated estradiol|aromatiz|supraphysiologic/i],
    skipIfDx: [],
    detect: (ctx) => {
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      if (!isMale) return null;
      const e2 = mark(ctx.labValues, [/^estradiol|^e2\b|^estradiol sensitive/i]);
      if (!e2 || e2.value < 60) return null; // ng/L = pg/mL — universal upper for males ~40-50
      return {
        name: 'Elevated estradiol (male) — aromatization workup',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `Estradiol ${e2.value} ${e2.unit} in a male — above typical reference. Most common cause: aromatization from supraphysiologic testosterone (TRT or anabolic), obesity (adipose aromatase), or excess alcohol intake. Less common: estrogen-secreting tumor, liver disease impaired clearance, hyperthyroidism. Drives gynecomastia, fluid retention, mood lability.`,
        confirmatory_tests: ['Estradiol Sensitive (LC-MS/MS) — confirm with the more accurate assay', 'Total Testosterone + Free Testosterone + SHBG (check the aromatization substrate)', 'LH + FSH', 'Prolactin', 'Liver Panel (impaired estrogen clearance)', 'TSH', 'Body composition / BMI review (adipose aromatase)'],
        icd10: 'E28.0',
        what_to_ask_doctor: "My estradiol is elevated. If I'm on TRT or supplementing testosterone, this is likely aromatization. Can we get a sensitive E2 assay (LC-MS/MS), check total/free T + SHBG, and consider an aromatase inhibitor if symptoms warrant?",
        source: 'deterministic',
      };
    },
  },

  // ── Hyperhomocysteinemia — CV / methylation workup ────────────────────
  {
    key: 'hyperhomocysteinemia',
    alreadyRaisedIf: [/hyperhomocyst|elevated homocyst/i],
    skipIfDx: [],
    detect: (ctx) => {
      const hcy = mark(ctx.labValues, [/^homocystein/i]);
      if (!hcy || hcy.value < 13) return null;
      return {
        name: 'Hyperhomocysteinemia — CV + methylation workup',
        category: 'cardio',
        confidence: 'moderate',
        evidence: `Homocysteine ${hcy.value} ${hcy.unit} (above 13 µmol/L). Independent CV risk factor + signal for functional B12, folate, or B6 deficiency. Most respond rapidly to methylated B-complex. Persistently elevated despite B-vitamin repletion suggests MTHFR polymorphism (~40% of population) or renal impairment. CBS gene mutations are rare but severe.`,
        confirmatory_tests: ['B12 + MMA + Methylated B-Complex trial (8-12 weeks)', 'RBC Folate (3-month folate store)', 'Vitamin B6 (P5P plasma)', 'TSH (hypothyroidism elevates homocysteine)', 'Creatinine + eGFR (renal impairment elevates homocysteine)', 'MTHFR genetic testing if persistent despite repletion'],
        icd10: 'E72.11',
        what_to_ask_doctor: "My homocysteine is high. Most often this is a functional B12, folate, or B6 deficiency. Can I trial methylated B-complex for 8-12 weeks, recheck, and if it's still elevated consider MTHFR testing?",
        source: 'deterministic',
      };
    },
  },

  // ── Folate deficiency — universal repletion + workup ──────────────────
  {
    key: 'folate_deficiency',
    alreadyRaisedIf: [/folate deficien|low folate/i],
    skipIfDx: [],
    detect: (ctx) => {
      const fol = mark(ctx.labValues, [/^folate\b|^rbc folate|^serum folate/i]);
      if (!fol || fol.value >= 4) return null;
      return {
        name: 'Folate deficiency — universal repletion + workup',
        category: 'hematology',
        confidence: 'high',
        evidence: `Folate ${fol.value} ${fol.unit}. Drives macrocytic anemia, hyperhomocysteinemia, mood/cognitive symptoms, and (in women of reproductive age) neural tube defect risk. Common drivers: dietary (low leafy greens), alcohol, certain meds (methotrexate, sulfasalazine, phenytoin, oral contraceptives), malabsorption (celiac, IBD), MTHFR variants reducing methylfolate conversion.`,
        confirmatory_tests: ['Methylfolate (5-MTHF) 400-800 mcg/day — start now', 'Vitamin B12 + MMA (always check B12 BEFORE folate repletion alone — masks B12 deficiency)', 'Homocysteine (functional folate status)', 'Celiac Serology (tTG-IgA + Total IgA) if no obvious dietary cause', 'CBC + MCV (rule out macrocytic anemia)', 'Liver Panel (alcohol screen)', 'Medication review'],
        icd10: 'D52.9',
        what_to_ask_doctor: "My folate is low. Before just supplementing, can we also check B12 + MMA so we don't mask a B12 deficiency? And screen for celiac if my diet isn't the obvious cause?",
        source: 'deterministic',
      };
    },
  },

  // ── Anemia (Hgb low, less severe than 8) — universal workup ───────────
  {
    key: 'anemia_general_workup',
    alreadyRaisedIf: [/anemia|iron deficien|severe anemia/i, /sickle|thalassem/i],
    skipIfDx: [],
    detect: (ctx) => {
      const hgb = mark(ctx.labValues, [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i, /^hemoglobina\b(?!\s*a1c)/i]);
      if (!hgb) return null;
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      const threshold = isMale ? 13.5 : 12.0;
      if (hgb.value >= threshold) return null;
      if (hgb.value < 8) return null; // severe handled by severe_anemia_workup
      // Yield to the more-specific Iron Deficiency Anemia detector when
      // ferritin is also low — IDA handles that combo. Same for B12 / folate.
      const ferritin = mark(ctx.labValues, [/^ferritin/i]);
      if (ferritin && ferritin.value < 30) return null;
      const b12 = mark(ctx.labValues, [/^vitamin b.?12$|^b12$/i]);
      if (b12 && b12.value < 250) return null;
      return {
        name: 'Anemia — universal differential workup',
        category: 'hematology',
        confidence: 'high',
        evidence: `Hgb ${hgb.value} ${hgb.unit} (below ${threshold} ${isMale ? 'male' : 'female'} threshold). Differential by MCV: microcytic (iron deficiency, thalassemia, chronic disease, lead) — most common; normocytic (acute blood loss, hemolysis, chronic disease, marrow failure, mixed nutrient deficiency); macrocytic (B12 / folate / hypothyroid / liver / alcohol / myelodysplasia). MCV + reticulocyte count narrow the cause fast.`,
        confirmatory_tests: ['CBC with Differential + MCV + RDW + Reticulocyte Count', 'Iron Panel (Iron, TIBC, Ferritin, Transferrin Saturation)', 'Vitamin B12 + Methylmalonic Acid', 'Folate (Serum + RBC)', 'Peripheral Blood Smear', 'TSH', 'Creatinine + eGFR (CKD anemia)', 'Stool occult blood / FIT (GI bleed)', 'Hemoglobin Electrophoresis if microcytic + normal iron (thalassemia)'],
        icd10: 'D64.9',
        what_to_ask_doctor: "My hemoglobin is low. Can we run the full anemia panel — reticulocyte count, iron studies, B12/folate, TSH, and a smear? And FIT for GI bleed since that's the most-missed cause in adults.",
        source: 'deterministic',
      };
    },
  },

  // ── Hyperphosphatemia — renal / endocrine workup ──────────────────────
  {
    key: 'hyperphosphatemia',
    alreadyRaisedIf: [/hyperphosphatem|elevated phosph/i],
    skipIfDx: [],
    detect: (ctx) => {
      const phos = mark(ctx.labValues, [/^phosphor|^phosphate|^fosfato/i]);
      if (!phos || phos.value <= 4.5) return null;
      return {
        name: 'Hyperphosphatemia — renal / endocrine workup',
        category: 'renal_endocrine',
        confidence: 'moderate',
        evidence: `Phosphorus ${phos.value} ${phos.unit}. Most common driver: reduced renal clearance (CKD stage 3-5). Less common: hypoparathyroidism, vitamin D toxicity, hemolyzed sample (recheck cleanly first), rhabdomyolysis, tumor lysis. Drives soft-tissue calcification + vascular calcification long-term.`,
        confirmatory_tests: ['Repeat Phosphorus with clean draw (rule out hemolyzed sample)', 'Creatinine + eGFR + Cystatin-C', 'Calcium + Ionized Calcium + PTH + 25-OH Vitamin D', 'CK + LDH (rhabdomyolysis)', 'UACR + Urine Phosphorus (renal vs intake)'],
        icd10: 'E83.39',
        what_to_ask_doctor: "My phosphorus is high. Can we check kidney function (creatinine, eGFR, cystatin-C), parathyroid axis (Ca, PTH, Vit D), and rule out a hemolyzed sample with a clean repeat draw?",
        source: 'deterministic',
      };
    },
  },

  // ── Hypocalcemia — workup ─────────────────────────────────────────────
  {
    key: 'hypocalcemia_workup',
    alreadyRaisedIf: [/hypocalcem|low calcium/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ca = mark(ctx.labValues, [/^calcium\b|^calcio/i]);
      if (!ca || ca.value >= 8.5) return null;
      return {
        name: 'Hypocalcemia — workup',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `Calcium ${ca.value} ${ca.unit}. First step: correct for albumin (low albumin pseudo-hypocalcemia) or measure ionized calcium directly. True hypocalcemia differential: vitamin D deficiency (most common), hypoparathyroidism, magnesium deficiency, CKD with secondary hyperparathyroidism, pancreatitis, drug-induced (bisphosphonates, denosumab).`,
        confirmatory_tests: ['Ionized Calcium (the definitive measure — bypasses albumin issue)', 'Albumin + Total Protein (correction calculation)', 'PTH + 25-OH Vitamin D', 'Magnesium', 'Creatinine + eGFR + Phosphorus (CKD-related secondary HPT)', '24-hour Urine Calcium', 'Lipase if abdominal symptoms (pancreatitis)'],
        icd10: 'E83.51',
        what_to_ask_doctor: "My calcium is low. Can we measure ionized calcium directly, plus PTH, 25-OH vitamin D, and magnesium? Low magnesium causes functional hypoparathyroidism and gets missed.",
        source: 'deterministic',
      };
    },
  },

  // ── Hypomagnesemia — workup (when not med-driven) ─────────────────────
  {
    key: 'hypomagnesemia_workup',
    alreadyRaisedIf: [/hypomagnesem|low magnesium/i, /ppi.*depletion|ppi.*magnesium/i],
    skipIfDx: [],
    detect: (ctx) => {
      const mg = mark(ctx.labValues, [/^magnesium|^magnesio/i]);
      if (!mg || mg.value >= 1.8) return null;
      return {
        name: 'Hypomagnesemia — workup + repletion',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `Magnesium ${mg.value} ${mg.unit}. Serum Mg reflects only ~1% of total body Mg — true deficiency is underdetected. Drivers: chronic PPI use (well-established), thiazide / loop diuretics, alcohol, malabsorption (IBD, celiac, post-bariatric), uncontrolled diabetes, hypocalcemia / hypokalemia (often coexist — Mg deficiency causes both). RBC Mg is more sensitive.`,
        confirmatory_tests: ['RBC Magnesium (more sensitive than serum)', 'Calcium + Potassium (frequently coexisting deficits)', 'PTH + 25-OH Vitamin D', 'Comprehensive medication review (PPIs, diuretics, antibiotics)', 'Celiac Serology if no obvious cause', '24-hour Urine Magnesium (renal vs GI loss)'],
        icd10: 'E83.42',
        what_to_ask_doctor: "My magnesium is low. Can we also check potassium and calcium since they often go together, plus RBC magnesium for the actual tissue picture? And review my meds — PPIs and thiazides are the common culprits.",
        source: 'deterministic',
      };
    },
  },

  // ── Hyperuricemia — gout / MPN workup ─────────────────────────────────
  {
    key: 'hyperuricemia_workup',
    alreadyRaisedIf: [/hyperuricem|gout|elevated uric/i],
    skipIfDx: ['gout'],
    detect: (ctx) => {
      const ua = mark(ctx.labValues, [/^urate|^uric acid|^urato/i]);
      if (!ua || ua.value < 7) return null;
      return {
        name: 'Hyperuricemia — gout / MPN / metabolic workup',
        category: 'metabolic',
        confidence: ua.value >= 9 ? 'high' : 'moderate',
        evidence: `Uric Acid ${ua.value} ${ua.unit}. Drivers: insulin resistance / metabolic syndrome (most common), alcohol (esp. beer + spirits), high-fructose diet, certain meds (thiazides, loop diuretics, low-dose aspirin, niacin), renal impairment, high cell turnover (MPN, hemolysis, tumor lysis). CV + CKD risk is independent of gout.`,
        confirmatory_tests: ['Fasting Insulin + HOMA-IR + Hemoglobin A1c (insulin resistance)', 'Lipid Panel (metabolic syndrome cluster)', 'Creatinine + eGFR + UACR', '24-hour Urine Uric Acid (under-excretor vs over-producer)', 'CBC + LDH if very high or persistent (MPN screen)', 'Medication review', 'Joint imaging / arthrocentesis if symptomatic'],
        icd10: 'E79.0',
        what_to_ask_doctor: "My uric acid is high. Most of the time this is insulin resistance + diet — can we check fasting insulin, A1c, and lipids, plus get a 24-hour urine to see if I under-excrete or over-produce? Also review my meds for K-wasting diuretics.",
        source: 'deterministic',
      };
    },
  },

  // ── Thrombocytosis (Plt > 450) — workup ───────────────────────────────
  {
    key: 'thrombocytosis_workup',
    alreadyRaisedIf: [/thrombocytos|essential thrombocyth/i],
    skipIfDx: ['et', 'essential_thrombocythemia'],
    detect: (ctx) => {
      const plt = mark(ctx.labValues, [/^platelets?\b|^plaquetas\b/i]);
      if (!plt || plt.value <= 450) return null;
      return {
        name: 'Thrombocytosis — reactive vs primary',
        category: 'hematology',
        confidence: plt.value > 600 ? 'high' : 'moderate',
        evidence: `Platelets ${plt.value} ${plt.unit}. Reactive thrombocytosis (most common) drivers: iron deficiency, recent infection / inflammation, splenectomy, malignancy. Primary thrombocytosis is rarer but serious: essential thrombocythemia (JAK2 V617F, CALR, MPL), polycythemia vera (also high Hct), primary myelofibrosis. Persistently > 600 warrants hematology referral.`,
        confirmatory_tests: ['Repeat CBC with Manual Differential', 'Iron Panel + Ferritin (iron deficiency is the most common reactive cause)', 'hs-CRP + ESR (inflammation)', 'JAK2 V617F mutation (essential thrombocythemia)', 'BCR-ABL (rule out CML)', 'CALR + MPL mutations if JAK2 negative', 'Peripheral Blood Smear', 'Bone marrow biopsy if persistent + age > 50 + primary suspected'],
        icd10: 'D75.81',
        what_to_ask_doctor: "My platelets are high. Most often this is iron deficiency or recent infection — can we rule those out first with iron panel + CRP + ESR? If still high after that, JAK2 V617F to rule out essential thrombocythemia.",
        source: 'deterministic',
      };
    },
  },

  // ── BUN elevation (without Cr elevation) — pre-renal / GI workup ──────
  {
    key: 'bun_elevation_isolated',
    alreadyRaisedIf: [/bun.*creatinine ratio|prerenal|isolated bun/i, /ckd|chronic kidney/i],
    skipIfDx: ['ckd'],
    detect: (ctx) => {
      const bun = mark(ctx.labValues, [/^bun\b|urea nitrogen|^urea\b/i]);
      const cr = mark(ctx.labValues, [/^creatinine\b/i]);
      if (!bun || bun.value < 25) return null;
      // Skip if Cr also high — that's CKD territory (already detected)
      if (cr && cr.value > 1.3) return null;
      return {
        name: 'BUN elevation — pre-renal / GI / catabolic workup',
        category: 'renal_endocrine',
        confidence: 'moderate',
        evidence: `BUN ${bun.value} ${bun.unit} with normal creatinine. Differential (BUN/Cr ratio matters): pre-renal (dehydration, heart failure, NSAIDs, diuretics — ratio > 20:1), GI bleed (heme protein → urea load — ratio > 30:1), high-protein diet, catabolic state (steroids, infection, burns, fasting), tetracycline therapy.`,
        confirmatory_tests: ['Recheck BUN + Creatinine after hydration', 'BUN/Cr Ratio calculation', 'Stool occult blood / FIT (GI bleed)', 'Comprehensive medication review (NSAIDs, diuretics, steroids, tetracyclines)', 'Cystatin-C eGFR (rules out CKD masked by low muscle mass)', 'CBC (anemia from occult blood loss)'],
        icd10: 'R79.89',
        what_to_ask_doctor: "My BUN is high but my creatinine is normal. Can we look at the BUN/Cr ratio — if it's >30:1, we should screen for GI bleed with a FIT test. Also worth checking hydration status and reviewing my meds.",
        source: 'deterministic',
      };
    },
  },

  // ── Low Free T4 (overt hypothyroid pattern even if TSH still normal) ──
  {
    key: 'low_free_t4_workup',
    alreadyRaisedIf: [/hypothyroid|hashimoto|overt hypothyroidism|central hypothyroidism/i, /thyroid pattern/i],
    skipIfDx: ['hypothyroidism'],
    detect: (ctx) => {
      const ft4 = mark(ctx.labValues, [/free t4|^t4,?\s*free|tiroxina libre/i]);
      if (!ft4 || ft4.value >= 0.8) return null;
      const tsh = mark(ctx.labValues, [/^tsh\b/i]);
      // If TSH is high + Free T4 low, the overt hypothyroidism detector already
      // handles this. Fire HERE specifically for central hypothyroidism:
      // Free T4 low + TSH normal-or-low (pituitary problem).
      const tshNormalOrLow = !tsh || tsh.value <= 4.5;
      if (!tshNormalOrLow) return null;
      return {
        name: 'Low Free T4 with non-elevated TSH — central hypothyroidism workup',
        category: 'endocrine',
        confidence: 'high',
        evidence: `Free T4 ${ft4.value} ${ft4.unit} with TSH ${tsh ? `${tsh.value} ${tsh.unit}` : 'unmeasured'}. Low Free T4 + normal or low TSH = central (pituitary or hypothalamic) hypothyroidism. The pituitary fails to drive TSH up despite low thyroid hormone — very different workup than primary hypothyroidism. Rule out pituitary tumor / infiltration / damage.`,
        confirmatory_tests: ['Free T3', 'Reverse T3', 'Prolactin (pituitary co-axis)', 'AM Cortisol + ACTH (always confirm adrenal function BEFORE starting levothyroxine in central hypo — replacement can precipitate adrenal crisis)', 'IGF-1 (growth hormone axis)', 'LH + FSH + Testosterone or Estradiol (gonadal axis)', 'Pituitary MRI', 'Endocrine referral'],
        icd10: 'E03.9',
        what_to_ask_doctor: "My Free T4 is low but my TSH isn't high — that's central hypothyroidism. Before starting levothyroxine, can we check AM cortisol/ACTH to rule out adrenal insufficiency, run prolactin and IGF-1 for full pituitary axis, and get a pituitary MRI?",
        source: 'deterministic',
      };
    },
  },

  // ── Hypernatremia (Na > 145) — workup ─────────────────────────────────
  {
    key: 'hypernatremia_workup',
    alreadyRaisedIf: [/hypernatrem|high sodium/i],
    skipIfDx: [],
    detect: (ctx) => {
      const na = mark(ctx.labValues, [/^sodium|^sodio/i]);
      if (!na || na.value <= 145) return null;
      return {
        name: 'Hypernatremia — volume / endocrine workup',
        category: 'renal_endocrine',
        confidence: na.value >= 150 ? 'high' : 'moderate',
        evidence: `Sodium ${na.value} ${na.unit}. Almost always reflects water deficit (not sodium excess). Differential: inadequate water intake (elderly, dementia, immobile), diabetes insipidus (central or nephrogenic — lithium, demeclocycline), osmotic diuresis (uncontrolled diabetes, mannitol), GI / insensible losses without water replacement.`,
        confirmatory_tests: ['Repeat Sodium + serum osmolality + urine osmolality + urine sodium', 'Glucose + Hemoglobin A1c (rule out osmotic diuresis)', 'Volume status exam', 'Water deprivation test if DI suspected', 'Lithium level if on lithium', 'BUN + Creatinine'],
        icd10: 'E87.0',
        what_to_ask_doctor: "My sodium is high. Almost always this means water deficit. Can we check serum + urine osmolality, glucose for osmotic diuresis, and review my fluid intake / any meds that drive water loss?",
        source: 'deterministic',
      };
    },
  },

  // ── Hypokalemia (standalone, no HTN context) ──────────────────────────
  {
    key: 'hypokalemia_standalone',
    alreadyRaisedIf: [/hypokalem|low potassium|primary aldosteron|diuretic.induced hypokalemia/i],
    skipIfDx: [],
    detect: (ctx) => {
      const k = mark(ctx.labValues, [/^potassium|^potasio/i]);
      if (!k || k.value >= 3.5) return null;
      // Skip if HTN-driven path will handle it (already detected by primary_aldosteronism)
      const hasHtn = /hypertension|htn|high blood pressure/i.test(ctx.conditionsLower ?? '');
      if (hasHtn && k.value < 3.5) return null; // primary_aldosteronism handles
      const isSevere = k.value < 3.0;
      return {
        name: isSevere ? 'Severe hypokalemia — urgent workup' : 'Hypokalemia — workup',
        category: 'renal_endocrine',
        confidence: isSevere ? 'high' : 'moderate',
        evidence: `Potassium ${k.value} ${k.unit}. ${isSevere ? 'Significant cardiac arrhythmia risk. ' : ''}Differential: GI losses (vomiting, diarrhea, laxative abuse), renal losses (diuretics — most common; primary aldosteronism; Bartter / Gitelman if young), poor intake (rare alone), magnesium deficiency (causes refractory hypokalemia — always check), insulin / β-agonists / refeeding (shift into cells), licorice (real licorice causes pseudoaldosteronism).`,
        confirmatory_tests: ['Repeat Potassium + Magnesium', '24-hour Urine Potassium + Urine Sodium (renal vs GI loss separator)', 'ECG if K < 3.0', 'Aldosterone + Renin if no obvious cause', 'Bicarbonate / Anion Gap (alkalosis pattern)', 'Medication review (diuretics, laxatives, steroids, β-agonists)'],
        icd10: 'E87.6',
        what_to_ask_doctor: "My potassium is low. First step is replete magnesium — low Mg makes K stay low even with supplementation. Then 24-hour urine K to figure out renal vs GI loss, plus a med review for diuretics or laxatives.",
        source: 'deterministic',
      };
    },
  },

  // ── Leukopenia (WBC < 3.5) — universal workup ─────────────────────────
  {
    key: 'leukopenia_workup',
    alreadyRaisedIf: [/leukopen|low wbc|neutropen/i],
    skipIfDx: [],
    detect: (ctx) => {
      const wbc = mark(ctx.labValues, [/^wbc\b|^leucocitos\b|^white blood cell/i]);
      if (!wbc || wbc.value >= 3.5) return null;
      return {
        name: 'Leukopenia — differential workup',
        category: 'hematology',
        confidence: wbc.value < 2.0 ? 'high' : 'moderate',
        evidence: `WBC ${wbc.value} ${wbc.unit}. Differential: drug-induced (chemo, antibiotics, antithyroids, antipsychotics, methotrexate, sulfasalazine), viral infection (HIV, hepatitis, EBV, parvovirus), autoimmune (lupus, RA), B12 / folate / copper deficiency, marrow failure, hypersplenism, post-radiation, congenital benign (esp. African ancestry — Duffy-null phenotype reduces baseline ANC harmlessly).`,
        confirmatory_tests: ['Repeat CBC with Manual Differential', 'Peripheral Blood Smear', 'Vitamin B12 + Folate + Copper', 'HIV + Hepatitis B + C + EBV serology', 'ANA + RF if autoimmune signals', 'Comprehensive medication review', 'Flow Cytometry if persistent or progressive'],
        icd10: 'D72.819',
        what_to_ask_doctor: "My white blood cells are low. Can we figure out why — repeat CBC with manual diff, check for viral infections (HIV, hepatitis, EBV), screen B12/folate/copper, and review my medication list for marrow-suppressive drugs?",
        source: 'deterministic',
      };
    },
  },

  // ── Low DHEA-S — adrenal androgen workup ──────────────────────────────
  {
    key: 'low_dhea_s',
    alreadyRaisedIf: [/low dhea|dhea deficien|adrenal (insuffic|fatigue)/i],
    skipIfDx: ['adrenal_insufficiency'],
    detect: (ctx) => {
      const dheas = mark(ctx.labValues, [/^dhea[\s-]*s\b|^dhea sulfate|^dhea-?s\b/i]);
      if (!dheas) return null;
      // Universal age/sex-aware threshold: <80 µg/dL is broadly low for adults
      // under 50 (declines naturally with age). Use a conservative 50 µg/dL
      // threshold to fire across all ages, but moderate confidence only.
      if (dheas.value >= 50) return null;
      return {
        name: 'Low DHEA-S — adrenal androgen workup',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `DHEA-S ${dheas.value} ${dheas.unit}. Drops naturally with age (~10% per decade after 30), but a truly low value in an adult under 50 raises concern: chronic illness / inflammation, adrenal insufficiency (always check cortisol too), pituitary dysfunction, exogenous glucocorticoid use, severe stress / HPA-axis exhaustion. Drives fatigue, low libido, low mood, low muscle mass.`,
        confirmatory_tests: ['AM Cortisol (8 AM, fasting) — pair with DHEA-S for adrenal axis snapshot', 'ACTH', 'Cosyntropin (ACTH) stimulation test if AM cortisol is borderline low', 'TSH + Free T4', 'Comprehensive medication review (chronic steroid use suppresses DHEA-S)', 'Pituitary MRI if low DHEA-S + low cortisol + other pituitary axis abnormalities'],
        icd10: 'E27.49',
        what_to_ask_doctor: "My DHEA-S is low. Can we check AM cortisol + ACTH together for the adrenal axis, and TSH for thyroid? If AM cortisol is also low, I want a cosyntropin stimulation test for adrenal insufficiency.",
        source: 'deterministic',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  EXTENDED COVERAGE — pass 2 (24 more universal detectors)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Troponin elevation — ACS / myocarditis workup ────────────────────
  {
    key: 'troponin_elevation',
    alreadyRaisedIf: [/troponin elev|acute coronary|myocard/i],
    skipIfDx: ['acute_mi'],
    detect: (ctx) => {
      const trop = mark(ctx.labValues, [/^troponin|^hs-?troponin/i]);
      if (!trop || trop.value < 0.04) return null;
      return {
        name: 'Troponin elevation — urgent cardiac workup',
        category: 'cardio',
        confidence: 'high',
        evidence: `Troponin ${trop.value} ${trop.unit}. Any elevation above the 99th percentile is myocardial injury — not necessarily infarction. Differential: acute coronary syndrome (most urgent), myocarditis, pulmonary embolism, sepsis, CKD (chronic baseline elevation), demand ischemia, takotsubo. Urgency depends on trajectory (rising/falling vs flat).`,
        confirmatory_tests: ['Repeat Troponin in 3 hours (rising = active injury)', '12-lead ECG immediately', 'BNP / NT-proBNP', 'CBC + BMP + Mg + Phosphorus', 'D-Dimer if PE suspected', 'Echocardiogram', 'Cardiology consult', 'Coronary angiogram if rising + ECG changes'],
        icd10: 'R79.89',
        what_to_ask_doctor: "My troponin is elevated. We need a 12-lead ECG, a 3-hour repeat troponin to check trajectory, BNP, and an echo. If trending up + any ECG change, I need cardiology now.",
        source: 'deterministic',
      };
    },
  },

  // ── BNP / NT-proBNP elevation — heart failure workup ─────────────────
  {
    key: 'natriuretic_peptide_elevation',
    alreadyRaisedIf: [/bnp elev|natriuretic|heart failure (workup|suspected)|chf/i],
    skipIfDx: ['heart_failure', 'chf'],
    detect: (ctx) => {
      const bnp = mark(ctx.labValues, [/^bnp\b/i]);
      const ntp = mark(ctx.labValues, [/nt-?probnp|n-?terminal/i]);
      const bnpHigh = bnp && bnp.value >= 100;
      const ntpHigh = ntp && ntp.value >= 300;
      if (!bnpHigh && !ntpHigh) return null;
      const which = bnpHigh ? `BNP ${bnp.value} ${bnp.unit}` : `NT-proBNP ${ntp.value} ${ntp.unit}`;
      return {
        name: 'Natriuretic peptide elevation — heart failure workup',
        category: 'cardio',
        confidence: ((bnp && bnp.value >= 400) || (ntp && ntp.value >= 900)) ? 'high' : 'moderate',
        evidence: `${which}. Elevation reflects ventricular wall stretch. Differential: HFrEF / HFpEF (most common driver), atrial fibrillation, PE, pulmonary HTN, CKD (chronic baseline elevation), sepsis, anemia. Age-adjusted cutoffs matter for NT-proBNP (higher in elderly).`,
        confirmatory_tests: ['Transthoracic Echocardiogram (LVEF, diastolic function, valves)', '12-lead ECG (afib? LVH? prior MI?)', 'Repeat BNP / NT-proBNP after diuresis (responds to treatment)', 'CBC + BMP + Mg + TSH', 'Troponin (rule out ischemic driver)', 'Chest X-ray (pulmonary edema)', 'Lipid Panel + Hemoglobin A1c (risk factor optimization)'],
        icd10: 'I50.9',
        what_to_ask_doctor: "My BNP is elevated. I need an echo for ejection fraction, an ECG, TSH, and a chest X-ray. If LVEF is reduced, I want to start guideline-directed medical therapy (ACEi/ARNi, beta-blocker, SGLT2i, MRA).",
        source: 'deterministic',
      };
    },
  },

  // ── D-Dimer elevation — VTE workup ────────────────────────────────────
  {
    key: 'd_dimer_elevation',
    alreadyRaisedIf: [/d.?dimer elev|vte|dvt|pulmonary embolism/i],
    skipIfDx: [],
    detect: (ctx) => {
      const dd = mark(ctx.labValues, [/^d.?dimer/i]);
      if (!dd) return null;
      // Age-adjusted threshold: age × 10 µg/L (≈ 0.5 if <50, higher otherwise)
      const ageAdjusted = ctx.age && ctx.age > 50 ? (ctx.age / 100) : 0.5;
      if (dd.value < ageAdjusted) return null;
      return {
        name: 'D-Dimer elevation — VTE rule-out',
        category: 'hematology',
        confidence: dd.value > 1.0 ? 'high' : 'moderate',
        evidence: `D-Dimer ${dd.value} ${dd.unit}. D-dimer is sensitive but not specific — false positives from recent surgery, trauma, infection, malignancy, pregnancy, age, DIC, liver disease. Only useful for ruling OUT VTE when pretest probability is low. If pretest probability is high, go straight to imaging.`,
        confirmatory_tests: ['Wells score (calculator) for DVT/PE pretest probability', 'Compression Ultrasound (DVT — bilateral leg if symptoms)', 'CT Pulmonary Angiogram (PE — gold standard)', 'V/Q Scan if CT contraindicated', 'CBC + BMP + INR/PT/PTT', 'Echocardiogram if PE confirmed (RV strain)'],
        icd10: 'R79.89',
        what_to_ask_doctor: "My D-dimer is elevated. We need to calculate Wells score for clot probability. If symptoms or high probability, compression ultrasound for DVT or CT-PA for PE — D-dimer alone isn't enough.",
        source: 'deterministic',
      };
    },
  },

  // ── Creatine Kinase elevation — myopathy / rhabdo workup ─────────────
  {
    key: 'ck_elevation_workup',
    alreadyRaisedIf: [/elevated ck|rhabdomyolysis|myopath/i],
    skipIfDx: ['rhabdomyolysis'],
    detect: (ctx) => {
      const ck = mark(ctx.labValues, [/^creatine.?kinase|^ck\b/i]);
      if (!ck || ck.value < 250) return null;
      const isRhabdo = ck.value >= 5000;
      return {
        name: isRhabdo ? 'Severe CK elevation — rhabdomyolysis' : 'CK elevation — myopathy workup',
        category: 'hematology',
        confidence: isRhabdo ? 'high' : 'moderate',
        evidence: `CK ${ck.value} ${ck.unit}. ${isRhabdo ? 'CK ≥ 5000 = rhabdomyolysis range — acute kidney injury risk from myoglobinuria. ' : ''}Differential: heavy exercise (drops in 7 days), statin myopathy, hypothyroidism (often subtle CK elevation), trauma / crush, viral myositis, polymyositis / dermatomyositis (proximal weakness pattern), inherited myopathies, alcohol / drugs (cocaine, energy drinks). Macro-CK is a benign false-positive — check CK-MB / electrophoresis if persistent.`,
        confirmatory_tests: ['Repeat CK in 5-7 days (exercise-driven drops fast)', 'TSH', 'Creatinine + eGFR + Urinalysis (myoglobinuria)', 'Aldolase + LDH (myositis pattern)', 'ANA + RF + Anti-Jo-1 if myositis suspected', 'CK isoenzymes (CK-MM vs CK-MB) — rule out macro-CK', 'Comprehensive medication review (statins, fibrates, colchicine)'],
        icd10: 'R74.8',
        what_to_ask_doctor: "My CK is elevated. Can we rest from exercise for 5-7 days, recheck, plus check TSH and a urinalysis for myoglobin? If still high and I'm on a statin, that's the likely cause.",
        source: 'deterministic',
      };
    },
  },

  // ── Low AM cortisol — adrenal insufficiency rule-out ─────────────────
  {
    key: 'low_am_cortisol',
    alreadyRaisedIf: [/adrenal insuffic|addison|low cortisol/i],
    skipIfDx: ['adrenal_insufficiency', 'addison'],
    detect: (ctx) => {
      const cort = mark(ctx.labValues, [/^cortisol(?!.*pm|.*evening|.*night)/i, /am cortisol|morning cortisol/i]);
      if (!cort || cort.value >= 5) return null;
      return {
        name: 'Low AM cortisol — adrenal insufficiency rule-out',
        category: 'endocrine',
        confidence: cort.value < 3 ? 'high' : 'moderate',
        evidence: `AM cortisol ${cort.value} ${cort.unit}. Cortisol < 3 µg/dL essentially confirms adrenal insufficiency; 3-10 is the gray zone needing stimulation testing. Primary (Addison — autoimmune adrenalitis most common, also TB, hemorrhage, infiltration) shows high ACTH; secondary (pituitary failure) shows normal/low ACTH. Critical — untreated adrenal crisis is fatal.`,
        confirmatory_tests: ['Cosyntropin (ACTH) stimulation test — gold standard (cortisol < 18 at 60min = positive)', 'ACTH level (primary vs secondary split)', 'Aldosterone + Renin (primary affects both axes)', 'Adrenal autoantibodies (21-hydroxylase Ab) if primary', '17-OH-Progesterone (rule out CAH)', 'Electrolytes (hyponatremia + hyperkalemia in primary)', 'Pituitary MRI if secondary', 'TSH + Free T4 (often co-deficient)'],
        icd10: 'E27.40',
        what_to_ask_doctor: "My morning cortisol is low. I need a cosyntropin stimulation test to confirm adrenal insufficiency, plus ACTH to figure out primary vs secondary. While we work this up, I need a stress-dose plan in case of illness or surgery.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated ACTH — adrenal axis workup ───────────────────────────────
  {
    key: 'elevated_acth',
    alreadyRaisedIf: [/elevated acth|cushing|addison|primary adrenal/i],
    skipIfDx: [],
    detect: (ctx) => {
      const acth = mark(ctx.labValues, [/^acth\b|adrenocorticotrop/i]);
      if (!acth || acth.value < 80) return null;
      return {
        name: 'Elevated ACTH — adrenal axis workup',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `ACTH ${acth.value} ${acth.unit}. With concurrent low cortisol = primary adrenal insufficiency (Addison). With high cortisol = ACTH-dependent Cushing (pituitary adenoma > ectopic). With normal cortisol = consider congenital adrenal hyperplasia, exogenous steroid withdrawal, or assay artifact. Pair with cortisol to interpret.`,
        confirmatory_tests: ['AM Cortisol (paired with ACTH — interpretation depends on both)', '24-hour Urine Free Cortisol', 'Late-night Salivary Cortisol (Cushing screen)', '1-mg Overnight Dexamethasone Suppression Test', 'High-Dose Dexamethasone Suppression (pituitary vs ectopic)', 'Pituitary MRI (Cushing disease)', 'Chest + Abdomen CT (ectopic ACTH)', '21-Hydroxylase + 17-OH Progesterone (CAH workup if young)'],
        icd10: 'E27.49',
        what_to_ask_doctor: "My ACTH is elevated. The interpretation depends on cortisol — can we get a paired AM cortisol + 24-hour urine free cortisol + a 1-mg overnight dex suppression test? If Cushing's, then pituitary MRI; if Addison's, antibody panel.",
        source: 'deterministic',
      };
    },
  },

  // ── IGF-1 elevation — acromegaly rule-out ─────────────────────────────
  {
    key: 'elevated_igf1',
    alreadyRaisedIf: [/elevated igf|acromegal|growth hormone excess/i],
    skipIfDx: ['acromegaly'],
    detect: (ctx) => {
      const igf = mark(ctx.labValues, [/^igf-?1\b|insulin.?like growth/i]);
      if (!igf || igf.value < 350) return null;
      return {
        name: 'Elevated IGF-1 — acromegaly rule-out',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `IGF-1 ${igf.value} ${igf.unit}. Age-adjusted ULN matters (younger = higher normal). True elevation outside age range raises concern for growth hormone excess (acromegaly in adults, gigantism if pre-fusion). Signs: enlarging hands/feet/jaw, prognathism, deepening voice, sweating, headache, joint pain. Also: exogenous GH use (athletes, anti-aging clinics).`,
        confirmatory_tests: ['Oral Glucose Tolerance Test with GH levels (failure to suppress GH < 1 ng/mL = acromegaly)', 'Pituitary MRI (adenoma detection)', 'Prolactin (frequently co-elevated)', 'Visual field testing (chiasmal compression)', 'TSH + Free T4 + Cortisol + ACTH + LH + FSH (full pituitary axis)', 'Comprehensive medication / supplement review (rule out GH use)'],
        icd10: 'E22.0',
        what_to_ask_doctor: "My IGF-1 is elevated. Can we do an OGTT with GH measurements and a pituitary MRI? Also check prolactin and the full pituitary axis. If I've used GH or peptide GH-secretagogues, that explains it.",
        source: 'deterministic',
      };
    },
  },

  // ── Low IGF-1 — adult GH deficiency / chronic illness ─────────────────
  {
    key: 'low_igf1',
    alreadyRaisedIf: [/low igf|gh deficien|hypopituitar/i],
    skipIfDx: [],
    detect: (ctx) => {
      const igf = mark(ctx.labValues, [/^igf-?1\b|insulin.?like growth/i]);
      if (!igf || igf.value > 90) return null;
      return {
        name: 'Low IGF-1 — adult GH deficiency / chronic illness',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `IGF-1 ${igf.value} ${igf.unit}. Differential: chronic illness / undernutrition (most common — IGF-1 is sensitive to caloric status), hepatic dysfunction (liver produces IGF-1 in response to GH), adult GH deficiency (pituitary), severe insulin deficiency, hypothyroidism, prolonged glucocorticoid use. Not diagnostic of GH deficiency alone — needs stimulation testing.`,
        confirmatory_tests: ['Repeat IGF-1 after addressing any nutritional / illness driver', 'Liver Panel (hepatic source of IGF-1)', 'TSH + Free T4', 'AM Cortisol + ACTH', 'Glucagon stimulation test or insulin tolerance test (definitive GH stim)', 'Pituitary MRI if other pituitary axes also abnormal'],
        icd10: 'E23.0',
        what_to_ask_doctor: "My IGF-1 is low. Can we rule out chronic illness, liver issues, and thyroid first? If we suspect actual GH deficiency, I want a proper stim test plus a pituitary MRI rather than empiric GH.",
        source: 'deterministic',
      };
    },
  },

  // ── Low Free T3 — conversion / non-thyroidal illness ─────────────────
  {
    key: 'low_free_t3',
    alreadyRaisedIf: [/low free t3|sick euthyroid|non-?thyroidal illness|conversion issue/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ft3 = mark(ctx.labValues, [/free t3|^t3,?\s*free|triyodotironina libre/i]);
      if (!ft3 || ft3.value >= 2.3) return null;
      return {
        name: 'Low Free T3 — conversion / non-thyroidal illness',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `Free T3 ${ft3.value} ${ft3.unit}. Low Free T3 with normal TSH and normal Free T4 = "low T3 syndrome" — typically reflects poor T4→T3 conversion or peripheral down-regulation. Drivers: acute illness, chronic illness, caloric restriction (esp. low-carb / extended fasting), high stress / high reverse T3, selenium / zinc / iron deficiency, certain meds (amiodarone, beta-blockers, glucocorticoids).`,
        confirmatory_tests: ['Reverse T3 (sick euthyroid pattern = high rT3)', 'Free T3/Reverse T3 Ratio', 'Selenium + Zinc + Ferritin (conversion cofactors)', 'TSH + Free T4 (confirm pattern)', 'Comprehensive medication review', 'Nutritional history (caloric intake, carb restriction, intermittent fasting)'],
        icd10: 'E03.9',
        what_to_ask_doctor: "My Free T3 is low. Most likely this is conversion or sick-euthyroid pattern. Can we get reverse T3, check selenium/zinc/ferritin which are conversion cofactors, and review meds + nutrition before deciding on T3 supplementation?",
        source: 'deterministic',
      };
    },
  },

  // ── High Reverse T3 — sick euthyroid / stress ────────────────────────
  {
    key: 'high_reverse_t3',
    alreadyRaisedIf: [/elevated reverse t3|sick euthyroid|stress/i],
    skipIfDx: [],
    detect: (ctx) => {
      const rt3 = mark(ctx.labValues, [/reverse t3|^rt3\b/i]);
      if (!rt3 || rt3.value <= 24) return null;
      return {
        name: 'Elevated Reverse T3 — sick euthyroid / stress pattern',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: `Reverse T3 ${rt3.value} ${rt3.unit}. Elevated rT3 shunts T4 away from active T3 conversion. Drivers: acute or chronic illness, caloric restriction, high stress / elevated cortisol, certain meds (amiodarone, beta-blockers, glucocorticoids), heavy metals, selenium deficiency. Often coexists with low Free T3. Address the underlying driver before T3 supplementation.`,
        confirmatory_tests: ['Free T3 + Free T4 + TSH (full thyroid panel)', 'Free T3 / Reverse T3 Ratio (functional thyroid status)', 'AM Cortisol + DHEA-S (stress axis)', 'Selenium + Zinc + Iron Studies (conversion cofactors)', 'Comprehensive medication review'],
        icd10: 'E03.9',
        what_to_ask_doctor: "My Reverse T3 is elevated. Most often this is stress / illness / undernutrition driving T4 away from T3. Can we check AM cortisol, selenium/zinc/iron as conversion cofactors, and address the upstream driver?",
        source: 'deterministic',
      };
    },
  },

  // ── ANA positive — autoimmune workup ──────────────────────────────────
  {
    key: 'ana_positive',
    alreadyRaisedIf: [/positive ana|autoimmune workup|lupus|sjogren|sclerosis/i],
    skipIfDx: ['lupus', 'sle', 'rheumatoid_arthritis'],
    detect: (ctx) => {
      const ana = mark(ctx.labValues, [/^ana\b|antinuclear/i]);
      if (!ana) return null;
      // Titer ≥ 160 (1:160) is the standard positive threshold
      if (ana.value < 160) return null;
      return {
        name: 'Positive ANA — autoimmune workup',
        category: 'autoimmune',
        confidence: ana.value >= 640 ? 'high' : 'moderate',
        evidence: `ANA ${ana.value} ${ana.unit}. Positive ANA alone is non-specific (~5% of healthy adults have low-titer positives). Significance depends on titer (≥1:160 more meaningful, ≥1:1280 highly suggestive), pattern (homogeneous, speckled, nucleolar, centromere — each maps to different conditions), and symptoms. Differential: SLE, Sjögren, scleroderma, polymyositis, mixed connective tissue disease, drug-induced (procainamide, hydralazine, TNF inhibitors), chronic infection, normal variant.`,
        confirmatory_tests: ['ANA Reflex Panel (dsDNA, Smith, RNP, SSA/SSB, Scl-70, Jo-1, Centromere)', 'Complement C3 + C4 (low in active SLE)', 'CBC + BMP + Urinalysis (organ involvement)', 'CRP + ESR', 'Anti-CCP + RF (rule out RA overlap)', 'Comprehensive medication review (drug-induced lupus)', 'Rheumatology referral if symptomatic or high-titer'],
        icd10: 'R76.0',
        what_to_ask_doctor: "My ANA is positive. Alone this doesn't mean much — can we get the reflex panel (dsDNA, Smith, RNP, SSA/SSB, Scl-70, anti-CCP) plus complement C3/C4 and urinalysis? If I have any joint, skin, or organ symptoms, I want a rheumatology referral.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated Rheumatoid Factor — inflammatory arthritis workup ───────
  {
    key: 'elevated_rheumatoid_factor',
    alreadyRaisedIf: [/elevated rf|rheumatoid arthritis|inflammatory arthritis/i],
    skipIfDx: ['rheumatoid_arthritis', 'ra'],
    detect: (ctx) => {
      const rf = mark(ctx.labValues, [/^rheumatoid factor|^rf\b/i]);
      if (!rf || rf.value < 20) return null;
      return {
        name: 'Elevated Rheumatoid Factor — inflammatory arthritis workup',
        category: 'autoimmune',
        confidence: 'moderate',
        evidence: `RF ${rf.value} ${rf.unit}. RF alone is non-specific. Differential: rheumatoid arthritis (most common pathologic association — confirm with anti-CCP for specificity), Sjögren, mixed connective tissue, viral infection (hepatitis C — common false-positive), chronic infection, age (~10% of elderly have positive RF without disease), normal variant.`,
        confirmatory_tests: ['Anti-CCP Antibodies (specific for RA, >95%)', 'CRP + ESR', 'ANA + Reflex Panel', 'Hepatitis C Antibody (common false-positive driver)', 'Joint Imaging (X-ray of symptomatic joints — erosions confirm RA)', 'CBC + Comprehensive Metabolic Panel', 'Rheumatology referral if anti-CCP positive or persistent joint symptoms'],
        icd10: 'M05.9',
        what_to_ask_doctor: "My RF is elevated. RF alone isn't specific — can we get anti-CCP (which is specific for RA), CRP/ESR, and Hep C antibody (common false-positive)? If symptoms or anti-CCP positive, rheumatology referral.",
        source: 'deterministic',
      };
    },
  },

  // ── Low C-peptide — T1DM / pancreatic beta-cell failure ──────────────
  {
    key: 'low_c_peptide',
    alreadyRaisedIf: [/low c-?peptide|type 1 diabetes|t1dm|beta-?cell failure|lada/i],
    skipIfDx: ['type_1_diabetes', 't1dm'],
    detect: (ctx) => {
      const cp = mark(ctx.labValues, [/^c.?peptide/i]);
      if (!cp || cp.value >= 0.5) return null;
      return {
        name: 'Low C-peptide — T1DM / LADA workup',
        category: 'endocrine',
        confidence: 'high',
        evidence: `C-Peptide ${cp.value} ${cp.unit}. Low C-peptide with elevated glucose = type 1 diabetes (or LADA — latent autoimmune diabetes in adults, increasingly recognized). With normal glucose: could be inappropriate sample (non-fasting non-stimulated) or post-prandial timing issue. Critical to identify before insulin dependence; misdiagnosis as T2DM and inappropriate sulfonylurea / metformin therapy delays definitive insulin.`,
        confirmatory_tests: ['GAD-65 Antibodies (T1DM / LADA marker)', 'Islet Cell Antibodies (ICA)', 'Insulin Autoantibodies (IAA)', 'Zinc Transporter 8 (ZnT8) Antibodies', 'Tyrosine Phosphatase IA-2 Antibodies', 'Random Glucose + Hemoglobin A1c', 'Endocrinology referral if confirmed'],
        icd10: 'E10.9',
        what_to_ask_doctor: "My C-peptide is low. That suggests type 1 diabetes or LADA — adult-onset autoimmune diabetes that's commonly misdiagnosed as type 2. Can we run the autoantibody panel (GAD-65, IA-2, ZnT8, IAA, ICA) and refer to endocrine?",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated reticulocytes — hemolysis or blood loss response ────────
  {
    key: 'reticulocytosis',
    alreadyRaisedIf: [/reticulocytos|hemoly|blood loss/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ret = mark(ctx.labValues, [/^reticulocyte\b|^reticulocyte\s*%/i]);
      if (!ret || ret.value < 2.5) return null;
      return {
        name: 'Elevated reticulocytes — hemolysis vs blood loss',
        category: 'hematology',
        confidence: ret.value > 5 ? 'high' : 'moderate',
        evidence: `Reticulocytes ${ret.value} ${ret.unit}. Marrow is responding to red cell loss — either bleeding (most common) or hemolysis. Always pair with Hgb (elevated retics + low Hgb = active loss; elevated retics + normal Hgb = recovering from prior insult).`,
        confirmatory_tests: ['LDH + Haptoglobin + Indirect Bilirubin (hemolysis pattern: high LDH, low haptoglobin, elevated indirect bili)', 'Peripheral Blood Smear (schistocytes = MAHA emergency; spherocytes = AIHA / HS)', 'Direct Antiglobulin Test (DAT / Coombs) — autoimmune hemolysis', 'Stool occult blood / FIT (GI bleed)', 'Urinalysis (hemoglobinuria)', 'CBC trend over time'],
        icd10: 'R71.0',
        what_to_ask_doctor: "My reticulocytes are high. My marrow is responding to blood loss or hemolysis. Can we run LDH, haptoglobin, indirect bilirubin to check for hemolysis, and a FIT or stool occult blood for GI bleed? And a peripheral smear.",
        source: 'deterministic',
      };
    },
  },

  // ── Low haptoglobin — intravascular hemolysis ─────────────────────────
  {
    key: 'low_haptoglobin',
    alreadyRaisedIf: [/low haptoglobin|hemoly|intravascular/i],
    skipIfDx: [],
    detect: (ctx) => {
      const hp = mark(ctx.labValues, [/^haptoglobin/i]);
      if (!hp || hp.value >= 30) return null;
      return {
        name: 'Low haptoglobin — intravascular hemolysis workup',
        category: 'hematology',
        confidence: 'high',
        evidence: `Haptoglobin ${hp.value} ${hp.unit}. Haptoglobin binds free hemoglobin from intravascular red cell lysis — when consumed, levels drop. Causes: autoimmune hemolytic anemia (AIHA), microangiopathic hemolytic anemia (TTP/HUS/DIC/HELLP — emergency), G6PD crisis, mechanical hemolysis (prosthetic valve), paroxysmal nocturnal hemoglobinuria (PNH). False-low: congenital ahaptoglobinemia (rare).`,
        confirmatory_tests: ['LDH + Indirect Bilirubin + Reticulocyte Count (hemolysis pattern)', 'Direct Antiglobulin Test (DAT / Coombs) — distinguishes AIHA', 'Peripheral Blood Smear (schistocytes = MAHA — EMERGENCY)', 'G6PD level (after acute episode resolves — false-normal during crisis)', 'PNH Flow Cytometry if recurrent / unexplained', 'Hemoglobin A1c if recurrent hemolysis suspected hemoglobinopathy', 'Urinalysis (hemoglobinuria)'],
        icd10: 'D59.9',
        what_to_ask_doctor: "My haptoglobin is low — that's intravascular hemolysis until proven otherwise. We need a peripheral smear immediately to rule out TTP/HUS, plus a Coombs test, LDH, indirect bilirubin, reticulocyte count, and urinalysis.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated LDH — hemolysis / MPN / lymphoma differential ───────────
  {
    key: 'elevated_ldh',
    alreadyRaisedIf: [/elevated ldh|hemoly|lymphoma|mpn/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ldh = mark(ctx.labValues, [/^ldh\b|lactate dehydrogen/i]);
      if (!ldh || ldh.value < 280) return null;
      return {
        name: 'Elevated LDH — broad differential',
        category: 'hematology',
        confidence: ldh.value > 500 ? 'high' : 'moderate',
        evidence: `LDH ${ldh.value} ${ldh.unit}. LDH is in every cell — elevation is sensitive but very non-specific. Differential: hemolysis (intravascular or extravascular), muscle injury, hepatic disease, lymphoma / leukemia (often markedly elevated), myeloproliferative disorders, tumor lysis, PE, sepsis. LDH isoenzymes can localize the source.`,
        confirmatory_tests: ['LDH Isoenzymes (LDH1/2 cardiac/RBC, LDH3 lung/pancreas, LDH4/5 liver/skeletal muscle)', 'Haptoglobin + Reticulocyte Count + Indirect Bilirubin (hemolysis workup)', 'Peripheral Blood Smear', 'CBC with Manual Differential', 'Comprehensive Metabolic Panel + Liver Panel', 'Creatine Kinase (muscle source)', 'Lymph node exam / imaging if lymphadenopathy or B-symptoms'],
        icd10: 'R74.02',
        what_to_ask_doctor: "My LDH is elevated. LDH is non-specific — can we get isoenzymes to localize the source, plus haptoglobin/retics/indirect bili for hemolysis, CK for muscle, and a smear? If I have any B-symptoms (fever, night sweats, weight loss, lymph nodes), I want imaging too.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated procalcitonin — bacterial infection ─────────────────────
  {
    key: 'elevated_procalcitonin',
    alreadyRaisedIf: [/elevated procalcit|bacterial infection|sepsis/i],
    skipIfDx: [],
    detect: (ctx) => {
      const pct = mark(ctx.labValues, [/^procalciton/i]);
      if (!pct || pct.value < 0.5) return null;
      return {
        name: 'Elevated procalcitonin — bacterial infection / sepsis workup',
        category: 'infectious',
        confidence: pct.value >= 2 ? 'high' : 'moderate',
        evidence: `Procalcitonin ${pct.value} ${pct.unit}. PCT rises specifically with bacterial infections (more specific than CRP for bacterial vs viral). ≥0.5 suggests bacterial; ≥2.0 highly suggestive; ≥10 strongly suggestive of severe sepsis / septic shock. Other drivers: trauma, major surgery, burns, MAS, certain malignancies.`,
        confirmatory_tests: ['Blood Cultures × 2 (before antibiotics if possible)', 'CBC with Differential', 'Comprehensive Metabolic Panel + Lactate', 'CRP + ESR for comparison', 'Urinalysis + Urine Culture', 'Chest X-ray', 'Source-specific cultures (sputum, wound, CSF, etc.)', 'Empiric antibiotics if clinical sepsis suspected'],
        icd10: 'A41.9',
        what_to_ask_doctor: "My procalcitonin is elevated — that's specific for bacterial infection. We need blood cultures, urinalysis with culture, chest X-ray, and a lactate. If I have any sepsis criteria, empiric antibiotics don't wait for cultures.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated CEA — GI / colorectal workup ─────────────────────────────
  {
    key: 'elevated_cea',
    alreadyRaisedIf: [/elevated cea|colorectal|gi cancer/i],
    skipIfDx: [],
    detect: (ctx) => {
      const cea = mark(ctx.labValues, [/^cea\b|carcinoembryonic/i]);
      if (!cea || cea.value < 5) return null;
      return {
        name: 'Elevated CEA — GI / colorectal workup',
        category: 'oncology',
        confidence: cea.value >= 10 ? 'high' : 'moderate',
        evidence: `CEA ${cea.value} ${cea.unit}. CEA is not a screening test (low sensitivity) but elevation in a symptomatic or high-risk patient warrants workup. Differential: colorectal cancer (most common pathologic association), other GI cancers (pancreatic, gastric, esophageal), lung cancer, breast, smoking (mild elevation), liver disease, IBD, COPD, smoker baseline. Trend matters more than single value.`,
        confirmatory_tests: ['Colonoscopy (especially if age ≥45 or symptomatic — overdue screening)', 'Smoking history (smokers have higher baseline)', 'Liver Panel + Right Upper Quadrant Ultrasound', 'CT Chest / Abdomen / Pelvis if persistently elevated', 'CA 19-9 (pancreatic / hepatobiliary co-marker)', 'Repeat CEA in 4-6 weeks to establish trend'],
        icd10: 'R97.8',
        what_to_ask_doctor: "My CEA is elevated. It's not specific but worth investigating. Colonoscopy if I'm due or symptomatic, plus liver imaging and CT chest/abdomen/pelvis if persistently elevated. I'd also like to recheck in 4-6 weeks to see the trend.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated AFP — hepatocellular / germ cell workup ─────────────────
  {
    key: 'elevated_afp',
    alreadyRaisedIf: [/elevated afp|hepatocellular|hcc|germ cell/i],
    skipIfDx: [],
    detect: (ctx) => {
      const afp = mark(ctx.labValues, [/^afp\b|alpha.?fetoprot/i]);
      if (!afp || afp.value < 10) return null;
      const isVeryHigh = afp.value > 400;
      return {
        name: isVeryHigh ? 'Markedly elevated AFP — HCC strongly suggested' : 'Elevated AFP — workup',
        category: 'oncology',
        confidence: isVeryHigh ? 'high' : 'moderate',
        evidence: `AFP ${afp.value} ${afp.unit}. ${isVeryHigh ? 'AFP > 400 in adult is highly suggestive of hepatocellular carcinoma. ' : ''}Differential: HCC (most common pathologic), germ cell tumor (testicular / ovarian — esp. in younger patients), chronic hepatitis with cirrhosis (modest elevation), pregnancy (false-positive — always check first in reproductive-age females), rare congenital hereditary persistence.`,
        confirmatory_tests: ['β-hCG (pregnancy + germ cell workup)', 'Liver Panel + Liver Ultrasound + Triple-Phase CT', 'AFP-L3 fraction (HCC specificity)', 'PIVKA-II / DCP (HCC marker)', 'Hepatitis B + C serology', 'Testicular / pelvic ultrasound if young + suspected germ cell', 'GI / Oncology referral'],
        icd10: 'R97.8',
        what_to_ask_doctor: "My AFP is elevated. First — pregnancy test if I'm reproductive-age female (it can be a false-positive). Then liver ultrasound + triple-phase CT for HCC, hepatitis B/C serology, and if I'm young, testicular or pelvic imaging for germ cell tumor.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated Lipase — pancreatitis ─────────────────────────────────────
  {
    key: 'elevated_lipase',
    alreadyRaisedIf: [/elevated lipase|pancreatitis/i],
    skipIfDx: [],
    detect: (ctx) => {
      const lip = mark(ctx.labValues, [/^lipase/i]);
      if (!lip || lip.value < 200) return null;
      const isPancreatitis = lip.value >= 600;
      return {
        name: isPancreatitis ? 'Severe lipase elevation — acute pancreatitis' : 'Elevated lipase — pancreatitis workup',
        category: 'gi',
        confidence: isPancreatitis ? 'high' : 'moderate',
        evidence: `Lipase ${lip.value} ${lip.unit}. ${isPancreatitis ? 'Lipase ≥ 3× ULN with epigastric pain meets diagnostic criteria for acute pancreatitis. ' : ''}Differential: acute pancreatitis (most common — gallstones, alcohol, hypertriglyceridemia, drugs, ERCP), chronic pancreatitis flare, pancreatic cancer, intestinal ischemia, perforation, severe DKA, CKD (chronic mild elevation). Always pair with epigastric pain workup.`,
        confirmatory_tests: ['CT Abdomen with Contrast (severity grading — Balthazar / CTSI score)', 'Right Upper Quadrant Ultrasound (gallstones)', 'Liver Panel + Bilirubin (biliary obstruction)', 'Triglycerides (hypertriglyceridemic pancreatitis if > 1000)', 'Calcium', 'Lactate + ABG (severity)', 'BUN + Creatinine (volume status)', 'Comprehensive medication review (drug-induced)'],
        icd10: 'K85.9',
        what_to_ask_doctor: "My lipase is elevated. If I have epigastric pain, we need a CT abdomen, right upper quadrant ultrasound for gallstones, triglycerides for hyperTG pancreatitis, calcium, and a comprehensive med review.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated amylase — pancreatic / parotid workup ───────────────────
  {
    key: 'elevated_amylase',
    alreadyRaisedIf: [/elevated amylase|pancreatitis|parotitis/i],
    skipIfDx: [],
    detect: (ctx) => {
      const amy = mark(ctx.labValues, [/^amylase/i]);
      if (!amy || amy.value < 150) return null;
      return {
        name: 'Elevated amylase — pancreatic vs parotid workup',
        category: 'gi',
        confidence: amy.value >= 300 ? 'high' : 'moderate',
        evidence: `Amylase ${amy.value} ${amy.unit}. Less specific than lipase — also rises with parotid (mumps, sialadenitis), bowel obstruction, ectopic pregnancy / fallopian tube pathology, DKA, CKD, macroamylasemia (benign — IgA-bound amylase doesn't clear renally). Use lipase to confirm pancreatic source.`,
        confirmatory_tests: ['Lipase (pancreas-specific — definitive marker)', 'Right Upper Quadrant Ultrasound (gallstones)', 'CT Abdomen if pancreatitis suspected', 'β-hCG if reproductive-age female (ectopic)', 'Parotid exam (mumps / sialadenitis)', 'Macroamylase fractionation if isolated, persistent, and lipase normal'],
        icd10: 'R74.8',
        what_to_ask_doctor: "My amylase is elevated. Lipase would tell us if this is actually pancreatic. If lipase is normal, we need to think about parotid, bowel, ectopic pregnancy, or macroamylasemia.",
        source: 'deterministic',
      };
    },
  },

  // ── Low AMH — diminished ovarian reserve ──────────────────────────────
  {
    key: 'low_amh',
    alreadyRaisedIf: [/low amh|diminished ovarian reserve|premature ovarian/i],
    skipIfDx: ['poi', 'premature_ovarian_insufficiency'],
    detect: (ctx) => {
      const isFemale = (ctx.sex ?? '').toLowerCase() === 'female';
      if (!isFemale) return null;
      const amh = mark(ctx.labValues, [/^amh\b|anti.?mullerian/i]);
      if (!amh || amh.value >= 1) return null;
      return {
        name: 'Low AMH — diminished ovarian reserve',
        category: 'reproductive',
        confidence: amh.value < 0.5 ? 'high' : 'moderate',
        evidence: `AMH ${amh.value} ${amh.unit}. AMH reflects ovarian follicle pool — drops naturally with age and predicts response to fertility treatment. Low AMH (< 1 ng/mL) in a reproductive-age woman raises concern for diminished ovarian reserve or early POI. Doesn't predict natural fertility well, but predicts IVF response strongly. Age-stratified normals matter (45yo with AMH 0.8 may still be normal-for-age).`,
        confirmatory_tests: ['FSH + Estradiol on cycle day 2-4 (elevated FSH = ovarian reserve declining)', 'Antral Follicle Count (transvaginal ultrasound)', 'TSH + Prolactin', 'Karyotype + Fragile X premutation if POI suspected (< 40yo)', 'Adrenal antibodies (autoimmune POI association)', 'Reproductive endocrinology referral if fertility planning matters'],
        icd10: 'E28.39',
        what_to_ask_doctor: "My AMH is low. If I'm planning fertility, I want a reproductive endocrinology referral — they'll do FSH/E2 on cycle day 2-4, antral follicle count, and check for autoimmune POI if I'm under 40.",
        source: 'deterministic',
      };
    },
  },

  // ── Elevated FSH — menopause / POI / primary testicular failure ──────
  {
    key: 'elevated_fsh',
    alreadyRaisedIf: [/elevated fsh|menopause|premature ovarian|primary testicular|hypogonad/i],
    skipIfDx: ['menopause'],
    detect: (ctx) => {
      const fsh = mark(ctx.labValues, [/^fsh\b|follicle.?stimulating/i]);
      if (!fsh || fsh.value < 25) return null;
      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      return {
        name: isMale
          ? 'Elevated FSH (male) — primary testicular failure workup'
          : 'Elevated FSH (female) — menopause / POI workup',
        category: 'endocrine',
        confidence: 'high',
        evidence: `FSH ${fsh.value} ${fsh.unit}. ${isMale ? 'In males: elevated FSH = primary testicular failure (Sertoli cell dysfunction / spermatogenesis impairment). Differential: Klinefelter syndrome, varicocele, prior chemo/radiation, mumps orchitis, idiopathic.' : 'In females: elevated FSH reflects ovarian failure to respond to pituitary drive. Differential by age: > 50 = menopause (normal); < 40 = POI (premature ovarian insufficiency — needs workup); 40-50 = perimenopause.'}`,
        confirmatory_tests: isMale ? ['Repeat FSH + LH', 'Total + Free Testosterone', 'Estradiol + Prolactin', 'Karyotype (Klinefelter — 47,XXY most common cause of primary)', 'Y-chromosome microdeletion testing', 'Scrotal ultrasound', 'Semen analysis', 'Endocrine + Urology referral'] : ['Repeat FSH + Estradiol (cycle day 2-4 if still menstruating)', 'AMH', 'LH', 'Prolactin + TSH', 'Karyotype + Fragile X premutation if < 40yo (POI workup)', 'Adrenal antibodies (autoimmune POI association)', 'DEXA (bone density — estrogen deficiency)', 'Reproductive endocrinology referral'],
        icd10: isMale ? 'E29.1' : 'E28.39',
        what_to_ask_doctor: isMale
          ? "My FSH is high — that's primary testicular failure. We need LH, testosterone (total + free), estradiol, prolactin, and a karyotype to rule out Klinefelter. Plus semen analysis if fertility matters."
          : "My FSH is high. If I'm under 40, this is POI and needs workup — karyotype, Fragile X premutation, adrenal antibodies, plus AMH and a DEXA scan. If I'm over 50, this is just menopause confirmation.",
        source: 'deterministic',
      };
    },
  },

  // ── Pheochromocytoma — paroxysmal HTN + adrenergic symptoms ──────────
  {
    key: 'pheochromocytoma_workup',
    alreadyRaisedIf: [/pheochromocyt|paraganglioma/i],
    skipIfDx: ['pheochromocytoma'],
    detect: (ctx) => {
      const sx = ctx.symptomsLower ?? '';
      const hasHtn = /hypertension|htn|high blood pressure/i.test(ctx.conditionsLower ?? '') ||
                    /high blood pressure/i.test(sx);
      // Classic triad: episodic palpitations + sweating + headache + HTN
      const hasPalpitations = /heart palpitation|palpitation/i.test(sx);
      const hasSweating = /sweat|diaphoresis/i.test(sx);
      const hasHeadaches = /headache|migraine/i.test(sx);
      const hasAnxiety = /anxiety/i.test(sx);
      const tetradCount = [hasPalpitations, hasSweating, hasHeadaches, hasAnxiety].filter(Boolean).length;
      if (!hasHtn || tetradCount < 2) return null;
      return {
        name: 'Adrenergic crisis pattern — rule out pheochromocytoma',
        category: 'endocrine',
        confidence: tetradCount >= 3 ? 'high' : 'moderate',
        evidence: `HTN with the classic adrenergic cluster (${[hasPalpitations && 'palpitations', hasSweating && 'sweating', hasHeadaches && 'headaches', hasAnxiety && 'anxiety'].filter(Boolean).join(', ')}). Pheochromocytoma is rare (0.1-0.6% of HTN) but catastrophic if missed — hypertensive crisis during anesthesia/surgery is the classic killer. Once-in-lifetime screen worth doing in any patient with this cluster.`,
        confirmatory_tests: ['24-hour Urinary Fractionated Metanephrines (×2)', 'Plasma Free Metanephrines (alternate)', 'Adrenal CT/MRI if biochemistry positive', 'MIBG scan if extra-adrenal suspected'],
        icd10: 'E27.5',
        what_to_ask_doctor: "I'm having episodic palpitations + sweating + headaches with my high blood pressure. Can we run 24-hour urinary fractionated metanephrines (or plasma free metanephrines) to rule out pheochromocytoma? It's rare but dangerous to miss if I ever need surgery.",
        source: 'deterministic',
      };
    },
  },

  // ── Primary hyperparathyroidism — Ca + PTH pattern ──────────────────
  {
    key: 'primary_hyperparathyroidism',
    alreadyRaisedIf: [/hyperparathyroid/i],
    skipIfDx: ['hyperparathyroidism'],
    detect: (ctx) => {
      const ca = mark(ctx.labValues, [/^calcium\b/i, /^total calcium/i]);
      const pth = mark(ctx.labValues, [/^pth\b/i, /parathyroid hormone/i]);
      const ionizedCa = mark(ctx.labValues, [/ionized calcium/i]);
      const phos = mark(ctx.labValues, [/phosphor/i]);
      const caHigh = (ca && ca.value > 10.5) || (ionizedCa && ionizedCa.value > 5.4);
      if (!caHigh) return null;
      // PTH inappropriately normal or elevated in the face of hypercalcemia
      const pthInappropriate = pth && pth.value > 30;       // any non-suppressed
      const phosLow = phos && phos.value < 2.5;
      return {
        name: 'Hypercalcemia + PTH pattern — rule out primary hyperparathyroidism',
        category: 'endocrine',
        confidence: (pthInappropriate || phosLow) ? 'high' : 'moderate',
        evidence: `Calcium ${ca ? ca.value : ionizedCa!.value} ${ca ? 'mg/dL' : 'mg/dL (ionized)'} elevated${pthInappropriate ? ` with PTH ${pth!.value} pg/mL (inappropriately not-suppressed)` : ''}${phosLow ? ` and phosphorus ${phos!.value} mg/dL (low — supports primary HPT)` : ''}. Primary hyperparathyroidism is the most common cause of asymptomatic hypercalcemia — adenoma in 85% of cases, often cured by parathyroidectomy. Untreated → osteoporosis, kidney stones, fatigue, depression.`,
        confirmatory_tests: ['Repeat Ca + Ionized Ca + Albumin (3 sets minimum)', 'PTH (Intact)', '24-hour Urine Calcium', 'Vitamin D 25-OH (rule out vit-D-deficiency-driven secondary HPT first)', 'DEXA Scan', 'Renal Ultrasound (rule out stones)'],
        icd10: 'E21.0',
        what_to_ask_doctor: "My calcium is elevated. Can we draw a PTH and 24-hour urine calcium to evaluate for primary hyperparathyroidism? If PTH is inappropriately non-suppressed, that's diagnostic and treatment is usually surgical and curative.",
        source: 'deterministic',
      };
    },
  },

  // ── Addison disease / primary adrenal insufficiency ───────────────────
  {
    key: 'adrenal_insufficiency',
    alreadyRaisedIf: [/addison|adrenal insufficien/i],
    skipIfDx: ['addisons_disease', 'adrenal_insufficiency'],
    detect: (ctx) => {
      const na = mark(ctx.labValues, [/^sodium/i, /\bna\b/i]);
      const k = mark(ctx.labValues, [/^potassium/i, /\bk\+?\b/i]);
      const cortisol = mark(ctx.labValues, [/cortisol/i]);
      const naLow = na && na.value < 135;
      const kHigh = k && k.value > 5.1;
      const cortisolLow = cortisol && cortisol.value < 5;
      // Need at least 2 of (low Na, high K, low cortisol) OR cortisol < 3
      const flagCount = [naLow, kHigh, cortisolLow].filter(Boolean).length;
      if (flagCount < 2 && !(cortisol && cortisol.value < 3)) return null;
      const sx = ctx.symptomsLower ?? '';
      const sxMatch: string[] = [];
      if (/fatigue|tired|exhaust|weak/i.test(sx)) sxMatch.push('fatigue/weakness');
      if (/weight loss/i.test(sx)) sxMatch.push('weight loss');
      if (/nausea|abdominal pain/i.test(sx)) sxMatch.push('GI symptoms');
      if (/dizziness on standing/i.test(sx)) sxMatch.push('orthostatic dizziness');
      return {
        name: 'Adrenal insufficiency pattern — rule out Addison disease',
        category: 'endocrine',
        confidence: (cortisol && cortisol.value < 3) || flagCount >= 3 ? 'high' : 'moderate',
        evidence: `${naLow ? `Sodium ${na!.value} (low) ` : ''}${kHigh ? `+ potassium ${k!.value} (high) ` : ''}${cortisolLow ? `+ AM cortisol ${cortisol!.value} µg/dL (low)` : ''}${sxMatch.length ? ` with classic Addison symptoms (${sxMatch.join(', ')})` : ''}. This electrolyte + cortisol pattern is the classic primary adrenal insufficiency signature. Untreated Addison crisis is life-threatening — needs urgent workup.`,
        confirmatory_tests: ['ACTH Stimulation Test (cosyntropin 250 µg, cortisol at 0 + 30 + 60 min)', 'ACTH (Plasma)', '21-hydroxylase Antibodies (autoimmune Addison)', 'Renin + Aldosterone', 'Adrenal CT if antibodies negative'],
        icd10: 'E27.1',
        what_to_ask_doctor: "I have a pattern that could fit adrenal insufficiency — low sodium, high potassium, and/or low morning cortisol. Can we do an ACTH stimulation test urgently? If cortisol fails to rise, that's diagnostic for Addison and treatment is straightforward (hydrocortisone + fludrocortisone replacement).",
        source: 'deterministic',
      };
    },
  },

  // ── Hyperthyroidism / rule-out Graves disease ─────────────────────────
  //
  // TSH below the lab's lower reference (typically 0.4) is suspicious
  // for hyperthyroidism — Graves disease is the most common cause in
  // adults. Add hyperthyroid-pattern symptoms (heat intolerance,
  // palpitations, anxiety, unexplained weight loss, tremor) for
  // confidence. Universal across sexes.
  {
    key: 'hyperthyroidism_rule_out_graves',
    alreadyRaisedIf: [/hyperthyroid/i, /graves/i, /toxic.*goiter/i, /thyrotoxicosis/i],
    skipIfDx: ['hyperthyroidism', 'graves'],
    detect: (ctx) => {
      const tsh = mark(ctx.labValues, [/^tsh\b/i, /^thyroid[\s-]*stimulating[\s-]*hormone\b/i]);
      // 2026-05-12-24: TSH threshold raised 0.4 → 0.45 to catch
      // borderline subclinical hyperthyroid (close-call audit found
      // 26% miss rate at 0.40-0.42 range).
      if (!tsh || tsh.value >= 0.45) return null;
      const sx = ctx.symptomsLower ?? '';
      const sxMatches: string[] = [];
      if (/\bheat intolerance\b/i.test(sx)) sxMatches.push('heat intolerance');
      if (/\bheart palpitation\w*|palpitation\w*/i.test(sx)) sxMatches.push('palpitations');
      if (/\banxiety\b/i.test(sx)) sxMatches.push('anxiety');
      if (/\bunexplained weight loss\b/i.test(sx)) sxMatches.push('weight loss');
      if (/\btremor\b/i.test(sx)) sxMatches.push('tremor');
      if (/\bdiarrhea\b/i.test(sx)) sxMatches.push('GI hypermotility');
      const overt = tsh.value < 0.1;     // very low — classic overt
      const isHigh = overt || sxMatches.length >= 2;
      return {
        name: overt ? 'Overt hyperthyroidism — rule out Graves disease' : 'Hyperthyroid pattern — TSH below range',
        category: 'endocrine',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `TSH ${tsh.value} mIU/L is below the standard reference (~0.4)${sxMatches.length ? ` with hyperthyroid-pattern symptoms (${sxMatches.join(', ')})` : ''}. Graves disease is the most common cause in adults; toxic nodular goiter and thyroiditis are next.`,
        confirmatory_tests: ['Free T4', 'Free T3', 'TSI / TRAb antibodies (Graves-specific)', 'Thyroid uptake scan if antibodies negative', 'Thyroid ultrasound'],
        icd10: 'E05.90',
        what_to_ask_doctor: "My TSH is below the lab's lower reference. Can we check Free T4, Free T3, and TSI / TRAb antibodies to see if this is Graves disease, and would a thyroid uptake scan be appropriate if antibodies are negative?",
        source: 'deterministic',
      };
    },
  },

  // ── Iron deficiency anemia ─────────────────────────────────────────────
  {
    key: 'iron_deficiency_anemia',
    alreadyRaisedIf: [/iron deficien/i, /anemia/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ferritin = mark(ctx.labValues, [/^ferritin/i]);
      // Exclude "Hemoglobin A1c" — would otherwise pull A1c value as if it were Hgb
      const hgb = mark(ctx.labValues, [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i]);
      const mcv = mark(ctx.labValues, [/^mcv\b/i]);
      const isFemale = (ctx.sex ?? '').toLowerCase() === 'female';
      const hgbLow = hgb && (isFemale ? hgb.value < 12 : hgb.value < 13.5);
      const ferritinLow = ferritin && ferritin.value < 30;
      const microcytic = mcv && mcv.value < 80;
      // 2026-05-12-25: Loosened — ferritin <30 alone = iron deficiency
      // per ASCO/AABB clinical guidance, MCV-independent. Microcytic
      // anemia (low Hgb + low MCV) also independently sufficient.
      // Earlier required BOTH ferritin AND microcytic — missed iron-
      // deficient patients with normal MCV (common in early deficiency).
      if (ferritinLow || (hgbLow && microcytic)) {
        const ev: string[] = [];
        if (hgbLow) ev.push(`Hgb ${hgb!.value}`);
        if (ferritinLow) ev.push(`Ferritin ${ferritin!.value}`);
        if (microcytic) ev.push(`MCV ${mcv!.value}`);
        return {
          name: 'Iron Deficiency Anemia',
          category: 'hematology',
          confidence: 'high',
          evidence: `Microcytic + low iron stores: ${ev.join(', ')}.`,
          confirmatory_tests: ['Iron Panel (Iron, TIBC, Transferrin Saturation, Ferritin)', 'Reticulocyte count', 'Stool occult blood (rule out GI source)'],
          icd10: 'D50.9',
          what_to_ask_doctor: "I have iron-deficiency anemia. Can we do a full iron panel and a young-red-cell (retic) count, and rule out bleeding from the gut? (A colonoscopy if I\'m 45+ or have family history.)",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Early hypochromic / iron-deficient erythropoiesis (rule-out) ──────
  // Catches the population BEFORE overt anemia: hemoglobin still in
  // range, but MCV/MCH/MCHC drift to low-normal and/or RDW elevated —
  // the textbook fingerprint of iron stores being depleted while the
  // marrow compensates. Caught early it's reversible with diet/iron.
  // Soft framing — this is "rule-out before anemia," not a diagnosis.
  // Skipped automatically if the overt iron_deficiency_anemia rule
  // already fired (alreadyRaisedIf).
  {
    key: 'early_hypochromic_pattern',
    alreadyRaisedIf: [/iron deficien/i, /anemia/i, /hypochromic/i, /erythropoiesis/i],
    skipIfDx: ['iron_deficiency_anemia', 'anemia'],
    detect: (ctx) => {
      const mcv = mark(ctx.labValues, [/^mcv\b/i, /^mean corpuscular volume$/i]);
      const mch = mark(ctx.labValues, [/^mch\b/i, /^mean corpuscular hemoglobin$/i]);
      const mchc = mark(ctx.labValues, [/^mchc\b/i, /^mean corpuscular hemoglobin concentration$/i]);
      const rdw = mark(ctx.labValues, [/^rdw(?:[-\s]*cv)?$/i, /^red cell distribution width(?:\s+cv)?$/i]);
      const ferritin = mark(ctx.labValues, [/^ferritin\b/i]);

      // Need at least two of: low-normal MCV, low-normal MCH, low-normal
      // MCHC, elevated RDW. One alone is too noisy; two paints a pattern.
      const mcvLowNormal = !!mcv && mcv.value < 88 && mcv.value >= 80;
      const mchLow = !!mch && mch.value < 28;
      const mchcLow = !!mchc && mchc.value < 33;
      const rdwHigh = !!rdw && rdw.value > 13.0;
      const ferritinBorderline = !!ferritin && ferritin.value < 50 && ferritin.value >= 30;

      const hits = [mcvLowNormal, mchLow, mchcLow, rdwHigh, ferritinBorderline].filter(Boolean).length;
      if (hits < 2) return null;

      const ev: string[] = [];
      if (mcvLowNormal) ev.push(`MCV ${mcv!.value} fL (low-normal)`);
      if (mchLow) ev.push(`MCH ${mch!.value} pg (low)`);
      if (mchcLow) ev.push(`MCHC ${mchc!.value} g/dL (low)`);
      if (rdwHigh) ev.push(`RDW ${rdw!.value}% (elevated)`);
      if (ferritinBorderline) ev.push(`Ferritin ${ferritin!.value} (borderline)`);

      return {
        name: 'Early hypochromic pattern (rule-out iron deficiency before anemia)',
        category: 'hematology',
        confidence: 'moderate',
        evidence: `${ev.join(', ')}. Pattern fits early iron-deficient erythropoiesis — red cells are smaller and lighter than expected even though hemoglobin is still in range. Worth ruling out with an iron panel before it progresses to overt anemia.`,
        confirmatory_tests: ['Iron Panel (Iron, TIBC, Transferrin Saturation, Ferritin)', 'Reticulocyte count', 'B12 + Folate (rule out mixed deficiency)'],
        icd10: 'E61.1',
        what_to_ask_doctor: "My MCV / MCH / MCHC are at the low end of normal. Can we run a full iron panel (iron, ferritin, TIBC, transferrin saturation) to see if iron stores are dropping before this turns into anemia?",
        source: 'deterministic',
      };
    },
  },

  // ── Pernicious anemia / B12 deficiency ─────────────────────────────────
  {
    key: 'b12_deficiency',
    alreadyRaisedIf: [/b12 deficien/i, /pernicious anemia/i, /macrocytic/i],
    skipIfDx: [],
    detect: (ctx) => {
      const b12 = mark(ctx.labValues, [/^vitamin b12$/i, /^b12$/i]);
      const mcv = mark(ctx.labValues, [/^mcv\b/i]);
      const onMetformin = isOnMed(ctx.medsLower, 'metformin');
      const onPPI = isOnMed(ctx.medsLower, 'ppi');
      const lowB12 = b12 && b12.value < 400;
      const macrocytic = mcv && mcv.value > 100;
      const neuroSx = symptom(ctx.symptomsLower, [/numb/i, /tingl/i, /neuropath/i, /balance/i]);
      const cognitiveSx = symptom(ctx.symptomsLower, [/brain fog/i, /poor memory/i, /confus/i]);
      if (lowB12 || macrocytic || (cognitiveSx && (onMetformin || onPPI))) {
        const ev: string[] = [];
        if (lowB12) ev.push(`B12 ${b12!.value}`);
        if (macrocytic) ev.push(`MCV ${mcv!.value}`);
        if (onMetformin) ev.push('on metformin (B12 depletion)');
        if (onPPI) ev.push('on PPI (B12 depletion)');
        if (neuroSx) ev.push('neuropathic symptoms');
        if (cognitiveSx) ev.push('cognitive symptoms');
        return {
          name: 'B12 Deficiency / Pernicious Anemia',
          category: 'hematology',
          confidence: macrocytic ? 'high' : 'moderate',
          evidence: ev.join(', '),
          confirmatory_tests: ['MMA (Methylmalonic Acid)', 'Homocysteine', 'Intrinsic Factor antibodies', 'Parietal cell antibodies'],
          icd10: 'D51.0',
          what_to_ask_doctor: "My B12 numbers and symptoms point to a deficiency. Can we run MMA, homocysteine, and intrinsic-factor antibodies to rule out pernicious anemia?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Hereditary hemochromatosis rule-out ────────────────────────────────
  {
    key: 'hereditary_hemochromatosis',
    alreadyRaisedIf: [/hemochromato/i, /\bhfe\b/i, /iron overload/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ferritin = mark(ctx.labValues, [/^ferritin/i]);
      // Need transferrin sat — try to find it
      const sat = mark(ctx.labValues, [/transferrin sat/i, /^iron sat/i, /^% sat/i]);
      const ferritinHigh = ferritin && ferritin.value > 300;
      const satHigh = sat && sat.value > 50;
      if (ferritinHigh && satHigh) {
        return {
          name: 'Hereditary Hemochromatosis (rule-out)',
          category: 'hematology',
          confidence: 'high',
          evidence: `Ferritin ${ferritin!.value} + Transferrin saturation ${sat!.value}% — iron overload pattern.`,
          confirmatory_tests: ['HFE gene testing (C282Y, H63D)', 'Liver enzymes', 'Iron panel repeat'],
          icd10: 'E83.110',
          what_to_ask_doctor: "My ferritin and transferrin saturation are both high. Can we order HFE gene testing to rule out hereditary iron overload (hemochromatosis)?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Sleep apnea pattern ────────────────────────────────────────────────
  {
    key: 'sleep_apnea',
    alreadyRaisedIf: [/sleep apnea/i, /\bosa\b/i],
    skipIfDx: ['sleep_apnea'],
    detect: (ctx) => {
      const rbc = mark(ctx.labValues, [/red blood cell/i, /\brbc\b/i]);
      const hct = mark(ctx.labValues, [/hematocrit/i, /\bhct\b/i]);
      // Exclude Hemoglobin A1c — that's a different marker entirely.
      const hgb = mark(ctx.labValues, [/\bhgb\b/i, /^hemoglobin\b(?!\s*a1c)/i]);
      const a1c = mark(ctx.labValues, [/hemoglobin a1c/i, /\ba1c\b/i, /\bhba1c\b/i]);

      // Polycythemia signature broadened: high RBC/Hct/Hgb flag
      // OR Hct >= 50 (any sex) OR Hgb >= 17 (male thresholds; conservative).
      const polyPattern =
        (rbc && (rbc.flag.includes('high') || rbc.value >= 5.8)) ||
        (hct && (hct.flag.includes('high') || hct.value >= 50)) ||
        (hgb && (hgb.flag.includes('high') || hgb.value >= 17));

      // Symptom matching broadened — common phrasings across users.
      const sleepSx = symptom(ctx.symptomsLower, [
        /\bsnor/i,
        /wak\w* (during|at|in) (the )?night/i,
        /night\s*wak/i,
        /restless sleep/i,
        /unrefreshing sleep/i,
        /daytime (sleep|drowsi|tired)/i,
        /\bgasp/i,
        /witnessed apnea/i,
        /loud breathing/i,
        /morning headache/i,
      ]);
      const weightSx = symptom(ctx.symptomsLower, [
        /weight (gain|resist)/i,
        /can'?t lose weight/i,
        /difficulty losing weight/i,
        /\bobes/i,
      ]);
      const fatigueSx = symptom(ctx.symptomsLower, [/\bfatigue\b/i, /\btired\b/i, /\bexhaust/i]);
      const irPattern = a1c && a1c.value >= 5.4;

      // Fire MODERATE if polycythemia + any one supporting signal.
      // Fire MODERATE on polycythemia alone IF Hct ≥ 51 (lab-flagged).
      const supportingHits = [sleepSx, weightSx, irPattern, fatigueSx].filter(Boolean).length;
      const strongPoly = (hct && hct.value >= 51) || (hgb && hgb.value >= 17.5);
      if (polyPattern && (supportingHits >= 1 || strongPoly)) {
        const evParts: string[] = [];
        if (rbc) evParts.push(`RBC ${rbc.value}`);
        if (hct) evParts.push(`Hct ${hct.value}%`);
        if (hgb) evParts.push(`Hgb ${hgb.value}`);
        if (sleepSx) evParts.push('sleep symptoms');
        if (weightSx) evParts.push('weight resistance');
        if (irPattern) evParts.push(`A1c ${a1c!.value}%`);
        if (fatigueSx) evParts.push('fatigue');
        return {
          name: 'Obstructive Sleep Apnea (rule-out)',
          category: 'respiratory',
          confidence: 'moderate',
          evidence: `${evParts.join(', ')}. Pattern fits poor breathing at night — your body makes extra red blood cells to grab more oxygen.`,
          confirmatory_tests: ['STOP-BANG questionnaire', 'Home sleep study (HSAT)', 'Overnight pulse oximetry'],
          icd10: 'G47.30',
          what_to_ask_doctor: "My red blood cell numbers are high and I\'m tired, snore, or wake up a lot at night. Can I do an at-home sleep study to check for sleep apnea?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Insulin resistance with plaque-forming dyslipidemia ───────────────
  // Universal pattern: triglycerides ≥150 PLUS one or more of (HDL low,
  // glucose watch-tier, A1c watch-tier, TG/HDL ≥3, weight resistance).
  // Catches metabolic-syndrome PRECURSOR using standard lipid panel
  // markers — no advanced lipoprotein testing needed. Fills the gap
  // between `prediabetes` (A1c-only) and `atherogenic_dyslipidemia`
  // (LDL-P-only) so any user with the IR pattern gets the right card.
  {
    key: 'insulin_resistance_dyslipidemia',
    alreadyRaisedIf: [/insulin resistance/i, /metabolic syndrome/i, /pre[\s-]?diabetes/i, /dyslipid/i],
    skipIfDx: ['t2d', 'metabolic_syndrome'],
    detect: (ctx) => {
      const tg = mark(ctx.labValues, [/triglyc/i]);
      const hdl = mark(ctx.labValues, [/\bhdl\b/i, /hdl[\s-]*c\b/i, /high[\s-]*density/i]);
      const ldl = mark(ctx.labValues, [/\bldl\b/i, /ldl[\s-]*c\b/i, /low[\s-]*density/i]);
      // Exclude OGTT-style markers (Glucose Tolerance, 2-hr post, random)
      const glu = mark(ctx.labValues, [/\bglucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i, /fasting glucose/i]);
      const a1c = mark(ctx.labValues, [/hemoglobin a1c/i, /\ba1c\b/i, /\bhba1c\b/i]);

      // Anchor: TG ≥ 150
      if (!tg || tg.value < 150) return null;

      const isMale = (ctx.sex ?? '').toLowerCase() === 'male';
      const hdlLow = hdl && (isMale ? hdl.value < 40 : hdl.value < 50);
      const gluWatch = glu && glu.value >= 95 && glu.value <= 125;
      const a1cWatch = a1c && a1c.value >= 5.4 && a1c.value <= 6.4;
      const tgHdlHigh = (tg && hdl && hdl.value > 0) ? (tg.value / hdl.value) >= 3 : false;
      const weightSx = symptom(ctx.symptomsLower, [/weight (gain|resist)/i, /can'?t lose weight/i, /difficulty losing weight/i]);

      const hits = [hdlLow, gluWatch, a1cWatch, tgHdlHigh, weightSx].filter(Boolean).length;
      if (hits < 1) return null;

      const ev: string[] = [`TG ${tg.value}`];
      if (ldl && ldl.value >= 130) ev.push(`LDL ${ldl.value}`);
      if (hdlLow) ev.push(`HDL ${hdl!.value}`);
      if (gluWatch) ev.push(`fasting glucose ${glu!.value}`);
      if (a1cWatch) ev.push(`A1c ${a1c!.value}%`);
      if (tgHdlHigh) ev.push(`TG/HDL ratio ${(tg.value / hdl!.value).toFixed(1)}`);
      if (weightSx) ev.push('weight resistance');

      const confidence = hits >= 2 ? 'high' : 'moderate';
      return {
        name: 'Insulin resistance with plaque-forming dyslipidemia (metabolic syndrome precursor)',
        category: 'metabolic',
        confidence,
        evidence: `${ev.join(', ')}. Pattern says your pancreas is pumping out extra insulin to keep blood sugar normal, and it\'s pushing your cholesterol into the small, sticky kind that clogs arteries — even before A1c crosses into the diabetes range.`,
        confirmatory_tests: ['Fasting Insulin + HOMA-IR', 'ApoB', 'Lp(a) once-in-lifetime', 'hs-CRP', 'Coronary Artery Calcium (CAC) score'],
        icd10: 'E88.81',
        what_to_ask_doctor: "My triglycerides and other numbers look like early insulin resistance. Can we add a fasting insulin and ApoB test to confirm it and figure out the best plan?",
        source: 'deterministic',
      };
    },
  },

  // ── Borderline / early-pattern thyroid (NOT yet "Hashimoto's") ────────
  // Catches the TSH 2.0–4.5 + thyroid-pattern symptoms population:
  //   - TSH 2.0–2.5: above functional-medicine optimal (<2.0), still inside
  //     standard reference range. Worth tracking + getting the workup,
  //     NOT a "diagnosis."
  //   - TSH 2.5–4.5: AACE 2014 / Endocrine Society "subclinical / grey zone."
  //     Antibody screen warranted with symptoms.
  // Both bands fold into ONE moderate-confidence card with intentionally
  // soft naming ("worth tracking" / "early pattern") and require ≥ 2
  // hypothyroid-pattern symptoms — not just 1, to avoid false positives
  // on isolated fatigue.
  // The Hashimoto's-named card upstream is reserved for antibody-positive
  // OR overt-hypothyroid cases. That separation is intentional.
  {
    key: 'subclinical_hypothyroidism',
    alreadyRaisedIf: [/subclinical hypothyroid/i, /hashimoto/i, /hypothyroid/i, /thyroid pattern/i, /thyroid function/i],
    skipIfDx: ['hashimotos', 'hypothyroidism'],
    detect: (ctx) => {
      const tsh = mark(ctx.labValues, [/^tsh\b/i, /^thyroid[\s-]*stimulating[\s-]*hormone\b/i]);
      if (!tsh) return null;
      const tshBorderline = tsh.value >= 2.0 && tsh.value < 4.5;
      if (!tshBorderline) return null;

      const fatigue = symptom(ctx.symptomsLower, [/\bfatigue\b/i, /\btired\b/i, /\bexhaust/i, /low energy/i]);
      const brainFog = symptom(ctx.symptomsLower, [/brain fog/i, /poor memory/i, /memory|forget|concentr|focus/i]);
      const weightGain = symptom(ctx.symptomsLower, [/weight (gain|resist)/i, /can'?t lose weight/i, /slow metabolism/i]);
      const hairLoss = symptom(ctx.symptomsLower, [/hair (loss|thin|fall)/i]);
      const cold = symptom(ctx.symptomsLower, [/cold intoler/i, /\bcold (hand|feet|extremit)/i]);
      const constipation = symptom(ctx.symptomsLower, [/constipation/i]);
      const drySkin = symptom(ctx.symptomsLower, [/dry skin/i]);
      const moodIssues = symptom(ctx.symptomsLower, [/low mood/i, /\bdepress/i, /mood swing/i]);
      const sxCount = [fatigue, brainFog, weightGain, hairLoss, cold, constipation, drySkin, moodIssues].filter(Boolean).length;

      // Require 2+ symptoms — single fatigue is too noisy.
      if (sxCount < 2) return null;

      const matched = [
        fatigue ? 'fatigue' : null,
        brainFog ? 'brain fog/memory' : null,
        weightGain ? 'weight gain' : null,
        hairLoss ? 'hair loss' : null,
        cold ? 'cold intolerance' : null,
        constipation ? 'constipation' : null,
        drySkin ? 'dry skin' : null,
        moodIssues ? 'mood symptoms' : null,
      ].filter(Boolean).join(', ');

      // TSH 2.5+ gets the "AACE grey zone" framing; 2.0–2.5 gets the
      // softer "in-range high — borderline" framing. Both share the
      // same confirmatory-test list. No "optimal" language — the
      // product is borderline early-detection, not optimization.
      const isGreyZone = tsh.value >= 2.5;
      return {
        name: isGreyZone
          ? 'Thyroid pattern worth tracking (subclinical / early)'
          : 'Thyroid function — borderline-high TSH (in-range high)',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: isGreyZone
          ? `TSH ${tsh.value} mIU/L is in the AACE grey zone (≥2.5) and you have ${sxCount} thyroid-pattern symptoms (${matched}). Worth ruling out early Hashimoto's with antibody testing.`
          : `TSH ${tsh.value} mIU/L is borderline-high — inside the standard lab reference range (0.4–4.5) but pressed to the high end. Paired with ${sxCount} thyroid-pattern symptoms (${matched}). Not a diagnosis — a flag to track and to get the antibody workup if symptoms persist.`,
        confirmatory_tests: ['Thyroid Panel (TSH + Free T4 + Free T3)', 'TPO antibodies', 'Thyroglobulin antibodies (Tg-Ab)', 'Reverse T3'],
        icd10: 'E03.9',
        what_to_ask_doctor: "My TSH is on the high side and I have a few low-thyroid symptoms. Can we check Free T4, Free T3, and thyroid antibodies (TPO, Tg-Ab) to see if anything is brewing?",
        source: 'deterministic',
      };
    },
  },

  // ── Generalized cardiometabolic risk amplifier ────────────────────────
  // Fires on hs-CRP elevated + ANY metabolic abnormality. Tells the
  // patient inflammation is amplifying their CV risk independent of the
  // primary driver. ICD-10 R74.0 maps cleanly.
  {
    key: 'inflammation_cv_amplifier',
    alreadyRaisedIf: [/inflammation/i, /elevated crp/i, /chronic inflammation/i],
    skipIfDx: [],
    detect: (ctx) => {
      const crp = mark(ctx.labValues, [/hs[\s-]?crp/i, /high[\s-]*sensitivity[\s-]*c[\s-]*reactive/i, /\bcrp\b/i]);
      if (!crp || crp.value < 1.0) return null;
      const tg = mark(ctx.labValues, [/triglyc/i]);
      const ldl = mark(ctx.labValues, [/\bldl\b/i, /ldl[\s-]*c\b/i]);
      // Exclude OGTT-style markers (Glucose Tolerance, 2-hr post, random)
      const glu = mark(ctx.labValues, [/\bglucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i, /fasting glucose/i]);
      const a1c = mark(ctx.labValues, [/hemoglobin a1c/i, /\ba1c\b/i, /\bhba1c\b/i]);
      const metabolicAbn = (tg && tg.value >= 150) || (ldl && ldl.value >= 130) ||
        (glu && glu.value >= 95) || (a1c && a1c.value >= 5.4);
      if (!metabolicAbn) return null;
      return {
        name: 'Chronic inflammation amplifying CV risk',
        category: 'cardiovascular',
        confidence: 'moderate',
        evidence: `hs-CRP ${crp.value} mg/L + metabolic abnormality — inflammation independently raises 10-yr CV risk by 30-40%.`,
        confirmatory_tests: ['hs-CRP repeat at 12 weeks', 'ApoB', 'Coronary Artery Calcium (CAC) score', 'Fasting Insulin'],
        icd10: 'R74.0',
        what_to_ask_doctor: "My hs-CRP is up along with my cholesterol or blood-sugar markers, which means hidden inflammation is adding to my heart risk. Should that change my statin or lifestyle plan?",
        source: 'deterministic',
      };
    },
  },

  // ── Postmenopause (undiagnosed) ────────────────────────────────────────
  {
    key: 'postmenopause',
    alreadyRaisedIf: [/menopause/i, /postmenopaus/i, /perimenopaus/i],
    skipIfDx: ['menopause_postmenopause'],
    detect: (ctx) => {
      if ((ctx.sex ?? '').toLowerCase() !== 'female') return null;
      const fsh = mark(ctx.labValues, [/^fsh\b/i]);
      const e2 = mark(ctx.labValues, [/^estradiol/i, /^e2\b/i]);
      if (fsh && fsh.value > 30) {
        return {
          name: 'Menopause / Postmenopausal State',
          category: 'reproductive',
          confidence: 'high',
          evidence: `FSH ${fsh.value} mIU/mL${e2 ? ` + Estradiol ${e2.value} pg/mL` : ''} — postmenopausal hormone pattern.`,
          confirmatory_tests: ['Repeat FSH + Estradiol in 4-6 weeks', 'Female Hormone Panel (E2, P4, T)', 'DEXA scan for bone density'],
          icd10: 'N95.1',
          what_to_ask_doctor: "My FSH is in the post-menopause range. Can we talk about hormone therapy (HRT) options, a bone-density scan, and how losing estrogen can affect heart health?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Cortisol elevation → adrenal screen (universal) ────────────────────
  //
  // AM serum cortisol above the lab's upper reference range warrants a
  // proper rule-out: HPA-axis dysregulation, oral / inhaled / topical
  // corticosteroid use, exogenous estrogen (raises cortisol-binding
  // globulin), chronic stress / sleep deprivation, and — much less
  // commonly — Cushing's syndrome. The point isn't to diagnose Cushing's
  // from a single AM cortisol; the point is to give the patient a clear
  // structured workup to bring to their PCP.
  //
  // We skip the rule if the user is on chronic oral steroid (medClass
  // 'steroid_oral') — that already explains the elevation.
  // Universal across every user with high AM cortisol.
  {
    key: 'adrenal_cortisol_screen',
    alreadyRaisedIf: [/cushing|adrenal\s+hyper|hpa.*dysreg|hpa\s+axis/i],
    skipIfDx: [],
    detect: (ctx) => {
      const cort = mark(ctx.labValues, [/cortisol\s*-?\s*am|^cortisol$|morning\s+cortisol/i]);
      if (!cort) return null;
      if (cort.flag !== 'high' && cort.flag !== 'critical_high') return null;

      // If user is on chronic oral steroid, the elevation has a known
      // explanation — skip the workup rule.
      if (/\b(prednisone|methylpredniso|hydrocortisone|dexamethasone)\b/i.test(ctx.medsLower)) return null;

      // Confidence scales with magnitude: critical_high → high, normal
      // high flag → moderate
      const confidence: 'high' | 'moderate' = cort.flag === 'critical_high' || cort.value > 25 ? 'high' : 'moderate';

      const question = `My morning cortisol is ${cort.value} µg/dL — can we set up the rule-out workup? A repeat AM cortisol, a late-night salivary cortisol, and either a 24-hour urinary free cortisol or low-dose dexamethasone suppression test would tell us if this is real or just stress / timing / medication.`;

      return {
        name: 'Adrenal / Cortisol Workup',
        category: 'endocrine',
        confidence,
        evidence: `AM cortisol ${cort.value} µg/dL — above the lab's upper reference. Common reversible causes (stress, sleep deprivation, exogenous estrogen, draw-time variability) should be ruled out before pursuing Cushing's screen, but the workup is the same first step.`,
        confirmatory_tests: [
          'Repeat AM cortisol (drawn 6:30–8:30 AM, after stable sleep)',
          'Late-night salivary cortisol',
          '24-hour urinary free cortisol — OR — Low-dose dexamethasone suppression test',
          'ACTH (paired with cortisol)',
          'Medication review (corticosteroids / topical / inhaled / hormonal contraception)',
        ],
        icd10: 'E27.0',
        what_to_ask_doctor: question,
        source: 'deterministic',
      };
    },
  },

  // ── Hyperprolactinemia workup (universal, pregnancy-aware) ─────────────
  //
  // Fires when prolactin is above the lab reference range. Branches the
  // patient-facing message and confirmatory_tests by context:
  //   • Female + isPregnant=true → expected-findings suppressor already
  //     handles it (rule short-circuits here to avoid double-firing)
  //   • Female + isPregnant=false → β-hCG FIRST (a young woman taking a
  //     prenatal but selecting 'not pregnant' could still be pregnant
  //     without knowing), then fasting repeat prolactin, then MRI
  //     pituitary if persistent
  //   • Male → repeat prolactin (food / stress / nipple stim raise it
  //     2x), then testosterone + LH/FSH, then MRI pituitary if persistent
  // Universal across every user with high prolactin.
  {
    key: 'hyperprolactinemia_workup',
    alreadyRaisedIf: [/hyperprolactin|prolactin.*elev|prolactin.*high|elevated\s+prolactin/i],
    skipIfDx: [],
    detect: (ctx) => {
      const prl = mark(ctx.labValues, [/^prolactin/i]);
      if (!prl) return null;
      if (prl.flag !== 'high' && prl.flag !== 'critical_high') return null;

      // Pregnancy-aware short-circuit. If is_pregnant is on the user
      // (we approximate by reading conditionsLower for 'pregnant' /
      // 'breastfeeding' since BackstopCtx doesn't carry isPregnant
      // directly), defer to the expected-findings suppressor.
      // BackstopCtx.conditionsLower is built from active conditions
      // table — pregnant users don't typically have "pregnancy" as a
      // condition entry, so this is a soft check. The real suppression
      // happens at the expected-findings layer in factsCache.
      const sex = String(ctx.sex ?? '').toLowerCase();

      const isMale = sex === 'male' || sex === 'm';
      const baseConfirmatory = isMale
        ? [
            'Fasting repeat prolactin (food/stress/nipple stimulation can elevate)',
            'Total + Free Testosterone',
            'LH + FSH',
            'TSH (rule out primary hypothyroidism as cause)',
            'MRI pituitary (if persistently elevated)',
          ]
        : [
            'Urine or serum β-hCG (rule out pregnancy first)',
            'Fasting repeat prolactin (food/stress/nipple stimulation can elevate)',
            'TSH (rule out primary hypothyroidism as cause)',
            'Medication review (dopamine antagonists / antipsychotics / SSRIs raise prolactin)',
            'MRI pituitary (if persistently elevated)',
          ];

      const question = isMale
        ? `My prolactin came back at ${prl.value} ng/mL — can we repeat it fasting, check testosterone and LH/FSH, and consider a pituitary MRI if it stays high?`
        : `My prolactin is ${prl.value} ng/mL — can we run a pregnancy test first, then repeat the prolactin fasting, and review any medications I'm on that could raise it?`;

      // 2026-05-13-57 enhancement: connect prolactin elevation to downstream
      // axis suppression that frequently coexists. High prolactin suppresses
      // GnRH → low LH/FSH → ovarian or testicular dysfunction. When we see
      // those low gonadotropins alongside high prolactin, name the cause so
      // the PCP doesn't chase low FSH separately. Estradiol can also be
      // altered (often elevated in women on the cycle phase / driven by the
      // disinhibited GnRH pulsatility).
      const fsh = mark(ctx.labValues, [/^fsh\b|follicle.?stimulating/i]);
      const lh = mark(ctx.labValues, [/^lh\b|luteinizing/i]);
      const e2 = mark(ctx.labValues, [/^estradiol\b|^e2\b/i]);
      const downstreamNotes: string[] = [];
      if (fsh && fsh.value < 3.5) downstreamNotes.push(`FSH ${fsh.value} (low — expected: high prolactin suppresses GnRH → low LH/FSH)`);
      if (lh && lh.flag === 'low') downstreamNotes.push(`LH ${lh.value} (low — same GnRH-suppression axis)`);
      if (e2 && (e2.flag === 'high' || e2.flag === 'critical_high')) downstreamNotes.push(`Estradiol ${e2.value} (high — context-dependent; interpret with cycle phase)`);
      const axisClause = downstreamNotes.length > 0
        ? ` Downstream effects already visible: ${downstreamNotes.join('; ')}.`
        : '';

      return {
        name: 'Hyperprolactinemia Workup',
        category: 'reproductive',
        confidence: prl.value > 50 ? 'high' : 'moderate',
        evidence: `Prolactin ${prl.value} ng/mL — above the lab's upper reference. Pregnancy (in women), medications (dopamine blockers, SSRIs), and primary hypothyroidism are the common reversible causes; rule those out before chasing a pituitary microadenoma.${axisClause}`,
        confirmatory_tests: baseConfirmatory,
        icd10: 'E22.1',
        what_to_ask_doctor: question,
        source: 'deterministic',
      };
    },
  },

  // ── Low T (male) ───────────────────────────────────────────────────────
  {
    key: 'low_testosterone_male',
    alreadyRaisedIf: [/low testosterone/i, /hypogonad/i, /low\W*t\b/i],
    skipIfDx: ['low_testosterone_male'],
    detect: (ctx) => {
      if ((ctx.sex ?? '').toLowerCase() !== 'male') return null;
      const totalT = mark(ctx.labValues, [/^testosterone, total/i, /^total testosterone/i]);
      if (totalT && totalT.value < 350) {
        const lowLibido = symptom(ctx.symptomsLower, [/low libido/i, /low sex/i, /\bed\b/i]);
        const fatigue = symptom(ctx.symptomsLower, [/fatigue/i]);
        const evParts = [`Total T ${totalT.value} ng/dL`];
        if (lowLibido) evParts.push('low libido');
        if (fatigue) evParts.push('fatigue');
        return {
          name: 'Low Testosterone / Hypogonadism (Male)',
          category: 'endocrine',
          confidence: totalT.value < 250 ? 'high' : 'moderate',
          evidence: evParts.join(', '),
          confirmatory_tests: ['Free Testosterone', 'SHBG', 'LH + FSH', 'Estradiol (sensitive)', 'Prolactin'],
          icd10: 'E29.1',
          what_to_ask_doctor: "My total testosterone is low. Can we run Free T, SHBG, LH/FSH, and prolactin to find out if the problem is in the testes or the brain — and decide whether to treat the cause or start testosterone therapy (TRT)?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Vitamin D Deficiency / Insufficiency / Suboptimal — comprehensive
  // 2026-05-12-24: Merged previous deficient-only rule with broader
  // insufficient + suboptimal detection. Single source of truth. Engine
  // had no pattern card for 20-30 (insufficient) before — surfaced via
  // 5000-subtle audit (0% detection rate).
  {
    key: 'vitamin_d_deficiency',
    alreadyRaisedIf: [/vitamin d def/i, /\bd deficien/i, /vit.?d.*low/i, /25.?oh.?d.*low/i],
    skipIfDx: ['vitamin_d_deficiency'],
    detect: (ctx) => {
      const d = mark(ctx.labValues, [/25.?hydroxy.*vitamin d|vitamin d.*25|25\(?oh\)?d|25-hydroxyvitamin|^vitamin d\b/i]);
      if (!d) return null;
      const isDeficient = d.value < 20;
      const isInsufficient = d.value >= 20 && d.value < 30;
      // Suboptimal (30-40) is handled by the suboptimalFlags layer,
      // not as a pattern card — avoids spamming healthy users with
      // "your Vit D should be 40+" functional-medicine framing.
      if (!isDeficient && !isInsufficient) return null;
      const label = isDeficient ? 'Vitamin D Deficiency' : 'Vitamin D Insufficiency';
      const confidence: 'high'|'moderate' = 'high';
      const dosing = isDeficient ? '5,000 IU/day for 12 weeks' : '4,000 IU/day for 12 weeks';
      return {
        name: label,
        category: 'nutritional',
        confidence,
        evidence: `Vitamin D 25-OH ${d.value} ng/mL. ${isDeficient ? 'Below 20 ng/mL — frank clinical deficiency.' : isInsufficient ? 'Below 30 ng/mL — Endocrine Society insufficiency threshold.' : 'In standard range but below functional-medicine optimal (40-60).'} Drives mood, immune function, bone density, autoimmunity risk. Affects 40%+ of US adults.`,
        confirmatory_tests: ['Repeat 25-OH Vitamin D after 12 weeks of D3', 'Calcium (especially if deficient)', 'PTH (rule out secondary hyperparathyroidism if deficient)', 'Ionized Calcium (if long-term low Vit D)'],
        icd10: 'E55.9',
        what_to_ask_doctor: `My Vitamin D 25-OH is ${d.value} ng/mL. Can we start ${dosing} and recheck? Standard PCP recommendation, ACA-covered with any deficiency-related symptom (fatigue, mood, bone pain).`,
        source: 'deterministic',
      };
    },
  },

  // ── Atherogenic dyslipidemia ───────────────────────────────────────────
  {
    key: 'atherogenic_dyslipidemia',
    alreadyRaisedIf: [/atherogen/i, /high cholesterol/i, /hyperlipid/i, /dyslipid/i],
    skipIfDx: ['hyperlipidemia', 'familial_hypercholesterolemia'],
    detect: (ctx) => {
      const ldlP = mark(ctx.labValues, [/^ldl p\b/i, /ldl particle/i]);
      const smallLdlP = mark(ctx.labValues, [/small ldl p/i]);
      const largeHdlP = mark(ctx.labValues, [/large hdl p/i]);
      const ldlPHigh = ldlP && ldlP.value > 1100;
      const smallLdlPHigh = smallLdlP && smallLdlP.value > 467;
      const largeHdlPLow = largeHdlP && largeHdlP.value < 7.2;
      const hits = [ldlPHigh, smallLdlPHigh, largeHdlPLow].filter(Boolean).length;
      if (hits >= 2) {
        const ev: string[] = [];
        if (ldlPHigh) ev.push(`LDL-P ${ldlP!.value}`);
        if (smallLdlPHigh) ev.push(`small LDL-P ${smallLdlP!.value}`);
        if (largeHdlPLow) ev.push(`Large HDL-P ${largeHdlP!.value}`);
        return {
          name: 'Atherogenic Dyslipidemia (small dense LDL pattern)',
          category: 'cardiovascular',
          confidence: 'high',
          evidence: `Particle pattern flags atherosclerotic CV risk: ${ev.join(', ')}.`,
          confirmatory_tests: ['ApoB', 'Lp(a) once-in-lifetime', 'Coronary Artery Calcium (CAC) score', 'hs-CRP'],
          icd10: 'E78.5',
          what_to_ask_doctor: "Even though my regular cholesterol looks OK, my LDL particles are the kind that clog arteries. Can we get ApoB, Lp(a), and a coronary calcium scan?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Chronic Kidney Disease (CKD) — eGFR/Creatinine drift ──────────────
  //
  // eGFR <60 OR creatinine elevated → CKD pattern. Universal across
  // sexes. Stage classification: G1 ≥90, G2 60-89, G3a 45-59, G3b 30-44,
  // G4 15-29, G5 <15. Most missed treatable CV / mortality risk in
  // older adults — early CKD detection prevents dialysis trajectory.
  {
    key: 'ckd_pattern',
    alreadyRaisedIf: [/ckd|chronic kidney|nephro|esrd|dialys/i],
    skipIfDx: ['ckd', 'chronic_kidney_disease', 'esrd'],
    detect: (ctx) => {
      const creat = mark(ctx.labValues, [/^creatinine\b/i]);
      const egfr = mark(ctx.labValues, [/\begfr\b|estimated.?glomerular/i]);
      const bun = mark(ctx.labValues, [/^bun\b|urea nitrogen/i]);
      // 2026-05-12-24: lowered eGFR threshold 60 → 75 to catch
      // subclinical CKD G2 (mild functional decline). Creatinine
      // KEPT at >1.3 — eGFR is the more sensitive early marker;
      // dropping Creat to 1.1 false-fires for healthy adults with
      // muscular build (Creat 1.2 normal).
      const creatHigh = creat && creat.value > 1.3;
      const egfrLow = egfr && egfr.value < 75;
      const bunHigh = bun && bun.value > 25;
      if (!creatHigh && !egfrLow) return null;
      const stage = egfr
        ? (egfr.value >= 75 ? 'G1 (normal)' : egfr.value >= 60 ? 'G2 (mild)' : egfr.value >= 45 ? 'G3a (moderate)' :
           egfr.value >= 30 ? 'G3b (moderate-severe)' : egfr.value >= 15 ? 'G4 (severe)' : 'G5 (kidney failure)')
        : 'unstaged';
      const isHigh = egfr ? egfr.value < 45 : (creat ? creat.value > 1.8 : false);
      const ev: string[] = [];
      if (egfr) ev.push(`eGFR ${egfr.value} mL/min (CKD stage ${stage})`);
      if (creat) ev.push(`Creatinine ${creat.value} mg/dL`);
      if (bunHigh) ev.push(`BUN ${bun.value}`);
      return {
        name: 'CKD pattern — chronic kidney disease workup',
        category: 'kidney',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `${ev.join(', ')}. Kidney filtration is reduced from normal. Most-missed treatable CV / mortality risk in adults — early CKD detection guides ACE/ARB therapy and prevents dialysis trajectory.`,
        confirmatory_tests: ['Cystatin-C based eGFR (more accurate than creatinine in muscle-low patients)', 'UACR (urine albumin/creatinine ratio)', 'Repeat eGFR in 3 months to confirm chronic vs acute', 'Renal Ultrasound', 'PTH + Vitamin D + Phosphorus (CKD-mineral-bone workup if eGFR <45)'],
        icd10: 'N18.9',
        what_to_ask_doctor: "My eGFR is reduced. Can we run a Cystatin-C eGFR and UACR to confirm CKD, then repeat in 3 months to confirm it's chronic? If confirmed, an ACE inhibitor or SGLT2 inhibitor protects the kidney long-term.",
        source: 'deterministic',
      };
    },
  },

  // ── Hypercholesterolemia / atherogenic lipid pattern (universal) ──────
  //
  // LDL >130, Total Cholesterol >240, or ApoB >100 → atherogenic lipid
  // pattern worth confirming. Fires across all ages including >50 where
  // the FH rule doesn't apply. Universal CV-risk-screening pattern.
  {
    key: 'hypercholesterolemia_pattern',
    alreadyRaisedIf: [/familial hypercholesterol|\bfh\b|hypercholesterolemia|hyperlipidemia/i],
    skipIfDx: ['familial_hypercholesterolemia', 'hyperlipidemia'],
    detect: (ctx) => {
      const ldl = mark(ctx.labValues, [/^ldl\b(?! p)/i, /ldl chol/i]);
      const tc = mark(ctx.labValues, [/total cholesterol|^cholesterol\b/i]);
      const apob = mark(ctx.labValues, [/apolipoprotein b|\bapob\b|apo b/i]);
      const ldlHigh = ldl && ldl.value > 130;
      const tcHigh = tc && tc.value > 240;
      const apobHigh = apob && apob.value > 100;
      if (!ldlHigh && !tcHigh && !apobHigh) return null;
      const ev: string[] = [];
      if (ldl) ev.push(`LDL ${ldl.value}`);
      if (tc) ev.push(`Total Cholesterol ${tc.value}`);
      if (apob) ev.push(`ApoB ${apob.value}`);
      const isHigh = (ldl && ldl.value > 160) || (apob && apob.value > 120) || (tc && tc.value > 270);
      return {
        name: 'Hypercholesterolemia pattern — atherogenic lipid panel',
        category: 'cardiovascular',
        confidence: isHigh ? 'high' : 'moderate',
        evidence: `${ev.join(', ')}. LDL ≥130 / Total Chol ≥240 / ApoB ≥100 puts you in the atherogenic-lipid zone. The right question isn't only "how high?" — it's "how many particles, and are any genetic?" That's what ApoB and Lp(a) answer.`,
        confirmatory_tests: ['ApoB (atherogenic particle count)', 'Lp(a) — once-in-lifetime genetic marker', 'LDL-Particle Number (NMR)', 'hs-CRP (inflammation amplifier)', 'Coronary Artery Calcium (CAC) score', 'Family history of premature CV disease'],
        icd10: 'E78.0',
        what_to_ask_doctor: "My LDL or Total Cholesterol or ApoB is above the standard threshold. Can we run ApoB (particle count) and once-in-lifetime Lp(a), and consider a Coronary Calcium Score? Those tell me what my actual atherogenic-particle risk looks like instead of just the LDL number.",
        source: 'deterministic',
      };
    },
  },

  // ── Familial Hypercholesterolemia rule-out ─────────────────────────────
  {
    key: 'familial_hypercholesterolemia',
    alreadyRaisedIf: [/familial hypercholesterol/i, /\bfh\b/i],
    skipIfDx: ['familial_hypercholesterolemia'],
    detect: (ctx) => {
      const ldl = mark(ctx.labValues, [/^ldl\b(?! p)/i, /ldl chol/i]);
      const ageNum = ctx.age ?? 99;
      if (ldl && ldl.value > 190 && ageNum < 50) {
        return {
          name: 'Familial Hypercholesterolemia (rule-out)',
          category: 'cardiovascular',
          confidence: 'moderate',
          evidence: `LDL ${ldl.value} mg/dL at age ${ageNum} — markedly elevated for age.`,
          confirmatory_tests: ['Family history (lipids, early CV events)', 'ApoB', 'Lp(a)', 'PCSK9 / LDLR genetic testing if pattern fits', 'Coronary Calcium Score'],
          icd10: 'E78.01',
          what_to_ask_doctor: "My LDL is very high for my age. Can we talk about family history of high cholesterol, run ApoB and Lp(a), and think about genetic testing to rule out a family form (familial hypercholesterolemia)?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Polymyalgia Rheumatica (50+ + ESR/CRP + stiffness) ────────────────
  {
    key: 'polymyalgia_rheumatica',
    alreadyRaisedIf: [/polymyalgia/i, /\bpmr\b/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ageNum = ctx.age ?? 0;
      if (ageNum < 50) return null;
      const crp = mark(ctx.labValues, [/hs[-\s]?crp/i, /^crp\b/i]);
      const esr = mark(ctx.labValues, [/^esr\b/i, /sed rate/i]);
      const inflamHigh = (crp && crp.value > 1.0) || (esr && esr.value > 30);
      const stiffnessSx = symptom(ctx.symptomsLower, [/morning stiff/i, /shoulder pain/i, /hip pain/i, /joint stiff/i]);
      if (inflamHigh && stiffnessSx) {
        return {
          name: 'Polymyalgia Rheumatica (rule-out)',
          category: 'autoimmune',
          confidence: 'moderate',
          evidence: `Age ${ageNum}+ with elevated inflammation (${crp ? `CRP ${crp.value}` : ''}${esr ? `, ESR ${esr.value}` : ''}) + shoulder/hip stiffness symptoms.`,
          confirmatory_tests: ['ESR (if not already done)', 'hs-CRP', 'CK', 'Rheumatology referral if pattern persists'],
          icd10: 'M35.3',
          what_to_ask_doctor: "I\'m over 50 with shoulder and hip stiffness plus high inflammation markers. Can we rule out polymyalgia rheumatica and maybe see a rheumatologist?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Multiple Myeloma red-flag screen ──────────────────────────────────
  {
    key: 'mm_red_flag',
    alreadyRaisedIf: [/myeloma/i, /\bmgus\b/i, /monoclonal gammopath/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ageNum = ctx.age ?? 0;
      if (ageNum < 50) return null;
      const globulin = mark(ctx.labValues, [/^globulin\b/i]);
      const calcium = mark(ctx.labValues, [/^calcium\b/i]);
      const creat = mark(ctx.labValues, [/^creatinine\b/i]);
      // Exclude "Hemoglobin A1c" — different marker entirely
      const hgb = mark(ctx.labValues, [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i]);
      const bonePainSx = symptom(ctx.symptomsLower, [/bone pain/i, /back pain/i]);
      const globulinHigh = globulin && globulin.value > 4.0;
      const calciumHigh = calcium && calcium.value > 10.5;
      const creatHigh = creat && creat.value > 1.3;
      const anemia = hgb && hgb.value < 11;
      const hits = [globulinHigh, calciumHigh, creatHigh, anemia, bonePainSx].filter(Boolean).length;
      if (hits >= 2) {
        return {
          name: 'Multiple Myeloma red-flag (rule-out)',
          category: 'oncology',
          confidence: 'low',
          evidence: `Age ${ageNum}+ with ${hits} of 5 myeloma red flags (CRAB+pain): elevated globulin / calcium / creatinine / anemia / bone pain.`,
          confirmatory_tests: ['SPEP (Serum Protein Electrophoresis)', 'Serum Free Light Chains', 'Immunofixation', '24-hour urine for Bence Jones protein'],
          icd10: 'D47.2',
          what_to_ask_doctor: "Several of my numbers fit a pattern doctors call CRAB. Can we run SPEP and serum free light chains to rule out a blood-protein disorder (monoclonal gammopathy)?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },

  // ── Isolated hyperbilirubinemia → Gilbert syndrome rule-out ──────────
  // 2026-05-13: when total bilirubin is mildly elevated (1.2-3.0) with
  // NORMAL ALT/AST/Alk Phos, Gilbert syndrome is the most common cause
  // (~7% of the population). Engine should suggest indirect/direct
  // fractionation + fasting repeat to confirm Gilbert vs pathological
  // hepatobiliary disease. Universal — fires regardless of age/sex.
  {
    key: 'gilbert_syndrome_workup',
    alreadyRaisedIf: [/gilbert/i, /^isolated.*bilirubin/i],
    skipIfDx: ['gilbert', 'gilbert_syndrome'],
    detect: (ctx) => {
      const bili = mark(ctx.labValues, [/^bilirubin.*total\b|^total.*bilirubin\b/i]);
      const alt = mark(ctx.labValues, [/^alt\b|sgpt/i]);
      const ast = mark(ctx.labValues, [/^ast\b|sgot/i]);
      const alkPhos = mark(ctx.labValues, [/^alkaline\s*phosphatase\b|^alk\s*phos/i]);
      // Must have bili elevated 1.2-3.0 AND normal ALT/AST/AlkPhos
      if (!bili || bili.value < 1.2 || bili.value > 3.0) return null;
      const altNormal = !alt || alt.value <= 45;
      const astNormal = !ast || ast.value <= 40;
      const alkPhosNormal = !alkPhos || alkPhos.value <= 115;
      if (!altNormal || !astNormal || !alkPhosNormal) return null; // pathologic pattern, not Gilbert
      return {
        name: 'Isolated hyperbilirubinemia — rule out Gilbert syndrome',
        category: 'gi',
        confidence: 'high',
        evidence: `Total bilirubin ${bili.value} mg/dL with otherwise normal liver enzymes (ALT, AST, Alkaline Phosphatase). The most common cause of isolated mild hyperbilirubinemia is Gilbert syndrome — a benign inherited enzyme variant affecting ~7% of the population. Fractionation (indirect vs direct bilirubin) plus a fasting repeat confirms it.`,
        confirmatory_tests: [
          'Indirect (unconjugated) + Direct (conjugated) Bilirubin fractionation',
          'Fasting Bilirubin repeat (Gilbert worsens with fasting; pathology does not)',
          'Hemolysis workup if indirect bili dominant + low haptoglobin + reticulocytosis (rule out hemolytic anemia)',
        ],
        icd10: 'E80.4',
        what_to_ask_doctor: "My total bilirubin is mildly elevated but my other liver enzymes (ALT, AST, Alk Phos) are normal. Can we get bilirubin fractionation (indirect vs direct) plus a fasting repeat? That confirms whether this is Gilbert syndrome — which is benign and needs no treatment — vs something to investigate further.",
        source: 'deterministic',
      };
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // (Generic borderline-pattern correlation moved to the universal
  // system-drift detector — see detectSystemDrift below the RULES array.
  // The named-pattern rules above remain for specific clinical syndromes
  // with curated evidence + confirmatory workups; the system-drift
  // detector handles every remaining "marker cluster pressed to one
  // side" case automatically, without per-pattern hand-coding.)
  // ════════════════════════════════════════════════════════════════════
];

export function runSuspectedConditionsBackstop(input: {
  age: number | null;
  sex: string | null;
  conditionsLower: string;
  symptomsLower: string;
  medsLower: string;
  labValues: Array<{
    marker_name?: string;
    value?: number | string | null;
    unit?: string | null;
    optimal_flag?: string | null;
    standard_low?: number | string | null;
    standard_high?: number | string | null;
  }>;
  aiSuspectedConditions: Array<{ name?: string }>;
}): SuspectedConditionEntry[] {
  const aiNames = (input.aiSuspectedConditions ?? [])
    .map(c => String(c?.name ?? '').toLowerCase());
  const out: SuspectedConditionEntry[] = [];
  // Phase 1 — named clinical pattern rules (NAFLD, PCOS, OSA, Hashimoto's,
  // T2D-range, Iron Deficiency Anemia, etc.). High-curated content with
  // specific confirmatory workups and ICD-10 codes.
  for (const rule of RULES) {
    if (rule.skipIfDx.some(k => hasCondition(input.conditionsLower, k))) continue;
    // alreadyRaisedIf checks BOTH AI-emitted names AND deterministic
    // rule outputs that already fired this run. Without the second
    // check, two rules with overlapping coverage (e.g., hemochromatosis
    // + hereditary_hemochromatosis, both ICD E83.110) both fire and
    // produce duplicate condition cards. Fixed 2026-05-12-26.
    const priorNames = out.map(o => o.name.toLowerCase());
    const priorKeys = out.map(o => o.key?.toLowerCase()).filter(Boolean) as string[];
    if (rule.alreadyRaisedIf.some(re => aiNames.some(n => re.test(n)))) continue;
    if (rule.alreadyRaisedIf.some(re => priorNames.some(n => re.test(n)))) continue;
    // Also suppress if a prior rule shares the same ICD-10 within this run
    // (catches cases where alreadyRaisedIf regex doesn't catch the synonym).
    const entry = rule.detect({
      age: input.age,
      sex: input.sex,
      conditionsLower: input.conditionsLower,
      symptomsLower: input.symptomsLower,
      medsLower: input.medsLower,
      labValues: input.labValues,
      aiSuspectedNamesLower: aiNames,
    });
    if (!entry) continue;
    // ICD-10 dedup — same ICD already fired this run = skip.
    if (entry.icd10 && out.some(o => o.icd10 === entry.icd10)) continue;
    out.push({ ...entry, key: rule.key });
  }

  // Phase 2 — universal system-drift detector. Runs once across all
  // body systems defined in markerSystems.ts. For each system with
  // ≥ 2 markers pressed to the same side of the lab's reference range,
  // emits ONE generic "Early {system} drift" card. No per-pattern
  // hand-coding required.
  //
  // Dedup: if a Phase-1 named rule already covered this system (e.g.,
  // NAFLD covers 'liver', PCOS covers 'female_hormone', Iron-Deficiency-
  // Anemia covers 'iron_hematology'), the system-drift card is
  // suppressed for that system. The named rules win because their
  // content is more specific.
  const driftEntries = detectSystemDrift({
    age: input.age,
    sex: input.sex,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    medsLower: input.medsLower,
    labValues: input.labValues,
    alreadyFiredKeys: out.map(e => e.key ?? ''),
    aiSuspectedNamesLower: aiNames,
  });
  out.push(...driftEntries);

  return out;
}

// ──────────────────────────────────────────────────────────────────────
// UNIVERSAL SYSTEM-DRIFT DETECTOR
// ──────────────────────────────────────────────────────────────────────
// One detection routine, no per-pattern rules. For each body system in
// markerSystems.ts, classify every marker against the lab's own
// reference range. If 2+ markers in the same system are pressed to the
// same side (high or low), emit a generic "Early {system} drift" card.
//
// Universal coverage: NEW marker added to the registry → automatically
// participates. NEW system added → automatically gets a card. The
// detection routine itself never changes.
//
// Cards intentionally use generic "early drift / worth tracking"
// framing rather than attempting to name a specific condition. Specific
// named conditions are covered by the Phase-1 named-pattern rules
// (NAFLD, PCOS, OSA, Hashimoto's, etc.) when their full evidence set
// matches. The system-drift card is the safety net for the long tail.

/** Map from system id → list of named-pattern rule keys that already
 *  cover that system. If any of these keys already fired for the
 *  patient, the generic system-drift card for that system is suppressed
 *  to avoid duplicate cards.
 *
 *  Adding a new named-pattern rule? Map its key to its system here.
 *  Universal: the system-drift detector itself doesn't need to change. */
const SYSTEM_NAMED_RULE_DEDUP: Record<string, string[]> = {
  liver:               ['nafld', 'hepatic_stress_pattern'],
  kidney:              ['ckd_pattern'],
  glucose_metabolism:  ['t2d_range', 'prediabetes_range', 'insulin_resistance_dyslipidemia'],
  lipid:               ['ldl_high_for_age', 'particle_pattern_atherogenic', 'inflammation_cv_amplifier', 'hypercholesterolemia_pattern', 'familial_hypercholesterolemia'],
  thyroid:             ['hashimoto_or_hypothyroid', 'subclinical_hypothyroidism', 'hyperthyroidism_rule_out_graves'],
  iron_hematology:     ['iron_deficiency_anemia', 'hemoconcentration_dehydration', 'b12_deficiency', 'hemochromatosis', 'early_hypochromic_pattern'],
  adrenal:             ['cushing_syndrome_workup', 'adrenal_insufficiency', 'primary_aldosteronism', 'pheochromocytoma_workup'],
  parathyroid_calcium: ['primary_hyperparathyroidism'],
  vitamin_d:           ['vitamin_d_deficiency'],
  inflammation:        ['inflammation_cv_amplifier', 'pmr_age_50plus'],
  b_vitamin:           ['b12_deficiency'],
  male_hormone:        ['low_t_male'],
  female_hormone:      ['pcos', 'postmenopausal_pattern'],
};

interface SystemDriftCtx {
  age: number | null;
  sex: string | null;
  conditionsLower: string;
  symptomsLower: string;
  medsLower: string;
  labValues: Array<{
    marker_name?: string;
    value?: number | string | null;
    unit?: string | null;
    optimal_flag?: string | null;
    standard_low?: number | string | null;
    standard_high?: number | string | null;
  }>;
  alreadyFiredKeys: string[];
  aiSuspectedNamesLower: string[];
}

function detectSystemDrift(ctx: SystemDriftCtx): SuspectedConditionEntry[] {
  const out: SuspectedConditionEntry[] = [];

  // Patient sex used for the sex-gate check below. Normalize once: any
  // non-'male'/'female' answer (other / prefer-not-to-say / null) is
  // treated as unknown, which disqualifies BOTH gated systems.
  const sexLc = String(ctx.sex ?? '').trim().toLowerCase();
  const patientSex: 'male' | 'female' | null =
    sexLc === 'male' || sexLc === 'm' ? 'male' :
    sexLc === 'female' || sexLc === 'f' ? 'female' : null;

  for (const sys of MARKER_SYSTEMS) {
    // Sex-gate: a system tagged with sexGate fires ONLY for matching
    // biological sex. Without this, the male and female hormonal axes
    // both fire on the same patient because they share Estradiol, LH,
    // FSH, Prolactin, Testosterone, SHBG. Marisa Sirkin (27F) saw a
    // "Male hormonal axis — critical" card before this gate existed.
    // Patients with unknown sex skip BOTH gated systems — we do not
    // guess.
    if (sys.sexGate && sys.sexGate !== patientSex) continue;

    // Skip this system if a named-pattern rule already covered it.
    const dedupKeys = SYSTEM_NAMED_RULE_DEDUP[sys.system] ?? [];
    const alreadyCovered = dedupKeys.some(k => ctx.alreadyFiredKeys.includes(k));
    if (alreadyCovered) continue;

    // Skip if AI already raised something for this system (loose match
    // on the system label).
    const aiCoversSystem = ctx.aiSuspectedNamesLower.some(n =>
      n.includes(sys.system.replace(/_/g, ' ')) || n.includes(sys.label.toLowerCase()),
    );
    if (aiCoversSystem) continue;

    // Find every marker in this system that has a measurable value AND
    // a usable reference range, classify each against borderline zones.
    const classified = ctx.labValues
      .filter(v => sys.markers.some(re => re.test(String(v.marker_name ?? ''))))
      .map(v => {
        const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
        if (!Number.isFinite(num)) return null;
        const r = detectBorderlineZone({
          marker_name: String(v.marker_name ?? ''),
          value: num,
          standard_low: v.standard_low,
          standard_high: v.standard_high,
        });
        return r.zone === 'unknown' ? null : { marker: String(v.marker_name ?? ''), value: num, zone: r.zone };
      })
      .filter((x): x is { marker: string; value: number; zone: BorderlineZone } => x !== null);

    const highSide = classified.filter(c => c.zone === 'borderline_high' || c.zone === 'out_high');
    const lowSide  = classified.filter(c => c.zone === 'borderline_low'  || c.zone === 'out_low');

    // Need ≥ 2 markers on the SAME side to emit a system-level drift card.
    // A single marker drifting alone fires as an outlier on the lab card,
    // not as a system-level pattern.
    let direction: 'high' | 'low' | null = null;
    let driftMarkers: typeof classified = [];
    if (highSide.length >= 2 && highSide.length >= lowSide.length) {
      direction = 'high';
      driftMarkers = highSide;
    } else if (lowSide.length >= 2) {
      direction = 'low';
      driftMarkers = lowSide;
    }
    if (!direction) continue;

    // Fire on ≥ 2 markers on the same side regardless of borderline vs
    // out-of-range. Earlier draft required at least one borderline marker
    // to avoid "redundancy" with the outlier list — but for users with
    // already-diagnosed conditions (T2D, NAFLD, etc.) the named-pattern
    // rules skip via skipIfDx, leaving them with NO system-level summary
    // even when their A1c is 7.9 and glucose is 138. The system-drift
    // card is still useful for that population: "your blood-sugar markers
    // are above range — here's the workup to discuss with your doctor."

    const ev = driftMarkers
      .map(m => `${m.marker} ${m.value} (${m.zone === 'out_high' ? 'above range' : m.zone === 'out_low' ? 'below range' : direction === 'high' ? 'borderline-high' : 'borderline-low'})`)
      .join(', ');

    // Naming reflects severity. If most markers are out-of-range,
    // headline as "above range" / "below range." If most are still
    // borderline, headline as "pressed to the edge of normal range."
    const outOfRangeCount = driftMarkers.filter(m => m.zone === 'out_high' || m.zone === 'out_low').length;
    const isOvertlyOut = outOfRangeCount >= driftMarkers.length / 2;
    const directionWordOvert = direction === 'high' ? 'above range' : 'below range';
    const directionWordEdge  = direction === 'high' ? 'pressed to the high end of normal range' : 'pressed to the low end of normal range';
    const headlineDir = isOvertlyOut ? directionWordOvert : directionWordEdge;
    const evidenceTail = isOvertlyOut
      ? `${driftMarkers.length} markers in this system are outside the lab's own reference range — actionable signal worth bringing to your doctor.`
      : `${driftMarkers.length} markers in this system are pressed to the edge of the lab's own reference range. ${sys.systemRationale} Caught while still inside normal range, this is the easiest window to act on.`;
    // Confidence: high when overtly out-of-range, moderate when borderline.
    const confidence: 'high' | 'moderate' = isOvertlyOut ? 'high' : 'moderate';

    out.push({
      key: `system_drift_${sys.system}_${direction}`,
      name: `${sys.label} — multiple markers ${headlineDir}`,
      category: sys.system as SuspectedConditionEntry['category'],
      confidence,
      evidence: `${ev}. ${evidenceTail}`,
      confirmatory_tests: sys.confirmatoryTests,
      icd10: sys.icd10,
      what_to_ask_doctor: sys.questionForDoctor,
      source: 'deterministic',
    });
  }

  return out;
}
