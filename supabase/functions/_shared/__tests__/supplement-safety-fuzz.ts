// SUPPLEMENT SAFETY FUZZER
// ========================
// Universal property-based test: NEVER recommend a repletion supplement
// when the corresponding measured marker is HIGH or CRITICAL_HIGH.
//
// Real-case origin: Angel (real user) had Vit D 104.2 ng/mL (high) and
// the engine still recommended Vitamin D3 1000 IU/day. Stacking
// fat-soluble vitamins or minerals on top of an elevated baseline drives
// real toxicity (hypercalcemia, iron overload, zinc-induced copper
// deficiency, hypermagnesemia in CKD, hypervitaminosis A/E/K).
//
// This audit closes the entire CLASS of bug — not one supplement at a
// time. For every nutrient-repletion supplement in SUPPLEMENT_BASE that
// has a marker mapping, generate a synthetic patient where that marker
// is measured HIGH, run buildPlan, and assert the supplement is dropped.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";
import { SUPPLEMENT_BASE } from "../rules/supplementIndications.ts";

// Mirror of the NUTRIENT_MARKER_PATTERNS in supplementIndications.ts.
// We use canonical marker names (the strings the engine sees from
// extract-labs / user input) so the test exercises the real lookup path.
// Each entry: supplement-key regex → (test marker name + unit + high value
// well above lab upper limit).
const SUPPLEMENT_MARKER_FIXTURES: Array<{
  supplementKeyRegex: RegExp;
  fixture: { marker: string; unit: string; highValue: number };
  notes?: string;
}> = [
  // Fat-soluble vitamins — highest toxicity risk
  { supplementKeyRegex: /^(vit_d3_1000|vit_d3_4000)$/, fixture: { marker: '25-Hydroxy, Vitamin D', unit: 'ng/mL', highValue: 110 }, notes: 'Vit D toxicity → hypercalcemia' },
  { supplementKeyRegex: /^vit_e_/, fixture: { marker: 'Vitamin E', unit: 'mg/L', highValue: 25 }, notes: 'Vit E excess → bleeding risk' },

  // B-vitamins — water-soluble but methylated forms can cause adverse effects
  { supplementKeyRegex: /^vit_b12_methyl$/, fixture: { marker: 'Vitamin B12', unit: 'pg/mL', highValue: 1500 }, notes: 'High B12 may mask underlying pathology' },
  { supplementKeyRegex: /^methylfolate$/, fixture: { marker: 'Serum Folate', unit: 'ng/mL', highValue: 25 }, notes: 'Excess folate can mask B12 deficiency neuro effects' },
  { supplementKeyRegex: /^vit_b6_p5p$/, fixture: { marker: 'Vitamin B6', unit: 'nmol/L', highValue: 250 }, notes: 'B6 toxicity → peripheral neuropathy' },
  { supplementKeyRegex: /^riboflavin_b2$/, fixture: { marker: 'Riboflavin', unit: 'nmol/L', highValue: 50 } },

  // Minerals — meaningful toxicity profiles
  { supplementKeyRegex: /^iron_bisglycinate$/, fixture: { marker: 'Ferritin', unit: 'ng/mL', highValue: 450 }, notes: 'Iron overload → hemochromatosis, liver, joint, cardiac toxicity' },
  { supplementKeyRegex: /^mg_/, fixture: { marker: 'Magnesium', unit: 'mg/dL', highValue: 3.0 }, notes: 'Hypermagnesemia → cardiac conduction in CKD' },
  { supplementKeyRegex: /^selenium/, fixture: { marker: 'Selenium', unit: 'µg/L', highValue: 220 }, notes: 'Selenosis → hair/nail loss, GI, neurotoxicity' },
  { supplementKeyRegex: /^zinc/, fixture: { marker: 'Zinc', unit: 'µg/dL', highValue: 165 }, notes: 'Zinc excess → copper deficiency, neuropathy' },
  { supplementKeyRegex: /^biotin/, fixture: { marker: 'Biotin', unit: 'ng/mL', highValue: 15 }, notes: 'Biotin interferes with thyroid + cardiac immunoassays' },
];

function lab(marker: string, value: number, unit: string, flag: LabValue['flag'] = 'high'): LabValue {
  return { marker, value, unit, flag };
}

function makePatient(highMarkerLab: LabValue, extras?: Partial<PatientInput>): PatientInput {
  const labs = [highMarkerLab];
  return {
    age: 40, sex: 'female', heightCm: 165, weightKg: 65, bmi: 23.9,
    conditionsList: [], conditionsLower: '',
    medsList: [], medsLower: '',
    symptomsList: [], symptomsLower: '',
    supplementsList: [], supplementsLower: '',
    labs,
    labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
    ...extras,
  };
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  SUPPLEMENT SAFETY FUZZER — universal "never supplement what\'s high" rule');
console.log('  Generates synthetic patients with each repletion-marker measured HIGH,');
console.log('  then asserts the corresponding supplement is NOT recommended.');
console.log('══════════════════════════════════════════════════════════════\n');

let totalSupplementsChecked = 0;
let totalViolations = 0;
const violations: Array<{ supplementKey: string; nutrient: string; marker: string; reason: string }> = [];

// Iterate every supplement in SUPPLEMENT_BASE that maps to a marker
for (const [supplementKey, base] of Object.entries(SUPPLEMENT_BASE)) {
  const fixture = SUPPLEMENT_MARKER_FIXTURES.find(f => f.supplementKeyRegex.test(supplementKey));
  if (!fixture) continue; // not a marker-tied repletion supplement
  totalSupplementsChecked++;

  // Build a patient whose only abnormality is THIS marker measured high.
  // Use 'high' flag and a value well above lab reference. The engine's
  // measured-normal suppression should drop the corresponding supplement
  // (after the 2026-05-13-50 fix that extended suppression to [high]).
  const patient = makePatient(lab(fixture.fixture.marker, fixture.fixture.highValue, fixture.fixture.unit, 'high'));
  // Run a few realistic variations to stress the path:
  //   1) lab alone (no symptoms, no conditions)
  //   2) lab + symptom that historically triggered this supplement empirically
  //   3) lab + condition that historically triggered this supplement
  // The engine MUST never recommend this supplement regardless of the
  // empirical pathway, because the lab clearly says NOT deficient.
  const variations: PatientInput[] = [
    patient,
    { ...patient, symptomsList: [{ name: 'Chronic fatigue', severity: 5 }, { name: 'Brain fog', severity: 5 }], symptomsLower: 'chronic fatigue brain fog' },
    { ...patient, conditionsList: ['Hashimoto', 'IBD'], conditionsLower: 'hashimoto ibd' },
  ];

  for (let i = 0; i < variations.length; i++) {
    const v = variations[i];
    const plan = buildPlan(v);
    const recommended = plan.supplementCandidates.find(c => c.key === supplementKey);
    if (recommended) {
      totalViolations++;
      violations.push({
        supplementKey,
        nutrient: base.nutrient,
        marker: fixture.fixture.marker,
        reason: `Variation #${i + 1}: marker ${fixture.fixture.marker}=${fixture.fixture.highValue} ${fixture.fixture.unit} [high] still triggered ${supplementKey}. Sourced from: ${recommended.sourcedFrom}.${fixture.notes ? ` Risk: ${fixture.notes}.` : ''}`,
      });
    }
  }
}

console.log(`Total marker-tied repletion supplements checked: ${totalSupplementsChecked}`);
console.log(`Variations per supplement: 3 (lab alone, +symptoms, +conditions)`);
console.log(`Total assertions: ${totalSupplementsChecked * 3}`);
console.log(`Violations: ${totalViolations}\n`);

if (totalViolations > 0) {
  console.log('🚨 UNSAFE SUPPLEMENT RECOMMENDATIONS:');
  for (const v of violations) {
    console.log(`  • ${v.nutrient} (${v.supplementKey})`);
    console.log(`      ${v.reason}`);
  }
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`❌ ${totalViolations} unsafe supplement recommendations — fix measured-normal suppression`);
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(1);
} else {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('✅ All repletion supplements correctly suppressed when marker is HIGH');
  console.log('══════════════════════════════════════════════════════════════');
  Deno.exit(0);
}
