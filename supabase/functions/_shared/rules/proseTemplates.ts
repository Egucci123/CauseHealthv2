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
  // 2026-05-12-37: NO TRUNCATION. The engine's evidence and
  // what_to_ask_doctor strings are clinically complete and meant to be
  // read in full. Previously slicing at 70/180 chars produced mid-word
  // truncation ("All your blood numb", "Pattern says you", "ALT").
  // Use the condition name as the headline and the FULL evidence as
  // the detail body. The what_to_ask_doctor question is surfaced
  // separately via buildQuestionsToAsk — no need to split it here.
  return facts.conditions.slice(0, 8).map(c => {
    return {
      emoji: emojiForCondition(c.name),
      headline: c.name,
      detail: c.evidence,
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
  // 2026-05-12-37: no evidence truncation — the engine's strings are
  // clinically complete. Slicing produced mid-word cuts like
  // "All your blood numb".
  for (const c of highConditions) {
    bullets.push(`${c.name} — ${c.evidence}`);
  }
  // Then top outliers not yet covered
  for (const o of facts.labs.outliers.slice(0, 2)) {
    if (bullets.some(b => b.toLowerCase().includes(o.marker.toLowerCase()))) continue;
    bullets.push(`${o.marker} ${o.value} ${o.unit} (${o.flag}) — ${o.interpretation ?? 'discuss with PCP'}`);
  }
  // Depletions of note — 2026-05-12-45 no mechanism truncation
  const highDepl = facts.depletions.filter(d => d.severity === 'high').slice(0, 1);
  for (const d of highDepl) {
    bullets.push(`${d.medClass} → ${d.nutrient} depletion: ${d.mechanism}`);
  }
  return bullets.slice(0, 5);
}

// ──────────────────────────────────────────────────────────────────────
// 2026-05-12-36 — DETERMINISTIC TEMPLATES FOR DOCTOR-PREP NARRATIVE
// Replaces AI-generated chief_complaint, HPI, questions_to_ask, discussion
// points, patient_questions, functional_medicine_note. Engine-derived
// strings only — every claim is traceable to a deterministic fact.
// Universal across every patient.
// ──────────────────────────────────────────────────────────────────────

/** Pure structural age-decade label for prose ("60-year-old" not "60s"). */
function ageLabel(age: number | null): string {
  if (age == null || !Number.isFinite(age)) return 'adult';
  return `${age}-year-old`;
}
function sexLabel(sex: 'male' | 'female' | null): string {
  return sex === 'male' ? 'male' : sex === 'female' ? 'female' : 'patient';
}

/** Chief complaint — clinical phrase, ≤15 words. Universal pattern:
 *  "Follow-up for [primary outlier or condition], [secondary], [tertiary]." */
export function buildChiefComplaint(facts: ClinicalFacts): string {
  const parts: string[] = [];
  // Primary: most severe outlier marker name
  const topOutlier = facts.labs.outliers[0];
  if (topOutlier) {
    const direction = topOutlier.flag.includes('high') ? 'elevated' : topOutlier.flag.includes('low') ? 'low' : 'borderline';
    parts.push(`${direction} ${topOutlier.marker}`);
  }
  // Secondary: top high-confidence condition (different from outlier)
  const topCondition = facts.conditions.find(c => c.confidence === 'high');
  if (topCondition && parts.length < 2) {
    parts.push(topCondition.name.split('(')[0].trim().toLowerCase());
  }
  // Tertiary: top severity-4+ symptom
  const topSymptom = facts.patient.symptoms.find(s => s.severity >= 4);
  if (topSymptom && parts.length < 3) {
    parts.push(topSymptom.name.toLowerCase());
  }
  if (parts.length === 0) return 'Wellness check-in with lab review.';
  return `Follow-up for ${parts.join(', ')}.`;
}

/** HPI — MD-to-MD voice, 2-3 sentences. Structure is canonical:
 *  "[age]-year-old [sex] with [PMH] on [meds]. Recent labs: [outliers].
 *   Reports [symptoms]. [Pattern interpretation if any]." */
export function buildHpi(facts: ClinicalFacts): string {
  const a = ageLabel(facts.patient.age);
  const s = sexLabel(facts.patient.sex);
  // 2026-05-13: include BMI in HPI opener when overweight/obese — it's a
  // significant clinical fact and standard of care to lead with. Universal.
  const bmi = facts.patient.bmi;
  const bmiClause = bmi && bmi >= 25
    ? `, BMI ${bmi.toFixed(1)}${bmi >= 30 ? ` (obese class ${bmi >= 40 ? '3' : bmi >= 35 ? '2' : '1'})` : ' (overweight)'}`
    : '';
  const pmh = facts.patient.conditions.length > 0
    ? `with ${facts.patient.conditions.join(', ')}`
    : '';
  const meds = facts.patient.meds.length > 0
    ? ` on ${facts.patient.meds.join(', ')}`
    : '';
  const opener = `${a} ${s}${bmiClause}${pmh ? ' ' + pmh : ''}${meds}.`;

  const outliers = facts.labs.outliers.slice(0, 4);
  const labLine = outliers.length > 0
    ? ` Recent labs reveal ${outliers.map(o => `${o.marker} ${o.value}`).join(', ')}.`
    : '';

  // 2026-05-13: prioritize CLINICALLY RED-FLAG symptoms in the HPI
  // (gynecomastia, galactorrhea, syncope, hemoptysis, visual changes,
  // night sweats, unintentional weight loss). These deserve to be in
  // the opening narrative because they each trigger a specific workup
  // a generalist might miss. Rest of symptoms still listed after.
  const RED_FLAG_PATTERNS = /gynecomastia|galactorrhea|syncope|hemoptysis|visual change|night sweat|unintentional weight loss|hemoptysis|hematuria|hematochezia|chest pain|severe headache/i;
  const redFlagSx = facts.patient.symptoms.filter(s => RED_FLAG_PATTERNS.test(s.name));
  const otherSx = facts.patient.symptoms.filter(s => s.severity >= 3 && !RED_FLAG_PATTERNS.test(s.name)).slice(0, 4);
  const redFlagLine = redFlagSx.length > 0
    ? ` Notable: ${redFlagSx.map(x => x.name.toLowerCase()).join(', ')}.`
    : '';
  const sxLine = otherSx.length > 0
    ? ` Reports ${otherSx.map(x => x.name.toLowerCase()).join(', ')}.`
    : '';

  const topCondition = facts.conditions[0];
  const patternLine = topCondition
    ? ` Pattern fits ${topCondition.name.toLowerCase()}.`
    : '';

  // 2026-05-12-45: no HPI truncation. Deterministic template can't
  // exceed reasonable length naturally (max 4 outliers + 4 symptoms +
  // condition list = ~500-600 chars worst case for poly-pharmacy patient).
  return opener + labLine + redFlagLine + sxLine + patternLine;
}

/** Patient-voice questions — each tied to a specific finding in FACTS.
 *  Uses engine's per-condition what_to_ask_doctor strings (clinically
 *  curated) + outlier-specific asks for unexplained markers. */
export function buildQuestionsToAsk(
  facts: ClinicalFacts,
): Array<{ emoji: string; question: string; why: string }> {
  const out: Array<{ emoji: string; question: string; why: string }> = [];
  const seen = new Set<string>();

  // 1. Per-condition: the engine's what_to_ask_doctor string is already
  //    a curated question. Use it verbatim.
  for (const c of facts.conditions.slice(0, 6)) {
    const q = c.what_to_ask_doctor;
    if (!q || !q.trim()) continue;
    const k = q.toLowerCase().slice(0, 50);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      emoji: emojiForCondition(c.name),
      question: q,
      why: c.evidence, // 2026-05-12-45 no truncation — full evidence string
    });
    if (out.length >= 8) break;
  }

  // 2. Critical-range outliers without a condition card: ask about workup.
  const criticalOutliers = facts.labs.outliers
    .filter(o => o.flag.startsWith('critical'))
    .filter(o => !facts.conditions.some(c => c.evidence.includes(o.marker)));
  for (const o of criticalOutliers.slice(0, 2)) {
    if (out.length >= 8) break;
    out.push({
      emoji: '⚠️',
      question: `My ${o.marker} is ${o.value} ${o.unit} — what should we do about it?`,
      why: o.interpretation ?? `${o.marker} is in the critical range.`,
    });
  }

  // 3. Depletion-driven: if a medication depletion has a monitoring test,
  //    ask the doctor to order it.
  for (const d of facts.depletions.filter(x => x.severity === 'high').slice(0, 2)) {
    if (out.length >= 8) break;
    if (!d.monitoringTest) continue;
    out.push({
      emoji: '💊',
      question: `Can we check ${d.nutrient} since I'm on ${d.medsMatched[0] ?? d.medClass}?`,
      why: d.mechanism, // 2026-05-12-45 no truncation — full mechanism string
    });
  }
  return out;
}

/** Discussion points — "lead with the ask" prose for the doctor visit.
 *  Each is 1-2 sentences derived from a condition or finding. */
export function buildDiscussionPoints(facts: ClinicalFacts): string[] {
  const out: string[] = [];
  // 1. Top conditions framed as discussion items
  for (const c of facts.conditions.slice(0, 4)) {
    const tests = (c.confirmatory_tests ?? []).slice(0, 2).map((t: any) =>
      typeof t === 'string' ? t : (t?.test ?? ''),
    ).filter(Boolean);
    const testsClause = tests.length > 0 ? ` Tests to discuss: ${tests.join(', ')}.` : '';
    // 2026-05-12-45 no truncation. Use full first sentence of evidence.
    out.push(`${c.name}. ${c.evidence.split('.')[0]}.${testsClause}`);
  }
  // 2. Critical outliers
  const criticalOutliers = facts.labs.outliers.filter(o => o.flag.startsWith('critical')).slice(0, 2);
  for (const o of criticalOutliers) {
    if (out.length >= 6) break;
    out.push(`${o.marker} ${o.value} ${o.unit} is in the critical range — review at the visit and decide on workup or treatment.`);
  }

  // 3. 2026-05-13: GLP-1 / weight-management discussion when BMI ≥35
  // AND metabolic signals (IR / T2D / sugar cravings / weight resistance)
  // AND not already on a GLP-1. Universal rule for adults with class-2+
  // obesity who haven't yet discussed pharmacologic weight management.
  const bmi = facts.patient.bmi ?? 0;
  const onGLP1 = facts.patient.meds.join(' ').toLowerCase().match(/semaglutide|ozempic|wegovy|tirzepatide|mounjaro|zepbound|liraglutide|saxenda|dulaglutide/);
  const condText = (facts.patient.conditions.join(' ') + ' ' + facts.conditions.map(c => c.name).join(' ')).toLowerCase();
  const sxText = facts.patient.symptoms.map(s => s.name.toLowerCase()).join(' ');
  const hasMetabolicSignal = /insulin|prediab|t2d|type 2 diabetes|metabolic syndrome|nafld/.test(condText)
    || /sugar craving|weight resistance|difficulty losing weight|weight gain despite/.test(sxText);
  if (bmi >= 35 && hasMetabolicSignal && !onGLP1 && out.length < 6) {
    out.push(`BMI ${bmi.toFixed(1)} with metabolic signals (insulin resistance / weight-resistance pattern) — discuss whether a GLP-1 agonist (semaglutide, tirzepatide) or SGLT2 inhibitor is appropriate alongside lifestyle changes. Both have strong cardiovascular + glycemic outcome data at this BMI.`);
  }

  // 4. 2026-05-13: psoriasis ↔ metabolic syndrome comorbidity — surface
  // the link as a discussion point so the patient knows to coordinate
  // dermatology with metabolic workup.
  if (/psorias/.test(condText) && bmi >= 27 && out.length < 6) {
    out.push(`Psoriasis is highly comorbid with metabolic syndrome and insulin resistance — your BMI + lab pattern suggests these should be worked up together. Anti-inflammatory dietary pattern and GLP-1 candidates have both been shown to improve psoriasis activity in addition to metabolic markers.`);
  }

  // 5. 2026-05-13: OSA ↔ low testosterone link — sleep apnea suppresses
  // testosterone production. Surface as a discussion point when both
  // signals are present so the patient asks about CPAP optimization
  // before chasing TRT.
  const hasOSA = /sleep apnea|osa|obstructive sleep/.test(condText);
  const hasLowTSignal = /low t|low testosterone|gynecomastia|low libido|erectile/.test(sxText)
    || /hypogonadism|low testosterone/.test(condText);
  if (hasOSA && hasLowTSignal && out.length < 6 && facts.patient.sex === 'male') {
    out.push(`Sleep apnea suppresses testosterone production — treating OSA (CPAP compliance or optimization) often raises T meaningfully before any TRT decision. Discuss CPAP adherence data + a repeat sleep study before assuming primary hypogonadism.`);
  }

  return out.slice(0, 6);
}

/** Plain-language fallback question list — same source as questions_to_ask
 *  but stripped to just the question string for users who skip the rich UI. */
export function buildPatientQuestions(facts: ClinicalFacts): string[] {
  return buildQuestionsToAsk(facts).map(q => q.question).slice(0, 8);
}

/** Functional medicine note — bridges conventional findings to root-cause
 *  framing. 2-3 sentences, template-driven from engine facts. */

export function buildFunctionalMedicineNote(facts: ClinicalFacts): string {
  const outliers = facts.labs.outliers.slice(0, 3).map(function(o){return o.marker.toLowerCase();});
  const conditions = facts.conditions.slice(0, 2).map(function(c){return c.name.split('(')[0].trim();});
  const depletions = facts.depletions.slice(0, 2).map(function(d){return (d.medsMatched[0] || d.medClass) + '-driven ' + d.nutrient;});

  const labClause = outliers.length > 0 ? 'The lab pattern (' + outliers.join(', ') + ') ' : 'The current labs ';
  const condClause = conditions.length > 0 ? 'frames ' + conditions.join(' + ') : 'point to modifiable metabolic drivers';
  const interventions = [];
  if (depletions.length > 0) interventions.push('addressing ' + depletions.join(' + ') + ' depletion');
  if (facts.supplementCandidates.some(function(s){return s.category === 'liver_metabolic';})) interventions.push('liver / metabolic support');
  if (facts.supplementCandidates.some(function(s){return s.category === 'cardio';})) interventions.push('lipid optimization');
  if (facts.supplementCandidates.some(function(s){return s.category === 'nutrient_repletion';})) interventions.push('nutrient repletion');
  if (interventions.length === 0) interventions.push('foundational hydration / sleep / movement');

  return (labClause + condClause + '. The plan ' + interventions.join(', ') + ', alongside any current prescription regimens.').slice(0, 360);
}

export interface WorkoutEntry {
  emoji: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  title: string;
  duration_min: number;
  description: string;
  why: string;
}

// WORKOUTS — 4-6 templated workouts/week, calibrated to conditions + age + sex
export function buildWorkouts(facts: ClinicalFacts): WorkoutEntry[] {
  const age = facts.patient.age || 40;
  const conds = (facts.patient.conditions.join(' ') + ' ' + facts.conditions.map(function(c){return c.name;}).join(' ')).toLowerCase();
  const sxs = facts.patient.symptoms.map(function(s){return s.name.toLowerCase();}).join(' ');

  const hasIBD = /ibd|crohn|colitis|ulcerative/.test(conds);
  const hasCV = /hypertension|cad|coronary|stroke|atrial fib/.test(conds);
  const hasMetabolic = /metabolic|insulin|prediab|nafld|t2d|hyperlipid/.test(conds);
  const hasAutoimmune = /lupus|rheumatoid|psoriasis|hashimoto|graves/.test(conds);
  const hasOsteoporosis = /osteoporos|osteopen|fragility fracture|low bone density/.test(conds);
  const fatigue = /fatigue|exhaust|tired|exercise intoleran/.test(sxs);
  const sleepIssue = /insomn|sleep|wak/.test(sxs);

  const senior = age >= 65;
  const youngActive = age < 35;
  const flareRisk = hasIBD || hasAutoimmune;
  const cardioIntensity = senior || flareRisk || fatigue ? 'low' : hasMetabolic || hasCV ? 'moderate' : 'high';

  const workouts = [];

  workouts.push({
    emoji: '\u{1F4AA}',
    day: 'Mon',
    title: senior || hasOsteoporosis ? 'Bodyweight resistance' : 'Full-body strength',
    duration_min: senior ? 25 : 40,
    description: senior || hasOsteoporosis
      ? 'Chair squats, wall push-ups, banded rows, plank holds. 2 sets, 10 reps each.'
      : flareRisk
      ? 'Squats, push-ups, rows, plank, glute bridges. 2-3 sets of 8-10 reps. Stop short of failure.'
      : 'Squats, deadlifts, push-ups, rows, plank. 3 sets of 8-12 reps.',
    why: hasOsteoporosis ? 'Resistance training is the best modifiable bone-density intervention.'
      : senior ? 'Maintains muscle + balance as you age.'
      : 'Builds metabolic reserve; the most leveraged 30 min of your week.',
  });

  workouts.push({
    emoji: '\u{1F6B6}',
    day: 'Tue',
    title: cardioIntensity === 'low' ? 'Easy walk' : 'Zone-2 walk or cycle',
    duration_min: cardioIntensity === 'low' ? 20 : 35,
    description: cardioIntensity === 'low'
      ? 'Comfortable pace, ideally outdoors. Nose-breathing throughout.'
      : 'Conversational pace — you can talk but not sing. Hilly route or steady incline if possible.',
    why: hasMetabolic ? 'Zone-2 cardio is the most evidence-based intervention for insulin sensitivity.'
      : 'Builds aerobic base + mitochondrial density without overstressing recovery.',
  });

  workouts.push({
    emoji: '\u{1F9D8}',
    day: 'Wed',
    title: flareRisk ? 'Restorative yoga' : sleepIssue ? 'Evening yoga' : 'Mobility + stretching',
    duration_min: 25,
    description: flareRisk
      ? 'Gentle restorative poses, breathwork. Avoid deep twists during active disease.'
      : sleepIssue
      ? 'Slow flow, supine poses, 4-7-8 breathing for 5 min at the end.'
      : 'Hip openers, thoracic mobility, shoulder + calf stretching.',
    why: sleepIssue ? 'Evening parasympathetic activation drops cortisol + improves sleep.'
      : 'Recovery day — keeps joints mobile, drops sympathetic tone.',
  });

  workouts.push({
    emoji: '\u{1F3CB}',
    day: 'Thu',
    title: senior ? 'Balance + light strength' : 'Lower-body strength',
    duration_min: senior ? 25 : 35,
    description: senior
      ? 'Single-leg stands, step-ups, heel raises, banded glute bridges. 2 sets of 8-10.'
      : 'Squats or split squats, Romanian deadlifts, calf raises, plank. 3 sets.',
    why: senior ? 'Single-leg work cuts fall risk — highest-leverage senior fitness intervention.'
      : 'Posterior chain + glute work; drives metabolic improvement.',
  });

  if (cardioIntensity !== 'low') {
    workouts.push({
      emoji: '\u{1F3C3}',
      day: 'Fri',
      title: hasCV ? 'Zone-2 cardio' : youngActive ? 'Intervals or run' : 'Brisk walk or bike',
      duration_min: hasCV ? 40 : youngActive ? 30 : 40,
      description: hasCV
        ? 'Steady moderate pace — heart-rate target 60-70% max.'
        : youngActive
        ? '5 min easy + 6 x (1 min hard / 2 min easy) + 5 min cool-down.'
        : '40-min brisk walk outdoors. Add 4-5 short hills if available.',
      why: hasCV ? 'Steady zone-2 builds mitochondrial density without spiking BP.'
        : youngActive ? 'Short intervals lift VO2max efficiently.'
        : 'Longer steady cardio drives weekly minutes-of-movement target.',
    });
  } else {
    workouts.push({
      emoji: '\u{1F6B6}',
      day: 'Fri',
      title: 'Outdoor walk + sunlight',
      duration_min: 25,
      description: 'Walk outdoors, ideally morning or late afternoon.',
      why: 'Sunlight + mild aerobic activity anchors circadian rhythm.',
    });
  }

  workouts.push({
    emoji: '\u{1F392}',
    day: 'Sat',
    title: youngActive ? 'Long hike or sport' : 'Longer walk or hike',
    duration_min: 60,
    description: youngActive
      ? 'Pickleball, tennis, hike, climbing, basketball — anything for 60+ min that you enjoy.'
      : 'Walking trail, hike, golf with walking, gardening. 60-90 min total movement.',
    why: 'Long-form weekend movement adds aerobic volume + mental recovery.',
  });

  return workouts.slice(0, 6);
}
