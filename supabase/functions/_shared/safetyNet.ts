// supabase/functions/_shared/safetyNet.ts
//
// PHASE 2 — SAFETY NET
// ====================
// Universal safety screens that run on every plan + every analysis,
// regardless of patient or condition.
//
//   1. CRITICAL-VALUE ESCALATOR — detects life-threatening lab values
//      (per ACEP / Tietz critical-value standards) and emits a top-level
//      `emergency_alerts` array that the UI surfaces as an URGENT banner
//      separate from the normal flow.
//
//   2. SUICIDE-RISK SCREEN — scans symptom strings + free-text fields
//      for explicit ideation patterns. When matched, surfaces the 988
//      Suicide & Crisis Lifeline + Crisis Text Line (741741) as a
//      blocking alert.
//
//   3. ALLERGY-AWARE SUPPLEMENT FILTER — strips contraindicated supps
//      from the stack (fish oil if shellfish allergy, etc.). The UI's
//      onboarding allergies field feeds this filter.

import { CRITICAL_VALUE_THRESHOLDS, SUICIDE_RISK_PATTERNS, CRISIS_RESOURCES_TEXT } from './canonical.ts';

export interface EmergencyAlert {
  marker: string;
  value: number;
  unit: string;
  threshold: 'critical_low' | 'critical_high';
  message: string;
  severity: 'emergency'; // distinct from 'urgent' / 'high' tiers
}

export interface CrisisAlert {
  type: 'suicide_risk';
  message: string;        // 988 + Crisis Text Line copy
  matchedPhrase?: string; // What we detected (for clinician review)
}

interface LabRow {
  marker_name?: string | null;
  value?: number | string | null;
  unit?: string | null;
}

function num(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Scan labs for true emergency values. Returns one alert per matched
 * threshold. These values warrant same-day medical attention regardless
 * of patient context — universal across every patient.
 */
export function detectEmergencyAlerts(labs: LabRow[]): EmergencyAlert[] {
  const out: EmergencyAlert[] = [];
  if (!Array.isArray(labs)) return out;

  for (const row of labs) {
    const name = String(row.marker_name ?? '');
    const val = num(row.value);
    if (val === null) continue;

    for (const t of CRITICAL_VALUE_THRESHOLDS) {
      if (!t.marker.test(name)) continue;
      const lowHit = t.low !== undefined && val <= t.low;
      const highHit = t.high !== undefined && val >= t.high;
      if (!lowHit && !highHit) continue;
      out.push({
        marker: name,
        value: val,
        unit: String(row.unit ?? t.unit),
        threshold: lowHit ? 'critical_low' : 'critical_high',
        message: t.message,
        severity: 'emergency',
      });
      // Don't double-count if both thresholds matched (impossible but safe)
      break;
    }
  }
  return out;
}

/**
 * Scan symptom + free-text fields for suicide-ideation patterns.
 * Matches phrases that warrant immediate crisis resource surfacing.
 *
 * @param symptomsText  concatenated symptom names + descriptions
 * @param freeTextFields  any other fields that might contain user-entered
 *   text (e.g., "specific concern", "tried before", "life context")
 */
export function detectSuicideRisk(
  symptomsText: string,
  freeTextFields: string[] = [],
): CrisisAlert | null {
  const haystack = [symptomsText, ...freeTextFields].join(' | ').toLowerCase();
  for (const pat of SUICIDE_RISK_PATTERNS) {
    const match = haystack.match(pat);
    if (match) {
      return {
        type: 'suicide_risk',
        message: CRISIS_RESOURCES_TEXT,
        matchedPhrase: match[0],
      };
    }
  }
  return null;
}

/**
 * Strip supplements that are contraindicated by patient allergies/conditions.
 * Universal — applies to every patient with the trigger.
 *
 * Rules:
 *   - Shellfish allergy → no fish oil (suggest algal omega-3)
 *   - Pregnancy → drop high-dose Vitamin A retinol forms, kava, comfrey,
 *     pennyroyal, blue cohosh
 *   - Anticoagulant → drop high-dose Vitamin E, fish oil, ginkgo, garlic
 *     (or note interaction warning)
 *
 * @param stack  the supplement_stack array (mutated in place)
 * @param allergiesLower  patient's allergies field, lowercased
 * @param isPregnant  pregnancy status flag
 * @param onAnticoagulant  anticoagulant medication flag
 * @returns array of removed supplement names with reason for log/audit
 */
export function applyAllergyFilters(
  stack: any[],
  allergiesLower: string,
  isPregnant: boolean,
  onAnticoagulant: boolean,
): Array<{ supplement: string; reason: string }> {
  if (!Array.isArray(stack)) return [];
  const removed: Array<{ supplement: string; reason: string }> = [];
  const hasShellfish = /\b(shellfish|shrimp|lobster|crab|prawn|oyster|clam|mussel)/i.test(allergiesLower);
  const hasFish = /\b(fish|salmon|tuna|mackerel)\b/i.test(allergiesLower);

  const isFishOil = (n: string) => /\b(omega[\s-]?3|fish\s*oil|epa|dha)\b/i.test(n) && !/algal|algae|vegan/i.test(n);
  const isAlgal = (n: string) => /\b(algal|algae|vegan)\b/i.test(n);

  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    const name = String(s?.nutrient ?? s?.name ?? '');
    if (!name) continue;

    // Fish allergy or shellfish allergy → drop fish oil (recommend algal alt)
    if ((hasShellfish || hasFish) && isFishOil(name) && !isAlgal(name)) {
      stack.splice(i, 1);
      removed.push({ supplement: name, reason: 'shellfish/fish allergy — use algal omega-3 instead' });
      continue;
    }

    // Pregnancy: drop unsafe supplements
    if (isPregnant) {
      if (/\b(high[\s-]?dose\s+vitamin\s*a|retinol\s+\d+,?\d*\s*IU)/i.test(name)) {
        stack.splice(i, 1);
        removed.push({ supplement: name, reason: 'pregnancy — high-dose vitamin A teratogenic' });
        continue;
      }
      if (/\b(kava|comfrey|pennyroyal|blue\s*cohosh|black\s*cohosh|dong\s*quai)\b/i.test(name)) {
        stack.splice(i, 1);
        removed.push({ supplement: name, reason: 'pregnancy — herbal contraindicated' });
        continue;
      }
    }

    // Anticoagulant: flag bleeding-risk supplements (note, don't auto-drop —
    // omega-3 IS often co-prescribed; we add a warning note instead)
    if (onAnticoagulant && /\b(high[\s-]?dose\s+vitamin\s*e|ginkgo|high[\s-]?dose\s+garlic)/i.test(name)) {
      // Annotate, don't remove — clinician decision
      if (s && typeof s === 'object') {
        const existingNote = String(s.practical_note ?? '');
        if (!/anticoagulant/i.test(existingNote)) {
          s.practical_note = `${existingNote} ⚠ INTERACTION: increases bleeding risk on anticoagulant — discuss with prescribing doctor before starting.`.trim();
        }
      }
    }
  }

  return removed;
}
