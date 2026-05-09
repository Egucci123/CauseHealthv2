// supabase/functions/_shared/clinicalCalculators.ts
//
// PHASE 5 — CLINICAL RISK CALCULATORS
// ===================================
// Universal clinical math that PCPs use every day. We surface the actual
// calculated number — not just "your TG is high" — so the patient and
// their doctor can have a substantive conversation.
//
// Each calculator is pure (no side effects), takes plain numeric inputs,
// returns null when required inputs are missing. Universal — applies to
// every patient with the required data.
//
// Sources:
//   ASCVD 10-year: AHA/ACC 2018 Pooled Cohort Equation (PCE) — the same
//     formula used in every modern statin guideline. We use the PCE
//     calibrated for non-Hispanic white + non-Hispanic Black, and use
//     the white equation as fallback for unknown ethnicity per ACC's
//     2024 risk-tool guidance.
//   FIB-4: Sterling et al. 2006, validated for NAFLD fibrosis staging.
//   HOMA-IR: Matthews 1985 formula, ADA-recognized.
//   TG/HDL ratio: Stalenhoef 2008, IR severity marker.

export interface ASCVDInput {
  age: number;
  sex: 'male' | 'female' | string;
  race?: 'black' | 'white' | 'other';      // 'other' uses white equation
  totalCholesterol: number;                  // mg/dL
  hdl: number;                               // mg/dL
  systolicBP: number;                        // mmHg
  onBpMeds: boolean;
  hasDiabetes: boolean;
  isSmoker: boolean;
}

export interface ASCVDResult {
  tenYearRiskPercent: number;     // 0-100
  category: 'low' | 'borderline' | 'intermediate' | 'high';
  interpretation: string;
  source: string;
}

/**
 * AHA/ACC 2018 Pooled Cohort Equation 10-year ASCVD risk.
 * Returns null if required inputs missing OR age outside validated 40-79 range.
 *
 * Coefficients from Goff DC et al. 2014 PCE update.
 */
export function computeASCVDRisk(input: ASCVDInput): ASCVDResult | null {
  const { age, sex, totalCholesterol: tc, hdl, systolicBP, onBpMeds, hasDiabetes, isSmoker } = input;
  if (!age || !sex || !tc || !hdl || !systolicBP) return null;
  if (age < 40 || age > 79) return null;

  const isMale = String(sex).toLowerCase() === 'male';
  const isBlack = String(input.race ?? '').toLowerCase() === 'black';

  // Pooled Cohort Equation natural-log betas (Goff 2014 Table A)
  let lnAge: number, lnAgeSq: number, lnTC: number, lnAgeLnTC: number;
  let lnHDL: number, lnAgeLnHDL: number, lnSBP: number, lnAgeLnSBP: number;
  let smokerCoef: number, lnAgeSmoker: number, dmCoef: number;
  let baselineSurvival: number, mean: number;

  if (isMale && isBlack) {
    lnAge = 2.469; lnAgeSq = 0; lnTC = 0.302; lnAgeLnTC = 0;
    lnHDL = -0.307; lnAgeLnHDL = 0;
    lnSBP = onBpMeds ? 1.916 : 1.809; lnAgeLnSBP = 0;
    smokerCoef = isSmoker ? 0.549 : 0; lnAgeSmoker = 0;
    dmCoef = hasDiabetes ? 0.645 : 0;
    baselineSurvival = 0.8954; mean = 19.5425;
  } else if (isMale) {
    lnAge = 12.344; lnAgeSq = 0; lnTC = 11.853; lnAgeLnTC = -2.664;
    lnHDL = -7.990; lnAgeLnHDL = 1.769;
    lnSBP = onBpMeds ? 1.797 : 1.764; lnAgeLnSBP = 0;
    smokerCoef = isSmoker ? 7.837 : 0; lnAgeSmoker = isSmoker ? -1.795 : 0;
    dmCoef = hasDiabetes ? 0.658 : 0;
    baselineSurvival = 0.9144; mean = 61.18;
  } else if (!isMale && isBlack) {
    lnAge = 17.114; lnAgeSq = 0; lnTC = 0.940; lnAgeLnTC = 0;
    lnHDL = -18.920; lnAgeLnHDL = 4.475;
    lnSBP = onBpMeds ? 29.291 : 27.820; lnAgeLnSBP = onBpMeds ? -6.432 : -6.087;
    smokerCoef = isSmoker ? 0.691 : 0; lnAgeSmoker = 0;
    dmCoef = hasDiabetes ? 0.874 : 0;
    baselineSurvival = 0.9533; mean = 86.6081;
  } else {
    // non-Hispanic white female
    lnAge = -29.799; lnAgeSq = 4.884; lnTC = 13.540; lnAgeLnTC = -3.114;
    lnHDL = -13.578; lnAgeLnHDL = 3.149;
    lnSBP = onBpMeds ? 2.019 : 1.957; lnAgeLnSBP = 0;
    smokerCoef = isSmoker ? 7.574 : 0; lnAgeSmoker = isSmoker ? -1.665 : 0;
    dmCoef = hasDiabetes ? 0.661 : 0;
    baselineSurvival = 0.9665; mean = -29.18;
  }

  const lnAgeVal = Math.log(age);
  const lnTcVal = Math.log(tc);
  const lnHdlVal = Math.log(hdl);
  const lnSbpVal = Math.log(systolicBP);

  const indSum =
    (lnAge * lnAgeVal) +
    (lnAgeSq * lnAgeVal * lnAgeVal) +
    (lnTC * lnTcVal) +
    (lnAgeLnTC * lnAgeVal * lnTcVal) +
    (lnHDL * lnHdlVal) +
    (lnAgeLnHDL * lnAgeVal * lnHdlVal) +
    (lnSBP * lnSbpVal) +
    (lnAgeLnSBP * lnAgeVal * lnSbpVal) +
    smokerCoef +
    (lnAgeSmoker * lnAgeVal) +
    dmCoef;

  const risk = 1 - Math.pow(baselineSurvival, Math.exp(indSum - mean));
  const tenYearRiskPercent = Math.max(0, Math.min(100, risk * 100));

  let category: 'low' | 'borderline' | 'intermediate' | 'high';
  if (tenYearRiskPercent < 5) category = 'low';
  else if (tenYearRiskPercent < 7.5) category = 'borderline';
  else if (tenYearRiskPercent < 20) category = 'intermediate';
  else category = 'high';

  const interpretation =
    category === 'low'      ? 'Below 5% — lifestyle focus; statin not routinely indicated.' :
    category === 'borderline' ? 'Borderline (5–7.5%) — discuss with PCP; statin reasonable with risk enhancers.' :
    category === 'intermediate' ? 'Intermediate (7.5–20%) — moderate-intensity statin recommended; consider CAC score for refinement.' :
    'High (≥20%) — high-intensity statin recommended.';

  return {
    tenYearRiskPercent: Math.round(tenYearRiskPercent * 10) / 10,
    category,
    interpretation,
    source: 'AHA/ACC 2018 Pooled Cohort Equation',
  };
}

export interface FIB4Input {
  age: number;
  ast: number;        // IU/L
  alt: number;        // IU/L
  platelets: number;  // 10^9/L (e.g. 250)
}

export interface FIB4Result {
  score: number;
  category: 'low' | 'indeterminate' | 'high';
  interpretation: string;
  source: string;
}

/**
 * FIB-4 score for advanced liver fibrosis (NAFLD/NASH risk stratification).
 * Returns null when inputs missing.
 *
 * Reference cut-offs per AGA 2023 NAFLD guidelines:
 *   <1.30  low fibrosis risk — no further imaging needed
 *   1.30-2.67  indeterminate — FibroScan or ELF test recommended
 *   ≥2.67  high — hepatology referral
 */
export function computeFIB4(input: FIB4Input): FIB4Result | null {
  const { age, ast, alt, platelets } = input;
  if (!age || !ast || !alt || !platelets) return null;
  if (alt <= 0 || platelets <= 0) return null;

  const score = (age * ast) / (platelets * Math.sqrt(alt));

  let category: 'low' | 'indeterminate' | 'high';
  let interpretation: string;
  if (score < 1.3) {
    category = 'low';
    interpretation = 'Low fibrosis risk (FIB-4 <1.30) — no further imaging needed.';
  } else if (score < 2.67) {
    category = 'indeterminate';
    interpretation = 'Indeterminate (FIB-4 1.30–2.67) — FibroScan or ELF test recommended.';
  } else {
    category = 'high';
    interpretation = 'High fibrosis risk (FIB-4 ≥2.67) — hepatology referral indicated.';
  }

  return {
    score: Math.round(score * 100) / 100,
    category,
    interpretation,
    source: 'AGA 2023 NAFLD Clinical Care Pathway',
  };
}

export interface HOMAIRInput {
  fastingGlucose: number;       // mg/dL
  fastingInsulin: number;       // mIU/L
}

export interface HOMAIRResult {
  homaIR: number;
  category: 'normal' | 'borderline' | 'insulin_resistant' | 'severe';
  interpretation: string;
  source: string;
}

/**
 * HOMA-IR (Homeostatic Model Assessment for Insulin Resistance).
 * Formula: (Fasting Glucose × Fasting Insulin) / 405
 *
 * Cut-offs per Matthews 1985 + ADA recognition:
 *   <1.0  optimal insulin sensitivity
 *   1.0–2.5  normal
 *   2.5–3.5  insulin resistance
 *   ≥3.5  severe insulin resistance
 */
export function computeHOMAIR(input: HOMAIRInput): HOMAIRResult | null {
  const { fastingGlucose: g, fastingInsulin: i } = input;
  if (!g || !i || g <= 0 || i <= 0) return null;

  const homaIR = (g * i) / 405;

  let category: 'normal' | 'borderline' | 'insulin_resistant' | 'severe';
  let interpretation: string;
  if (homaIR < 1.0) {
    category = 'normal';
    interpretation = 'Optimal insulin sensitivity (HOMA-IR <1.0).';
  } else if (homaIR < 2.5) {
    category = 'normal';
    interpretation = 'Normal insulin sensitivity (HOMA-IR 1.0–2.5).';
  } else if (homaIR < 3.5) {
    category = 'insulin_resistant';
    interpretation = 'Insulin resistance (HOMA-IR 2.5–3.5) — lifestyle intervention indicated; track quarterly.';
  } else {
    category = 'severe';
    interpretation = 'Severe insulin resistance (HOMA-IR ≥3.5) — discuss metformin or GLP-1 with your doctor if lifestyle alone insufficient at 12 weeks.';
  }

  return {
    homaIR: Math.round(homaIR * 100) / 100,
    category,
    interpretation,
    source: 'Matthews 1985 / ADA',
  };
}

export interface TGHDLInput {
  triglycerides: number;   // mg/dL
  hdl: number;             // mg/dL
}

export interface TGHDLResult {
  ratio: number;
  category: 'optimal' | 'borderline' | 'elevated' | 'high';
  interpretation: string;
  source: string;
}

/**
 * Triglyceride/HDL ratio — high-sensitivity insulin-resistance marker
 * and proxy for LDL particle size (small dense LDL pattern).
 *
 * Cut-offs:
 *   <2  optimal
 *   2–3 borderline
 *   3–4 elevated, suggests IR
 *   ≥4  consistent with severe IR / atherogenic dyslipidemia pattern
 */
export function computeTGHDLRatio(input: TGHDLInput): TGHDLResult | null {
  const { triglycerides: tg, hdl } = input;
  if (!tg || !hdl || hdl <= 0) return null;

  const ratio = tg / hdl;

  let category: 'optimal' | 'borderline' | 'elevated' | 'high';
  let interpretation: string;
  if (ratio < 2) {
    category = 'optimal';
    interpretation = 'Optimal (<2). Low cardiovascular risk pattern.';
  } else if (ratio < 3) {
    category = 'borderline';
    interpretation = 'Borderline (2–3). Trend; lifestyle focus.';
  } else if (ratio < 4) {
    category = 'elevated';
    interpretation = 'Elevated (3–4). Suggests insulin resistance; check fasting insulin.';
  } else {
    category = 'high';
    interpretation = 'High (≥4). Atherogenic dyslipidemia pattern — small dense LDL likely; consider ApoB to confirm.';
  }

  return {
    ratio: Math.round(ratio * 10) / 10,
    category,
    interpretation,
    source: 'Stalenhoef 2008',
  };
}
