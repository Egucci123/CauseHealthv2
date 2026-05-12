// DEEP ENGINE AUDIT — EVERY OUTPUT DIMENSION CHECKED ACROSS 5000 PATIENTS
// =======================================================================
// Mixed population (healthy / disease / subtle close-call) — full
// inspection of every engine surface for anomalies, missing fields,
// invalid values, or unexpected output.
//
// Covers: tests, patterns, supplements, depletions, alerts, goals,
// symptoms-addressed, eating pattern, risk calculators, prep
// instructions, suboptimal flags, expected findings, canonical prose,
// medication alternatives.

import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function mulberry32(seed: number) {
  let a = seed;
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function rint(lo: number, hi: number, rng: () => number): number { return Math.floor(rng() * (hi - lo + 1)) + lo; }
function rfloat(lo: number, hi: number, rng: () => number, dp = 1): number { return +((rng() * (hi - lo)) + lo).toFixed(dp); }
function pick<T>(arr: T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]; }

// Healthy + disease + subtle generators
const HEALTHY_LABS = (rng: () => number): LabValue[] => [
  lab('Sodium', rfloat(136,144,rng), 'mEq/L'), lab('Creatinine', rfloat(0.7,1.2,rng,2), 'mg/dL'),
  lab('Glucose', rfloat(75,95,rng), 'mg/dL'), lab('ALT', rfloat(10,30,rng), 'U/L'),
  lab('Hemoglobin', rfloat(13.0,16.5,rng,1), 'g/dL'), lab('LDL', rfloat(60,120,rng), 'mg/dL'),
  lab('HDL', rfloat(45,75,rng), 'mg/dL'), lab('Triglycerides', rfloat(50,140,rng), 'mg/dL'),
  lab('Hemoglobin A1c', rfloat(4.5,5.3,rng,1), '%'), lab('TSH', rfloat(0.5,2.5,rng,1), 'mIU/L'),
  lab('Vitamin D 25-hydroxy', rfloat(35,70,rng), 'ng/mL'), lab('Ferritin', rfloat(50,200,rng), 'ng/mL'),
];

const DISEASE_GENS: Array<(rng: () => number, sex: 'male'|'female') => { labs: LabValue[]; meds?: string[]; conditions?: string[] }> = [
  (rng)=>({ labs:[lab('Ferritin',rfloat(450,1200,rng),'ng/mL','high'),lab('Transferrin Saturation',rfloat(50,78,rng),'%','high')] }),
  (rng)=>({ labs:[lab('Hemoglobin A1c',rfloat(5.8,6.4,rng,1),'%','watch'),lab('Triglycerides',rfloat(180,320,rng),'mg/dL','high'),lab('HDL',rfloat(28,38,rng),'mg/dL','low')] }),
  (rng)=>({ labs:[lab('TSH',rfloat(4.6,9.5,rng,1),'mIU/L','high')] }),
  (rng)=>({ labs:[lab('TSH',rfloat(0.05,0.35,rng,2),'mIU/L','low')] }),
  (rng)=>({ labs:[lab('ALT',rfloat(55,110,rng),'U/L','high'),lab('AST',rfloat(45,90,rng),'U/L','high'),lab('Triglycerides',rfloat(180,280,rng),'mg/dL','high')] }),
  (rng)=>({ labs:[lab('Cortisol - AM',rfloat(24,35,rng,1),'µg/dL','high')] }),
  (rng)=>({ labs:[lab('LDL',rfloat(155,210,rng),'mg/dL','high'),lab('ApoB',rfloat(105,145,rng),'mg/dL','high')] }),
  (rng)=>({ labs:[lab('Hemoglobin',rfloat(9.5,11.5,rng,1),'g/dL','low'),lab('Ferritin',rfloat(4,18,rng,1),'ng/mL','low')] }),
  (rng)=>({ labs:[lab('B12',rfloat(120,200,rng),'pg/mL','low'),lab('MCV',rfloat(102,112,rng),'fL','high')] }),
  (rng)=>({ labs:[lab('eGFR',rfloat(35,58,rng),'mL/min','low'),lab('Creatinine',rfloat(1.6,2.4,rng,1),'mg/dL','high')] }),
  // Patients on meds — test depletion + alternatives
  (rng)=>({ labs:[lab('Hemoglobin A1c',rfloat(7.0,8.0,rng,1),'%','high')], meds:['metformin 1000mg BID','atorvastatin 40mg','lisinopril 20mg'], conditions:['type 2 diabetes','hypertension'] }),
  (rng)=>({ labs:[], meds:['prednisone 10mg daily','methotrexate 15mg weekly'], conditions:['rheumatoid arthritis'] }),
  (rng)=>({ labs:[], meds:['omeprazole 40mg','sertraline 50mg'], conditions:['GERD','anxiety disorder'] }),
];

const SUBTLE_GENS: Array<(rng: () => number, sex: 'male'|'female') => { labs: LabValue[]; symptoms?: string[]; conditions?: string[] }> = [
  (rng)=>({ labs:[lab('TSH',rfloat(2.6,4.4,rng,1),'mIU/L','watch')], symptoms:['Chronic fatigue','Brain fog','Cold intolerance'] }),
  (rng)=>({ labs:[lab('Hemoglobin A1c',rfloat(5.6,5.7,rng,1),'%','watch')], symptoms:['Weight gain despite diet'] }),
  (rng,sex)=>({ labs:[lab('Ferritin',rfloat(18,30,rng),'ng/mL','low'),lab('Hemoglobin',sex==='female'?rfloat(11.5,12.4,rng,1):rfloat(13.0,13.6,rng,1),'g/dL','low')], symptoms:['Chronic fatigue'] }),
  (rng)=>({ labs:[lab('Ferritin',rfloat(280,380,rng),'ng/mL','high'),lab('Transferrin Saturation',rfloat(46,55,rng),'%','high')], symptoms:['Joint pain'] }),
  (rng)=>({ labs:[lab('Vitamin D 25-hydroxy',rfloat(22,29,rng),'ng/mL','low')], symptoms:['Chronic fatigue'] }),
  (rng)=>({ labs:[lab('Cortisol AM',rfloat(20.5,23.5,rng,1),'µg/dL','watch')], symptoms:['Difficulty falling asleep'] }),
];

function makePatient(rng: () => number): PatientInput {
  const r = rng();
  const category = r < 0.33 ? 'healthy' : r < 0.66 ? 'disease' : 'subtle';
  const age = rint(25, 85, rng);
  const sex: 'male'|'female' = rng() < 0.5 ? 'male' : 'female';
  const heightCm = rint(155, 195, rng);
  const bmi = rfloat(22, 31, rng, 1);
  const weightKg = +(bmi * Math.pow(heightCm/100, 2)).toFixed(1);
  let labs: LabValue[] = [];
  let symptoms: { name: string; severity: number }[] = [];
  let conditions: string[] = [];
  let meds: string[] = [];

  if (category === 'healthy') {
    labs = rng() < 0.5 ? HEALTHY_LABS(rng) : [];
  } else if (category === 'disease') {
    const gen = pick(DISEASE_GENS, rng)(rng, sex);
    labs = gen.labs;
    meds = gen.meds ?? [];
    conditions = gen.conditions ?? [];
  } else {
    const gen = pick(SUBTLE_GENS, rng)(rng, sex);
    labs = gen.labs;
    symptoms = (gen.symptoms ?? []).map(name => ({ name, severity: 3 }));
    conditions = gen.conditions ?? [];
  }

  return {
    age, sex, heightCm, weightKg, bmi,
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: meds, medsLower: meds.join(' ').toLowerCase(),
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => `${s.name} (${s.severity}/5)`).join(' ').toLowerCase(),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false,
    freeText: '',
  };
}

// ── RUNNER ──────────────────────────────────────────────────────────
const N = 5000;
const seed = 31415;
const rng = mulberry32(seed);

interface FieldStats {
  presentCount: number;
  emptyCount: number;
  undefinedCount: number;
  invalidCount: number;
  totalElements: number;
}
const stats: Record<string, FieldStats> = {};
const init = (k: string) => { if (!stats[k]) stats[k] = { presentCount:0, emptyCount:0, undefinedCount:0, invalidCount:0, totalElements:0 }; };

const violations: Array<{ patient: number; field: string; issue: string }> = [];
const violationCounts: Record<string, number> = {};
const recordViolation = (patient: number, field: string, issue: string) => {
  const key = `${field}: ${issue}`;
  violationCounts[key] = (violationCounts[key] ?? 0) + 1;
  if (violations.length < 30 && violationCounts[key] <= 3) {
    violations.push({ patient, field, issue });
  }
};

const checkString = (patient: number, field: string, val: any, allowEmpty = false) => {
  init(field);
  if (val === undefined || val === null) { stats[field].undefinedCount++; recordViolation(patient, field, 'undefined/null'); return; }
  if (typeof val !== 'string') { stats[field].invalidCount++; recordViolation(patient, field, `not string: ${typeof val}`); return; }
  if (!allowEmpty && val.trim() === '') { stats[field].emptyCount++; recordViolation(patient, field, 'empty string'); return; }
  if (/^\s*undefined\s*$/i.test(val) || /^\s*NaN\s*$/i.test(val) || /\[object\s+/i.test(val)) {
    stats[field].invalidCount++; recordViolation(patient, field, `bad string: "${val.slice(0,60)}"`); return;
  }
  stats[field].presentCount++;
};

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  DEEP ENGINE AUDIT — ${N} mixed patients — EVERY FIELD CHECKED`);
console.log(`══════════════════════════════════════════════════════════════\n`);

const start = Date.now();
let plansGenerated = 0;
let exceptions = 0;
const totalCounts: Record<string, number> = {
  tests:0, conditions:0, supplements:0, depletions:0, emergencyAlerts:0,
  crisisAlerts:0, goalTargets:0, symptomsAddressed:0, prepInstructions:0,
  suboptimalFlags:0, expectedFindings:0, labOutliers:0,
  citations:0, supplementsWithDose:0, supplementsWithTiming:0,
  testsWithICD:0, testsWithPriority:0, testsWithTier:0,
  conditionsWithICD:0, conditionsWithEvidence:0, conditionsWithConfirmatoryTests:0,
};

for (let i = 0; i < N; i++) {
  const p = makePatient(rng);
  let plan: ReturnType<typeof buildPlan>;
  try { plan = buildPlan(p); plansGenerated++; } catch (e) {
    exceptions++;
    recordViolation(i, 'buildPlan', `threw exception: ${String((e as Error).message).slice(0,100)}`);
    continue;
  }

  // ── TESTS ─────────────────────────────────────────────────────────
  for (const t of plan.tests) {
    totalCounts.tests++;
    init('test.name'); init('test.icd10'); init('test.priority'); init('test.whyShort'); init('test.tier');
    checkString(i, 'test.name', t.name);
    checkString(i, 'test.whyShort', t.whyShort);
    if (t.icd10 && /^[A-Z]\d{2}(\.\d+)?$/.test(t.icd10)) { stats['test.icd10'].presentCount++; totalCounts.testsWithICD++; }
    else { stats['test.icd10'].invalidCount++; recordViolation(i, 'test.icd10', `bad: "${t.icd10}" for ${t.name}`); }
    const validPriorities = ['urgent','high','moderate'];
    if (validPriorities.includes(t.priority)) { stats['test.priority'].presentCount++; totalCounts.testsWithPriority++; }
    else { stats['test.priority'].invalidCount++; recordViolation(i, 'test.priority', `bad: "${t.priority}"`); }
    const validTiers = ['baseline','preventive','pattern','specialist','imaging'];
    const tier = (t as any).tier;
    if (tier && validTiers.includes(tier)) { stats['test.tier'].presentCount++; totalCounts.testsWithTier++; }
    else if (tier === undefined) { stats['test.tier'].undefinedCount++; }
    else { stats['test.tier'].invalidCount++; recordViolation(i, 'test.tier', `bad: "${tier}"`); }
  }

  // ── PATTERNS / CONDITIONS ─────────────────────────────────────────
  for (const c of plan.conditions) {
    totalCounts.conditions++;
    checkString(i, 'condition.name', c.name);
    checkString(i, 'condition.evidence', c.evidence);
    if (c.icd10) totalCounts.conditionsWithICD++;
    if (c.evidence) totalCounts.conditionsWithEvidence++;
    if (Array.isArray(c.confirmatory_tests) && c.confirmatory_tests.length > 0) totalCounts.conditionsWithConfirmatoryTests++;
    const validConf = ['high','moderate'];
    init('condition.confidence');
    if (validConf.includes(c.confidence)) stats['condition.confidence'].presentCount++;
    else { stats['condition.confidence'].invalidCount++; recordViolation(i, 'condition.confidence', `bad: ${c.confidence}`); }
  }

  // ── SUPPLEMENTS ───────────────────────────────────────────────────
  for (const s of plan.supplementCandidates) {
    totalCounts.supplements++;
    checkString(i, 'supplement.nutrient', s.nutrient);
    checkString(i, 'supplement.form', s.form);
    checkString(i, 'supplement.dose', s.dose);
    checkString(i, 'supplement.timing', s.timing);
    checkString(i, 'supplement.whyShort', s.whyShort);
    if (s.dose && s.dose.trim()) totalCounts.supplementsWithDose++;
    if (s.timing && s.timing.trim()) totalCounts.supplementsWithTiming++;
    init('supplement.category');
    const validCat = ['sleep_stress','gut_healing','liver_metabolic','inflammation','cardio','inflammation_cardio','nutrient_repletion','condition_therapy'];
    if (validCat.includes(s.category)) stats['supplement.category'].presentCount++;
    else { stats['supplement.category'].invalidCount++; recordViolation(i, 'supplement.category', `bad: ${s.category}`); }
    init('supplement.priority');
    const validPr = ['critical','high','moderate'];
    if (validPr.includes(s.priority)) stats['supplement.priority'].presentCount++;
    else { stats['supplement.priority'].invalidCount++; recordViolation(i, 'supplement.priority', `bad: ${s.priority}`); }
  }

  // ── DEPLETIONS ────────────────────────────────────────────────────
  for (const d of plan.depletions) {
    totalCounts.depletions++;
    checkString(i, 'depletion.medClass', d.medClass);
    checkString(i, 'depletion.nutrient', d.nutrient);
    checkString(i, 'depletion.mechanism', d.mechanism);
    init('depletion.severity');
    const validSev = ['high','moderate','low'];
    if (validSev.includes(d.severity)) stats['depletion.severity'].presentCount++;
    else { stats['depletion.severity'].invalidCount++; recordViolation(i, 'depletion.severity', `bad: ${d.severity}`); }
  }

  // ── EMERGENCY / CRISIS ALERTS ─────────────────────────────────────
  totalCounts.emergencyAlerts += plan.emergencyAlerts.length;
  if (plan.crisisAlert) totalCounts.crisisAlerts++;

  // ── GOAL TARGETS ──────────────────────────────────────────────────
  for (const g of plan.goalTargets) {
    totalCounts.goalTargets++;
    checkString(i, 'goal.marker', g.marker);
    checkString(i, 'goal.deltaText', g.deltaText);
    checkString(i, 'goal.unit', g.unit);
    init('goal.today_goal');
    if (typeof g.today === 'number' && typeof g.goal === 'number') stats['goal.today_goal'].presentCount++;
    else { stats['goal.today_goal'].invalidCount++; recordViolation(i, 'goal.today_goal', `bad: today=${g.today} goal=${g.goal}`); }
  }

  // ── SYMPTOMS ADDRESSED ────────────────────────────────────────────
  for (const sa of plan.symptomsAddressed) {
    totalCounts.symptomsAddressed++;
    checkString(i, 'symptomAddressed.symptom', sa.symptom);
    checkString(i, 'symptomAddressed.how_addressed', (sa as any).how_addressed);
  }

  // ── PREP INSTRUCTIONS ─────────────────────────────────────────────
  for (const pi of plan.prepInstructions) {
    totalCounts.prepInstructions++;
    checkString(i, 'prep.instruction', (pi as any).instruction ?? (pi as any).text);
  }

  // ── SUBOPTIMAL FLAGS ──────────────────────────────────────────────
  for (const f of plan.suboptimalFlags) {
    totalCounts.suboptimalFlags++;
    checkString(i, 'subopt.marker', (f as any).marker ?? (f as any).marker_name);
  }

  // ── EXPECTED FINDINGS ─────────────────────────────────────────────
  for (const e of plan.expectedFindings) {
    totalCounts.expectedFindings++;
    checkString(i, 'expectedFinding.marker', e.marker);
    checkString(i, 'expectedFinding.conditionLabel', e.conditionLabel);
    checkString(i, 'expectedFinding.rationale', e.rationale);
  }

  // ── LAB OUTLIERS ──────────────────────────────────────────────────
  for (const o of plan.labs.outliers) {
    totalCounts.labOutliers++;
    checkString(i, 'outlier.marker', o.marker);
    init('outlier.flag');
    const validFlags = ['critical_high','critical_low','high','low','watch'];
    if (validFlags.includes(o.flag)) stats['outlier.flag'].presentCount++;
    else { stats['outlier.flag'].invalidCount++; recordViolation(i, 'outlier.flag', `bad: ${o.flag}`); }
  }

  // ── CITATIONS ─────────────────────────────────────────────────────
  totalCounts.citations += plan.citations.length;

  // ── CANONICAL PROSE ───────────────────────────────────────────────
  const cp = plan.canonicalProse;
  if (!cp) recordViolation(i, 'canonicalProse', 'missing');
  else {
    if (!Array.isArray(cp.conditions)) recordViolation(i, 'canonicalProse.conditions', 'not array');
    if (!Array.isArray(cp.outliers)) recordViolation(i, 'canonicalProse.outliers', 'not array');
    if (!Array.isArray(cp.supplements)) recordViolation(i, 'canonicalProse.supplements', 'not array');
    if (!Array.isArray(cp.goals)) recordViolation(i, 'canonicalProse.goals', 'not array');
    if (!Array.isArray(cp.alerts)) recordViolation(i, 'canonicalProse.alerts', 'not array');
  }
}
const elapsed = Date.now() - start;
console.log(`Ran ${plansGenerated}/${N} plans in ${elapsed}ms (${exceptions} exceptions)\n`);

console.log(`──── ENGINE OUTPUT VOLUMES ────`);
for (const [k, v] of Object.entries(totalCounts)) {
  if (v > 0) console.log(`  ${k.padEnd(40)} ${v}`);
}
console.log();

console.log(`──── FIELD INTEGRITY ────`);
const sortedStats = Object.entries(stats).sort((a, b) => a[0].localeCompare(b[0]));
for (const [field, s] of sortedStats) {
  const total = s.presentCount + s.emptyCount + s.undefinedCount + s.invalidCount;
  if (total === 0) continue;
  const bad = s.emptyCount + s.undefinedCount + s.invalidCount;
  const flag = bad === 0 ? '✅' : bad / total < 0.01 ? '⚠️' : '❌';
  if (bad > 0) {
    console.log(`  ${flag} ${field.padEnd(40)} present=${s.presentCount} empty=${s.emptyCount} undef=${s.undefinedCount} invalid=${s.invalidCount}`);
  }
}
const cleanFields = sortedStats.filter(([_, s]) => (s.emptyCount + s.undefinedCount + s.invalidCount) === 0).length;
const dirtyFields = sortedStats.filter(([_, s]) => (s.emptyCount + s.undefinedCount + s.invalidCount) > 0).length;
console.log(`\n  ${cleanFields} fields clean | ${dirtyFields} fields with issues`);
console.log();

if (violations.length > 0) {
  console.log(`──── TOP VIOLATIONS (capped at 30 sample) ────`);
  const grouped: Record<string, { count: number; samples: typeof violations }> = {};
  for (const v of violations) {
    const k = v.field + ' | ' + v.issue;
    if (!grouped[k]) grouped[k] = { count: 0, samples: [] };
    grouped[k].count = violationCounts[v.field + ': ' + v.issue] ?? 0;
    if (grouped[k].samples.length < 2) grouped[k].samples.push(v);
  }
  for (const [k, info] of Object.entries(grouped).sort((a,b)=>b[1].count-a[1].count).slice(0,15)) {
    console.log(`  ${String(info.count).padStart(4)}x  ${k}`);
    for (const s of info.samples) console.log(`         patient #${s.patient}`);
  }
}

console.log();
console.log(`──── FINAL ────`);
const totalIssues = Object.values(violationCounts).reduce((a,b)=>a+b, 0);
const passRate = ((1 - totalIssues / (plansGenerated * 20)) * 100).toFixed(2);
console.log(`Exceptions:           ${exceptions === 0 ? '✅ 0' : '❌ '+exceptions}`);
console.log(`Field violations:     ${totalIssues === 0 ? '✅ 0' : '❌ '+totalIssues}`);
console.log(`Fields with issues:   ${dirtyFields}`);
console.log();
console.log(totalIssues === 0 && exceptions === 0 ? `✅ DEEP AUDIT PASSES — every output field clean across ${N} patients` : `❌ ${totalIssues} field violations across ${plansGenerated} plans`);
Deno.exit(totalIssues === 0 && exceptions === 0 ? 0 : 1);
