// LAYER 5 — GOLDEN SNAPSHOTS
// ==========================
// Canonical patient fixtures with frozen expected output. Any future
// change that alters the output for a fixture surfaces as a JSON diff.
// Run --update to regenerate snapshots (intentional change).
//
// Pure deterministic. Zero API cost.
//
// Run: deno run -A __tests__/snapshots.ts        — verify
//      deno run -A __tests__/snapshots.ts --update — regenerate

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(marker: string, value: number, unit: string, flag: LabValue['flag'] = 'normal'): LabValue {
  return { marker, value, unit, flag };
}

function make(args: Partial<PatientInput> & { age: number; sex: 'male' | 'female' }): PatientInput {
  const conds = args.conditionsList ?? [];
  const meds = args.medsList ?? [];
  const symps = args.symptomsList ?? [];
  const labs = args.labs ?? [];
  const hCm = args.heightCm ?? 175;
  const wKg = args.weightKg ?? 75;
  return {
    age: args.age, sex: args.sex, heightCm: hCm, weightKg: wKg,
    bmi: args.bmi ?? +(wKg / Math.pow(hCm/100, 2)).toFixed(1),
    conditionsList: conds, conditionsLower: conds.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symps, symptomsLower: symps.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: args.isPregnant ?? false,
    hasShellfishAllergy: false, hasSulfaAllergy: false,
    freeText: '',
  };
}

interface Fixture { name: string; input: PatientInput; }

const FIXTURES: Fixture[] = [
  { name:'asymptomatic_27f', input: make({ age:27, sex:'female',
    labs:[lab('Glucose',90,'mg/dL'),lab('Hemoglobin',13.6,'g/dL'),lab('TSH',2.1,'mIU/L')]
  })},
  { name:'asymptomatic_27m', input: make({ age:27, sex:'male',
    labs:[lab('Glucose',88,'mg/dL'),lab('Hemoglobin',15.2,'g/dL'),lab('TSH',2.0,'mIU/L')]
  })},
  { name:'marisa_baseline_27f_prenatal', input: make({ age:27, sex:'female', isPregnant:true,
    medsList:['prenatal vitamin'],
    conditionsList:['gilbert syndrome'],
    symptomsList:[{name:'Chronic fatigue',severity:4},{name:'Brain fog',severity:4}],
    labs:[lab('TSH',3.02,'mIU/L','watch'),lab('Prolactin',53.4,'ng/mL','high'),
          lab('Estradiol',168,'pg/mL','high'),lab('Cortisol AM',21.3,'µg/dL','high'),
          lab('LDL',91,'mg/dL'),lab('Total Bilirubin',1.8,'mg/dL','high')]
  })},
  { name:'pcos_26f_classic', input: make({ age:26, sex:'female',
    symptomsList:[{name:'Acne',severity:4},{name:'Hirsutism — excess facial or body hair',severity:4},{name:'Irregular periods',severity:4}],
    labs:[lab('Glucose',96,'mg/dL')]
  })},
  { name:'poi_32f', input: make({ age:32, sex:'female',
    symptomsList:[{name:'Hot flashes',severity:4},{name:'Night sweats',severity:4},
                   {name:'Amenorrhea — no period 3+ months',severity:5},{name:'Chronic fatigue',severity:3}],
    labs:[lab('Glucose',90,'mg/dL'),lab('TSH',1.8,'mIU/L')]
  })},
  { name:'perimenopause_47f', input: make({ age:47, sex:'female',
    symptomsList:[{name:'Hot flashes',severity:4},{name:'Waking during night',severity:4},
                   {name:'Mood swings',severity:4},{name:'Irregular periods',severity:3}]
  })},
  { name:'female_androgen_38f', input: make({ age:38, sex:'female',
    symptomsList:[{name:'Low libido',severity:4},{name:'Chronic fatigue',severity:4},{name:'Depression',severity:3}]
  })},
  { name:'male_hyperprolactinemia_28m', input: make({ age:28, sex:'male',
    symptomsList:[{name:'Gynecomastia — male breast tissue',severity:4},{name:'Galactorrhea — breast or nipple discharge',severity:3},{name:'Low libido',severity:4}]
  })},
  { name:'low_t_35m', input: make({ age:35, sex:'male',
    symptomsList:[{name:'Low libido',severity:4},{name:'Erectile dysfunction',severity:3},
                   {name:'Chronic fatigue',severity:5},{name:'Depression',severity:4}]
  })},
  { name:'metabolic_syndrome_45m', input: make({ age:45, sex:'male', weightKg:98,
    symptomsList:[{name:'Chronic fatigue',severity:3},{name:'Weight gain despite diet',severity:4}],
    labs:[lab('Hemoglobin A1c',5.9,'%','watch'),lab('Triglycerides',220,'mg/dL','high'),
          lab('HDL',32,'mg/dL','low'),lab('LDL',145,'mg/dL','high'),lab('Glucose',108,'mg/dL','watch')]
  })},
  { name:'hashimoto_29m', input: make({ age:29, sex:'male',
    symptomsList:[{name:'Chronic fatigue',severity:4},{name:'Brain fog',severity:4},
                   {name:'Cold intolerance',severity:3},{name:'Hair loss — no family history',severity:3}],
    labs:[lab('TSH',7.1,'mIU/L','high')]
  })},
  { name:'graves_40m', input: make({ age:40, sex:'male',
    symptomsList:[{name:'Heat intolerance',severity:4},{name:'Heart palpitations',severity:4},
                   {name:'Anxiety',severity:4},{name:'Unexplained weight loss',severity:4}],
    labs:[lab('TSH',0.05,'mIU/L','low')]
  })},
  { name:'hepatic_stress_34m_alcohol', input: make({ age:34, sex:'male',
    symptomsList:[{name:'Chronic fatigue',severity:3},{name:'Acid reflux',severity:3}],
    labs:[lab('GGT',125,'U/L','high'),lab('ALT',82,'U/L','high'),lab('AST',95,'U/L','high'),lab('MCV',103,'fL','high')]
  })},
  { name:'ibd_concern_33m', input: make({ age:33, sex:'male', weightKg:65,
    symptomsList:[{name:'Diarrhea',severity:4},{name:'Abdominal pain',severity:4},
                   {name:'Unexplained weight loss',severity:4},{name:'Chronic fatigue',severity:4}],
    labs:[lab('Ferritin',12,'ng/mL','low'),lab('Albumin',3.2,'g/dL','low')]
  })},
  { name:'autonomic_pots_38m', input: make({ age:38, sex:'male',
    symptomsList:[{name:'Chronic fatigue',severity:5},{name:'Brain fog',severity:5},
                   {name:'Heart palpitations',severity:3},{name:'Reduced exercise tolerance',severity:5},
                   {name:'Dizziness on standing',severity:3}],
    labs:[lab('Vitamin D 25-hydroxy',18,'ng/mL','low')]
  })},
  { name:'chronic_steroid_60m', input: make({ age:60, sex:'male',
    conditionsList:['rheumatoid arthritis'], medsList:['prednisone 10mg daily','methotrexate 15mg weekly'],
    symptomsList:[{name:'Joint pain',severity:3},{name:'Joint stiffness',severity:3}]
  })},
  { name:'osteoporosis_dx_63m', input: make({ age:63, sex:'male',
    conditionsList:['osteoporosis','fragility fracture history']
  })},
  { name:'t2d_metformin_65m', input: make({ age:65, sex:'male', weightKg:88,
    conditionsList:['type 2 diabetes','hypertension'],
    medsList:['metformin 1000mg BID','lisinopril 20mg'],
    labs:[lab('Hemoglobin A1c',7.4,'%','high'),lab('Glucose',142,'mg/dL','high')]
  })},
  { name:'statin_user_37m', input: make({ age:37, sex:'male',
    medsList:['atorvastatin 40mg daily'],
    symptomsList:[{name:'Muscle pain',severity:3}]
  })},
  { name:'vegan_25m_b12_low', input: make({ age:25, sex:'male', weightKg:70,
    conditionsList:['vegan diet'],
    symptomsList:[{name:'Chronic fatigue',severity:4},{name:'Brain fog',severity:4}],
    labs:[lab('B12',165,'pg/mL','low'),lab('MCV',104,'fL','high'),lab('Hemoglobin',13.0,'g/dL','low')]
  })},
];

// Snapshot shape — pick the deterministic clinical decisions.
// AI prose is excluded since it's downstream and not in this layer.
function snapshot(plan: ReturnType<typeof buildPlan>) {
  return {
    tests: plan.tests.map(t => ({ name:t.name, icd10:t.icd10, priority:(t as any).priority })),
    conditions: plan.conditions.map(c => ({ name:c.name, icd10:c.icd10, confidence:c.confidence })),
    supplements: plan.supplementCandidates.map(s => s.nutrient),
    depletions: plan.depletions.map(d => ({ medClass:d.medClass, nutrient:d.nutrient })),
    emergencyAlertCount: plan.emergencyAlerts.length,
    expectedFindings: plan.expectedFindings.map(e => ({ key:e.key, marker:e.marker })),
  };
}

const SNAPSHOT_DIR = new URL('./snapshots/', import.meta.url);
const update = Deno.args.includes('--update');

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  LAYER 5 — GOLDEN SNAPSHOTS ${update ? '(UPDATE MODE)' : ''}`);
console.log(`══════════════════════════════════════════════════════════════\n`);

let passed = 0, failed = 0, created = 0;
const diffs: Array<{ fixture: string; expected: string; actual: string }> = [];

for (const f of FIXTURES) {
  const actual = snapshot(buildPlan(f.input));
  const actualJson = JSON.stringify(actual, null, 2);
  const path = new URL(`${f.name}.json`, SNAPSHOT_DIR);

  let expected: string | null = null;
  try { expected = await Deno.readTextFile(path); } catch { expected = null; }

  if (update || expected === null) {
    await Deno.writeTextFile(path, actualJson);
    console.log(`  ${expected === null ? '✚ CREATED' : '↻ UPDATED'} ${f.name}`);
    created++;
    continue;
  }

  if (expected.trim() === actualJson.trim()) {
    passed++;
  } else {
    failed++;
    diffs.push({ fixture: f.name, expected, actual: actualJson });
    console.log(`  ❌ ${f.name}`);
  }
}

console.log(`\n${passed} passed | ${failed} failed | ${created} created/updated\n`);

if (diffs.length) {
  for (const d of diffs.slice(0, 3)) {
    console.log(`──── DIFF: ${d.fixture} ────`);
    const expectedLines = d.expected.split('\n');
    const actualLines = d.actual.split('\n');
    const maxLen = Math.max(expectedLines.length, actualLines.length);
    let shown = 0;
    for (let i = 0; i < maxLen && shown < 12; i++) {
      if (expectedLines[i] !== actualLines[i]) {
        console.log(`  L${i+1}  - ${expectedLines[i] ?? ''}`);
        console.log(`  L${i+1}  + ${actualLines[i] ?? ''}`);
        shown++;
      }
    }
    console.log('');
  }
  console.log(`\nTo accept all changes:  deno run -A __tests__/snapshots.ts --update\n`);
  Deno.exit(1);
} else {
  console.log(`✅ ALL ${passed} SNAPSHOTS PASS`);
  Deno.exit(0);
}
