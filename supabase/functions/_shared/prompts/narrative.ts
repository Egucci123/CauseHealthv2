// supabase/functions/_shared/prompts/narrative.ts
//
// CALL A — NARRATIVE WRITER
// =========================
// Job: take ClinicalFacts (deterministic) and write the human-facing
// prose that explains it. Cannot invent tests, conditions, or numbers.
// Cannot omit facts. Reference everything by name from the FACTS payload.
//
// Output schema (strict tool-use, length-capped at API level):
//   - headline: string (≤60 chars)
//   - summary: string (3 sentences, ≤320 chars)
//   - symptoms_addressed: array of { symptom, how_addressed (≤300 chars) }
//   - condition_prose: array of { name, evidence (≤150 chars), what_to_ask_doctor (≤180 chars) }

import type { ClinicalFacts } from '../buildPlan.ts';

export const NARRATIVE_TOOL_SCHEMA = {
  name: 'submit_narrative',
  description: 'Submit the narrative prose for this wellness plan.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        maxLength: 60,
        description: 'Hero card headline. Plain English verdict, ≤9 words. NEVER alarmist.',
      },
      summary: {
        type: 'string',
        maxLength: 320,
        description: '3 short sentences max — what we see, what we will fix, how long it takes. Calm, equipped-advocate voice.',
      },
      symptoms_addressed: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            symptom: { type: 'string' },
            how_addressed: {
              type: 'string',
              maxLength: 300,
              description: '2-3 sentences plain English: cause + intervention from FACTS + realistic timeline.',
            },
          },
          required: ['symptom', 'how_addressed'],
        },
      },
      condition_prose: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Must match a name in FACTS.conditions exactly.' },
            evidence: {
              type: 'string',
              maxLength: 150,
              description: 'Cite the SPECIFIC labs/symptoms/meds from FACTS that triggered this condition.',
            },
            what_to_ask_doctor: {
              type: 'string',
              maxLength: 180,
              description: 'One sentence the patient can read aloud to their doctor. Curious tone, not alarmed.',
            },
          },
          required: ['name', 'evidence', 'what_to_ask_doctor'],
        },
      },
    },
    required: ['headline', 'summary', 'symptoms_addressed', 'condition_prose'],
  },
} as const;

export const NARRATIVE_SYSTEM_PROMPT = `You are the clinical writer for CauseHealth, a wellness app that turns lab results into a 90-day action plan.

YOUR JOB IS PROSE. You do not order tests, diagnose, or invent data. Every clinical fact in your output must come from the FACTS payload below. If FACTS does not contain a thing, you do not write about it.

VOICE — match the examples:
• Calm, plain English, 6th-grade reading level.
• "Equipped advocate" framing — patient is doing something with their doctor, not being scared into an ER.
• Never use: "alarming", "dangerous", "critical" (unless lab is in critical-range), "crisis", "emergency" (unless safety_net says so), "rush to ER", "call your doctor today/now".
• When citing a lab value, write it as "ALT 97" or "vitamin D 24" — value follows marker, no decoration.
• Cite EVIDENCE specifically — "you reported sleep onset >30 min" beats "your symptoms suggest poor sleep".

WHAT YOU WRITE:
1. headline — ≤9 words, the one-line verdict for the hero card.
2. summary — 3 sentences max. What's wrong, what we'll fix, how long.
3. symptoms_addressed — for EVERY symptom in FACTS.patient.symptoms (not a subset), explain the cause (cite labs/conditions/meds from FACTS), the intervention (cite supplements from FACTS.supplementCandidates or behaviors), and a realistic timeline.
4. condition_prose — for EVERY condition in FACTS.conditions, write evidence (specific labs/meds that fired the rule) + a curious one-sentence question to bring to the doctor.

EXAMPLE OUTPUT (Mitchell, 28, UC, on mesalamine + atorvastatin, ALT 97, TG 327, Vit D 24, sleep onset >30 min):

{
  "headline": "Sleep debt and active UC are driving your labs.",
  "summary": "Three things are talking to each other: chronic sleep debt is amplifying inflammation and triglycerides, active ulcerative colitis is stressing your liver and absorption, and both together are nudging your red blood cells up. We fix sleep first, repair the gut and liver in parallel, and recheck in 12 weeks.",
  "symptoms_addressed": [
    {
      "symptom": "Chronic fatigue",
      "how_addressed": "Sleep onset >30 min plus vitamin D 24 are the biggest drivers — magnesium glycinate at 7 PM and vitamin D3 4000 IU with breakfast typically lift energy within 2-3 weeks. We retest vitamin D at 12 weeks to confirm the rise."
    },
    {
      "symptom": "Difficulty falling asleep",
      "how_addressed": "We start magnesium glycinate 300 mg at 7 PM (2-3 hours before bed) and a 6:30-8 AM walk for circadian reset. Most people see sleep latency drop inside 7 days."
    }
  ],
  "condition_prose": [
    {
      "name": "Non-alcoholic fatty liver disease (NAFLD) with statin-stress overlay",
      "evidence": "ALT 97 is more than 2x normal, AST 48 elevated, on atorvastatin — fits NAFLD with potential medication contribution.",
      "what_to_ask_doctor": "Could my high ALT be from atorvastatin specifically, or from fatty liver — and is an ultrasound or FibroScan the right next step?"
    }
  ]
}

OUTPUT FORMAT:
Use the submit_narrative tool. Do not write text outside the tool call.`;

export interface NarrativeOutput {
  headline: string;
  summary: string;
  symptoms_addressed: { symptom: string; how_addressed: string }[];
  condition_prose: { name: string; evidence: string; what_to_ask_doctor: string }[];
}

export function buildNarrativeUserMessage(facts: ClinicalFacts): string {
  // Compact FACTS payload — only what the AI needs to write narrative.
  const payload = {
    patient: facts.patient,
    lab_outliers: facts.labs.outliers.map(o => ({
      marker: o.marker, value: o.value, unit: o.unit, flag: o.flag, interpretation: o.interpretation,
    })),
    conditions: facts.conditions.map(c => ({
      name: c.name, confidence: c.confidence, evidence: c.evidence, icd10: c.icd10,
    })),
    depletions: facts.depletions.map(d => ({
      med_class: d.medClass, meds: d.medsMatched, nutrient: d.nutrient, mechanism: d.mechanism,
    })),
    supplement_candidates: facts.supplementCandidates.map(s => ({
      nutrient: s.nutrient, dose: s.dose, timing: s.timing, why: s.why, sourced_from: s.sourcedFrom,
    })),
    risk_calculators: facts.riskCalculators,
    suboptimal_flags: facts.suboptimalFlags,
    is_optimization_mode: facts.isOptimizationMode,
  };

  return `FACTS (deterministic — do not invent or contradict):

${JSON.stringify(payload, null, 2)}

WRITE the narrative for this patient. Use the submit_narrative tool.`;
}
