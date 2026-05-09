// supabase/functions/_shared/preAnalytical.ts
//
// PHASE 3 — PRE-ANALYTICAL GUIDANCE
// =================================
// Test results are only as good as how the patient prepped for the draw.
// Modern labs are sensitive to confounders that can swing results 30-100%
// without any underlying physiology change.
//
// Universal pre-analytical rules — applied based on which tests are in
// the retest_timeline. Surfaced to the patient as a "How to prep for
// your next blood draw" card.
//
// Sources: ACP/USPSTF guidelines, Mayo Clinic Lab pre-analytical SOPs,
// ADA fasting protocol, ATA biotin warning, AACE testosterone guidelines.

export interface PrepInstruction {
  category: 'fasting' | 'medication' | 'supplement' | 'timing' | 'lifestyle' | 'cycle';
  triggeredByTest: string;        // canonical test key that triggered this
  instruction: string;             // what the patient must do
  importance: 'critical' | 'recommended';
  source: string;                  // citation
}

interface RetestEntry {
  marker?: string;
  _key?: string;
}

interface Context {
  retestTimeline: RetestEntry[];
  meds: string[];                  // medication names lowercased
  supps: string[];                 // supplement names lowercased
  sex: string;                     // 'male' / 'female' / etc.
  conditionsLower: string;
}

/**
 * Build the patient's pre-analytical prep card based on their upcoming
 * retest list, current meds, and current supplements. Returns an array
 * of distinct instructions (deduped) ordered by importance.
 *
 * Universal — every patient gets the relevant subset.
 */
export function buildPrepInstructions(ctx: Context): PrepInstruction[] {
  const out: PrepInstruction[] = [];
  const has = (re: RegExp) =>
    ctx.retestTimeline.some(r => re.test(String(r?.marker ?? '')) || re.test(String(r?._key ?? '')));

  // ── FASTING required for lipids, glucose, fasting insulin, HOMA-IR ────
  const fastingRequired =
    has(/lipid\s*panel|triglycerides?|cholesterol/i) ||
    has(/fasting\s*glucose|^glucose$/i) ||
    has(/fasting\s*insulin|homa[\s-]?ir/i) ||
    has(/cmp|comprehensive\s*metabolic/i);
  if (fastingRequired) {
    out.push({
      category: 'fasting',
      triggeredByTest: 'lipid_panel / fasting_glucose / fasting_insulin / cmp',
      instruction: 'Fast for 12 hours before the draw. Water only — no coffee, gum, mints, or food. Schedule the draw for early morning to make this easier.',
      importance: 'critical',
      source: 'ADA + USPSTF fasting protocol',
    });
  }

  // ── BIOTIN warning if patient takes biotin / multivitamin / B-complex AND
  // has thyroid or troponin tests on the list ──
  const biotinSources = /\bbiotin|b[\s-]?7|multivitamin|b[\s-]?complex|hair\s*skin\s*nail/i;
  const onBiotin = ctx.supps.some(s => biotinSources.test(s));
  const thyroidOrTroponin = has(/thyroid|tsh|free\s*t[34]|troponin|tpo|tg\s*ab/i);
  if (onBiotin && thyroidOrTroponin) {
    out.push({
      category: 'supplement',
      triggeredByTest: 'thyroid_panel / hashimoto_antibodies / troponin',
      instruction: 'Stop biotin (B7) supplements at doses ≥5 mg for 72 hours before the draw. High-dose biotin distorts thyroid (TSH, Free T4) and troponin results — common cause of false-positive hyperthyroid readings.',
      importance: 'critical',
      source: 'American Thyroid Association biotin alert',
    });
  }

  // ── CREATINE warning if patient takes creatine + kidney function tests ──
  const onCreatine = ctx.supps.some(s => /\bcreatine\s*(monohydrate)?\b/i.test(s));
  const kidneyTests = has(/creatinine|egfr|cmp|comprehensive\s*metabolic/i);
  if (onCreatine && kidneyTests) {
    out.push({
      category: 'supplement',
      triggeredByTest: 'cmp / creatinine / egfr',
      instruction: 'Stop creatine supplementation for 7 days before kidney function testing. Creatine raises serum creatinine 0.1-0.3 mg/dL artificially and falsely lowers eGFR — can lead to misdiagnosis of kidney disease.',
      importance: 'critical',
      source: 'KDIGO clinical practice guidelines',
    });
  }

  // ── EXERCISE — 24h before any draw, especially CK + transaminases ─────
  const exerciseSensitive = has(/ck|creatine\s*kinase|alt|ast|sgpt|sgot|cmp|liver/i);
  if (exerciseSensitive) {
    out.push({
      category: 'lifestyle',
      triggeredByTest: 'ck / liver enzymes / cmp',
      instruction: 'Avoid intense exercise (running, weights, HIIT) for 24 hours before the draw. Strenuous exercise raises CK, AST, and even troponin — can falsely flag muscle or liver damage.',
      importance: 'recommended',
      source: 'AACE/ACSM pre-analytical guidance',
    });
  }

  // ── AM TESTOSTERONE — must be drawn before 10 AM ─────────────────────
  const testosteroneTest = has(/testosterone/i);
  if (testosteroneTest) {
    out.push({
      category: 'timing',
      triggeredByTest: 'testosterone_panel_male / testosterone_total_free',
      instruction: 'Schedule the draw before 10 AM. Testosterone is 30-50% higher in the morning than afternoon — afternoon draws routinely return falsely low values.',
      importance: 'critical',
      source: 'AACE Testosterone Guidelines',
    });
  }

  // ── CYCLE PHASE for female hormone tests ─────────────────────────────
  const femaleHormoneTest = has(/estradiol|progesterone|fsh|lh|amh|pcos\s*panel|female\s*hormone/i);
  const isFemale = ctx.sex.toLowerCase() === 'female';
  if (isFemale && femaleHormoneTest) {
    out.push({
      category: 'cycle',
      triggeredByTest: 'estradiol / progesterone / fsh / lh / pcos_panel',
      instruction: 'For estradiol, progesterone, FSH, LH: schedule the draw on cycle day 3 ± 2 if you have regular cycles. These hormones vary 10× across the cycle. If you don\'t track cycles or have irregular periods, mention that to your doctor — they\'ll interpret the results accordingly.',
      importance: 'critical',
      source: 'ACOG / ASRM guidance',
    });
  }

  // ── RECENT ILLNESS warning — applies to inflammatory + nutrient markers ──
  const illnessSensitive = has(/hs[-\s]?crp|ferritin|cbc|complete\s*blood\s*count|wbc|esr/i);
  if (illnessSensitive) {
    out.push({
      category: 'lifestyle',
      triggeredByTest: 'hs_crp / ferritin / cbc / esr',
      instruction: 'If you have been sick or had a viral infection in the last 2 weeks, mention it to your doctor before the draw. Recent illness raises hs-CRP, ferritin, ESR, and shifts CBC counts — can mimic chronic inflammation patterns.',
      importance: 'recommended',
      source: 'AACC pre-analytical confounders',
    });
  }

  // ── PROTEIN/WHEY warning — affects BUN + creatinine ──────────────────
  const onWheyOrProtein = ctx.supps.some(s => /\b(whey|protein\s*powder|casein|collagen)/i.test(s));
  if (onWheyOrProtein && kidneyTests) {
    out.push({
      category: 'supplement',
      triggeredByTest: 'cmp / bun / creatinine',
      instruction: 'High-protein supplements (whey, casein, collagen, protein powder) mildly raise BUN and creatinine. Skip the day before the draw or note your usual intake to your doctor.',
      importance: 'recommended',
      source: 'KDIGO supplementary guidance',
    });
  }

  return out;
}
