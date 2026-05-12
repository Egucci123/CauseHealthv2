// FULL ENGINE AUDIT — TESTS + PATTERNS + SUPPLEMENTS + WELLNESS PLAN
// ===================================================================
// One canonical patient per disease pattern. For each, dumps EVERY
// engine output dimension so we can visually verify clinical correctness.
//
// Covers 18 archetypes:
//   • Healthy (baseline)
//   • 12 underlying disease patterns
//   • 5 cross-system / complex presentations
//
// Pure deterministic. Zero API cost.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}

function mk(args: {
  label: string; age: number; sex: 'male'|'female';
  conditions?: string[]; meds?: string[]; symptoms?: string[];
  labs?: LabValue[]; bmi?: number;
}): { label: string; input: PatientInput } {
  const bmi = args.bmi ?? 24;
  const heightCm = 170;
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  const symps = (args.symptoms ?? []).map(name => ({ name, severity: 4 }));
  const labs = args.labs ?? [];
  const conds = args.conditions ?? [];
  const meds = args.meds ?? [];
  return {
    label: args.label,
    input: {
      age: args.age, sex: args.sex, heightCm, weightKg, bmi,
      conditionsList: conds, conditionsLower: conds.join(' ').toLowerCase(),
      medsList: meds, medsLower: meds.join(' ').toLowerCase(),
      symptomsList: symps,
      symptomsLower: symps.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
      supplementsList: [], supplementsLower: '',
      labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
      isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
      freeText: '',
    },
  };
}

const ARCHETYPES = [
  mk({ label:'HEALTHY 35M no signal', age:35, sex:'male' }),

  mk({ label:'HEMOCHROMATOSIS 52M ferritin 850 + TSat 62%', age:52, sex:'male',
    symptoms:['Joint pain'],
    labs:[lab('Ferritin',850,'ng/mL','high'),lab('Transferrin Saturation',62,'%','high'),
          lab('Iron',195,'µg/dL','high'),lab('ALT',62,'U/L','high')] }),

  mk({ label:'PREDIABETES + DYSLIPIDEMIA 48M', age:48, sex:'male', bmi:30,
    labs:[lab('Hemoglobin A1c',6.0,'%','watch'),lab('Glucose',108,'mg/dL','watch'),
          lab('Triglycerides',195,'mg/dL','high'),lab('HDL',34,'mg/dL','low'),
          lab('LDL',148,'mg/dL','high')] }),

  mk({ label:'HASHIMOTO subclinical 42F TSH 6.8', age:42, sex:'female',
    symptoms:['Chronic fatigue','Brain fog','Hair loss — no family history','Cold intolerance'],
    labs:[lab('TSH',6.8,'mIU/L','high')] }),

  mk({ label:'GRAVES 38F TSH 0.04 + hyperthyroid sx', age:38, sex:'female',
    symptoms:['Heat intolerance','Heart palpitations','Anxiety','Unexplained weight loss'],
    labs:[lab('TSH',0.04,'mIU/L','low')] }),

  mk({ label:'NAFLD 45M ALT 88 + TG 245 + A1c watch', age:45, sex:'male', bmi:32,
    labs:[lab('ALT',88,'U/L','high'),lab('AST',62,'U/L','high'),
          lab('Triglycerides',245,'mg/dL','high'),lab('Hemoglobin A1c',5.8,'%','watch')] }),

  mk({ label:'CUSHING 44F cortisol 28 + body changes + HTN/DM', age:44, sex:'female', bmi:32,
    conditions:['hypertension','type 2 diabetes','osteoporosis'],
    symptoms:['Weight gain despite diet','Muscle weakness'],
    labs:[lab('Cortisol - AM',28,'µg/dL','high'),lab('Glucose',135,'mg/dL','high')] }),

  mk({ label:'HYPERCHOLESTEROLEMIA 52M LDL 178 + ApoB 132', age:52, sex:'male',
    labs:[lab('Total Cholesterol',265,'mg/dL','high'),lab('LDL',178,'mg/dL','high'),
          lab('ApoB',132,'mg/dL','high'),lab('HDL',42,'mg/dL')] }),

  mk({ label:'IRON DEFICIENCY ANEMIA 46F heavy periods', age:46, sex:'female',
    symptoms:['Heavy periods','Chronic fatigue','Restless legs'],
    labs:[lab('Hemoglobin',9.8,'g/dL','low'),lab('Ferritin',6,'ng/mL','low'),
          lab('MCV',72,'fL','low')] }),

  mk({ label:'B12 DEFICIENCY 70M vegan + macrocytic', age:70, sex:'male',
    conditions:['vegan diet'],
    symptoms:['Chronic fatigue','Brain fog','Tingling'],
    labs:[lab('B12',155,'pg/mL','low'),lab('MCV',106,'fL','high'),
          lab('Hemoglobin',12.4,'g/dL','low')] }),

  mk({ label:'CKD stage 3b 68M creat 1.9 + eGFR 38', age:68, sex:'male',
    conditions:['hypertension'],
    labs:[lab('Creatinine',1.9,'mg/dL','high'),lab('eGFR',38,'mL/min','low'),
          lab('BUN',38,'mg/dL','high')] }),

  mk({ label:'LIVER ACUTE 48M ALT 285 + AST 165 + Bili 2.4', age:48, sex:'male', bmi:28,
    symptoms:['Acid reflux','Chronic fatigue'],
    labs:[lab('ALT',285,'U/L','critical_high'),lab('AST',165,'U/L','high'),
          lab('Total Bilirubin',2.4,'mg/dL','high'),lab('GGT',195,'U/L','high')] }),

  mk({ label:'HEMOCONCENTRATION (dehydration) 30M athletic', age:30, sex:'male',
    labs:[lab('Albumin',5.1,'g/dL','high'),lab('Hemoglobin',17.5,'g/dL','high'),
          lab('Hematocrit',52,'%','high'),lab('RBC',5.95,'M/µL','high')] }),

  mk({ label:'PCOS 26F acne + hirsutism + irregular', age:26, sex:'female',
    symptoms:['Acne','Hirsutism — excess facial or body hair','Irregular periods'] }),

  mk({ label:'POI 32F hot flashes + amenorrhea', age:32, sex:'female',
    symptoms:['Hot flashes','Night sweats','Amenorrhea — no period 3+ months'] }),

  mk({ label:'METFORMIN T2D 64M on multiple meds', age:64, sex:'male',
    conditions:['type 2 diabetes','hypertension'],
    meds:['metformin 1000mg BID','lisinopril 20mg','atorvastatin 40mg'],
    labs:[lab('Hemoglobin A1c',7.4,'%','high'),lab('Glucose',158,'mg/dL','high')] }),

  mk({ label:'POLYPHARMACY 78F on 8 meds', age:78, sex:'female',
    conditions:['type 2 diabetes','hypertension','atrial fibrillation','osteoporosis'],
    meds:['metformin','insulin','warfarin','atorvastatin','metoprolol','furosemide',
          'alendronate','omeprazole 40mg'] }),

  mk({ label:'PREGNANT 1st trimester 28F + Gilbert', age:28, sex:'female',
    conditions:['gilbert syndrome','pregnant'],
    meds:['prenatal vitamin'],
    symptoms:['Chronic fatigue','Nausea'],
    labs:[lab('Total Bilirubin',1.8,'mg/dL','high'),lab('Hemoglobin',11.8,'g/dL','low')] }),
];

function fmt(s: string, w: number) { return s.padEnd(w).slice(0, w); }

for (const { label, input } of ARCHETYPES) {
  const plan = buildPlan(input);
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${label}`);
  console.log(`  ${input.age}${input.sex==='male'?'M':'F'}  bmi ${input.bmi}  | ${input.conditionsList.length} conds  ${input.medsList.length} meds  ${input.symptomsList.length} sx  ${input.labs.length} labs`);
  console.log('═'.repeat(80));

  // Headline + Summary
  const cp = plan.canonicalProse;
  if (plan.conditions.length) console.log(`\nPATTERNS (${plan.conditions.length}):`);
  for (const c of plan.conditions) console.log(`  • ${c.name} [${c.icd10}] ${c.confidence}`);

  // Tests grouped by tier
  const byTier: Record<string, string[]> = {};
  for (const t of plan.tests) {
    const tier = (t as any).tier ?? 'pattern';
    if (!byTier[tier]) byTier[tier] = [];
    byTier[tier].push(t.name);
  }
  console.log(`\nTESTS (${plan.tests.length}):`);
  for (const tier of ['baseline','preventive','pattern','specialist','imaging']) {
    if (byTier[tier]) {
      console.log(`  [${tier}] (${byTier[tier].length})`);
      for (const n of byTier[tier]) console.log(`    • ${n}`);
    }
  }

  // Supplements
  if (plan.supplementCandidates.length) {
    console.log(`\nSUPPLEMENTS (${plan.supplementCandidates.length}):`);
    for (const s of plan.supplementCandidates) {
      console.log(`  • ${s.nutrient}  [${s.category}]  ${s.priority}/${s.sourcedFrom}`);
    }
  }

  // Depletions
  if (plan.depletions.length) {
    console.log(`\nDEPLETIONS (${plan.depletions.length}):`);
    for (const d of plan.depletions) console.log(`  • ${d.medClass} → ${d.nutrient} (sev=${d.severity})`);
  }

  // Lab outliers
  const outliers = plan.labs.outliers.filter(o => o.flag !== 'normal');
  if (outliers.length) {
    console.log(`\nLAB OUTLIERS (${outliers.length}):`);
    for (const o of outliers.slice(0, 8)) console.log(`  • ${o.marker} ${o.value} ${o.unit} [${o.flag}] rank=${o.severityRank}`);
  }

  // Alerts
  if (plan.emergencyAlerts.length) {
    console.log(`\n⚠️ EMERGENCY ALERTS (${plan.emergencyAlerts.length}):`);
    for (const a of plan.emergencyAlerts) console.log(`  • ${(a as any).label ?? JSON.stringify(a).slice(0, 100)}`);
  }
  if (plan.crisisAlert) console.log(`\n🚨 CRISIS ALERT`);

  // Risk + Goals + Expected findings
  console.log(`\nMODE: ${plan.isOptimizationMode ? 'optimization' : 'treatment'} | Goals: ${plan.goalTargets.length} | Suboptimal: ${plan.suboptimalFlags.length} | Expected findings: ${plan.expectedFindings.length}`);
}
