// supabase/functions/_shared/prompts/labAnalysis.ts
//
// LAB ANALYSIS v2 PROMPT
// =======================
// Reads ClinicalFacts (deterministic) and writes the patient-facing
// prose for the lab-analysis page. AI fills:
//   - score_headline (≤12 words, complete sentence)
//   - finding_explanations (one per outlier — wraps the canonical one_liner)
//   - pattern_descriptions (one per condition — wraps canonical evidence)
//   - immediate_actions (3 bullets, verb-led)
//   - summary (3 sentences, calm, plain English)
//
// AI is FORBIDDEN from inventing tests / conditions / supplements.
// Reference everything by exact name from FACTS.

import type { ClinicalFacts } from '../buildPlan.ts';

export const LAB_ANALYSIS_TOOL_SCHEMA = {
  name: 'submit_lab_analysis',
  description: 'Submit the patient-facing prose for the lab analysis page.',
  input_schema: {
    type: 'object',
    properties: {
      score_headline: {
        type: 'string',
        maxLength: 80,
        description: 'One-line plain-English verdict, ≤12 words, COMPLETE sentence. NEVER alarmist. Examples: "Sleep, liver, and lipids need repair work." / "Vitamin D deficiency and dehydration are driving fatigue."',
      },
      summary: {
        type: 'string',
        maxLength: 380,
        description: '3 short sentences: what we see, what it likely means together, what comes next. Calm, plain English.',
      },
      finding_explanations: {
        type: 'array',
        description: 'For EVERY outlier in FACTS.labs.outliers, in the SAME ORDER, write a 1-sentence plain-English explanation + 1 verb-led action. Do not skip any outliers.',
        items: {
          type: 'object',
          properties: {
            marker: { type: 'string', description: 'Must match FACTS.labs.outliers[i].marker exactly.' },
            explanation: { type: 'string', maxLength: 240, description: '1-2 sentences. WHY this number is what it is and what it means for the patient. Plain English. Cite the value.' },
            what_to_do: { type: 'string', maxLength: 140, description: 'ONE verb-led sentence: what the patient does about it.' },
          },
          required: ['marker', 'explanation', 'what_to_do'],
        },
      },
      pattern_descriptions: {
        type: 'array',
        description: 'For EVERY condition in FACTS.conditions, in the SAME ORDER, write a 1-sentence plain-English description + likely cause. Reference labs from FACTS.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Must match FACTS.conditions[i].name exactly.' },
            description: { type: 'string', maxLength: 220, description: 'ONE sentence: what this pattern means for the patient.' },
            likely_cause: { type: 'string', maxLength: 200, description: 'ONE sentence: the most likely root cause based on FACTS.' },
          },
          required: ['name', 'description', 'likely_cause'],
        },
      },
      immediate_actions: {
        type: 'array',
        maxItems: 3,
        description: 'EXACTLY 3 verb-led actions the patient can take TODAY based on FACTS. Different from supplements (which are wellness-plan territory) — these are behavior anchors.',
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string' },
            action: { type: 'string', maxLength: 120 },
          },
          required: ['emoji', 'action'],
        },
      },
    },
    required: ['score_headline', 'summary', 'finding_explanations', 'pattern_descriptions', 'immediate_actions'],
  },
} as const;

export const LAB_ANALYSIS_SYSTEM_PROMPT = `You are the clinical writer for the CauseHealth lab analysis page — what the patient sees in the first 30 seconds after upload.

YOUR JOB IS PROSE. The clinical facts (which conditions fired, which tests are needed, which supplements help) are pre-computed. You explain them in plain English.

VOICE — match the examples below:
• Calm, curious, plain English at a 6th-grade reading level.
• "Equipped advocate" framing — patient is preparing to talk to their doctor, not panicking.
• NEVER use: "alarming", "dangerous", "critical" (unless lab is in critical-range), "crisis", "emergency" (unless safety_net says so), "rush to ER", "call your doctor today/now".
• NEVER use "optimal", "suboptimal", "below optimal", "above optimal", or "functional optimal" anywhere. CauseHealth is a borderline-detection product, not an optimization product. Use these terms instead:
    - "out-of-range low" / "below the lab's reference range"
    - "borderline-low" or "in the in-range low end" (still in range, pressed to the low end)
    - "in range" or "within the normal range" (no signal)
    - "borderline-high" or "in the in-range high end" (still in range, pressed to the high end)
    - "out-of-range high" / "above the lab's reference range"
• Lab values written as "ALT 97" or "vitamin D 24" — value follows marker, no decoration.
• Cite SPECIFIC labs from FACTS — "ALT 97 and TG 327 together" beats "your liver markers are off."

CLINICAL CLAIMS — STRICT (non-negotiable):
NEVER assert the following without explicit FACTS support:
  • Disease activity ("active", "flaring", "uncontrolled")
  • Treatment failure ("despite treatment", "not responding")
  • Severity beyond what the lab flag literally says
  • A condition not in FACTS.conditions

For diagnosed conditions in FACTS.patient.conditions, default to NEUTRAL framing:
  ✗ "active inflammation from UC despite treatment"
  ✓ "UC, currently treated with mesalamine + ustekinumab"

SHARED PROSE (cross-surface coherence):
The page renders FACTS.canonicalProse strings VERBATIM next to your prose. Don't try to rephrase those — they are the connective tissue with the wellness plan and doctor prep.

EXAMPLE OUTPUT (Mitchell, 28, UC, atorvastatin, ALT 97, TG 327, Vit D 24, BMI 30):

{
  "score_headline": "Sleep, liver, and lipids need repair work.",
  "summary": "Three things are talking to each other: insulin resistance is pushing your triglycerides up, your liver is showing the strain, and dehydration is making your blood counts read high. The plan starts with hydration and statin-driven supplements, and we recheck in 12 weeks.",
  "finding_explanations": [
    {
      "marker": "ALT",
      "explanation": "ALT 97 is more than 2x the upper limit. In the setting of high triglycerides and BMI 30, this most likely reflects fatty liver — reversible at this stage.",
      "what_to_do": "Discuss a liver ultrasound with your PCP at the Week-12 visit."
    },
    {
      "marker": "Triglycerides",
      "explanation": "Triglycerides 327 are well above the 150 goal. Omega-3 + diet typically drop this 30-40% in 12 weeks of consistent intake.",
      "what_to_do": "Start omega-3 (EPA/DHA) 3000 mg with your largest meal."
    }
  ],
  "pattern_descriptions": [
    {
      "name": "NAFLD (Non-alcoholic Fatty Liver Disease)",
      "description": "Your liver enzyme + triglyceride pattern fits early fatty liver driven by insulin resistance and central adiposity.",
      "likely_cause": "Insulin resistance with elevated triglycerides on top of overweight BMI; reversible with hydration, lower carbs, omega-3, and weight reduction."
    }
  ],
  "immediate_actions": [
    { "emoji": "💧", "action": "Drink 3 L of water today and track urine color (pale yellow = hydrated)." },
    { "emoji": "🛏️", "action": "Set a bedtime alarm for 10 PM tonight." },
    { "emoji": "💊", "action": "Start CoQ10 100-200mg with breakfast tomorrow." }
  ]
}

OUTPUT FORMAT:
Use the submit_lab_analysis tool. Do not write text outside the tool call.`;

export interface LabAnalysisOutput {
  score_headline: string;
  summary: string;
  finding_explanations: { marker: string; explanation: string; what_to_do: string }[];
  pattern_descriptions: { name: string; description: string; likely_cause: string }[];
  immediate_actions: { emoji: string; action: string }[];
}

export function buildLabAnalysisUserMessage(facts: ClinicalFacts): string {
  // Compact FACTS payload — the AI gets exactly what it needs.
  const payload = {
    patient: facts.patient,
    lab_outliers: facts.labs.outliers.map(o => ({
      marker: o.marker, value: o.value, unit: o.unit, flag: o.flag,
      interpretation: o.interpretation,
    })),
    suboptimal_flags: facts.suboptimalFlags,
    conditions: facts.conditions.map(c => ({
      key: c.key, name: c.name, confidence: c.confidence, evidence: c.evidence, icd10: c.icd10,
    })),
    depletions: facts.depletions.map(d => ({
      med_class: d.medClass, meds: d.medsMatched, nutrient: d.nutrient,
    })),
    supplement_candidates: facts.supplementCandidates.map(s => ({
      key: s.key, nutrient: s.nutrient, dose: s.dose, timing: s.timing,
    })),
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,
    is_optimization_mode: facts.isOptimizationMode,
    canonical_prose: facts.canonicalProse,
    // Markers whose flag is expected because of a known active condition
    // (e.g. Gilbert syndrome → elevated bilirubin). Surface explicitly so
    // the AI never alarms the user about a known, benign pattern.
    expected_findings: facts.expectedFindings,
  };

  return `FACTS (deterministic — do not invent or contradict):

${JSON.stringify(payload, null, 2)}

EXPECTED-FINDING RULE (universal, applies to all surfaces):
When a marker appears in EXPECTED_FINDINGS, do NOT alarm the user.
Reference the source condition (e.g. "Bilirubin 1.8 is expected with your
Gilbert syndrome"). Do NOT recommend supplements, follow-up tests, or
lifestyle changes specifically targeting that marker — it is expected
for this patient. The marker can still appear in the outlier list, but
its interpretation field must reference the explaining condition.

WRITE the patient-facing lab analysis. Use the submit_lab_analysis tool.`;
}
