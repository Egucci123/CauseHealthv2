// supabase/functions/_shared/auditLog.ts
//
// Audit log appended to every wellness plan as `plan._audit`. Records what
// fired (and what was skipped + why) for every deterministic layer.
//
// Visible only to admin / dev tools — not rendered to user. When something
// looks missing on a plan, query plan._audit and see exactly which engine
// considered it, fired it, or skipped it (and why).

import { ClassifyResult } from './patientClassifier.ts';
import { AdequacyFlag } from './replacementTherapyChecks.ts';
import { AlreadyOptimalResult } from './alreadyOptimalFilter.ts';
import { TestQualityFlag } from './testQualityFlagger.ts';
import { CausalChain } from './causalChainBuilder.ts';
import { ProjectedChange } from './predictiveOutcomes.ts';
import { SpecialtySynthesis } from './specialtySynthesizer.ts';
import { PathwayResult } from './pathwayEngine.ts';

export interface PlanAudit {
  /** Schema version of the audit envelope. */
  version: 1;
  /** ISO timestamp the plan was generated. */
  generatedAt: string;
  /** What the classifier decided + why. */
  classification: {
    mode: ClassifyResult['mode'];
    reasons: string[];
    flags: ClassifyResult['flags'];
    retestCap: number;
    retestCadence: string;
  };
  /** Adequacy flags fired. */
  adequacy: Array<{ key: string; severity: string; evidence: string }>;
  /** Already-optimal markers detected. */
  alreadyOptimal: Array<{ key: string; markerName: string; value: number; range: [number | null, number | null] }>;
  /** Test-quality caveats fired. */
  testQuality: Array<{ key: string; severity: string; evidence: string }>;
  /** Causal chain snapshot. */
  causal: { layer1: string[]; layer2: string[]; layer3: string[]; topInterventions: string[] };
  /** Cross-specialty span. */
  specialtySpan: { count: number; specialties: string[] };
  /** Pathway engine: what fired and what was skipped. */
  pathways: {
    conditionsMatched: string[];
    medClassesMatched: string[];
    symptomsMatched: string[];
    labPatternsMatched: string[];
    insertedTests: string[];
    insertedSupplements: string[];
    skippedTests: string[];        // already present in retest_timeline
    skippedSupplements: string[];  // user already taking
  };
  /** Predicted outcomes generated. */
  predictionCount: number;
  /** Lab counts. */
  labStats: { total: number; critical: number; outOfRange: number };
}

export interface BuildAuditInput {
  classification: ClassifyResult;
  adequacyFlags: AdequacyFlag[];
  alreadyOptimal: AlreadyOptimalResult;
  qualityFlags: TestQualityFlag[];
  causalChain: CausalChain;
  predictions: ProjectedChange[];
  specialtySynthesis: SpecialtySynthesis;
  pathwayResult: PathwayResult;
  labCount: number;
}

export function buildAudit(input: BuildAuditInput): PlanAudit {
  const ins = input.pathwayResult.audit.filter(a => a.inserted);
  const skp = input.pathwayResult.audit.filter(a => !a.inserted);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    classification: {
      mode: input.classification.mode,
      reasons: input.classification.reasons,
      flags: input.classification.flags,
      retestCap: input.classification.retestCap,
      retestCadence: input.classification.retestCadence,
    },
    adequacy: input.adequacyFlags.map(f => ({ key: f.key, severity: f.severity, evidence: f.evidence })),
    alreadyOptimal: input.alreadyOptimal.audit,
    testQuality: input.qualityFlags.map(f => ({ key: f.key, severity: f.severity, evidence: f.evidence })),
    causal: {
      layer1: input.causalChain.nodes.filter(n => n.layer === 1).map(n => n.key),
      layer2: input.causalChain.nodes.filter(n => n.layer === 2).map(n => n.key),
      layer3: input.causalChain.nodes.filter(n => n.layer === 3).map(n => n.key),
      topInterventions: input.causalChain.topInterventions.map(n => n.key),
    },
    specialtySpan: {
      count: input.specialtySynthesis.specialtyCount,
      specialties: input.specialtySynthesis.specialties as string[],
    },
    pathways: {
      conditionsMatched: input.pathwayResult.conditionsMatched,
      medClassesMatched: input.pathwayResult.medClassesMatched,
      symptomsMatched: input.pathwayResult.symptomsMatched,
      labPatternsMatched: input.pathwayResult.labPatternsMatched ?? [],
      insertedTests: ins.filter(a => a.kind === 'test').map(a => `${a.source}:${a.sourceKey}->${a.itemKey}`),
      insertedSupplements: ins.filter(a => a.kind === 'supplement').map(a => `${a.source}:${a.sourceKey}->${a.itemKey}`),
      skippedTests: skp.filter(a => a.kind === 'test').map(a => `${a.source}:${a.sourceKey}->${a.itemKey}`),
      skippedSupplements: skp.filter(a => a.kind === 'supplement').map(a => `${a.source}:${a.sourceKey}->${a.itemKey}`),
    },
    predictionCount: input.predictions.length,
    labStats: {
      total: input.labCount,
      critical: input.classification.flags.criticalCount,
      outOfRange: input.classification.flags.outOfRangeCount,
    },
  };
}
