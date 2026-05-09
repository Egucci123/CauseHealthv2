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
  const ageKnown = ctx.age != null;

  return {
    age, sex, ageKnown,
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

// Re-exported so callers can also produce InjectedTest with full
// canonical metadata (used by doctor-prep's tests_to_request loop).
export interface InjectionRequest {
  key: string;
  whyShort: string;
  trigger: 'a' | 'b' | 'c' | 'd' | 'e';
}

/**
 * NEW (Phase 11 fix): Returns the canonical-key list, NOT pre-built
 * InjectedTest objects. The caller uses `pushRetestByKey` from the
 * registry to insert with alias-based dedup (catches "Hemoglobin A1c"
 * vs "HbA1c" vs "A1c" variants automatically). Eliminates the bug
 * where exact-name dedup was failing on near-variants.
 */
export function buildUniversalTestInjectionRequests(ctx: InjectionContext): InjectionRequest[] {
  const f = buildContextFlags(ctx);
  const reqs: InjectionRequest[] = [];
  const add = (key: string, whyShort: string, trigger: 'a' | 'b' | 'c' | 'd' | 'e') => {
    reqs.push({ key, whyShort, trigger });
  };
  applyUniversalRules(f, ctx, add);
  return reqs;
}

// ──────────────────────────────────────────────────────────────────────
// Universal test pairing engine — legacy InjectedTest[] return.
// Kept for backward-compat with doctor-prep until that's also refactored.
// Returns InjectedTest[] where every entry's `name` is the CANONICAL name
// from retestRegistry.
// ──────────────────────────────────────────────────────────────────────
export function buildUniversalTestInjections(ctx: InjectionContext): InjectedTest[] {
  const f = buildContextFlags(ctx);
  const tests: InjectedTest[] = [];

  /** Look up the canonical retest definition and produce an InjectedTest. */
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
  applyUniversalRules(f, ctx, build);
  return tests;
}

// ──────────────────────────────────────────────────────────────────────
// SHARED RULE ENGINE — both `buildUniversalTestInjections` (legacy
// InjectedTest[]) and `buildUniversalTestInjectionRequests` (canonical
// keys for alias-based dedup) call this with their own `add` callback.
// Edit rules HERE, never duplicate them between the two functions.
// ──────────────────────────────────────────────────────────────────────
type AddFn = (key: string, whyShort: string, trigger: 'a' | 'b' | 'c' | 'd' | 'e') => void;
type Flags = ReturnType<typeof buildContextFlags>;

function applyUniversalRules(f: Flags, ctx: InjectionContext, add: AddFn): void {
  // ── UNIVERSAL ADULT BASELINE (every adult ≥18) ─────────────────────────
  // Comprehensive panel every adult should be ARMED to ask for. Fires
  // unconditionally so the baseline is never lost to AI discretion or
  // flag-format mismatch. Downstream dedup collapses overlap with
  // AI-generated entries (same canonical name = same dedup key).
  if (f.age >= 18) {
    add('cmp', 'Standard adult baseline — liver, kidney, electrolytes, glucose, calcium', 'd');
    add('cbc', 'Standard adult baseline — red cells, white cells, platelets, inflammation patterns', 'd');
    add('lipid_panel', 'Standard adult cardiovascular risk panel — TC, LDL, HDL, TG, VLDL, non-HDL', 'd');
    add('hba1c', 'Three-month average blood sugar — catches dysglycemia before fasting glucose does', 'd');
    add('hs_crp', 'Systemic inflammation baseline — CV + metabolic risk amplifier', 'd');
    add('vit_d_25oh', 'Vitamin D status — drives mood, immunity, bone, autoimmunity', 'd');
    add('vit_b12_workup', 'Tissue B12 status (Serum B12 + MMA + Homocysteine) — catches functional deficiency', 'd');
    add('folate_workup', 'Tissue folate status (Serum + RBC) — covers mesalamine/methotrexate depletion', 'd');
    add('iron_panel', 'Iron stores + transport — fatigue, hair loss, restless legs driver before Hgb drops', 'd');
    add('ggt', 'Sensitive liver/biliary marker — anchor for ALT/AST', 'd');
    add('thyroid_panel', 'Full thyroid function — TSH alone misses central hypothyroidism + impaired T4→T3 conversion', 'd');
    add('rbc_magnesium', 'Intracellular Mg — sleep, muscle, glucose handling, cardiovascular rhythm', 'd');
    add('lp_a', 'Once-in-lifetime genetic CV risk marker — flags risk a normal lipid panel misses', 'd');
  }

  // ── IBD → Fecal Calprotectin (disease-activity monitoring) ────────────
  if (f.hasIBD) {
    add('fecal_calprotectin', 'IBD disease-activity marker — quarterly monitoring catches flares before symptoms', 'e');
  }

  // ── Celiac serology if GI symptoms with no IBD diagnosis ──────────────
  if (f.hasGISymptoms && !f.hasIBD) {
    add('celiac_serology', 'Persistent GI symptoms without IBD dx — rules out celiac before workup escalates', 'a');
  }

  // ── Hashimoto's: thyroid antibodies confirm autoimmune basis ──────────
  if (f.hasHashimotos) {
    add('thyroid_antibodies', 'Diagnosed Hashimotos — TPO + Tg Ab quantify autoimmune burden, track treatment response', 'b');
  }

  // ── T2D: A1c (already in baseline), UACR for kidney, fasting insulin ──
  if (f.hasT2D) {
    add('uacr', 'Diagnosed T2D — UACR is the earliest sign of diabetic kidney disease (microalbuminuria)', 'b');
  }

  // ── HTN: UACR + extended kidney workup ─────────────────────────────────
  if (f.hasHTN) {
    add('uacr', 'Diagnosed hypertension — UACR catches early hypertensive nephropathy before creatinine rises', 'b');
  }

  // ── CKD: cystatin C, UACR, PTH ────────────────────────────────────────
  if (f.hasCKD) {
    add('cystatin_c_egfr', 'Diagnosed CKD — cystatin-C-based eGFR is more accurate than creatinine in muscle-low patients', 'b');
    add('uacr', 'Diagnosed CKD — quarterly UACR tracks proteinuria progression', 'b');
    add('pth', 'CKD bone-mineral disorder — PTH rises before calcium/phosphate change', 'b');
  }

  // ── Lupus / autoimmune cluster: ANA reflex, ESR, complement ───────────
  if (f.hasLupus) {
    add('ana_reflex', 'Diagnosed lupus — ANA reflex titer + dsDNA Ab track flare activity', 'b');
    add('esr', 'Lupus / autoimmune monitoring — ESR pairs with hs-CRP for inflammatory burden', 'b');
  }

  // ── RA: anti-CCP + RF + ESR ───────────────────────────────────────────
  if (f.hasRA) {
    add('rf_anti_ccp', 'Diagnosed RA — anti-CCP + RF inform prognosis and biologic eligibility', 'b');
    add('esr', 'RA monitoring — ESR + hs-CRP track joint-inflammation activity', 'b');
  }

  // ── Osteoporosis: 25-OH D + Ca + PTH + CTX-telopeptide ────────────────
  if (f.hasOsteo) {
    add('ctx_telopeptide', 'Diagnosed osteoporosis — CTX bone-resorption marker tracks treatment response faster than DEXA', 'b');
    add('pth', 'Osteoporosis workup — secondary hyperparathyroidism is a missed reversible cause', 'b');
    add('ionized_calcium', 'Pairs with PTH for parathyroid evaluation in bone-density loss', 'b');
  }

  // ── CAD: ApoB (already covered above), CAC, Lp(a) (in baseline) ───────
  if (f.hasCAD) {
    add('cac_score', 'Diagnosed CAD — CAC quantifies calcified plaque burden and informs statin intensity', 'b');
  }

  // ── Adult male age 45+: PSA baseline ──────────────────────────────────
  // Require KNOWN age — never fire on unknown age (formerly defaulted to
  // 99 and triggered for every male). Only fire when DOB is set.
  if (f.ageKnown && f.sex === 'male' && f.age >= 45) {
    add('psa_if_male_45', 'Adult male ≥45 — PSA baseline screens for prostate disease per AUA shared-decision guidelines', 'd');
  }

  // ── Adult female age 40+: mammogram reminder (imaging, not blood) ─────
  if (f.ageKnown && f.sex === 'female' && f.age >= 40) {
    add('mammogram_if_due', 'Adult female ≥40 — annual mammogram per ACS / USPSTF', 'd');
  }

  // ── Long-term oral steroid: DEXA + Vit D + bone markers ───────────────
  if (f.onSteroid) {
    add('dexa_if_long_term', 'On chronic oral steroid — DEXA every 1–2 yr per ACR glucocorticoid-induced osteoporosis guideline', 'b');
  }

  // ── Warfarin: INR (drug-required monitoring) ──────────────────────────
  if (f.onAnticoagulant) {
    add('inr_if_warfarin', 'On anticoagulant — INR monitoring frequency dictated by drug class', 'b');
  }

  // ── ApoB on any lipid abnormality OR statin user ──────────────────────
  if (f.tgHigh || f.ldlHigh || f.hdlLow || f.onStatin) {
    add('apob',
      f.onStatin
        ? 'On statin — ApoB measures particle count directly. Target <80 on statin; if higher, dose may be inadequate.'
        : 'Lipid abnormality — ApoB quantifies plaque-forming particle count, better predictor than LDL-C alone.',
      f.onStatin ? 'b' : 'c');
  }

  // ── Liver Ultrasound when ALT >2x normal OR ALT + TG high ─────────────
  if (f.altDoubled || (f.altElevated && f.tgHigh)) {
    add('liver_ultrasound', 'ALT >2x normal or ALT elevated with high triglycerides — non-invasive imaging to rule out fatty liver', 'c');
  }

  // ── CK on every statin user (AHA/ACC monitoring) ──────────────────────
  if (f.onStatin) {
    add('ck_statin_baseline',
      f.hasMuscleSymptoms || f.hasJointSymptoms
        ? 'On statin + muscle/joint symptoms — rules out statin-induced myopathy'
        : 'On statin — routine baseline + 12-week follow-up per AHA/ACC monitoring',
      'b');
  }

  // ── Uric Acid on metabolic syndrome pattern ───────────────────────────
  if (f.tgHigh && (f.glucoseWatch || f.hdlLow)) {
    add('uric_acid', 'Metabolic syndrome pattern — gout risk + cardiovascular risk amplifier', 'c');
  }

  // ── Sleep Apnea Screening on polycythemia + IR/sleep/weight ───────────
  const polycythemiaPattern = f.rbcElevated && f.hctElevated;
  const irPattern = f.tgHigh || f.glucoseWatch;
  if (polycythemiaPattern && (irPattern || f.hasSleepIssues || f.hasWeightIssues)) {
    add('sleep_apnea_screening', 'Elevated RBC + Hct with insulin resistance / sleep / weight pattern — possible obstructive sleep apnea', 'e');
  }

  // ── Macrocytic anemia → B-vitamin escalation ──────────────────────────
  if (f.macrocytic) {
    add('b_vitamin_workup_macrocytic', 'MCV elevated — macrocytic pattern points to B12 or folate deficiency', 'c');
  }

  // ── Microcytic anemia → Hemoglobin Electrophoresis ────────────────────
  if (f.microcytic) {
    add('hgb_electrophoresis', 'MCV low — if iron panel normal, screens for thalassemia trait', 'c');
  }

  // ── PTH + Ionized Ca — STRICT gating (universal) ──────────────────────
  // Only fire when there's real reason to suspect secondary
  // hyperparathyroidism, NOT just generic joint stiffness in a Vit-D-low
  // patient (which is more often arthralgia from the underlying condition
  // than HPT). Triggers:
  //   1. Severely deficient Vit D (<20) — repletion alone may not normalize Ca/P
  //   2. Diagnosed osteoporosis / osteopenia (bone disease workup)
  //   3. Specific bone-pain or fracture history (not just stiffness)
  // "Joint stiffness" alone — common in autoimmune disease, doesn't warrant HPT workup.
  const vitDSeverelyLow = /\b(25.?hydroxy|vitamin d).*?:\s*(\d+\.?\d*)/i.test(ctx.labsLower)
    && (() => {
      const m = ctx.labsLower.match(/\b(?:25.?hydroxy|vitamin d).*?:\s*(\d+\.?\d*)/i);
      return m ? Number(m[1]) < 20 : false;
    })();
  const hasBonePainOrFracture = /\b(bone pain|fracture|osteopenia|low bone density|stress fracture)\b/i.test(ctx.symptomsLower)
    || /\b(bone pain|fracture|osteopenia)\b/i.test(ctx.conditionsLower);
  if (f.hasOsteo || (f.vitaminDLow && (vitDSeverelyLow || hasBonePainOrFracture))) {
    add('pth', 'Vit D severely low (<20) or diagnosed bone disease — rules out secondary hyperparathyroidism', 'c');
    add('ionized_calcium', 'Pairs with PTH for hyperparathyroidism workup', 'c');
  }

  // ── Universal male hormonal baseline ──────────────────────────────────
  // Every adult male not on TRT gets the comprehensive panel. Modern
  // endocrinology supports baseline hormonal evaluation for any adult
  // male asking for thorough labs.
  const isAdultMale = f.sex === 'male' && f.age >= 18;
  if (isAdultMale && !f.onTRT) {
    add('testosterone_panel_male', 'Comprehensive male hormonal baseline — Total + Free + Bioavailable + SHBG + Estradiol + LH + FSH', 'd');
  }

  // ── PCOS Panel — adult female with cycle/skin pattern ─────────────────
  const isFemaleAdult = f.sex === 'female' && f.age >= 18;
  const pcosPattern = /\b(irregular cycle|amenorrhea|missed period|acne|hirsut|excess hair|infertility|polycystic)/i.test(ctx.symptomsLower)
    || /\b(pcos|polycystic ovary)\b/i.test(ctx.conditionsLower);
  if (isFemaleAdult && pcosPattern) {
    add('pcos_panel', 'Cycle / acne / hirsutism / infertility cluster — PCOS workup catches androgen excess + insulin-resistance link', 'e');
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
    add('fasting_insulin_homa_ir',
      'Early metabolic pattern (elevated TG, watch-tier glucose/A1c, TG/HDL ≥3, or weight resistance) — catches hyperinsulinemia A1c misses; tracks response 4-6 weeks faster than A1c',
      'c');
  }

  // ── Hashimoto's antibodies — TSH borderline + thyroid sx ──────────────
  const tshMatch = ctx.labsLower.match(/\btsh[^\n]*?(\d+\.?\d*)/i);
  const tshValue = tshMatch ? Number(tshMatch[1]) : null;
  const hasThyroidPatternSx = f.hasFatigue || f.hasHairLoss || f.hasWeightIssues || f.hasMoodIssues || f.hasColdHeatIntolerance;
  if (tshValue != null && tshValue >= 2.5 && tshValue <= 10 && hasThyroidPatternSx) {
    add('thyroid_antibodies',
      `TSH ${tshValue} in early-Hashimoto's grey zone (≥2.5) with fatigue / weight / hair / mood symptoms — TPO + Tg Ab catch autoimmune thyroiditis years before TSH crosses 4.5`,
      'e');
  }
}
