// supabase/functions/_shared/testInjectors.ts
//
// UNIVERSAL TEST PAIRING RULES
// ============================
// Same logic shipped from generate-doctor-prep (tests_to_request) and
// generate-wellness-plan (retest_timeline) so they always produce identical
// lists. Each rule fires when a clinical pattern is detected in the
// patient's labs / symptoms / medications / diagnosed conditions.
//
// May 2026 refactor: condition / medication detection delegated to canonical
// registries in `_shared/conditionAliases.ts` and `_shared/medicationAliases.ts`.
// NEVER inline a condition or med regex here — add it to the registry.
//
// Phase 1 refactor (2026-05-09): every test name now comes from the
// canonical retestRegistry. No more raw-string drift between AI output,
// injector output, and dedup matchers. `add(key, why, trigger)` looks up
// the canonical name, ICD-10, insurance copy, priority from the registry.
// To add a new universal pairing: add a key to retestRegistry, then call
// add() here with the trigger condition.

import { hasCondition } from './conditionAliases.ts';
import { isOnMed } from './medicationAliases.ts';
import { getRetest } from './retestRegistry.ts';

export interface InjectionContext {
  age: number | null;
  sex: 'male' | 'female' | string | null;
  conditionsLower: string;
  symptomsLower: string;
  labsLower: string;
  medsLower: string;
}

export interface InjectedTest {
  name: string;          // canonical test name from retestRegistry
  whyShort: string;      // 6-15 words
  whyLong: string;       // trigger letter prepended
  icd10: string;
  icd10Description: string;
  priority: 'urgent' | 'high' | 'moderate';
  insuranceNote: string;
}

// Helper: detects the conditions / symptoms / patterns we use repeatedly.
export function buildContextFlags(ctx: InjectionContext) {
  const c = ctx.conditionsLower;
  const s = ctx.symptomsLower;
  const l = ctx.labsLower;
  const m = ctx.medsLower;
  const sex = (ctx.sex ?? '').toLowerCase();
  const age = ctx.age ?? 99;

  return {
    age, sex,
    isMenstruatingFemale: sex === 'female' && age >= 12 && age <= 55,

    // Conditions — delegated to canonical registry.
    hasIBD: hasCondition(c, 'ibd'),
    hasHashimotos: hasCondition(c, 'hashimotos'),
    hasGraves: hasCondition(c, 'graves'),
    hasT2D: hasCondition(c, 't2d'),
    hasPCOS: hasCondition(c, 'pcos'),
    hasHTN: hasCondition(c, 'hypertension'),
    hasCKD: hasCondition(c, 'ckd'),
    hasCAD: hasCondition(c, 'cad'),
    hasLupus: hasCondition(c, 'lupus'),
    hasRA: hasCondition(c, 'ra'),
    hasOsteo: hasCondition(c, 'osteoporosis'),
    hasAutoimmune: hasCondition(c, 'ibd') || hasCondition(c, 'hashimotos') || hasCondition(c, 'graves')
      || hasCondition(c, 'lupus') || hasCondition(c, 'ra') || hasCondition(c, 'psoriasis')
      || hasCondition(c, 'ms') || hasCondition(c, 'celiac') || hasCondition(c, 'sjogrens')
      || hasCondition(c, 'long_covid'),

    // Medications — delegated to canonical registry.
    onMesalamine: isOnMed(m, 'mesalamine_5asa'),
    onMetformin: isOnMed(m, 'metformin'),
    onPPI: isOnMed(m, 'ppi'),
    onStatin: isOnMed(m, 'statin'),
    onSteroid: isOnMed(m, 'steroid_oral'),
    onDiuretic: isOnMed(m, 'diuretic_thiazide') || isOnMed(m, 'diuretic_loop') || isOnMed(m, 'diuretic_potassium_sparing'),
    onThyroidReplacement: isOnMed(m, 'thyroid_replacement'),
    onTRT: isOnMed(m, 'trt'),
    onSSRI: isOnMed(m, 'ssri'),
    onSNRI: isOnMed(m, 'snri'),
    onAnticoagulant: isOnMed(m, 'anticoagulant'),
    onInsulin: isOnMed(m, 'insulin'),
    onGLP1: isOnMed(m, 'glp1'),

    // Symptoms (broader buckets)
    hasJointSymptoms: /\b(joint pain|joint stiffness|arthralg|stiff)/.test(s),
    hasMuscleSymptoms: /\b(muscle|aches|cramp|weakness|myalg)/.test(s),
    hasFatigue: /\b(fatigue|tired|exhaust|low energy|brain fog)/.test(s),
    hasHairLoss: /\bhair (loss|thin|fall)/.test(s),
    hasWeightIssues: /\b(weight gain|weight loss|can'?t lose|slow metab|metabolism)/.test(s),
    hasSleepIssues: /\b(sleep|wak|insomn|snor|restless)/.test(s),
    hasMoodIssues: /\b(depress|mood|anxiet|low mood)/.test(s),
    hasGISymptoms: /\b(bloat|gas|diarrhea|constipation|reflux|heartburn|cramp|nausea|stool)/.test(s),
    hasColdHeatIntolerance: /\b(cold|heat) intoler/.test(s),
    hasLowLibido: /\b(libido|sex(ual)? drive|erect)/.test(s),

    // Lab patterns (parsed from the all-labs string with [LOW/HIGH/CRITICAL] flags)
    altElevated: /\b(alt|sgpt)[^\n]*\[(high|critical_high)/i.test(l),
    astElevated: /\b(ast|sgot)[^\n]*\[(high|critical_high)/i.test(l),
    altDoubled: /\b(alt|sgpt):\s*([5-9]\d|\d{3,})/i.test(l),
    bilirubinElevated: /\bbilirubin[^\n]*\[(high|critical_high)/i.test(l),
    rbcElevated: /\b(rbc|red blood cell)[^\n]*\[(high|critical_high)/i.test(l),
    hctElevated: /\b(hct|hematocrit)[^\n]*\[(high|critical_high)/i.test(l),
    cbcAbnormal: /\b(rbc|hematocrit|hct|hemoglobin|hgb|wbc|white blood|platelet|mcv|mch|rdw)[^\n]*\[(low|high|critical)/i.test(l),
    macrocytic: /\bmcv[^\n]*\[(high|critical_high)/i.test(l),
    microcytic: /\bmcv[^\n]*\[(low|critical_low)/i.test(l),
    tgHigh: /\btriglyceride[^\n]*\[(high|critical_high|watch)/i.test(l),
    glucoseWatch: /\bglucose[^\n]*\[watch\]/i.test(l) || /\b(a1c|hemoglobin a1c)[^\n]*\[(watch|high|critical_high)/i.test(l),
    hdlLow: /\bhdl[^\n]*\[(low|critical_low|watch)/i.test(l),
    ldlHigh: /\bldl[^\n]*\[(high|critical_high)/i.test(l),
    vitaminDLow: /\b(25.?hydroxy.?vitamin d|vitamin d)[^\n]*\[(low|critical_low|watch)/i.test(l),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Universal test pairing engine.
// Returns InjectedTest[] where every entry's `name` is the CANONICAL name
// from retestRegistry. No raw-string construction. Adding a pairing:
//   1. Confirm the canonical key exists in retestRegistry.ts (add if not).
//   2. Add a build() call below with trigger condition + whyShort.
// ──────────────────────────────────────────────────────────────────────
export function buildUniversalTestInjections(ctx: InjectionContext): InjectedTest[] {
  const f = buildContextFlags(ctx);
  const tests: InjectedTest[] = [];

  /** Look up the canonical retest definition and produce an InjectedTest.
   *  Returns null if the key isn't in the registry (shouldn't happen — fail loud). */
  function build(key: string, whyShort: string, trigger: 'a' | 'b' | 'c' | 'd' | 'e'): void {
    const def = getRetest(key);
    if (!def) {
      console.warn(`[testInjectors] Unknown registry key: ${key}`);
      return;
    }
    tests.push({
      name: def.canonical,
      whyShort,
      whyLong: `(${trigger}) ${whyShort}`,
      icd10: def.icd10,
      icd10Description: def.icd10Description,
      priority: def.defaultPriority,
      insuranceNote: def.insuranceNote,
    });
  }

  // ── UNIVERSAL ADULT BASELINE (every adult ≥18) ─────────────────────────
  // Comprehensive panel every adult should be ARMED to ask for. Fires
  // unconditionally so the baseline is never lost to AI discretion or
  // flag-format mismatch. Downstream dedup collapses overlap with
  // AI-generated entries (same canonical name = same dedup key).
  if (f.age >= 18) {
    build('cmp', 'Standard adult baseline — liver, kidney, electrolytes, glucose, calcium', 'd');
    build('cbc', 'Standard adult baseline — red cells, white cells, platelets, inflammation patterns', 'd');
    build('lipid_panel', 'Standard adult cardiovascular risk panel — TC, LDL, HDL, TG, VLDL, non-HDL', 'd');
    build('hba1c', 'Three-month average blood sugar — catches dysglycemia before fasting glucose does', 'd');
    build('hs_crp', 'Systemic inflammation baseline — CV + metabolic risk amplifier', 'd');
    build('vit_d_25oh', 'Vitamin D status — drives mood, immunity, bone, autoimmunity', 'd');
    build('vit_b12_workup', 'Tissue B12 status (Serum B12 + MMA + Homocysteine) — catches functional deficiency', 'd');
    build('folate_workup', 'Tissue folate status (Serum + RBC) — covers mesalamine/methotrexate depletion', 'd');
    build('iron_panel', 'Iron stores + transport — fatigue, hair loss, restless legs driver before Hgb drops', 'd');
    build('ggt', 'Sensitive liver/biliary marker — anchor for ALT/AST', 'd');
    build('thyroid_panel', 'Full thyroid function — TSH alone misses central hypothyroidism + impaired T4→T3 conversion', 'd');
    build('rbc_magnesium', 'Intracellular Mg — sleep, muscle, glucose handling, cardiovascular rhythm', 'd');
    build('lp_a', 'Once-in-lifetime genetic CV risk marker — flags risk a normal lipid panel misses', 'd');
  }

  // ── ApoB on any lipid abnormality OR statin user ──────────────────────
  if (f.tgHigh || f.ldlHigh || f.hdlLow || f.onStatin) {
    build('apob',
      f.onStatin
        ? 'On statin — ApoB measures particle count directly. Target <80 on statin; if higher, dose may be inadequate.'
        : 'Lipid abnormality — ApoB quantifies plaque-forming particle count, better predictor than LDL-C alone.',
      f.onStatin ? 'b' : 'c');
  }

  // ── Liver Ultrasound when ALT >2x normal OR ALT + TG high ─────────────
  if (f.altDoubled || (f.altElevated && f.tgHigh)) {
    build('liver_ultrasound', 'ALT >2x normal or ALT elevated with high triglycerides — non-invasive imaging to rule out fatty liver', 'c');
  }

  // ── CK on every statin user (AHA/ACC monitoring) ──────────────────────
  if (f.onStatin) {
    build('ck_statin_baseline',
      f.hasMuscleSymptoms || f.hasJointSymptoms
        ? 'On statin + muscle/joint symptoms — rules out statin-induced myopathy'
        : 'On statin — routine baseline + 12-week follow-up per AHA/ACC monitoring',
      'b');
  }

  // ── Uric Acid on metabolic syndrome pattern ───────────────────────────
  if (f.tgHigh && (f.glucoseWatch || f.hdlLow)) {
    build('uric_acid', 'Metabolic syndrome pattern — gout risk + cardiovascular risk amplifier', 'c');
  }

  // ── Sleep Apnea Screening on polycythemia + IR/sleep/weight ───────────
  const polycythemiaPattern = f.rbcElevated && f.hctElevated;
  const irPattern = f.tgHigh || f.glucoseWatch;
  if (polycythemiaPattern && (irPattern || f.hasSleepIssues || f.hasWeightIssues)) {
    build('sleep_apnea_screening', 'Elevated RBC + Hct with insulin resistance / sleep / weight pattern — possible obstructive sleep apnea', 'e');
  }

  // ── Macrocytic anemia → B-vitamin escalation ──────────────────────────
  if (f.macrocytic) {
    build('b_vitamin_workup_macrocytic', 'MCV elevated — macrocytic pattern points to B12 or folate deficiency', 'c');
  }

  // ── Microcytic anemia → Hemoglobin Electrophoresis ────────────────────
  if (f.microcytic) {
    build('hgb_electrophoresis', 'MCV low — if iron panel normal, screens for thalassemia trait', 'c');
  }

  // ── PTH + Ionized Ca on Vit D low + bone/joint sx ─────────────────────
  if (f.vitaminDLow && (f.hasOsteo || /\b(bone pain|fracture|joint)/.test(ctx.symptomsLower))) {
    build('pth', 'Vitamin D low + bone/joint symptoms — rules out secondary hyperparathyroidism', 'c');
    build('ionized_calcium', 'Pairs with PTH for hyperparathyroidism workup', 'c');
  }

  // ── Universal male hormonal baseline ──────────────────────────────────
  // Every adult male not on TRT gets the comprehensive panel. Modern
  // endocrinology supports baseline hormonal evaluation for any adult
  // male asking for thorough labs.
  const isAdultMale = f.sex === 'male' && f.age >= 18;
  if (isAdultMale && !f.onTRT) {
    build('testosterone_panel_male', 'Comprehensive male hormonal baseline — Total + Free + Bioavailable + SHBG + Estradiol + LH + FSH', 'd');
  }

  // ── PCOS Panel — adult female with cycle/skin pattern ─────────────────
  const isFemaleAdult = f.sex === 'female' && f.age >= 18;
  const pcosPattern = /\b(irregular cycle|amenorrhea|missed period|acne|hirsut|excess hair|infertility|polycystic)/i.test(ctx.symptomsLower)
    || /\b(pcos|polycystic ovary)\b/i.test(ctx.conditionsLower);
  if (isFemaleAdult && pcosPattern) {
    build('pcos_panel', 'Cycle / acne / hirsutism / infertility cluster — PCOS workup catches androgen excess + insulin-resistance link', 'e');
  }

  // ── Fasting Insulin + HOMA-IR — early metabolic pattern ───────────────
  const tgMatch = ctx.labsLower.match(/\btriglyceride[^\n]*?(\d{2,4})/i);
  const hdlMatch = ctx.labsLower.match(/\bhdl[^\n]*?(\d{2,3})/i);
  const a1cMatch = ctx.labsLower.match(/\b(?:a1c|hba1c)[^\n]*?(\d+\.?\d*)/i);
  const glucoseMatch = ctx.labsLower.match(/\bglucose[^\n]*?(\d{2,3})/i);
  const tgVal = tgMatch ? Number(tgMatch[1]) : null;
  const hdlVal = hdlMatch ? Number(hdlMatch[1]) : null;
  const a1cVal = a1cMatch ? Number(a1cMatch[1]) : null;
  const glucoseVal = glucoseMatch ? Number(glucoseMatch[1]) : null;
  const tgHdlRatio = (tgVal != null && hdlVal != null && hdlVal > 0) ? tgVal / hdlVal : null;
  const earlyMetabolicPattern =
    (tgVal != null && tgVal >= 150) ||
    (a1cVal != null && a1cVal >= 5.4 && a1cVal <= 6.4) ||
    (glucoseVal != null && glucoseVal >= 95 && glucoseVal <= 125) ||
    (tgHdlRatio != null && tgHdlRatio >= 3) ||
    f.hasWeightIssues;
  if (earlyMetabolicPattern) {
    build('fasting_insulin_homa_ir',
      'Early metabolic pattern (elevated TG, watch-tier glucose/A1c, TG/HDL ≥3, or weight resistance) — catches hyperinsulinemia A1c misses; tracks response 4-6 weeks faster than A1c',
      'c');
  }

  // ── Hashimoto's antibodies — TSH borderline + thyroid sx ──────────────
  const tshMatch = ctx.labsLower.match(/\btsh[^\n]*?(\d+\.?\d*)/i);
  const tshValue = tshMatch ? Number(tshMatch[1]) : null;
  const hasThyroidPatternSx = f.hasFatigue || f.hasHairLoss || f.hasWeightIssues || f.hasMoodIssues || f.hasColdHeatIntolerance;
  if (tshValue != null && tshValue >= 2.5 && tshValue <= 10 && hasThyroidPatternSx) {
    build('thyroid_antibodies',
      `TSH ${tshValue} in early-Hashimoto's grey zone (≥2.5) with fatigue / weight / hair / mood symptoms — TPO + Tg Ab catch autoimmune thyroiditis years before TSH crosses 4.5`,
      'e');
  }

  return tests;
}
