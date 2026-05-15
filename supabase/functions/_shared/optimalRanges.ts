// supabase/functions/_shared/optimalRanges.ts
//
// WATCH-TIER THRESHOLD REGISTRY
// =============================
// "Normal" lab reference ranges are calibrated to 95% of the population —
// including the chronically-borderline 80%. This module surfaces a Watch
// tier when a value is INSIDE the lab's reference range but pressed
// against either edge — the borderline-detection signal CauseHealth
// surfaces ("borderline-low" / "borderline-high" — never "optimal").
//
// FRONTEND/BACKEND RULE PARITY (audit 2026-05-10):
// ════════════════════════════════════════════════════════════════════════
// The frontend's checkWatchList() in src/store/labUploadStore.ts uses
// the SAME thresholds when stamping the optimal_flag at upload time.
// recomputeFlag() below is the analysis-time mirror that derives flags
// fresh from value + reference range + these rules. The two MUST stay
// in sync — drift here was the root cause of stale-flag bugs (Evan's
// CRP 0.5 mg/L stamped 'watch' under an old frontend rule that didn't
// match the backend's >1.0 mg/L threshold).
//
// When you change a threshold here, change checkWatchList() to match.
// There's a parity comment in that file too with the canonical table.
// ════════════════════════════════════════════════════════════════════════
//
// Sources:
//   AACE / Endocrine Society guidelines, AHA/CDC, ADA, Bredesen Aging
//   Protocol, Function Health reference ranges, InsideTracker population
//   percentile standards.

export interface OptimalRange {
  marker: RegExp;
  // Optimal range for this demographic
  low?: number;
  high?: number;
  unit: string;
  rationale: string;       // why this is the watch-tier range
  source: string;          // citation
}

interface DemographicContext {
  age: number;
  sex: 'male' | 'female' | string;
  isPregnant?: boolean;
  isMenstruating?: boolean;
}

interface LabRow {
  marker_name?: string | null;
  value?: number | string | null;
  unit?: string | null;
  optimal_flag?: string | null;
  standard_flag?: string | null;
}

function num(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Universal optimal-range registry. Each rule fires when:
 *   1. The marker matches by regex
 *   2. The patient's demographic profile fits the rule's filter
 *   3. The lab value is in the lab's "normal" range
 *   4. The value is OUTSIDE the watch-tier range
 *
 * In that case we emit a Watch flag so the wellness plan + analysis
 * call out the in-range-low or in-range-high value.
 */
function getRulesForPatient(ctx: DemographicContext): OptimalRange[] {
  const isMale = String(ctx.sex).toLowerCase() === 'male';
  const isFemale = String(ctx.sex).toLowerCase() === 'female';

  const rules: OptimalRange[] = [
    // ── FERRITIN — sex-stratified, age-aware ──────────────────────────
    // Lab normal is 15-300 for men, 15-150 for women. Optimal:
    //   Male: 75-150 (Function Health, AACE iron status)
    //   Female menstruating: 50-150
    //   Female post-menopausal: 75-150
    {
      marker: /\bferritin\b/i,
      low: isMale ? 75 : (ctx.age >= 50 ? 75 : 50),
      high: 150,
      unit: 'ng/mL',
      rationale: 'Watch-tier threshold ferritin for energy, hair retention, and exercise tolerance. Low-normal ferritin (<50 menstruating, <75 male) drives fatigue, hair loss, restless legs even with normal Hgb.',
      source: 'AACE 2023 / Function Health reference range',
    },

    // ── VITAMIN D 25-OH — universal optimal ───────────────────────────
    {
      marker: /\b25.?hydroxy.?vitamin d|vitamin d\b/i,
      low: 40,
      high: 60,
      unit: 'ng/mL',
      rationale: 'Watch-tier threshold Vit D (40-60 ng/mL) per Endocrine Society + Vitamin D Council. Lab normal (30+) misses immune/mood/bone effects of in-range-low D.',
      source: 'Endocrine Society 2011 / Vitamin D Council',
    },

    // ── HBA1C — universal optimal ─────────────────────────────────────
    {
      marker: /\b(hemoglobin a1c|hba1c|^a1c$)\b/i,
      high: 5.4,
      unit: '%',
      rationale: 'Watch-tier threshold A1c <5.4% (in-range low). 5.5-5.6% is Watch tier (early dysglycemia); 5.7+ is prediabetic per ADA.',
      source: 'ADA 2024 / Bredesen Aging Protocol',
    },

    // ── FASTING GLUCOSE — universal optimal ───────────────────────────
    {
      marker: /\bfasting\s*glucose|^glucose$/i,
      high: 90,
      unit: 'mg/dL',
      rationale: 'Watch-tier threshold fasting glucose <90 mg/dL. Lab normal (≤99) includes the pre-diabetic glide path (95-99); modern endo targets 80-90.',
      source: 'AACE 2024 / functional medicine consensus',
    },

    // ── HDL — sex-stratified ──────────────────────────────────────────
    {
      marker: /\bhdl\b/i,
      low: isMale ? 50 : 60,
      unit: 'mg/dL',
      rationale: isMale
        ? 'Watch-tier threshold HDL for men ≥50 mg/dL (cardioprotective threshold). Lab "normal" >40 for men misses moderate-CV-risk patients.'
        : 'Watch-tier threshold HDL for women ≥60 mg/dL (cardioprotective threshold).',
      source: 'AHA 2019 / Mayo Clinic reference',
    },

    // ── TRIGLYCERIDES — universal optimal ─────────────────────────────
    {
      marker: /\btriglyceride/i,
      high: 100,
      unit: 'mg/dL',
      rationale: 'Watch-tier threshold TG <100 mg/dL (insulin-sensitive metabolism). Lab normal (≤149) includes the IR-development zone (100-149).',
      source: 'AHA 2019 / NLA position statement',
    },

    // ── LDL — universal optimal ──────────────────────────────────────
    {
      marker: /\bldl\b/i,
      high: 100,
      unit: 'mg/dL',
      rationale: 'Watch-tier threshold LDL <100 mg/dL (general population) or <70 for high-risk. Lab "borderline" ≤129 doesn\'t match modern preventive cardiology targets.',
      source: 'AHA/ACC 2018 lipid guidelines',
    },

    // ── HS-CRP — universal optimal ───────────────────────────────────
    {
      marker: /\bhs[-\s]?crp\b|c.reactive protein/i,
      high: 1.0,
      unit: 'mg/L',
      rationale: 'Watch-tier threshold hs-CRP <1.0 mg/L (low CV risk per AHA/CDC). 1-3 mg/L is moderate risk; >3 high.',
      source: 'AHA/CDC 2003 / Ridker',
    },

    // ── TSH — universal optimal ──────────────────────────────────────
    // Tightened 2026-05-10 audit: optimal high 2.5 → 2.0 so values
    // 2.0–2.5 surface as watch-tier outliers ("creeping above functional
    // optimal"). Lab reference upper limit is 4.5; AACE 2014 calls 2.5+
    // "grey zone"; functional medicine targets <2.0. The 2.0–4.5 band
    // is also caught by the 'subclinical_hypothyroidism' pattern rule
    // when paired with 2+ thyroid-pattern symptoms.
    {
      marker: /\btsh\b|thyroid stimulating/i,
      low: 0.5,
      high: 2.0,
      unit: 'mIU/L',
      rationale: 'Watch-tier threshold TSH 0.5–2.0 mIU/L (functional watch-tier). Lab normal extends to 4.5; values 2.0–4.5 are tracked as watch-tier and get the antibody workup with thyroid-pattern symptoms.',
      source: 'AACE 2014 / Endocrine Society + functional-medicine reference',
    },

    // ── Vitamin B12 — universal optimal ──────────────────────────────
    {
      marker: /\bvitamin b[\s-]?12|^b12$|cobalamin\b/i,
      low: 500,
      unit: 'pg/mL',
      rationale: 'Watch-tier threshold serum B12 >500 pg/mL. Lab normal (≥232) includes the "borderline-low" zone (200-400) where MMA + Homocysteine should confirm tissue-level status.',
      source: 'AACE 2014 / Pernicious Anemia Society',
    },

    // ── TESTOSTERONE (TOTAL) — male-specific ─────────────────────────
    ...(isMale ? [{
      marker: /\btestosterone\b/i,
      low: ctx.age <= 40 ? 600 : 500,
      high: 1200,
      unit: 'ng/dL',
      rationale: ctx.age <= 40
        ? 'Watch-tier threshold Total T ≥600 ng/dL for men under 40. Lab normal (264-916) includes low-normal range tied to fatigue, mood, weight resistance.'
        : 'Watch-tier threshold Total T ≥500 ng/dL for men 40+.',
      source: 'AACE 2024 / AUA Testosterone Guidelines',
    }] : []),

    // ── URIC ACID — sex-stratified ────────────────────────────────────
    {
      marker: /\buric\s*acid\b/i,
      high: isMale ? 6.0 : 5.0,
      unit: 'mg/dL',
      rationale: isMale
        ? 'Watch-tier threshold uric acid <6.0 mg/dL for men (gout threshold). Lab normal (≤7.2) includes elevated CV/renal risk zone.'
        : 'Watch-tier threshold uric acid <5.0 mg/dL for women.',
      source: 'ACR 2020 Gout Guidelines',
    },

    // ── CBC RED-CELL INDICES — universal early-iron-deficiency signal ─
    // Lab reference ranges are wide; the LOW end of normal for MCV/MCH/
    // MCHC plus a high-normal RDW is the textbook fingerprint of iron
    // deficiency BEFORE hemoglobin drops out of range. Catching it as
    // watch-tier outliers feeds the early-hypochromic pattern card and
    // gives users an early opportunity to fix it with diet / iron.
    // Anchored regexes so we never collide with the plain Hemoglobin
    // / Platelet / RBC thresholds.
    {
      marker: /^mean\s+corpuscular\s+volume$|^mcv$/i,
      low: 88,
      high: 95,
      unit: 'fL',
      rationale: 'Watch-tier threshold MCV 88–95 fL. Lab normal extends to 80–100; low-normal MCV (<88) is an early sign of microcytic / iron-deficient erythropoiesis before hemoglobin drops.',
      source: 'Lab medicine consensus + functional reference',
    },
    {
      marker: /^mean\s+corpuscular\s+hemoglobin$|^mch$/i,
      low: 28,
      unit: 'pg',
      rationale: 'Watch-tier threshold MCH ≥28 pg. Low MCH (hypochromia) is an early sign of iron deficiency or thalassemia trait — caught before anemia develops.',
      source: 'Lab medicine consensus',
    },
    {
      marker: /^mean\s+corpuscular\s+hemoglobin\s+concentration$|^mchc$/i,
      low: 33,
      unit: 'g/dL',
      rationale: 'Watch-tier threshold MCHC ≥33 g/dL. Low MCHC (hypochromia) often precedes overt iron-deficiency anemia and is reversible with iron repletion.',
      source: 'Lab medicine consensus',
    },
    {
      marker: /^rdw(?:[-\s]*cv)?$|^red\s+cell\s+distribution\s+width(?:\s+cv)?$/i,
      high: 13.0,
      unit: '%',
      rationale: 'Watch-tier threshold RDW-CV ≤13%. Elevated RDW reflects increased red-cell size variability — earliest CBC sign of disordered erythropoiesis (iron deficiency, B12/folate deficiency, mixed pattern).',
      source: 'Lab medicine consensus',
    },
  ];

  return rules;
}

export interface OptimalFlag {
  marker: string;
  value: number;
  unit: string;
  labStandardFlag?: string;          // what the lab said (usually 'normal')
  optimalLow?: number;
  optimalHigh?: number;
  rationale: string;
  source: string;
}

/**
 * Scan a patient's labs and emit Watch flags for values that are in
 * the lab's "normal" range but outside the watch-tier range for the
 * patient's age + sex. Universal — every patient gets the appropriate
 * subset of rules.
 */
export function detectSuboptimalValues(
  labs: LabRow[],
  ctx: DemographicContext,
): OptimalFlag[] {
  if (!Array.isArray(labs)) return [];
  const rules = getRulesForPatient(ctx);
  const out: OptimalFlag[] = [];

  for (const lab of labs) {
    const name = String(lab.marker_name ?? '');
    const val = num(lab.value);
    if (val === null) continue;

    // Skip values already flagged abnormal by the lab — they're already
    // surfaced as priority_findings. We only enhance the "normal" cohort.
    const standardFlag = String(lab.standard_flag ?? lab.optimal_flag ?? '').toLowerCase();
    if (['low', 'high', 'critical_low', 'critical_high', 'deficient', 'elevated'].includes(standardFlag)) {
      continue;
    }

    for (const rule of rules) {
      if (!rule.marker.test(name)) continue;
      const lowMiss = rule.low !== undefined && val < rule.low;
      const highMiss = rule.high !== undefined && val > rule.high;
      if (!lowMiss && !highMiss) continue;
      out.push({
        marker: name,
        value: val,
        unit: String(lab.unit ?? rule.unit),
        labStandardFlag: standardFlag || 'normal',
        optimalLow: rule.low,
        optimalHigh: rule.high,
        rationale: rule.rationale,
        source: rule.source,
      });
      break; // one match per marker
    }
  }

  return out;
}

/**
 * UNIVERSAL FLAG RECOMPUTATION — single source of truth for a lab's
 * "in-range / out-of-range / borderline" classification.
 *
 * The DB column `optimal_flag` on lab_values is stamped at upload time
 * and can go stale when rules change (CRP threshold, TSH cutoff, MCV
 * range, etc.). Trusting the stored value led to bugs like Evan's CRP
 * 0.5 mg/L showing as `watch` even after we lowered the watch threshold
 * to >1.0 mg/L.
 *
 * Returns one of the canonical flag values (matches frontend taxonomy):
 *   'critical_high' | 'critical_low'  — outside the lab's reference
 *                                        range AND in the safety-net
 *                                        emergency zone
 *   'high' | 'low'                    — outside the lab's reference
 *                                        range (per standard_flag)
 *   'watch'                           — INSIDE the lab's reference range
 *                                        but outside the watch-tier
 *                                        threshold from optimalRanges
 *                                        rules (borderline)
 *   'healthy'                         — fully within range, no signal
 *
 * Caller responsible for handing in demographic context — testosterone
 * + ferritin rules are sex-stratified, A1c is not, etc.
 */
export function recomputeFlag(
  lab: LabRow,
  ctx: DemographicContext,
): 'critical_high' | 'critical_low' | 'high' | 'low' | 'watch' | 'healthy' {
  const val = num(lab.value);
  if (val === null) return 'healthy';

  // 1) Trust the lab's own out-of-range determination first. The lab is
  //    the authority on its own reference range — if it says high/low we
  //    don't second-guess. We DO normalize to canonical names.
  const stdRaw = String(lab.standard_flag ?? '').toLowerCase().trim();
  if (stdRaw === 'critical_high' || stdRaw === 'critical_low') return stdRaw;
  if (stdRaw === 'high' || stdRaw === 'elevated') return 'high';
  if (stdRaw === 'low' || stdRaw === 'deficient') return 'low';

  // 2) In-range — check the watch-tier rules to surface borderline drift.
  //
  // 2026-05-15: canonical-flag alignment. recomputeFlag previously
  // returned 'suboptimal_high' / 'suboptimal_low' / 'normal' which is
  // a separate flag taxonomy from the rest of the app. Frontend
  // checkWatchList, LabValue.flag type, and every UI consumer use the
  // canonical set { critical_high, critical_low, high, low, watch,
  // healthy }. Returning 'suboptimal_high' meant analyze-labs-v2,
  // generate-wellness-plan-v2, and generate-doctor-prep-v2 produced
  // LabValue objects whose `flag` field downstream filters didn't
  // recognize — anything matching `flag === 'watch'` silently missed
  // these rows. Same parity drift class as the frontend/backend
  // boundary bug fixed in 3678036.
  const rules = getRulesForPatient(ctx);
  const name = String(lab.marker_name ?? '');
  for (const rule of rules) {
    if (!rule.marker.test(name)) continue;
    const lowMiss  = rule.low  !== undefined && val < rule.low;
    const highMiss = rule.high !== undefined && val > rule.high;
    if (highMiss || lowMiss) return 'watch';
    return 'healthy'; // matched a rule, value is in the watch-tier safe zone
  }
  // No rule matched at all — value is in lab range, no curated watch
  // threshold available. Treat as healthy.
  return 'healthy';
}
