// src/lib/cardiometabolicAge.ts
//
// Cardiometabolic Age — CauseHealth's own clinical composite covering the
// markers PhenoAge ignores (lipids, liver enzymes, glucose control, vitamin D).
//
// PhenoAge (Levine 2018) is a published, peer-reviewed mortality biomarker
// using only 9 specific markers — albumin, creatinine, glucose, CRP,
// lymphocytes, MCV, RDW, ALP, WBC. It systematically misses the *visible*
// metabolic problems most patients actually have: bad lipids, fatty liver,
// pre-diabetes, vitamin D deficiency.
//
// This score fills that gap. It's NOT peer-reviewed. It's a transparent
// rule-of-thumb composite — clearly labeled as such in the UI — that converts
// clinical "stress" on each cardiometabolic marker into a years-of-aging
// estimate. The math is simple on purpose: each marker contributes a stress
// score 0..1 (0 = ideal, 1 = critically bad), the average is multiplied by
// MAX_YEARS_ADDED, and that's added to chronological age.
//
// Use it alongside PhenoAge, never as a replacement.
//
// References for marker thresholds:
//   - Triglycerides: NCEP ATP III
//   - LDL/HDL: AHA/ACC guidelines
//   - ALT/AST: AASLD upper limits + functional-medicine optimal ranges
//   - Fasting glucose / A1c: ADA prediabetes thresholds
//   - Vitamin D: Endocrine Society guidance

import type { LabValue } from '../types';

// Each marker has an "ideal" midpoint and a "danger" boundary. Stress is
// linear distance from ideal toward danger, capped at 1.0. Markers where
// LOWER is worse (HDL, vitamin D) get inverted handling.
interface MarkerSpec {
  key: string;
  /** Patterns to match against marker_name (lowercased, includes-match). */
  patterns: string[];
  /** Where being is best — used as stress=0 anchor. */
  ideal: number;
  /** Where stress reaches 1.0 (worst). */
  danger: number;
  /** True = lower values are worse (HDL, vit D). */
  lowerIsWorse?: boolean;
}

const MARKER_SPECS: MarkerSpec[] = [
  // Lipids
  { key: 'triglycerides', patterns: ['triglyceride'], ideal: 100, danger: 250 },
  { key: 'ldl', patterns: ['ldl cholesterol', '\\bldl\\b'], ideal: 75, danger: 160 },
  { key: 'hdl', patterns: ['hdl cholesterol', '\\bhdl\\b'], ideal: 60, danger: 35, lowerIsWorse: true },
  // Liver
  { key: 'alt', patterns: ['alt (sgpt)', 'alanine', '\\balt\\b'], ideal: 22, danger: 80 },
  { key: 'ast', patterns: ['ast (sgot)', 'aspartate', '\\bast\\b'], ideal: 20, danger: 60 },
  // Glucose control
  { key: 'glucose', patterns: ['fasting glucose', 'glucose, serum', 'glucose, fasting', 'glucose,'], ideal: 85, danger: 110 },
  { key: 'a1c', patterns: ['hba1c', 'hemoglobin a1c', 'a1c'], ideal: 5.0, danger: 6.0 },
  // Vitamin status
  { key: 'vitd', patterns: ['25-hydroxy', 'vitamin d, 25', '25-oh'], ideal: 50, danger: 20, lowerIsWorse: true },
];

// Ceiling on how many years cardiometabolic stress can add. 15 years feels
// right — severe metabolic dysfunction shifts mortality risk by ~10-15 years
// in published cohort studies (e.g., Framingham, ARIC).
const MAX_YEARS_ADDED = 15;

// Floor on years removed (i.e., when EVERYTHING is ideal). Optimistic but
// modest — if a 35-yo has perfect lipids/liver/vit D, we say cardiometabolic
// age is ~32. Don't go further; it'd promise too much.
const MAX_YEARS_REMOVED = 3;

export interface CardiometabolicResult {
  age: number;
  chronologicalAge: number;
  delta: number;                     // age - chronologicalAge (negative = younger)
  category: 'younger' | 'matched' | 'older';
  contributors: Array<{ marker: string; stress: number; value: number }>;
  /** Markers required for the score that weren't found in the lab values. */
  missing: string[];
}

function findValue(values: LabValue[], spec: MarkerSpec): number | null {
  const lower = (s: string) => s.toLowerCase();
  for (const v of values) {
    if (typeof v.value !== 'number') continue;
    const n = lower(v.markerName);
    for (const p of spec.patterns) {
      // Patterns starting with \b are regex; rest are substring matches
      if (p.startsWith('\\b')) {
        if (new RegExp(p, 'i').test(n)) return v.value;
      } else if (n.includes(p)) {
        return v.value;
      }
    }
  }
  return null;
}

function stressFor(spec: MarkerSpec, value: number): number {
  if (spec.lowerIsWorse) {
    // Lower values are worse: stress rises as value drops below ideal toward danger
    if (value >= spec.ideal) return 0;
    if (value <= spec.danger) return 1;
    return (spec.ideal - value) / (spec.ideal - spec.danger);
  }
  // Higher values are worse: standard direction
  if (value <= spec.ideal) return 0;
  if (value >= spec.danger) return 1;
  return (value - spec.ideal) / (spec.danger - spec.ideal);
}

export function computeCardiometabolicAge(
  values: LabValue[],
  chronologicalAge: number,
): CardiometabolicResult | null {
  if (chronologicalAge <= 0 || chronologicalAge > 120) return null;

  const contributors: CardiometabolicResult['contributors'] = [];
  const missing: string[] = [];
  const stresses: number[] = [];

  for (const spec of MARKER_SPECS) {
    const value = findValue(values, spec);
    if (value == null) {
      missing.push(spec.key);
      continue;
    }
    const stress = stressFor(spec, value);
    stresses.push(stress);
    contributors.push({ marker: spec.key, stress, value });
  }

  // Need at least 4 markers (half the panel) to give a meaningful score.
  // Otherwise it's noise and we'd be misleading the user.
  if (stresses.length < 4) return null;

  const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;

  // Map avgStress to years-added. Floor at -MAX_YEARS_REMOVED (when stress=0)
  // and ceiling at +MAX_YEARS_ADDED (when stress=1). Linear in between.
  const yearsDelta = avgStress * (MAX_YEARS_ADDED + MAX_YEARS_REMOVED) - MAX_YEARS_REMOVED;
  const age = Math.round((chronologicalAge + yearsDelta) * 10) / 10;
  const delta = Math.round(yearsDelta * 10) / 10;

  let category: CardiometabolicResult['category'];
  if (delta < -1.5) category = 'younger';
  else if (delta > 1.5) category = 'older';
  else category = 'matched';

  return { age, chronologicalAge, delta, category, contributors, missing };
}
