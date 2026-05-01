// src/lib/cohortReference.ts
// Cohort percentile reference data for major lab markers, stratified by
// age band and sex. Sources: NHANES (US adults), MESA (cardiovascular),
// peer-reviewed reference cohorts. Values are approximate — used to give
// users context, not for diagnostic decisions.
//
// Each entry maps a percentile (10/25/50/75/90) to the value at that
// percentile within the cohort. We compute the user's percentile by
// linear interpolation between the bracketing entries.

type Sex = 'male' | 'female';
type AgeBand = '18-29' | '30-39' | '40-49' | '50-59' | '60-69' | '70+';

interface CohortEntry {
  marker: string;
  // Match against lowercased marker name via includes()
  matchPatterns: string[];
  /** True = higher percentile is better (HDL, eGFR). False = lower is better. */
  higherIsBetter: boolean;
  /** Optional unit hint for display. */
  unit?: string;
  source: string;
  // Percentile values per age × sex band
  data: Partial<Record<Sex, Partial<Record<AgeBand, { p10: number; p25: number; p50: number; p75: number; p90: number }>>>>;
}

// Age band helper
export function ageBand(age: number): AgeBand {
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  if (age < 70) return '60-69';
  return '70+';
}

// Reference data — approximate population distributions from NHANES + cohort studies.
// Values rounded to clinically reasonable precision. Not medical advice.
const REFERENCE: CohortEntry[] = [
  {
    marker: 'ApoB',
    matchPatterns: ['apolipoprotein b', 'apo b', 'apob'],
    higherIsBetter: false,
    unit: 'mg/dL',
    source: 'NHANES + cardiology cohorts',
    data: {
      male: {
        '18-29': { p10: 60, p25: 73, p50: 87, p75: 102, p90: 119 },
        '30-39': { p10: 65, p25: 79, p50: 95, p75: 112, p90: 130 },
        '40-49': { p10: 70, p25: 85, p50: 100, p75: 118, p90: 138 },
        '50-59': { p10: 70, p25: 84, p50: 98, p75: 115, p90: 134 },
        '60-69': { p10: 65, p25: 80, p50: 95, p75: 110, p90: 128 },
        '70+':   { p10: 60, p25: 75, p50: 90, p75: 105, p90: 122 },
      },
      female: {
        '18-29': { p10: 55, p25: 68, p50: 82, p75: 96, p90: 112 },
        '30-39': { p10: 60, p25: 73, p50: 87, p75: 102, p90: 120 },
        '40-49': { p10: 65, p25: 78, p50: 93, p75: 110, p90: 130 },
        '50-59': { p10: 70, p25: 84, p50: 99, p75: 117, p90: 137 },
        '60-69': { p10: 70, p25: 84, p50: 100, p75: 118, p90: 138 },
        '70+':   { p10: 68, p25: 82, p50: 97, p75: 115, p90: 135 },
      },
    },
  },
  {
    marker: 'HbA1c',
    matchPatterns: ['hba1c', 'hemoglobin a1c', 'a1c'],
    higherIsBetter: false,
    unit: '%',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 5.0, p25: 5.1, p50: 5.3, p75: 5.5, p90: 5.7 },
        '30-39': { p10: 5.1, p25: 5.2, p50: 5.4, p75: 5.6, p90: 5.8 },
        '40-49': { p10: 5.2, p25: 5.3, p50: 5.5, p75: 5.7, p90: 6.0 },
        '50-59': { p10: 5.3, p25: 5.5, p50: 5.6, p75: 5.9, p90: 6.3 },
        '60-69': { p10: 5.4, p25: 5.6, p50: 5.8, p75: 6.1, p90: 6.6 },
        '70+':   { p10: 5.4, p25: 5.6, p50: 5.8, p75: 6.1, p90: 6.5 },
      },
      female: {
        '18-29': { p10: 5.0, p25: 5.1, p50: 5.2, p75: 5.4, p90: 5.6 },
        '30-39': { p10: 5.0, p25: 5.2, p50: 5.3, p75: 5.5, p90: 5.7 },
        '40-49': { p10: 5.1, p25: 5.3, p50: 5.4, p75: 5.7, p90: 6.0 },
        '50-59': { p10: 5.3, p25: 5.4, p50: 5.6, p75: 5.9, p90: 6.3 },
        '60-69': { p10: 5.4, p25: 5.6, p50: 5.8, p75: 6.0, p90: 6.5 },
        '70+':   { p10: 5.4, p25: 5.6, p50: 5.7, p75: 6.0, p90: 6.4 },
      },
    },
  },
  {
    marker: 'hs-CRP',
    matchPatterns: ['hs-crp', 'high sensitivity c', 'c-reactive protein, cardiac'],
    higherIsBetter: false,
    unit: 'mg/L',
    source: 'NHANES + AHA reference',
    data: {
      male: {
        '18-29': { p10: 0.2, p25: 0.4, p50: 0.8, p75: 1.6, p90: 3.2 },
        '30-39': { p10: 0.3, p25: 0.5, p50: 1.0, p75: 2.1, p90: 4.5 },
        '40-49': { p10: 0.3, p25: 0.6, p50: 1.2, p75: 2.5, p90: 5.5 },
        '50-59': { p10: 0.4, p25: 0.7, p50: 1.4, p75: 3.0, p90: 6.5 },
        '60-69': { p10: 0.4, p25: 0.8, p50: 1.6, p75: 3.4, p90: 7.0 },
        '70+':   { p10: 0.5, p25: 0.9, p50: 1.8, p75: 3.8, p90: 7.5 },
      },
      female: {
        '18-29': { p10: 0.3, p25: 0.5, p50: 1.0, p75: 2.0, p90: 4.0 },
        '30-39': { p10: 0.3, p25: 0.6, p50: 1.2, p75: 2.5, p90: 5.0 },
        '40-49': { p10: 0.4, p25: 0.7, p50: 1.4, p75: 3.0, p90: 6.0 },
        '50-59': { p10: 0.4, p25: 0.8, p50: 1.6, p75: 3.5, p90: 7.0 },
        '60-69': { p10: 0.5, p25: 0.9, p50: 1.8, p75: 3.8, p90: 7.5 },
        '70+':   { p10: 0.5, p25: 1.0, p50: 2.0, p75: 4.0, p90: 8.0 },
      },
    },
  },
  {
    marker: 'Fasting Glucose',
    matchPatterns: ['fasting glucose', 'glucose, serum', 'glucose, fasting', '^glucose$'],
    higherIsBetter: false,
    unit: 'mg/dL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 79, p25: 85, p50: 91, p75: 96, p90: 101 },
        '30-39': { p10: 82, p25: 88, p50: 93, p75: 99, p90: 105 },
        '40-49': { p10: 84, p25: 90, p50: 95, p75: 102, p90: 110 },
        '50-59': { p10: 86, p25: 92, p50: 98, p75: 105, p90: 116 },
        '60-69': { p10: 87, p25: 93, p50: 99, p75: 107, p90: 121 },
        '70+':   { p10: 87, p25: 93, p50: 99, p75: 107, p90: 120 },
      },
      female: {
        '18-29': { p10: 76, p25: 82, p50: 87, p75: 92, p90: 97 },
        '30-39': { p10: 78, p25: 84, p50: 89, p75: 94, p90: 100 },
        '40-49': { p10: 80, p25: 86, p50: 91, p75: 97, p90: 105 },
        '50-59': { p10: 83, p25: 89, p50: 94, p75: 100, p90: 110 },
        '60-69': { p10: 85, p25: 91, p50: 96, p75: 103, p90: 116 },
        '70+':   { p10: 86, p25: 91, p50: 96, p75: 103, p90: 115 },
      },
    },
  },
  {
    marker: 'HDL Cholesterol',
    matchPatterns: ['\\bhdl\\b'],
    higherIsBetter: true,
    unit: 'mg/dL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 36, p25: 42, p50: 49, p75: 57, p90: 67 },
        '30-39': { p10: 35, p25: 41, p50: 47, p75: 55, p90: 65 },
        '40-49': { p10: 35, p25: 41, p50: 48, p75: 56, p90: 67 },
        '50-59': { p10: 36, p25: 42, p50: 49, p75: 58, p90: 70 },
        '60-69': { p10: 37, p25: 44, p50: 51, p75: 60, p90: 72 },
        '70+':   { p10: 38, p25: 45, p50: 52, p75: 61, p90: 73 },
      },
      female: {
        '18-29': { p10: 43, p25: 50, p50: 58, p75: 67, p90: 78 },
        '30-39': { p10: 43, p25: 50, p50: 58, p75: 67, p90: 78 },
        '40-49': { p10: 44, p25: 51, p50: 59, p75: 69, p90: 81 },
        '50-59': { p10: 45, p25: 53, p50: 62, p75: 73, p90: 86 },
        '60-69': { p10: 47, p25: 55, p50: 64, p75: 75, p90: 88 },
        '70+':   { p10: 48, p25: 55, p50: 64, p75: 75, p90: 88 },
      },
    },
  },
  {
    marker: 'Total Cholesterol',
    matchPatterns: ['cholesterol, total', 'total cholesterol', '^cholesterol$'],
    higherIsBetter: false,
    unit: 'mg/dL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 140, p25: 160, p50: 180, p75: 205, p90: 230 },
        '30-39': { p10: 155, p25: 175, p50: 195, p75: 220, p90: 250 },
        '40-49': { p10: 160, p25: 180, p50: 200, p75: 225, p90: 255 },
        '50-59': { p10: 160, p25: 180, p50: 200, p75: 225, p90: 250 },
        '60-69': { p10: 155, p25: 175, p50: 195, p75: 220, p90: 245 },
        '70+':   { p10: 150, p25: 170, p50: 190, p75: 215, p90: 240 },
      },
      female: {
        '18-29': { p10: 140, p25: 158, p50: 180, p75: 202, p90: 225 },
        '30-39': { p10: 150, p25: 170, p50: 190, p75: 215, p90: 245 },
        '40-49': { p10: 165, p25: 185, p50: 205, p75: 230, p90: 260 },
        '50-59': { p10: 175, p25: 195, p50: 215, p75: 245, p90: 280 },
        '60-69': { p10: 180, p25: 200, p50: 220, p75: 250, p90: 285 },
        '70+':   { p10: 175, p25: 195, p50: 215, p75: 245, p90: 280 },
      },
    },
  },
  {
    marker: 'LDL Cholesterol',
    matchPatterns: ['\\bldl\\b'],
    higherIsBetter: false,
    unit: 'mg/dL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 65, p25: 80, p50: 96, p75: 115, p90: 137 },
        '30-39': { p10: 73, p25: 88, p50: 105, p75: 125, p90: 148 },
        '40-49': { p10: 80, p25: 96, p50: 113, p75: 133, p90: 155 },
        '50-59': { p10: 80, p25: 95, p50: 112, p75: 132, p90: 154 },
        '60-69': { p10: 73, p25: 88, p50: 104, p75: 124, p90: 145 },
        '70+':   { p10: 70, p25: 85, p50: 100, p75: 119, p90: 140 },
      },
      female: {
        '18-29': { p10: 60, p25: 73, p50: 88, p75: 105, p90: 125 },
        '30-39': { p10: 65, p25: 79, p50: 94, p75: 112, p90: 134 },
        '40-49': { p10: 72, p25: 87, p50: 104, p75: 123, p90: 146 },
        '50-59': { p10: 80, p25: 95, p50: 113, p75: 134, p90: 158 },
        '60-69': { p10: 80, p25: 96, p50: 113, p75: 134, p90: 156 },
        '70+':   { p10: 78, p25: 93, p50: 110, p75: 130, p90: 152 },
      },
    },
  },
  {
    marker: 'Triglycerides',
    matchPatterns: ['triglyceride'],
    higherIsBetter: false,
    unit: 'mg/dL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 50, p25: 65, p50: 87, p75: 122, p90: 175 },
        '30-39': { p10: 55, p25: 75, p50: 105, p75: 150, p90: 220 },
        '40-49': { p10: 60, p25: 82, p50: 115, p75: 165, p90: 240 },
        '50-59': { p10: 60, p25: 82, p50: 115, p75: 162, p90: 230 },
        '60-69': { p10: 58, p25: 78, p50: 108, p75: 150, p90: 215 },
        '70+':   { p10: 55, p25: 75, p50: 102, p75: 142, p90: 200 },
      },
      female: {
        '18-29': { p10: 45, p25: 58, p50: 75, p75: 100, p90: 140 },
        '30-39': { p10: 48, p25: 62, p50: 82, p75: 112, p90: 158 },
        '40-49': { p10: 53, p25: 70, p50: 95, p75: 132, p90: 188 },
        '50-59': { p10: 60, p25: 80, p50: 110, p75: 152, p90: 215 },
        '60-69': { p10: 62, p25: 82, p50: 112, p75: 155, p90: 220 },
        '70+':   { p10: 60, p25: 80, p50: 108, p75: 150, p90: 210 },
      },
    },
  },
  {
    marker: 'Ferritin',
    matchPatterns: ['ferritin'],
    higherIsBetter: false, // higher is risky (iron overload), lower is risky (deficiency) — single number doesn't tell whole story
    unit: 'ng/mL',
    source: 'NHANES 2017-2020',
    data: {
      male: {
        '18-29': { p10: 40, p25: 75, p50: 130, p75: 220, p90: 340 },
        '30-39': { p10: 55, p25: 95, p50: 165, p75: 270, p90: 420 },
        '40-49': { p10: 65, p25: 110, p50: 185, p75: 300, p90: 460 },
        '50-59': { p10: 65, p25: 115, p50: 195, p75: 315, p90: 480 },
        '60-69': { p10: 60, p25: 105, p50: 180, p75: 290, p90: 440 },
        '70+':   { p10: 55, p25: 95, p50: 165, p75: 265, p90: 400 },
      },
      female: {
        '18-29': { p10: 12, p25: 22, p50: 38, p75: 65, p90: 110 },
        '30-39': { p10: 15, p25: 28, p50: 48, p75: 82, p90: 140 },
        '40-49': { p10: 20, p25: 38, p50: 65, p75: 110, p90: 180 },
        '50-59': { p10: 35, p25: 65, p50: 110, p75: 175, p90: 270 },
        '60-69': { p10: 45, p25: 78, p50: 130, p75: 205, p90: 310 },
        '70+':   { p10: 45, p25: 78, p50: 130, p75: 205, p90: 310 },
      },
    },
  },
  {
    marker: 'Vitamin D (25-OH)',
    matchPatterns: ['vitamin d', '25-oh', '25-hydroxy'],
    higherIsBetter: true,
    unit: 'ng/mL',
    source: 'NHANES 2017-2018',
    data: {
      male: {
        '18-29': { p10: 13, p25: 18, p50: 24, p75: 32, p90: 42 },
        '30-39': { p10: 14, p25: 19, p50: 26, p75: 34, p90: 44 },
        '40-49': { p10: 15, p25: 21, p50: 28, p75: 37, p90: 48 },
        '50-59': { p10: 16, p25: 22, p50: 30, p75: 40, p90: 52 },
        '60-69': { p10: 17, p25: 24, p50: 32, p75: 42, p90: 54 },
        '70+':   { p10: 17, p25: 24, p50: 32, p75: 42, p90: 54 },
      },
      female: {
        '18-29': { p10: 12, p25: 17, p50: 23, p75: 31, p90: 42 },
        '30-39': { p10: 13, p25: 18, p50: 25, p75: 33, p90: 44 },
        '40-49': { p10: 14, p25: 20, p50: 27, p75: 36, p90: 48 },
        '50-59': { p10: 15, p25: 22, p50: 30, p75: 40, p90: 53 },
        '60-69': { p10: 17, p25: 24, p50: 33, p75: 44, p90: 58 },
        '70+':   { p10: 17, p25: 25, p50: 33, p75: 45, p90: 58 },
      },
    },
  },
  {
    marker: 'Total Testosterone',
    matchPatterns: ['testosterone, total', 'total testosterone', '^testosterone$'],
    higherIsBetter: true,
    unit: 'ng/dL',
    source: 'NHANES + endocrinology cohorts',
    data: {
      male: {
        '18-29': { p10: 350, p25: 460, p50: 580, p75: 720, p90: 880 },
        '30-39': { p10: 320, p25: 430, p50: 540, p75: 670, p90: 820 },
        '40-49': { p10: 290, p25: 390, p50: 500, p75: 620, p90: 760 },
        '50-59': { p10: 260, p25: 360, p50: 460, p75: 580, p90: 710 },
        '60-69': { p10: 240, p25: 330, p50: 430, p75: 550, p90: 680 },
        '70+':   { p10: 220, p25: 310, p50: 410, p75: 530, p90: 660 },
      },
      female: {
        '18-29': { p10: 12, p25: 20, p50: 30, p75: 45, p90: 65 },
        '30-39': { p10: 10, p25: 18, p50: 28, p75: 42, p90: 60 },
        '40-49': { p10: 9, p25: 16, p50: 25, p75: 38, p90: 55 },
        '50-59': { p10: 8, p25: 14, p50: 22, p75: 33, p90: 48 },
        '60-69': { p10: 7, p25: 12, p50: 18, p75: 28, p90: 40 },
        '70+':   { p10: 6, p25: 10, p50: 16, p75: 25, p90: 36 },
      },
    },
  },
];

export interface CohortPercentile {
  marker: string;
  percentile: number; // 0-100
  source: string;
  /** Phrase like "top 25% for 30-39 men" */
  context: string;
  higherIsBetter: boolean;
}

/** Find the matching reference entry for a marker name.
 *
 * Patterns containing regex meta-characters (^, $, \b, \\) are treated as
 * regex; otherwise we do a substring match. This fixes the bug where
 * "vldl cholesterol cal" was matching the LDL entry because "ldl cholesterol"
 * is a substring of "vldl cholesterol".
 */
function findEntry(markerName: string): CohortEntry | null {
  const n = markerName.toLowerCase();
  for (const e of REFERENCE) {
    if (e.matchPatterns.some(p => {
      // Anything looking like a regex (^, $, \b, \\, |) goes through RegExp
      if (/[\^$|\\]/.test(p)) return new RegExp(p, 'i').test(n);
      return n.includes(p);
    })) {
      return e;
    }
  }
  return null;
}

/** Compute the user's percentile via linear interpolation between known points. */
function interpolatePercentile(
  value: number,
  points: { p10: number; p25: number; p50: number; p75: number; p90: number },
): number {
  // Build array of (percentile, value) anchors, plus extrapolation tails
  const anchors: [number, number][] = [
    [0, points.p10 - (points.p25 - points.p10)], // extrapolate below p10
    [10, points.p10],
    [25, points.p25],
    [50, points.p50],
    [75, points.p75],
    [90, points.p90],
    [100, points.p90 + (points.p90 - points.p75)], // extrapolate above p90
  ];

  // Walk anchors and interpolate
  for (let i = 0; i < anchors.length - 1; i++) {
    const [pa, va] = anchors[i];
    const [pb, vb] = anchors[i + 1];
    if (value >= va && value <= vb) {
      const span = vb - va;
      if (span === 0) return pa;
      const ratio = (value - va) / span;
      return Math.round(pa + ratio * (pb - pa));
    }
  }
  // Off the chart
  return value < anchors[0][1] ? 0 : 100;
}

/**
 * Compute a user's cohort percentile for a given marker, age, sex.
 * Returns null if no reference data, no age, no sex, or the value is invalid.
 */
export function computeCohortPercentile(
  markerName: string,
  value: number,
  age: number | null | undefined,
  sex: 'male' | 'female' | 'other' | null | undefined,
): CohortPercentile | null {
  if (age == null || (sex !== 'male' && sex !== 'female')) return null;
  if (!isFinite(value)) return null;

  const entry = findEntry(markerName);
  if (!entry) return null;

  const band = ageBand(age);
  const points = entry.data[sex]?.[band];
  if (!points) return null;

  const rawPct = interpolatePercentile(value, points);

  // For higherIsBetter markers (HDL, vit D, testosterone), invert the framing:
  // a value at percentile 80 means "you're better than 80% of cohort." For
  // not-higher-is-better (LDL, A1c, etc.), value at percentile 80 means
  // "80% of cohort is below you" — which is the worse position.
  // We want the user-facing percentile to mean "how good are you" — so for
  // not-higher-is-better, flip it: rank = 100 - rawPct.
  const userPercentile = entry.higherIsBetter ? rawPct : 100 - rawPct;

  const sexLabel = sex === 'male' ? 'men' : 'women';
  let context: string;
  if (userPercentile >= 90) context = `Top 10% for ${age}-yr-old ${sexLabel}`;
  else if (userPercentile >= 75) context = `Top 25% for ${age}-yr-old ${sexLabel}`;
  else if (userPercentile >= 50) context = `Better than half of ${age}-yr-old ${sexLabel}`;
  else if (userPercentile >= 25) context = `Bottom half for ${age}-yr-old ${sexLabel}`;
  else if (userPercentile >= 10) context = `Bottom 25% for ${age}-yr-old ${sexLabel}`;
  else context = `Bottom 10% for ${age}-yr-old ${sexLabel}`;

  return {
    marker: entry.marker,
    percentile: userPercentile,
    source: entry.source,
    context,
    higherIsBetter: entry.higherIsBetter,
  };
}
