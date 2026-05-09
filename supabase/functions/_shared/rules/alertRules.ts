// supabase/functions/_shared/rules/alertRules.ts
//
// Wraps `safetyNet.ts` (existing) so buildPlan can call a single function
// and get both emergency-value alerts AND suicide-risk crisis alerts.

import { detectEmergencyAlerts, detectSuicideRisk } from '../safetyNet.ts';
import type { LabValue, SymptomEntry } from '../buildPlan.ts';

export interface EmergencyAlertFact {
  marker: string;
  value: number;
  unit: string;
  threshold: 'critical_low' | 'critical_high';
  message: string;
  severity: 'emergency';
}

export interface CrisisAlertFact {
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

  const emergencyAlerts = detectEmergencyAlerts(labRows) as EmergencyAlertFact[];
  const symptomsForCrisis = input.symptomsList.map(s => s.name);
  const crisisAlert = detectSuicideRisk(symptomsForCrisis, input.freeText) as CrisisAlertFact | null;

  return { emergencyAlerts, crisisAlert };
}
