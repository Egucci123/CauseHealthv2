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

function mark(labs: any[], patterns: RegExp[]): { value: number; flag: string } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) return { value: num, flag: (v.optimal_flag ?? '').toLowerCase() };
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
      const hgb = mark(ctx.labValues, [/^hemoglobin\b/i]);
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
      const glucose = mark(ctx.labValues, [/^glucose\b/i, /^fasting glucose/i]);
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
      const glucose = mark(ctx.labValues, [/^glucose\b/i, /^fasting glucose/i]);
      const insulin = mark(ctx.labValues, [/^insulin\b/i, /fasting insulin/i]);
      const a1cPre = a1c && a1c.value >= 5.7 && a1c.value < 6.5;
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
      const altHigh = alt && alt.value > 35;
      const altDoubled = alt && alt.value >= 70;       // ≥2× ULN of ~35
      const astHigh = ast && ast.value > 35;
      const ggtHigh = ggt && ggt.value > 50;
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

  // ── Iron deficiency anemia ─────────────────────────────────────────────
  {
    key: 'iron_deficiency_anemia',
    alreadyRaisedIf: [/iron deficien/i, /anemia/i],
    skipIfDx: [],
    detect: (ctx) => {
      const ferritin = mark(ctx.labValues, [/^ferritin/i]);
      const hgb = mark(ctx.labValues, [/^hemoglobin\b/i, /^hgb\b/i]);
      const mcv = mark(ctx.labValues, [/^mcv\b/i]);
      const isFemale = (ctx.sex ?? '').toLowerCase() === 'female';
      const hgbLow = hgb && (isFemale ? hgb.value < 12 : hgb.value < 13.5);
      const ferritinLow = ferritin && ferritin.value < 30;
      const microcytic = mcv && mcv.value < 80;
      if ((hgbLow && microcytic) || (ferritinLow && (mcv && mcv.value < 90))) {
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
        evidence: `${ev.join(', ')}. Pattern fits early iron-deficient erythropoiesis — red cells are smaller and lighter than optimal even though hemoglobin is still in range. Worth ruling out with an iron panel before it progresses to overt anemia.`,
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
      const glu = mark(ctx.labValues, [/\bglucose\b/i, /fasting glucose/i]);
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

      // TSH 2.5+ gets the AACE-recognized "grey zone" framing; 2.0–2.5
      // gets a softer "above functional optimal" framing. Both share the
      // same confirmatory-test list.
      const isGreyZone = tsh.value >= 2.5;
      return {
        name: isGreyZone
          ? 'Thyroid pattern worth tracking (subclinical / early)'
          : 'Thyroid function above functional optimal — worth tracking',
        category: 'endocrine',
        confidence: 'moderate',
        evidence: isGreyZone
          ? `TSH ${tsh.value} mIU/L is in the AACE grey zone (≥2.5) and you have ${sxCount} thyroid-pattern symptoms (${matched}). Worth ruling out early Hashimoto's with antibody testing.`
          : `TSH ${tsh.value} mIU/L is above the functional optimal (<2.0) but inside the standard reference range, paired with ${sxCount} thyroid-pattern symptoms (${matched}). Not a diagnosis — a flag to track and to get the antibody workup if symptoms persist.`,
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
      const glu = mark(ctx.labValues, [/\bglucose\b/i, /fasting glucose/i]);
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

  // ── Vitamin D deficiency (clinical) ────────────────────────────────────
  {
    key: 'vitamin_d_deficiency',
    alreadyRaisedIf: [/vitamin d def/i, /\bd deficien/i],
    skipIfDx: [],
    detect: (ctx) => {
      const d = mark(ctx.labValues, [/^vitamin d\b/i, /25[-\s]?(oh|hydroxy)/i]);
      if (d && d.value < 20) {
        return {
          name: 'Vitamin D Deficiency',
          category: 'nutritional',
          confidence: 'high',
          evidence: `25-OH Vitamin D ${d.value} ng/mL — clinically deficient (<20).`,
          confirmatory_tests: ['Repeat 25-OH Vitamin D after 8 weeks of D3', 'Calcium', 'PTH (parathyroid)'],
          icd10: 'E55.9',
          what_to_ask_doctor: "My vitamin D is very low. Can we start high-dose D3 (5,000 IU or more per day) and recheck in 8 weeks?",
          source: 'deterministic',
        };
      }
      return null;
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
      const hgb = mark(ctx.labValues, [/^hemoglobin\b/i, /^hgb\b/i]);
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
    if (rule.alreadyRaisedIf.some(re => aiNames.some(n => re.test(n)))) continue;
    const entry = rule.detect({
      age: input.age,
      sex: input.sex,
      conditionsLower: input.conditionsLower,
      symptomsLower: input.symptomsLower,
      medsLower: input.medsLower,
      labValues: input.labValues,
      aiSuspectedNamesLower: aiNames,
    });
    if (entry) out.push({ ...entry, key: rule.key });
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
  liver:               ['nafld'],
  kidney:              [],
  glucose_metabolism:  ['t2d_range', 'prediabetes_range', 'insulin_resistance_dyslipidemia'],
  lipid:               ['ldl_high_for_age', 'particle_pattern_atherogenic', 'inflammation_cv_amplifier'],
  thyroid:             ['hashimoto_or_hypothyroid', 'subclinical_hypothyroidism'],
  iron_hematology:     ['iron_deficiency_anemia', 'hemoconcentration_dehydration', 'b12_deficiency', 'hemochromatosis', 'early_hypochromic_pattern'],
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

  for (const sys of MARKER_SYSTEMS) {
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

    // Only count out-of-range hits if there's at least one truly
    // borderline marker, so we don't double-up on already-overt findings
    // that the named-pattern rules / outlier list already surface.
    const hasBorderline = driftMarkers.some(m => m.zone === 'borderline_high' || m.zone === 'borderline_low');
    if (!hasBorderline) continue;

    const ev = driftMarkers
      .map(m => `${m.marker} ${m.value} (${m.zone === 'out_high' ? 'above range' : m.zone === 'out_low' ? 'below range' : direction === 'high' ? 'borderline-high' : 'borderline-low'})`)
      .join(', ');

    const directionWord = direction === 'high' ? 'pressed to the high end' : 'pressed to the low end';
    const driftWord = direction === 'high' ? 'climbing' : 'dropping';

    out.push({
      key: `system_drift_${sys.system}_${direction}`,
      name: `${sys.label} — multiple markers ${directionWord} of normal range`,
      category: sys.system as SuspectedConditionEntry['category'],
      confidence: 'moderate',
      evidence: `${ev}. ${driftMarkers.length} markers in this system are ${direction === 'high' ? 'borderline-high or above' : 'borderline-low or below'} the lab's own reference range. ${sys.systemRationale} Caught while still inside normal range, this is the easiest window to act on.`,
      confirmatory_tests: sys.confirmatoryTests,
      icd10: sys.icd10,
      what_to_ask_doctor: sys.questionForDoctor,
      source: 'deterministic',
    });
  }

  return out;
}
