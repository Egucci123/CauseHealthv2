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

  // ── UNIVERSAL ADULT BASELINE (every patient ≥18) ───────────────────────
  // The comprehensive panel every adult should be ARMED to ask for. Fires
  // unconditionally so the baseline is never lost to AI discretion or
  // flag-format mismatch. The retest_timeline dedup pass collapses any
  // overlap with AI-generated entries.
  if (f.age >= 18) {
    // ── Core metabolic / chemistry ──
    tests.push({
      name: 'Comprehensive Metabolic Panel (CMP)',
      whyShort: 'Liver, kidney, electrolyte, glucose baseline',
      whyLong: '(d) Standard adult baseline — covers ALT, AST, ALP, Bilirubin, Albumin, Total Protein, Glucose, BUN, Creatinine, eGFR, Sodium, Potassium, Chloride, CO2, Calcium in one order.',
      icd10: 'Z00.00',
      icd10Description: 'General adult medical exam',
      priority: 'high',
      insuranceNote: 'Universally covered as part of routine adult exam or any chronic-condition follow-up.',
    });
    tests.push({
      name: 'Complete Blood Count (CBC) with Differential',
      whyShort: 'Red cells, white cells, platelets baseline',
      whyLong: '(d) Standard adult baseline — anemia, infection, marrow function, and inflammation patterns all show up here. Cheap, comprehensive, foundational.',
      icd10: 'Z00.00',
      icd10Description: 'General adult medical exam',
      priority: 'high',
      insuranceNote: 'Universally covered.',
    });
    tests.push({
      name: 'Lipid Panel (Total Cholesterol, LDL, HDL, Triglycerides, VLDL, non-HDL)',
      whyShort: 'Standard cardiovascular risk panel',
      whyLong: '(d) Standard adult baseline — total cholesterol, LDL, HDL, triglycerides, VLDL, and calculated non-HDL. Tracks response to lifestyle and medication changes.',
      icd10: 'Z13.220',
      icd10Description: 'Encounter for screening for lipoid disorders',
      priority: 'high',
      insuranceNote: 'Universally covered as preventive screening.',
    });
    tests.push({
      name: 'Hemoglobin A1c (HbA1c)',
      whyShort: 'Three-month average blood sugar',
      whyLong: '(d) Standard adult baseline — average blood glucose over the prior ~90 days. Catches early dysglycemia even when fasting glucose is normal.',
      icd10: 'Z13.1',
      icd10Description: 'Encounter for screening for diabetes mellitus',
      priority: 'high',
      insuranceNote: 'Universally covered as preventive screening.',
    });
    tests.push({
      name: 'hs-CRP (high-sensitivity C-reactive protein)',
      whyShort: 'Systemic inflammation baseline',
      whyLong: '(d) Standard adult baseline — sensitive marker for systemic inflammation that drives cardiovascular and metabolic risk. Watch-tier ≥0.5 mg/L; >2 mg/L flags meaningful inflammatory burden.',
      icd10: 'R79.89',
      icd10Description: 'Other specified abnormal findings of blood chemistry',
      priority: 'moderate',
      insuranceNote: 'Universally covered with cardiovascular or chronic-inflammation indications.',
    });
    tests.push({
      name: 'Vitamin D 25-Hydroxy (25-OH-D)',
      whyShort: 'Vitamin D status baseline',
      whyLong: '(d) Standard adult baseline — 25-OH-D is the storage form. <30 ng/mL = deficient; 30-40 = insufficient; 40-60 = optimal target.',
      icd10: 'E55.9',
      icd10Description: 'Vitamin D deficiency, unspecified (rule-out)',
      priority: 'high',
      insuranceNote: 'Universally covered.',
    });
    // ── B-vitamin workups ──
    tests.push({
      name: 'Vitamin B12 Workup (Serum B12 + MMA + Homocysteine)',
      whyShort: 'Tissue-level B12 status, not just serum',
      whyLong: '(d) Standard adult baseline — Serum B12 alone misses functional deficiency. MMA and Homocysteine are sensitive markers when serum is borderline; especially relevant for IBD, vegan/vegetarian, or long-term mesalamine/metformin/PPI patients.',
      icd10: 'D51.9',
      icd10Description: 'Vitamin B12 deficiency, unspecified (rule-out)',
      priority: 'moderate',
      insuranceNote: 'Modern PCPs order this with R53.83 (fatigue) or with any GI dx; if pushed back, request based on tissue-level status.',
    });
    tests.push({
      name: 'Folate Workup (Serum Folate + RBC Folate)',
      whyShort: 'Tissue folate status — RBC folate more sensitive',
      whyLong: '(d) Standard adult baseline — RBC folate reflects tissue stores over 3 months; serum folate reflects only recent intake. Both together give a complete picture, especially with mesalamine, methotrexate, or other folate-affecting medications.',
      icd10: 'E53.8',
      icd10Description: 'Other specified vitamin B-group deficiencies (folate)',
      priority: 'moderate',
      insuranceNote: 'Universally covered with fatigue, mood, or hematologic symptoms; or with mesalamine/methotrexate.',
    });
    // ── Iron status ──
    tests.push({
      name: 'Iron Panel (Serum Iron, TIBC, Ferritin, Transferrin Saturation, UIBC)',
      whyShort: 'Iron stores + transport baseline',
      whyLong: '(d) Standard adult baseline — ferritin <30 = deficiency; 30-50 = functional deficiency. Drives fatigue, hair loss, restless legs, exercise intolerance long before hemoglobin drops.',
      icd10: 'D50.9',
      icd10Description: 'Iron deficiency anemia, unspecified (rule-out)',
      priority: 'high',
      insuranceNote: 'Universally covered, especially with fatigue, hair loss, female-menstruating, or any GI dx.',
    });
    // ── Liver / kidney sensitive markers ──
    tests.push({
      name: 'GGT (Gamma-Glutamyl Transferase)',
      whyShort: 'Sensitive liver/biliary marker — anchor for ALT/AST',
      whyLong: '(d) Standard adult baseline — GGT is the sensitive companion to ALT/AST. Distinguishes hepatocellular vs. biliary cause and tracks fatty-liver/oxidative stress even when ALT is normal.',
      icd10: 'Z00.00',
      icd10Description: 'General adult medical exam',
      priority: 'moderate',
      insuranceNote: 'Universally covered as part of routine liver workup; cheap and high-yield.',
    });
    // ── Thyroid (full panel) ──
    tests.push({
      name: 'Thyroid Panel (TSH + Free T4 + Free T3)',
      whyShort: 'Full thyroid function baseline',
      whyLong: '(d) Standard adult baseline — TSH alone misses central hypothyroidism and impaired T4→T3 conversion. Free T3 is the active hormone; Free T4 is the precursor. Together they catch dysfunction TSH alone misses, especially with fatigue, weight, mood, or hair-loss symptoms.',
      icd10: 'Z00.00',
      icd10Description: 'General adult medical exam',
      priority: 'high',
      insuranceNote: 'Universally covered with fatigue, weight, or thyroid-symptom indications. Modern PCPs order the full panel.',
    });
    // ── Magnesium (RBC preferred — more sensitive than serum) ──
    tests.push({
      name: 'Magnesium (RBC Magnesium preferred)',
      whyShort: 'Intracellular Mg status — sleep, muscle, energy',
      whyLong: '(d) Standard adult baseline — RBC Magnesium reflects intracellular stores; serum Mg only catches severe deficiency. Drives sleep, muscle relaxation, glucose handling, and cardiovascular rhythm.',
      icd10: 'E83.42',
      icd10Description: 'Hypomagnesemia (rule-out)',
      priority: 'moderate',
      insuranceNote: 'Universally covered with sleep complaints, muscle symptoms, malabsorption (IBD/PPI/diuretic), or fatigue.',
    });
  }

  // (Removed duplicate GGT block — already injected unconditionally above
  // for every adult ≥18. The previous conditional GGT-on-LFT-elevation
  // block was redundant and caused two GGT entries to land before dedup.)
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

  // ── Statin monitoring — UNIVERSAL CK BASELINE ───────────────────────────
  // Every statin user gets a CK baseline + 12-week follow-up regardless of
  // current muscle symptoms. Per AHA / ACC / FDA prescribing info: baseline
  // CK at statin start, then check anytime the patient reports new myalgia.
  // Including it in retest_timeline lets the patient walk into the visit
  // with the statin-monitoring panel pre-populated. Higher priority if
  // symptoms ARE reported.
  if (f.onStatin) {
    tests.push({
      name: 'Creatine Kinase (CK)',
      whyShort: f.hasMuscleSymptoms || f.hasJointSymptoms
        ? 'Statin + aches → rule out myopathy'
        : 'Statin baseline — CK monitoring',
      whyLong: f.hasMuscleSymptoms || f.hasJointSymptoms
        ? '(b) On a statin + reports muscle/joint symptoms — CK rules out statin-induced myopathy.'
        : '(b) On a statin — CK is a routine baseline + 12-week follow-up to detect statin-induced myopathy early. Standard monitoring per AHA/ACC.',
      icd10: 'M62.82',
      icd10Description: 'Rhabdomyolysis (rule-out)',
      priority: f.hasMuscleSymptoms || f.hasJointSymptoms ? 'high' : 'moderate',
      insuranceNote: 'Universally covered with statin medication code.',
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

  // ── AM Cortisol — REMOVED ─────────────────────────────────────────────
  // Universal stigmata-only gate across all 3 generation surfaces (analyze-
  // labs, wellness plan, doctor prep). PCPs reject AM cortisol on plain
  // fatigue/sleep/weight; it only earns the order with classic Cushing's
  // (striae + central obesity + moon face + HTN) or Addison's (salt
  // cravings + hyperpigmentation + orthostatic hypotension + low Na)
  // stigmata. The deterministic injector that fired on fatigue+sleep+weight
  // is gone; the AI prompts are the gatekeepers.

  // ── Sleep + restless legs → ferritin >75 target check ──────────────────
  if (/\brestless legs|rls\b/.test(ctx.symptomsLower)) {
    // Iron panel is already triggered by hair loss / UC / menstruating; this is a
    // note that ferritin target for RLS is >75, not just >30. AI should reflect
    // this in why field of iron panel entry. No additional test needed.
  }

  // ── ApoB — universal injector for any lipid abnormality ────────────────
  // ApoB is the single best marker of atherogenic particle count. Standard
  // PCP-orderable with a documented lipid finding. Universal: fires on any
  // out-of-range lipid (TG high, LDL high, HDL low) OR statin user (where
  // ApoB guides dose adequacy beyond LDL-C).
  if (f.tgHigh || f.ldlHigh || f.hdlLow || f.onStatin) {
    tests.push({
      name: 'ApoB (Apolipoprotein B)',
      whyShort: 'True atherogenic particle count — better than LDL-C',
      whyLong: f.onStatin
        ? '(b)+(c) On statin with lipid abnormality — ApoB measures particle number directly. Target <80 mg/dL on statin; if higher, statin dose may be inadequate.'
        : '(c) Lipid abnormality present — ApoB quantifies plaque-forming particle count independent of cholesterol; better predictor of cardiovascular risk than LDL-C alone.',
      icd10: 'E78.5',
      icd10Description: 'Hyperlipidemia, unspecified',
      priority: 'high',
      insuranceNote: 'Universally covered with any lipid abnormality coded E78.x.',
    });
  }

  // ── Lp(a) — once-in-lifetime baseline for every adult ──────────────────
  // Lp(a) is genetic, doesn't change, and identifies the ~20% of adults with
  // elevated cardiovascular risk that a normal lipid panel misses. Standard
  // of care to test once. Universal: fires for any adult unless explicitly
  // already in the draw (lab pattern check).
  const lpaInDraw = /\blipoprotein.?a\b|\blp\(?a\)?\b/i.test(ctx.labsLower);
  if (!lpaInDraw && f.age >= 18) {
    tests.push({
      name: 'Lp(a) (Lipoprotein-a) — once in lifetime',
      whyShort: 'Genetic CV risk marker — test once, never again',
      whyLong: '(d) Once-in-lifetime adult baseline — Lp(a) is genetically determined and identifies elevated cardiovascular risk that a standard lipid panel misses. Test once to know the value forever.',
      icd10: 'Z13.6',
      icd10Description: 'Encounter for screening for cardiovascular disorders',
      priority: f.tgHigh || f.ldlHigh || f.onStatin ? 'high' : 'moderate',
      insuranceNote: 'Once-per-lifetime screening; covered as preventive when coded with Z13.6 or family history.',
    });
  }

  // ── Universal male hormonal baseline ────────────────────────────────────
  // EVERY adult male gets the full hormonal panel — not just men with a
  // symptom cluster. Modern internal medicine + endocrinology supports
  // baseline hormonal evaluation for any adult male asking for thorough
  // labs. The product mission is to ARM the patient with the comprehensive
  // panel; gating by symptom risks under-screening. Skip only if patient
  // is on TRT (different monitoring protocol).
  const isAdultMale = f.sex === 'male' && f.age >= 18;
  const lowLibido = /\b(libido|sex(ual)? drive|erect)/.test(ctx.symptomsLower);
  const malePattern = f.hasFatigue || f.hasHairLoss || f.hasWeightIssues || f.hasMoodIssues || lowLibido;
  // Borderline-low Total T: parse the value if present in labsLower.
  const totalTMatch = ctx.labsLower.match(/\btestosterone[^\n]*?(\d{2,4})/i);
  const totalTBorderline = totalTMatch ? Number(totalTMatch[1]) > 0 && Number(totalTMatch[1]) < 600 : false;
  if (isAdultMale && !f.onTRT) {
    tests.push({
      name: 'Testosterone Panel (Total T + Free T + Bioavailable T + SHBG + Estradiol + LH + FSH)',
      whyShort: 'Comprehensive male hormonal baseline — full bioavailable picture',
      whyLong: totalTBorderline
        ? `(c) Total T borderline-low — Free T, Bioavailable T, SHBG, Estradiol, and LH/FSH complete the workup. Total T alone misses bioavailability + tells you nothing about pituitary-vs-testicular origin.`
        : `(a)+(d) Adult male with fatigue / hair loss / weight / mood cluster — comprehensive hormonal baseline that PCPs can order with the right ICD-10. Free T + SHBG + Estradiol + LH/FSH together let you and your doctor see the full picture: total hormone, what's bioavailable, where the breakdown is (testicular vs pituitary), and conversion to estrogen.`,
      icd10: lowLibido ? 'N52.9' : (f.hasFatigue ? 'R53.83' : 'Z00.00'),
      icd10Description: lowLibido ? 'Male sexual dysfunction, unspecified' : (f.hasFatigue ? 'Other fatigue' : 'General adult medical exam'),
      priority: totalTBorderline ? 'high' : 'moderate',
      insuranceNote: 'Covered with documented symptom (fatigue / low libido / weight resistance) or low-normal Total T. Modern PCPs order this routinely; if push-back, request the panel under "comprehensive male hormone evaluation" with the symptom-anchored ICD-10.',
    });
  }

  // (Magnesium RBC moved to unconditional adult baseline above. The
  // conditional malabsorption + sleep/muscle trigger was redundant once
  // Mg became part of the universal adult baseline.)

  // ── Fasting Insulin + HOMA-IR — fires for any early-metabolic pattern.
  // Universal across every patient.
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
    tests.push({
      name: 'Fasting Insulin + HOMA-IR',
      whyShort: 'Catches insulin resistance before A1c does',
      whyLong: '(c) Early-metabolic pattern (elevated TG, watch-tier glucose, watch-tier A1c, TG/HDL ≥3, or weight resistance) — fasting insulin >10 mIU/mL or HOMA-IR >2.5 confirms compensatory hyperinsulinemia even when A1c is normal. Tracks response 4-6 weeks faster than A1c.',
      icd10: 'E88.81',
      icd10Description: 'Metabolic syndrome',
      priority: 'high',
      insuranceNote: 'Covered with documented metabolic risk factor (TG, glucose, weight); modern PCPs order routinely.',
    });
  }

  // ── Hashimoto's antibodies — fires when TSH is in the early-Hashimoto's
  // grey zone (≥2.5) AND patient has thyroid-pattern symptoms. Universal
  // across every patient.
  const tshMatch = ctx.labsLower.match(/\btsh[^\n]*?(\d+\.?\d*)/i);
  const tshValue = tshMatch ? Number(tshMatch[1]) : null;
  const hasThyroidPatternSx = f.hasFatigue || f.hasHairLoss || f.hasWeightIssues || f.hasMoodIssues || f.hasColdHeatIntolerance;
  if (tshValue != null && tshValue >= 2.5 && tshValue <= 10 && hasThyroidPatternSx) {
    tests.push({
      name: "Hashimoto's Antibodies (TPO Ab + Tg Ab)",
      whyShort: 'TSH borderline + symptom cluster — autoimmune workup',
      whyLong: `(e) TSH ${tshValue} is in the early-Hashimoto's grey zone with fatigue / weight / hair / mood symptoms. TPO and Tg antibodies catch autoimmune thyroiditis years before TSH crosses 4.5.`,
      icd10: 'E06.3',
      icd10Description: 'Autoimmune thyroiditis (rule-out)',
      priority: 'high',
      insuranceNote: 'Universally covered with TSH ≥2.5 and any thyroid-pattern symptom.',
    });
  }

  // ── PCOS Panel — fires for adult females with cycle/acne/hirsutism
  // pattern. Universal: any patient with the trigger gets the panel.
  const isFemaleAdult = f.sex === 'female' && f.age >= 18;
  const pcosPattern = /\b(irregular cycle|amenorrhea|missed period|acne|hirsut|excess hair|infertility|polycystic)/i.test(ctx.symptomsLower)
    || /\b(pcos|polycystic ovary)\b/i.test(ctx.conditionsLower);
  if (isFemaleAdult && pcosPattern) {
    tests.push({
      name: 'PCOS Panel (Total T + Free T + DHEA-S + LH:FSH ratio + SHBG + Fasting Insulin)',
      whyShort: 'Hormonal + metabolic workup for cycle/skin pattern',
      whyLong: '(e)+(a) Female with cycle / acne / hirsutism / infertility cluster — PCOS panel catches androgen excess, LH:FSH dysregulation, and the insulin-resistance link that drives all three. Comprehensive baseline for any female PCOS workup.',
      icd10: 'E28.2',
      icd10Description: 'Polycystic ovarian syndrome',
      priority: 'high',
      insuranceNote: 'Universally covered with documented cycle/skin symptom or PCOS dx.',
    });
  }

  return tests;
}
