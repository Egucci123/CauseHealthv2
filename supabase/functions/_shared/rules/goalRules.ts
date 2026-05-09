// supabase/functions/_shared/rules/goalRules.ts
//
// "FROM HERE / TO HERE" GOAL TARGETS
// ==================================
// For each lab outlier, compute the realistic 90-day target based on
// average treatment-adherent response. Used by the goal-card UI.
//
// Sources:
//   TG response to omega-3 + sleep + diet: meta-analysis Skulas-Ray 2019
//     (~30-40% drop with full adherence over 90d).
//   ALT response to NAFLD lifestyle: AGA 2023 — 25-50% drop with 7-10%
//     weight loss + alcohol cessation + sleep extension.
//   A1c response to lifestyle: ADA 2024 — 0.3-0.6% drop in 90 days.
//   Vit D response to 4000 IU: average rise 10-15 ng/mL in 90d.
//
// Each rule returns a goal value that is OPTIMISTIC-REALISTIC for an
// adherent patient. Frame as "where you'll be in 90 days" not "perfect."

import type { LabOutlierFact } from '../buildPlan.ts';

export interface GoalTarget {
  emoji: string;
  marker: string;          // display label — friendly name, not the raw lab marker
  today: number;
  goal: number;
  unit: string;
  deltaText: string;       // "−40%" or "to 44" — for UI rendering
  confidence: 'high' | 'medium' | 'low';
}

// Friendly display names for markers that have ugly raw names in the DB.
// Universal: applies to every patient. Anywhere a goal-target card is
// rendered, the user sees the friendly name, not the lab's raw label.
const FRIENDLY_LABELS: Array<[RegExp, string]> = [
  [/25.?hydroxy.?vitamin d|vitamin d.*25.?oh|^25.?hydroxy/i, 'Vitamin D'],
  [/^alt\b|sgpt|alanine[\s-]?aminotransferase/i, 'ALT'],
  [/^ast\b|sgot|aspartate[\s-]?aminotransferase/i, 'AST'],
  [/^ggt\b|gamma[\s-]?glutamyl/i, 'GGT'],
  [/hemoglobin a1c|^hba1c\b/i, 'Hemoglobin A1c'],
  [/triglyc/i, 'Triglycerides'],
  [/ferritin/i, 'Ferritin'],
  [/^b[\s-]?12\b|cobalamin/i, 'Vitamin B12'],
  [/hs[\s-]?crp|c[\s-]?reactive/i, 'hs-CRP'],
];

function friendlyLabel(rawMarker: string): string {
  for (const [pat, label] of FRIENDLY_LABELS) {
    if (pat.test(rawMarker)) return label;
  }
  return rawMarker;
}

interface Input {
  outliers: LabOutlierFact[];
  age: number | null;
  sex: 'male' | 'female' | null;
}

interface Rule {
  match: RegExp;
  emoji: string;
  // Returns goal value given today's value, or null if not actionable
  goalFor: (today: number, ctx: { age: number | null; sex: 'male' | 'female' | null }) => { goal: number; deltaText: string; confidence: GoalTarget['confidence'] } | null;
}

const RULES: Rule[] = [
  {
    match: /^alt$|sgpt|alanine\s*aminotransferase/i,
    emoji: '🫀',
    goalFor: (today) => {
      if (today <= 44) return null;
      return { goal: Math.round(today * 0.5), deltaText: `−${Math.round(50)}%`, confidence: 'high' };
    },
  },
  {
    match: /^ast$|sgot|aspartate/i,
    emoji: '🫀',
    goalFor: (today) => {
      if (today <= 40) return null;
      return { goal: Math.round(today * 0.6), deltaText: `−40%`, confidence: 'high' };
    },
  },
  {
    match: /triglyceride/i,
    emoji: '🩸',
    goalFor: (today) => {
      if (today <= 150) return null;
      return { goal: Math.round(today * 0.6), deltaText: `−40%`, confidence: 'high' };
    },
  },
  {
    match: /^ldl|ldl[\s-]*c/i,
    emoji: '🩸',
    goalFor: (today) => {
      if (today <= 100) return null;
      return { goal: Math.max(100, Math.round(today * 0.75)), deltaText: `−25%`, confidence: 'medium' };
    },
  },
  {
    match: /^hdl/i,
    emoji: '💗',
    goalFor: (today, ctx) => {
      const target = ctx.sex === 'female' ? 60 : 50;
      if (today >= target) return null;
      return { goal: target, deltaText: `to ${target}`, confidence: 'medium' };
    },
  },
  {
    match: /a1c|hemoglobin a1c|hba1c/i,
    emoji: '🍯',
    goalFor: (today) => {
      if (today < 5.5) return null;
      const goal = Math.max(5.0, +(today - 0.4).toFixed(1));
      return { goal, deltaText: `−0.4`, confidence: 'medium' };
    },
  },
  {
    match: /^glucose|fasting glucose/i,
    emoji: '🍯',
    goalFor: (today) => {
      if (today <= 90) return null;
      return { goal: 90, deltaText: `−${today - 90}`, confidence: 'medium' };
    },
  },
  {
    match: /vitamin d|25.?hydroxy/i,
    emoji: '☀️',
    goalFor: (today) => {
      if (today >= 40) return null;
      const goal = Math.min(60, today + 20);
      return { goal, deltaText: `to ${goal}`, confidence: 'high' };
    },
  },
  {
    match: /ferritin/i,
    emoji: '🩸',
    goalFor: (today, ctx) => {
      const target = ctx.sex === 'female' ? 75 : 100;
      if (today >= target) return null;
      return { goal: target, deltaText: `to ${target}`, confidence: 'medium' };
    },
  },
  {
    match: /\bb[\s-]?12\b|cobalamin/i,
    emoji: '⚡',
    goalFor: (today) => {
      if (today >= 500) return null;
      return { goal: 500, deltaText: `to 500`, confidence: 'medium' };
    },
  },
  {
    match: /hs[\s-]?crp|c[\s-]?reactive/i,
    emoji: '🔥',
    goalFor: (today) => {
      if (today <= 1.0) return null;
      return { goal: 1.0, deltaText: `to <1.0`, confidence: 'medium' };
    },
  },
  {
    match: /^tsh\b/i,
    emoji: '🦋',
    goalFor: (today) => {
      if (today >= 1.0 && today <= 2.5) return null;
      return { goal: 2.0, deltaText: `to 1.0–2.5`, confidence: 'low' };
    },
  },
];

export function buildGoalTargets(input: Input): GoalTarget[] {
  const targets: GoalTarget[] = [];
  for (const outlier of input.outliers) {
    for (const rule of RULES) {
      if (!rule.match.test(outlier.marker)) continue;
      const out = rule.goalFor(outlier.value, { age: input.age, sex: input.sex });
      if (!out) continue;
      targets.push({
        emoji: rule.emoji,
        marker: friendlyLabel(outlier.marker),
        today: outlier.value,
        goal: out.goal,
        unit: outlier.unit,
        deltaText: out.deltaText,
        confidence: out.confidence,
      });
      break; // one rule per marker
    }
    if (targets.length >= 6) break; // cap at 6 cards for UI
  }
  return targets;
}
