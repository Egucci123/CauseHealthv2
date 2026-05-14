// supabase/functions/_shared/markerSystems.ts
//
// MARKER → BODY-SYSTEM TAXONOMY
// =============================
// One small lookup table tags every common lab marker with the body
// system it reflects. The system-drift detector reads this once and
// fires a generic "Early {system} drift" card whenever ≥ 2 markers
// from the same system land in the same borderline / out-of-range
// direction.
//
// Universal: no hand-written pattern rules per condition. New marker?
// Add one row. New system? Add one entry. The detection routine itself
// never changes.
//
// Each system also defines a generic "what to ask your doctor" stub
// and a recommended confirmatory-test list. These are intentionally
// broad — the goal is to surface the early signal and route the user
// to the right follow-up workup, not to diagnose the specific
// underlying condition (the AI prose layer + named-pattern rules
// elsewhere handle specific diagnoses when the data warrants).

export interface MarkerSystem {
  /** Stable id, e.g., 'liver', 'kidney', 'glucose_metabolism'. */
  system: string;
  /** Human-readable label, e.g., 'Liver function', 'Kidney function'. */
  label: string;
  /** Marker-name regex patterns belonging to this system. Anchored ^
   *  to avoid compound-marker collisions (same hardening as canonical.ts). */
  markers: RegExp[];
  /** ICD-10 code best fitting an "abnormal {system} workup" — used on
   *  the generated card. Generic codes only; specific diagnoses come
   *  from the named-pattern rules. */
  icd10: string;
  /** Confirmatory-test list shown on the card. Universal across all
   *  users — the same workup any doctor would order to investigate
   *  drift in this system. */
  confirmatoryTests: string[];
  /** Patient-facing question for the doctor. Generic enough that it
   *  works whether the drift is high-side or low-side. */
  questionForDoctor: string;
  /** Plain-English explanation of why drift in this system matters. */
  systemRationale: string;
  /** Optional sex-gate. When set, the system-drift detector will SKIP
   *  this system unless the patient's biological sex matches.
   *
   *  Rationale: the male and female hormonal axes share many markers
   *  (LH, FSH, Prolactin, Estradiol, Total/Free Testosterone, SHBG).
   *  Without a sex gate, both systems can fire on the same patient,
   *  producing a "Male hormonal axis — critical" card on a female user
   *  (Marisa audit, 2026-05-11). Universal-safe behavior: tag the male
   *  pattern as sex='male', the female pattern as sex='female', leave
   *  everything else (liver, kidney, thyroid, etc.) un-gated.
   *
   *  Unknown / 'other' / 'prefer not to say' / null sex → both gated
   *  systems are skipped (no inference). The user still gets per-marker
   *  outlier cards; they just don't get a male/female "axis" pattern
   *  card auto-fired without confirmed sex. */
  sexGate?: 'male' | 'female';
  /** Which direction of drift is clinically concerning for this system.
   *  - 'high': only fire on drift HIGH (liver enzymes, lipid, inflammation —
   *    drift LOW is usually not pathological)
   *  - 'low': only fire on drift LOW (iron stores, testosterone, hormones)
   *  - 'both' (default): either direction matters
   *  Daniel real-user audit 2026-05-14: lean 29yo M had AlkPhos 49 (bottom
   *  15% of range 36-130) + AST 11 (bottom 3% of range 10-40). System drift
   *  fired "Liver function — multiple markers pressed LOW" — but low liver
   *  enzymes aren't pathological. */
  concerningDirection?: 'high' | 'low' | 'both';
}

export const MARKER_SYSTEMS: MarkerSystem[] = [
  {
    system: 'liver',
    label: 'Liver function',
    concerningDirection: 'high',
    markers: [
      /^alt$|^sgpt$|^alanine\s+aminotransferase\b/i,
      /^ast$|^sgot$|^aspartate\s+aminotransferase\b/i,
      /^ggt$|^gamma[\s-]?glutamyl/i,
      /^alkaline\s+phosphatase$|^alp$/i,
      /^bilirubin(?:,\s*total)?$/i,
    ],
    icd10: 'R74.0',
    confirmatoryTests: [
      'Liver Ultrasound',
      'GGT (if not done)',
      'Fasting Insulin + HOMA-IR',
      'AST/ALT ratio',
      'FibroScan if available',
    ],
    questionForDoctor:
      "Multiple liver enzymes are pressing the edge of normal range — can we get a liver ultrasound and run a HOMA-IR to rule out fatty liver before it progresses?",
    systemRationale:
      'Liver enzymes drift early when the liver is under metabolic stress (fatty liver, alcohol, medication metabolism). Catching it before enzymes go above range gives the most reversible window.',
  },
  {
    system: 'kidney',
    concerningDirection: 'high',
    label: 'Kidney function',
    markers: [
      /^creatinine(?:,?\s*serum)?$/i,
      /^bun$|^blood\s+urea\s+nitrogen$/i,
      /^egfr/i,
      /^cystatin\s+c$/i,
      /^uacr$|^urine\s+albumin/i,
    ],
    icd10: 'N28.9',
    confirmatoryTests: [
      'Cystatin C-based eGFR',
      'Urine Albumin/Creatinine Ratio (UACR)',
      'Repeat creatinine in 4-6 weeks (well-hydrated)',
    ],
    questionForDoctor:
      "My kidney markers are pressing one end of normal — can we get a UACR and Cystatin C to confirm kidney function before drift becomes a trend?",
    systemRationale:
      'Kidney filtration drops slowly and silently. Drift in creatinine, BUN, or eGFR — even within "normal" — is the earliest signal. UACR catches damage before creatinine moves at all.',
  },
  {
    system: 'glucose_metabolism',
    concerningDirection: 'high',
    label: 'Blood-sugar regulation',
    markers: [
      /^(?:fasting\s+)?glucose(?:,?\s*(?:serum|plasma|fasting|random))?$/i,
      /^(?:hemoglobin\s+a1c|hba1c|a1c)$/i,
      /^fasting\s+insulin$/i,
      /^homa[\s-]?ir$/i,
    ],
    icd10: 'R73.09',
    confirmatoryTests: [
      'Fasting Insulin + HOMA-IR',
      'Hemoglobin A1c (if not done)',
      'Oral Glucose Tolerance Test (if symptomatic)',
      '2-hour postprandial glucose',
    ],
    questionForDoctor:
      "My glucose / A1c / insulin markers are drifting toward the high end — can we run fasting insulin and HOMA-IR to see if early insulin resistance is what's brewing?",
    systemRationale:
      'Insulin resistance starts long before A1c crosses prediabetic threshold. Fasting glucose creeping up + insulin compensating is the earliest reversible signal — diet + sleep + movement can fully reverse it at this stage.',
  },
  {
    system: 'lipid',
    concerningDirection: 'high',
    label: 'Cholesterol & triglycerides',
    markers: [
      /^ldl(?:[\s-]*cholesterol)?$/i,
      /^hdl(?:[\s-]*cholesterol)?$/i,
      /^triglycerides?$/i,
      /^total\s+cholesterol$|^cholesterol,\s*total$/i,
      /^vldl(?:[\s-]*cholesterol)?$/i,
      /^non[\s-]*hdl$/i,
      /^apob$|^apolipoprotein\s*b$/i,
      /^lp\(a\)|^lipoprotein\s*a$/i,
    ],
    icd10: 'E78.5',
    confirmatoryTests: [
      'ApoB',
      'Lp(a) — once-in-lifetime',
      'LDL particle size (NMR)',
      'hs-CRP',
      'Coronary Artery Calcium (CAC) score',
    ],
    questionForDoctor:
      "My lipid markers are drifting — can we run ApoB and Lp(a) to see what my actual atherogenic-particle risk is, instead of relying on LDL alone?",
    systemRationale:
      'Standard lipid numbers (LDL, HDL, TG) miss particle-level risk. ApoB counts the actual plaque-forming particles; Lp(a) is a once-in-lifetime genetic risk amplifier. Drift in standard lipids is the trigger to look at the better numbers.',
  },
  {
    system: 'thyroid',
    label: 'Thyroid function',
    markers: [
      /^tsh$/i,
      /^free\s+t4$|^t4,?\s*free$/i,
      /^free\s+t3$|^t3,?\s*free$/i,
      /^reverse\s+t3$|^rt3$/i,
      /^thyroglobulin\s+antibod/i,
      /^tpo\s*antibod|^thyroid\s+peroxidase/i,
    ],
    icd10: 'E03.9',
    confirmatoryTests: [
      'Thyroid Panel (TSH + Free T4 + Free T3)',
      'TPO Antibodies',
      'Thyroglobulin Antibodies (Tg-Ab)',
      'Reverse T3',
    ],
    questionForDoctor:
      "My thyroid markers are drifting — can we run a full thyroid panel (TSH + Free T4 + Free T3) plus TPO and Tg antibodies?",
    systemRationale:
      'TSH drift toward the upper end of normal precedes overt hypothyroidism by years. Free T3 / Free T4 catch conversion problems TSH alone misses. Antibody tests catch autoimmune cause early.',
  },
  {
    system: 'iron_hematology',
    label: 'Red-cell production & iron',
    markers: [
      /^ferritin$/i,
      /^iron$/i,
      /^tibc$|^total\s+iron[\s-]*binding/i,
      /^transferrin(?:\s+saturation)?$/i,
      /^mcv$|^mean\s+corpuscular\s+volume$/i,
      /^mch$|^mean\s+corpuscular\s+hemoglobin$/i,
      /^mchc$|^mean\s+corpuscular\s+hemoglobin\s+concentration$/i,
      /^rdw(?:[-\s]*cv)?$|^red\s+cell\s+distribution\s+width/i,
    ],
    icd10: 'D64.9',
    confirmatoryTests: [
      'Iron Panel (Iron, TIBC, Transferrin Saturation, Ferritin)',
      'Reticulocyte count',
      'B12 + RBC Folate',
    ],
    questionForDoctor:
      "My red-cell indices are drifting — can we run a full iron panel and a reticulocyte count to see if iron stores are dropping before this becomes anemia?",
    systemRationale:
      'Red blood cells get smaller and lighter (low-normal MCV/MCH/MCHC, elevated RDW) before hemoglobin drops out of range. That window is when iron stores are draining — the earliest reversible point.',
  },
  {
    system: 'inflammation',
    concerningDirection: 'high',
    label: 'Systemic inflammation',
    markers: [
      /^hs[\s-]?crp$|^c[\s-]?reactive\s+protein/i,
      /^esr$|^sed\s+rate$|^erythrocyte\s+sedimentation/i,
      /^homocysteine$/i,
      /^uric\s+acid$/i,
      /^fibrinogen$/i,
    ],
    icd10: 'R74.0',
    confirmatoryTests: [
      'hs-CRP',
      'ESR',
      'Homocysteine',
      'Ferritin (acute-phase reactant)',
    ],
    questionForDoctor:
      "My inflammation markers are pressed to the high end — can we figure out the source? Diet, infection, autoimmune, sleep apnea?",
    systemRationale:
      'Chronic low-grade inflammation amplifies cardiovascular risk and accelerates aging at the cellular level. Multiple inflammation markers drifting up signal a process worth investigating before it manifests as disease.',
  },
  {
    system: 'b_vitamin',
    label: 'B-vitamin / methylation',
    markers: [
      /^vitamin\s+b[\s-]?12$|^b12$|^cobalamin$/i,
      /^folate$|^folic\s+acid$|^rbc\s+folate$/i,
      /^homocysteine$/i,
      /^mma$|^methylmalonic/i,
    ],
    icd10: 'E53.8',
    confirmatoryTests: [
      'Methylmalonic Acid (MMA)',
      'Homocysteine',
      'RBC Folate',
      'Reticulocyte count',
    ],
    questionForDoctor:
      "My B-vitamin / methylation markers are drifting — can we run MMA and homocysteine to check whether my actual tissue level is low even if serum reads in range?",
    systemRationale:
      'B12 / folate / B6 work as a methylation team. Low-normal serum B12 with elevated homocysteine = the tissue level is actually insufficient. MMA confirms functional deficiency the basic B12 number misses.',
  },
  {
    system: 'male_hormone',
    label: 'Male hormonal axis',
    sexGate: 'male',
    markers: [
      /^total\s+testosterone$|^testosterone,?\s*total$/i,
      /^free\s+testosterone$/i,
      /^shbg$|^sex\s*hormone\s*binding/i,
      /^estradiol$|^e2$/i,
      /^lh$|^luteinizing\s+hormone$/i,
      /^fsh$|^follicle[\s-]*stimulating/i,
      /^prolactin$/i,
    ],
    icd10: 'E29.1',
    confirmatoryTests: [
      'Free Testosterone',
      'SHBG',
      'Estradiol',
      'LH + FSH',
      'Prolactin',
    ],
    questionForDoctor:
      "My male-hormone markers are drifting — can we run Free T, SHBG, LH/FSH, and prolactin to figure out if the issue is in the testes or upstream in the brain?",
    systemRationale:
      'Total testosterone alone misses the picture. Free T (active hormone), SHBG (carrier), and LH/FSH (brain signal) together identify whether drift is testicular, pituitary, or just SHBG-bound.',
  },
  {
    system: 'female_hormone',
    label: 'Female hormonal axis',
    sexGate: 'female',
    markers: [
      /^estradiol$|^e2$/i,
      /^progesterone$/i,
      /^lh$|^luteinizing\s+hormone$/i,
      /^fsh$|^follicle[\s-]*stimulating/i,
      /^prolactin$/i,
      /^dhea[\s-]?s$|^dehydroepiandrosterone/i,
      /^total\s+testosterone$|^testosterone,?\s*total$/i,
      /^free\s+testosterone$/i,
      /^shbg$/i,
      /^anti[\s-]?mullerian|^amh$/i,
    ],
    icd10: 'E28.9',
    confirmatoryTests: [
      'Free Testosterone',
      'DHEA-S',
      'SHBG',
      'AMH (Anti-Müllerian Hormone)',
      'Pelvic Ultrasound (if PCOS suspected)',
    ],
    questionForDoctor:
      "My female-hormone markers are drifting — can we run a full hormonal panel and discuss whether this fits PCOS, perimenopause, or another pattern?",
    systemRationale:
      'Female hormonal patterns are cyclic and complex — no single marker tells the whole story. Multiple markers drifting together (LH/FSH ratio, androgens, AMH) point to specific patterns like PCOS or ovarian reserve decline.',
  },
];

/** Helper: classify a marker name into a system, or null if no match. */
export function systemFor(markerName: string): string | null {
  const lc = String(markerName ?? '');
  for (const sys of MARKER_SYSTEMS) {
    if (sys.markers.some(re => re.test(lc))) return sys.system;
  }
  return null;
}

export function getSystem(systemId: string): MarkerSystem | undefined {
  return MARKER_SYSTEMS.find(s => s.system === systemId);
}
