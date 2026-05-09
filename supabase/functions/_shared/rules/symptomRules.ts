// supabase/functions/_shared/rules/symptomRules.ts
//
// DETERMINISTIC SYMPTOM-PROSE BUILDER
// ===================================
// For every patient symptom, produce a 2-3 sentence "how_addressed"
// explanation by mapping the symptom into a category, then synthesizing:
//   - DRIVERS  (specific labs / depletions / conditions from FACTS that explain it)
//   - INTERVENTION (supplements from FACTS.supplementCandidates that target it)
//   - LIFESTYLE (which lifestyle bucket — sleep / diet / exercise / stress)
//   - TIMELINE (typical response window)
//
// Universal: works for any symptom phrasing, any patient profile. AI is
// no longer in this loop — symptoms_addressed is now 100% deterministic.
//
// Adding a new symptom category: add an entry to SYMPTOM_CATEGORIES.

import type { LabOutlierFact, ClinicalFacts } from '../buildPlan.ts';
import type { SupplementCandidate } from './supplementRules.ts';
import type { DepletionFact } from './depletionRules.ts';
import type { SuspectedConditionFact } from './conditionRules.ts';

export interface SymptomAddressed {
  symptom: string;
  how_addressed: string;
}

interface Category {
  key: string;
  patterns: RegExp[];
  driverFinder: (ctx: Ctx) => string[];          // ranked list of likely drivers (lab + condition + med)
  supplementMatcher: (sup: SupplementCandidate) => boolean;
  lifestyleHint: string;                          // 1-line lifestyle anchor
  timeline: string;                               // typical response window
  // Optional: per-sub-symptom variant. Lets paired symptoms (e.g.,
  // "Joint stiffness" + "Morning stiffness") produce different prose
  // even though they share the same driver/supplement category.
  variantFor?: (symptomName: string) => { angle: string; lifestyleOverride?: string } | null;
}

interface Ctx {
  outliers: LabOutlierFact[];
  depletions: DepletionFact[];
  conditions: SuspectedConditionFact[];
  symptomLower: string;
  meds: string[];
}

// Ordered most-specific first — first matching category wins.
const SYMPTOM_CATEGORIES: Category[] = [
  {
    key: 'sleep_onset',
    patterns: [/sleep onset|falling asleep|can'?t fall asleep|trouble (falling )?asleep|insomnia/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const mg = ctx.outliers.find(o => /magnesium/i.test(o.marker));
      if (mg && (mg.flag === 'low' || mg.value < 2.0)) drivers.push(`Mg ${mg.value}`);
      if (ctx.depletions.some(d => /magnesium/i.test(d.nutrient))) drivers.push('drug-driven Mg depletion');
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 30) drivers.push(`Vit D ${vd.value}`);
      if (drivers.length === 0) drivers.push('GABA tone / cortisol rhythm');
      return drivers;
    },
    supplementMatcher: (s) => /magnesium glycinate|magnesium l-?threonate/i.test(s.nutrient),
    lifestyleHint: 'fixed bedtime, dim lights at 9 PM, no screens 60 min before bed',
    timeline: 'Most users see sleep latency drop within 7-10 days.',
    variantFor: (name) => {
      if (/falling asleep|sleep onset|trouble (falling )?asleep/i.test(name)) return { angle: 'Sleep-onset delay >30 min usually reflects late evening cortisol or low GABA tone — magnesium glycinate is the most-studied first-line supplement.', lifestyleOverride: 'fixed bedtime, dim lights 60 min before bed, no caffeine after 1 PM, magnesium 7 PM' };
      if (/insomnia/i.test(name)) return { angle: 'True insomnia (can\'t fall asleep AND stay asleep) often needs sleep-restriction therapy or CBT-I, not just supplements.', lifestyleOverride: 'CBT-I app trial (Sleep Reset, Sleepio), out-of-bed if not asleep in 20 min, fixed wake time' };
      if (/can'?t fall asleep/i.test(name)) return { angle: 'Trouble shutting the mind off at bedtime usually means evening blue light + late caffeine + cortisol still elevated.', lifestyleOverride: 'sunset light dimming, magnesium 2-3 hours before bed, no email after 8 PM' };
      return null;
    },
  },
  {
    key: 'sleep_maintenance',
    patterns: [/wak\w* (during|in|at) (the )?night|night\s*wak|broken sleep|interrupt(ed|ion).*sleep/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const rbc = ctx.outliers.find(o => /^rbc|red blood cell/i.test(o.marker));
      const hct = ctx.outliers.find(o => /hematocrit|hct/i.test(o.marker));
      if (rbc?.flag.includes('high') || (hct && hct.value >= 50)) drivers.push('elevated RBC/Hct (sleep-apnea / dehydration signal)');
      if (ctx.depletions.some(d => /magnesium/i.test(d.nutrient))) drivers.push('drug-driven Mg depletion');
      if (drivers.length === 0) drivers.push('blood-sugar dips, cortisol surges');
      return drivers;
    },
    supplementMatcher: (s) => /magnesium glycinate|magnesium l-?threonate/i.test(s.nutrient),
    lifestyleHint: 'protein at dinner, hydration before bed (electrolytes), sleep-apnea screen if RBC stays high',
    timeline: 'Improvement in 2-3 weeks once Mg + hydration are dialed in.',
    variantFor: (name) => {
      if (/3.?am|early morning|wake at 3|wake early/i.test(name)) return { angle: 'Waking at 3-4 AM specifically is the cortisol-rhythm signature — protein at dinner + magnesium can shift the curve.', lifestyleOverride: 'protein + healthy fat at dinner, no alcohol within 3 hours of bed, magnesium glycinate at 7 PM' };
      if (/wak\w* (during|in|at) (the )?night|night\s*wak/i.test(name)) return { angle: 'Mid-night waking with elevated RBC/Hct is a sleep-apnea pattern until proven otherwise — a home sleep test (HSAT) is the cheap, fast rule-out.', lifestyleOverride: 'side-sleeping, hydrate during day (not 2 hours before bed), STOP-BANG questionnaire today' };
      if (/broken sleep|interrupt/i.test(name)) return { angle: 'Fragmented sleep usually has a physical driver (apnea, reflux, joint pain) — investigate before chasing supplements.', lifestyleOverride: 'log waking times for 7 days, address physical drivers (HSAT, reflux protocol, joint inflammation)' };
      return null;
    },
  },
  {
    key: 'fatigue',
    patterns: [/\bfatigue\b|\btired\b|low energy|exhaust|energy crash/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      const fer = ctx.outliers.find(o => /ferritin/i.test(o.marker));
      if (fer && (fer.flag === 'low' || fer.value < 50)) drivers.push(`ferritin ${fer.value}`);
      const b12 = ctx.outliers.find(o => /^b[\s-]?12|cobalamin/i.test(o.marker));
      if (b12 && b12.value < 400) drivers.push(`B12 ${b12.value}`);
      if (ctx.depletions.some(d => /coq10/i.test(d.nutrient))) drivers.push('statin-driven CoQ10 depletion');
      if (ctx.conditions.some(c => /sleep apnea|osa/i.test(c.name))) drivers.push('possible sleep apnea');
      if (drivers.length === 0) drivers.push('sleep debt + insulin-resistance pattern');
      return drivers;
    },
    supplementMatcher: (s) => /coq10|vitamin d|methylcobalamin|b[\s-]?12|iron/i.test(s.nutrient),
    lifestyleHint: 'consistent sleep, morning sun exposure, protein at breakfast',
    timeline: 'Energy typically lifts in 2-3 weeks once root drivers are addressed.',
    variantFor: (name) => {
      if (/energy crash|afternoon/i.test(name)) return { angle: 'A 2-4 PM crash usually means a glucose dip after a carb-heavy lunch.', lifestyleOverride: 'protein + fat at lunch (no rice/pasta-heavy meals), 10-min walk after eating, no afternoon caffeine' };
      if (/chronic fatigue|persistent fatigue/i.test(name)) return { angle: 'Persistent all-day fatigue with normal thyroid + iron usually means sleep debt + nutrient gaps, not a metabolic disease.', lifestyleOverride: 'sleep 8h for 14 days as a trial, sun exposure 10 min in AM, protein 30 g at breakfast' };
      if (/exhaust/i.test(name)) return { angle: 'Exhaustion is fatigue plus stress load — cortisol rhythm matters as much as nutrients.', lifestyleOverride: 'protect bedtime, lower caffeine after noon, breath-work 5 min daily' };
      return null;
    },
  },
  {
    key: 'cognition',
    patterns: [/brain fog|memory|concentrat|focus|mental clarity/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      const b12 = ctx.outliers.find(o => /^b[\s-]?12|cobalamin/i.test(o.marker));
      if (b12 && b12.value < 500) drivers.push(`B12 ${b12.value}`);
      const omega = ctx.outliers.find(o => /omega|epa|dha/i.test(o.marker));
      if (omega && omega.flag !== 'normal') drivers.push('low omega-3 index');
      if (ctx.conditions.some(c => /sleep apnea|osa/i.test(c.name))) drivers.push('possible nocturnal hypoxia');
      if (drivers.length === 0) drivers.push('sleep deprivation + nutrient gaps');
      return drivers;
    },
    supplementMatcher: (s) => /omega-?3|methylcobalamin|b[\s-]?12|vitamin d|magnesium l-?threonate/i.test(s.nutrient),
    lifestyleHint: 'sleep extension to 7-8 hours, hydration, omega-3-rich foods',
    timeline: 'Cognitive clarity typically improves within 2-4 weeks.',
    variantFor: (name) => {
      if (/brain fog/i.test(name)) return { angle: 'Brain fog often clears once sleep + omega-3 are dialed in — it is not a hardware problem, it is an input problem.', lifestyleOverride: 'sleep 7-8h, walk outside in morning sun, hydrate to pale-yellow urine' };
      if (/memory|recall/i.test(name)) return { angle: 'Memory dips correlate with sleep depth and B12 status more than aging.', lifestyleOverride: 'consistent bedtime, sublingual B12 if MMA elevated, daily learning task' };
      if (/concentrat|focus/i.test(name)) return { angle: 'Focus issues respond to glucose stability and omega-3 — not stimulants.', lifestyleOverride: 'protein at breakfast, no caffeine after 1 PM, 25-min focus blocks with 5-min breaks' };
      return null;
    },
  },
  {
    key: 'mood',
    patterns: [/\bmood\b|anxiet|depress|irritab|low mood/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      const t = ctx.outliers.find(o => /^testosterone|total t/i.test(o.marker));
      if (t && t.value < 400) drivers.push(`testosterone ${t.value}`);
      const omega = ctx.outliers.find(o => /omega|epa|dha/i.test(o.marker));
      if (omega && omega.flag !== 'normal') drivers.push('low omega-3 index');
      if (drivers.length === 0) drivers.push('cortisol rhythm + nutrient gaps');
      return drivers;
    },
    supplementMatcher: (s) => /omega-?3|vitamin d|magnesium glycinate|methylcobalamin/i.test(s.nutrient),
    lifestyleHint: 'morning sun exposure, daily walking, sleep regularity',
    timeline: 'Mood typically stabilizes within 3-4 weeks.',
    variantFor: (name) => {
      if (/mood swing|irritab/i.test(name)) return { angle: 'Mood swings often track blood-sugar dips and sleep debt — stabilize both before considering psychiatric workup.', lifestyleOverride: 'protein at every meal, no skipped meals, morning sun, sleep 7-8h consistently' };
      if (/anxiet/i.test(name)) return { angle: 'Anxiety with low Vit D + low omega-3 often improves materially with repletion alone.', lifestyleOverride: 'morning walk in sun, breath-work 5 min daily, caffeine cap 1 cup, magnesium evening' };
      if (/depress|low mood/i.test(name)) return { angle: 'Depressive symptoms with low Vit D, low omega-3, or low testosterone are partly nutrient-driven — replete first, reassess at week 8.', lifestyleOverride: 'sun exposure, daily walking, sleep regularity, talk to PCP about formal screening (PHQ-9)' };
      return null;
    },
  },
  {
    key: 'weight_metabolism',
    patterns: [/weight (gain|resist)|can'?t lose|difficulty losing weight|slow metab|metabolism/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const tg = ctx.outliers.find(o => /triglyc/i.test(o.marker));
      if (tg && tg.value >= 150) drivers.push(`TG ${tg.value}`);
      const a1c = ctx.outliers.find(o => /a1c|hba1c/i.test(o.marker));
      if (a1c && a1c.value >= 5.4) drivers.push(`A1c ${a1c.value}%`);
      const tsh = ctx.outliers.find(o => /tsh/i.test(o.marker));
      if (tsh && tsh.value >= 2.5) drivers.push(`TSH ${tsh.value}`);
      if (drivers.length === 0) drivers.push('insulin resistance + sleep debt');
      return drivers;
    },
    supplementMatcher: (s) => /omega-?3|berberine|inositol|chromium/i.test(s.nutrient),
    lifestyleHint: 'protein at every meal, resistance training 2-3x/week, sleep 7-8h',
    timeline: 'Most users see metabolic shift in 4-6 weeks; full lipid response by week 12.',
    variantFor: (name) => {
      if (/weight gain|weight resist|can'?t lose|difficulty losing/i.test(name)) return { angle: 'Stalled weight loss with elevated triglycerides usually means insulin is high before glucose is — fasting insulin tells you which lever to pull.', lifestyleOverride: 'high-protein breakfast, no liquid calories, walk 10 min after meals' };
      if (/slow metab|metabolism/i.test(name)) return { angle: 'Slow metabolism is rarely thyroid — it is more often muscle loss, sleep debt, and insulin resistance combined.', lifestyleOverride: 'resistance training 2-3x/week to rebuild muscle, sleep 7-8h, protein 30 g per meal' };
      return null;
    },
  },
  {
    key: 'gi',
    patterns: [/bloat|\bgas\b|constipation|diarrhea|stool|reflux|nausea|cramp/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      if (ctx.conditions.some(c => /ibd|colitis|crohn/i.test(c.name))) drivers.push('UC / Crohn\'s activity');
      if (ctx.depletions.some(d => /folate/i.test(d.nutrient))) drivers.push('mesalamine-driven folate depletion');
      if (drivers.length === 0) drivers.push('possible dysbiosis or food triggers');
      return drivers;
    },
    supplementMatcher: (s) => /glutamine|zinc carnosine|slippery elm/i.test(s.nutrient),
    lifestyleHint: 'food journal + low-FODMAP trial, fermented foods if tolerated',
    timeline: 'GI symptoms typically calm within 4-6 weeks of consistent gut-healing protocol.',
    variantFor: (name) => {
      if (/bloat/i.test(name)) return { angle: 'Pressure and distension after meals point to fermentation in the small intestine.', lifestyleOverride: 'low-FODMAP trial 14 days, eat slowly, peppermint or ginger after meals' };
      if (/\bgas\b/i.test(name)) return { angle: 'Excess gas usually means fermentable carb sensitivity or bacterial overgrowth.', lifestyleOverride: 'food journal, smaller portions, reduce alliums + cruciferous if triggers' };
      if (/constipation/i.test(name)) return { angle: 'Slow transit time often improves with hydration + soluble fiber + magnesium.', lifestyleOverride: 'add 25-30 g fiber gradually, 3 L water, magnesium citrate (gentle laxative effect)' };
      if (/diarrhea/i.test(name)) return { angle: 'Loose stools in IBD usually track disease activity or a dietary trigger.', lifestyleOverride: 'BRAT diet during flare, electrolyte replacement, avoid sugar alcohols' };
      if (/reflux|heartburn/i.test(name)) return { angle: 'Reflux often comes from late meals, large portions, or low stomach acid.', lifestyleOverride: 'finish dinner 3 hours before bed, smaller portions, raise head of bed 6 inches' };
      if (/nausea/i.test(name)) return { angle: 'Persistent nausea can be med-related, gastroparesis, or low B vitamins.', lifestyleOverride: 'ginger tea, smaller meals, separate fluids from food' };
      if (/cramp/i.test(name)) return { angle: 'Abdominal cramping in UC often signals a flare or food intolerance.', lifestyleOverride: 'low-FODMAP trial, peppermint capsules, track flare triggers' };
      return null;
    },
  },
  {
    key: 'skin',
    patterns: [/rash|skin|acne|eczema|dermat|psoria/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      if (ctx.conditions.some(c => /ibd|colitis|crohn|autoimmune/i.test(c.name))) drivers.push('autoimmune cross-reactivity');
      const a1c = ctx.outliers.find(o => /a1c|hba1c/i.test(o.marker));
      if (a1c && a1c.value >= 5.4) drivers.push('insulin-driven sebum / inflammation');
      if (drivers.length === 0) drivers.push('barrier-function gaps');
      return drivers;
    },
    supplementMatcher: (s) => /omega-?3|vitamin d|zinc/i.test(s.nutrient),
    lifestyleHint: 'minimize sugar + alcohol, omega-3-rich diet, hydration',
    timeline: 'Skin typically clears within 6-8 weeks.',
  },
  {
    key: 'joint_muscle',
    patterns: [/joint|stiffness|muscle (pain|ache)|cramp|achy/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      if (ctx.depletions.some(d => /coq10/i.test(d.nutrient))) drivers.push('statin-driven CoQ10 depletion');
      if (ctx.depletions.some(d => /magnesium/i.test(d.nutrient))) drivers.push('drug-driven Mg depletion');
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      if (ctx.conditions.some(c => /ibd|colitis|ra|psoria|lupus|autoimmune/i.test(c.name))) drivers.push('autoimmune-related arthralgia');
      if (drivers.length === 0) drivers.push('inflammation + electrolyte balance');
      return drivers;
    },
    supplementMatcher: (s) => /coq10|omega-?3|magnesium glycinate|curcumin/i.test(s.nutrient),
    lifestyleHint: 'mobility work daily, anti-inflammatory diet, sleep recovery',
    timeline: 'Joint stiffness typically eases within 3-4 weeks.',
    variantFor: (name) => {
      if (/morning stiffness/i.test(name)) return { angle: 'Stiffness >30 min on waking is the classic signature of inflammatory (vs mechanical) joint pain.', lifestyleOverride: '5-min gentle morning mobility routine, hot shower, avoid sleeping in cold rooms' };
      if (/joint stiff|joint pain|arthralg/i.test(name)) return { angle: 'Diffuse joint stiffness in autoimmune disease usually responds to omega-3 + Vit D repletion.', lifestyleOverride: 'movement breaks every 60 min, walking 20 min daily, anti-inflammatory diet' };
      if (/muscle (pain|ache)/i.test(name)) return { angle: 'Muscle aches on a statin first need CK to rule out myopathy — even mild elevation matters.', lifestyleOverride: 'gentle stretching, avoid heavy resistance until CK clears, electrolyte hydration' };
      if (/cramp/i.test(name)) return { angle: 'Cramping at rest usually means low magnesium or sodium, not exercise-related.', lifestyleOverride: 'pickle juice or electrolyte solution at cramp onset, magnesium glycinate at 7 PM' };
      return null;
    },
  },
  {
    key: 'hair',
    patterns: [/hair (loss|thin|fall|shed)/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const fer = ctx.outliers.find(o => /ferritin/i.test(o.marker));
      if (fer && fer.value < 75) drivers.push(`ferritin ${fer.value} (hair needs ≥70)`);
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      const tsh = ctx.outliers.find(o => /tsh/i.test(o.marker));
      if (tsh && tsh.value >= 2.5) drivers.push(`TSH ${tsh.value} (subclinical thyroid)`);
      if (ctx.conditions.some(c => /ibd|colitis/i.test(c.name))) drivers.push('IBD-related malabsorption');
      if (drivers.length === 0) drivers.push('nutrient gaps + stress');
      return drivers;
    },
    supplementMatcher: (s) => /iron|biotin|vitamin d|methylcobalamin/i.test(s.nutrient),
    lifestyleHint: 'protein at every meal, gentle scalp care, sleep recovery',
    timeline: 'Hair regrowth visible at 8-12 weeks (full hair-cycle is 90 days).',
  },
  {
    key: 'sexual',
    patterns: [/libido|sex(ual)? drive|erect|vaginal/i],
    driverFinder: (ctx) => {
      const drivers: string[] = [];
      const t = ctx.outliers.find(o => /^testosterone|total t/i.test(o.marker));
      if (t && t.value < 500) drivers.push(`testosterone ${t.value}`);
      const vd = ctx.outliers.find(o => /vitamin d|25.?hydroxy/i.test(o.marker));
      if (vd && vd.value < 40) drivers.push(`Vit D ${vd.value}`);
      if (drivers.length === 0) drivers.push('hormonal balance + sleep');
      return drivers;
    },
    supplementMatcher: (s) => /vitamin d|zinc|ashwagandha/i.test(s.nutrient),
    lifestyleHint: 'sleep 7-8h, resistance training, stress management',
    timeline: 'Most users see improvement within 6-8 weeks.',
  },
];

const GENERIC_PROSE = (sup: SupplementCandidate | null, lifestyle: string): string => {
  const sText = sup ? `${sup.nutrient} ${sup.dose} (${sup.timing.toLowerCase()}) targets the underlying drivers.` : 'See the supplement stack for targeted support.';
  return `${sText} Lifestyle: ${lifestyle}. Most users notice improvement within 4 weeks.`;
};

export function buildSymptomsAddressed(facts: ClinicalFacts): SymptomAddressed[] {
  const ctxBase = {
    outliers: facts.labs.outliers,
    depletions: facts.depletions,
    conditions: facts.conditions,
    meds: facts.patient.meds,
  };

  return facts.patient.symptoms.map((s) => {
    const ctx: Ctx = { ...ctxBase, symptomLower: s.name.toLowerCase() };
    const cat = SYMPTOM_CATEGORIES.find(c => c.patterns.some(p => p.test(s.name)));

    if (!cat) {
      // Unmatched symptom — synthesize generic but pick the most critical
      // outlier as the implicit driver and offer the top supplement.
      const top = facts.supplementCandidates[0];
      const drivers = facts.labs.outliers.slice(0, 2).map(o => `${o.marker} ${o.value}`);
      const driverText = drivers.length ? `Likely drivers: ${drivers.join(', ')}.` : '';
      return {
        symptom: s.name,
        how_addressed: `${driverText} ${GENERIC_PROSE(top ?? null, 'sleep, hydration, anti-inflammatory diet')}`.trim(),
      };
    }

    const drivers = cat.driverFinder(ctx);
    const sup = facts.supplementCandidates.find(cat.supplementMatcher) ?? null;
    const variant = cat.variantFor ? cat.variantFor(s.name) : null;

    const angleText = variant?.angle ? `${variant.angle} ` : '';
    const driverText = drivers.length ? `Likely drivers: ${drivers.join(', ')}.` : '';
    const supText = sup ? ` ${sup.nutrient} ${sup.dose} ${sup.timing.toLowerCase()} targets this directly.` : '';
    const lifestyleHint = variant?.lifestyleOverride ?? cat.lifestyleHint;
    const lifestyleText = ` Lifestyle: ${lifestyleHint}.`;
    const timelineText = ` ${cat.timeline}`;

    return {
      symptom: s.name,
      how_addressed: `${angleText}${driverText}${supText}${lifestyleText}${timelineText}`.trim(),
    };
  });
}
