// supabase/functions/_shared/buildPlan.ts
//
// CauseHealth Wellness Plan v2 — DETERMINISTIC ORCHESTRATOR
// =========================================================
// Pure function. Same input → same output. No AI. No DB calls.
//
// Takes a normalized patient input and runs every rules module to produce
// a `ClinicalFacts` object. Every structured field on the wellness plan
// (test list, conditions, supplements, alerts, risk numbers, goals) lives
// here. The narrative AI calls receive ClinicalFacts as INPUT and only
// write prose — they cannot invent or omit clinical facts.
//
// To change what tests fire, what conditions are flagged, what
// supplements are recommended: edit the corresponding rules file in
// `_shared/rules/`. No edge-function deploy needed to verify — every
// rules file is unit-testable in isolation.

import { buildTestList, type TestOrder } from './rules/testRules.ts';
import { buildConditionList, type SuspectedConditionFact } from './rules/conditionRules.ts';
import { buildDepletionList, type DepletionFact } from './rules/depletionRules.ts';
import { buildSupplementCandidates, type SupplementCandidate } from './rules/supplementRules.ts';
import { buildGoalTargets, type GoalTarget } from './rules/goalRules.ts';
import { buildAlerts, type EmergencyAlertFact, type CrisisAlertFact } from './rules/alertRules.ts';
import { buildPrepInstructions as buildPrepInstructionsRule, type PrepInstructionFact } from './rules/prepRules.ts';
import { computeAllRiskCalculators, type RiskCalculatorBundle } from './rules/riskCalculators.ts';
import { detectSuboptimalValues, type OptimalFlag } from './optimalRanges.ts';
import { GUIDELINE_CITATIONS } from './canonical.ts';
import { buildSymptomsAddressed, type SymptomAddressed } from './rules/symptomRules.ts';
import { buildCanonicalProse, type CanonicalProseBundle } from './rules/proseRules.ts';
import { computeExpectedFindings } from './expectedFindings.ts';

// ──────────────────────────────────────────────────────────────────────
// LAB VALUE — canonical normalized lab row (every rule consumes this).
// The edge function normalizes whatever the DB stores into this shape
// before calling buildPlan().
// ──────────────────────────────────────────────────────────────────────
export interface LabValue {
  marker: string;
  value: number | string | null;
  unit: string;
  flag?: 'critical_high' | 'critical_low' | 'high' | 'low' | 'watch' | 'normal' | string;
  refLow?: number | null;
  refHigh?: number | null;
  drawnAt?: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// INPUT — normalized patient data, gathered by the edge function before
// calling buildPlan(). Keep this tight; if we need a new signal, add it
// here and to the rules that consume it.
// ──────────────────────────────────────────────────────────────────────
export interface PatientInput {
  age: number | null;
  sex: 'male' | 'female' | string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;            // computed from height + weight; null if either missing

  // Free-text lower-cased blobs — used by alias-based matchers.
  conditionsList: string[];
  conditionsLower: string;       // joined+lowered for fast pattern matching
  medsList: string[];
  medsLower: string;
  symptomsList: SymptomEntry[];
  symptomsLower: string;
  supplementsList: string[];
  supplementsLower: string;

  // Structured lab data with HIGH/LOW/CRITICAL/WATCH flags already attached.
  labs: LabValue[];
  labsLower: string;             // human-readable summary for regex matchers

  // Profile flags
  isPregnant: boolean;
  hasShellfishAllergy: boolean;
  hasSulfaAllergy: boolean;

  // Free-text from user
  freeText: string;              // any "what's bothering you" prose
}

export interface SymptomEntry {
  name: string;
  /** 1-5 scale (matches the in-app severity selector on Step 4). The AI
   *  prompts are explicitly told this scale so they don't render "5/10"
   *  when a user reported a 5/5. Always include the denominator (e.g.
   *  "5/5") in any prose to avoid ambiguity. */
  severity: number;              // 1-5
}

// ──────────────────────────────────────────────────────────────────────
// OUTPUT — every clinical fact a wellness plan needs. Narrative AI calls
// consume this and add prose; they never modify these fields.
// ──────────────────────────────────────────────────────────────────────
export interface ClinicalFacts {
  // Patient context (echoed for AI convenience)
  patient: {
    age: number | null;
    sex: 'male' | 'female' | null;
    heightCm: number | null;
    weightKg: number | null;
    bmi: number | null;
    bmiCategory: 'underweight' | 'normal' | 'overweight' | 'obese_1' | 'obese_2' | 'obese_3' | null;
    conditions: string[];
    meds: string[];
    symptoms: SymptomEntry[];
    supplementsTaking: string[];
  };

  // Lab summary (raw + ranked outliers)
  labs: {
    raw: LabValue[];
    outliers: LabOutlierFact[];      // sorted by severity
  };

  // Deterministic clinical decisions
  tests: TestOrder[];                  // canonical names, ICD-10, why, priority, specialist
  conditions: SuspectedConditionFact[]; // high-confidence pattern matches only
  depletions: DepletionFact[];         // med → nutrient mapping
  supplementCandidates: SupplementCandidate[]; // for AI to write rationale prose

  // Derived numbers
  riskCalculators: RiskCalculatorBundle;

  // Safety
  emergencyAlerts: EmergencyAlertFact[];
  crisisAlert: CrisisAlertFact | null;
  prepInstructions: PrepInstructionFact[];
  suboptimalFlags: OptimalFlag[];

  // UI helpers
  goalTargets: GoalTarget[];           // From here / To here
  symptomsAddressed: SymptomAddressed[]; // deterministic — no AI involvement

  // Metadata
  citations: { test: string; url: string; org: string }[];
  isOptimizationMode: boolean;

  // Canonical prose strings — same wording on every surface (lab analysis,
  // wellness plan, doctor prep). The AI prose layer adds CONTEXT around
  // these strings; never replaces them. Single source of cross-surface
  // wording truth.
  canonicalProse: CanonicalProseBundle;

  // Expected findings — markers whose flag is explained by a known
  // active condition (e.g. Gilbert syndrome → bilirubin elevation).
  // Every downstream prompt is instructed: "When a marker appears in
  // EXPECTED_FINDINGS, do not alarm. Reference the source condition.
  // Do not recommend testing or supplements against that marker alone."
  // Single source of truth that prevents the Wellness-Plan-says-attention /
  // Doctor-Prep-says-expected contradiction the Marisa audit surfaced.
  expectedFindings: Array<{
    /** Stable rule id, e.g. 'gilbert_bilirubin'. */
    key: string;
    /** Exact marker name. */
    marker: string;
    /** The active condition that explains the value. */
    conditionLabel: string;
    /** Plain-English explanation. */
    rationale: string;
  }>;
}

export interface LabOutlierFact {
  marker: string;
  value: number;
  unit: string;
  flag: 'critical_high' | 'critical_low' | 'high' | 'low' | 'watch';
  severityRank: number;              // higher = more urgent
  interpretation: string;            // 1-line plain English
}

// ──────────────────────────────────────────────────────────────────────
// MAIN ENTRY — runs every rules module in dependency order.
// ──────────────────────────────────────────────────────────────────────
export function buildPlan(input: PatientInput): ClinicalFacts {
  const sexNormalized: 'male' | 'female' | null =
    input.sex === 'male' || input.sex === 'female' ? input.sex : null;

  // 1. Lab outlier ranking (used by other rules)
  const outliers = rankLabOutliers(input.labs);

  // 2. Deterministic test list (canonical only)
  const tests = buildTestList({
    age: input.age,
    sex: sexNormalized,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    labsLower: input.labsLower,
    medsLower: input.medsLower,
    isPregnant: !!input.isPregnant,
  });

  // 3. Suspected conditions (deterministic pattern matchers, high confidence)
  const conditions = buildConditionList({
    age: input.age,
    sex: sexNormalized,
    bmi: input.bmi,
    labs: input.labs,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    medsLower: input.medsLower,
  });

  // 4. Med-driven depletions
  const depletions = buildDepletionList({
    medsLower: input.medsLower,
    medsList: input.medsList,
  });

  // 5. Supplement candidates (depletions + lab outliers → recommendations)
  //
  // Note on severity gating: the in-app Step 4 symptom picker no longer
  // has a severity slider (users rated everything 5 by default, which
  // produced false signal). Every selected symptom is auto-stamped
  // severity = 5 as a no-op default. The act of selecting a symptom IS
  // the signal — no further gating needed at the rule layer.
  const supplementCandidates = buildSupplementCandidates({
    age: input.age,
    sex: sexNormalized,
    depletions,
    outliers,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    supplementsLower: input.supplementsLower,
    isPregnant: input.isPregnant,
    hasShellfishAllergy: input.hasShellfishAllergy,
    hasSulfaAllergy: input.hasSulfaAllergy,
  });

  // 5.5  Condition workup tests — owned by the condition card, NOT the top list.
  //
  // Each suspected-condition rule (hyperprolactinemia, adrenal cortisol,
  // hemochromatosis, etc.) ships with its own confirmatory_tests array.
  // These render inside the pattern card under "Tests to confirm" — each
  // already with its ICD-10 code and "what to ask your doctor" prose.
  //
  // We DO NOT merge them into the top-level test list, because that
  // double-prints the same test (once standalone, once inside the
  // pattern). The 2026-05-12 Marisa audit surfaced this directly:
  // β-hCG, repeat prolactin, Free Testosterone, DHEA-S, AMH, Pelvic US,
  // repeat AM cortisol all appeared twice. Universal fix: top list is
  // for canonical/baseline/lab-driven tests only; pattern-owned workup
  // tests live under the pattern that owns them.
  //
  // The legacy dedup machinery below is kept (TEST_COVERAGE map, three-
  // layer matcher) for the rare case a condition workup test ALSO has
  // an independent reason to surface in the top list (handled by the
  // canonical testIndications.ts registry directly).
  //
  // SMART DEDUP (universal): three layers, each handles a different
  // duplicate pattern. The user's Marisa output showed both
  // "Thyroid Panel (TSH + Free T4 + Free T3)" AND "TSH (rule out primary
  // hypothyroidism)" — and "Hashimoto's Antibodies (TPO Ab + Thyroglobulin
  // Ab)" AND "TPO antibodies" — because each layer only caught some.
  //
  // Layer 1: COVERAGE — known panels cover their components. If an
  // existing test name matches a panel pattern, any new test name that
  // matches one of its covers gets dropped.
  //
  // Layer 2: NORMALIZED EXACT MATCH — case + whitespace + qualifier
  // collapse. Catches "Fasting prolactin" + "Prolactin (repeat fasting)".
  //
  // Layer 3: SUBSTRING — if a short new entry is contained whole in a
  // longer existing entry (parens preserved), dedup. Catches "TSH" inside
  // "Thyroid Panel (TSH + Free T4 + Free T3)" once parens are kept.
  //
  // Adding a new panel = ADD A ROW to TEST_COVERAGE below.

  /** Panel → component coverage. Each row: panel name pattern + list of
   *  component patterns it subsumes. If panel is in the list, drop any
   *  component entry. Universal across every user — add a row for any
   *  new panel that ships in retestRegistry. */
  const TEST_COVERAGE: Array<{ panel: RegExp; covers: RegExp[] }> = [
    {
      panel: /thyroid\s+panel|thyroid\s+function/i,
      covers: [
        /^tsh\b/i, /^tsh\s*\(/i,
        /\bfree\s*t4\b/i, /\bfree\s*t3\b/i, /\breverse\s*t3\b/i,
        /^t4\b/i, /^t3\b/i,
      ],
    },
    {
      panel: /hashimoto'?s?\s+antibod|thyroid\s+antibod/i,
      covers: [
        /\btpo\s*(antibod|ab\b)/i,
        /\bthyroglobulin\s*(antibod|ab\b)/i,
        /\btg.?ab\b/i,
        /^thyroglobulin\s*antibodies\b/i,
        /^tpo\s*antibodies\b/i,
      ],
    },
    {
      panel: /iron\s+panel/i,
      covers: [/^iron\b/i, /\btibc\b/i, /^ferritin\b/i, /\btransferrin\s*saturation/i],
    },
    {
      panel: /\bcmp\b|comprehensive\s+metabolic/i,
      covers: [
        /^sodium\b/i, /^potassium\b/i, /^chloride\b/i, /\bbun\b/i, /^creatinine\b/i,
        /^glucose\b/i, /^albumin\b/i, /^calcium\b/i, /\begfr\b/i,
      ],
    },
    {
      panel: /\bcbc\b|complete\s+blood\s+count/i,
      covers: [
        /^rbc\b/i, /^wbc\b/i, /\bplatelet/i, /hemoglobin\b(?!\s*a1c)/i,
        /hematocrit/i, /^mcv\b/i, /^mch\b/i, /^mchc\b/i, /^rdw\b/i,
      ],
    },
    {
      panel: /lipid\s+panel/i,
      covers: [
        /total\s+cholesterol/i, /^ldl\b/i, /^hdl\b/i, /^triglyceride/i, /\bvldl\b/i,
      ],
    },
    {
      panel: /testosterone\s+panel|male\s+hormon|androgen\s+panel/i,
      covers: [
        /total\s+testosterone/i, /free\s+testosterone/i, /\bshbg\b/i,
        /\bdhea[\s-]?s\b/i, /\blh\b/i, /\bfsh\b/i,
      ],
    },
    {
      panel: /pcos\s+panel/i,
      covers: [
        /total\s+testosterone/i, /free\s+testosterone/i, /\bdhea[\s-]?s\b/i,
        /\bshbg\b/i, /lh\s*\/?\s*fsh|lh\s+fsh/i, /fasting\s+insulin/i,
      ],
    },
    {
      panel: /b.?12\s+workup|b\s+vitamin\s+workup\s+macrocytic/i,
      covers: [/^b.?12\b/i, /^vitamin\s+b.?12\b/i, /\bmma\b/i, /homocysteine/i],
    },
    {
      panel: /folate\s+workup/i,
      covers: [/^folate\b/i, /^serum\s+folate/i, /^rbc\s+folate/i],
    },
  ];

  /** Normalize for exact-match dedup. Preserves parenthetical content
   *  (we just strip the parens themselves) so panel components stay
   *  searchable. Lowercases, collapses whitespace, drops common
   *  qualifiers that don't change the test identity. */
  const normalizeTestName = (s: string): string =>
    s.toLowerCase()
      .replace(/[()]/g, ' ')
      .replace(/\b(fasting|repeat|am|morning|late[\s-]?night|lab[\s-]?based|or\s+serum)\b/gi, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  /** True if `candidate` is already covered by some entry in `existing`. */
  const isCoveredByExisting = (candidate: string, existing: TestOrder[]): boolean => {
    if (!candidate.trim()) return true;
    const candNorm = normalizeTestName(candidate);

    // Layer 1 — coverage map. Is `candidate` a component of a panel
    // that's already in `existing`?
    for (const cov of TEST_COVERAGE) {
      const panelInExisting = existing.some(t => cov.panel.test(t.name));
      if (!panelInExisting) continue;
      if (cov.covers.some(c => c.test(candidate))) return true;
    }

    // Layer 2 — normalized exact match.
    const existingNorms = existing.map(t => normalizeTestName(t.name));
    if (existingNorms.includes(candNorm)) return true;

    // Layer 3 — short-name substring containment. "tsh" inside
    // "thyroid panel tsh free t4 free t3". Only apply if the candidate
    // is short enough that containment is meaningful (avoids false
    // positives on long phrases).
    if (candNorm.length < 25) {
      for (const e of existingNorms) {
        if (e.length > candNorm.length && e.includes(candNorm)) return true;
      }
    }

    return false;
  };
  // Pattern-owned workup tests are intentionally NOT merged into the top
  // list. They're displayed inside the condition card by the UI.
  const conditionDrivenTests: TestOrder[] = [];

  // Final test list: canonical baseline tests + dedup'd condition-workup
  // tests, then cap. Universal cap stops the list from ballooning to 25+
  // entries when multiple conditions all want the same workup.
  //
  // Cap at TEST_LIST_TOP_N. Sort key prioritizes:
  //   1. urgent / critical priority first
  //   2. high before moderate
  //   3. baseline tier before pattern tier within same priority
  //   4. canonical tests before condition_workup entries
  //   5. preserve input order within ties
  //
  // Bumped 18 → 25 in -20 so comprehensive baseline (HIV, Hep C, Colon,
  // Insulin, UACR, Homocysteine, AAA US, AM Cortisol added) isn't
  // cap-cut for older adults with risk patterns also firing.
  const TEST_LIST_TOP_N = 25;
  const TEST_PRIORITY_RANK: Record<string, number> = {
    urgent: 0, critical: 0, a: 0,
    high: 1, b: 1,
    moderate: 2, c: 2,
    low: 3, d: 3, e: 3,
  };
  const TIER_RANK: Record<string, number> = {
    baseline: 0,      // standard of care — never cap-cut if possible
    preventive: 1,
    pattern: 2,
    specialist: 3,
    imaging: 4,
  };
  const merged = [...tests, ...conditionDrivenTests];
  // Stable sort by (priority, tier, isCanonical) — preserve input order otherwise.
  const indexed = merged.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const pa = TEST_PRIORITY_RANK[String((a.t as any).priority ?? 'moderate').toLowerCase()] ?? 5;
    const pb = TEST_PRIORITY_RANK[String((b.t as any).priority ?? 'moderate').toLowerCase()] ?? 5;
    if (pa !== pb) return pa - pb;
    const ta = TIER_RANK[String((a.t as any).tier ?? 'pattern').toLowerCase()] ?? 9;
    const tb = TIER_RANK[String((b.t as any).tier ?? 'pattern').toLowerCase()] ?? 9;
    if (ta !== tb) return ta - tb;
    const ca = (a.t as any).sourcedFrom === 'condition_workup' ? 1 : 0;
    const cb = (b.t as any).sourcedFrom === 'condition_workup' ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return a.i - b.i;
  });
  const allTests: TestOrder[] = indexed.slice(0, TEST_LIST_TOP_N).map(x => x.t);

  // 6. Goal targets (From here / To here)
  const goalTargets = buildGoalTargets({
    outliers,
    age: input.age,
    sex: sexNormalized,
  });

  // 7. Risk calculators
  const riskCalculators = computeAllRiskCalculators({
    labs: input.labs,
    age: input.age,
    sex: sexNormalized,
    conditionsLower: input.conditionsLower,
    medsLower: input.medsLower,
  });

  // 8. Safety alerts
  const { emergencyAlerts, crisisAlert } = buildAlerts({
    labs: input.labs,
    symptomsList: input.symptomsList,
    freeText: input.freeText,
  });

  // 9. Pre-analytical prep instructions
  const prepInstructions = buildPrepInstructionsRule({
    age: input.age,
    sex: sexNormalized,
    medsLower: input.medsLower,
    supplementsLower: input.supplementsLower,
    conditionsLower: input.conditionsLower,
    symptomsLower: input.symptomsLower,
    tests: allTests,
  });

  // 10. Suboptimal range flags (in lab-normal but outside age/sex-optimal)
  const labRowsForSuboptimal = input.labs.map(l => ({
    marker_name: l.marker,
    value: l.value,
    unit: l.unit,
    optimal_flag: l.flag,
    standard_flag: l.flag,
  }));
  const suboptimalFlags = detectSuboptimalValues(labRowsForSuboptimal, {
    age: input.age ?? 0,
    sex: sexNormalized ?? '',
  });

  // 11. Citations — tied to which tests are ordered
  const citations = buildCitationsForTests(allTests);

  // 12. Mode classification (treatment vs optimization)
  const isOptimizationMode = isOptimization(outliers, conditions);

  // 13. Symptoms addressed — deterministic (NO AI). Built last so it can
  // reference the full FACTS bundle (outliers, depletions, conditions,
  // supplementCandidates).
  const factsForSymptoms: ClinicalFacts = {
    patient: {
      age: input.age, sex: sexNormalized,
      heightCm: input.heightCm, weightKg: input.weightKg,
      bmi: input.bmi, bmiCategory: bmiCategoryFor(input.bmi),
      conditions: input.conditionsList, meds: input.medsList,
      symptoms: input.symptomsList, supplementsTaking: input.supplementsList,
    },
    labs: { raw: input.labs, outliers },
    tests: allTests, conditions, depletions, supplementCandidates,
    riskCalculators, emergencyAlerts, crisisAlert, prepInstructions,
    suboptimalFlags, goalTargets,
    symptomsAddressed: [], // placeholder — real value computed next
    citations: [], isOptimizationMode,
    expectedFindings: [], // placeholder — real value computed after this
    canonicalProse: { conditions: [], outliers: [], supplements: [], goals: [], alerts: [] }, // populated in final return
  };
  const symptomsAddressed = buildSymptomsAddressed(factsForSymptoms);

  // Expected findings — markers whose flag is explained by a known
  // active condition OR by the patient's pregnancy/lactation state.
  // Computed deterministically once here and surfaced to every prompt
  // to prevent cross-surface contradictions on patients with
  // conditions like Gilbert syndrome / CKD / diagnosed diabetes, and
  // to suppress HPG-axis "drift" cards on pregnant / breastfeeding
  // users (Marisa Sirkin audit, 2026-05-11).
  const expectedFindings = computeExpectedFindings({
    conditionsLower: input.conditionsLower,
    sex: sexNormalized,
    isPregnant: !!input.isPregnant,
    labValues: input.labs.map(l => ({
      marker_name: String(l.marker ?? ''),
      value: l.value,
      unit: l.unit,
      standard_high: (l as any).standard_high ?? null,
      standard_low: (l as any).standard_low ?? null,
      optimal_flag: l.flag ?? null,
    })),
  }).map(e => ({
    key: e.key,
    marker: e.marker,
    conditionLabel: e.conditionLabel,
    rationale: e.rationale,
  }));

  // CROSS-SURFACE CONTRADICTION FIX (Marisa audit, 2026-05-12-14):
  // After expectedFindings is computed, RE-RANK outliers so markers
  // whose elevation/depression is fully explained by a known condition
  // (e.g., Bilirubin in Gilbert syndrome, A1c in diabetes) drop to
  // the bottom of the priority list. This prevents the headline AI
  // and downstream prose from picking an "expected" outlier as the
  // patient's main concern.
  //
  // We don't remove them entirely — they remain visible in lab tables
  // — but their severityRank drops to 1 so they no longer beat any
  // genuinely-actionable outlier in any sort.
  const expectedMarkerSet = new Set(
    expectedFindings.map(e => e.marker.toLowerCase().trim())
  );
  if (expectedMarkerSet.size > 0) {
    for (const o of outliers) {
      if (expectedMarkerSet.has(o.marker.toLowerCase().trim())) {
        o.severityRank = 1; // demoted; expected per condition
      }
    }
    outliers.sort((a, b) => b.severityRank - a.severityRank);
  }

  return {
    patient: {
      age: input.age,
      sex: sexNormalized,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      bmi: input.bmi,
      bmiCategory: bmiCategoryFor(input.bmi),
      conditions: input.conditionsList,
      meds: input.medsList,
      symptoms: input.symptomsList,
      supplementsTaking: input.supplementsList,
    },
    labs: { raw: input.labs, outliers },
    tests: allTests,
    conditions,
    depletions,
    supplementCandidates,
    riskCalculators,
    emergencyAlerts,
    crisisAlert,
    prepInstructions,
    suboptimalFlags,
    goalTargets,
    symptomsAddressed,
    citations,
    isOptimizationMode,
    expectedFindings,
    // Canonical prose computed last so it has access to every other field.
    canonicalProse: buildCanonicalProse({
      // Re-use the same in-construction object; canonicalProse only reads
      // patient + labs.outliers + conditions + supplementCandidates +
      // goalTargets + emergencyAlerts, all of which are already final.
      patient: {
        age: input.age, sex: sexNormalized,
        heightCm: input.heightCm, weightKg: input.weightKg,
        bmi: input.bmi, bmiCategory: bmiCategoryFor(input.bmi),
        conditions: input.conditionsList, meds: input.medsList,
        symptoms: input.symptomsList, supplementsTaking: input.supplementsList,
      },
      labs: { raw: input.labs, outliers },
      tests: allTests, conditions, depletions, supplementCandidates,
      riskCalculators, emergencyAlerts, crisisAlert, prepInstructions,
      suboptimalFlags, goalTargets, symptomsAddressed,
      citations, isOptimizationMode,
      expectedFindings,
      canonicalProse: { conditions: [], outliers: [], supplements: [], goals: [], alerts: [] },
    }),
  };
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

const FLAG_SEVERITY_RANK: Record<string, number> = {
  // Critical — outside any clinical reference, urgent attention.
  critical_high: 100,
  critical_low: 100,
  // Standard out-of-range — above or below the lab's own reference range.
  high: 50,
  low: 50,
  elevated: 50,                 // alias for 'high' emitted by optimalRanges.ts
  // Borderline — inside reference range but above/below functional optimal.
  // These are the "watch tier" outliers — same severity rank as 'watch'
  // for ranking + UI grouping. Per the v6 product positioning, these are
  // the "borderline-high / borderline-low" early-detection signals.
  watch: 20,
  suboptimal_high: 20,
  suboptimal_low: 20,
  borderline_high: 20,
  borderline_low: 20,
  // Within range / no signal.
  normal: 0,
  optimal: 0,
  // Defensive: do NOT treat 'unknown' as a signal. Caller should have
  // resolved this to a real flag via fallback to standard_flag.
};

/** Normalize the wide variety of optimal_flag / standard_flag values
 *  emitted by upstream code (and by lab parsing) into the canonical
 *  LabOutlierFact flag enum {critical_high, critical_low, high, low, watch}.
 *  Anything else returns null, which means "not an outlier — skip."
 *
 *  Without this, e.g., flag='elevated' (emitted by optimalRanges.ts) made
 *  it into the outlier list with the literal string 'elevated', and
 *  downstream UI flag-mappers fell through to 'optimal' even though the
 *  value was clearly above the lab's reference range. */
function normalizeOutlierFlag(raw: string): LabOutlierFact['flag'] | null {
  switch (raw) {
    case 'critical_high':
    case 'critical_low':
    case 'high':
    case 'low':
    case 'watch':
      return raw as LabOutlierFact['flag'];
    case 'elevated':           // emitted by optimalRanges.ts for above-range
      return 'high';
    case 'suboptimal_high':
    case 'borderline_high':
      return 'watch';
    case 'suboptimal_low':
    case 'borderline_low':
      return 'watch';
    default:
      return null;
  }
}

function rankLabOutliers(labs: LabValue[]): LabOutlierFact[] {
  const out: LabOutlierFact[] = [];
  for (const l of labs) {
    const raw = (l.flag ?? 'normal').toLowerCase();
    const canonical = normalizeOutlierFlag(raw);
    if (canonical === null) continue;
    out.push({
      marker: l.marker,
      value: typeof l.value === 'number' ? l.value : Number(l.value) || 0,
      unit: l.unit ?? '',
      flag: canonical,
      severityRank: FLAG_SEVERITY_RANK[canonical] ?? 0,
      interpretation: interpretOutlier(l.marker, l.value, canonical),
    });
  }
  return out.sort((a, b) => b.severityRank - a.severityRank);
}

function interpretOutlier(marker: string, value: number | string, flag: string): string {
  const v = typeof value === 'number' ? value : Number(value);
  const m = marker.toLowerCase();
  if (flag === 'critical_high' || flag === 'critical_low') return `${marker} ${v} — critical-range value, needs near-term attention.`;
  if (flag === 'high') return `${marker} ${v} — elevated above lab reference.`;
  if (flag === 'low') return `${marker} ${v} — below lab reference.`;
  if (flag === 'watch') return `${marker} ${v} — within normal but trending toward dysregulation.`;
  return `${marker} ${v}`;
}

function buildCitationsForTests(tests: TestOrder[]): { test: string; url: string; org: string }[] {
  const cites: { test: string; url: string; org: string }[] = [];
  const seen = new Set<string>();
  for (const t of tests) {
    const cite = (GUIDELINE_CITATIONS as Record<string, { test: string; url: string; org: string }>)[t.key];
    if (cite && !seen.has(cite.url)) {
      cites.push(cite);
      seen.add(cite.url);
    }
  }
  return cites;
}

function isOptimization(outliers: LabOutlierFact[], conditions: SuspectedConditionFact[]): boolean {
  // Treatment mode if: any critical-range value, OR ≥3 high-confidence conditions,
  // OR ≥4 outliers at high/critical severity.
  const hasCritical = outliers.some(o => o.flag.startsWith('critical'));
  const highCondCount = conditions.filter(c => c.confidence === 'high').length;
  const seriousOutlierCount = outliers.filter(o => o.severityRank >= 50).length;
  return !(hasCritical || highCondCount >= 3 || seriousOutlierCount >= 4);
}

// WHO / CDC adult BMI categories. Universal across all adult patients.
function bmiCategoryFor(bmi: number | null): ClinicalFacts['patient']['bmiCategory'] {
  if (bmi == null || !Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25.0) return 'normal';
  if (bmi < 30.0) return 'overweight';
  if (bmi < 35.0) return 'obese_1';
  if (bmi < 40.0) return 'obese_2';
  return 'obese_3';
}
