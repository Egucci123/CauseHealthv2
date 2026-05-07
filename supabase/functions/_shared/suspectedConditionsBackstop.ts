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

export interface SuspectedConditionEntry {
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
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>;
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
        evidence: `${clues}. Every blood component reads high because plasma volume is low — classic hemoconcentration. Albumin is the keystone marker (it concentrates, doesn\'t physiologically rise). Statistically much more common than absolute erythrocytosis in a fit adult.`,
        confirmatory_tests: [
          'Hydration trial (3L water/day + electrolytes) for 14 days',
          'Repeat CBC + albumin after trial',
          'Urine specific gravity (random sample)',
        ],
        icd10: 'E86.0',
        what_to_ask_doctor: "My albumin, hemoglobin, and hematocrit are all elevated together — could this be hemoconcentration from underhydration rather than a blood disorder? Can we do a 2-week hydration trial and recheck before more invasive workup?",
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
          what_to_ask_doctor: "My TPO antibodies are positive — that's diagnostic for Hashimoto's autoimmune thyroiditis. Can we discuss treatment and monitoring?",
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
          what_to_ask_doctor: "My thyroglobulin antibodies are positive — can we run TPO antibodies to confirm autoimmune thyroid disease?",
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
          what_to_ask_doctor: "My TSH is in the overt hypothyroid range — can we confirm with TPO antibodies and start treatment?",
          source: 'deterministic',
        };
      }

      // ── Trigger D: Subclinical hypothyroid + broader symptom cluster ──
      // Hypothyroidism manifests across MANY symptoms, not just 3. Universal
      // symptom net: fatigue, brain fog, weight gain, hair loss, cold,
      // depression/mood, joint pain, dry skin, slow metabolism, memory.
      const fatigue = symptom(ctx.symptomsLower, [/fatigue/i, /tired/i, /low energy/i, /afternoon (energy )?crash/i]);
      const brainFog = symptom(ctx.symptomsLower, [/brain fog/i, /memory/i, /forget|concentr|focus/i]);
      const weightGain = symptom(ctx.symptomsLower, [/weight gain/i, /can'?t lose weight/i, /slow metabolism/i]);
      const hairLoss = symptom(ctx.symptomsLower, [/hair (loss|thin|fall)/i]);
      const cold = symptom(ctx.symptomsLower, [/cold (hand|feet|intoler)/i]);
      const moodIssues = symptom(ctx.symptomsLower, [/anxiety/i, /depress|low mood|mood swing/i]);
      const symptomCount = [fatigue, brainFog, weightGain, hairLoss, cold, moodIssues].filter(Boolean).length;
      // Threshold tiered to symptom count to avoid over-flagging: at TSH 2.0–2.5
      // we need 3+ symptoms; at TSH ≥ 2.5 we need only 2+. Functional optimal
      // is < 2.0; anyone above that with multiple hypothyroid symptoms gets
      // the conversation started.
      const tshSubclinicalLow = tsh.value >= 2.0 && tsh.value < 2.5 && symptomCount >= 3;
      const tshSubclinicalHigh = tsh.value >= 2.5 && symptomCount >= 2;
      if (tshSubclinicalLow || tshSubclinicalHigh) {
        const matched = [
          fatigue ? 'fatigue' : null,
          brainFog ? 'brain fog/memory' : null,
          weightGain ? 'weight gain' : null,
          hairLoss ? 'hair loss' : null,
          cold ? 'cold intolerance' : null,
          moodIssues ? 'mood symptoms' : null,
        ].filter(Boolean).join(', ');
        return {
          name: "Subclinical Hashimoto's / Hypothyroidism",
          category: 'endocrine',
          confidence: tsh.value >= 4.5 ? 'high' : 'moderate',
          evidence: `TSH ${tsh.value} mIU/L (subclinical range) + ${symptomCount} hypothyroid-pattern symptoms (${matched}).`,
          confirmatory_tests: ['TPO Antibodies', 'Thyroglobulin Antibodies', 'Free T4', 'Free T3', 'Reverse T3'],
          icd10: 'E06.3',
          what_to_ask_doctor: "My TSH is elevated and I have multiple hypothyroid symptoms — can we run TPO and Tg antibodies to rule out Hashimoto's?",
          source: 'deterministic',
        };
      }
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
          what_to_ask_doctor: "My androgen markers and cycle pattern fit PCOS — can we run a complete androgen panel + fasting insulin and consider a pelvic ultrasound?",
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
          what_to_ask_doctor: "My A1c/glucose is in the diabetic range — can we confirm with a repeat draw and start a treatment plan? I'd also like baseline kidney (UACR) and eye-exam referrals.",
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
          what_to_ask_doctor: "My glucose markers are in the prediabetic range — can we add fasting insulin + HOMA-IR and discuss intensive lifestyle vs metformin?",
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
      const alt = mark(ctx.labValues, [/^alt$/i, /^sgpt/i]);
      const ast = mark(ctx.labValues, [/^ast$/i, /^sgot/i]);
      const ggt = mark(ctx.labValues, [/^ggt\b/i]);
      const tg = mark(ctx.labValues, [/^triglyc/i]);
      const a1c = mark(ctx.labValues, [/^hemoglobin a1c/i, /^a1c\b/i]);
      const altHigh = alt && alt.value > 35;
      const tgHigh = tg && tg.value > 150;
      const irPattern = (a1c && a1c.value >= 5.7) || tgHigh;
      if (altHigh && irPattern) {
        const ev: string[] = [`ALT ${alt!.value}`];
        if (ast && ast.value > 35) ev.push(`AST ${ast.value}`);
        if (ggt && ggt.value > 30) ev.push(`GGT ${ggt.value}`);
        if (tgHigh) ev.push(`TG ${tg!.value}`);
        if (a1c && a1c.value >= 5.7) ev.push(`A1c ${a1c.value}%`);
        return {
          name: 'NAFLD (Non-alcoholic Fatty Liver Disease)',
          category: 'gi',
          confidence: 'moderate',
          evidence: `Liver enzymes elevated alongside insulin-resistance markers: ${ev.join(', ')}.`,
          confirmatory_tests: ['Liver Ultrasound', 'GGT', 'Fasting Insulin + HOMA-IR', 'FibroScan if available'],
          icd10: 'K76.0',
          what_to_ask_doctor: "My liver enzymes are elevated and I have insulin-resistance markers — can we get a liver ultrasound (or FibroScan) to rule out fatty liver?",
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
          what_to_ask_doctor: "I have iron deficiency anemia — can we run a full iron panel, retic count, and rule out GI blood loss? (colonoscopy if 45+ or family hx)",
          source: 'deterministic',
        };
      }
      return null;
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
          what_to_ask_doctor: "My B12 markers and pattern fit a deficiency — can we run MMA, homocysteine, and intrinsic factor antibodies to rule out pernicious anemia?",
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
          what_to_ask_doctor: "My ferritin and transferrin saturation are both high — can we order HFE gene testing to rule out hereditary hemochromatosis?",
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
      const rbc = mark(ctx.labValues, [/^red blood cell/i, /^rbc\b/i]);
      const hct = mark(ctx.labValues, [/^hematocrit/i, /^hct\b/i]);
      const a1c = mark(ctx.labValues, [/^hemoglobin a1c/i, /^a1c\b/i]);
      const polyPattern = (rbc && rbc.flag.includes('high')) || (hct && hct.value > 48);
      const sleepSx = symptom(ctx.symptomsLower, [/snor/i, /waking (during|in the|at) night/i, /unrefreshing sleep/i, /daytime sleep/i]);
      const weightSx = symptom(ctx.symptomsLower, [/weight gain/i, /obese/i]);
      const irPattern = a1c && a1c.value >= 5.6;
      if (polyPattern && (sleepSx || weightSx || irPattern)) {
        return {
          name: 'Obstructive Sleep Apnea (OSA)',
          category: 'respiratory',
          confidence: 'moderate',
          evidence: `Polycythemia + ${sleepSx ? 'sleep symptoms, ' : ''}${weightSx ? 'weight, ' : ''}${irPattern ? `A1c ${a1c!.value}%` : ''} — classic OSA signature.`,
          confirmatory_tests: ['STOP-BANG questionnaire', 'Home sleep study (HSAT) or in-lab polysomnography'],
          icd10: 'G47.30',
          what_to_ask_doctor: "My blood-cell pattern + sleep symptoms fit obstructive sleep apnea — can we order a home sleep study?",
          source: 'deterministic',
        };
      }
      return null;
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
          what_to_ask_doctor: "My FSH is in the postmenopausal range — can we discuss HRT options, bone-density screening, and the cardiovascular implications of estrogen loss?",
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
          what_to_ask_doctor: "My total testosterone is low — can we run free T, SHBG, LH/FSH, and prolactin to figure out if this is primary or central, and discuss whether TRT or treating root cause makes sense?",
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
          what_to_ask_doctor: "My vitamin D is severely low — can we start high-dose D3 (5000 IU+ daily) and recheck in 8 weeks?",
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
          what_to_ask_doctor: "My LDL particle pattern is plaque-forming even though my standard cholesterol numbers look OK — can we get ApoB, Lp(a), and a coronary calcium score?",
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
          what_to_ask_doctor: "My LDL is very high for my age — can we discuss family history of high cholesterol, get ApoB and Lp(a), and consider lipid genetic testing to rule out familial hypercholesterolemia?",
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
          what_to_ask_doctor: "I'm over 50 with shoulder/hip stiffness and elevated inflammation markers — can we rule out polymyalgia rheumatica and consider rheum referral?",
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
          what_to_ask_doctor: "Several of my markers fit the CRAB criteria pattern — can we run SPEP and serum free light chains to rule out a monoclonal gammopathy?",
          source: 'deterministic',
        };
      }
      return null;
    },
  },
];

export function runSuspectedConditionsBackstop(input: {
  age: number | null;
  sex: string | null;
  conditionsLower: string;
  symptomsLower: string;
  medsLower: string;
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>;
  aiSuspectedConditions: Array<{ name?: string }>;
}): SuspectedConditionEntry[] {
  const aiNames = (input.aiSuspectedConditions ?? [])
    .map(c => String(c?.name ?? '').toLowerCase());
  const out: SuspectedConditionEntry[] = [];
  for (const rule of RULES) {
    // Skip if user has the dx
    if (rule.skipIfDx.some(k => hasCondition(input.conditionsLower, k))) continue;
    // Skip if AI already raised it
    if (rule.alreadyRaisedIf.some(re => aiNames.some(n => re.test(n)))) continue;
    // Run detector
    const entry = rule.detect({
      age: input.age,
      sex: input.sex,
      conditionsLower: input.conditionsLower,
      symptomsLower: input.symptomsLower,
      medsLower: input.medsLower,
      labValues: input.labValues,
      aiSuspectedNamesLower: aiNames,
    });
    if (entry) out.push(entry);
  }
  return out;
}
