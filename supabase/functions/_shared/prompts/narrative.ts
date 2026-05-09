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
        description: 'Hero card headline rendered on a phone. Plain English verdict, ≤8 words AND ≤60 characters. MUST be a COMPLETE sentence — the frontend truncates anything longer with "..." so a too-long sentence WILL get cut off mid-thought. If you can\'t fit a complete thought in 60 chars, write a SHORTER one. Examples that work: "Sleep debt is driving your labs." (8 words, 32 chars) / "Vitamin D + insulin resistance need work." (7 words, 42 chars) / "Liver and lipids need repair work." (7 words, 33 chars). Examples that FAIL: "Liver enzymes, triglycerides, and chronic dehydration need immediate attention." (78 chars — TOO LONG). NEVER alarmist.',
      },
      summary: {
        type: 'string',
        maxLength: 320,
        description: '3 short sentences max — what we see, what we will fix, how long it takes. Calm, equipped-advocate voice.',
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
    required: ['headline', 'summary', 'condition_prose'],
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

CLINICAL CLAIMS — STRICT (this is non-negotiable):
You are FORBIDDEN from asserting any of these without explicit supporting evidence in FACTS:
  • Disease activity ("active", "flaring", "uncontrolled", "poorly controlled")
  • Treatment failure ("despite treatment", "not responding", "treatment is failing")
  • Severity claims beyond what the lab flag literally says
  • Causal claims linking a condition to a symptom unless a lab outlier supports it

For each diagnosed condition in FACTS.patient.conditions, default to NEUTRAL framing:
  ✗ "active inflammation from UC despite treatment"
  ✓ "UC, currently treated with mesalamine + ustekinumab"
  ✗ "uncontrolled diabetes"
  ✓ "diabetes (current A1c X)"
  ✗ "severe fatty liver"
  ✓ "liver enzymes elevated (ALT 97)"

Activity / control / flare claims are ONLY allowed when:
  • An explicit inflammatory marker (hs-CRP, ESR, fecal calprotectin) is FLAGGED in FACTS.lab_outliers, OR
  • A symptom in FACTS.patient.symptoms has severity ≥ 7, OR
  • A risk calculator in FACTS.risk_calculators is in a "high" / "advanced" category.

If none of those apply, describe the condition as treated / monitored, NOT as active.

WHAT YOU WRITE:
1. headline — ≤9 words, the one-line verdict for the hero card.
2. summary — 3 sentences max. What's wrong, what we'll fix, how long.
3. condition_prose — for EVERY condition in FACTS.conditions, write evidence (specific labs/meds that fired the rule) + a curious one-sentence question to bring to the doctor.

(symptoms_addressed is computed deterministically by the rules engine — you do NOT write it.)

EXAMPLE OUTPUT (Mitchell, 28, UC, on mesalamine + atorvastatin, ALT 97, TG 327, Vit D 24):

{
  "headline": "Sleep debt and active UC are driving your labs.",
  "summary": "Three things are talking to each other: chronic sleep debt is amplifying inflammation and triglycerides, active ulcerative colitis is stressing your liver and absorption, and both together are nudging your red blood cells up. We fix sleep first, repair the gut and liver in parallel, and recheck in 12 weeks.",
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
  condition_prose: { name: string; evidence: string; what_to_ask_doctor: string }[];
}

export function buildNarrativeUserMessage(facts: ClinicalFacts): string {
  // Compact FACTS payload — only what the AI needs to write narrative.
  // patient.bmi + patient.bmiCategory let the AI surface body-comp context
  // when relevant (e.g., a metabolic-syndrome plan should reference BMI in
  // the summary if it's elevated). When null, AI omits the framing.
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
