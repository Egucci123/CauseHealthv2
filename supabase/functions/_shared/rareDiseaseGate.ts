// supabase/functions/_shared/rareDiseaseGate.ts
// Single source of truth for rare-disease screening thresholds.
// Used by analyze-labs (filters missing_tests) and generate-doctor-prep
// (filters tests_to_request + advanced_screening + scrubs prose).
//
// Tightening these thresholds in one place updates both functions.

export interface RareDiseaseContext {
  age: number;          // 99 if unknown — gate fails closed
  platelets: number | null;
  rbc: number | null;
  hct: number | null;
  hgb: number | null;
  ana: number | null;
  globulin: number | null;
  calcium: number | null;
  ferritin: number | null;
  transferrinSat: number | null;
  prolactin: number | null;
}

export interface BlocklistRule {
  pattern: RegExp;
  allow: boolean;
  label: string;
}

/**
 * Compute the activation map for each rare-disease screening rule.
 * Age-aware: young patients hit lower thresholds because reactive
 * processes are less common in them.
 */
export function buildRareDiseaseBlocklist(ctx: RareDiseaseContext): BlocklistRule[] {
  const isYoung = ctx.age < 40;
  const isMidAge = ctx.age < 50;

  // JAK2 / polycythemia screening is gated on platelet abnormality
  // (myeloproliferative pattern) OR genuinely elevated RBC/Hct/Hgb beyond
  // standard range. Borderline-high CBC values in a young patient (RBC 5.7–6,
  // Hct 51) are NOT enough — that fired on a normal 28yo with no platelet
  // issue and was alarming. Require platelets OR a true polycythemia pattern.
  const allowJak2 =
    (ctx.platelets ?? 0) > 600 ||
    (isYoung && (ctx.platelets ?? 0) > 450) ||
    (isMidAge && (ctx.platelets ?? 0) > 500) ||
    ((ctx.rbc ?? 0) > 6.0 && (ctx.hct ?? 0) > 54) ||
    ((ctx.hgb ?? 0) > 17.5 && (ctx.hct ?? 0) > 53);

  const allowAnaReflex = (ctx.ana ?? 0) > 0;

  const allowMyeloma =
    (ctx.globulin ?? 0) > 5 ||
    ((ctx.globulin ?? 0) > 3.5 && isYoung) ||
    (ctx.calcium ?? 0) > 11.5;

  const allowHemochromGenetics =
    ((ctx.ferritin ?? 0) > 300 && (ctx.transferrinSat ?? 0) > 50) ||
    (isYoung && (ctx.ferritin ?? 0) > 200 && (ctx.transferrinSat ?? 0) > 45);

  const allowPituitaryMri = (ctx.prolactin ?? 0) > 100;

  return [
    { pattern: /\bjak2\b|v617f|erythropoietin|\bepo\b\s*level|peripheral\s+(blood\s+)?smear|myeloproliferative/i, allow: allowJak2, label: 'JAK2/EPO/peripheral smear' },
    { pattern: /\bana\b\s*reflex|anti-?dsdna|anti-?sm|anti-?ro|anti-?la|anti-?scl|anti-?jo/i, allow: allowAnaReflex, label: 'ANA reflex panel' },
    { pattern: /spep|upep|free\s+light\s+chain|multiple\s+myeloma/i, allow: allowMyeloma, label: 'Myeloma panel' },
    { pattern: /hereditary\s+hemochromatosis|hfe\s+gene/i, allow: allowHemochromGenetics, label: 'Hemochromatosis genetics' },
    { pattern: /pituitary\s+mri|sella\s+mri/i, allow: allowPituitaryMri, label: 'Pituitary MRI' },
    // Always blocked — only manual specialist order
    { pattern: /24-?hour\s+urinary\s+cortisol|cushing/i, allow: false, label: "Cushing's screening" },
    { pattern: /\bmthfr\b/i, allow: false, label: 'MTHFR' },
    { pattern: /hla-?b27/i, allow: false, label: 'HLA-B27' },
  ];
}

/**
 * Helper: extract the typical lab values needed by the gate from a
 * lab-values array.
 */
export function extractRareDiseaseContext(
  labValues: Array<{ marker_name?: string; value: number | string }>,
  age: number | null | undefined,
): RareDiseaseContext {
  const findVal = (patterns: string[]): number | null => {
    for (const v of labValues) {
      const n = (v.marker_name ?? '').toLowerCase();
      if (patterns.some(p => n.includes(p))) {
        const num = Number(v.value);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  };
  return {
    age: age ?? 99,
    platelets: findVal(['platelet']),
    rbc: findVal(['rbc', 'red blood cell']),
    hct: findVal(['hematocrit', 'hct']),
    hgb: findVal(['hemoglobin', 'hgb']),
    ana: findVal(['ana ', 'anti-nuclear']),
    globulin: findVal(['globulin']),
    calcium: findVal(['calcium']),
    ferritin: findVal(['ferritin']),
    transferrinSat: findVal(['transferrin saturation', 'iron sat']),
    prolactin: findVal(['prolactin']),
  };
}
