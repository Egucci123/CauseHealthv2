// Smoke test: verify deterministic prose fields populate on every plan.
import { buildPlan, type PatientInput, type LabValue } from "../buildPlan.ts";

function lab(m: string, v: number, u: string, f: LabValue['flag'] = 'normal'): LabValue {
  return { marker: m, value: v, unit: u, flag: f };
}
function mulberry32(seed: number) {
  let a = seed;
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rng = mulberry32(42);
function rfloat(lo: number, hi: number, dp = 1): number { return +((rng() * (hi - lo)) + lo).toFixed(dp); }

function patient(category: 'healthy'|'disease'|'subtle', sex: 'male'|'female'): PatientInput {
  let labs: LabValue[] = [];
  let symptoms: { name: string; severity: number }[] = [];
  let conditions: string[] = [];
  if (category === 'healthy') {
    labs = [lab('Glucose', 88, 'mg/dL'), lab('TSH', 1.8, 'mIU/L'), lab('Vitamin D 25-hydroxy', 45, 'ng/mL')];
  } else if (category === 'disease') {
    labs = [
      lab('ALT', 97, 'U/L', 'high'),
      lab('Triglycerides', 327, 'mg/dL', 'high'),
      lab('Vitamin D 25-hydroxy', 24, 'ng/mL', 'low'),
    ];
    symptoms = [{ name: 'Chronic fatigue', severity: 5 }, { name: 'Insomnia', severity: 4 }];
    conditions = ['UC'];
  } else {
    labs = [lab('TSH', 3.4, 'mIU/L', 'watch'), lab('Hemoglobin A1c', 5.6, '%', 'watch')];
    symptoms = [{ name: 'Brain fog', severity: 3 }];
  }
  return {
    age: 42, sex, heightCm: 175, weightKg: 92, bmi: 30.0,
    conditionsList: conditions, conditionsLower: conditions.join(' ').toLowerCase(),
    medsList: category === 'disease' ? ['atorvastatin'] : [], medsLower: category === 'disease' ? 'atorvastatin' : '',
    symptomsList: symptoms,
    symptomsLower: symptoms.map(s => s.name.toLowerCase()).join(' '),
    supplementsList: [], supplementsLower: '',
    labs, labsLower: labs.map(l => `${l.marker}: ${l.value}`).join('\n').toLowerCase(),
    isPregnant: false, hasShellfishAllergy: false, hasSulfaAllergy: false, freeText: '',
  };
}

const REQUIRED_FIELDS = ['todayActions','actionPlan','findingExplanations','patternDescriptions','eatingPattern','lifestyleInterventions','tellDoctor','executiveSummary'] as const;

let total = 0, issues = 0;
const categories: ('healthy'|'disease'|'subtle')[] = ['healthy','disease','subtle'];
const sexes: ('male'|'female')[] = ['male','female'];

console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  PROSE TEMPLATE SMOKE TEST — 600 patients × 8 fields`);
console.log(`══════════════════════════════════════════════════════════════\n`);

for (const cat of categories) {
  for (const sex of sexes) {
    for (let i = 0; i < 100; i++) {
      total++;
      const plan = buildPlan(patient(cat, sex));
      // todayActions must be 3
      if (!Array.isArray(plan.todayActions) || plan.todayActions.length !== 3) {
        issues++; console.log(`❌ ${cat}/${sex}: todayActions length=${plan.todayActions?.length}`);
      }
      // actionPlan phases populated
      if (!plan.actionPlan?.phase_1?.actions?.length || !plan.actionPlan?.phase_2?.actions?.length || !plan.actionPlan?.phase_3?.actions?.length) {
        issues++; console.log(`❌ ${cat}/${sex}: actionPlan empty phase`);
      }
      // findingExplanations 1-per-outlier
      if (plan.findingExplanations.length !== plan.labs.outliers.length) {
        issues++; console.log(`❌ ${cat}/${sex}: findingExplanations ${plan.findingExplanations.length} vs outliers ${plan.labs.outliers.length}`);
      }
      // patternDescriptions 1-per-condition
      if (plan.patternDescriptions.length !== plan.conditions.length) {
        issues++; console.log(`❌ ${cat}/${sex}: patternDescriptions ${plan.patternDescriptions.length} vs conditions ${plan.conditions.length}`);
      }
      // eatingPattern non-empty
      if (!plan.eatingPattern?.name || !plan.eatingPattern.emphasize?.length || !plan.eatingPattern.limit?.length) {
        issues++; console.log(`❌ ${cat}/${sex}: eatingPattern empty (${plan.eatingPattern?.name})`);
      }
      // lifestyleInterventions: each bucket non-empty
      const lb = plan.lifestyleInterventions;
      if (!lb.diet.length || !lb.sleep.length || !lb.exercise.length || !lb.stress.length) {
        issues++; console.log(`❌ ${cat}/${sex}: lifestyleInterventions bucket empty (diet=${lb.diet.length} sleep=${lb.sleep.length} ex=${lb.exercise.length} stress=${lb.stress.length})`);
      }
      // tellDoctor: 1 per condition (capped 8)
      if (plan.conditions.length > 0 && plan.tellDoctor.length === 0) {
        issues++; console.log(`❌ ${cat}/${sex}: tellDoctor empty despite conditions`);
      }
      // executiveSummary: at most 5
      if (plan.executiveSummary.length > 5) {
        issues++; console.log(`❌ ${cat}/${sex}: executiveSummary > 5`);
      }
      // No undefined fields
      for (const f of REQUIRED_FIELDS) {
        if ((plan as any)[f] === undefined) {
          issues++; console.log(`❌ ${cat}/${sex}: ${f} undefined`);
        }
      }
    }
  }
}

console.log(`\nRan ${total} patients across 3 categories × 2 sexes (100 each)`);
console.log(`Field-integrity issues: ${issues === 0 ? '✅ 0' : '❌ ' + issues}`);
console.log(issues === 0 ? `\n✅ PROSE TEMPLATES PASS` : `\n❌ FAILURES DETECTED`);
Deno.exit(issues === 0 ? 0 : 1);
