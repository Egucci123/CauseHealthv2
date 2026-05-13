// supabase/functions/_shared/criticalFindingsBackstop.ts
//
// Deterministic floor for critical findings. Pairs with the AI
// `critical_findings_ai` domain so anything the model misses is still
// surfaced from clinical thresholds.
//
// Universal rule: if a marker crosses a threshold widely accepted as
// medically urgent (per ACC/AHA, ADA, KDIGO, USPSTF, NCCN), a critical
// finding is emitted regardless of patient history.
//
// Output shape mirrors what the AI produces so downstream code can treat
// AI + deterministic the same way.

export interface CriticalFinding {
  marker: string;
  value: number | null;
  unit?: string;
  threshold: string;
  severity: 'urgent' | 'high';
  rationale: string;
  source: 'deterministic';
}

interface LabRow {
  marker_name?: string | null;
  value?: number | string | null;
  unit?: string | null;
  optimal_flag?: string | null;
}

function num(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function find(labs: LabRow[], patterns: RegExp[]): { value: number; unit: string } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const n = num(v.value);
      if (n !== null) return { value: n, unit: String(v.unit ?? '') };
    }
  }
  return null;
}

interface Rule {
  marker: string;
  patterns: RegExp[];
  test: (value: number, unit: string) => { severity: 'urgent' | 'high'; threshold: string; rationale: string } | null;
}

const RULES: Rule[] = [
  {
    marker: 'Glucose (fasting)',
    patterns: [/^glucose/i, /fasting glucose/i],
    test: (v) => v >= 250 ? { severity: 'urgent', threshold: '≥250 mg/dL', rationale: 'Severe hyperglycemia — clinical evaluation indicated.' }
                 : v >= 126 ? { severity: 'high', threshold: '≥126 mg/dL', rationale: 'ADA diabetic-range fasting glucose on a single draw.' }
                 : v <= 54 ? { severity: 'urgent', threshold: '≤54 mg/dL', rationale: 'Level-2 hypoglycemia per ADA — urgent.' }
                 : null,
  },
  {
    marker: 'Hemoglobin A1c',
    patterns: [/a1c/i, /hba1c/i, /glycohemoglobin/i],
    test: (v) => v >= 10 ? { severity: 'urgent', threshold: '≥10%', rationale: 'Markedly uncontrolled diabetes — escalate care.' }
                 : v >= 6.5 ? { severity: 'high', threshold: '≥6.5%', rationale: 'ADA diabetic-range A1c.' }
                 : null,
  },
  {
    marker: 'Potassium',
    patterns: [/^potassium/i],
    test: (v) => v >= 6.0 ? { severity: 'urgent', threshold: '≥6.0 mmol/L', rationale: 'Hyperkalemia — arrhythmia risk.' }
                 : v <= 3.0 ? { severity: 'urgent', threshold: '≤3.0 mmol/L', rationale: 'Hypokalemia — arrhythmia risk.' }
                 : null,
  },
  {
    marker: 'Sodium',
    patterns: [/^sodium/i],
    test: (v) => v <= 125 ? { severity: 'urgent', threshold: '≤125 mmol/L', rationale: 'Severe hyponatremia.' }
                 : v >= 155 ? { severity: 'urgent', threshold: '≥155 mmol/L', rationale: 'Severe hypernatremia.' }
                 : null,
  },
  {
    marker: 'Calcium',
    patterns: [/^calcium/i, /total calcium/i],
    test: (v) => v >= 12 ? { severity: 'urgent', threshold: '≥12 mg/dL', rationale: 'Hypercalcemia — workup for malignancy/PTH.' }
                 : v <= 7.5 ? { severity: 'urgent', threshold: '≤7.5 mg/dL', rationale: 'Severe hypocalcemia — tetany risk.' }
                 : null,
  },
  {
    marker: 'Creatinine',
    patterns: [/^creatinine/i],
    test: (v) => v >= 2.0 ? { severity: 'high', threshold: '≥2.0 mg/dL', rationale: 'Likely significant renal impairment — calculate eGFR + nephrology.' } : null,
  },
  {
    marker: 'eGFR',
    patterns: [/egfr/i, /gfr$/i],
    test: (v) => v < 30 ? { severity: 'urgent', threshold: '<30 mL/min/1.73m²', rationale: 'KDIGO stage G4–G5 CKD.' }
                 : v < 60 ? { severity: 'high', threshold: '<60 mL/min/1.73m²', rationale: 'KDIGO stage G3 CKD — confirm + workup.' }
                 : null,
  },
  {
    marker: 'ALT',
    patterns: [/^alt\b/i, /alanine/i, /sgpt/i],
    test: (v) => v >= 200 ? { severity: 'urgent', threshold: '≥200 U/L', rationale: 'Acute hepatocellular injury — workup viral/drug.' }
                 : v >= 60 ? { severity: 'high', threshold: '≥60 U/L', rationale: 'Persistent ALT elevation — investigate MASLD / drug toxicity.' }
                 : null,
  },
  {
    marker: 'AST',
    patterns: [/^ast\b/i, /aspartate/i, /sgot/i],
    test: (v) => v >= 200 ? { severity: 'urgent', threshold: '≥200 U/L', rationale: 'Acute hepatocellular injury.' } : null,
  },
  {
    marker: 'Hemoglobin',
    patterns: [/^hemoglobin/i, /^hgb/i],
    test: (v) => v <= 8 ? { severity: 'urgent', threshold: '≤8 g/dL', rationale: 'Severe anemia.' }
                 : v >= 18 ? { severity: 'high', threshold: '≥18 g/dL', rationale: 'Polycythemia — workup OSA / JAK2 / EPO.' }
                 : null,
  },
  {
    marker: 'Platelets',
    patterns: [/platelet/i],
    test: (v) => v <= 50 ? { severity: 'urgent', threshold: '≤50 K/µL', rationale: 'Severe thrombocytopenia — bleeding risk.' }
                 : v >= 600 ? { severity: 'high', threshold: '≥600 K/µL', rationale: 'Thrombocytosis — workup reactive vs essential.' }
                 : null,
  },
  {
    marker: 'TSH',
    patterns: [/^tsh\b/i],
    test: (v) => v >= 10 ? { severity: 'high', threshold: '≥10 mIU/L', rationale: 'Overt hypothyroidism — treatment indicated.' }
                 : v <= 0.1 ? { severity: 'high', threshold: '≤0.1 mIU/L', rationale: 'Suppressed TSH — workup hyperthyroid / over-replacement.' }
                 : null,
  },
  {
    marker: 'LDL-C',
    patterns: [/(?<!v)ldl[-\s]?c\b/i, /(?<!v)ldl cholesterol/i, /^ldl$/i],
    test: (v) => v >= 190 ? { severity: 'high', threshold: '≥190 mg/dL', rationale: 'Severe hypercholesterolemia — consider FH workup.' } : null,
  },
  {
    marker: 'Triglycerides',
    patterns: [/triglyceride/i],
    test: (v) => v >= 500 ? { severity: 'urgent', threshold: '≥500 mg/dL', rationale: 'Pancreatitis risk.' }
                 : v >= 200 ? { severity: 'high', threshold: '≥200 mg/dL', rationale: 'Hypertriglyceridemia — cardiometabolic risk.' }
                 : null,
  },
  {
    marker: 'hs-CRP',
    patterns: [/hs[-\s]?crp/i, /high.sensitivity.crp/i],
    test: (v) => v >= 10 ? { severity: 'high', threshold: '≥10 mg/L', rationale: 'Marked systemic inflammation — investigate source.' } : null,
  },
  {
    marker: 'Ferritin',
    patterns: [/ferritin/i],
    test: (v) => v <= 15 ? { severity: 'high', threshold: '≤15 ng/mL', rationale: 'Iron-deficiency anemia threshold.' }
                 : v >= 1000 ? { severity: 'high', threshold: '≥1000 ng/mL', rationale: 'Iron overload / hemochromatosis workup.' }
                 : null,
  },
  {
    marker: 'Vitamin D, 25-OH',
    patterns: [/vitamin d/i, /25.?oh.?d/i, /25.?hydroxy/i],
    test: (v) => v < 20 ? { severity: 'high', threshold: '<20 ng/mL', rationale: 'Vitamin D deficiency.' } : null,
  },
  {
    marker: 'Vitamin B12',
    patterns: [/b[-\s]?12/i, /cobalamin/i],
    test: (v) => v < 200 ? { severity: 'high', threshold: '<200 pg/mL', rationale: 'B12 deficiency — neurologic risk.' } : null,
  },
];

export function detectCriticalFindings(labs: LabRow[]): CriticalFinding[] {
  if (!Array.isArray(labs) || labs.length === 0) return [];
  const out: CriticalFinding[] = [];
  for (const rule of RULES) {
    const hit = find(labs, rule.patterns);
    if (!hit) continue;
    const r = rule.test(hit.value, hit.unit);
    if (!r) continue;
    out.push({
      marker: rule.marker,
      value: hit.value,
      unit: hit.unit || undefined,
      threshold: r.threshold,
      severity: r.severity,
      rationale: r.rationale,
      source: 'deterministic',
    });
  }
  return out;
}
