// supabase/functions/_shared/testInjectors.ts
//
// UNIVERSAL TEST PAIRING — thin wrapper around the data-driven registry
// =====================================================================
// The rule library lives in ./testIndications.ts (TEST_INDICATIONS table
// + evaluateTestIndications matcher). Adding a new test-ordering pattern
// = ADD ONE ROW to that table. No code edits to this file.
//
// This file owns three things:
//   1. InjectionContext / InjectedTest / InjectionRequest type definitions
//      (downstream consumers — doctor-prep, wellness — import these).
//   2. buildContextFlags(ctx) — pre-computes the patient-state flag bag
//      that registry triggers reference by name. Adding a new flag is the
//      one and only place to add fact-extraction code outside the table.
//   3. buildUniversalTestInjections / buildUniversalTestInjectionRequests
//      — convenience adapters that call evaluateTestIndications with
//      the appropriate add() callback.
//
// To add a new universal pairing:
//   • Add a key to retestRegistry.ts (canonical name + ICD-10 + insurance)
//   • Add a row to TEST_INDICATIONS in ./testIndications.ts
//   • Done. No engine modification.

import { hasCondition } from './conditionAliases.ts';
import { isOnMed } from './medicationAliases.ts';
import { getRetest } from './retestRegistry.ts';
import { evaluateTestIndications, type TestTrigger } from './testIndications.ts';

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

// Helper: was this marker drawn AND healthy? Universal across users.
function markerDrawnAndHealthy(labsLower: string, markerPattern: RegExp): boolean {
  const lines = labsLower.split('\n');
  for (const line of lines) {
    if (markerPattern.test(line) && /\[(healthy|normal|optimal)\]/.test(line)) {
      return true;
    }
  }
  return false;
}

// Helper: was this marker drawn AT ALL (any flag)?
function markerDrawn(labsLower: string, markerPattern: RegExp): boolean {
  const lines = labsLower.split('\n');
  return lines.some(line => markerPattern.test(line));
}

/**
 * Pre-compute the flag bag the indication-table triggers reference by
 * name. EVERY flag the rules need to read comes from here — adding a
 * new fact (e.g., 'hasMigraine', 'onAceInhibitor') means adding ONE
 * row to this object plus the corresponding rows in TEST_INDICATIONS.
 *
 * The flag layer is data-extraction; the indication layer is
 * decision-making. Keep them separate.
 */
export function buildContextFlags(ctx: InjectionContext) {
  const c = ctx.conditionsLower;
  const s = ctx.symptomsLower;
  const l = ctx.labsLower;
  const m = ctx.medsLower;
  const sex = (ctx.sex ?? '').toLowerCase();
  const age = ctx.age ?? 99;
  const ageKnown = ctx.age != null;

  const drawnHealthy = (re: RegExp) => markerDrawnAndHealthy(l, re);
  const drawn = (re: RegExp) => markerDrawn(l, re);

  return {
    age, sex, ageKnown,

    // ── Already-drawn flags ─────────────────────────────────────────
    b12DrawnHealthy: drawnHealthy(/vitamin b.?12|^b12|cobalamin/i),
    folateDrawnHealthy: drawnHealthy(/folate/i),
    vitDDrawnHealthy: drawnHealthy(/25.?hydroxy.*vitamin d|vitamin d.*25/i),
    cmpDrawn: drawn(/^bun:|^creatinine|^sodium|^potassium|^chloride|^calcium\b|^bilirubin|alanine.*amino|aspartate.*amino|alkaline phosphatase/i),
    cbcDrawn: drawn(/^wbc|^rbc:|hemoglobin\b(?!\s*a1c)|hematocrit|^mcv|^mch:|^mchc|^rdw|^platelets/i),
    lipidDrawn: drawn(/cholesterol|triglyceride|ldl|hdl|vldl/i),
    a1cDrawn: drawn(/hemoglobin a1c|hba1c|^a1c/i),
    hsCrpDrawn: drawn(/hs[\s-]?crp|c[\s-]?reactive/i),
    hsCrpDrawnHealthy: drawnHealthy(/hs[\s-]?crp|c[\s-]?reactive/i),
    ironPanelDrawn: drawn(/ferritin|tibc|transferrin|iron sat|^iron\b/i),
    ironPanelDrawnHealthy: drawnHealthy(/ferritin/i) && drawnHealthy(/tibc/i),
    ggtDrawn: drawn(/^ggt\b|gamma[\s-]?glutamyl/i),
    thyroidFullDrawn: drawn(/free t4|t4 free|free t3|t3 free/i),
    tshDrawnHealthy: drawnHealthy(/^tsh\b/i),
    lpADrawn: drawn(/lp\(a\)|lipoprotein.?a/i),
    rbcMgDrawn: drawn(/rbc.*magnesium|magnesium.*rbc/i),
    apoBDrawn: drawn(/apob|apolipoprotein b/i),
    fastingInsulinDrawn: drawn(/fasting insulin|^insulin\b/i),
    ckDrawn: drawn(/^ck\b|creatine kinase/i),
    uricAcidDrawn: drawn(/uric acid/i),
    totalTestosteroneDrawnHealthy: drawnHealthy(/^testosterone|testosterone, serum|total testosterone/i),
    freeTestosteroneDrawn: drawn(/free testosterone/i),
    testosteroneFullDrawn: drawn(/free testosterone/i) && drawn(/shbg/i),
    isMenstruatingFemale: sex === 'female' && age >= 12 && age <= 55,

    // ── Conditions (delegated to canonical registry) ────────────────
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

    // ── Medications (delegated to canonical registry) ───────────────
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

    // ── Symptom buckets ──────────────────────────────────────────────
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

    // ── Lab pattern flags ────────────────────────────────────────────
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

export interface InjectionRequest {
  key: string;
  whyShort: string;
  trigger: TestTrigger;
}

/**
 * Returns canonical-key list for downstream alias-based dedup (matches
 * "Hemoglobin A1c" / "HbA1c" / "A1c" variants automatically).
 */
export function buildUniversalTestInjectionRequests(ctx: InjectionContext): InjectionRequest[] {
  const f = buildContextFlags(ctx);
  const reqs: InjectionRequest[] = [];
  evaluateTestIndications(f, ctx, (key, whyShort, trigger) => {
    reqs.push({ key, whyShort, trigger });
  });
  return reqs;
}

/**
 * Returns full InjectedTest[] (with canonical name + ICD-10 + priority +
 * insurance copy resolved from retestRegistry). Used by doctor-prep.
 */
export function buildUniversalTestInjections(ctx: InjectionContext): InjectedTest[] {
  const f = buildContextFlags(ctx);
  const tests: InjectedTest[] = [];
  evaluateTestIndications(f, ctx, (key, whyShort, trigger) => {
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
  });
  return tests;
}
