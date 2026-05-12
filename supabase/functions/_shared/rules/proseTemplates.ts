// supabase/functions/_shared/rules/proseTemplates.ts
//
// DETERMINISTIC PROSE TEMPLATES
// =============================
// Outputs that used to require AI generation are now produced by
// templates from the engine. Each function takes ClinicalFacts-style
// inputs and produces the same JSON the AI used to generate.
//
// Coverage:
//   - today_actions (3-item array)
//   - phase_actions (3 phases × 5-9 actions)
//   - finding_explanations (1 per lab outlier)
//   - pattern_descriptions (1 per condition)
//   - eating_pattern (rule-based selection from 6 patterns)
//   - lifestyle_interventions (template library by signal)
//   - tell_doctor (derived from condition.what_to_ask_doctor)
//   - executive_summary (5 bullets from top facts)
//
// Cost savings: ~$0.10 per generation by eliminating these AI calls
// (or shrinking them to "use verbatim from FACTS").

import type { SupplementCandidate } from './supplementRules.ts';
import type { LabOutlierFact, ClinicalFacts } from '../buildPlan.ts';
import type { SuspectedConditionFact } from './conditionRules.ts';
import type { DepletionFact } from './depletionRules.ts';

// ──────────────────────────────────────────────────────────────────────
// TODAY ACTIONS — 3 verb-led items for "what to do today"
// ──────────────────────────────────────────────────────────────────────

export interface TodayAction {
  emoji: string;
  action: string;
  why: string;
  category: 'eat' | 'move' | 'take' | 'sleep' | 'stress';
}

export function buildTodayActions(facts: ClinicalFacts): TodayAction[] {
  const actions: TodayAction[] = [];

  // 1. CRITICAL OUTLIER ACTION (if present)
  const criticalOutlier = facts.labs.outliers.find(o => o.flag.startsWith('critical'));
  if (criticalOutlier) {
    actions.push({
      emoji: '⚠️',
      action: `Schedule a PCP visit this week to discuss your ${criticalOutlier.marker} of ${criticalOutlier.value}.`,
      why: `${criticalOutlier.marker} ${criticalOutlier.value} is in the critical range and needs near-term attention.`,
      category: 'take',
    });
  }

  // 2. TOP-PRIORITY SUPPLEMENT (critical > high) — exactly ONE
  const topSupp = facts.supplementCandidates.find(s =>
    s.priority === 'critical' || s.priority === 'high'
  ) ?? facts.supplementCandidates[0];
  if (topSupp && actions.length < 3) {
    actions.push({
      emoji: topSupp.emoji ?? '💊',
      action: `Start ${topSupp.nutrient} ${topSupp.dose} ${topSupp.timing.toLowerCase()}.`,
      why: topSupp.whyShort,
      category: 'take',
    });
  }

  // 3. BEHAVIOR ANCHORS — by patient signal
  const symptomsLower = facts.patient.symptoms.map(s => s.name.toLowerCase()).join(' ');
  const hasSleepIssue = /sleep|insomn|wak|unrefreshing|night/.test(symptomsLower);
  const hasFatigue = /fatigue|exhaust|tired|energy crash|low energy/.test(symptomsLower);
  const hasHighTG = facts.labs.outliers.some(o => /triglyc/i.test(o.marker) && o.value > 200);
  const hasHighCortisol = facts.labs.outliers.some(o => /cortisol/i.test(o.marker) && o.flag === 'high');
  const hasHemoconcentration = facts.conditions.some(c => /hemoconcentration|underhydration/i.test(c.name));
  const onStatin = /atorvastatin|simvastatin|rosuvastatin|pravastatin|lovastatin/.test(
    facts.patient.meds.join(' ').toLowerCase()
  );

  while (actions.length < 3) {
    if (hasHemoconcentration && !actions.some(a => /water/i.test(a.action))) {
      actions.push({
        emoji: '💧',
        action: 'Drink 3 liters of filtered water today with a pinch of sea salt or electrolytes.',
        why: 'Your albumin and red-cell numbers point to dehydration — hydration trial is the first step.',
        category: 'eat',
      });
      continue;
    }
    if (hasSleepIssue && !actions.some(a => /bedtime|sleep/i.test(a.action))) {
      actions.push({
        emoji: '🛏️',
        action: 'Set a bedtime alarm 8.5 hours before your wake time and protect it tonight.',
        why: 'Sleep debt amplifies inflammation, blood sugar, and fatigue — fix this first.',
        category: 'sleep',
      });
      continue;
    }
    if (hasFatigue && !actions.some(a => /walk|move/i.test(a.action))) {
      actions.push({
        emoji: '🚶',
        action: 'Take a 20-minute walk after lunch — outdoors if possible.',
        why: 'Post-meal walking improves insulin sensitivity and afternoon energy.',
        category: 'move',
      });
      continue;
    }
    if (hasHighTG && !actions.some(a => /sugar|carb|grain/i.test(a.action))) {
      actions.push({
        emoji: '🍽️',
        action: 'Cut added sugar and refined carbs today — start with replacing breakfast carbs with eggs.',
        why: 'Triglycerides respond fast to diet — 30-50% drop possible in 12 weeks with consistency.',
        category: 'eat',
      });
      continue;
    }
    if (hasHighCortisol && !actions.some(a => /breath|stress|meditat/i.test(a.action))) {
      actions.push({
        emoji: '🧘',
        action: 'Do 4-7-8 breathing 3× today (4-count inhale, 7-count hold, 8-count exhale).',
        why: 'Slow exhale-dominant breathing drops cortisol within minutes; daily practice compounds.',
        category: 'stress',
      });
      continue;
    }
    // Universal default — hydration
    if (!actions.some(a => /water/i.test(a.action))) {
      actions.push({
        emoji: '💧',
        action: 'Drink 2-3 liters of water today; aim for pale-yellow urine.',
        why: 'Hydration is the foundation — most adults underdrink and it shows up on labs.',
        category: 'eat',
      });
      continue;
    }
    // Universal default — sleep
    if (!actions.some(a => /sleep|bedtime/i.test(a.action))) {
      actions.push({
        emoji: '🛏️',
        action: 'Set a bedtime that protects 8 hours of sleep tonight.',
        why: 'Consistent sleep is upstream of every metabolic and mood number.',
        category: 'sleep',
      });
      continue;
    }
    break;
  }
  return actions.slice(0, 3);
}

// ──────────────────────────────────────────────────────────────────────
// PHASE ACTIONS — 3 phases × 5-9 actions each
// ──────────────────────────────────────────────────────────────────────

export interface PhaseActions {
  name: string;
  focus: string;
  actions: string[];
}

export interface ActionPlan {
  phase_1: PhaseActions;
  phase_2: PhaseActions;
  phase_3: PhaseActions;
}

export function buildPhaseActions(facts: ClinicalFacts): ActionPlan {
  const supps = facts.supplementCandidates;
  const topSupps = supps.slice(0, 4);
  const meds = facts.patient.meds.join(', ');
  const hasMetabolic = facts.conditions.some(c => /metabolic|insulin|prediab|nafld/i.test(c.name));
  const hasInflammation = facts.conditions.some(c => /ibd|crohn|colitis|ra|lupus|psoriasis|hepatic/i.test(c.name));
  const hasFatigue = facts.patient.symptoms.some(s => /fatigue|exhaust|tired|energy/i.test(s.name));
  const ageOver40 = (facts.patient.age ?? 0) >= 40;

  // PHASE 1: STABILIZE (Weeks 1-4)
  const phase1Actions: string[] = [];
  // Sleep anchor
  phase1Actions.push('🛏️ Set a consistent bedtime that protects 8 hours of sleep; same wake time every day, including weekends.');
  // Hydration
  phase1Actions.push('💧 Drink 2.5-3 liters of water daily; add electrolytes if you exercise or sweat heavily.');
  // Start supplements
  for (const s of topSupps.slice(0, 3)) {
    phase1Actions.push(`${s.emoji ?? '💊'} Start ${s.nutrient} ${s.dose} ${s.timing.toLowerCase()}.`);
  }
  // Food basics
  if (hasMetabolic) {
    phase1Actions.push('🍽️ Anchor every meal around protein (palm-sized) + non-starchy vegetables; cut added sugar and refined carbs.');
  } else {
    phase1Actions.push('🍽️ Build meals around whole foods: protein, vegetables, healthy fats. Limit ultra-processed foods.');
  }
  // Movement
  phase1Actions.push('🚶 Walk 20-30 minutes daily, especially after meals — improves insulin sensitivity and digestion.');

  const phase1Focus = hasInflammation
    ? 'Calm the inflammation, stabilize sleep + hydration, start the critical supplements. No new exercise stress yet.'
    : hasMetabolic
    ? 'Stabilize blood sugar and triglycerides with sleep, hydration, and the metabolic supplements. Lay the food foundation.'
    : 'Build the foundation: sleep, hydration, food basics, and your priority supplements.';

  // PHASE 2: OPTIMIZE (Weeks 5-8)
  const phase2Actions: string[] = [];
  phase2Actions.push('💪 Add resistance training 2-3x/week (start light, focus on form): squats, push-ups, rows, plank.');
  phase2Actions.push('🏃 Add 2x/week of 30-min zone-2 cardio (conversational pace, nose-breathing comfortable).');
  if (hasMetabolic) {
    phase2Actions.push('🍽️ Push toward 30g+ protein per meal and 25-35g fiber daily — both drive metabolic improvement.');
  } else if (hasInflammation) {
    phase2Actions.push('🥗 Increase anti-inflammatory foods: fatty fish 2-3x/week, leafy greens daily, berries daily.');
  } else {
    phase2Actions.push('🥗 Refine your eating pattern — explore intermittent eating (12-14 hr overnight fast).');
  }
  // Add remaining supplements
  for (const s of topSupps.slice(3)) {
    phase2Actions.push(`${s.emoji ?? '💊'} Add ${s.nutrient} ${s.dose} ${s.timing.toLowerCase()}.`);
  }
  if (hasFatigue) {
    phase2Actions.push('☀️ Get 10-15 minutes of morning sunlight daily — anchors circadian rhythm and improves daytime energy.');
  }
  phase2Actions.push('🧘 Add daily stress practice — 5-10 min breathwork, meditation, or walking without your phone.');

  // PHASE 3: MAINTAIN + RETEST (Weeks 9-12)
  const phase3Actions: string[] = [];
  phase3Actions.push('🧪 At Week 12, draw the full retest panel — your doctor-prep sheet has the exact list with ICD-10 codes for insurance.');
  phase3Actions.push('🩺 Schedule the PCP visit 1 week after the lab draw so results are in hand for the conversation.');
  phase3Actions.push('💪 Progress resistance training to 3 sets of 10-12 reps; keep zone-2 cardio at 90+ min/week.');
  phase3Actions.push('🍽️ Lock in your eating pattern. By now you should know which foods drive symptoms and which support you.');
  if (meds.length > 0) {
    phase3Actions.push(`💬 Discuss with your PCP whether any current medications can be reduced based on your retest numbers.`);
  }
  if (ageOver40) {
    phase3Actions.push('📊 Review your CV risk numbers (ApoB, Lp(a), hs-CRP) with your PCP — they\'ll guide what to monitor going forward.');
  }
  phase3Actions.push('🔁 Maintain the supplement stack and lifestyle changes; reassess in 6 months unless retest shows new signals.');

  return {
    phase_1: {
      name: 'Stabilize (Weeks 1-4)',
      focus: phase1Focus,
      actions: phase1Actions.slice(0, 9),
    },
    phase_2: {
      name: 'Optimize (Weeks 5-8)',
      focus: 'Add training + push diet refinement. Layer in the rest of the supplement stack.',
      actions: phase2Actions.slice(0, 9),
    },
    phase_3: {
      name: 'Maintain (Weeks 9-12)',
      focus: 'Lock in the gains. Retest. PCP visit to interpret. Set the next 6-month direction.',
      actions: phase3Actions.slice(0, 9),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// FINDING EXPLANATIONS — 1 per lab outlier
// ──────────────────────────────────────────────────────────────────────

export interface FindingExplanation {
  marker: string;
  explanation: string;
  what_to_do: string;
}

export function buildFindingExplanations(facts: ClinicalFacts): FindingExplanation[] {
  return facts.labs.outliers.map(o => {
    const flag = o.flag;
    const isExpected = facts.expectedFindings.some(e => e.marker === o.marker);
    if (isExpected) {
      const exp = facts.expectedFindings.find(e => e.marker === o.marker)!;
      return {
        marker: o.marker,
        explanation: `${o.marker} ${o.value} — expected for your ${exp.conditionLabel}. ${exp.rationale}`,
        what_to_do: 'No specific action needed for this marker — it\'s tracking with your known condition.',
      };
    }
    const direction = flag.includes('high') ? 'above' : flag.includes('low') ? 'below' : 'pressed toward';
    const severity = flag.startsWith('critical') ? 'critically ' : flag === 'watch' ? 'borderline ' : '';
    return {
      marker: o.marker,
      explanation: `${o.marker} ${o.value} ${o.unit} is ${severity}${direction} the lab's reference range. ${o.interpretation ?? ''}`.trim(),
      what_to_do: flag.startsWith('critical')
        ? 'Schedule a PCP visit this week to discuss this value.'
        : flag === 'watch'
        ? `Bring this to your next PCP visit; track at the 12-week retest.`
        : `Discuss with your PCP at the 12-week retest along with the recommended workup.`,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────
// PATTERN DESCRIPTIONS — 1 per condition
// ──────────────────────────────────────────────────────────────────────

export interface PatternDescription {
  name: string;
  description: string;
  likely_cause: string;
}

export function buildPatternDescriptions(facts: ClinicalFacts): PatternDescription[] {
  return facts.conditions.map(c => ({
    name: c.name,
    description: c.evidence,
    likely_cause: c.what_to_ask_doctor ?? 'Discuss the confirmatory tests with your PCP.',
  }));
}

// ──────────────────────────────────────────────────────────────────────
// EATING PATTERN — rule-based selection from 6 patterns
// ──────────────────────────────────────────────────────────────────────

export interface EatingPattern {
  name: string;
  rationale: string;
  emphasize: string[];
  limit: string[];
}

const EATING_PATTERNS: Record<string, EatingPattern> = {
  ibd_friendly: {
    name: 'IBD-Friendly Modified',
    rationale: 'Reduces gut irritation while maintaining nutrient density. Specifically curated for IBD in remission or active disease.',
    emphasize: [
      'Cooked vegetables over raw (better tolerated)',
      'Fatty fish 2-3x/week (salmon, sardines)',
      'Bone broth, eggs, white rice, soft fruits',
      'Olive oil, coconut oil (gentle fats)',
      'Probiotic-rich foods (kefir, yogurt if tolerated)',
    ],
    limit: [
      'Raw cruciferous vegetables (broccoli, cauliflower) during flares',
      'High-fiber legumes during flares',
      'Spicy foods, alcohol, caffeine if symptomatic',
      'Ultra-processed foods and emulsifiers',
      'Sugar alcohols (sorbitol, mannitol)',
    ],
  },
  anti_inflammatory: {
    name: 'Anti-Inflammatory',
    rationale: 'Reduces systemic inflammation that drives liver enzymes, joint pain, mood symptoms, and CV risk.',
    emphasize: [
      'Leafy greens and cruciferous vegetables (broccoli, kale, cabbage)',
      'Fatty fish (salmon, mackerel, sardines) twice weekly',
      'Berries, tart cherry, and colorful fruit',
      'Extra-virgin olive oil and avocados',
      'Turmeric, ginger, garlic, green tea',
    ],
    limit: [
      'Refined carbohydrates and added sugars',
      'Seed oils (canola, soy) and ultra-processed foods',
      'High-sodium processed meats',
      'Excess alcohol',
      'Caffeine after 2 PM',
    ],
  },
  lower_glycemic_med: {
    name: 'Lower-Glycemic Mediterranean',
    rationale: 'Mediterranean foundation with carb timing/portion control — best fit for insulin resistance, prediabetes, T2D, NAFLD.',
    emphasize: [
      '30g+ protein per meal (eggs, fish, chicken, legumes)',
      'Non-starchy vegetables filling half the plate',
      'Olive oil, avocados, nuts (1-2 servings)',
      'Lower-glycemic carbs (lentils, beans, quinoa, berries)',
      '12-14 hour overnight fast (e.g., 7 PM to 9 AM)',
    ],
    limit: [
      'Added sugars, sweetened drinks, fruit juice',
      'Refined grains (white bread, pasta, crackers)',
      'Late-evening eating (after 8 PM)',
      'Processed snack foods',
      'Excess alcohol',
    ],
  },
  dash_med_hybrid: {
    name: 'DASH-Mediterranean Hybrid',
    rationale: 'DASH principles (low sodium, high potassium) combined with Mediterranean fats — best for HTN + CV risk.',
    emphasize: [
      'Potassium-rich foods (leafy greens, beans, sweet potato, banana)',
      'Magnesium-rich foods (pumpkin seeds, dark chocolate, leafy greens)',
      'Fatty fish 2-3x/week',
      'Whole grains (oats, quinoa, brown rice)',
      'Unsalted nuts, beans, lentils',
    ],
    limit: [
      'Sodium <2300 mg/day (read labels; salt is hidden in processed foods)',
      'Processed meats (deli meat, bacon, sausage)',
      'Sugary drinks and added sugars',
      'Excess alcohol',
      'Trans fats and fried foods',
    ],
  },
  plant_forward: {
    name: 'Plant-Forward Mediterranean',
    rationale: 'Plant-emphasis foundation — strong fit for general health, longevity, and patients who tolerate plant fibers well.',
    emphasize: [
      'Beans and lentils as protein base (4-5x/week)',
      'Vegetables filling 50%+ of the plate',
      'Whole grains (quinoa, oats, brown rice)',
      'Nuts and seeds (1-2 servings daily)',
      'Olive oil as primary fat',
    ],
    limit: [
      'Ultra-processed plant-based meat alternatives',
      'Refined grains and added sugars',
      'Excess alcohol',
      'Hydrogenated oils',
      'Sugary beverages',
    ],
  },
  mediterranean: {
    name: 'Mediterranean',
    rationale: 'Highest-evidence diet pattern for cardiovascular health, longevity, and overall metabolic flexibility.',
    emphasize: [
      'Vegetables and fruits (5-9 servings/day)',
      'Fish and seafood (2-3x/week)',
      'Olive oil as primary fat',
      'Whole grains, beans, nuts',
      'Moderate dairy (yogurt, cheese), modest red meat (1x/week)',
    ],
    limit: [
      'Added sugars and sweetened beverages',
      'Refined grains and ultra-processed foods',
      'Excess red and processed meats',
      'Trans fats',
      'Excess alcohol (max 1/day women, 2/day men)',
    ],
  },
};

export function selectEatingPattern(facts: ClinicalFacts): EatingPattern {
  const conds = facts.patient.conditions.join(' ').toLowerCase();
  const condNames = facts.conditions.map(c => c.name.toLowerCase()).join(' ');
  const combined = conds + ' ' + condNames;

  if (/ibd|crohn|colitis|ulcerative/.test(combined)) return EATING_PATTERNS.ibd_friendly;
  if (/nafld|fatty liver|hepatic stress|hepatitis|cirrhos/.test(combined)) return EATING_PATTERNS.anti_inflammatory;
  if (/insulin resistance|prediab|metabolic syndrome|t2d|type 2 diabetes|nafld/.test(combined)) return EATING_PATTERNS.lower_glycemic_med;
  if (/hypertension|htn|coronary|cad|stroke|atrial fib/.test(combined)) return EATING_PATTERNS.dash_med_hybrid;
  if (/lupus|rheumatoid|psoriasis|autoimmune|hashimoto|graves/.test(combined)) return EATING_PATTERNS.anti_inflammatory;
  if (/vegan|vegetarian|plant/.test(combined)) return EATING_PATTERNS.plant_forward;
  return EATING_PATTERNS.mediterranean;
}

// ──────────────────────────────────────────────────────────────────────
// LIFESTYLE INTERVENTIONS — template library by signal
// ──────────────────────────────────────────────────────────────────────

export interface LifestyleItem {
  emoji: string;
  intervention: string;
  rationale: string;
  priority: 'critical' | 'high' | 'moderate';
}

export interface LifestyleBuckets {
  diet: LifestyleItem[];
  sleep: LifestyleItem[];
  exercise: LifestyleItem[];
  stress: LifestyleItem[];
}

export function buildLifestyleInterventions(facts: ClinicalFacts): LifestyleBuckets {
  const condNames = facts.conditions.map(c => c.name.toLowerCase()).join(' ');
  const sxNames = facts.patient.symptoms.map(s => s.name.toLowerCase()).join(' ');
  const conds = facts.patient.conditions.join(' ').toLowerCase();
  const everything = condNames + ' ' + sxNames + ' ' + conds;

  const diet: LifestyleItem[] = [];
  const sleep: LifestyleItem[] = [];
  const exercise: LifestyleItem[] = [];
  const stress: LifestyleItem[] = [];

  // DIET
  if (/insulin|prediab|metabolic|nafld|t2d|triglyc/.test(everything)) {
    diet.push({ emoji:'🍽️', intervention:'30g+ protein at every meal', rationale:'Stabilizes blood sugar and reduces afternoon crashes.', priority:'high' });
    diet.push({ emoji:'🍞', intervention:'Replace refined grains with whole grains or none', rationale:'Drops triglycerides and improves insulin response.', priority:'high' });
  }
  if (/ibd|crohn|colitis/.test(everything)) {
    diet.push({ emoji:'🥣', intervention:'Cook vegetables instead of eating raw', rationale:'Easier digestion in IBD; preserves nutrient absorption.', priority:'high' });
  }
  if (/hypertension|htn|cad/.test(everything)) {
    diet.push({ emoji:'🧂', intervention:'Reduce sodium to <2300 mg/day', rationale:'Drops BP 5-10 mmHg in salt-sensitive adults.', priority:'high' });
  }
  if (diet.length === 0) {
    diet.push({ emoji:'🥗', intervention:'Build meals around protein + vegetables + healthy fats', rationale:'Foundation of metabolic health.', priority:'moderate' });
  }
  if (diet.length < 3) {
    diet.push({ emoji:'💧', intervention:'Drink 2.5-3L water daily', rationale:'Foundation hydration; visible on labs within 2 weeks.', priority:'moderate' });
  }

  // SLEEP
  sleep.push({ emoji:'🛏️', intervention:'Protect 8 hours of sleep with consistent bedtime', rationale:'Sleep is upstream of every metabolic and mood number.', priority:'critical' });
  if (/insomn|sleep|wak|fatigue/.test(everything)) {
    sleep.push({ emoji:'🌙', intervention:'No screens 90 min before bed; use blue-light glasses if needed', rationale:'Drops melatonin suppression, improves sleep onset.', priority:'high' });
  }
  sleep.push({ emoji:'☀️', intervention:'10-15 min morning sunlight within 1 hour of waking', rationale:'Anchors circadian rhythm; improves daytime energy and nighttime sleep.', priority:'high' });
  if (/snor|apnea|hemoconcentration/.test(everything)) {
    sleep.push({ emoji:'🛌', intervention:'Side-sleep position or wedge pillow if snoring', rationale:'Reduces airway collapse in mild sleep apnea.', priority:'moderate' });
  }

  // EXERCISE
  exercise.push({ emoji:'🚶', intervention:'Walk 20-30 min daily, especially after meals', rationale:'Post-meal walking drops glucose 20-30%.', priority:'high' });
  exercise.push({ emoji:'💪', intervention:'Resistance training 2-3x/week', rationale:'Builds metabolic reserve; preserves muscle with age.', priority:'high' });
  if (/cad|coronary|metabolic|fatigue/.test(everything)) {
    exercise.push({ emoji:'🏃', intervention:'Zone-2 cardio 90-150 min/week (conversational pace)', rationale:'Mitochondrial training; improves CV and metabolic markers.', priority:'high' });
  }

  // STRESS
  stress.push({ emoji:'🧘', intervention:'Daily breathwork or meditation 5-10 min', rationale:'Drops cortisol within minutes; compounds over weeks.', priority:'high' });
  if (/cortisol|cushing|stress|anxiety|fatigue/.test(everything)) {
    stress.push({ emoji:'🌳', intervention:'Outdoor time 20+ min/day, ideally green space', rationale:'Reduces cortisol and inflammatory markers in trials.', priority:'high' });
  }
  if (/anxiety|depress|mood/.test(everything)) {
    stress.push({ emoji:'📵', intervention:'Phone-free first hour after waking', rationale:'Protects morning cortisol rhythm and mental clarity.', priority:'moderate' });
  }
  if (stress.length < 2) {
    stress.push({ emoji:'😌', intervention:'5 min nervous-system reset midday (deep breaths or walk)', rationale:'Resets HPA axis; prevents afternoon stress accumulation.', priority:'moderate' });
  }

  return {
    diet: diet.slice(0, 5),
    sleep: sleep.slice(0, 5),
    exercise: exercise.slice(0, 5),
    stress: stress.slice(0, 5),
  };
}

// ──────────────────────────────────────────────────────────────────────
// TELL_DOCTOR — derived from condition.what_to_ask_doctor
// ──────────────────────────────────────────────────────────────────────

export interface TellDoctorItem {
  emoji: string;
  headline: string;
  detail: string;
}

const EMOJI_BY_CATEGORY: Record<string, string> = {
  thyroid:'🦋', cardiovascular:'❤️', liver:'🧪', metabolic:'🍽️', kidney:'🚰',
  bone:'🦴', hormonal:'⚖️', adrenal:'⚡', gi:'🛡️', autoimmune:'🛡️',
  iron_overload:'🩸', anemia:'🩸', b12:'💊', vitamin_d:'☀️', cancer_screen:'🔬',
};

function emojiForCondition(name: string): string {
  const l = name.toLowerCase();
  if (/thyroid|hashimoto|graves/.test(l)) return '🦋';
  if (/lipid|cholesterol|cv|coronary/.test(l)) return '❤️';
  if (/liver|hepatic|nafld/.test(l)) return '🧪';
  if (/metabolic|insulin|prediab|t2d/.test(l)) return '🍽️';
  if (/kidney|ckd|renal/.test(l)) return '🚰';
  if (/iron|hemochromatos/.test(l)) return '🩸';
  if (/anemia|b12/.test(l)) return '🩸';
  if (/vitamin d/.test(l)) return '☀️';
  if (/cortisol|cushing|adrenal/.test(l)) return '⚡';
  if (/hemoconcentration|underhydration/.test(l)) return '💧';
  if (/sleep|apnea/.test(l)) return '🛏️';
  return '❓';
}

export function buildTellDoctor(facts: ClinicalFacts): TellDoctorItem[] {
  return facts.conditions.slice(0, 8).map(c => {
    const question = c.what_to_ask_doctor ?? '';
    // First sentence becomes the headline (≤70 chars), rest is detail.
    const sentences = question.split(/(?<=[.?!])\s+/);
    const headline = sentences[0] ? sentences[0].slice(0, 70) : c.name;
    const detail = sentences.slice(1).join(' ').slice(0, 180) || c.evidence.slice(0, 180);
    return {
      emoji: emojiForCondition(c.name),
      headline,
      detail,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────
// EXECUTIVE SUMMARY — top 3-5 bullets from facts
// ──────────────────────────────────────────────────────────────────────

export function buildExecutiveSummary(facts: ClinicalFacts): string[] {
  const bullets: string[] = [];
  // High-confidence patterns first
  const highConditions = facts.conditions.filter(c => c.confidence === 'high').slice(0, 3);
  for (const c of highConditions) {
    bullets.push(`${c.name} — ${c.evidence.slice(0, 100)}`);
  }
  // Then top outliers not yet covered
  for (const o of facts.labs.outliers.slice(0, 2)) {
    if (bullets.some(b => b.toLowerCase().includes(o.marker.toLowerCase()))) continue;
    bullets.push(`${o.marker} ${o.value} ${o.unit} (${o.flag}) — ${o.interpretation ?? 'discuss with PCP'}`);
  }
  // Depletions of note
  const highDepl = facts.depletions.filter(d => d.severity === 'high').slice(0, 1);
  for (const d of highDepl) {
    bullets.push(`${d.medClass} → ${d.nutrient} depletion: ${d.mechanism.slice(0, 80)}`);
  }
  return bullets.slice(0, 5);
}
