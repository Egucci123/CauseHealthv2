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
  severity: number;              // 0-10
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
    tests,
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
  const citations = buildCitationsForTests(tests);

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
    tests, conditions, depletions, supplementCandidates,
    riskCalculators, emergencyAlerts, crisisAlert, prepInstructions,
    suboptimalFlags, goalTargets,
    symptomsAddressed: [], // placeholder — real value computed next
    citations: [], isOptimizationMode,
    canonicalProse: { conditions: [], outliers: [], supplements: [], goals: [], alerts: [] }, // populated in final return
  };
  const symptomsAddressed = buildSymptomsAddressed(factsForSymptoms);

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
    tests,
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
      tests, conditions, depletions, supplementCandidates,
      riskCalculators, emergencyAlerts, crisisAlert, prepInstructions,
      suboptimalFlags, goalTargets, symptomsAddressed,
      citations, isOptimizationMode,
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
