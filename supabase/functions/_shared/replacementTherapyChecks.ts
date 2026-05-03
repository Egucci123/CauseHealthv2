// supabase/functions/_shared/replacementTherapyChecks.ts
//
// Universal "is the dose right?" engine. Data-driven rules — adding a new
// drug-class adequacy check is editing the RULES array, never the loop.
//
// Each rule: when (medClass present) AND (lab marker outside target range)
// → emit an AdequacyFlag. The flag carries severity, plain-English copy,
// today_action text, retest registry keys to inject, and an optional
// "headline must mention" string for the prompt verifier.
//
// Pattern works for every replacement therapy: thyroid (TSH/Free T4), TRT
// (Hct/E2), insulin/sulfonylurea (A1c), ACE/ARB (K+), thiazide/loop (K+),
// statin (ALT). Add a new drug class to the rules array and it's covered
// universally for every patient on that class.

import { isOnMed } from './medicationAliases.ts';

export interface AdequacyCheckInput {
  medsLower: string;
  labValues: Array<{
    marker_name?: string;
    value?: number | string | null;
    unit?: string | null;
  }>;
  age: number | null;
  sex: string | null;
}

export interface AdequacyFlag {
  key: string;
  severity: 'critical' | 'high' | 'moderate';
  title: string;
  detail: string;
  evidence: string;
  todayAction?: string;
  retestKeysToInject: string[];
  headlineMustMention?: string;
}

// Pull a numeric lab value matching ANY of the alias regexes.
function getMarker(
  labValues: AdequacyCheckInput['labValues'],
  patterns: RegExp[],
): { value: number; unit: string | null; markerName: string } | null {
  for (const v of labValues) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) return { value: num, unit: v.unit ?? null, markerName: name };
    }
  }
  return null;
}

// ── Rule definitions (data-driven) ───────────────────────────────────────
// Each rule declares: which med class triggers it, which marker(s) to read,
// the target range, copy templates, and what tests to inject if it fires.
// Adding a rule = pushing one object. Universal — every patient on the
// matching med class is checked.

interface RuleSpec {
  /** Stable id used in audit logs / UI. */
  id: string;
  /** Med class keys (any one matching activates the rule). */
  medClasses: string[];
  /** Markers to read. First match wins. */
  markerPatterns: RegExp[];
  /** Optional unit guard (e.g., 'ng/dl' for Free T4). */
  unitContains?: string;
  /** Range: [min, max]. Out-of-range fires the flag. */
  optimalRange: [number, number];
  /** Severity: which side is the harm? Used to choose direction copy. */
  severityWhen: { lowSev: 'critical' | 'high' | 'moderate' | null; highSev: 'critical' | 'high' | 'moderate' | null };
  /** Copy for low / high directions. Template literals — `${value}` `${unit}`. */
  copy: {
    lowTitle?: string;  lowDetail?: string;  lowAction?: string;
    highTitle?: string; highDetail?: string; highAction?: string;
  };
  /** Tests to inject regardless of direction. */
  retestKeys: string[];
  /** Headline-must-mention template. */
  headlineTemplate?: (direction: 'low' | 'high', value: number, unit: string | null) => string;
  /** Optional severity bump rule when a value is way out of range. */
  criticalIf?: { gt?: number; lt?: number };
}

const RULES: RuleSpec[] = [
  // ── Thyroid replacement (T4/T3/NDT) — TSH should be 0.5–2.0 ───────────
  {
    id: 'thyroid_replacement_tsh',
    medClasses: ['thyroid_replacement'],
    markerPatterns: [/^tsh\b/i, /^thyroid stimulating hormone/i],
    optimalRange: [0.5, 2.0],
    severityWhen: { lowSev: 'moderate', highSev: 'high' },
    copy: {
      lowTitle: 'Your thyroid medication may be too high',
      lowDetail: 'TSH below 0.5 on replacement may signal over-treatment — increases bone loss and heart-rhythm risk over time.',
      lowAction: 'Discuss a 10-15% dose reduction with your prescribing doctor — recheck TSH+FT4 in 6 weeks.',
      highTitle: "Your thyroid medication isn't doing enough",
      highDetail: 'On thyroid replacement, target TSH is 0.5–2.0 (ideally near 1.0). Most symptoms attributed to "thyroid problems" trace to dose-not-quite-right rather than the diagnosis itself.',
      highAction: 'Email/call your prescribing doctor — ask to bump dose by ~12.5–25mcg (or ~½ grain Armour) and recheck TSH+FT4 in 6 weeks.',
    },
    retestKeys: ['thyroid_panel', 'thyroid_antibodies', 'reverse_t3'],
    headlineTemplate: (dir, v, u) =>
      dir === 'low' ? `over-replaced thyroid (TSH ${v} ${u ?? 'mIU/L'})` : `under-replaced thyroid (TSH ${v} ${u ?? 'mIU/L'})`,
  },

  // ── TRT polycythemia — Hematocrit ≥ 50, critical ≥ 54 ─────────────────
  {
    id: 'trt_hematocrit',
    medClasses: ['trt'],
    markerPatterns: [/^hematocrit/i, /^hct\b/i],
    optimalRange: [37, 50],     // upper bound of female-range floor + 50% top
    severityWhen: { lowSev: null, highSev: 'high' },
    copy: {
      highTitle: 'Hematocrit elevated on TRT',
      highDetail: 'On TRT, Hct ≥ 50% indicates rising red cell mass. Donate blood every 8-12 weeks to keep below 50.',
      highAction: 'Donate blood this month. Ask your doctor to set Hct goal <50.',
    },
    retestKeys: ['cbc'],
    headlineTemplate: (_d, v) => `elevated hematocrit (${v}%) on TRT`,
    criticalIf: { gt: 54 },
  },

  // ── Glycemic control on insulin/sulfonylurea — A1c < 7.5 ─────────────
  {
    id: 'glycemic_tighter_control',
    medClasses: ['insulin', 'sulfonylurea'],
    markerPatterns: [/^hemoglobin a1c/i, /^a1c\b/i, /^hba1c/i],
    optimalRange: [4.0, 7.5],
    severityWhen: { lowSev: null, highSev: 'high' },
    copy: {
      highTitle: 'Diabetes not yet under target control',
      highDetail: 'On insulin or sulfonylurea, target A1c <7.0%; persistent A1c ≥7.5% accelerates kidney, eye, and nerve damage.',
      highAction: 'Schedule a med review with your doctor — likely need dose adjustment or addition of GLP-1 / SGLT2.',
    },
    retestKeys: ['hba1c', 'fasting_insulin_homa_ir', 'uacr'],
    headlineTemplate: (_d, v) => `uncontrolled diabetes (A1c ${v}%)`,
    criticalIf: { gt: 9.0 },
  },

  // ── Glycemic control on metformin/SGLT2/GLP1 alone — A1c < 8.0 ───────
  {
    id: 'glycemic_basic_control',
    medClasses: ['metformin', 'sglt2', 'glp1'],
    markerPatterns: [/^hemoglobin a1c/i, /^a1c\b/i, /^hba1c/i],
    optimalRange: [4.0, 8.0],
    severityWhen: { lowSev: null, highSev: 'high' },
    copy: {
      highTitle: 'Blood sugar control needs adjustment',
      highDetail: 'On glucose-lowering therapy with A1c at the upper threshold — discuss escalating treatment to bring under <7.0%.',
      highAction: 'Schedule a med review — discuss adding a second agent or escalating dose.',
    },
    retestKeys: ['hba1c', 'fasting_insulin_homa_ir', 'uacr'],
    headlineTemplate: (_d, v) => `inadequate diabetes control (A1c ${v}%)`,
    criticalIf: { gt: 9.0 },
  },

  // ── ACE/ARB hyperkalemia — K+ > 5.3 ──────────────────────────────────
  {
    id: 'ace_arb_potassium',
    medClasses: ['ace_inhibitor', 'arb'],
    markerPatterns: [/^potassium/i, /^k\+?$/i],
    optimalRange: [3.5, 5.3],
    severityWhen: { lowSev: 'high', highSev: 'high' },
    copy: {
      highTitle: 'Potassium creeping high on ACE/ARB',
      highDetail: 'ACE inhibitors and ARBs raise potassium. >5.3 mmol/L warrants a recheck and dose reassessment — >5.5 risks heart-rhythm issues.',
      highAction: 'Email your doctor about the potassium level — likely need a recheck within 1-2 weeks.',
    },
    retestKeys: ['cmp'],
  },

  // ── Diuretic hypokalemia — K+ < 3.5 on thiazide/loop ─────────────────
  {
    id: 'diuretic_potassium',
    medClasses: ['diuretic_thiazide', 'diuretic_loop'],
    markerPatterns: [/^potassium/i, /^k\+?$/i],
    optimalRange: [3.5, 5.3],
    severityWhen: { lowSev: 'high', highSev: null },
    copy: {
      lowTitle: 'Potassium low on diuretic',
      lowDetail: 'Loop and thiazide diuretics waste potassium and magnesium. Low K+ raises arrhythmia risk.',
      lowAction: 'Email your doctor — may need K+ supplementation or switch to a K+-sparing combo. Check magnesium too.',
    },
    retestKeys: ['cmp', 'rbc_magnesium'],
  },

  // ── Statin liver intolerance — ALT > 120 (3x ULN) ────────────────────
  {
    id: 'statin_liver',
    medClasses: ['statin'],
    markerPatterns: [/^alt$/i, /^sgpt/i, /^alt\W/i],
    optimalRange: [0, 120],
    severityWhen: { lowSev: null, highSev: 'high' },
    copy: {
      highTitle: 'Liver enzymes elevated on statin',
      highDetail: 'ALT >3× upper limit on a statin warrants a prescriber conversation. Most cases are dose-related and resolve with adjustment.',
      highAction: 'Email your prescribing doctor today — do not stop the statin on your own.',
    },
    retestKeys: ['liver_panel', 'ggt', 'ck_if_muscle_symptoms'],
    headlineTemplate: (_d, v) => `elevated liver enzymes (ALT ${v}) on a statin`,
  },
];

export function runAdequacyChecks(input: AdequacyCheckInput): AdequacyFlag[] {
  const out: AdequacyFlag[] = [];
  for (const rule of RULES) {
    // Drug class trigger
    const onClass = rule.medClasses.some(mc => isOnMed(input.medsLower, mc));
    if (!onClass) continue;

    const m = getMarker(input.labValues, rule.markerPatterns);
    if (!m) continue;
    if (rule.unitContains && !(m.unit ?? '').toLowerCase().includes(rule.unitContains)) continue;

    let direction: 'low' | 'high' | null = null;
    if (m.value < rule.optimalRange[0]) direction = 'low';
    else if (m.value > rule.optimalRange[1]) direction = 'high';
    if (!direction) continue;

    const sevField = direction === 'low' ? rule.severityWhen.lowSev : rule.severityWhen.highSev;
    if (!sevField) continue;

    let severity: 'critical' | 'high' | 'moderate' = sevField;
    if (rule.criticalIf?.gt != null && m.value > rule.criticalIf.gt) severity = 'critical';
    if (rule.criticalIf?.lt != null && m.value < rule.criticalIf.lt) severity = 'critical';

    const c = rule.copy;
    const title    = (direction === 'low' ? c.lowTitle    : c.highTitle)    ?? rule.id;
    const detail   = (direction === 'low' ? c.lowDetail   : c.highDetail)   ?? '';
    const action   = (direction === 'low' ? c.lowAction   : c.highAction)   ?? '';
    const headline = rule.headlineTemplate ? rule.headlineTemplate(direction, m.value, m.unit) : undefined;

    out.push({
      key: `${rule.id}_${direction}`,
      severity,
      title,
      detail,
      evidence: `${m.markerName} ${m.value}${m.unit ? ' ' + m.unit : ''}`,
      todayAction: action,
      retestKeysToInject: rule.retestKeys,
      headlineMustMention: headline,
    });
  }
  return out;
}

// Self-supplement adequacy — separate because the input is user_supplements,
// not medications. Same data-driven shape; add to SELF_SUPP_RULES to extend.
interface SelfSuppRule {
  id: string;
  /** User-supplement matcher. */
  takingPattern: RegExp;
  /** Lab marker patterns. */
  markerPatterns: RegExp[];
  /** Returns lower-bound for an optimal value, given age + sex. */
  lowerBound: (age: number | null, sex: string | null) => number;
  copy: { title: string; detail: string; action: string };
  retestKeys: string[];
}

const SELF_SUPP_RULES: SelfSuppRule[] = [
  {
    id: 'dhea_not_converting',
    takingPattern: /\bdhea\b/i,
    markerPatterns: [/^dhea\s*sulfate/i, /^dhea-?s\b/i],
    lowerBound: (age, sex) => {
      const a = age ?? 50;
      const f = (sex ?? '').toLowerCase() === 'female';
      if (a >= 60) return f ? 60  : 100;
      if (a >= 40) return f ? 100 : 150;
      return f ? 150 : 200;
    },
    copy: {
      title: "Your DHEA dose isn't landing",
      detail: "You're supplementing DHEA but DHEA-S is below the typical age-and-sex optimal. Either dose too low or absorption / conversion is poor. Discuss with your provider before increasing.",
      action: 'Bring this to your doctor: ask whether to bump DHEA dose or test pregnenolone + SHBG to understand why it isn\'t converting.',
    },
    retestKeys: ['androgen_panel', 'shbg'],
  },
];

export function runSelfSupplementChecks(
  userSuppText: string,
  labValues: AdequacyCheckInput['labValues'],
  age: number | null,
  sex: string | null,
): AdequacyFlag[] {
  const out: AdequacyFlag[] = [];
  for (const rule of SELF_SUPP_RULES) {
    if (!rule.takingPattern.test(userSuppText)) continue;
    const m = getMarker(labValues, rule.markerPatterns);
    if (!m) continue;
    const bound = rule.lowerBound(age, sex);
    if (m.value >= bound) continue;
    out.push({
      key: rule.id,
      severity: 'moderate',
      title: rule.copy.title,
      detail: `${rule.copy.detail} Observed ${m.markerName} = ${m.value} ${m.unit ?? ''} (target ≥ ${bound}).`,
      evidence: `${m.markerName} ${m.value} ${m.unit ?? ''} (self-supplementing)`,
      todayAction: rule.copy.action,
      retestKeysToInject: rule.retestKeys,
    });
  }
  return out;
}
