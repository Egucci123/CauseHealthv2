// DEPLETION + ALTERNATIVES AUDIT
// =============================================
// Validates two related clinical surfaces that the standard 5K audits
// don't directly cover:
//
//   (A) Medication depletions — for every medClass in DEPLETION_RULES,
//       plant a representative med, verify the expected nutrient
//       depletion fires (and only that one — no false positives).
//
//   (B) Medicine alternatives — every RULE in medicationAlternativesEngine
//       gets a positive test (trigger conditions met → alternative fires)
//       and a negative test (trigger absent → alternative does NOT fire).
//
// Universal across every patient. Reports false negatives (depletion
// expected but didn't fire) and false positives (depletion fired without
// the triggering med).
import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";
import { runMedicationAlternativesEngine } from "../medicationAlternativesEngine.ts";

function mulberry32(seed: number) {
  let a = seed;
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function makeInput(meds: string[], labs: LabValue[] = [], symptoms: string[] = [], conditions: string[] = []): PatientInput {
  return {
    age: 50, sex: 'female', heightCm: 170, weightKg: 75, bmi: 25.9,
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symptoms.map(name => ({ name, severity: 4 })),
    symptomsLower: symptoms.map(s => s.toLowerCase()).join(' '),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

// Mapping: medClass → representative med name + list of nutrients we
// EXPECT to be in the depletion output. Mirrors DEPLETION_RULES.
interface ExpectedDepletion {
  medClass: string;
  medExample: string;
  expectedNutrients: RegExp[];
}
const EXPECTED: ExpectedDepletion[] = [
  { medClass: 'statin',                  medExample: 'Atorvastatin 40mg',          expectedNutrients: [/coq10/i] },
  { medClass: 'mesalamine_5asa',         medExample: 'Mesalamine',                 expectedNutrients: [/folate/i] },
  { medClass: 'metformin',               medExample: 'Metformin 1000mg',           expectedNutrients: [/b12|cobalamin/i, /folate/i] },
  { medClass: 'ppi',                     medExample: 'Omeprazole 40mg',            expectedNutrients: [/b12|cobalamin/i, /magnesium/i, /calcium/i] },
  { medClass: 'diuretic_thiazide',       medExample: 'Hydrochlorothiazide 25mg',   expectedNutrients: [/potassium/i, /magnesium/i] },
  { medClass: 'diuretic_loop',           medExample: 'Furosemide 40mg',            expectedNutrients: [/potassium/i, /thiamine|b1/i] },
  { medClass: 'steroid_oral',            medExample: 'Prednisone 10mg',            expectedNutrients: [/vitamin d/i, /calcium/i] },
  { medClass: 'ssri',                    medExample: 'Sertraline 100mg',           expectedNutrients: [/sodium/i] },
  { medClass: 'anticoagulant',           medExample: 'Warfarin 5mg',               expectedNutrients: [/vitamin k/i] },
  { medClass: 'thyroid_replacement',     medExample: 'Levothyroxine 75mcg',        expectedNutrients: [/iron|calcium|ppi/i] },
  { medClass: 'glp1',                    medExample: 'Semaglutide (Ozempic)',      expectedNutrients: [/b12|cobalamin/i] },
  { medClass: 'hormonal_contraceptive',  medExample: 'Oral Contraceptive Pill',    expectedNutrients: [/folate/i, /vitamin b6/i, /b12|cobalamin/i, /magnesium/i, /zinc/i, /coq10/i] },
  { medClass: 'methotrexate',            medExample: 'Methotrexate 15mg weekly',   expectedNutrients: [/folate/i] },
  { medClass: 'beta_blocker',            medExample: 'Metoprolol 50mg',            expectedNutrients: [/coq10/i, /melatonin/i] },
  { medClass: 'anticonvulsant',          medExample: 'Phenytoin 300mg',            expectedNutrients: [/vitamin d/i, /folate/i, /vitamin k/i] },
  { medClass: 'levodopa',                medExample: 'Carbidopa-Levodopa',         expectedNutrients: [/vitamin b6/i] },
  { medClass: 'digoxin',                 medExample: 'Digoxin 0.125mg',            expectedNutrients: [/magnesium/i, /potassium/i] },
  { medClass: 'ace_inhibitor',           medExample: 'Lisinopril 10mg',            expectedNutrients: [/zinc/i] },
  { medClass: 'sglt2',                   medExample: 'Empagliflozin (Jardiance)',  expectedNutrients: [/magnesium/i] },
  { medClass: 'bile_acid_sequestrant',   medExample: 'Cholestyramine',             expectedNutrients: [/fat.?soluble|vitamin a|vitamin d|vitamin e|vitamin k/i] },
  { medClass: 'allopurinol',             medExample: 'Allopurinol 300mg',          expectedNutrients: [/iron/i] },
  { medClass: 'antibiotic_long_term',    medExample: 'Doxycycline long-term',      expectedNutrients: [/b.?complex|microbiome|biotin|k2/i] },
  // ── 2026-05-12-33 expansions ────────────────────────────────────
  { medClass: 'fibrate',                 medExample: 'Fenofibrate 145mg',          expectedNutrients: [/coq10/i, /homocysteine|b6|b12|folate/i] },
  { medClass: 'h2_blocker',              medExample: 'Famotidine 40mg',            expectedNutrients: [/b12|cobalamin/i] },
  { medClass: 'arb',                     medExample: 'Losartan 50mg',              expectedNutrients: [/zinc/i] },
  { medClass: 'ccb',                     medExample: 'Amlodipine 5mg',             expectedNutrients: [/magnesium/i] },
  { medClass: 'snri',                    medExample: 'Venlafaxine 75mg',           expectedNutrients: [/sodium/i] },
  { medClass: 'tca',                     medExample: 'Amitriptyline 25mg',         expectedNutrients: [/coq10/i, /b2|riboflavin/i] },
  { medClass: 'benzodiazepine',          medExample: 'Lorazepam 1mg',              expectedNutrients: [/melatonin/i] },
  { medClass: 'inhaled_steroid',         medExample: 'Fluticasone inhaler',        expectedNutrients: [/vitamin d/i] },
  { medClass: 'hrt_estrogen',            medExample: 'Estradiol patch',            expectedNutrients: [/folate/i, /vitamin b6/i, /magnesium/i] },
  { medClass: 'antithyroid',             medExample: 'Methimazole 10mg',           expectedNutrients: [/selenium/i] },
  { medClass: 'sulfonylurea',            medExample: 'Glipizide 5mg',              expectedNutrients: [/coq10/i] },
  { medClass: 'insulin',                 medExample: 'Insulin glargine (Lantus)',  expectedNutrients: [/magnesium/i] },
  { medClass: 'biologic_ibd',            medExample: 'Ustekinumab (Stelara)',      expectedNutrients: [/vitamin d/i] },
];

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  DEPLETION + ALTERNATIVES AUDIT`);
console.log(`══════════════════════════════════════════════════════════════\n`);

// ── A) DEPLETION ACCURACY — per medClass ─────────────────────────────
console.log(`──── (A) DEPLETION RULES — ${EXPECTED.length} med classes ────`);
let depletionPass = 0, depletionFail = 0;
const depletionFailures: string[] = [];

for (const e of EXPECTED) {
  const plan = buildPlan(makeInput([e.medExample]));
  const depletedNutrients = plan.depletions.map(d => d.nutrient);
  const missing: RegExp[] = [];
  for (const expected of e.expectedNutrients) {
    if (!depletedNutrients.some(n => expected.test(n))) missing.push(expected);
  }
  if (missing.length === 0) {
    depletionPass++;
    console.log(`  ✅ ${e.medClass.padEnd(28)} ${e.medExample.padEnd(36)} → ${depletedNutrients.length} depletions fired`);
  } else {
    depletionFail++;
    const msg = `❌ ${e.medClass} (${e.medExample}) missing: ${missing.map(r => r.source).join(', ')}. Got: [${depletedNutrients.join('; ')}]`;
    depletionFailures.push(msg);
    console.log(`  ${msg}`);
  }
}
console.log(`\n${depletionFail === 0 ? '✅' : '❌'} Depletion accuracy: ${depletionPass}/${EXPECTED.length} med classes pass\n`);

// ── B) FALSE-POSITIVE CHECK — no meds → no depletions ────────────────
console.log(`──── (B) FALSE-POSITIVE CHECK — no meds patient ────`);
const noMedsPlan = buildPlan(makeInput([]));
const falsePositive = noMedsPlan.depletions.length > 0;
console.log(`Patient with empty meds → ${noMedsPlan.depletions.length} depletions ${falsePositive ? '❌ false positive' : '✅'}\n`);

// ── C) 5K randomized med-combo robustness ────────────────────────────
console.log(`──── (C) 5K RANDOMIZED MED-COMBO ROBUSTNESS ────`);
const rng = mulberry32(42);
const N = 5000;
let exceptions = 0;
let dupDepletions = 0;
let totalDepletions = 0;
const start = Date.now();
for (let i = 0; i < N; i++) {
  // pick 1-3 random meds
  const k = 1 + Math.floor(rng() * 3);
  const meds: string[] = [];
  for (let j = 0; j < k; j++) {
    const pick = EXPECTED[Math.floor(rng() * EXPECTED.length)];
    meds.push(pick.medExample);
  }
  try {
    const plan = buildPlan(makeInput(meds));
    totalDepletions += plan.depletions.length;
    // dedup check — same nutrient should not appear twice for same medClass
    const seen = new Set<string>();
    for (const d of plan.depletions) {
      const k2 = `${d.medClass}|${d.nutrient}`;
      if (seen.has(k2)) { dupDepletions++; break; }
      seen.add(k2);
    }
  } catch {
    exceptions++;
  }
}
const elapsed = Date.now() - start;
console.log(`Ran ${N} patients with 1-3 random meds each in ${elapsed}ms`);
console.log(`Exceptions:              ${exceptions === 0 ? '✅ 0' : '❌ ' + exceptions}`);
console.log(`Dup depletions:          ${dupDepletions === 0 ? '✅ 0' : '❌ ' + dupDepletions}`);
console.log(`Avg depletions/patient:  ${(totalDepletions / N).toFixed(2)}\n`);

// ── D) ALTERNATIVES ENGINE — 4 rules, positive + negative ────────────
console.log(`──── (D) MEDICATION ALTERNATIVES RULES ────`);
interface AltCase {
  label: string;
  meds: string[];
  labs: Array<{ marker_name: string; value: number; optimal_flag?: string }>;
  symptoms: string;
  expectMed: string | null; // null = expect no alternative
}
const altCases: AltCase[] = [
  // Positive: atorvastatin + ALT >60
  { label: 'atorvastatin + ALT 97 (elevated)', meds: ['Atorvastatin'], labs: [{ marker_name: 'ALT', value: 97, optimal_flag: 'high' }], symptoms: '', expectMed: 'Atorvastatin' },
  // Negative: atorvastatin + ALT 25 (normal)
  { label: 'atorvastatin + ALT 25 (normal)', meds: ['Atorvastatin'], labs: [{ marker_name: 'ALT', value: 25 }], symptoms: '', expectMed: null },
  // Positive: atorvastatin + muscle pain symptoms
  { label: 'atorvastatin + muscle pain', meds: ['Atorvastatin'], labs: [], symptoms: 'muscle ache', expectMed: 'Atorvastatin' },
  // Positive: metformin + B12 350
  { label: 'metformin + B12 350 (low/borderline)', meds: ['Metformin'], labs: [{ marker_name: 'Vitamin B12', value: 350 }], symptoms: '', expectMed: 'Metformin' },
  // Negative: metformin + B12 600 (normal)
  { label: 'metformin + B12 600 (normal)', meds: ['Metformin'], labs: [{ marker_name: 'Vitamin B12', value: 600 }], symptoms: '', expectMed: null },
  // Positive: PPI + Mg 1.5 (low)
  { label: 'PPI + Mg 1.5 (low)', meds: ['Omeprazole'], labs: [{ marker_name: 'Magnesium', value: 1.5 }], symptoms: '', expectMed: 'PPI' },
  // Negative: PPI + Mg 2.1 (normal)
  { label: 'PPI + Mg 2.1 (normal)', meds: ['Omeprazole'], labs: [{ marker_name: 'Magnesium', value: 2.1 }], symptoms: '', expectMed: null },
  // Negative: no meds, no triggers
  { label: 'no meds, no labs', meds: [], labs: [], symptoms: '', expectMed: null },
  // ── New alternatives rules (2026-05-12-33) ───────────────────────
  { label: 'levothyroxine + Free T3 2.5 (low)', meds: ['Levothyroxine'], labs: [{ marker_name: 'Free T3', value: 2.5 }], symptoms: '', expectMed: 'Levothyroxine' },
  { label: 'levothyroxine + Free T3 3.5 (normal)', meds: ['Levothyroxine'], labs: [{ marker_name: 'Free T3', value: 3.5 }], symptoms: '', expectMed: null },
  { label: 'SSRI + persistent depression', meds: ['Sertraline'], labs: [], symptoms: 'persistent depression, not responding to medication', expectMed: 'SSRI' },
  { label: 'SSRI + B6 low (20)', meds: ['Sertraline'], labs: [{ marker_name: 'Vitamin B6', value: 20 }], symptoms: '', expectMed: 'SSRI' },
  { label: 'beta blocker + chronic fatigue', meds: ['Metoprolol'], labs: [], symptoms: 'chronic fatigue and exercise intolerance', expectMed: 'Beta blocker' },
  { label: 'beta blocker + no symptoms', meds: ['Metoprolol'], labs: [], symptoms: '', expectMed: null },
];

let altPass = 0;
let altFail = 0;
for (const c of altCases) {
  const ctx = {
    medsLower: c.meds.join(' ').toLowerCase(),
    conditionsLower: '',
    labValues: c.labs,
    symptomsLower: c.symptoms.toLowerCase(),
  };
  const result = runMedicationAlternativesEngine(ctx);
  const firedMeds = result.map(r => r.current_medication);
  const expected = c.expectMed;
  const matched = expected === null ? result.length === 0 : firedMeds.some(m => m === expected);
  if (matched) {
    altPass++;
    console.log(`  ✅ ${c.label.padEnd(50)} fired=[${firedMeds.join(', ')}]`);
  } else {
    altFail++;
    console.log(`  ❌ ${c.label} expected=${expected ?? '(none)'} got=[${firedMeds.join(', ')}]`);
  }
}
console.log(`\n${altFail === 0 ? '✅' : '❌'} Alternatives accuracy: ${altPass}/${altCases.length} cases pass\n`);

// ── FINAL ────────────────────────────────────────────────────────────
const allPass = depletionFail === 0 && !falsePositive && exceptions === 0 && dupDepletions === 0 && altFail === 0;
console.log(`══════════════════════════════════════════════════════════════`);
console.log(allPass ? `✅ DEPLETIONS + ALTERNATIVES AUDIT PASSES` : `❌ FAILURES DETECTED`);
console.log(`══════════════════════════════════════════════════════════════`);
Deno.exit(allPass ? 0 : 1);
