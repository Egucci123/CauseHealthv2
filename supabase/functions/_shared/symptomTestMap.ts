// supabase/functions/_shared/symptomTestMap.ts
//
// SINGLE SOURCE OF TRUTH for symptom → required test workups.
//
// Used both:
//  - As prompt context (the AI sees this map and is asked to honor it)
//  - As deterministic backstop (post-AI, we verify each user-reported symptom
//    has its mandated tests in retest_timeline; inject any that are missing)
//
// Adding a symptom: pick canonical key (snake_case). Add aliases users type.
// `tests` are retest registry keys. `maleAdds` / `femaleAdds` add sex-specific
// extras.

export interface SymptomDef {
  key: string;
  label: string;
  aliases: RegExp[];
  tests: string[];
  maleAdds?: string[];
  femaleAdds?: string[];
  // Severity threshold under which we don't trigger workup (severity 1-10).
  // Default 4 — only investigate when symptom is at least mid-tier.
  minSeverity?: number;
}

export const SYMPTOMS: SymptomDef[] = [
  {
    key: 'fatigue',
    label: 'Chronic fatigue',
    aliases: [/fatigue/i, /\btired\b/i, /exhaust/i, /low energy/i, /chronic fatigue/i],
    tests: ['cbc', 'iron_panel', 'vit_b12_workup', 'vit_d_25oh', 'thyroid_panel', 'hba1c', 'am_cortisol_if_hpa'],
    maleAdds: ['testosterone_total_free'],
  },
  {
    key: 'brain_fog',
    label: 'Brain fog / poor memory / difficulty concentrating',
    aliases: [/brain fog/i, /poor memory/i, /memory problems/i, /\bforgetful/i, /difficulty concentrating/i, /can'?t (focus|concentrate)/i],
    tests: ['vit_b12_workup', 'vit_d_25oh', 'thyroid_panel', 'iron_panel', 'hba1c'],
  },
  {
    key: 'joint_pain',
    label: 'Joint pain / stiffness',
    aliases: [/joint pain/i, /joint stiffness/i, /arthralg/i, /\bstiff/i, /achy joints/i, /hip pain/i, /knee pain/i, /shoulder pain/i],
    tests: ['hs_crp', 'esr', 'vit_d_25oh', 'uric_acid'],
  },
  {
    key: 'muscle_pain',
    label: 'Muscle pain / weakness / cramps',
    aliases: [/muscle pain/i, /muscle ache/i, /\bcramp/i, /muscle weakness/i, /\bmyalg/i, /muscle stiffness/i],
    tests: ['rbc_magnesium', 'vit_d_25oh', 'ck_if_muscle_symptoms'],
  },
  {
    key: 'hair_loss',
    label: 'Hair loss / thinning',
    aliases: [/hair loss/i, /hair thin/i, /hair fall/i, /shedding hair/i],
    tests: ['iron_panel', 'vit_d_25oh', 'thyroid_panel', 'thyroid_antibodies'],
    femaleAdds: ['androgen_panel'],
  },
  {
    key: 'weight_gain',
    label: 'Weight gain / can\'t lose weight / slow metabolism',
    aliases: [/weight gain/i, /can'?t lose weight/i, /difficulty losing weight/i, /slow metab/i, /metabolism/i],
    tests: ['fasting_insulin_homa_ir', 'hba1c', 'thyroid_panel', 'am_cortisol_if_hpa'],
    maleAdds: ['testosterone_total_free'],
  },
  {
    key: 'sleep_issues',
    label: 'Sleep problems / insomnia / waking nightly',
    aliases: [/difficulty (falling|staying) asleep/i, /\binsomn/i, /waking (during|in the) night/i, /can'?t sleep/i, /sleep (problem|issue)/i, /restless legs/i],
    tests: ['rbc_magnesium', 'vit_d_25oh', 'iron_panel', 'am_cortisol_if_hpa', 'thyroid_panel'],
  },
  {
    key: 'low_mood',
    label: 'Depression / low mood',
    aliases: [/depress/i, /low mood/i, /\bsad\b/i, /hopeless/i, /unhappy/i],
    tests: ['vit_d_25oh', 'vit_b12_workup', 'thyroid_panel'],
    maleAdds: ['testosterone_total_free'],
  },
  {
    key: 'anxiety',
    label: 'Anxiety',
    aliases: [/\banxiety\b/i, /anxious/i, /worried/i, /panic/i],
    tests: ['rbc_magnesium', 'thyroid_panel', 'am_cortisol_if_hpa'],
  },
  {
    key: 'gi_bloating',
    label: 'GI: bloating / gas / altered stool',
    aliases: [/\bgas\b/i, /bloat/i, /diarrhea/i, /constipation/i, /\bibs\b/i, /altered stool/i],
    tests: ['celiac_serology', 'cmp', 'fecal_calprotectin'],
  },
  {
    key: 'food_sensitivities',
    label: 'Food sensitivities',
    aliases: [/food sensitiv/i, /food intoler/i, /food reaction/i],
    tests: ['celiac_serology', 'iron_panel', 'cbc'],
  },
  {
    key: 'cold_intolerance',
    label: 'Cold hands / feet / cold intolerance',
    aliases: [/cold hands/i, /cold feet/i, /cold intoler/i, /always cold/i],
    tests: ['thyroid_panel', 'thyroid_antibodies', 'iron_panel', 'reverse_t3'],
  },
  {
    key: 'heat_intolerance',
    label: 'Heat intolerance',
    aliases: [/heat intoler/i, /\bsweating\b/i, /always hot/i],
    tests: ['thyroid_panel', 'tsi_antibodies'],
  },
  {
    key: 'palpitations',
    label: 'Palpitations',
    aliases: [/palpitation/i, /heart racing/i, /heart pounding/i, /irregular heartbeat/i],
    tests: ['thyroid_panel', 'cmp', 'cbc', 'rbc_magnesium'],
  },
  {
    key: 'low_libido',
    label: 'Low libido / sexual dysfunction',
    aliases: [/low libido/i, /low sex drive/i, /\bed\b.*\b(erect|sex)/i, /sexual dysfunction/i],
    tests: ['shbg', 'thyroid_panel', 'prolactin'],
    maleAdds: ['testosterone_total_free', 'estradiol_male'],
    femaleAdds: ['estradiol_progesterone_testosterone'],
  },
  {
    key: 'low_t_symptoms',
    label: 'Low testosterone symptoms',
    aliases: [/low testosterone/i, /low\W*t (symptom|sign)/i, /low\W*t\b/i],
    tests: ['testosterone_total_free', 'shbg', 'lh_fsh', 'estradiol_male'],
  },
  {
    key: 'sugar_cravings',
    label: 'Sugar cravings',
    aliases: [/sugar craving/i, /carb craving/i, /\bcrave (sugar|sweet|carb)/i],
    tests: ['fasting_insulin_homa_ir', 'hba1c'],
  },
  {
    key: 'allergies_worsening',
    label: 'Allergies worsening / hives / rash',
    aliases: [/allergies worsening/i, /worse allergies/i, /hives/i, /rash/i],
    tests: ['vit_d_25oh', 'eosinophil_count', 'total_ige_if_allergic'],
  },
  {
    key: 'inflammation_general',
    label: 'Generalized inflammation',
    aliases: [/\binflammation\b/i, /chronic inflam/i, /swelling/i],
    tests: ['hs_crp', 'esr', 'vit_d_25oh'],
  },
  {
    key: 'frequent_infections',
    label: 'Frequent infections / sick often',
    aliases: [/frequent infection/i, /sick often/i, /always sick/i, /catch.*cold/i],
    tests: ['cbc', 'vit_d_25oh', 'iron_panel'],
  },
  {
    key: 'frequent_urination_thirst',
    label: 'Frequent urination / excessive thirst',
    aliases: [/frequent urination/i, /excessive thirst/i, /always thirsty/i, /polydips/i, /polyur/i],
    tests: ['hba1c', 'fasting_insulin_homa_ir', 'cmp'],
  },
  {
    key: 'acne',
    label: 'Acne',
    aliases: [/\bacne\b/i, /\bpimples\b/i, /breakouts/i],
    tests: ['liver_panel', 'fasting_insulin_homa_ir'],
    femaleAdds: ['androgen_panel'],
  },
  {
    key: 'hot_flashes',
    label: 'Hot flashes / night sweats',
    aliases: [/hot flash/i, /night sweat/i, /vasomotor/i],
    tests: ['estradiol_progesterone_testosterone', 'thyroid_panel'],
  },
];

const BY_KEY = new Map<string, SymptomDef>(SYMPTOMS.map(s => [s.key, s]));

/**
 * Detect symptom keys present in the user's symptoms text.
 * `symptomsTextWithSeverity` is the format used by edge functions:
 * "fatigue (5/10), hair loss (8/10), …"
 */
export function detectSymptoms(symptomsTextWithSeverity: string): string[] {
  const hits: string[] = [];
  for (const s of SYMPTOMS) {
    if (s.aliases.some(re => re.test(symptomsTextWithSeverity))) hits.push(s.key);
  }
  return hits;
}

/** Required tests for a given symptom + sex. */
export function requiredTestsForSymptom(symptomKey: string, sex: string | null): string[] {
  const def = BY_KEY.get(symptomKey);
  if (!def) return [];
  const tests = [...def.tests];
  const lowerSex = (sex ?? '').toLowerCase();
  if (lowerSex === 'male' && def.maleAdds) tests.push(...def.maleAdds);
  if (lowerSex === 'female' && def.femaleAdds) tests.push(...def.femaleAdds);
  return tests;
}

/** Required tests across all detected symptoms (deduped). */
export function requiredTestsForAllSymptoms(symptomsText: string, sex: string | null): string[] {
  const hits = detectSymptoms(symptomsText);
  const set = new Set<string>();
  for (const k of hits) {
    requiredTestsForSymptom(k, sex).forEach(t => set.add(t));
  }
  return [...set];
}

export function getSymptom(key: string): SymptomDef | undefined {
  return BY_KEY.get(key);
}

export const SYMPTOM_REGISTRY = SYMPTOMS;
