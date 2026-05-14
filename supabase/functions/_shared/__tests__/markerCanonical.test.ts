// markerCanonical.test.ts — unit tests for the canonical marker map.
// Verifies: aliases map correctly, overlap traps are guarded, and the
// fallback returns a stable key for unknown markers.
//
// Run: deno run -A supabase/functions/_shared/__tests__/markerCanonical.test.ts

import { canonicalize, canonicalKey } from "../markerCanonical.ts";

interface Case {
  name: string;       // input marker name
  expectKey: string | null; // canonical key, or null for unknown
  note?: string;
}

const CASES: Case[] = [
  // ── Basic aliases ───────────────────────────────────────────────────
  { name: "ALT", expectKey: "alt" },
  { name: "ALT (SGPT)", expectKey: "alt" },
  { name: "SGPT", expectKey: "alt" },
  { name: "Alanine Aminotransferase", expectKey: "alt" },
  { name: "ALT/SGPT", expectKey: "alt" },
  { name: "AST", expectKey: "ast" },
  { name: "AST (SGOT)", expectKey: "ast" },
  { name: "SGOT", expectKey: "ast" },

  // ── A1c vs Hemoglobin (overlap trap) ────────────────────────────────
  { name: "Hemoglobin A1c", expectKey: "a1c" },
  { name: "HbA1c", expectKey: "a1c" },
  { name: "Hb A1c", expectKey: "a1c" },
  { name: "A1c", expectKey: "a1c" },
  { name: "Glycohemoglobin", expectKey: "a1c" },
  { name: "Hemoglobin", expectKey: "hemoglobin" },
  { name: "Hgb", expectKey: "hemoglobin" },
  { name: "HEMOGLOBIN", expectKey: "hemoglobin" },

  // ── LDL vs VLDL (overlap trap) ──────────────────────────────────────
  { name: "LDL Cholesterol", expectKey: "ldl" },
  { name: "LDL-C", expectKey: "ldl" },
  { name: "LDL", expectKey: "ldl" },
  { name: "VLDL Cholesterol", expectKey: "vldl", note: "must NOT match LDL" },
  { name: "VLDL", expectKey: "vldl" },
  { name: "VLDL-C", expectKey: "vldl" },
  { name: "HDL Cholesterol", expectKey: "hdl" },
  { name: "HDL", expectKey: "hdl" },
  { name: "Cholesterol, Total", expectKey: "cholesterol_total" },
  { name: "Total Cholesterol", expectKey: "cholesterol_total" },
  { name: "Triglycerides", expectKey: "triglycerides" },

  // ── Glucose variants (overlap trap) ─────────────────────────────────
  { name: "Glucose", expectKey: "glucose" },
  { name: "Glucose, Serum", expectKey: "glucose" },
  { name: "Fasting Glucose", expectKey: "glucose_fasting" },
  { name: "Glucose, Fasting", expectKey: "glucose_fasting" },
  { name: "Glucose Tolerance", expectKey: "glucose_ogtt_2hr" },
  { name: "Glucose, 2-hr Postprandial", expectKey: "glucose_ogtt_2hr" },
  { name: "OGTT", expectKey: "glucose_ogtt_2hr" },
  { name: "Glucose, Random", expectKey: "glucose_random" },

  // ── Iron vs TSat / TIBC (overlap trap) ──────────────────────────────
  { name: "Iron", expectKey: "iron" },
  { name: "Iron, Total", expectKey: "iron" },
  { name: "Iron Binding Capacity", expectKey: "tibc" },
  { name: "TIBC", expectKey: "tibc" },
  { name: "Transferrin Saturation", expectKey: "tsat" },
  { name: "TSat", expectKey: "tsat" },
  { name: "% Saturation", expectKey: "tsat" },
  { name: "Iron Saturation", expectKey: "tsat" },
  { name: "Ferritin", expectKey: "ferritin" },
  { name: "Transferrin", expectKey: "transferrin" },

  // ── Thyroid: Free T4 vs Total T4 (overlap trap) ─────────────────────
  { name: "TSH", expectKey: "tsh" },
  { name: "Thyroid Stimulating Hormone", expectKey: "tsh" },
  { name: "Thyrotropin", expectKey: "tsh" },
  { name: "Free T4", expectKey: "ft4" },
  { name: "T4, Free", expectKey: "ft4" },
  { name: "FT4", expectKey: "ft4" },
  { name: "Free T3", expectKey: "ft3" },
  { name: "T3, Free", expectKey: "ft3" },
  { name: "Total T4", expectKey: "total_t4" },
  { name: "T4, Total", expectKey: "total_t4" },
  { name: "Reverse T3", expectKey: "rt3" },
  { name: "RT3", expectKey: "rt3" },
  { name: "TPO Antibodies", expectKey: "tpo_ab" },
  { name: "Anti-TPO", expectKey: "tpo_ab" },
  { name: "Thyroid Peroxidase", expectKey: "tpo_ab" },
  { name: "Thyroglobulin Antibodies", expectKey: "tg_ab" },
  { name: "Tg-Ab", expectKey: "tg_ab" },
  { name: "Anti-Thyroglobulin", expectKey: "tg_ab" },
  { name: "Thyroglobulin", expectKey: "thyroglobulin", note: "must NOT match Tg-Ab" },

  // ── CBC differential: % vs absolute (overlap trap) ──────────────────
  { name: "Neutrophils %", expectKey: "neutrophils_pct" },
  { name: "Neutrophils", expectKey: "neutrophils_pct" },
  { name: "Absolute Neutrophils", expectKey: "anc" },
  { name: "Neutrophils (Absolute)", expectKey: "anc" },
  { name: "ABSOLUTE NEUTROPHILS", expectKey: "anc" },
  { name: "Neut #", expectKey: "anc" },
  { name: "ANC", expectKey: "anc" },
  { name: "Lymphocytes %", expectKey: "lymphocytes_pct" },
  { name: "Lymphocytes", expectKey: "lymphocytes_pct" },
  { name: "LYMPHS", expectKey: "lymphocytes_pct" },
  { name: "Absolute Lymphocytes", expectKey: "alc" },
  { name: "Lymphocytes (Absolute)", expectKey: "alc" },
  { name: "Lymph #", expectKey: "alc" },

  // ── CBC indices: MCH vs MCHC (overlap trap) ─────────────────────────
  { name: "MCH", expectKey: "mch" },
  { name: "MCHC", expectKey: "mchc", note: "must NOT match MCH" },
  { name: "Mean Corpuscular Hemoglobin", expectKey: "mch" },
  { name: "Mean Corpuscular Hemoglobin Concentration", expectKey: "mchc" },
  { name: "MCV", expectKey: "mcv" },
  { name: "Mean Corpuscular Volume", expectKey: "mcv" },
  { name: "RDW", expectKey: "rdw" },
  { name: "RDW-CV", expectKey: "rdw" },
  { name: "Red Cell Distribution Width", expectKey: "rdw" },

  // ── Potassium vs Kidney/Ketones (overlap trap) ──────────────────────
  { name: "Potassium", expectKey: "potassium" },
  { name: "Potassium, Serum", expectKey: "potassium" },
  { name: "K", expectKey: "potassium" },
  { name: "K+", expectKey: "potassium" },

  // ── Calcium total vs ionized (overlap trap) ─────────────────────────
  { name: "Calcium", expectKey: "calcium" },
  { name: "Calcium, Total", expectKey: "calcium" },
  { name: "Calcium, Serum", expectKey: "calcium" },
  { name: "Ionized Calcium", expectKey: "calcium_ionized" },
  { name: "Calcium, Ionized", expectKey: "calcium_ionized" },

  // ── Bilirubin total vs direct vs indirect ───────────────────────────
  { name: "Bilirubin Total", expectKey: "bilirubin_total" },
  { name: "Bilirubin, Total", expectKey: "bilirubin_total" },
  { name: "Total Bilirubin", expectKey: "bilirubin_total" },
  { name: "BILIRUBIN, TOTAL", expectKey: "bilirubin_total" },
  { name: "Bilirubin Direct", expectKey: "bilirubin_direct" },
  { name: "Direct Bilirubin", expectKey: "bilirubin_direct" },
  { name: "Conjugated Bilirubin", expectKey: "bilirubin_direct" },
  { name: "Bilirubin Indirect", expectKey: "bilirubin_indirect" },
  { name: "Unconjugated Bilirubin", expectKey: "bilirubin_indirect" },

  // ── Magnesium serum vs RBC (overlap trap) ───────────────────────────
  { name: "Magnesium", expectKey: "magnesium" },
  { name: "Magnesium, Serum", expectKey: "magnesium" },
  { name: "RBC Magnesium", expectKey: "magnesium_rbc" },
  { name: "Magnesium, RBC", expectKey: "magnesium_rbc" },

  // ── Vitamin D 25-OH vs 1,25 ─────────────────────────────────────────
  { name: "Vitamin D, 25-Hydroxy", expectKey: "vit_d" },
  { name: "25-Hydroxy Vitamin D", expectKey: "vit_d" },
  { name: "25-OH Vitamin D", expectKey: "vit_d" },
  { name: "25-OH-D", expectKey: "vit_d" },
  { name: "Vitamin D, 25-OH, Total, IA", expectKey: "vit_d" },
  { name: "Vitamin D", expectKey: "vit_d" },
  { name: "Vit D", expectKey: "vit_d" },
  { name: "Calcidiol", expectKey: "vit_d" },
  { name: "1,25-Dihydroxy Vitamin D", expectKey: "vit_d_125", note: "active form, NOT storage" },
  { name: "Calcitriol", expectKey: "vit_d_125" },

  // ── B12 / folate / homocysteine ─────────────────────────────────────
  { name: "Vitamin B12", expectKey: "b12" },
  { name: "B12", expectKey: "b12" },
  { name: "Cobalamin", expectKey: "b12" },
  { name: "MMA", expectKey: "mma" },
  { name: "Methylmalonic Acid", expectKey: "mma" },
  { name: "Folate, Serum", expectKey: "folate" },
  { name: "Serum Folate", expectKey: "folate" },
  { name: "Folate", expectKey: "folate" },
  { name: "RBC Folate", expectKey: "folate_rbc", note: "must NOT match generic folate" },
  { name: "Folate, RBC", expectKey: "folate_rbc" },
  { name: "Red Cell Folate", expectKey: "folate_rbc" },
  { name: "Homocysteine", expectKey: "homocysteine" },

  // ── Inflammation: CRP vs hs-CRP (overlap trap) ──────────────────────
  { name: "hs-CRP", expectKey: "hscrp" },
  { name: "High-Sensitivity CRP", expectKey: "hscrp" },
  { name: "CRP", expectKey: "crp", note: "regular CRP, not hs" },
  { name: "C-Reactive Protein", expectKey: "crp" },
  { name: "ESR", expectKey: "esr" },
  { name: "Sed Rate", expectKey: "esr" },

  // ── Hormones: testosterone total vs free vs bioavailable ────────────
  { name: "Testosterone, Total", expectKey: "testosterone_total" },
  { name: "Total Testosterone", expectKey: "testosterone_total" },
  { name: "Testosterone", expectKey: "testosterone_total" },
  { name: "Free Testosterone", expectKey: "testosterone_free" },
  { name: "Testosterone, Free", expectKey: "testosterone_free" },
  { name: "Bioavailable Testosterone", expectKey: "testosterone_bio" },
  { name: "Testosterone, Bioavailable", expectKey: "testosterone_bio" },
  { name: "Estradiol", expectKey: "estradiol" },
  { name: "E2", expectKey: "estradiol" },
  { name: "LH", expectKey: "lh" },
  { name: "FSH", expectKey: "fsh" },
  { name: "Prolactin", expectKey: "prolactin" },
  { name: "SHBG", expectKey: "shbg" },
  { name: "DHEA Sulfate", expectKey: "dhea_s" },
  { name: "DHEA-S", expectKey: "dhea_s" },
  { name: "AM Cortisol", expectKey: "cortisol" },
  { name: "Morning Cortisol", expectKey: "cortisol" },
  { name: "AMH", expectKey: "amh" },
  { name: "Anti-Müllerian Hormone", expectKey: "amh" },
  { name: "PSA", expectKey: "psa" },

  // ── Kidney ──────────────────────────────────────────────────────────
  { name: "Creatinine", expectKey: "creatinine" },
  { name: "eGFR", expectKey: "egfr" },
  { name: "Estimated GFR", expectKey: "egfr" },
  { name: "Cystatin C", expectKey: "cystatin_c" },
  { name: "BUN", expectKey: "bun" },
  { name: "Urea Nitrogen", expectKey: "bun" },

  // ── Unknown markers fall through to canonicalize=null ───────────────
  { name: "Some Made Up Test", expectKey: null },
  { name: "Specific Gravity (urine)", expectKey: null },
];

let pass = 0, fail = 0;
const failures: string[] = [];

for (const c of CASES) {
  const result = canonicalize(c.name);
  const got = result?.key ?? null;
  const ok = got === c.expectKey;
  if (ok) pass++;
  else {
    fail++;
    failures.push(`  ❌ "${c.name}"  expected=${c.expectKey}  got=${got}${c.note ? `  (${c.note})` : ''}`);
  }
}

// Also verify canonicalKey() returns a stable slug for unknowns
const unknownSlug = canonicalKey("Some Made Up Test");
const slugOk = unknownSlug === "some_made_up_test";
if (!slugOk) {
  fail++;
  failures.push(`  ❌ canonicalKey fallback expected "some_made_up_test", got "${unknownSlug}"`);
} else pass++;

console.log(`\n======================================================`);
console.log(`  MARKER CANONICAL TEST — ${pass} pass / ${fail} fail`);
console.log(`======================================================`);
if (failures.length) {
  console.log(failures.join('\n'));
  Deno.exit(1);
}
console.log(`  ✅ All canonical mappings and overlap traps clean.`);
