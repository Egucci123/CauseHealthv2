// src/lib/transformationForecast.ts
// Evidence-based 90-day projection from a current abnormal value to its expected
// post-protocol value, assuming consistent lifestyle adherence (diet + movement +
// targeted supplementation as recommended in the wellness plan).
//
// Sources for expected deltas: peer-reviewed lifestyle/intervention literature.
// We only forecast markers that are CURRENTLY out of optimal range — no point
// promising change for things that are already fine.

export interface MarkerForecast {
  marker: string;
  emoji: string;
  current: number;
  projected: number;
  unit: string;
  delta: string;            // "−40%" or "+15"
  category: string;         // "Metabolic", "Liver", "Inflammation", etc.
  confidence: 'high' | 'moderate' | 'lower';
  why: string;              // 1-sentence plain English
}

interface ResponseRule {
  // matches lab values whose marker_name (lowercased) contains any of these strings
  match: string[];
  category: string;
  emoji: string;
  // returns projected value, or null if not actionable for this user
  project: (current: number) => number | null;
  // delta description: "−40%", "+15", "to 45"
  describe: (current: number, projected: number) => string;
  confidence: 'high' | 'moderate' | 'lower';
  why: string;
  // condition that must be true to forecast (e.g. "only project if currently elevated")
  condition: (current: number, optimalLow?: number | null, optimalHigh?: number | null) => boolean;
}

const RULES: ResponseRule[] = [
  {
    match: ['triglyceride'],
    category: 'Metabolic',
    emoji: '🩸',
    confidence: 'high',
    why: 'Drops 30-50% with low-carb eating, omega-3, and walking after meals.',
    condition: (v) => v > 100,
    project: (v) => Math.round(v * 0.6),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['alt', 'sgpt'],
    category: 'Liver',
    emoji: '🫀',
    confidence: 'high',
    why: 'Liver fat clears with weight loss and lower carb intake — usually drops sharply.',
    condition: (v, _l, h) => v > (h ?? 25),
    project: (v) => Math.max(20, Math.round(v * 0.5)),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['ast', 'sgot'],
    category: 'Liver',
    emoji: '🫀',
    confidence: 'high',
    why: 'Tracks ALT — improves alongside reduced liver inflammation.',
    condition: (v, _l, h) => v > (h ?? 30),
    project: (v) => Math.max(18, Math.round(v * 0.6)),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['vitamin d', '25-hydroxy', '25(oh)'],
    category: 'Vitamin',
    emoji: '☀️',
    confidence: 'high',
    why: '4,000 IU daily reliably raises vitamin D ~20 ng/mL in 12 weeks.',
    condition: (v) => v < 40,
    project: (v) => Math.min(55, Math.round(v + 20)),
    describe: (_c, p) => `to ${p}`,
  },
  {
    match: ['hba1c', 'a1c', 'hemoglobin a1c'],
    category: 'Metabolic',
    emoji: '🍯',
    confidence: 'moderate',
    why: 'A1c reflects 3-month blood sugar — diet + walking can drop it 0.3-0.5 points.',
    condition: (v) => v > 5.4,
    project: (v) => Math.round((v - 0.4) * 10) / 10,
    describe: (c, p) => `−${(c - p).toFixed(1)}`,
  },
  {
    match: ['fasting glucose', 'glucose, fasting', 'glucose'],
    category: 'Metabolic',
    emoji: '🍯',
    confidence: 'moderate',
    why: 'Walking after meals + cutting refined carbs drops fasting glucose 5-10 points.',
    condition: (v) => v >= 95 && v < 126,
    project: (v) => Math.round(v * 0.92),
    describe: (c, p) => `−${c - p}`,
  },
  {
    match: ['ldl'],
    category: 'Cholesterol',
    emoji: '🧈',
    confidence: 'moderate',
    why: 'Lifestyle alone drops LDL 10-15%; meaningful with diet + soluble fiber.',
    condition: (v, _l, h) => v > (h ?? 100),
    project: (v) => Math.round(v * 0.85),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['hdl'],
    category: 'Cholesterol',
    emoji: '🧈',
    confidence: 'moderate',
    why: 'Strength training + omega-3 raises HDL 5-10% over 12 weeks.',
    condition: (v, l) => v < (l ?? 50),
    project: (v) => Math.round(v * 1.08),
    describe: (c, p) => `+${Math.round(((p - c) / c) * 100)}%`,
  },
  {
    match: ['hs-crp', 'hscrp', 'high sensitivity c-reactive', 'c-reactive protein'],
    category: 'Inflammation',
    emoji: '🔥',
    confidence: 'high',
    why: 'Inflammation drops fast with gut healing, omega-3, and weight loss.',
    condition: (v) => v > 1,
    project: (v) => Math.max(0.3, Math.round(v * 0.5 * 10) / 10),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['ferritin'],
    category: 'Iron',
    emoji: '🧣',
    confidence: 'moderate',
    why: 'Iron stores rebuild over 12 weeks with iron + vitamin C and gut healing.',
    condition: (v) => v < 50,
    project: (v) => Math.min(80, Math.round(v + 30)),
    describe: (_c, p) => `to ${p}`,
  },
  {
    match: ['homocysteine'],
    category: 'Cardiovascular',
    emoji: '❤️',
    confidence: 'high',
    why: 'B12, folate, and B6 reliably drop homocysteine in 8-12 weeks.',
    condition: (v) => v > 8,
    project: (v) => Math.max(7, Math.round(v * 0.7 * 10) / 10),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
  {
    match: ['esr'],
    category: 'Inflammation',
    emoji: '🔥',
    confidence: 'moderate',
    why: 'Drops alongside hsCRP as systemic inflammation calms.',
    condition: (v) => v > 15,
    project: (v) => Math.max(8, Math.round(v * 0.6)),
    describe: (c, p) => `−${Math.round(((c - p) / c) * 100)}%`,
  },
];

// Accept either camelCase (from useLatestLabValues mapping) or snake_case (raw DB rows)
interface LabValueLite {
  marker_name?: string;
  markerName?: string;
  value: number;
  unit?: string | null;
  optimal_low?: number | null;
  optimalLow?: number | null;
  optimal_high?: number | null;
  optimalHigh?: number | null;
  optimal_flag?: string | null;
  optimalFlag?: string | null;
}

const pickName = (v: LabValueLite) => v.marker_name ?? v.markerName ?? '';
const pickLow = (v: LabValueLite) => v.optimal_low ?? v.optimalLow ?? null;
const pickHigh = (v: LabValueLite) => v.optimal_high ?? v.optimalHigh ?? null;

export function buildForecasts(values: LabValueLite[]): MarkerForecast[] {
  const out: MarkerForecast[] = [];
  for (const v of values) {
    if (typeof v.value !== 'number' || Number.isNaN(v.value)) continue;
    const markerName = pickName(v);
    const name = markerName.toLowerCase();
    const lo = pickLow(v);
    const hi = pickHigh(v);
    for (const rule of RULES) {
      if (!rule.match.some((m) => name.includes(m))) continue;
      if (!rule.condition(v.value, lo, hi)) continue;
      const projected = rule.project(v.value);
      if (projected == null) continue;
      out.push({
        marker: markerName,
        emoji: rule.emoji,
        current: v.value,
        projected,
        unit: v.unit ?? '',
        delta: rule.describe(v.value, projected),
        category: rule.category,
        confidence: rule.confidence,
        why: rule.why,
      });
      break; // one rule per marker
    }
  }
  // Highest impact first: liver/inflammation/metabolic before cholesterol/iron
  const order = ['Liver', 'Metabolic', 'Inflammation', 'Vitamin', 'Cardiovascular', 'Iron', 'Cholesterol'];
  return out.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)).slice(0, 6);
}
