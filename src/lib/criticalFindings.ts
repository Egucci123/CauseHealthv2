// src/lib/criticalFindings.ts
// Deterministic detection of clinically critical lab values ("panic values").
// Runs entirely in code — never touches the AI — so it never drifts and
// never misses a true emergency.
//
// User-facing message: short, urgency-only, no diagnosis named.
// Doctor-facing concern: differential + recommended tests with ICD-10.
//
// Thresholds based on standard clinical panic-value criteria (Tietz / Mayo /
// Cleveland Clinic). Conservative — we'd rather flag and have a doctor
// reassure than miss something.

export type CriticalSeverity = 'critical' | 'emergency';

export interface CriticalFinding {
  marker: string;
  value: number;
  unit?: string | null;
  severity: CriticalSeverity;
  /** Plain-English message shown to the user. NEVER names a disease. */
  userMessage: string;
  /** Doctor-facing differential + recommended tests. Pro feature only. */
  doctorConcern: string;
  /** Suggested ICD-10 codes for the doctor */
  icd10?: string[];
}

interface LabValue {
  marker_name?: string;
  markerName?: string;
  value: number;
  unit?: string | null;
}

const name = (v: LabValue) => (v.marker_name ?? v.markerName ?? '').toLowerCase();
const find = (vals: LabValue[], patterns: string[]): LabValue | null => {
  for (const v of vals) {
    const n = name(v);
    if (patterns.some(p => n.includes(p))) return v;
  }
  return null;
};

interface Context {
  age?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
}

export function detectCriticalFindings(
  values: LabValue[],
  context: Context = {},
): CriticalFinding[] {
  const out: CriticalFinding[] = [];
  const age = context.age ?? null;

  // ── EMERGENCY (same-day care) ─────────────────────────────────────────────
  const glucose = find(values, ['fasting glucose', 'glucose']);
  if (glucose) {
    if (glucose.value > 400) {
      out.push({
        marker: glucose.marker_name ?? glucose.markerName ?? 'Glucose', value: glucose.value, unit: glucose.unit, severity: 'emergency',
        userMessage: 'Your blood sugar is dangerously high. If you have nausea, fruity breath, fast breathing, or confusion, go to urgent care or call 911 today.',
        doctorConcern: 'Severe hyperglycemia. Rule out DKA / HHS. Order ABG, ketones, anion gap, repeat glucose, A1c.',
        icd10: ['E11.65', 'E11.00'],
      });
    } else if (glucose.value < 50) {
      out.push({
        marker: glucose.marker_name ?? glucose.markerName ?? 'Glucose', value: glucose.value, unit: glucose.unit, severity: 'emergency',
        userMessage: 'Your blood sugar is dangerously low. If you feel shaky, sweaty, confused, or weak, eat fast-acting sugar now and seek urgent care.',
        doctorConcern: 'Severe hypoglycemia. Rule out insulin overdose, sulfonylurea, insulinoma, adrenal insufficiency, sepsis.',
        icd10: ['E16.2'],
      });
    }
  }

  const k = find(values, ['potassium']);
  if (k) {
    if (k.value > 6) {
      out.push({
        marker: k.marker_name ?? k.markerName ?? 'Potassium', value: k.value, unit: k.unit, severity: 'emergency',
        userMessage: 'Your potassium is dangerously high. Risk of dangerous heart rhythms — go to urgent care or ER today, especially if you feel weak or have palpitations.',
        doctorConcern: 'Hyperkalemia >6 mEq/L. Order EKG, repeat K+, BMP. Rule out hemolysis (recheck), AKI, ACE/ARB, spironolactone, K-sparing diuretics, adrenal insufficiency.',
        icd10: ['E87.5'],
      });
    } else if (k.value < 2.5) {
      out.push({
        marker: k.marker_name ?? k.markerName ?? 'Potassium', value: k.value, unit: k.unit, severity: 'emergency',
        userMessage: 'Your potassium is dangerously low. Risk of heart-rhythm problems — go to urgent care or ER today.',
        doctorConcern: 'Severe hypokalemia <2.5 mEq/L. Order EKG, magnesium, repeat K+. Rule out diuretic overuse, GI losses, refeeding, mineralocorticoid excess.',
        icd10: ['E87.6'],
      });
    }
  }

  const na = find(values, ['sodium']);
  if (na && (na.value < 120 || na.value > 155)) {
    out.push({
      marker: na.marker_name ?? na.markerName ?? 'Sodium', value: na.value, unit: na.unit, severity: 'emergency',
      userMessage: 'Your sodium is dangerously out of range. Risk of seizures or other serious problems — go to urgent care or ER today.',
      doctorConcern: na.value < 120
        ? 'Severe hyponatremia <120 mEq/L. Assess volume status. Rule out SIADH, heart failure, cirrhosis, adrenal insufficiency, hypothyroidism, primary polydipsia.'
        : 'Severe hypernatremia >155 mEq/L. Assess hydration. Rule out diabetes insipidus, dehydration, hypothalamic lesions.',
      icd10: na.value < 120 ? ['E87.1'] : ['E87.0'],
    });
  }

  const hgb = find(values, ['hemoglobin', 'hgb']);
  if (hgb && hgb.value < 7) {
    out.push({
      marker: hgb.marker_name ?? hgb.markerName ?? 'Hemoglobin', value: hgb.value, unit: hgb.unit, severity: 'emergency',
      userMessage: 'Your hemoglobin is dangerously low — this is severe anemia. Go to urgent care or ER today, especially if you feel short of breath, dizzy, or have chest pain.',
      doctorConcern: 'Severe anemia (Hgb <7). Type & screen, retic count, iron studies, B12/folate, LDH, haptoglobin, peripheral smear. Consider GI source / hemolysis / marrow failure / occult malignancy.',
      icd10: ['D64.9'],
    });
  }

  const platelets = find(values, ['platelet']);
  if (platelets) {
    if (platelets.value < 30) {
      out.push({
        marker: platelets.marker_name ?? platelets.markerName ?? 'Platelets', value: platelets.value, unit: platelets.unit, severity: 'emergency',
        userMessage: 'Your platelets are dangerously low — risk of serious bleeding. Avoid injury and go to urgent care or ER today.',
        doctorConcern: 'Severe thrombocytopenia <30. Peripheral smear, repeat CBC, ITP workup, HIV/Hep C, B12/folate, marrow eval if persistent. Hold antiplatelet/anticoagulant therapy.',
        icd10: ['D69.6'],
      });
    } else if (platelets.value > 1000) {
      out.push({
        marker: platelets.marker_name ?? platelets.markerName ?? 'Platelets', value: platelets.value, unit: platelets.unit, severity: 'emergency',
        userMessage: 'Your platelets are extremely high — risk of clotting or bleeding. See a doctor today.',
        doctorConcern: 'Extreme thrombocytosis >1000K. Order JAK2 V617F, CALR, MPL, peripheral smear, ferritin, CRP, hematology referral. Rule out essential thrombocythemia, secondary causes (infection, iron deficiency, splenectomy).',
        icd10: ['D75.838', 'D47.3'],
      });
    }
  }

  const altE = find(values, ['alt', 'sgpt']);
  if (altE && altE.value > 1000) {
    out.push({
      marker: altE.marker_name ?? altE.markerName ?? 'ALT', value: altE.value, unit: altE.unit, severity: 'emergency',
      userMessage: 'Your liver enzymes are extremely high — possible severe liver injury. Go to urgent care or ER today.',
      doctorConcern: 'Severe hepatocellular injury (ALT >1000). Order INR, albumin, bilirubin, hepatitis viral panel, acetaminophen level, autoimmune panel (ANA, ASMA, anti-LKM), ceruloplasmin if <40yo. Hepatology consult.',
      icd10: ['R74.0', 'K71.6'],
    });
  }

  // ── CRITICAL (urgent, doctor within 1 week) ───────────────────────────────
  const calcium = find(values, ['calcium']);
  if (calcium && calcium.value > 11.5) {
    out.push({
      marker: calcium.marker_name ?? calcium.markerName ?? 'Calcium', value: calcium.value, unit: calcium.unit, severity: 'critical',
      userMessage: 'Your calcium is significantly high — this needs urgent medical attention. See your doctor this week and bring your Clinical Prep.',
      doctorConcern: 'Hypercalcemia >11.5. Order ionized calcium, PTH, PTHrP, vitamin D 25-OH and 1,25, SPEP/UPEP/free light chains, urine calcium, TSH. Rule out primary hyperparathyroidism, malignancy (PTHrP-mediated), MGUS/myeloma, sarcoidosis, vitamin D toxicity, milk-alkali.',
      icd10: ['E83.52'],
    });
  }

  if (hgb && hgb.value >= 7 && hgb.value < 9 && context.sex !== 'female') {
    out.push({
      marker: hgb.marker_name ?? hgb.markerName ?? 'Hemoglobin', value: hgb.value, unit: hgb.unit, severity: 'critical',
      userMessage: 'Your hemoglobin is meaningfully low. See your doctor this week to find out why.',
      doctorConcern: 'Anemia (Hgb 7-9). Iron studies, B12/folate, retic count, peripheral smear, occult-blood testing, age-appropriate cancer screening (colonoscopy if ≥45 / no recent screening).',
      icd10: ['D64.9'],
    });
  }

  const wbc = find(values, ['wbc', 'white blood cell']);
  if (wbc) {
    if (wbc.value > 25) {
      out.push({
        marker: wbc.marker_name ?? wbc.markerName ?? 'WBC', value: wbc.value, unit: wbc.unit, severity: 'critical',
        userMessage: 'Your white blood cell count is significantly high. See your doctor this week.',
        doctorConcern: 'Marked leukocytosis >25K. Manual differential, peripheral smear, flow cytometry if abnormal, blood/urine cultures, LDH, uric acid, CRP. Rule out infection, leukemia (CML, AML, CLL), reactive process.',
        icd10: ['D72.829'],
      });
    } else if (wbc.value < 1.5) {
      out.push({
        marker: wbc.marker_name ?? wbc.markerName ?? 'WBC', value: wbc.value, unit: wbc.unit, severity: 'critical',
        userMessage: 'Your white blood cell count is significantly low — your immune system is weakened. See your doctor this week and avoid sick contacts.',
        doctorConcern: 'Leukopenia <1.5K. Manual differential, neutrophil count, drug review (chemo, antithyroids, antibiotics), B12/folate, HIV, hepatitis, ANA, peripheral smear, hematology referral if persistent.',
        icd10: ['D70.9'],
      });
    }
  }

  const globulin = find(values, ['globulin']);
  if (globulin && globulin.value > 5) {
    out.push({
      marker: globulin.marker_name ?? globulin.markerName ?? 'Globulin', value: globulin.value, unit: globulin.unit, severity: 'critical',
      userMessage: 'A protein in your blood is significantly elevated. See your doctor this week.',
      doctorConcern: 'Marked hyperglobulinemia >5. Order SPEP, UPEP, serum free light chains, IgG/IgA/IgM, calcium, kidney function, skeletal survey if monoclonal. Rule out multiple myeloma, MGUS, Waldenström, chronic infection, autoimmune.',
      icd10: ['D89.2'],
    });
  } else if (globulin && globulin.value > 3.5 && (age ?? 99) < 40) {
    out.push({
      marker: globulin.marker_name ?? globulin.markerName ?? 'Globulin', value: globulin.value, unit: globulin.unit, severity: 'critical',
      userMessage: 'A protein in your blood is elevated for your age. See your doctor this week to investigate.',
      doctorConcern: 'Hyperglobulinemia >3.5 in adult under 40. Order SPEP, UPEP, serum free light chains, IgG/IgA/IgM. Rule out MGUS, chronic infection.',
      icd10: ['D89.2'],
    });
  }

  const ferritin = find(values, ['ferritin']);
  const tsat = find(values, ['transferrin saturation', 'iron saturation', 'iron sat']);
  if (ferritin && ferritin.value > 1000 && tsat && tsat.value > 50) {
    out.push({
      marker: ferritin.marker_name ?? ferritin.markerName ?? 'Ferritin', value: ferritin.value, unit: ferritin.unit, severity: 'critical',
      userMessage: 'Your iron storage is significantly elevated. See your doctor this week.',
      doctorConcern: 'Ferritin >1000 + TSat >50%. Order HFE gene testing (C282Y, H63D), liver enzymes, MRI iron quantification. Rule out hereditary hemochromatosis, secondary iron overload, hepatic inflammation.',
      icd10: ['E83.119'],
    });
  }

  const bilirubinTotal = find(values, ['bilirubin, total', 'bilirubin total', 'total bilirubin']);
  if (bilirubinTotal && bilirubinTotal.value > 5) {
    const altMild = find(values, ['alt', 'sgpt']);
    const astMild = find(values, ['ast', 'sgot']);
    const liverEnzymesNormal =
      (!altMild || altMild.value < 100) && (!astMild || astMild.value < 100);
    if (liverEnzymesNormal) {
      out.push({
        marker: bilirubinTotal.marker_name ?? bilirubinTotal.markerName ?? 'Bilirubin', value: bilirubinTotal.value, unit: bilirubinTotal.unit, severity: 'critical',
        userMessage: 'Your bilirubin is significantly elevated. See your doctor this week — possible problem with bile flow.',
        doctorConcern: 'Bilirubin >5 with normal liver enzymes — concerning for biliary obstruction. Order fractionated bilirubin (direct vs indirect), abdominal ultrasound or MRCP, CA 19-9, GGT, alkaline phosphatase. Rule out choledocholithiasis, malignancy (pancreatic head, cholangiocarcinoma).',
        icd10: ['R17', 'K83.1'],
      });
    }
  }

  const ldh = find(values, ['ldh', 'lactate dehydrogenase']);
  if (ldh && ldh.value > 500) {
    out.push({
      marker: ldh.marker_name ?? ldh.markerName ?? 'LDH', value: ldh.value, unit: ldh.unit, severity: 'critical',
      userMessage: 'A general inflammation/cell-turnover marker is significantly elevated. See your doctor this week.',
      doctorConcern: 'LDH >500 (>2× ULN). Nonspecific but concerning. Order haptoglobin, retic count, peripheral smear, uric acid, comprehensive metabolic panel, age-appropriate imaging. Rule out hemolysis, lymphoma, leukemia, tissue ischemia, malignancy.',
      icd10: ['R74.0'],
    });
  }

  const uricAcid = find(values, ['uric acid']);
  if (uricAcid && uricAcid.value > 12) {
    out.push({
      marker: uricAcid.marker_name ?? uricAcid.markerName ?? 'Uric Acid', value: uricAcid.value, unit: uricAcid.unit, severity: 'critical',
      userMessage: 'Your uric acid is very elevated. See your doctor this week.',
      doctorConcern: 'Severe hyperuricemia >12. Rule out tumor lysis syndrome (CBC, peripheral smear, LDH, phosphate, K+), kidney dysfunction, severe gout. Consider hematology referral.',
      icd10: ['E79.0'],
    });
  }

  const creatinine = find(values, ['creatinine']);
  if (creatinine && creatinine.value > 3) {
    out.push({
      marker: creatinine.marker_name ?? creatinine.markerName ?? 'Creatinine', value: creatinine.value, unit: creatinine.unit, severity: 'critical',
      userMessage: 'Your kidney function marker is significantly off. See your doctor this week.',
      doctorConcern: 'Creatinine >3. eGFR, BUN, urinalysis, urine protein/creatinine ratio, renal ultrasound. Rule out AKI vs CKD, obstruction, glomerular disease. Hold nephrotoxic drugs (NSAIDs, ACE/ARB if AKI).',
      icd10: ['N17.9'],
    });
  }

  return out;
}

/** Returns the highest severity present, or null. */
export function topSeverity(findings: CriticalFinding[]): CriticalSeverity | null {
  if (findings.some(f => f.severity === 'emergency')) return 'emergency';
  if (findings.length > 0) return 'critical';
  return null;
}
