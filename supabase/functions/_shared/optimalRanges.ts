// supabase/functions/_shared/optimalRanges.ts
//
// PHASE 7 — OPTIMAL RANGE STRATIFICATION
// ======================================
// "Normal" lab ranges are calibrated to 95% of the population — including
// the chronically-suboptimal 80%. OPTIMAL ranges reflect what's biologically
// best for someone of this age + sex, not just "not pathologically off."
//
// This module surfaces a Watch tier when a value is in the lab's "normal"
// range but outside the OPTIMAL range. The user sees:
//   "Your ferritin is 42 — labs say normal (15-200), but optimal for males
//   your age is 75-150. Low-normal ferritin drives fatigue + hair loss."
//
// Sources:
//   AACE Optimal Ranges, Bredesen Optimal Aging, Function Health reference
//   ranges, InsideTracker population percentile standards.

export interface OptimalRange {
  marker: RegExp;
  // Optimal range for this demographic
  low?: number;
  high?: number;
  unit: string;
  rationale: string;       // why this is the optimal range
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
 *   4. The value is OUTSIDE the optimal range
 *
 * In that case we emit a Watch flag so the wellness plan + analysis
 * call out the suboptimal value.
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
      rationale: 'Optimal ferritin for energy, hair retention, and exercise tolerance. Low-normal ferritin (<50 menstruating, <75 male) drives fatigue, hair loss, restless legs even with normal Hgb.',
      source: 'AACE 2023 / Function Health reference range',
    },

    // ── VITAMIN D 25-OH — universal optimal ───────────────────────────
    {
      marker: /\b25.?hydroxy.?vitamin d|vitamin d\b/i,
      low: 40,
      high: 60,
      unit: 'ng/mL',
      rationale: 'Optimal Vit D (40-60 ng/mL) per Endocrine Society + Vitamin D Council. Lab normal (30+) misses immune/mood/bone effects of suboptimal D.',
      source: 'Endocrine Society 2011 / Vitamin D Council',
    },

    // ── HBA1C — universal optimal ─────────────────────────────────────
    {
      marker: /\b(hemoglobin a1c|hba1c|^a1c$)\b/i,
      high: 5.4,
      unit: '%',
      rationale: 'Optimal A1c <5.4% (lower-normal). 5.5-5.6% is Watch tier (early dysglycemia); 5.7+ is prediabetic per ADA.',
      source: 'ADA 2024 / Bredesen Optimal Aging',
    },

    // ── FASTING GLUCOSE — universal optimal ───────────────────────────
    {
      marker: /\bfasting\s*glucose|^glucose$/i,
      high: 90,
      unit: 'mg/dL',
      rationale: 'Optimal fasting glucose <90 mg/dL. Lab normal (≤99) includes the pre-diabetic glide path (95-99); modern endo targets 80-90.',
      source: 'AACE 2024 / functional medicine consensus',
    },

    // ── HDL — sex-stratified ──────────────────────────────────────────
    {
      marker: /\bhdl\b/i,
      low: isMale ? 50 : 60,
      unit: 'mg/dL',
      rationale: isMale
        ? 'Optimal HDL for men ≥50 mg/dL (cardioprotective threshold). Lab "normal" >40 for men misses moderate-CV-risk patients.'
        : 'Optimal HDL for women ≥60 mg/dL (cardioprotective threshold).',
      source: 'AHA 2019 / Mayo Clinic reference',
    },

    // ── TRIGLYCERIDES — universal optimal ─────────────────────────────
    {
      marker: /\btriglyceride/i,
      high: 100,
      unit: 'mg/dL',
      rationale: 'Optimal TG <100 mg/dL (insulin-sensitive metabolism). Lab normal (≤149) includes the IR-development zone (100-149).',
      source: 'AHA 2019 / NLA position statement',
    },

    // ── LDL — universal optimal ──────────────────────────────────────
    {
      marker: /\bldl\b/i,
      high: 100,
      unit: 'mg/dL',
      rationale: 'Optimal LDL <100 mg/dL (general population) or <70 for high-risk. Lab "borderline" ≤129 doesn\'t match modern preventive cardiology targets.',
      source: 'AHA/ACC 2018 lipid guidelines',
    },

    // ── HS-CRP — universal optimal ───────────────────────────────────
    {
      marker: /\bhs[-\s]?crp\b|c.reactive protein/i,
      high: 1.0,
      unit: 'mg/L',
      rationale: 'Optimal hs-CRP <1.0 mg/L (low CV risk per AHA/CDC). 1-3 mg/L is moderate risk; >3 high.',
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
      rationale: 'Optimal TSH 0.5–2.0 mIU/L (functional optimal). Lab normal extends to 4.5; values 2.0–4.5 are tracked as watch-tier and get the antibody workup with thyroid-pattern symptoms.',
      source: 'AACE 2014 / Endocrine Society + functional-medicine optimal',
    },

    // ── Vitamin B12 — universal optimal ──────────────────────────────
    {
      marker: /\bvitamin b[\s-]?12|^b12$|cobalamin\b/i,
      low: 500,
      unit: 'pg/mL',
      rationale: 'Optimal serum B12 >500 pg/mL. Lab normal (≥232) includes the "borderline-low" zone (200-400) where MMA + Homocysteine should confirm tissue-level status.',
      source: 'AACE 2014 / Pernicious Anemia Society',
    },

    // ── TESTOSTERONE (TOTAL) — male-specific ─────────────────────────
    ...(isMale ? [{
      marker: /\btestosterone\b/i,
      low: ctx.age <= 40 ? 600 : 500,
      high: 1200,
      unit: 'ng/dL',
      rationale: ctx.age <= 40
        ? 'Optimal Total T ≥600 ng/dL for men under 40. Lab normal (264-916) includes low-normal range tied to fatigue, mood, weight resistance.'
        : 'Optimal Total T ≥500 ng/dL for men 40+.',
      source: 'AACE 2024 / AUA Testosterone Guidelines',
    }] : []),

    // ── URIC ACID — sex-stratified ────────────────────────────────────
    {
      marker: /\buric\s*acid\b/i,
      high: isMale ? 6.0 : 5.0,
      unit: 'mg/dL',
      rationale: isMale
        ? 'Optimal uric acid <6.0 mg/dL for men (gout threshold). Lab normal (≤7.2) includes elevated CV/renal risk zone.'
        : 'Optimal uric acid <5.0 mg/dL for women.',
      source: 'ACR 2020 Gout Guidelines',
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
 * the lab's "normal" range but outside the optimal range for the
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
