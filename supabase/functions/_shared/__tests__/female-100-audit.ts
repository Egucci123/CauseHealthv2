// 100-FEMALE-ARCHETYPE COMPREHENSIVE AUDIT
// =========================================
// Symmetrical to __male-100-audit. 100 distinct female synthetic
// patients spanning the clinical spectrum. Each tested against
// clinical expectations + universal female-specific invariants
// (no male-only test leaks, pregnancy contraindications enforced).
//
// Pure deterministic. Zero API credits.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(marker: string, value: number, unit: string, flag: LabValue['flag'] = 'normal'): LabValue {
  return { marker, value, unit, flag };
}

interface Archetype {
  id: number; label: string; age: number;
  heightCm?: number; weightKg?: number;
  conditions?: string[]; meds?: string[]; symptoms?: string[]; labs?: LabValue[];
  isPregnant?: boolean;
  expectTests?: RegExp[]; expectPatterns?: RegExp[];
  expectSupplements?: RegExp[]; expectDepletions?: RegExp[];
}

const A: Archetype[] = [
  // ───── 18–25 ─────
  { id:1, label:'18F asymptomatic baseline', age:18 },
  { id:2, label:'20F college, anxiety + insomnia', age:20, symptoms:['Anxiety','Difficulty falling asleep'] },
  { id:3, label:'22F vegan, fatigue+brain fog', age:22, conditions:['vegan diet'], symptoms:['Chronic fatigue','Brain fog'] },
  { id:4, label:'24F migraines + visual aura', age:24, symptoms:['Migraines','New or worsening headaches','Visual changes — vision changes'] },
  { id:5, label:'21F severe acne + hirsutism', age:21, symptoms:['Acne','Hirsutism — excess facial or body hair'] },
  { id:6, label:'23F PCOS classic (acne + hirsut + irregular)', age:23, symptoms:['Acne','Hirsutism — excess facial or body hair','Irregular periods'],
    expectTests:[/PCOS/i] },
  { id:7, label:'19F T1D on pump', age:19, conditions:['type 1 diabetes'], meds:['insulin glargine','insulin lispro'], labs:[lab('Hemoglobin A1c',7.4,'%','high')] },
  { id:8, label:'25F galactorrhea + amenorrhea', age:25, symptoms:['Galactorrhea — breast or nipple discharge','Amenorrhea — no period 3+ months','New or worsening headaches'],
    expectTests:[/Prolactin/i,/hCG/i] },
  { id:9, label:'22F IBS-spectrum bloating', age:22, symptoms:['Bloating','Alternating bowel habits','Food sensitivities'] },
  { id:10, label:'18F freshman, asymptomatic, on OCP', age:18, meds:['ethinyl estradiol/levonorgestrel'], expectDepletions:[/hormonal_contraceptive/i] },

  // ───── 26–35 ─────
  { id:11, label:'27F asymptomatic + 3 basic labs', age:27, labs:[lab('Glucose',90,'mg/dL'),lab('Hemoglobin',13.6,'g/dL'),lab('TSH',2.1,'mIU/L')] },
  { id:12, label:'28F Marisa-pattern (pregnant + Gilbert + prolactin high)', age:28, isPregnant:true, conditions:['gilbert syndrome'], meds:['prenatal vitamin'],
    labs:[lab('Prolactin',53,'ng/mL','high'),lab('Bilirubin',1.8,'mg/dL','high')] },
  { id:13, label:'32F POI presentation', age:32, symptoms:['Hot flashes','Night sweats','Amenorrhea — no period 3+ months','Chronic fatigue'],
    expectTests:[/FSH/i] },
  { id:14, label:'30F Hashimoto TSH 8 + sx', age:30, symptoms:['Chronic fatigue','Brain fog','Hair loss — no family history','Cold intolerance'],
    labs:[lab('TSH',8.0,'mIU/L','high')], expectPatterns:[/thyroid|hypothyroid/i] },
  { id:15, label:'33F infertility 18mo', age:33, symptoms:['Fertility concerns — infertility','Irregular periods'],
    expectTests:[/AMH/i] },
  { id:16, label:'28F endurance triathlete', age:28, weightKg:54, heightCm:168, symptoms:['Reduced exercise tolerance'] },
  { id:17, label:'34F pregnant 2nd trimester', age:34, isPregnant:true, meds:['prenatal vitamin'],
    expectTests:[/CBC|Iron|Prenatal/i] },
  { id:18, label:'29F severe depression + anxiety', age:29, symptoms:['Depression','Anxiety','Chronic fatigue','Low motivation'] },
  { id:19, label:'31F low libido + fatigue (HSDD)', age:31, symptoms:['Low libido','Chronic fatigue','Depression'],
    expectTests:[/Androgen/i] },
  { id:20, label:'35F on accutane', age:35, meds:['isotretinoin'], symptoms:['Dry skin'] },
  { id:21, label:'33F lyme disease s/p tx', age:33, conditions:['lyme disease'], symptoms:['Chronic fatigue','Joint pain','Brain fog'] },
  { id:22, label:'27F UC on humira + mesalamine', age:27, conditions:['ulcerative colitis'], meds:['adalimumab','mesalamine'],
    expectDepletions:[/mesalamine|methotrexate/i] },
  { id:23, label:'30F migraine cluster + autonomic', age:30, symptoms:['Migraines','New or worsening headaches','Heart palpitations','Dizziness on standing'],
    expectTests:[/EKG/i] },
  { id:24, label:'35F long-COVID profile', age:35, symptoms:['Chronic fatigue','Brain fog','Heart palpitations','Dizziness on standing','Reduced exercise tolerance'],
    expectTests:[/EKG/i] },
  { id:25, label:'28F pregnant + GDM risk (BMI 32)', age:28, isPregnant:true, weightKg:88, meds:['prenatal vitamin'],
    expectTests:[/Hemoglobin A1c|GDM/i] },

  // ───── 36–45 ─────
  { id:26, label:'37F asymptomatic perfect health', age:37 },
  { id:27, label:'38F perimenopause early', age:38, symptoms:['Hot flashes','Mood swings','Irregular periods','Waking during night'],
    expectTests:[/FSH/i] },
  { id:28, label:'45F perimenopause classic', age:45, symptoms:['Hot flashes','Night sweats','Waking during night','Mood swings','Irregular periods'] },
  { id:29, label:'40F Graves disease', age:40, symptoms:['Heat intolerance','Heart palpitations','Anxiety','Unexplained weight loss'],
    labs:[lab('TSH',0.04,'mIU/L','low')], expectPatterns:[/hyperthyroid|graves/i] },
  { id:30, label:'42F fibromyalgia/CFS', age:42, symptoms:['Chronic fatigue','Mental exhaustion','Muscle pain','Brain fog','Unrefreshing sleep'] },
  { id:31, label:'38F PCOS + metabolic + weight gain', age:38, weightKg:88, symptoms:['Acne','Hirsutism — excess facial or body hair','Irregular periods','Weight gain despite diet'],
    labs:[lab('Hemoglobin A1c',5.8,'%','watch'),lab('Triglycerides',195,'mg/dL','high')] },
  { id:32, label:'45F migraine on triptan + SSRI', age:45, conditions:['migraine'], meds:['sumatriptan PRN','sertraline 50mg'], symptoms:['Migraines','Anxiety'] },
  { id:33, label:'40F endometriosis chronic', age:40, conditions:['endometriosis'], symptoms:['Abdominal pain','Heavy periods'] },
  { id:34, label:'42F Sjogren autoimmune', age:42, conditions:['sjogren syndrome'], symptoms:['Dry skin','Joint pain'] },
  { id:35, label:'44F chronic stress + cortisol high', age:44, symptoms:['Chronic fatigue','Difficulty falling asleep','Mood swings'],
    labs:[lab('Cortisol AM',24,'µg/dL','high')] },
  { id:36, label:'37F lupus on plaquenil', age:37, conditions:['lupus','sle'], meds:['hydroxychloroquine 400mg','prednisone 5mg'] },
  { id:37, label:'41F BMI 33 + sleep apnea suspected', age:41, weightKg:108, symptoms:['Snoring','Daytime sleepiness','Morning fatigue despite sleep'] },
  { id:38, label:'45F hereditary FH cholesterol', age:45, conditions:['familial hypercholesterolemia'],
    labs:[lab('LDL',195,'mg/dL','high'),lab('Total Cholesterol',285,'mg/dL','high')], expectTests:[/Lp\(a\)|ApoB/i] },
  { id:39, label:'39F on statin + muscle pain', age:39, meds:['atorvastatin 40mg'], symptoms:['Muscle pain','Muscle cramps'] },
  { id:40, label:'45F severe iron deficiency anemia', age:45, symptoms:['Heavy periods','Chronic fatigue','Restless legs'],
    labs:[lab('Hemoglobin',9.8,'g/dL','low'),lab('Ferritin',6,'ng/mL','low'),lab('MCV',72,'fL','low')] },

  // ───── 46–55 ─────
  { id:41, label:'47F perimenopause + insomnia', age:47, symptoms:['Hot flashes','Night sweats','Waking during night','Mood swings'] },
  { id:42, label:'50F established T2D + HTN', age:50, conditions:['type 2 diabetes','hypertension'], meds:['metformin 1000mg BID','lisinopril 20mg'],
    labs:[lab('Hemoglobin A1c',7.1,'%','high')], expectDepletions:[/metformin/i] },
  { id:43, label:'52F breast cancer survivor on anastrozole', age:52, conditions:['breast cancer in remission'], meds:['anastrozole 1mg'], symptoms:['Hot flashes','Joint pain'] },
  { id:44, label:'48F gout flare (rare in women)', age:48, conditions:['gout'], meds:['allopurinol 300mg'], labs:[lab('Uric Acid',8.4,'mg/dL','high')] },
  { id:45, label:'49F NAFLD on biopsy + IR', age:49, conditions:['non-alcoholic fatty liver disease'],
    labs:[lab('ALT',88,'U/L','high'),lab('AST',72,'U/L','high'),lab('Triglycerides',245,'mg/dL','high')] },
  { id:46, label:'53F uncontrolled HTN (resistant)', age:53, conditions:['hypertension'], meds:['amlodipine','losartan','hydrochlorothiazide','spironolactone'],
    labs:[lab('Potassium',3.2,'mEq/L','low')], expectPatterns:[/aldosteron|primary/i] },
  { id:47, label:'50F CKD stage 3', age:50, conditions:['chronic kidney disease'],
    labs:[lab('Creatinine',1.6,'mg/dL','high'),lab('eGFR',45,'mL/min','low')] },
  { id:48, label:'55F osteopenia + family hx osteoporosis', age:55, conditions:['osteopenia','family history osteoporosis'] },
  { id:49, label:'47F SSRI 10 years (low libido side effect)', age:47, meds:['fluoxetine 40mg'], symptoms:['Low libido','Erectile dysfunction'] },
  { id:50, label:'52F chronic pain on opioid + gabapentin', age:52, conditions:['chronic back pain'], meds:['oxycodone 10mg q6h','gabapentin 300mg TID'],
    symptoms:['Constipation','Chronic fatigue','Low libido'] },
  { id:51, label:'46F IBS-D severe', age:46, symptoms:['Diarrhea','Abdominal pain','Bloating','Food sensitivities'] },
  { id:52, label:'48F HIV on ART 15 years', age:48, conditions:['HIV on ART'], meds:['emtricitabine/tenofovir','dolutegravir'] },
  { id:53, label:'50F chronic alcohol — cirrhosis early', age:50, conditions:['cirrhosis'],
    labs:[lab('Albumin',3.0,'g/dL','low'),lab('Bilirubin',2.4,'mg/dL','high'),lab('Platelets',95,'K/µL','low')] },
  { id:54, label:'49F psoriasis on biologic + MTX', age:49, conditions:['psoriasis'], meds:['adalimumab','methotrexate 15mg weekly'],
    expectDepletions:[/methotrexate/i] },
  { id:55, label:'53F post-MI on max therapy', age:53, conditions:['myocardial infarction history','coronary artery disease'],
    meds:['atorvastatin 80mg','clopidogrel','metoprolol','lisinopril','aspirin 81mg'] },

  // ───── 56–65 ─────
  { id:56, label:'57F postmenopausal asymptomatic', age:57 },
  { id:57, label:'60F metabolic syndrome severe', age:60, weightKg:110, labs:[lab('Hemoglobin A1c',6.3,'%','watch'),lab('Triglycerides',265,'mg/dL','high'),lab('HDL',32,'mg/dL','low')] },
  { id:58, label:'58F RA on chronic prednisone', age:58, conditions:['rheumatoid arthritis'], meds:['prednisone 7.5mg daily','methotrexate 12.5mg weekly'],
    expectTests:[/DEXA/i], expectDepletions:[/steroid_oral|methotrexate/i] },
  { id:59, label:'63F osteoporosis + fragility fx', age:63, conditions:['osteoporosis','fragility fracture history'], expectTests:[/DEXA/i] },
  { id:60, label:'62F COPD ex-smoker', age:62, conditions:['COPD','former smoker'], meds:['tiotropium','albuterol PRN'], symptoms:['Shortness of breath'] },
  { id:61, label:'59F Afib on warfarin', age:59, conditions:['atrial fibrillation'], meds:['warfarin 5mg','metoprolol'], expectTests:[/INR/i] },
  { id:62, label:'60F Parkinson early', age:60, conditions:['parkinson disease'], meds:['carbidopa-levodopa'], symptoms:['Difficulty falling asleep'] },
  { id:63, label:'58F statin intolerant + high LDL', age:58, conditions:['coronary artery disease'], meds:['ezetimibe','aspirin'],
    labs:[lab('LDL',135,'mg/dL','high'),lab('ApoB',102,'mg/dL','high')] },
  { id:64, label:'65F CKD stage 4 + anemia', age:65, conditions:['chronic kidney disease'],
    labs:[lab('Creatinine',2.6,'mg/dL','high'),lab('eGFR',26,'mL/min','low'),lab('Hemoglobin',10.4,'g/dL','low'),lab('Ferritin',55,'ng/mL','low')] },
  { id:65, label:'63F T2D + diabetic neuropathy', age:63, conditions:['type 2 diabetes','diabetic neuropathy'], meds:['insulin glargine','metformin','gabapentin'] },
  { id:66, label:'60F hypothyroid on levo + residual sx', age:60, conditions:['hypothyroidism'], meds:['levothyroxine 100mcg'], symptoms:['Chronic fatigue','Brain fog'] },
  { id:67, label:'58F anxiety + benzo dependence', age:58, conditions:['anxiety disorder'], meds:['alprazolam 1mg TID'], symptoms:['Anxiety','Difficulty falling asleep'] },
  { id:68, label:'62F restless legs + low ferritin', age:62, symptoms:['Restless legs','Difficulty falling asleep'], labs:[lab('Ferritin',22,'ng/mL','low')] },
  { id:69, label:'65F PMR/GCA suspicion', age:65, symptoms:['Muscle weakness','Joint pain'],
    labs:[lab('ESR',55,'mm/hr','high'),lab('CRP',24,'mg/L','high')] },
  { id:70, label:'56F osteoporosis on alendronate', age:56, conditions:['osteoporosis'], meds:['alendronate 70mg weekly','calcium','vitamin D'] },

  // ───── 66–75 ─────
  { id:71, label:'67F asymptomatic baseline', age:67 },
  { id:72, label:'70F CHF NYHA II', age:70, conditions:['congestive heart failure'], meds:['carvedilol','sacubitril/valsartan','spironolactone','furosemide'] },
  { id:73, label:'68F new-onset Afib + palpitations', age:68, symptoms:['Heart palpitations','Shortness of breath'] },
  { id:74, label:'72F advanced osteoporosis post-vertebral fx', age:72, conditions:['osteoporosis','vertebral compression fracture'], meds:['denosumab q6mo','calcium','vitamin D'] },
  { id:75, label:'74F early dementia', age:74, conditions:['mild cognitive impairment'], meds:['donepezil'], symptoms:['Poor memory','Word-finding difficulty'] },
  { id:76, label:'70F Parkinson advanced', age:70, conditions:['parkinson disease'], symptoms:['Mental slowness','Constipation','Unexplained weight loss'] },
  { id:77, label:'68F dexa-confirmed osteo + hip fx', age:68, conditions:['osteoporosis','hip fracture history'], expectTests:[/DEXA/i] },
  { id:78, label:'71F CKD stage 4 + secondary HPT', age:71, conditions:['chronic kidney disease','secondary hyperparathyroidism'],
    labs:[lab('Creatinine',3.0,'mg/dL','high'),lab('PTH',285,'pg/mL','high')] },
  { id:79, label:'73F COPD + chronic prednisone', age:73, conditions:['COPD'], meds:['prednisone 5mg','tiotropium'],
    expectDepletions:[/steroid_oral/i] },
  { id:80, label:'69F T2D + obesity + OSA trio', age:69, conditions:['type 2 diabetes','obesity','obstructive sleep apnea'], weightKg:115, meds:['metformin','semaglutide'] },
  { id:81, label:'75F iron deficiency + occult GI bleed concern', age:75,
    labs:[lab('Hemoglobin',10.4,'g/dL','low'),lab('Ferritin',8,'ng/mL','low'),lab('MCV',74,'fL','low')] },
  { id:82, label:'72F chronic Afib on apixaban', age:72, conditions:['atrial fibrillation'], meds:['apixaban 5mg BID','metoprolol'] },
  { id:83, label:'68F ovarian cancer survivor', age:68, conditions:['ovarian cancer in remission'], symptoms:['Chronic fatigue'] },
  { id:84, label:'70F severe diabetic foot ulcer', age:70, conditions:['type 2 diabetes','diabetic foot ulcer'],
    meds:['insulin','metformin','vancomycin IV','piperacillin/tazobactam'] },
  { id:85, label:'74F Lewy body dementia', age:74, conditions:['lewy body dementia'], symptoms:['Vivid dreams','Mental slowness'] },

  // ───── 76+ ─────
  { id:86, label:'77F asymptomatic sharp cognition', age:77 },
  { id:87, label:'80F polypharmacy (10 meds)', age:80, conditions:['heart failure','chronic kidney disease','diabetes'],
    meds:['carvedilol','spironolactone','furosemide 80mg','warfarin','insulin','metformin','atorvastatin','aspirin','tamsulosin','donepezil'] },
  { id:88, label:'85F frailty + sarcopenia', age:85, symptoms:['Muscle weakness','Reduced exercise tolerance','Unexplained weight loss'] },
  { id:89, label:'78F vascular dementia', age:78, conditions:['vascular dementia'] },
  { id:90, label:'82F T2D + CAD + Afib trio', age:82, conditions:['type 2 diabetes','coronary artery disease','atrial fibrillation'],
    meds:['metformin','insulin','aspirin','metoprolol','warfarin','atorvastatin'] },
  { id:91, label:'80F Parkinson + hallucinations', age:80, conditions:['parkinson disease','psychosis'], meds:['carbidopa-levodopa','quetiapine'] },
  { id:92, label:'79F COPD GOLD-D chronic steroid', age:79, conditions:['COPD'], meds:['prednisone 10mg daily','tiotropium'],
    expectDepletions:[/steroid_oral/i], expectTests:[/DEXA/i] },
  { id:93, label:'76F severe osteoporosis vertebral fx ×3', age:76, conditions:['osteoporosis','vertebral compression fracture'], meds:['denosumab q6mo'] },
  { id:94, label:'77F chronic UTIs', age:77, conditions:['recurrent urinary tract infection'], meds:['nitrofurantoin prophylaxis'] },
  { id:95, label:'81F ESRD on dialysis', age:81, conditions:['end stage renal disease','dialysis dependent'],
    labs:[lab('Creatinine',6.4,'mg/dL','critical_high'),lab('eGFR',8,'mL/min','critical_low')] },
  { id:96, label:'78F anemia of inflammation', age:78,
    labs:[lab('Hemoglobin',9.8,'g/dL','low'),lab('Ferritin',285,'ng/mL','high'),lab('CRP',18,'mg/L','high')] },
  { id:97, label:'82F asymptomatic A1c 6.0', age:82, labs:[lab('Hemoglobin A1c',6.0,'%','watch')] },
  { id:98, label:'76F chronic constipation + opioid', age:76, meds:['oxycodone','laxatives'], symptoms:['Constipation'] },
  { id:99, label:'85F aortic stenosis severe', age:85, conditions:['aortic stenosis severe'], symptoms:['Shortness of breath','Chest discomfort','Dizziness on standing'] },
  { id:100, label:'90F centenarian-adjacent healthy', age:90 },
];

function makeInput(a: Archetype): PatientInput {
  const heightCm = a.heightCm ?? 165;
  const weightKg = a.weightKg ?? 65;
  const conds = a.conditions ?? [];
  const meds = a.meds ?? [];
  const symps = (a.symptoms ?? []).map(name => ({ name, severity: 4 }));
  const labs = a.labs ?? [];
  return {
    age: a.age, sex:'female', heightCm, weightKg,
    bmi: +(weightKg / Math.pow(heightCm/100, 2)).toFixed(1),
    conditionsList: conds, conditionsLower: conds.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symps,
    symptomsLower: symps.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: a.isPregnant ?? false,
    hasShellfishAllergy: false, hasSulfaAllergy: false,
    freeText: '',
  };
}

const MALE_ONLY = [/testosterone panel \(.*male|comprehensive male hormonal/i, /\bpsa\b/i];
const PREGNANCY_CONTRA = [/red yeast rice/i, /berberine/i, /vitamin a.*retinol/i, /st\.? john'?s wort/i, /\bdong quai\b/i, /\bblack cohosh\b/i];

let totalFailures = 0;
let totalLeaks = 0;
let totalContraindicated = 0;
const expectFails: Array<{ id:number; label:string; missing:string[] }> = [];

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  100-FEMALE-ARCHETYPE AUDIT — v2026-05-12-12`);
console.log(`══════════════════════════════════════════════════════════════\n`);

for (const a of A) {
  const plan = buildPlan(makeInput(a));
  const tests = plan.tests.map(t => t.name);
  const patterns = plan.conditions.map(c => c.name);
  const supps = plan.supplementCandidates.map(s => s.nutrient);
  const depletions = plan.depletions.map(d => d.medClass);

  // Universal safety: 0 male-only test leaks
  const leaks = tests.filter(t => MALE_ONLY.some(re => re.test(t)));
  if (leaks.length) {
    totalLeaks += leaks.length;
    console.log(`❌ LEAK #${a.id} ${a.label}: ${leaks.join(', ')}`);
  }

  // Pregnancy contraindications
  if (a.isPregnant) {
    const bad = supps.filter(s => PREGNANCY_CONTRA.some(re => re.test(s)));
    if (bad.length) {
      totalContraindicated += bad.length;
      console.log(`❌ PREG-CONTRA #${a.id} ${a.label}: ${bad.join(', ')}`);
    }
  }

  // Expectations
  const missing: string[] = [];
  for (const re of a.expectTests ?? []) if (!tests.some(t => re.test(t))) missing.push(`test:${re.source}`);
  for (const re of a.expectPatterns ?? []) if (!patterns.some(p => re.test(p))) missing.push(`pattern:${re.source}`);
  for (const re of a.expectSupplements ?? []) if (!supps.some(s => re.test(s))) missing.push(`supp:${re.source}`);
  for (const re of a.expectDepletions ?? []) if (!depletions.some(d => re.test(d))) missing.push(`depl:${re.source}`);

  if (missing.length) {
    totalFailures++;
    expectFails.push({ id:a.id, label:a.label, missing });
  }
}

console.log(`──── RESULTS ────`);
console.log(`Female-only / male-only test leaks: ${totalLeaks === 0 ? '✅ 0' : '❌ '+totalLeaks}`);
console.log(`Pregnancy contraindicated supps:   ${totalContraindicated === 0 ? '✅ 0' : '❌ '+totalContraindicated}`);
console.log(`Expectation failures:               ${totalFailures === 0 ? '✅ 0/100' : `❌ ${totalFailures}/100`}\n`);

if (expectFails.length) {
  console.log(`──── FAILED EXPECTATIONS ────`);
  for (const f of expectFails) {
    console.log(`  ❌ #${f.id} ${f.label}`);
    console.log(`       MISSING: ${f.missing.join(' ; ')}`);
  }
}

if (totalLeaks === 0 && totalContraindicated === 0 && totalFailures === 0) {
  console.log(`\n✅ 100/100 FEMALE ARCHETYPES PASS`);
  Deno.exit(0);
} else {
  Deno.exit(1);
}
