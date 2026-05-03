// supabase/functions/_shared/causalChainBuilder.ts
//
// Layer A — causal chain builder. UNIVERSAL declarative graph of:
//   ROOT causes (under-replaced thyroid, postmenopause, sleep deprivation,
//   chronic inflammation, insulin resistance, etc.)
//      ↓ drives
//   INTERMEDIATE markers (hs-CRP elevated, atherogenic LDL pattern,
//   weight resistance, brain fog)
//      ↓ drives
//   OUTCOMES (fatigue, joint pain, hair loss, low libido, etc.)
//
// Detect which causes are present in THIS patient → walk the graph →
// produce a layered narrative ranked by leverage.
//
// Universal: every cause is detected by the same primitives we already
// have (lab values, conditions, meds, symptoms, adequacy flags). Adding
// a new cause = adding one node to the graph.
//
// THIS is the synthesis no single specialist would build. Endo sees TSH.
// Cardio sees LDL. Gyn sees FSH. NO ONE sees the cascade.

import { hasCondition } from './conditionAliases.ts';
import { isOnMed } from './medicationAliases.ts';

export type Layer = 1 | 2 | 3 | 4;
export type Leverage = 'high' | 'medium' | 'low';

export interface CausalNode {
  /** Stable id. */
  key: string;
  /** Layer in the cascade (1=root, 4=outcome symptom). */
  layer: Layer;
  /** Plain-English label for UI. */
  label: string;
  /** Why is this present in THIS patient? */
  evidence: string;
  /** Leverage = how much fixing THIS reduces downstream layers. */
  leverage: Leverage;
}

export interface CausalEdge {
  from: string;
  to: string;
}

export interface CausalChain {
  nodes: CausalNode[];
  edges: CausalEdge[];
  /** Top 3 leverage-ranked nodes (the highest-impact fixes). */
  topInterventions: CausalNode[];
}

export interface ChainCtx {
  conditionsLower: string;
  medsLower: string;
  symptomsLower: string;
  age: number | null;
  sex: string | null;
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>;
  /** Adequacy flags from replacementTherapyChecks. */
  adequacyKeys: string[];
  /** Self-reported sleep hours / day, if available. */
  sleepHours: number | null;
}

// ── Detector primitives ──────────────────────────────────────────────────
function getMarker(labs: ChainCtx['labValues'], patterns: RegExp[]): { value: number; flag: string } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) return { value: num, flag: (v.optimal_flag ?? '').toLowerCase() };
    }
  }
  return null;
}
function hasSymptom(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

// ── Cause definitions (declarative graph) ────────────────────────────────
//
// Each cause:
//   - detect(): returns evidence string if present in this patient
//   - layer / leverage: determine ordering
//   - drives: list of cause keys it propagates to (the edges)
interface CauseDef {
  key: string;
  layer: Layer;
  label: string;
  leverage: Leverage;
  detect: (ctx: ChainCtx) => string | null;
  drives: string[];
}

const CAUSES: CauseDef[] = [
  // ── LAYER 1: ROOT CAUSES ──────────────────────────────────────────────
  {
    key: 'under_replaced_thyroid',
    layer: 1, label: 'Under-replaced thyroid',
    leverage: 'high',
    detect: (ctx) => ctx.adequacyKeys.includes('thyroid_replacement_tsh_high') ? 'TSH on replacement is above target (0.5–2.0)' : null,
    drives: ['chronic_inflammation', 'metabolic_slowdown', 'cold_extremities', 'fatigue_outcome', 'brain_fog_outcome', 'weight_outcome', 'hair_loss_outcome'],
  },
  {
    key: 'postmenopause',
    layer: 1, label: 'Postmenopausal hormone shift',
    leverage: 'high',
    detect: (ctx) => {
      const fsh = getMarker(ctx.labValues, [/^fsh\b/i, /follicle stim/i]);
      if (fsh && fsh.value > 30 && (ctx.sex ?? '').toLowerCase() === 'female') {
        return `FSH ${fsh.value} (postmenopausal pattern)`;
      }
      if (hasCondition(ctx.conditionsLower, 'menopause_postmenopause')) return 'menopause / postmenopause stated';
      return null;
    },
    drives: ['chronic_inflammation', 'atherogenic_lipids', 'low_libido_outcome', 'sleep_disruption', 'weight_outcome', 'joint_outcome'],
  },
  {
    key: 'insulin_resistance',
    layer: 1, label: 'Insulin resistance pattern',
    leverage: 'high',
    detect: (ctx) => {
      const a1c = getMarker(ctx.labValues, [/hemoglobin a1c/i, /^a1c\b/i]);
      const ins = getMarker(ctx.labValues, [/^insulin$/i, /fasting insulin/i]);
      if (a1c && a1c.value >= 5.7) return `A1c ${a1c.value}%`;
      if (ins && ins.value >= 10) return `Fasting insulin ${ins.value}`;
      if (hasCondition(ctx.conditionsLower, 't2d')) return 'diabetes / insulin resistance stated';
      return null;
    },
    drives: ['chronic_inflammation', 'atherogenic_lipids', 'weight_outcome', 'sugar_cravings_outcome', 'fatigue_outcome'],
  },
  {
    key: 'sleep_deprivation',
    layer: 1, label: 'Chronic sleep deprivation',
    leverage: 'high',
    detect: (ctx) => {
      if (ctx.sleepHours != null && ctx.sleepHours < 6.5) return `Self-reported ~${ctx.sleepHours} hr/night`;
      if (hasSymptom(ctx.symptomsLower, [/insomn/i, /can'?t (fall|stay) asleep/i, /difficulty (falling|staying) asleep/i, /waking (during|at|in the) night/i])) return 'sleep symptoms reported';
      if (hasCondition(ctx.conditionsLower, 'sleep_apnea')) return 'OSA stated';
      return null;
    },
    drives: ['chronic_inflammation', 'metabolic_slowdown', 'fatigue_outcome', 'brain_fog_outcome', 'weight_outcome', 'mood_outcome'],
  },
  {
    key: 'autoimmune_activity',
    layer: 1, label: 'Active autoimmune disease',
    leverage: 'high',
    detect: (ctx) => {
      const dxs = ['hashimotos', 'graves', 'lupus', 'ra', 'ibd', 'celiac', 'ms', 'psoriasis', 'sjogrens', 'long_covid'];
      const hits = dxs.filter(k => hasCondition(ctx.conditionsLower, k));
      return hits.length > 0 ? `autoimmune dx: ${hits.join(', ')}` : null;
    },
    drives: ['chronic_inflammation', 'fatigue_outcome', 'joint_outcome', 'gi_outcome'],
  },

  // ── LAYER 2: INTERMEDIATE STATES ──────────────────────────────────────
  {
    key: 'chronic_inflammation',
    layer: 2, label: 'Chronic systemic inflammation',
    leverage: 'medium',
    detect: (ctx) => {
      const crp = getMarker(ctx.labValues, [/hs[-\s]?crp/i, /c[-\s]?reactive protein/i]);
      if (crp && crp.value >= 1.0) return `hs-CRP ${crp.value} mg/L`;
      return null;
    },
    drives: ['atherogenic_lipids', 'fatigue_outcome', 'joint_outcome', 'brain_fog_outcome'],
  },
  {
    key: 'atherogenic_lipids',
    layer: 2, label: 'Atherogenic lipid pattern (small dense LDL + low large HDL)',
    leverage: 'medium',
    detect: (ctx) => {
      const ldlp = getMarker(ctx.labValues, [/^ldl p/i, /ldl particle/i]);
      const smallLdlP = getMarker(ctx.labValues, [/small ldl p/i]);
      const largeHdlP = getMarker(ctx.labValues, [/large hdl p/i]);
      if ((ldlp && ldlp.flag.includes('high')) || (smallLdlP && smallLdlP.flag.includes('high')) || (largeHdlP && largeHdlP.flag.includes('low'))) {
        const parts: string[] = [];
        if (ldlp) parts.push(`LDL-P ${ldlp.value}`);
        if (smallLdlP) parts.push(`small LDL-P ${smallLdlP.value}`);
        if (largeHdlP) parts.push(`Large HDL-P ${largeHdlP.value}`);
        return parts.join(', ');
      }
      const tg = getMarker(ctx.labValues, [/^triglyc/i, /^tg$/i]);
      if (tg && tg.value > 150) return `Triglycerides ${tg.value}`;
      return null;
    },
    drives: ['cardiovascular_risk_outcome'],
  },
  {
    key: 'metabolic_slowdown',
    layer: 2, label: 'Metabolic slowdown',
    leverage: 'medium',
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/slow metab/i, /weight gain/i, /can'?t lose weight/i, /cold (hands|feet|intoler)/i, /always cold/i]) ? 'metabolic-slowdown symptom cluster reported' : null,
    drives: ['weight_outcome', 'cold_extremities'],
  },
  {
    key: 'sleep_disruption',
    layer: 2, label: 'Sleep architecture disruption',
    leverage: 'medium',
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/waking (during|in the|at) night/i, /insomn/i, /difficulty (falling|staying) asleep/i]) ? 'sleep-disruption symptoms reported' : null,
    drives: ['fatigue_outcome', 'brain_fog_outcome', 'mood_outcome'],
  },

  // ── LAYER 3: SYMPTOMS / OUTCOMES (terminal nodes) ─────────────────────
  { key: 'fatigue_outcome', layer: 3, label: 'Chronic fatigue', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/fatigue/i, /tired/i, /low energy/i]) ? 'reported' : null },
  { key: 'brain_fog_outcome', layer: 3, label: 'Brain fog / poor memory', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/brain fog/i, /poor memory/i, /difficulty concentrating/i]) ? 'reported' : null },
  { key: 'weight_outcome', layer: 3, label: 'Weight gain / weight resistance', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/weight gain/i, /can'?t lose weight/i, /difficulty losing weight/i]) ? 'reported' : null },
  { key: 'cold_extremities', layer: 3, label: 'Cold hands / feet', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/cold (hands|feet)/i, /cold intoler/i]) ? 'reported' : null },
  { key: 'hair_loss_outcome', layer: 3, label: 'Hair loss / thinning', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/hair (loss|thin|fall)/i]) ? 'reported' : null },
  { key: 'low_libido_outcome', layer: 3, label: 'Low libido', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/low libido/i, /sex drive/i]) ? 'reported' : null },
  { key: 'joint_outcome', layer: 3, label: 'Joint / muscle pain', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/joint pain/i, /muscle pain/i, /hip pain/i]) ? 'reported' : null },
  { key: 'gi_outcome', layer: 3, label: 'GI symptoms', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/bloat/i, /gas/i, /diarrhea/i, /constipation/i]) ? 'reported' : null },
  { key: 'mood_outcome', layer: 3, label: 'Anxiety / mood', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/anxiety/i, /depress/i, /low mood/i]) ? 'reported' : null },
  { key: 'sugar_cravings_outcome', layer: 3, label: 'Sugar / carb cravings', leverage: 'low', drives: [],
    detect: (ctx) => hasSymptom(ctx.symptomsLower, [/sugar craving/i, /carb craving/i]) ? 'reported' : null },
  { key: 'cardiovascular_risk_outcome', layer: 3, label: 'Elevated cardiovascular risk', leverage: 'low', drives: [],
    detect: () => null,
  },
];

const BY_KEY = new Map(CAUSES.map(c => [c.key, c]));

export function buildCausalChain(ctx: ChainCtx): CausalChain {
  // Detect every cause that's present.
  const presentNodes = new Map<string, CausalNode>();
  for (const c of CAUSES) {
    const evidence = c.detect(ctx);
    if (evidence) {
      presentNodes.set(c.key, {
        key: c.key,
        layer: c.layer,
        label: c.label,
        evidence,
        leverage: c.leverage,
      });
    }
  }

  // For atherogenic_lipids and cardiovascular_risk_outcome — if lipid pattern
  // detected, force the CV-risk outcome too (that's an inferred consequence).
  if (presentNodes.has('atherogenic_lipids') && !presentNodes.has('cardiovascular_risk_outcome')) {
    presentNodes.set('cardiovascular_risk_outcome', {
      key: 'cardiovascular_risk_outcome',
      layer: 3,
      label: 'Elevated cardiovascular risk',
      evidence: 'inferred from atherogenic lipid pattern',
      leverage: 'low',
    });
  }

  // Build edges only between present nodes.
  const edges: CausalEdge[] = [];
  for (const node of presentNodes.values()) {
    const def = BY_KEY.get(node.key);
    if (!def) continue;
    for (const target of def.drives) {
      if (presentNodes.has(target)) edges.push({ from: node.key, to: target });
    }
  }

  // Top interventions = layer-1 nodes (root causes) ranked by leverage.
  // High > medium > low; ties broken by node order in CAUSES (stable).
  const lev = (l: Leverage) => l === 'high' ? 0 : l === 'medium' ? 1 : 2;
  const topInterventions = [...presentNodes.values()]
    .filter(n => n.layer === 1)
    .sort((a, b) => lev(a.leverage) - lev(b.leverage))
    .slice(0, 3);

  return {
    nodes: [...presentNodes.values()].sort((a, b) => a.layer - b.layer),
    edges,
    topInterventions,
  };
}

/** Render the chain as a plain-text block for the prompt. */
export function renderChainForPrompt(chain: CausalChain): string {
  if (chain.nodes.length === 0) return '';
  const byLayer: Record<number, CausalNode[]> = { 1: [], 2: [], 3: [] };
  for (const n of chain.nodes) (byLayer[n.layer] ??= []).push(n);
  const lines: string[] = ['CAUSAL CHAIN — what drives what for THIS patient (use this in the summary so the user sees the cascade, not a flat list of findings):'];
  if (byLayer[1].length) lines.push(`  ROOT CAUSES (Layer 1): ${byLayer[1].map(n => `${n.label} [${n.evidence}]`).join('; ')}`);
  if (byLayer[2].length) lines.push(`    ↓ drives (Layer 2): ${byLayer[2].map(n => `${n.label} [${n.evidence}]`).join('; ')}`);
  if (byLayer[3].length) lines.push(`      ↓ drives (Layer 3 — outcomes): ${byLayer[3].map(n => n.label).join(', ')}`);
  if (chain.topInterventions.length) lines.push(`HIGHEST-LEVERAGE FIXES (start here): ${chain.topInterventions.map(n => n.label).join(', ')}`);
  return lines.join('\n');
}
