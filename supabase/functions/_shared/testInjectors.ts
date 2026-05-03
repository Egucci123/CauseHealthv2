// supabase/functions/_shared/testInjectors.ts
//
// Universal test pairing rules. Same logic shipped from both
// generate-doctor-prep (tests_to_request) and generate-wellness-plan
// (retest_timeline) so they always produce identical lists.
//
// Each rule fires when a clinical pattern is detected in the patient's
// labs / symptoms / medications / diagnosed conditions. Standard-of-care
// pairings any clinician would order — universally applicable, no
// disease-specific tailoring. Each test is PCP-orderable, insurance-
// covered, with an ICD-10 code that justifies billing.
//
// May 2026 refactor: condition / medication detection is delegated to the
// canonical registries in `_shared/conditionAliases.ts` and
// `_shared/medicationAliases.ts`. NEVER inline a condition or med regex
// here again — add it to the registry. That's how universal fixes stay
// universal (Nona Lynn lesson: "Hypothyroidism" wasn't matching
// /hashimoto/i — fixed once in the registry, every injector benefits).

import { hasCondition } from './conditionAliases.ts';
import { isOnMed } from './medicationAliases.ts';

export interface InjectionContext {
  age: number | null;
  sex: 'male' | 'female' | string | null;
  conditionsLower: string;
  symptomsLower: string;
  labsLower: string;
  medsLower: string;
}

export interface InjectedTest {
  name: string;          // standard panel name e.g. "GGT" or "Sleep Apnea Screening (STOP-BANG)"
  whyShort: string;      // 6-10 words for cards
  whyLong: string;       // 1 sentence with trigger letter cited
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

    // Conditions — delegated to canonical registry. Add new aliases there.
    // NOTE: hasHashimotos now correctly fires on "Hypothyroidism" too (Nona fix).
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

    // Lab patterns (parsed from the all-labs string with [LOW/HIGH/CRITICAL] flags)
    altElevated: /\b(alt|sgpt)[^\n]*\[(high|critical_high)/i.test(l),
    astElevated: /\b(ast|sgot)[^\n]*\[(high|critical_high)/i.test(l),
    altDoubled: /\b(alt|sgpt):\s*([5-9]\d|\d{3,})/i.test(l), // ALT > 50 (rough heuristic)
    bilirubinElevated: /\bbilirubin[^\n]*\[(high|critical_high)/i.test(l),
    rbcElevated: /\b(rbc|red blood cell)[^\n]*\[(high|critical_high)/i.test(l),
    hctElevated: /\b(hct|hematocrit)[^\n]*\[(high|critical_high)/i.test(l),
    cbcAbnormal: /\b(rbc|hematocrit|hct|hemoglobin|hgb|wbc|white blood|platelet|mcv|mch|rdw)[^\n]*\[(low|high|critical)/i.test(l),
    macrocytic: /\bmcv[^\n]*\[(high|critical_high)/i.test(l), // MCV > standard high
    microcytic: /\bmcv[^\n]*\[(low|critical_low)/i.test(l),
    tgHigh: /\btriglyceride[^\n]*\[(high|critical_high|watch)/i.test(l),
    glucoseWatch: /\bglucose[^\n]*\[watch\]/i.test(l) || /\b(a1c|hemoglobin a1c)[^\n]*\[(watch|high|critical_high)/i.test(l),
    hdlLow: /\bhdl[^\n]*\[(low|critical_low|watch)/i.test(l),
    ldlHigh: /\bldl[^\n]*\[(high|critical_high)/i.test(l),
    vitaminDLow: /\b(25.?hydroxy.?vitamin d|vitamin d)[^\n]*\[(low|critical_low|watch)/i.test(l),
  };
}

// Universal pairing rules. Each returns a test if the trigger fires.
export function buildUniversalTestInjections(ctx: InjectionContext): InjectedTest[] {
  const f = buildContextFlags(ctx);
  const tests: InjectedTest[] = [];

  // ── Liver workup completion ────────────────────────────────────────────
  if (f.altElevated || f.astElevated) {
    tests.push({
      name: 'GGT (Gamma-Glutamyl Transferase)',
      whyShort: 'Pairs with ALT/AST to find liver cause',
      whyLong: '(c) ALT or AST elevated — GGT distinguishes between alcohol-related, fatty liver, and drug-induced liver injury. Standard companion to LFT abnormality.',
      icd10: 'R74.0',
      icd10Description: 'Abnormal liver function tests',
      priority: 'high',
      insuranceNote: 'Universally covered when LFTs are abnormal.',
    });
  }
  if (f.altDoubled || (f.altElevated && f.tgHigh)) {
    tests.push({
      name: 'Liver Ultrasound (NAFLD assessment)',
      whyShort: 'Rule out fatty liver',
      whyLong: '(c) ALT >2x normal (or ALT elevated + high triglycerides) — standard imaging to rule out NAFLD or hepatic steatosis. Non-invasive.',
      icd10: 'K76.9',
      icd10Description: 'Liver disease, unspecified',
      priority: 'high',
      insuranceNote: 'Covered with persistent LFT abnormality; ~$300-600 copay if denied.',
    });
  }

  // ── Statin monitoring (any muscle/joint symptom) ────────────────────────
  if (f.onStatin && (f.hasMuscleSymptoms || f.hasJointSymptoms)) {
    tests.push({
      name: 'Creatine Kinase (CK)',
      whyShort: 'Statin + aches → rule out myopathy',
      whyLong: '(b) On a statin + reports muscle/joint symptoms — CK rules out statin-induced myopathy. Standard monitoring.',
      icd10: 'M62.82',
      icd10Description: 'Rhabdomyolysis (rule-out)',
      priority: 'high',
      insuranceNote: 'Universally covered when statin + muscle symptoms documented.',
    });
  }

  // ── Metabolic syndrome / insulin resistance pattern ─────────────────────
  if (f.tgHigh && (f.glucoseWatch || f.hdlLow)) {
    tests.push({
      name: 'Uric Acid',
      whyShort: 'Metabolic syndrome marker',
      whyLong: '(c) Triglycerides + glucose/A1c + low HDL = metabolic syndrome pattern. Uric acid screens for gout risk, kidney stones, and CV risk amplification.',
      icd10: 'E79.0',
      icd10Description: 'Hyperuricemia without signs of inflammatory arthritis and tophaceous disease',
      priority: 'moderate',
      insuranceNote: 'Universally covered; bundled into routine bloodwork.',
    });
  }

  // ── Sleep apnea screening (polycythemia + IR + sleep symptoms) ─────────
  // Strong association: borderline polycythemia + insulin resistance pattern
  // + sleep symptoms = textbook obstructive sleep apnea signature.
  const polycythemiaPattern = f.rbcElevated && f.hctElevated;
  const irPattern = f.tgHigh || f.glucoseWatch;
  if (polycythemiaPattern && (irPattern || f.hasSleepIssues || f.hasWeightIssues)) {
    tests.push({
      name: 'Sleep Apnea Screening (STOP-BANG questionnaire + sleep study referral)',
      whyShort: 'Elevated RBC + IR + sleep issues = OSA pattern',
      whyLong: '(e) Elevated red cell mass + insulin resistance + sleep/weight pattern strongly suggests obstructive sleep apnea. STOP-BANG questionnaire then sleep study if positive.',
      icd10: 'G47.30',
      icd10Description: 'Sleep apnea, unspecified',
      priority: 'moderate',
      insuranceNote: 'Sleep study covered with the symptom pattern documented.',
    });
  }

  // ── Macrocytic anemia → B-vitamin investigation ─────────────────────────
  if (f.macrocytic) {
    tests.push({
      name: 'Vitamin B12 + Folate + MMA + Homocysteine',
      whyShort: 'Macrocytic pattern — find the B-vitamin gap',
      whyLong: '(c) MCV elevated — macrocytic anemia signature points to B12 or folate deficiency. MMA and homocysteine are sensitive markers.',
      icd10: 'D52.9',
      icd10Description: 'Folate deficiency anemia, unspecified',
      priority: 'high',
      insuranceNote: 'Universally covered when MCV is elevated.',
    });
  }

  // ── Microcytic anemia → iron + thalassemia screen ───────────────────────
  if (f.microcytic) {
    tests.push({
      name: 'Hemoglobin Electrophoresis',
      whyShort: 'Microcytic + iron normal → thalassemia screen',
      whyLong: '(c) MCV low — microcytic anemia. If iron panel is normal, hemoglobin electrophoresis screens for thalassemia trait (especially with relevant ancestry).',
      icd10: 'D56.9',
      icd10Description: 'Thalassemia, unspecified',
      priority: 'moderate',
      insuranceNote: 'Covered when iron panel is normal in microcytic anemia.',
    });
  }

  // ── Vitamin D deficiency → PTH + calcium ─────────────────────────────────
  // Severely low vitamin D + bone-related dx or symptoms → check PTH
  if (f.vitaminDLow && (f.hasOsteo || /\b(bone pain|fracture|joint)/.test(ctx.symptomsLower))) {
    tests.push({
      name: 'PTH (Parathyroid Hormone) + Ionized Calcium',
      whyShort: 'Low D + bone symptoms → PTH check',
      whyLong: '(c) Vitamin D severely low + bone/joint symptoms — PTH and ionized calcium rule out secondary hyperparathyroidism.',
      icd10: 'E55.9',
      icd10Description: 'Vitamin D deficiency, unspecified',
      priority: 'moderate',
      insuranceNote: 'Universally covered with vitamin D deficiency documented.',
    });
  }

  // ── Mood / brain fog pattern + autoimmune → cortisol + thyroid hunt ────
  // Afternoon fatigue + sleep issues + weight gain pattern (HPA dysregulation)
  if (f.hasFatigue && f.hasSleepIssues && f.hasWeightIssues && !f.onSteroid) {
    tests.push({
      name: 'AM Cortisol + DHEA-S',
      whyShort: 'Fatigue + sleep + weight pattern → HPA check',
      whyLong: '(a) Chronic fatigue + sleep disruption + weight loss resistance = HPA-axis dysregulation pattern. AM cortisol + DHEA-S baseline the stress-hormone axis.',
      icd10: 'E27.40',
      icd10Description: 'Unspecified adrenocortical insufficiency',
      priority: 'moderate',
      insuranceNote: 'Covered with chronic fatigue documentation.',
    });
  }

  // ── Sleep + restless legs → ferritin >75 target check ──────────────────
  if (/\brestless legs|rls\b/.test(ctx.symptomsLower)) {
    // Iron panel is already triggered by hair loss / UC / menstruating; this is a
    // note that ferritin target for RLS is >75, not just >30. AI should reflect
    // this in why field of iron panel entry. No additional test needed.
  }

  // ── Magnesium RBC for malabsorption + sleep + IR ────────────────────────
  if ((f.hasIBD || f.onPPI || f.onDiuretic) && (f.hasSleepIssues || f.hasMuscleSymptoms)) {
    tests.push({
      name: 'Magnesium (RBC Magnesium)',
      whyShort: 'Malabsorption + sleep/muscle symptoms',
      whyLong: '(b)/(a) Conditions/medications affecting magnesium absorption + sleep or muscle symptoms — RBC magnesium is more sensitive than serum.',
      icd10: 'E83.42',
      icd10Description: 'Hypomagnesemia',
      priority: 'moderate',
      insuranceNote: 'Covered with malabsorption or relevant medication.',
    });
  }

  return tests;
}
