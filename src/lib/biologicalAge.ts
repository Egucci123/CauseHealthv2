// src/lib/biologicalAge.ts
// Biological age calculation using Levine PhenoAge (2018, peer-reviewed)
// Reference: Levine ME, et al. "An epigenetic biomarker of aging for lifespan and healthspan."
// Aging (Albany NY). 2018;10(4):573-591. PMID: 29676998

import type { LabValue } from '../types';

export interface BioAgeInput {
  albumin_g_dL: number;       // Albumin in g/dL (US conventional)
  creatinine_mg_dL: number;    // Creatinine in mg/dL
  glucose_mg_dL: number;       // Glucose in mg/dL
  crp_mg_L: number;            // C-reactive protein in mg/L (NOT mg/dL)
  lymphocyte_pct: number;      // Lymphocyte percentage (0-100)
  mcv_fL: number;              // Mean corpuscular volume in fL
  rdw_pct: number;             // Red cell distribution width %
  alp_U_L: number;             // Alkaline phosphatase in U/L
  wbc_K_uL: number;            // White blood cells in K/uL (= 10^9/L)
  chronologicalAge: number;    // Years
}

export interface BioAgeResult {
  phenoAge: number;            // Biological age in years
  chronologicalAge: number;
  delta: number;               // phenoAge - chronologicalAge (negative = younger)
  category: 'younger' | 'matched' | 'older';
  pace: number;                // Aging pace ratio (phenoAge/chronoAge)
}

// Required marker keys for PhenoAge calculation
export const PHENOAGE_REQUIRED_MARKERS = [
  'albumin', 'creatinine', 'glucose', 'crp', 'lymphocyte', 'mcv', 'rdw', 'alp', 'wbc',
] as const;

/**
 * Compute Levine PhenoAge from raw biomarkers.
 * Returns null if inputs are out of plausible range (sanity check).
 */
export function computePhenoAge(input: BioAgeInput): BioAgeResult | null {
  // Validate inputs are positive and plausible
  if (
    input.albumin_g_dL <= 0 || input.creatinine_mg_dL <= 0 || input.glucose_mg_dL <= 0 ||
    input.lymphocyte_pct < 0 || input.lymphocyte_pct > 100 ||
    input.mcv_fL <= 0 || input.rdw_pct <= 0 || input.alp_U_L <= 0 || input.wbc_K_uL <= 0 ||
    input.chronologicalAge <= 0 || input.chronologicalAge > 120
  ) return null;

  // Convert US conventional → SI units required by Levine equation
  const albumin_gL = input.albumin_g_dL * 10;                        // g/dL → g/L
  const creatinine_umolL = input.creatinine_mg_dL * 88.4;            // mg/dL → μmol/L
  const glucose_mmolL = input.glucose_mg_dL * 0.0555;                // mg/dL → mmol/L
  const wbc_e9L = input.wbc_K_uL;                                    // K/uL = 10^9/L (same)

  // CRP — floor at 0.01 to avoid log(0); cap at 1000 for sanity
  const crp = Math.min(Math.max(input.crp_mg_L, 0.01), 1000);
  const lnCrp = Math.log(crp);

  // Levine 2018 linear combination
  const xb =
    -19.907 +
    -0.0336 * albumin_gL +
    0.0095 * creatinine_umolL +
    0.1953 * glucose_mmolL +
    0.0954 * lnCrp +
    -0.0120 * input.lymphocyte_pct +
    0.0268 * input.mcv_fL +
    0.3306 * input.rdw_pct +
    0.00188 * input.alp_U_L +
    0.0554 * wbc_e9L +
    0.0804 * input.chronologicalAge;

  // Mortality score from Gompertz survival function
  // Multiplier 197.26 = (exp(0.0076927 × 120) - 1) / 0.0076927
  const mortalityScore = 1 - Math.exp(-197.26 * Math.exp(xb));

  // Edge case: clamp mortality score to avoid log(0) or log(negative)
  const M = Math.min(Math.max(mortalityScore, 1e-10), 1 - 1e-10);

  // Convert mortality score to age scale
  const phenoAge = 141.50225 + Math.log(-0.00553 * Math.log(1 - M)) / 0.090165;

  // Sanity check: PhenoAge should be in plausible range
  if (!isFinite(phenoAge) || phenoAge < -20 || phenoAge > 200) return null;

  const delta = phenoAge - input.chronologicalAge;
  const pace = phenoAge / input.chronologicalAge;

  let category: BioAgeResult['category'];
  if (delta < -1.5) category = 'younger';
  else if (delta > 1.5) category = 'older';
  else category = 'matched';

  return {
    phenoAge: Math.round(phenoAge * 10) / 10,
    chronologicalAge: input.chronologicalAge,
    delta: Math.round(delta * 10) / 10,
    category,
    pace: Math.round(pace * 100) / 100,
  };
}

/**
 * Match a marker name from lab data to one of the 9 PhenoAge markers.
 * Returns the canonical key or null.
 */
function matchMarker(name: string): string | null {
  const n = name.toLowerCase().trim();

  // Albumin: matches "Albumin", "Albumin, Serum", "Serum Albumin"
  // but excludes "Albumin/Globulin Ratio", "Microalbumin", "Albumin Globulin Ratio"
  if (/^albumin(\b|,|\s)/.test(n) && !n.includes('/') && !n.includes('globulin') && !n.includes('a/g')) return 'albumin';
  if (/\balbumin\b/.test(n) && !n.includes('micro') && !n.includes('globulin') && !n.includes('a/g') && !n.includes('/')) return 'albumin';

  // Creatinine: must contain "creatinine" but not "ratio" (BUN/Creatinine Ratio)
  if (n.includes('creatinine') && !n.includes('ratio') && !n.includes('clearance') && !n.includes('urine')) return 'creatinine';

  // Glucose: must be the serum/fasting/blood glucose, not urine
  if (n.includes('glucose') && !n.includes('urine') && !n.includes('post')) return 'glucose';

  // CRP: catch all C-Reactive Protein variants — labs report it many ways:
  // "CRP", "hs-CRP", "hsCRP", "CRP, High Sensitivity", "High Sensitivity CRP",
  // "C-Reactive Protein, Cardiac", etc.
  if (n.includes('c-reactive') || n.includes('c reactive') || /\bcrp\b/.test(n) || n.includes('hscrp')) return 'crp';

  // Lymphocyte percentage (NOT absolute count)
  if (n === 'lymphs' || n === 'lymphocytes' || n.includes('lymphocyte percent') || n.includes('lymph %') || n.includes('lymphs%')) {
    if (n.includes('absolute') || n.includes('abs')) return null;
    return 'lymphocyte';
  }
  // Catch "Lymphs (percent)" or "Lymphocytes %" patterns
  if (/^lymph/.test(n) && !n.includes('absolute') && !n.includes('abs')) return 'lymphocyte';

  // MCV
  if (n === 'mcv' || n.includes('mean corpuscular volume') || n.includes('mean cell volume')) return 'mcv';

  // RDW
  if (n === 'rdw' || n.includes('red cell distribution') || n.includes('rdw-cv') || n.includes('rdw cv')) return 'rdw';

  // Alkaline phosphatase
  if (n.includes('alkaline phosphatase') || n === 'alp' || n === 'alk phos' || n === 'alk. phos.') return 'alp';

  // WBC
  if (n === 'wbc' || n.includes('white blood cell') || n.includes('white cell count') || n === 'leukocytes') return 'wbc';

  return null;
}

/**
 * Convert a CRP value to mg/L based on its unit.
 * US labs sometimes report mg/dL (which is 10× smaller).
 */
function crpToMgL(value: number, unit: string | null): number {
  if (!unit) return value; // assume mg/L
  const u = unit.toLowerCase();
  if (u.includes('mg/dl') || u.includes('mg/dL')) return value * 10;
  return value; // mg/L is the default
}

/**
 * Extract PhenoAge inputs from a list of LabValues + chronological age.
 * Returns the input object if all 9 markers are present, else returns
 * a list of missing markers.
 */
export function extractBioAgeInputs(
  labValues: LabValue[],
  chronologicalAge: number,
): { ok: true; input: BioAgeInput } | { ok: false; missing: string[] } {
  const found: Partial<Record<string, { value: number; unit: string | null }>> = {};

  for (const v of labValues) {
    const key = matchMarker(v.markerName);
    if (key && !found[key] && typeof v.value === 'number') {
      found[key] = { value: v.value, unit: v.unit };
    }
  }

  const missing: string[] = [];
  if (!found.albumin) missing.push('Albumin');
  if (!found.creatinine) missing.push('Creatinine');
  if (!found.glucose) missing.push('Glucose');
  if (!found.crp) missing.push('CRP (or hs-CRP)');
  if (!found.lymphocyte) missing.push('Lymphocyte %');
  if (!found.mcv) missing.push('MCV');
  if (!found.rdw) missing.push('RDW');
  if (!found.alp) missing.push('Alkaline Phosphatase');
  if (!found.wbc) missing.push('WBC');

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    input: {
      albumin_g_dL: found.albumin!.value,
      creatinine_mg_dL: found.creatinine!.value,
      glucose_mg_dL: found.glucose!.value,
      crp_mg_L: crpToMgL(found.crp!.value, found.crp!.unit),
      lymphocyte_pct: found.lymphocyte!.value,
      mcv_fL: found.mcv!.value,
      rdw_pct: found.rdw!.value,
      alp_U_L: found.alp!.value,
      wbc_K_uL: found.wbc!.value,
      chronologicalAge,
    },
  };
}

/**
 * Compute biological age from a list of LabValues and a date of birth.
 * Returns null if inputs are missing or invalid.
 */
export function computeBioAgeFromLabs(
  labValues: LabValue[],
  dateOfBirth: string | null | undefined,
  drawDate: string | null | undefined,
): { result: BioAgeResult } | { missing: string[] } | null {
  if (!dateOfBirth) return null;

  // Compute chronological age at draw date
  const dob = new Date(dateOfBirth);
  const draw = drawDate ? new Date(drawDate) : new Date();
  if (isNaN(dob.getTime()) || isNaN(draw.getTime())) return null;
  const ageMs = draw.getTime() - dob.getTime();
  const chronologicalAge = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (chronologicalAge <= 0 || chronologicalAge > 120) return null;

  const extracted = extractBioAgeInputs(labValues, chronologicalAge);
  if (!extracted.ok) return { missing: extracted.missing };

  const result = computePhenoAge(extracted.input);
  if (!result) return null;
  return { result };
}
