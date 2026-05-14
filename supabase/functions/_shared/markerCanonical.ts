// markerCanonical.ts
// ──────────────────────────────────────────────────────────────────────
// Single source of truth for mapping ANY extracted / typed marker name
// to a canonical key. Used by:
//   - extract-labs: normalize names before dedupe + plausibility lookup
//   - downstream engine: optional consistency check (engine continues to
//     use its own regex set for now, but values include canonical_key so
//     future audits can verify cross-layer agreement)
//
// Design notes
// ────────────
// 1. Pattern order matters. More specific patterns (e.g. "Hemoglobin A1c")
//    are listed BEFORE the more generic parent ("Hemoglobin"). The first
//    matching canonical wins. Without ordering, "Hemoglobin A1c" would
//    incorrectly match "hemoglobin" first.
//
// 2. Overlap traps are encoded via negative lookbehinds / lookaheads where
//    practical (LDL vs VLDL; Hemoglobin vs Hgb A1c; Calcium vs Ionized
//    Calcium; Neutrophils % vs Absolute).
//
// 3. When the same display name can mean two different analytes (e.g.
//    "Calcium" → either total or ionized depending on units), the patterns
//    here resolve to the most common interpretation; the unit-based
//    disambiguator (step 3 in the upload hardening plan) then promotes the
//    ionized variant when units / value range say so.
//
// 4. Returning null means "unknown marker" — the caller should KEEP the raw
//    name (we never silently drop a marker we can't categorize).

export type MarkerCategory =
  | 'cbc' | 'cbc_diff' | 'cmp' | 'lipid' | 'thyroid' | 'iron'
  | 'vitamins' | 'glycemia' | 'hormone_male' | 'hormone_female'
  | 'inflammation' | 'kidney' | 'urinalysis' | 'other';

export interface CanonicalMarker {
  /** Canonical display name (used for UI + dedupe). */
  canonical: string;
  /** Lowercase stable key (used for PLAUSIBILITY lookup + tests). */
  key: string;
  /** Patterns that match against the trimmed marker name (case-insensitive). */
  patterns: RegExp[];
  /** Expected US conventional unit, lowercased. Used by the disambiguator. */
  unit?: string;
  /** Physiological value range typical for this marker (used by disambiguator + plausibility). */
  plausibleRange?: { min: number; max: number };
  category: MarkerCategory;
}

// ── Canonical registry ───────────────────────────────────────────────
// IMPORTANT: order = priority. Specific patterns BEFORE generic parents.
export const MARKERS: CanonicalMarker[] = [
  // ── Glycemia (must come BEFORE Hemoglobin so "Hemoglobin A1c" wins) ──
  { canonical: 'Hemoglobin A1c', key: 'a1c', category: 'glycemia',
    patterns: [/hemoglobin\s*a1c/i, /\bhba1c\b/i, /\bhb\s*a1c\b/i, /\ba1c\b/i, /glycohemoglobin/i, /glycated\s*hemoglobin/i],
    unit: '%', plausibleRange: { min: 3, max: 20 } },
  { canonical: 'Glucose, Fasting', key: 'glucose_fasting', category: 'glycemia',
    patterns: [/fasting\s*glucose/i, /glucose,\s*fasting/i, /glucose\s+fasting/i],
    unit: 'mg/dl', plausibleRange: { min: 30, max: 800 } },
  { canonical: 'Glucose, OGTT 2-hour', key: 'glucose_ogtt_2hr', category: 'glycemia',
    patterns: [/glucose.*(?:2[-\s]?hr|2[-\s]?hour|2h|2hpp|post[-\s]?(?:prandial|load))/i,
               /(?:2[-\s]?hr|2[-\s]?hour).*glucose/i,
               /glucose\s+tolerance/i,
               /\bogtt\b/i],
    unit: 'mg/dl', plausibleRange: { min: 30, max: 800 } },
  { canonical: 'Glucose, Random', key: 'glucose_random', category: 'glycemia',
    patterns: [/glucose,\s*random/i, /random\s*glucose/i],
    unit: 'mg/dl', plausibleRange: { min: 30, max: 800 } },
  { canonical: 'Glucose', key: 'glucose', category: 'glycemia',
    patterns: [/^glucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr|fasting))/i,
               /^glucose,?\s*serum$/i, /^glucose,?\s*plasma$/i],
    unit: 'mg/dl', plausibleRange: { min: 30, max: 800 } },
  { canonical: 'Fasting Insulin', key: 'insulin', category: 'glycemia',
    patterns: [/fasting\s*insulin/i, /^insulin\b/i],
    unit: 'uiu/ml', plausibleRange: { min: 0.1, max: 500 } },
  { canonical: 'C-Peptide', key: 'c_peptide', category: 'glycemia',
    patterns: [/c[-\s]?peptide/i],
    unit: 'ng/ml', plausibleRange: { min: 0.05, max: 50 } },

  // ── CBC (Hemoglobin AFTER A1c per ordering rule above) ──────────────
  { canonical: 'Hemoglobin', key: 'hemoglobin', category: 'cbc',
    patterns: [/^hemoglobin\b(?!\s*a1c)/i, /^hgb\b/i, /^hb\b(?!\s*a1c)/i],
    unit: 'g/dl', plausibleRange: { min: 3, max: 25 } },
  { canonical: 'Hematocrit', key: 'hematocrit', category: 'cbc',
    patterns: [/^hematocrit\b/i, /^hct\b/i],
    unit: '%', plausibleRange: { min: 10, max: 70 } },
  { canonical: 'WBC', key: 'wbc', category: 'cbc',
    patterns: [/^wbc\b/i, /white\s*blood\s*cell(?:\s*count)?/i, /^leukocytes?\b/i, /^leucocytes?\b/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0.5, max: 100 } },
  { canonical: 'RBC', key: 'rbc', category: 'cbc',
    // "RBC" must NOT swallow "RBC Magnesium" / "RBC Folate" — they have
    // their own canonical entries (rbc-prefixed analytes).
    patterns: [/^rbc\b(?!\s*(?:magnesium|folate|mg\b))/i, /red\s*blood\s*cell(?:\s*count)?/i, /^erythrocytes?\b/i],
    unit: 'million/ul', plausibleRange: { min: 1, max: 10 } },
  { canonical: 'MCHC', key: 'mchc', category: 'cbc',
    patterns: [/\bmchc\b/i, /mean\s*corpuscular\s*hemoglobin\s*concentration/i],
    unit: 'g/dl', plausibleRange: { min: 25, max: 40 } },
  { canonical: 'MCH', key: 'mch', category: 'cbc',
    patterns: [/^mch\b(?!c)/i, /mean\s*corpuscular\s*hemoglobin(?!\s*concentration)/i],
    unit: 'pg', plausibleRange: { min: 10, max: 50 } },
  { canonical: 'MCV', key: 'mcv', category: 'cbc',
    patterns: [/^mcv\b/i, /mean\s*corpuscular\s*volume/i],
    unit: 'fl', plausibleRange: { min: 50, max: 130 } },
  { canonical: 'RDW', key: 'rdw', category: 'cbc',
    patterns: [/^rdw\b/i, /red\s*cell\s*distribution\s*width/i, /rdw[-\s]?cv/i, /rdw[-\s]?sd/i],
    unit: '%', plausibleRange: { min: 8, max: 30 } },
  { canonical: 'Platelets', key: 'platelets', category: 'cbc',
    patterns: [/^platelets?\b/i, /^platelet\s*count\b/i, /^plt\b/i],
    unit: 'x10e3/ul', plausibleRange: { min: 5, max: 2000 } },
  { canonical: 'MPV', key: 'mpv', category: 'cbc',
    patterns: [/^mpv\b/i, /mean\s*platelet\s*volume/i],
    unit: 'fl', plausibleRange: { min: 5, max: 20 } },

  // ── CBC differential — % vs absolute is a classic overlap trap ──────
  { canonical: 'Neutrophils Absolute', key: 'anc', category: 'cbc_diff',
    patterns: [/absolute\s*neutrophils?/i, /neutrophils?\s*\(?absolute\)?/i, /neut\s*#/i, /^anc\b/i, /neutrophils?,?\s*abs/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0.05, max: 50 } },
  { canonical: 'Neutrophils %', key: 'neutrophils_pct', category: 'cbc_diff',
    patterns: [/neutrophils?(?:,?\s*%|\s*percent)/i, /^%\s*neutrophils?/i, /^neutrophils?$/i],
    unit: '%', plausibleRange: { min: 0, max: 100 } },
  { canonical: 'Lymphocytes Absolute', key: 'alc', category: 'cbc_diff',
    patterns: [/absolute\s*lymphocyt/i, /lymphocytes?\s*\(?absolute\)?/i, /lymph\s*#/i, /lymphocytes?,?\s*abs/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0.05, max: 50 } },
  { canonical: 'Lymphocytes %', key: 'lymphocytes_pct', category: 'cbc_diff',
    patterns: [/lymphocytes?(?:,?\s*%|\s*percent)/i, /^%\s*lymphocytes?/i, /^lymphocytes?$/i, /^lymphs?$/i],
    unit: '%', plausibleRange: { min: 0, max: 100 } },
  { canonical: 'Monocytes Absolute', key: 'amc', category: 'cbc_diff',
    patterns: [/absolute\s*monocyt/i, /monocytes?\s*\(?absolute\)?/i, /mono\s*#/i, /monocytes?,?\s*abs/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0.01, max: 10 } },
  { canonical: 'Monocytes %', key: 'monocytes_pct', category: 'cbc_diff',
    patterns: [/monocytes?(?:,?\s*%|\s*percent)/i, /^monocytes?$/i],
    unit: '%', plausibleRange: { min: 0, max: 100 } },
  { canonical: 'Eosinophils Absolute', key: 'aec', category: 'cbc_diff',
    patterns: [/absolute\s*eosinophils?/i, /eosinophils?\s*\(?absolute\)?/i, /eos\s*#/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0, max: 10 } },
  { canonical: 'Eosinophils %', key: 'eosinophils_pct', category: 'cbc_diff',
    patterns: [/eosinophils?(?:,?\s*%|\s*percent)/i, /^eosinophils?$/i, /^eos$/i],
    unit: '%', plausibleRange: { min: 0, max: 100 } },
  { canonical: 'Basophils Absolute', key: 'abc', category: 'cbc_diff',
    patterns: [/absolute\s*basophils?/i, /basophils?\s*\(?absolute\)?/i],
    unit: 'x10e3/ul', plausibleRange: { min: 0, max: 5 } },
  { canonical: 'Basophils %', key: 'basophils_pct', category: 'cbc_diff',
    patterns: [/basophils?(?:,?\s*%|\s*percent)/i, /^basophils?$/i],
    unit: '%', plausibleRange: { min: 0, max: 100 } },

  // ── CMP / liver / kidney ────────────────────────────────────────────
  { canonical: 'ALT', key: 'alt', category: 'cmp',
    patterns: [/^alt\b/i, /alt\s*\(?sgpt\)?/i, /sgpt/i, /alanine\s*amino/i, /alt[\/\s]+sgpt/i],
    unit: 'u/l', plausibleRange: { min: 1, max: 2000 } },
  { canonical: 'AST', key: 'ast', category: 'cmp',
    patterns: [/^ast\b/i, /ast\s*\(?sgot\)?/i, /sgot/i, /aspartate\s*amino/i, /ast[\/\s]+sgot/i],
    unit: 'u/l', plausibleRange: { min: 1, max: 2000 } },
  { canonical: 'Alkaline Phosphatase', key: 'alk_phos', category: 'cmp',
    patterns: [/alkaline\s*phosphatase/i, /^alk\s*phos\b/i, /^alp\b/i],
    unit: 'u/l', plausibleRange: { min: 5, max: 1500 } },
  { canonical: 'GGT', key: 'ggt', category: 'cmp',
    patterns: [/^ggt\b/i, /gamma[-\s]?glutamyl/i, /\bggtp\b/i],
    unit: 'u/l', plausibleRange: { min: 1, max: 2000 } },
  { canonical: 'Bilirubin Total', key: 'bilirubin_total', category: 'cmp',
    patterns: [/total\s*bilirubin/i, /bilirubin,?\s*total/i, /^bilirubin\b(?!.*(?:direct|indirect|unconjugated|conjugated))/i],
    unit: 'mg/dl', plausibleRange: { min: 0.1, max: 30 } },
  { canonical: 'Bilirubin Direct', key: 'bilirubin_direct', category: 'cmp',
    // "conjugated" must not match "unconjugated" — negative lookbehind.
    patterns: [/direct\s*bilirubin/i, /bilirubin,?\s*direct/i, /(?<!un)conjugated\s*bilirubin/i],
    unit: 'mg/dl', plausibleRange: { min: 0, max: 20 } },
  { canonical: 'Bilirubin Indirect', key: 'bilirubin_indirect', category: 'cmp',
    patterns: [/indirect\s*bilirubin/i, /bilirubin,?\s*indirect/i, /unconjugated\s*bilirubin/i],
    unit: 'mg/dl', plausibleRange: { min: 0, max: 25 } },
  { canonical: 'Albumin', key: 'albumin', category: 'cmp',
    patterns: [/^albumin\b/i, /albumin,?\s*serum/i],
    unit: 'g/dl', plausibleRange: { min: 1, max: 7 } },
  { canonical: 'Globulin', key: 'globulin', category: 'cmp',
    patterns: [/^globulin\b/i],
    unit: 'g/dl', plausibleRange: { min: 0.5, max: 8 } },
  { canonical: 'Protein, Total', key: 'protein_total', category: 'cmp',
    patterns: [/total\s*protein/i, /protein,?\s*total/i, /^tp\b/i],
    unit: 'g/dl', plausibleRange: { min: 3, max: 12 } },
  { canonical: 'BUN', key: 'bun', category: 'cmp',
    patterns: [/^bun\b/i, /urea\s*nitrogen/i, /\bbun\/urea\b/i],
    unit: 'mg/dl', plausibleRange: { min: 1, max: 200 } },
  { canonical: 'Creatinine', key: 'creatinine', category: 'kidney',
    patterns: [/^creatinine\b/i, /creatinine,?\s*serum/i],
    unit: 'mg/dl', plausibleRange: { min: 0.1, max: 15 } },
  { canonical: 'eGFR', key: 'egfr', category: 'kidney',
    patterns: [/^egfr\b/i, /estimated\s*gfr/i, /\bgfr\b/i],
    unit: 'ml/min/1.73m2', plausibleRange: { min: 1, max: 200 } },
  { canonical: 'Cystatin C', key: 'cystatin_c', category: 'kidney',
    patterns: [/cystatin\s*c/i],
    unit: 'mg/l', plausibleRange: { min: 0.1, max: 10 } },
  { canonical: 'Sodium', key: 'sodium', category: 'cmp',
    patterns: [/^sodium\b/i, /^na\b/i, /sodium,?\s*serum/i],
    unit: 'mmol/l', plausibleRange: { min: 110, max: 170 } },
  // Potassium — match "K", "K+", "K, Serum" but NOT Kidney/Ketones
  { canonical: 'Potassium', key: 'potassium', category: 'cmp',
    patterns: [/^potassium\b/i, /^k\s*(?:[,+]|$)/i, /potassium,?\s*serum/i],
    unit: 'mmol/l', plausibleRange: { min: 1.5, max: 8 } },
  { canonical: 'Chloride', key: 'chloride', category: 'cmp',
    patterns: [/^chloride\b/i, /^cl\s*(?:[,]|$)/i],
    unit: 'mmol/l', plausibleRange: { min: 70, max: 130 } },
  { canonical: 'Carbon Dioxide', key: 'co2', category: 'cmp',
    patterns: [/carbon\s*dioxide/i, /^co2\b/i, /^bicarbonate\b/i, /\bhco3\b/i, /total\s*co2/i],
    unit: 'mmol/l', plausibleRange: { min: 5, max: 50 } },
  // Calcium — total. Ionized handled separately. Disambiguator may promote.
  { canonical: 'Calcium', key: 'calcium', category: 'cmp',
    patterns: [/^calcium\b(?!.*(?:ionized|ion))/i, /calcium,?\s*total/i, /calcium,?\s*serum/i],
    unit: 'mg/dl', plausibleRange: { min: 5, max: 16 } },
  { canonical: 'Calcium, Ionized', key: 'calcium_ionized', category: 'cmp',
    patterns: [/ionized\s*calcium/i, /calcium,?\s*ionized/i, /\bica\b/i],
    unit: 'mmol/l', plausibleRange: { min: 0.5, max: 2.0 } },
  { canonical: 'Magnesium', key: 'magnesium', category: 'cmp',
    patterns: [/^magnesium\b(?!.*(?:rbc|red\s*cell))/i, /^mg\b(?!\s*rbc)/i],
    unit: 'mg/dl', plausibleRange: { min: 0.5, max: 5 } },
  { canonical: 'Magnesium, RBC', key: 'magnesium_rbc', category: 'cmp',
    patterns: [/rbc\s*magnesium/i, /magnesium,?\s*rbc/i, /red\s*cell\s*magnesium/i],
    unit: 'mg/dl', plausibleRange: { min: 1, max: 15 } },
  { canonical: 'Phosphorus', key: 'phosphorus', category: 'cmp',
    patterns: [/^phosphorus\b/i, /^phosphate\b/i, /^phos\b/i],
    unit: 'mg/dl', plausibleRange: { min: 1, max: 10 } },
  { canonical: 'Uric Acid', key: 'uric_acid', category: 'cmp',
    patterns: [/uric\s*acid/i, /^urate\b/i],
    unit: 'mg/dl', plausibleRange: { min: 0.5, max: 20 } },

  // ── Lipid panel — LDL must NOT match VLDL (overlap trap) ────────────
  { canonical: 'VLDL Cholesterol', key: 'vldl', category: 'lipid',
    patterns: [/^vldl\b/i, /vldl[-\s]?(?:c|chol)/i, /very\s*low\s*density/i],
    unit: 'mg/dl', plausibleRange: { min: 1, max: 200 } },
  { canonical: 'LDL Cholesterol', key: 'ldl', category: 'lipid',
    patterns: [/(?<!v)\bldl\b(?!\s*p)/i, /(?<!v)ldl[-\s]?(?:c|chol)/i, /low\s*density\s*lipoprotein(?!\s*p)/i],
    unit: 'mg/dl', plausibleRange: { min: 10, max: 500 } },
  { canonical: 'LDL Particle Number', key: 'ldl_p', category: 'lipid',
    patterns: [/ldl\s*[-]?\s*p\b/i, /ldl\s*particle/i, /\bldl-?p\b/i],
    unit: 'nmol/l', plausibleRange: { min: 100, max: 5000 } },
  // Non-HDL MUST come before HDL — otherwise "Non-HDL Cholesterol" greedily
  // matches HDL's `hdl[-\s]?chol` pattern.
  { canonical: 'Non-HDL Cholesterol', key: 'non_hdl', category: 'lipid',
    patterns: [/non[-\s]?hdl/i],
    unit: 'mg/dl', plausibleRange: { min: 10, max: 500 } },
  { canonical: 'HDL Cholesterol', key: 'hdl', category: 'lipid',
    patterns: [/^hdl\b/i, /(?<!non[-\s])hdl[-\s]?(?:c|chol)/i, /high\s*density\s*lipoprotein/i],
    unit: 'mg/dl', plausibleRange: { min: 5, max: 200 } },
  { canonical: 'Cholesterol, Total', key: 'cholesterol_total', category: 'lipid',
    patterns: [/total\s*cholesterol/i, /cholesterol,?\s*total/i, /^cholesterol\b(?!.*(?:hdl|ldl|vldl|non|to\s*hdl|ratio))/i],
    unit: 'mg/dl', plausibleRange: { min: 50, max: 600 } },
  { canonical: 'Triglycerides', key: 'triglycerides', category: 'lipid',
    // ^tg\b must NOT match "Tg-Ab" (thyroglobulin antibody) — guard with negative lookahead.
    patterns: [/^triglyc/i, /^tg\b(?![-\s]?ab)/i],
    unit: 'mg/dl', plausibleRange: { min: 10, max: 5000 } },
  { canonical: 'ApoB', key: 'apob', category: 'lipid',
    patterns: [/\bapob\b/i, /apolipoprotein\s*b/i, /apo[-\s]?b\b/i],
    unit: 'mg/dl', plausibleRange: { min: 10, max: 300 } },
  { canonical: 'ApoA1', key: 'apoa1', category: 'lipid',
    patterns: [/\bapoa1?\b/i, /apolipoprotein\s*a/i, /apo[-\s]?a[-\s]?1?/i],
    unit: 'mg/dl', plausibleRange: { min: 20, max: 300 } },
  { canonical: 'Lipoprotein(a)', key: 'lp_a', category: 'lipid',
    patterns: [/\blp\s*\(\s*a\s*\)/i, /\blp[-\s]?a\b/i, /lipoprotein\s*a/i],
    unit: 'nmol/l', plausibleRange: { min: 1, max: 1000 } },

  // ── Thyroid — Free T3 / Free T4 BEFORE Total ────────────────────────
  { canonical: 'TSH', key: 'tsh', category: 'thyroid',
    patterns: [/^tsh\b/i, /thyroid\s*stim/i, /thyrotropin/i],
    unit: 'miu/l', plausibleRange: { min: 0.001, max: 200 } },
  { canonical: 'Free T4', key: 'ft4', category: 'thyroid',
    patterns: [/free\s*t4/i, /t4,?\s*free/i, /^ft4\b/i, /thyroxine,?\s*free/i],
    unit: 'ng/dl', plausibleRange: { min: 0.1, max: 15 } },
  { canonical: 'Free T3', key: 'ft3', category: 'thyroid',
    patterns: [/free\s*t3/i, /t3,?\s*free/i, /^ft3\b/i],
    unit: 'pg/ml', plausibleRange: { min: 0.5, max: 30 } },
  { canonical: 'Reverse T3', key: 'rt3', category: 'thyroid',
    patterns: [/reverse\s*t3/i, /^rt3\b/i, /\bt3,?\s*reverse/i],
    unit: 'ng/dl', plausibleRange: { min: 1, max: 100 } },
  { canonical: 'Total T4', key: 'total_t4', category: 'thyroid',
    patterns: [/total\s*t4/i, /t4,?\s*total/i, /^t4\b(?!\s*free)/i, /thyroxine(?!\s*free)/i],
    unit: 'ug/dl', plausibleRange: { min: 1, max: 30 } },
  { canonical: 'Total T3', key: 'total_t3', category: 'thyroid',
    patterns: [/total\s*t3/i, /t3,?\s*total/i, /^t3\b(?!\s*free|reverse)/i],
    unit: 'ng/dl', plausibleRange: { min: 30, max: 500 } },
  // TPO must come BEFORE generic "thyroid antibodies" to avoid mismatch
  { canonical: 'TPO Antibodies', key: 'tpo_ab', category: 'thyroid',
    patterns: [/\btpo\b/i, /thyroid\s*peroxidase/i, /tpo\s*(?:antibody|ab)/i, /anti[-\s]?tpo/i],
    unit: 'iu/ml', plausibleRange: { min: 0, max: 5000 } },
  { canonical: 'Thyroglobulin Antibodies', key: 'tg_ab', category: 'thyroid',
    patterns: [/thyroglobulin\s*antibod/i, /thyroglobulin\s*\bab\b/i, /\btgab\b/i, /anti[-\s]?thyroglobulin/i, /\btg[-\s]?ab\b/i],
    unit: 'iu/ml', plausibleRange: { min: 0, max: 5000 } },
  { canonical: 'Thyroglobulin', key: 'thyroglobulin', category: 'thyroid',
    patterns: [/^thyroglobulin\b(?!.*(?:antibody|ab))/i],
    unit: 'ng/ml', plausibleRange: { min: 0, max: 1000 } },

  // ── Iron studies ────────────────────────────────────────────────────
  { canonical: 'Ferritin', key: 'ferritin', category: 'iron',
    patterns: [/^ferritin\b/i],
    unit: 'ng/ml', plausibleRange: { min: 1, max: 5000 } },
  { canonical: 'Transferrin Saturation', key: 'tsat', category: 'iron',
    patterns: [/transferrin\s*saturation/i, /^tsat\b/i, /iron\s*saturation/i, /%\s*saturation/i, /iron\s*%\s*sat/i],
    unit: '%', plausibleRange: { min: 1, max: 100 } },
  { canonical: 'Transferrin', key: 'transferrin', category: 'iron',
    patterns: [/^transferrin\b(?!\s*saturation)/i],
    unit: 'mg/dl', plausibleRange: { min: 100, max: 600 } },
  { canonical: 'Iron Binding Capacity', key: 'tibc', category: 'iron',
    patterns: [/iron\s*binding\s*capacity/i, /^tibc\b/i, /total\s*iron\s*binding/i],
    unit: 'mcg/dl', plausibleRange: { min: 100, max: 700 } },
  // Iron must NOT match Iron Sat, TIBC, %Sat — guard with negative lookahead
  { canonical: 'Iron', key: 'iron', category: 'iron',
    patterns: [/^iron\b(?!.*(?:saturation|\bsat\b|binding|tibc|%|capacity))/i, /^iron,?\s*total\b/i, /^iron,?\s*serum\b/i, /^fe\b/i],
    unit: 'mcg/dl', plausibleRange: { min: 5, max: 1000 } },

  // ── Vitamins ────────────────────────────────────────────────────────
  // 25-OH-D (storage form) must come BEFORE 1,25 (active form)
  { canonical: '1,25-OH Vitamin D', key: 'vit_d_125', category: 'vitamins',
    patterns: [/1[,\s]?25.{0,3}vitamin d/i, /1[,\s]?25.{0,3}dihydroxy/i, /calcitriol/i],
    unit: 'pg/ml', plausibleRange: { min: 1, max: 200 } },
  { canonical: '25-OH Vitamin D', key: 'vit_d', category: 'vitamins',
    patterns: [/25.?hydroxy.*vitamin d/i, /vitamin d.{0,4}25/i, /25[\s\-(]*oh[\s\-)]*(?:vitamin\s*)?d\b/i, /25-hydroxyvitamin/i, /^vitamin d\b/i, /\bvit d\b/i, /calcidiol/i],
    unit: 'ng/ml', plausibleRange: { min: 1, max: 250 } },
  { canonical: 'Vitamin B12', key: 'b12', category: 'vitamins',
    patterns: [/vitamin\s*b12/i, /^b12\b/i, /cobalamin/i],
    unit: 'pg/ml', plausibleRange: { min: 50, max: 5000 } },
  { canonical: 'Methylmalonic Acid', key: 'mma', category: 'vitamins',
    patterns: [/methylmalonic\s*acid/i, /\bmma\b/i],
    unit: 'nmol/l', plausibleRange: { min: 10, max: 5000 } },
  { canonical: 'Folate, Serum', key: 'folate', category: 'vitamins',
    patterns: [/^folate(?:,?\s*serum)?\b(?!.*rbc)/i, /serum\s*folate/i, /folic\s*acid/i],
    unit: 'ng/ml', plausibleRange: { min: 0.5, max: 50 } },
  { canonical: 'Folate, RBC', key: 'folate_rbc', category: 'vitamins',
    patterns: [/rbc\s*folate/i, /folate,?\s*rbc/i, /red\s*cell\s*folate/i],
    unit: 'ng/ml', plausibleRange: { min: 100, max: 2000 } },
  { canonical: 'Homocysteine', key: 'homocysteine', category: 'vitamins',
    patterns: [/homocysteine/i],
    unit: 'umol/l', plausibleRange: { min: 1, max: 200 } },

  // ── Inflammation ────────────────────────────────────────────────────
  { canonical: 'hs-CRP', key: 'hscrp', category: 'inflammation',
    patterns: [/hs[-\s]?crp/i, /high[-\s]?sensitivity\s*crp/i, /c[-\s]?reactive.*high/i],
    unit: 'mg/l', plausibleRange: { min: 0.01, max: 100 } },
  { canonical: 'CRP', key: 'crp', category: 'inflammation',
    patterns: [/^crp\b/i, /c[-\s]?reactive\s*protein\b(?!.*high)/i],
    unit: 'mg/l', plausibleRange: { min: 0.01, max: 500 } },
  { canonical: 'ESR', key: 'esr', category: 'inflammation',
    patterns: [/^esr\b/i, /sed(?:imentation)?\s*rate/i, /erythrocyte\s*sed/i],
    unit: 'mm/hr', plausibleRange: { min: 1, max: 200 } },

  // ── Hormones (sex-shared) ──────────────────────────────────────────
  // Total + Free + Bioavailable + SHBG + DHEA-S + Estradiol + LH/FSH/Prolactin/Progesterone
  { canonical: 'Testosterone, Bioavailable', key: 'testosterone_bio', category: 'hormone_male',
    patterns: [/bioavailable\s*testosterone/i, /testosterone,?\s*bioavailable/i, /\bbio[-\s]?t\b/i],
    unit: 'ng/dl', plausibleRange: { min: 1, max: 1500 } },
  { canonical: 'Testosterone, Free', key: 'testosterone_free', category: 'hormone_male',
    patterns: [/free\s*testosterone/i, /testosterone,?\s*free/i, /\bfree\s*t\b/i, /\bfT\b/],
    unit: 'pg/ml', plausibleRange: { min: 0.5, max: 500 } },
  { canonical: 'Testosterone, Total', key: 'testosterone_total', category: 'hormone_male',
    patterns: [/total\s*testosterone/i, /testosterone,?\s*total/i, /testosterone(?!\s*(?:free|bio))/i],
    unit: 'ng/dl', plausibleRange: { min: 5, max: 2500 } },
  { canonical: 'Estradiol', key: 'estradiol', category: 'hormone_female',
    patterns: [/estradiol/i, /^e2\b/i],
    unit: 'pg/ml', plausibleRange: { min: 1, max: 5000 } },
  { canonical: 'Progesterone', key: 'progesterone', category: 'hormone_female',
    patterns: [/progesterone/i],
    unit: 'ng/ml', plausibleRange: { min: 0.01, max: 100 } },
  { canonical: 'LH', key: 'lh', category: 'hormone_female',
    patterns: [/^lh\b/i, /luteinizing\s*hormone/i],
    unit: 'miu/ml', plausibleRange: { min: 0.1, max: 200 } },
  { canonical: 'FSH', key: 'fsh', category: 'hormone_female',
    patterns: [/^fsh\b/i, /follicle\s*stim/i],
    unit: 'miu/ml', plausibleRange: { min: 0.1, max: 200 } },
  { canonical: 'Prolactin', key: 'prolactin', category: 'hormone_female',
    patterns: [/^prolactin\b/i],
    unit: 'ng/ml', plausibleRange: { min: 0.1, max: 500 } },
  { canonical: 'SHBG', key: 'shbg', category: 'hormone_male',
    patterns: [/\bshbg\b/i, /sex\s*hormone\s*binding/i],
    unit: 'nmol/l', plausibleRange: { min: 1, max: 500 } },
  { canonical: 'DHEA Sulfate', key: 'dhea_s', category: 'hormone_male',
    patterns: [/dhea\s*sulfate/i, /dhea[-\s]?s\b/i],
    unit: 'mcg/dl', plausibleRange: { min: 1, max: 1500 } },
  { canonical: 'AM Cortisol', key: 'cortisol', category: 'hormone_male',
    patterns: [/am\s*cortisol/i, /morning\s*cortisol/i, /cortisol,?\s*am/i, /^cortisol\b/i],
    unit: 'mcg/dl', plausibleRange: { min: 0.1, max: 100 } },
  { canonical: 'AMH', key: 'amh', category: 'hormone_female',
    patterns: [/\bamh\b/i, /anti[-\s]?m[üu]llerian/i],
    unit: 'ng/ml', plausibleRange: { min: 0.01, max: 30 } },
  { canonical: 'PSA', key: 'psa', category: 'hormone_male',
    patterns: [/^psa\b/i, /prostate[-\s]?specific\s*antigen/i],
    unit: 'ng/ml', plausibleRange: { min: 0.01, max: 1000 } },
];

// Strip SAMPLE-SOURCE suffixes the AI sometimes leaves on names
// ("Glucose, Serum", "ALT, Plasma") — these don't change the canonical
// mapping, just confuse the regex anchors. We do NOT strip TEST-TYPE
// suffixes like "Fasting" or "Random" — those are meaningful (Glucose
// Fasting vs Glucose Random map to different canonical entries).
function cleanName(rawName: string): string {
  return (rawName || '')
    .replace(/[,;:]\s*(?:serum|plasma|whole blood|blood|capillary|venous)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CanonicalResult {
  canonical: string;
  key: string;
  category: MarkerCategory;
  unit?: string;
  plausibleRange?: { min: number; max: number };
}

/**
 * Map any extracted marker name to its canonical entry, or null if unknown.
 * @param rawName the extracted marker text as printed on the lab report
 * @returns the canonical match, or null if no pattern matches
 */
export function canonicalize(rawName: string): CanonicalResult | null {
  if (!rawName) return null;
  const cleaned = cleanName(rawName);
  if (!cleaned) return null;
  for (const m of MARKERS) {
    if (m.patterns.some(re => re.test(cleaned))) {
      return {
        canonical: m.canonical, key: m.key, category: m.category,
        unit: m.unit, plausibleRange: m.plausibleRange,
      };
    }
  }
  return null;
}

/** Returns the canonical key, or a deterministic slug of the cleaned name if unknown.
 *  Used as the dedupe key so unknown markers still group themselves consistently. */
export function canonicalKey(rawName: string): string {
  const c = canonicalize(rawName);
  if (c) return c.key;
  // Fallback: lowercase + collapse non-alphanumeric to '_'.
  return cleanName(rawName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
