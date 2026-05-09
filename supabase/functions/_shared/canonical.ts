// supabase/functions/_shared/canonical.ts
//
// CAUSEHEALTH CANONICAL MODULE
// ============================
// Single source of truth for shared content across the 3 generation
// surfaces (analyze-labs, generate-wellness-plan, generate-doctor-prep).
// Eliminates voice/test-name/threshold drift between prompts.
//
// ── ARCHITECTURE MAP ───────────────────────────────────────────────────
// 3 generation surfaces:
//   • analyze-labs            → priority_findings, patterns, missing_tests, summary
//   • generate-wellness-plan  → supplement_stack, retest_timeline, action_plan,
//                               possible_conditions, eating_pattern, lifestyle,
//                               workouts, symptoms_addressed, today_actions
//   • generate-doctor-prep    → clinical_summary, tests_to_request,
//                               possible_conditions, visit_card_stacks
//
// Cross-surface invariants (Phase 4 enforces):
//   • doctor-prep.tests_to_request  ⊆ wellness.retest_timeline (same set,
//     grouped by specialist for the visit)
//   • doctor-prep.possible_conditions = wellness.suspected_conditions
//   • analyze-labs.missing_tests   ⊆ wellness.retest_timeline
//
// 27 _shared engines fall into these buckets:
//   • Detection      : conditionAliases, medicationAliases, symptomTestMap
//   • Patterns       : labPatternRegistry, causalChainBuilder,
//                      predictiveOutcomes, specialtySynthesizer
//   • Backstops      : criticalFindingsBackstop, suspectedConditionsBackstop,
//                      replacementTherapyChecks
//   • Filtering      : rareDiseaseGate, alreadyOptimalFilter, healthMode,
//                      patientClassifier, drugInteractionEngine,
//                      supplementLabInteractions, testQualityFlagger
//   • Reference data : retestRegistry (CANONICAL test names),
//                      supplementRegistry, testRationale
//   • Engines        : pathwayEngine (condition → required tests/supps),
//                      testInjectors (universal baseline + lab-driven adds),
//                      medicationAlternativesEngine, regenCap,
//                      longitudinalDelta, goals, syntheticPatients,
//                      auditLog
//
// Post-processor sequence (Phase 8 documents):
//   Stage 1 SANITIZE  → decimal-fix, fake-test rename, suffix strip,
//                       whitespace clean
//   Stage 2 INJECT    → universal baseline + sex-specific + lab-driven
//                       + medication-driven + condition-driven via
//                       pushRetestByKey (retestRegistry as source)
//   Stage 3 FILTER    → LOW-conf drop, behavior-trial drop, non-test drop,
//                       OGTT gate, panel-component redundancy
//   Stage 4 DEDUP     → exact-name → test-family → panel-bundle →
//                       escalation-pair (ultrasound before FibroScan etc.)
//   Stage 5 NORMALIZE → specialist remap, word cap, alarm scrub,
//                       supplement-inference scrub, decimal scrub on output

// ──────────────────────────────────────────────────────────────────────
// CANONICAL VOICE RULES — imported by all 3 system prompts.
// Single point of truth so voice never drifts between surfaces.
// ──────────────────────────────────────────────────────────────────────
export const CANONICAL_VOICE = `═══ VOICE & MISSION — EQUIPPED ADVOCATE, NOT PASSIVE PATIENT ═══
CauseHealth arms patients to use their existing doctor and insurance correctly. Never alarmist, always proportional, always actionable.

LANGUAGE RULES:
- 6th-grade reading level. Lay terms ("liver enzyme", "iron stores", "blood sugar"). Marker abbreviation only in parens after the term ("liver enzyme (ALT) is 97").
- COMPLETE GRAMMATICAL SENTENCES. Every clause has subject + verb + object. Never write fragments like "early your body ignoring insulin" — write "early signs your body is ignoring insulin."
- NO REDUNDANT PHRASING. Never "dysbiotic dysbiosis", "anemic anemia", "inflammatory inflammation". The noun carries the meaning.
- COMPLETE NUMBERS. Never split decimals or write fragments like "5.5%" as "5%" or ".5%". Always write the full value.

FORBIDDEN words/phrases in any user-facing field: "metabolic emergency", "this is alarming", "dangerous", "catastrophic", "rush to ER", "call your doctor today/now", "critical(ly)" (unless lab in true critical_low/critical_high range), "emergency" (unless reporting a true critical-range value), "crisis"/"crises".

PREFER: "elevated", "needs attention", "ask your doctor about", "discuss at your next visit", "request from your PCP", "bring this to your appointment".

EQUIPPED-ADVOCATE FRAMING:
- Treat the patient as someone capable of managing their own care with the right information.
- Frame findings as informational handoffs, not alarms: "Your X is elevated; here's what to ask your doctor" — not "Your X is dangerous, call now."
- Reference covered care when applicable: "ApoB is covered as preventive screening with the right ICD-10 code."

DO NOT add a separate "ask your doctor" sentence to every field — embed naturally inline. ONE doctor-ask per finding is enough.`;

// ──────────────────────────────────────────────────────────────────────
// CANONICAL FORBIDDEN-PHRASE SCRUBBER MAP
// Used by Stage 5 NORMALIZE alarm scrub on every user-facing string.
// Single source so all 3 surfaces apply identical replacements.
// ──────────────────────────────────────────────────────────────────────
export const ALARM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmetabolic emergency\b/gi, 'metabolic concern'],
  [/\bmedical emergency\b/gi, 'matter for your doctor'],
  [/\bcall your doctor (?:today|now|right away|immediately)\b/gi, 'discuss with your doctor'],
  [/\bcall (?:your\s+)?(?:doctor|provider|md|physician)\s+(?:right )?now\b/gi, 'discuss with your doctor'],
  [/\b(?:rush|go straight) to (?:the )?(?:er|emergency room)\b/gi, 'consult your doctor'],
  [/\bthis is alarming\b/gi, 'this needs attention'],
  [/\balarming(?:ly)?\b/gi, 'concerning'],
  [/\bdangerously\b/gi, 'notably'],
  [/\bdangerous\b/gi, 'elevated'],
  [/\bcatastrophic(?:ally)?\b/gi, 'serious'],
  [/\bcris(?:is|es)\b/gi, 'concern'],
  [/\bsevere\s+(sleep\s+deprivation|fatigue|hyperlipidemia)\b/gi, 'significant $1'],
  [/\bcritically\s+low\b/gi, 'low'],
  [/\bcritically\s+high\b/gi, 'high'],
  // Watch-tier consistency: AI sometimes calls Watch-tier values "optimal"
  // or "normal" while elsewhere flagging them. Force consistent framing.
  [/\b(a1c|hba1c|hemoglobin\s*a1c)\s+5\.[456]%?\s+is\s+(currently\s+)?(optimal|normal)\b/gi, '$1 5.5% is Watch-tier (upper end of normal — early metabolic stress)'],
  [/\b(fasting\s+glucose)\s+(9[5-9])\s+(mg\/dL)?\s*is\s+(currently\s+)?(optimal|normal)\b/gi, '$1 $2 is Watch-tier (top of normal — early dysmetabolism)'],
];

// ──────────────────────────────────────────────────────────────────────
// CANONICAL FAKE-TEST-NAME SCRUBBER
// AI keeps inventing names by mashing real test names together.
// Apply to rawText (pre-parse) AND to parsed JSON marker/why fields
// (post-parse) — belt and suspenders.
// ──────────────────────────────────────────────────────────────────────
export const FAKE_TEST_NAME_FIXES: Array<[RegExp, string]> = [
  [/\bfecal\s*gut\s*hs[\s\-]?CRP\b/gi, 'Fecal Calprotectin'],
  [/\bfecal\s*hs[\s\-]?CRP\b/gi, 'Fecal Calprotectin'],
  [/\bgut\s*hs[\s\-]?CRP\b/gi, 'Fecal Calprotectin'],
  [/\bdysbiotic\s+dysbiosis\b/gi, 'dysbiosis'],
  // The "early your body ignoring insulin" fragment chain — caused by an
  // earlier overzealous jargon replacement that's now disabled but the
  // AI sometimes still echoes the phrase from cached prompt examples.
  [/early your body ignoring insulin/gi, 'early signs your body is ignoring insulin'],
  [/your body ignoring insulin/gi, 'your body is ignoring insulin'],
];

export function scrubAlarm(text: string): string {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [pat, rep] of ALARM_REPLACEMENTS) out = out.replace(pat, rep);
  return out;
}

export function scrubFakeTestNames(text: string): string {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [pat, rep] of FAKE_TEST_NAME_FIXES) out = out.replace(pat, rep);
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// CANONICAL DECIMAL-PROTECTION HELPERS
// AI/post-processors sometimes split decimals at sentence boundaries
// (5.5% → "5%" or "5. 5%"). These two helpers keep numbers intact.
// ──────────────────────────────────────────────────────────────────────
export function fixDecimalSpaces(text: string): string {
  return typeof text === 'string'
    ? text.replace(/(\d)\.\s+(\d)/g, '$1.$2')
    : text;
}

/** Decimal-aware sentence splitter. Sentinel-protects decimal points,
 *  splits on ?punct + space + capital letter, restores. */
export function splitSentencesSafely(text: string): string[] {
  const SENTINEL = '';
  const protected_ = text.replace(/(\d)\.(\d)/g, `$1${SENTINEL}$2`);
  const parts = protected_.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.map(p => p.replace(new RegExp(SENTINEL, 'g'), '.'));
}

// ──────────────────────────────────────────────────────────────────────
// CANONICAL CRITICAL VALUE THRESHOLDS (Phase 2 will wire this up)
// These are the values that bypass normal flow → urgent escalation.
// Sourced from Tietz Textbook of Clinical Chemistry critical-value
// guidelines + ACEP critical lab value standards.
// ──────────────────────────────────────────────────────────────────────
export interface CriticalThreshold {
  marker: RegExp;
  low?: number;
  high?: number;
  unit: string;
  message: string;
}

export const CRITICAL_VALUE_THRESHOLDS: CriticalThreshold[] = [
  { marker: /\bpotassium\b|\bk\+?\b/i, low: 2.5, high: 6.0, unit: 'mEq/L', message: 'Severe potassium derangement — call your doctor today or go to urgent care; can affect heart rhythm.' },
  { marker: /\bsodium\b|\bna\+?\b/i, low: 125, high: 150, unit: 'mEq/L', message: 'Severe sodium derangement — call your doctor today; can cause confusion and seizures if untreated.' },
  { marker: /\bglucose\b/i, low: 50, high: 400, unit: 'mg/dL', message: 'Severe blood sugar derangement — call your doctor today; if hypoglycemic and symptomatic, eat sugar and get help.' },
  { marker: /\bhemoglobin\b|\bhgb\b/i, low: 7, high: 20, unit: 'g/dL', message: 'Severe hemoglobin abnormality — call your doctor today; severe anemia or polycythemia needs prompt evaluation.' },
  { marker: /\bplatelets?\b/i, low: 50, high: 1000, unit: 'k/uL', message: 'Severe platelet derangement — call your doctor today; bleeding or clotting risk depending on direction.' },
  { marker: /\bcreatinine\b/i, high: 3.0, unit: 'mg/dL', message: 'Markedly elevated creatinine — call your doctor today; possible acute kidney injury.' },
  { marker: /\balt\b|\bsgpt\b/i, high: 500, unit: 'IU/L', message: 'Markedly elevated liver enzyme — call your doctor today; possible acute hepatitis.' },
  { marker: /\bcalcium\b/i, low: 7, high: 12, unit: 'mg/dL', message: 'Severe calcium derangement — call your doctor today; affects nerve and heart function.' },
];

// ──────────────────────────────────────────────────────────────────────
// SUICIDE-RISK INDICATORS (Phase 2 will wire this up)
// ──────────────────────────────────────────────────────────────────────
export const SUICIDE_RISK_PATTERNS: RegExp[] = [
  /\bsuicid/i,
  /\bself[\s-]?harm\b/i,
  /\bend (my|it all|my life)\b/i,
  /\bharm myself\b/i,
  /\bkill myself\b/i,
  /\bdon'?t want to (live|be here|exist)\b/i,
];

export const CRISIS_RESOURCES_TEXT =
  'If you are in crisis or having thoughts of self-harm, you are not alone. ' +
  'Call or text 988 (Suicide & Crisis Lifeline, free, 24/7) or text HOME to 741741 (Crisis Text Line). ' +
  'If you are in immediate danger, call 911 or go to your nearest emergency room.';

// ──────────────────────────────────────────────────────────────────────
// PRE-ANALYTICAL GUIDANCE (Phase 3 will wire this up)
// Test prep tips — surfaced in lab analysis + retest reminders.
// ──────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────
// PHASE 10 — TRUST + TRANSPARENCY LAYER
// Citation library mapping common test/recommendation patterns to the
// guideline they're sourced from. Surfaces in plan_data.citations as
// a "Why we recommended this" footer.
// ──────────────────────────────────────────────────────────────────────
export const GUIDELINE_CITATIONS: Record<string, string> = {
  // Cardiovascular
  ascvd: 'AHA/ACC 2018 Guideline on Management of Blood Cholesterol',
  apob: 'AHA/ACC 2018 + NLA 2024 — ApoB target <80 on statin therapy',
  lpa: 'NLA 2019 Position Statement — once-in-lifetime Lp(a) screening',
  cac: 'AHA/ACC 2019 Primary Prevention — CAC for borderline-intermediate ASCVD risk',
  // Liver / NAFLD
  fib4: 'AGA 2023 NAFLD Clinical Care Pathway',
  ggt: 'EASL 2024 Clinical Practice Guidelines — Liver Fibrosis Assessment',
  liver_ultrasound: 'AASLD 2023 Practice Guidance — NAFLD Imaging',
  // Endocrine / Metabolic
  hba1c: 'ADA 2024 Standards of Care — Diabetes Diagnosis',
  homa_ir: 'Matthews 1985 / ADA-recognized insulin-resistance index',
  fasting_insulin: 'AACE 2023 Clinical Practice Guidelines for Insulin Resistance',
  thyroid_panel: 'AACE/ATA 2014 — Thyroid Function Tests',
  hashimoto: 'ATA 2024 — Antibody Testing in Hypothyroid Workup',
  testosterone: 'AUA 2023 + AACE — Male Hypogonadism Diagnostic Algorithm',
  pcos: 'AE-PCOS 2023 + Endocrine Society 2013 — PCOS Diagnosis',
  // Nutrition / Hematology
  vit_d: 'Endocrine Society 2011 + Vitamin D Council — Optimal 40-60 ng/mL',
  vit_b12: 'AACE 2014 + Pernicious Anemia Society — MMA + Homocysteine',
  iron_panel: 'AACE 2023 / Function Health — Ferritin Optimal Ranges',
  mma: 'AACE 2014 — Methylmalonic Acid for Tissue B12 Status',
  // GI / IBD
  fecal_calprotectin: 'AGA 2023 IBD Activity Guidelines',
  celiac: 'ACG 2023 Guideline — Celiac Disease',
  // Inflammation
  hs_crp: 'AHA/CDC 2003 + Ridker — hs-CRP for CV Risk Stratification',
  // Sleep
  stop_bang: 'STOP-BANG questionnaire (Chung 2008) — OSA Screening',
  // Bone
  pth_calcium: 'KDOQI 2017 + Endocrine Society — Calcium-PTH Axis',
  uric_acid: 'ACR 2020 Gout Guidelines',
};

export const PRE_ANALYTICAL_GUIDANCE = {
  fasting: 'Fast 12 hours before the draw (water OK). Required for triglycerides, fasting glucose, fasting insulin.',
  biotin: 'Stop biotin (B7) supplements at doses ≥5 mg for 72 hours before the draw. High-dose biotin distorts thyroid (TSH, Free T4) and troponin results.',
  exercise: 'Avoid intense exercise for 24 hours before the draw. Strenuous exercise raises CK, AST, and even troponin.',
  am_testosterone: 'Testosterone should be drawn before 10 AM. Levels are 30-50% higher in the morning than afternoon.',
  cycle_phase: 'For estradiol, progesterone, FSH, LH: draw on cycle day 3 ± 2 if regular cycles. Levels vary 10× across the cycle.',
  creatine: 'Stop creatine supplementation for 7 days before kidney function testing. Creatine raises serum creatinine 0.1-0.3 mg/dL artificially.',
  recent_illness: 'If you have been sick in the last 2 weeks, mention it to your doctor — recent illness raises hs-CRP, ferritin, and shifts CBC.',
};
