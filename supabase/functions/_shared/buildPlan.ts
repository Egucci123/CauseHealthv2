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

  // 5.5  Merge condition workup tests into the main test list
  //
  // Each suspected-condition rule (hyperprolactinemia, adrenal cortisol,
  // hemochromatosis, etc.) ships with its own confirmatory_tests array
  // — plain-English strings the rule authored. Previously these only
  // surfaced under the condition card and never reached the main
  // tests_to_request list the patient hands to their PCP.
  //
  // SMART DEDUP (universal): a naive lowercase-exact match double-lists
  // things like "TSH" and "Thyroid Panel (TSH + Free T4 + Free T3)" or
  // "Medication review (dopamine antagonists)" and "Medication review
  // (corticosteroids)". The normalized check below strips parentheticals
  // and common qualifiers, then drops any condition-driven test whose
  // normalized name is already covered by a canonical test (or by an
  // earlier-added condition-driven test).
  //
  // Result for Marisa: 29 raw merge items → ~13 unique tests, not 10
  // copies of "TSH"-flavored entries.
  const normalizeTestName = (s: string): string =>
    s.toLowerCase()
      .replace(/\([^)]*\)/g, ' ')           // strip parentheticals
      .replace(/\b(fasting|repeat|am|morning|late[\s-]?night|lab[\s-]?based)\b/gi, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const isCoveredByExisting = (norm: string, existing: Set<string>): boolean => {
    if (!norm) return true; // empty name → already covered (skip)
    if (existing.has(norm)) return true;
    // Substring containment: "tsh" is covered by "thyroid panel tsh free t4 free t3".
    // Only apply for short names to avoid false positives on long phrases.
    if (norm.length < 30) {
      for (const e of existing) {
        if (e.length > norm.length && e.includes(norm)) return true;
      }
    }
    return false;
  };
  const existingTestNorms = new Set<string>(tests.map(t => normalizeTestName(t.name)));
  const conditionDrivenTests: TestOrder[] = [];
  for (const cond of conditions) {
    if (!Array.isArray(cond.confirmatory_tests)) continue;
    for (const ct of cond.confirmatory_tests) {
      // Confirmatory tests come in two shapes depending on whether the
      // condition was enriched via testCatchesRegistry: either a plain
      // string OR an object { test, why }. Tolerate both.
      const name = typeof ct === 'string'
        ? ct
        : (ct as any)?.test ?? '';
      const why = typeof ct === 'string'
        ? `Confirmatory workup for ${cond.name}.`
        : (ct as any)?.why ?? `Confirmatory workup for ${cond.name}.`;
      const trimmed = String(name).trim();
      if (!trimmed) continue;
      const norm = normalizeTestName(trimmed);
      if (isCoveredByExisting(norm, existingTestNorms)) continue;
      existingTestNorms.add(norm);
      conditionDrivenTests.push({
        key: `cond_workup__${cond.key}__${norm.replace(/\s+/g, '_').slice(0, 40)}`,
        name: trimmed,
        icd10: cond.icd10 ?? null,
        priority: cond.confidence === 'high' ? 'high' : 'moderate',
        specialist: 'pcp',
        whyShort: `Workup for ${cond.name.toLowerCase()}`,
        why,
        sourcedFrom: 'condition_workup',
      } as any);
    }
  }

  // Final test list: canonical baseline tests + dedup'd condition-workup
  // tests, then cap. Universal cap stops the list from ballooning to 25+
  // entries when multiple conditions all want the same workup.
  //
  // Cap at TEST_LIST_TOP_N. Sort key prioritizes:
  //   1. urgent / critical priority first
  //   2. high before moderate
  //   3. canonical tests before condition_workup entries (since canonical
  //      go through testInjectors which is comprehensive and pre-deduped)
  //   4. preserve input order within ties
  const TEST_LIST_TOP_N = 18;
  const TEST_PRIORITY_RANK: Record<string, number> = {
    urgent: 0, critical: 0, a: 0,
    high: 1, b: 1,
    moderate: 2, c: 2,
    low: 3, d: 3, e: 3,
  };
  const merged = [...tests, ...conditionDrivenTests];
  // Stable sort by (priority, isCanonical) — preserve input order otherwise.
  const indexed = merged.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const pa = TEST_PRIORITY_RANK[String((a.t as any).priority ?? 'moderate').toLowerCase()] ?? 5;
    const pb = TEST_PRIORITY_RANK[String((b.t as any).priority ?? 'moderate').toLowerCase()] ?? 5;
    if (pa !== pb) return pa - pb;
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
