// supabase/functions/_shared/rules/alertRules.ts
//
// Wraps `safetyNet.ts` (existing) so buildPlan can call a single function
// and get both emergency-value alerts AND suicide-risk crisis alerts.

import { detectEmergencyAlerts, detectSuicideRisk } from '../safetyNet.ts';
import type { LabValue, SymptomEntry } from '../buildPlan.ts';

export interface EmergencyAlertFact {
  /** Stable cross-surface key, e.g., 'alert_potassium_critical_high'. */
  key: string;
  marker: string;
  value: number;
  unit: string;
  threshold: 'critical_low' | 'critical_high';
  message: string;
  severity: 'emergency';
}

export interface CrisisAlertFact {
  /** Stable key for the crisis alert (always same shape). */
  key: 'crisis_suicide_risk';
  type: 'suicide_risk';
  message: string;
  matchedPhrase?: string;
}

interface Input {
  labs: LabValue[];
  symptomsList: SymptomEntry[];
  freeText: string;
}

export function buildAlerts(input: Input): {
  emergencyAlerts: EmergencyAlertFact[];
  crisisAlert: CrisisAlertFact | null;
} {
  // Map our LabValue → safetyNet's LabRow shape
  const labRows = input.labs.map(l => ({
    marker_name: l.marker,
    value: l.value,
    unit: l.unit,
  }));

  const rawAlerts = detectEmergencyAlerts(labRows);
  // Stamp each alert with a stable cross-surface key. Universal — every
  // (marker, threshold) pair gets a deterministic key.
  const emergencyAlerts: EmergencyAlertFact[] = rawAlerts.map(a => ({
    ...a,
    key: 'alert_' + String(a.marker ?? 'unknown').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') + '_' + String(a.threshold ?? 'critical'),
  }));

  const symptomsForCrisis = input.symptomsList.map(s => s.name);
  const rawCrisis = detectSuicideRisk(symptomsForCrisis, input.freeText);
  const crisisAlert: CrisisAlertFact | null = rawCrisis
    ? { ...rawCrisis, key: 'crisis_suicide_risk' }
    : null;

  return { emergencyAlerts, crisisAlert };
}
