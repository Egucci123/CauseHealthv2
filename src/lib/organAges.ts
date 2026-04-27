// src/lib/organAges.ts
// Per-organ "age" estimates derived from lab values. The math here is intentionally
// transparent — each system has 2-4 weighted markers, normalized to ideal ranges,
// and translated into a years-vs-chronological-age delta.
//
// Goal: give the user 4-5 small, motivating progress bars instead of one abstract score.

export interface OrganAge {
  system: 'Liver' | 'Heart' | 'Metabolic' | 'Blood' | 'Inflammation';
  emoji: string;
  age: number;             // estimated organ age in years
  delta: number;           // organ age − chronological age (negative = younger)
  status: 'younger' | 'on-track' | 'older';
  message: string;         // 1-sentence plain English
  drivers: string[];       // markers that pushed it (for tooltip)
  targetAge?: number;      // projected age after 90-day plan
}

// Accept either camelCase or snake_case shape
interface LabValueLite {
  marker_name?: string;
  markerName?: string;
  value: number;
  optimal_low?: number | null;
  optimalLow?: number | null;
  optimal_high?: number | null;
  optimalHigh?: number | null;
}

const pickName = (v: LabValueLite) => (v.marker_name ?? v.markerName ?? '').toLowerCase();
const pickLow = (v: LabValueLite) => v.optimal_low ?? v.optimalLow ?? null;
const pickHigh = (v: LabValueLite) => v.optimal_high ?? v.optimalHigh ?? null;
const displayName = (v: LabValueLite) => v.marker_name ?? v.markerName ?? '';

const findValue = (vals: LabValueLite[], patterns: string[]): LabValueLite | null => {
  const matches = vals.filter((v) => {
    const n = pickName(v);
    return patterns.some((p) => n.includes(p));
  });
  return matches[0] ?? null;
};

// Score 0..1 for how "out of optimal" a value is. 0 = perfect, 1 = bad.
const outOfRangeScore = (v: LabValueLite, badAtPctOver: number = 50): number => {
  const lo = pickLow(v);
  const hi = pickHigh(v);
  const val = v.value;
  if (lo != null && val < lo) {
    const dist = Math.abs(val - lo) / Math.max(Math.abs(lo), 1);
    return Math.min(1, dist / (badAtPctOver / 100));
  }
  if (hi != null && val > hi) {
    const dist = Math.abs(val - hi) / Math.max(Math.abs(hi), 1);
    return Math.min(1, dist / (badAtPctOver / 100));
  }
  return 0;
};

const ageFromScore = (score: number, chronAge: number, maxYearsAdded: number): number => {
  // score 0 → -3 years (younger when totally optimal), 1 → +maxYearsAdded
  return Math.round(chronAge + (-3 + score * (maxYearsAdded + 3)));
};

export function computeOrganAges(values: LabValueLite[], chronologicalAge: number | null): OrganAge[] {
  if (!chronologicalAge || values.length === 0) return [];
  const out: OrganAge[] = [];

  // ── Liver ──────────────────────────────────────────────────────────────────
  const alt = findValue(values, ['alt', 'sgpt']);
  const ast = findValue(values, ['ast', 'sgot']);
  const ggt = findValue(values, ['ggt']);
  if (alt || ast) {
    const scores = [alt, ast, ggt].filter(Boolean).map((v) => outOfRangeScore(v!, 80));
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const age = ageFromScore(score, chronologicalAge, 18);
    const drivers = [alt && `ALT ${alt.value}`, ast && `AST ${ast.value}`, ggt && `GGT ${ggt.value}`].filter(Boolean) as string[];
    out.push({
      system: 'Liver',
      emoji: '🫀',
      age,
      delta: age - chronologicalAge,
      status: age > chronologicalAge + 2 ? 'older' : age < chronologicalAge - 1 ? 'younger' : 'on-track',
      message: score > 0.4
        ? 'Your liver is working harder than it should — fixable in 12 weeks.'
        : score > 0.1
        ? 'Liver is doing okay. A few tweaks would push it younger.'
        : 'Your liver looks great. Keep it that way.',
      drivers,
      targetAge: Math.max(chronologicalAge - 2, age - 8),
    });
  }

  // ── Heart ──────────────────────────────────────────────────────────────────
  const ldl = findValue(values, ['ldl cholesterol', 'ldl-c', 'ldl ']);
  const hdl = findValue(values, ['hdl']);
  const tg = findValue(values, ['triglyceride']);
  const apoB = findValue(values, ['apolipoprotein b', 'apob']);
  const hsCrp = findValue(values, ['hs-crp', 'hscrp', 'high sensitivity c-reactive']);
  if (ldl || hdl || tg) {
    const items = [ldl, hdl, tg, apoB, hsCrp].filter(Boolean);
    const scores = items.map((v) => outOfRangeScore(v!, 60));
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const age = ageFromScore(score, chronologicalAge, 14);
    const drivers = items.map((v) => `${displayName(v!).split(',')[0].split(' ')[0]} ${v!.value}`);
    out.push({
      system: 'Heart',
      emoji: '❤️',
      age,
      delta: age - chronologicalAge,
      status: age > chronologicalAge + 2 ? 'older' : age < chronologicalAge - 1 ? 'younger' : 'on-track',
      message: score > 0.3
        ? 'Your heart numbers add a few years. Lifestyle moves them faster than meds.'
        : score > 0.1
        ? 'Heart is fine. Small wins from here are mostly diet.'
        : 'Heart age is excellent. Keep doing what you\'re doing.',
      drivers,
      targetAge: Math.max(chronologicalAge - 2, age - 6),
    });
  }

  // ── Metabolic ──────────────────────────────────────────────────────────────
  const glucose = findValue(values, ['fasting glucose', 'glucose, fasting', 'glucose']);
  const a1c = findValue(values, ['a1c', 'hba1c', 'hemoglobin a1c']);
  const insulin = findValue(values, ['fasting insulin', 'insulin']);
  if (glucose || a1c) {
    const items = [glucose, a1c, insulin, tg].filter(Boolean);
    const scores = items.map((v) => outOfRangeScore(v!, 40));
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const age = ageFromScore(score, chronologicalAge, 16);
    const drivers = items.map((v) => `${displayName(v!).split(',')[0].split(' ')[0]} ${v!.value}`);
    out.push({
      system: 'Metabolic',
      emoji: '🍯',
      age,
      delta: age - chronologicalAge,
      status: age > chronologicalAge + 2 ? 'older' : age < chronologicalAge - 1 ? 'younger' : 'on-track',
      message: score > 0.3
        ? 'Your blood sugar is heading the wrong way. The plan reverses this fast.'
        : score > 0.1
        ? 'Metabolism is okay. Walking after meals would lock it in.'
        : 'Your metabolism is dialed.',
      drivers,
      targetAge: Math.max(chronologicalAge - 2, age - 7),
    });
  }

  // ── Inflammation ───────────────────────────────────────────────────────────
  const wbc = findValue(values, ['white blood cell', 'wbc']);
  const esr = findValue(values, ['esr', 'sed rate']);
  if (hsCrp || esr) {
    const items = [hsCrp, esr, wbc].filter(Boolean);
    const scores = items.map((v) => outOfRangeScore(v!, 100));
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const age = ageFromScore(score, chronologicalAge, 12);
    const drivers = items.map((v) => `${displayName(v!).split(',')[0].split(' ')[0]} ${v!.value}`);
    out.push({
      system: 'Inflammation',
      emoji: '🔥',
      age,
      delta: age - chronologicalAge,
      status: age > chronologicalAge + 2 ? 'older' : age < chronologicalAge - 1 ? 'younger' : 'on-track',
      message: score > 0.3
        ? 'Your body is running hot. Calm the gut and inflammation falls fast.'
        : score > 0.1
        ? 'Mild inflammation. Omega-3 and food choices flip this.'
        : 'Inflammation is low — protective.',
      drivers,
      targetAge: Math.max(chronologicalAge - 2, age - 5),
    });
  }

  return out;
}
