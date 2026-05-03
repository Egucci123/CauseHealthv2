// supabase/functions/_shared/predictiveOutcomes.ts
//
// Layer E — predictive outcomes engine. UNIVERSAL: for each intervention the
// plan recommends (or each adequacy flag the patient has), project expected
// lab changes at the next retest using encoded effect sizes from
// peer-reviewed literature.
//
// Doctors do not make falsifiable predictions. CauseHealth does. If the
// numbers don't move as predicted, the plan was wrong — and the user knows
// it. That's better than a doctor.
//
// Each effect declares: which intervention triggers it, which marker(s)
// move, by how much, in what timeframe, and the citation. Universal because
// adding a new effect = pushing one row.

export interface ProjectedChange {
  /** Intervention key triggering this projection (matches an adequacy or
   *  pathway/supplement key). */
  fromKey: string;
  /** Plain-English intervention label. */
  intervention: string;
  /** Marker name being predicted. */
  marker: string;
  /** Direction + magnitude. Negative = decrease. */
  delta: number;
  /** Unit of the delta. */
  unit: string;
  /** Timeframe for the change. */
  timeframeWeeks: number;
  /** Confidence — high/medium/low based on evidence strength. */
  confidence: 'high' | 'medium' | 'low';
  /** Citation / evidence note. */
  evidence: string;
  /** Plain-English summary line for the UI. */
  summary: string;
}

interface EffectRule {
  /** Intervention key — matches adequacyFlag.key (e.g. 'thyroid_replacement_tsh_high')
   *  or supplement registry key (e.g. 'omega_3') or causal chain root key
   *  (e.g. 'sleep_deprivation'). */
  triggerKeys: string[];
  /** What to project. Each entry is one marker movement. */
  effects: Array<{
    marker: string;
    delta: number;
    unit: string;
    timeframeWeeks: number;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
    summary: string;
  }>;
}

// ── Effect-size table (peer-reviewed evidence) ───────────────────────────
// Numbers are conservative midpoints from published meta-analyses + RCTs.
const EFFECTS: EffectRule[] = [
  // ── Thyroid dose optimization ──────────────────────────────────────────
  {
    triggerKeys: ['thyroid_replacement_tsh_high', 'under_replaced_thyroid'],
    effects: [
      { marker: 'TSH', delta: -1.5, unit: 'mIU/L', timeframeWeeks: 6, confidence: 'high', evidence: 'Standard L-thyroxine titration response', summary: 'Optimizing your Armour/levothyroxine dose typically drops TSH by 1.0–2.0 mIU/L within 6 weeks (target <2.0).' },
      { marker: 'hs-CRP',     delta: -0.4, unit: 'mg/L',   timeframeWeeks: 12, confidence: 'medium', evidence: 'Pearce et al — thyroid status × inflammation', summary: 'Inflammation typically drops 0.3–0.6 mg/L when thyroid replacement is optimized.' },
      { marker: 'Total Cholesterol', delta: -15, unit: 'mg/dL', timeframeWeeks: 12, confidence: 'medium', evidence: 'Levothyroxine therapy — lipid normalization', summary: 'Cholesterol typically drops 10–20 mg/dL with adequate thyroid replacement.' },
      { marker: 'Weight', delta: -3, unit: 'lbs', timeframeWeeks: 12, confidence: 'low', evidence: 'Variable; 1–5 lb drop reported with TSH optimization', summary: 'Some weight loss (1–5 lbs over 3 months) typical when thyroid replacement is corrected.' },
    ],
  },

  // ── Sleep extension (5 → 7+ hr/night) ──────────────────────────────────
  {
    triggerKeys: ['sleep_deprivation'],
    effects: [
      { marker: 'hs-CRP', delta: -0.6, unit: 'mg/L', timeframeWeeks: 8, confidence: 'medium', evidence: 'Multiple sleep-extension RCTs (e.g., Irwin 2016)', summary: 'Sleep extension to 7+ hr/night typically lowers inflammation 0.4–0.8 mg/L within 8 weeks.' },
      { marker: 'Fasting Glucose', delta: -4, unit: 'mg/dL', timeframeWeeks: 8, confidence: 'medium', evidence: 'Sleep restriction → IR meta-analyses', summary: 'Insulin sensitivity improves; fasting glucose typically drops 3–6 mg/dL.' },
      { marker: 'AM Cortisol', delta: 0, unit: 'mcg/dL', timeframeWeeks: 8, confidence: 'medium', evidence: 'Restoration of cortisol rhythm with adequate sleep', summary: 'Cortisol pattern normalizes (pattern, not absolute level).' },
    ],
  },

  // ── HRT for postmenopausal women ──────────────────────────────────────
  {
    triggerKeys: ['postmenopause'],
    effects: [
      { marker: 'LDL-P', delta: -187, unit: 'nmol/L', timeframeWeeks: 24, confidence: 'medium', evidence: 'WHI sub-analyses; post-meno HRT lipid effect', summary: 'IF discussing HRT with your doctor: postmenopausal women starting HRT show mean LDL-P drop of ~150–250 nmol/L over 6 months.' },
      { marker: 'Large HDL-P', delta: 1.4, unit: 'umol/L', timeframeWeeks: 24, confidence: 'medium', evidence: 'WHI sub-analyses', summary: 'Large HDL-P typically increases ~1.0–2.0 µmol/L on HRT (small but meaningful).' },
      { marker: 'hs-CRP', delta: -0.3, unit: 'mg/L', timeframeWeeks: 24, confidence: 'low', evidence: 'Mixed; transdermal estrogen typically neutral-to-slight-decrease', summary: 'Inflammation typically modestly improves on transdermal HRT (oral estrogens may slightly raise CRP).' },
    ],
  },

  // ── Omega-3 supplementation when index < 8% ───────────────────────────
  {
    triggerKeys: ['omega_3'],
    effects: [
      { marker: 'Triglycerides', delta: -25, unit: 'mg/dL', timeframeWeeks: 12, confidence: 'high', evidence: 'AHA Omega-3 meta-analyses (2g+ EPA+DHA)', summary: 'Triglycerides typically drop 15–35 mg/dL on 2g+ EPA+DHA daily.' },
      { marker: 'hs-CRP', delta: -0.3, unit: 'mg/L', timeframeWeeks: 12, confidence: 'medium', evidence: 'Multiple RCTs, dose-dependent', summary: 'Inflammation typically modestly improves (0.2–0.4 mg/L drop).' },
      { marker: 'Omega-3 Index', delta: 2.5, unit: '% by wt', timeframeWeeks: 12, confidence: 'high', evidence: 'Direct supplementation studies', summary: 'Omega-3 index typically rises 1.5–3.5 percentage points within 12 weeks.' },
    ],
  },

  // ── Berberine / metformin equivalent for insulin resistance ───────────
  {
    triggerKeys: ['berberine', 'insulin_resistance'],
    effects: [
      { marker: 'A1c', delta: -0.6, unit: '%', timeframeWeeks: 12, confidence: 'high', evidence: 'Multiple RCTs (Yin 2008+; head-to-head with metformin)', summary: 'A1c typically drops 0.4–0.9 percentage points on 1500mg/day berberine over 12 weeks.' },
      { marker: 'Triglycerides', delta: -35, unit: 'mg/dL', timeframeWeeks: 12, confidence: 'high', evidence: 'Berberine RCTs', summary: 'Triglycerides typically drop 20–50 mg/dL.' },
      { marker: 'LDL', delta: -20, unit: 'mg/dL', timeframeWeeks: 12, confidence: 'high', evidence: 'Berberine RCTs', summary: 'LDL typically drops 15–25 mg/dL.' },
    ],
  },

  // ── Selenium for Hashimoto's TPO reduction ────────────────────────────
  {
    triggerKeys: ['selenium'],
    effects: [
      { marker: 'TPO Antibodies', delta: -200, unit: 'IU/mL', timeframeWeeks: 12, confidence: 'medium', evidence: 'Toulis 2010 meta-analysis (selenium for TPO Ab reduction)', summary: 'TPO antibodies typically drop 100–300 IU/mL on 200mcg selenomethionine daily over 3 months.' },
    ],
  },

  // ── L-glutamine + S. boulardii + butyrate for IBD ─────────────────────
  {
    triggerKeys: ['l_glutamine', 's_boulardii', 'butyrate'],
    effects: [
      { marker: 'Fecal Calprotectin', delta: -75, unit: 'mcg/g', timeframeWeeks: 12, confidence: 'medium', evidence: 'IBD remission-maintenance probiotics + barrier support', summary: 'Calprotectin typically drops 50–100 mcg/g with the gut-healing triad over 12 weeks (clinical remission marker).' },
    ],
  },

  // ── Statin for LDL ────────────────────────────────────────────────────
  {
    triggerKeys: ['statin_alt_elevated', 'atherogenic_lipids'],
    effects: [
      { marker: 'LDL', delta: -40, unit: 'mg/dL', timeframeWeeks: 8, confidence: 'high', evidence: 'Statin meta-analyses (moderate-intensity dose)', summary: 'Moderate-intensity statin typically drops LDL 30–55%.' },
      { marker: 'ApoB', delta: -25, unit: 'mg/dL', timeframeWeeks: 8, confidence: 'high', evidence: 'Statin meta-analyses', summary: 'ApoB typically drops 25–35 mg/dL.' },
    ],
  },

  // ── A1c-lowering on insulin / sulfonylurea / GLP-1 escalation ─────────
  {
    triggerKeys: ['glycemic_tighter_control_high', 'glycemic_basic_control_high', 'glycemic_uncontrolled'],
    effects: [
      { marker: 'A1c', delta: -1.0, unit: '%', timeframeWeeks: 12, confidence: 'high', evidence: 'GLP-1 / dose-escalation outcomes', summary: 'Adding GLP-1 or escalating dose typically drops A1c 0.7–1.3% within 12 weeks.' },
    ],
  },
];

const BY_TRIGGER = new Map<string, EffectRule[]>();
for (const rule of EFFECTS) {
  for (const k of rule.triggerKeys) {
    const arr = BY_TRIGGER.get(k) ?? [];
    arr.push(rule);
    BY_TRIGGER.set(k, arr);
  }
}

export interface PredictionInput {
  /** Adequacy flag keys present (from replacementTherapyChecks output). */
  adequacyKeys: string[];
  /** Causal chain root cause keys present. */
  causalRootKeys: string[];
  /** Supplement registry keys actually injected into the plan. */
  supplementKeys: string[];
}

export function buildPredictedChanges(input: PredictionInput): ProjectedChange[] {
  const out: ProjectedChange[] = [];
  const triggers = new Set<string>([...input.adequacyKeys, ...input.causalRootKeys, ...input.supplementKeys]);

  for (const t of triggers) {
    const rules = BY_TRIGGER.get(t);
    if (!rules) continue;
    for (const rule of rules) {
      for (const e of rule.effects) {
        out.push({
          fromKey: t,
          intervention: humanLabelForTrigger(t),
          marker: e.marker,
          delta: e.delta,
          unit: e.unit,
          timeframeWeeks: e.timeframeWeeks,
          confidence: e.confidence,
          evidence: e.evidence,
          summary: e.summary,
        });
      }
    }
  }
  return dedupePredictions(out);
}

function humanLabelForTrigger(key: string): string {
  const map: Record<string, string> = {
    thyroid_replacement_tsh_high: 'Thyroid dose optimization',
    under_replaced_thyroid: 'Thyroid dose optimization',
    sleep_deprivation: 'Extending sleep to 7+ hr/night',
    postmenopause: 'Postmenopausal HRT (discuss with doctor)',
    omega_3: 'Omega-3 supplementation',
    berberine: 'Berberine 1500mg/day',
    insulin_resistance: 'Insulin-sensitivity protocol',
    selenium: 'Selenium 200mcg/day',
    l_glutamine: 'IBD gut-healing triad',
    s_boulardii: 'IBD gut-healing triad',
    butyrate: 'IBD gut-healing triad',
    statin_alt_elevated: 'Statin therapy',
    atherogenic_lipids: 'Lipid-lowering protocol',
    glycemic_tighter_control_high: 'Glycemic control escalation',
    glycemic_basic_control_high: 'Glycemic control escalation',
    glycemic_uncontrolled: 'Glycemic control escalation',
  };
  return map[key] ?? key;
}

// If multiple interventions predict the same marker movement, keep the
// largest-magnitude prediction (treats as a "ceiling" rather than additive,
// since real-world overlap rarely sums linearly).
function dedupePredictions(arr: ProjectedChange[]): ProjectedChange[] {
  const byMarker = new Map<string, ProjectedChange>();
  for (const p of arr) {
    const key = p.marker.toLowerCase();
    const existing = byMarker.get(key);
    if (!existing || Math.abs(p.delta) > Math.abs(existing.delta)) {
      byMarker.set(key, p);
    }
  }
  return [...byMarker.values()];
}

/** Render a plain-text block for the prompt. */
export function renderPredictionsForPrompt(predictions: ProjectedChange[]): string {
  if (predictions.length === 0) return '';
  const lines: string[] = ['PREDICTED LAB CHANGES at the 12-week retest IF the user does the highest-leverage interventions (use these as falsifiable forecasts in the summary — doctors don\'t make these):'];
  for (const p of predictions) {
    const sign = p.delta > 0 ? '+' : '';
    lines.push(`  - ${p.marker}: expect ${sign}${p.delta} ${p.unit} in ${p.timeframeWeeks} wk (from: ${p.intervention}; confidence: ${p.confidence}). ${p.summary}`);
  }
  return lines.join('\n');
}
