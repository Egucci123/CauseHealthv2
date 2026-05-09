// supabase/functions/_shared/prompts/doctorPrep.ts
//
// DOCTOR PREP v2 PROMPT
// =====================
// Reads ClinicalFacts (deterministic) and writes the PCP-facing prose.
// AI fills:
//   - chief_complaint (clinical, ≤15 words)
//   - hpi (history of present illness, MD-to-MD voice, 2-3 sentences)
//   - executive_summary (3-5 bullets for the busy PCP scan)
//   - tell_doctor (6-10 word headlines + 1-sentence detail)
//   - questions_to_ask (patient-friendly, plain English)
//   - discussion_points (lead with the ask)
//   - functional_medicine_note (clinical-to-functional bridge)
//   - medication_alternatives (when current med has issues)
//
// Deterministic fields populated separately:
//   tests_to_request, advanced_screening, lab_summary, possible_conditions,
//   risk numbers, pre-analytical prep.

import type { ClinicalFacts } from '../buildPlan.ts';

export const DOCTOR_PREP_TOOL_SCHEMA = {
  name: 'submit_doctor_prep',
  description: 'Submit the PCP-facing prose for the doctor prep document.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        maxLength: 90,
        description: 'One-line verdict for the busy PCP, ≤12 words. COMPLETE sentence.',
      },
      executive_summary: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: { type: 'string', maxLength: 120 },
        description: '3-5 bullets the PCP reads in 30 seconds — patient context + key labs + the ask.',
      },
      chief_complaint: {
        type: 'string',
        maxLength: 110,
        description: '≤15 words. Clinical phrasing. Examples: "Follow-up for elevated liver enzymes and dyslipidemia." / "Wellness optimization for fatigue + sleep disruption."',
      },
      hpi: {
        type: 'string',
        maxLength: 360,
        description: '2-3 sentence history of present illness in MD-to-MD voice. Cite labs + meds + relevant conditions.',
      },
      tell_doctor: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string' },
            headline: { type: 'string', maxLength: 70 },
            detail: { type: 'string', maxLength: 180 },
          },
          required: ['emoji', 'headline', 'detail'],
        },
        description: 'Patient-facing "what to tell your doctor" — 6-10 word headlines.',
      },
      questions_to_ask: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string', description: 'Default ❓' },
            question: { type: 'string', maxLength: 180 },
            why: { type: 'string', maxLength: 160 },
          },
          required: ['emoji', 'question', 'why'],
        },
      },
      discussion_points: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 200 },
        description: 'Lead with the ask. 1-2 sentences each.',
      },
      patient_questions: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', maxLength: 180 },
        description: 'Plain-language fallback list of questions.',
      },
      functional_medicine_note: {
        type: 'string',
        maxLength: 360,
        description: '2-3 sentences in plain English bridging conventional findings to root-cause framing.',
      },
    },
    required: ['headline', 'executive_summary', 'chief_complaint', 'hpi', 'tell_doctor', 'questions_to_ask', 'discussion_points', 'patient_questions', 'functional_medicine_note'],
  },
} as const;

export const DOCTOR_PREP_SYSTEM_PROMPT = `You are the clinical writer for the CauseHealth doctor prep document — what the patient brings to their PCP visit.

YOUR JOB IS PROSE. The clinical facts (which conditions, which tests, which calculator results, which referrals) are pre-computed. You write the narrative that frames them.

VOICE — match the examples below:
• Two voices, side-by-side: a CLINICAL voice (chief_complaint, hpi, functional_medicine_note) and a PATIENT voice (tell_doctor, questions_to_ask, discussion_points).
• Clinical voice: MD-to-MD, neutral, references labs + meds + ICD-10s without jargon overload. NOT alarmist. Not casual.
• Patient voice: 6th-grade English, equipped-advocate. Question-form lines the patient reads aloud.

CLINICAL CLAIMS — STRICT (non-negotiable, same as wellness/analysis):
NEVER assert disease activity / treatment failure / severity unless FACTS supports it.
Default to neutral framing for diagnosed conditions: "UC, currently treated with mesalamine + ustekinumab" — never "active UC despite treatment" without evidence in FACTS.

REFERENCING TESTS / SUPPLEMENTS:
NEVER list more than ONE test name per sentence. The full test list is rendered separately from FACTS.tests — your prose should reference "the test panel" or specific tests by exact "name" field.
NEVER recommend a supplement that isn't in FACTS.supplementCandidates.

EXAMPLE OUTPUT (Mitchell, 28, UC + atorvastatin, ALT 97, TG 327, Vit D 24, BMI 30):

{
  "headline": "Liver and lipid follow-up with NAFLD rule-out.",
  "chief_complaint": "Follow-up for elevated ALT, dyslipidemia, and fatigue + sleep disruption.",
  "hpi": "28-year-old male with ulcerative colitis on mesalamine and ustekinumab, atorvastatin for dyslipidemia. Recent labs reveal ALT 97, AST 48, triglycerides 327, vitamin D 24, BMI 30. Reports persistent fatigue, afternoon energy crash, and broken sleep. TG/HDL ratio 8.0 with watch-tier glucose suggests early hyperinsulinemia.",
  "executive_summary": [
    "ALT >2× ULN with high triglycerides + BMI 30 — fits NAFLD with statin overlay; ultrasound or FibroScan recommended.",
    "TG/HDL ratio 8.0 + glucose 98 + A1c 5.5 — fasting insulin and HOMA-IR confirm insulin-resistance pattern.",
    "Hemoconcentration signature (albumin 5.1, RBC 5.96, Hct 51.4) — 14-day hydration trial recommended before erythrocytosis workup.",
    "Sleep apnea rule-out indicated given polycythemia signature + sleep symptoms + BMI 30."
  ],
  "tell_doctor": [
    { "emoji": "💧", "headline": "I want to try a hydration trial first", "detail": "My albumin, RBC, and hematocrit are all elevated together — could be hemoconcentration before erythrocytosis." }
  ],
  "questions_to_ask": [
    { "emoji": "❓", "question": "Is an ultrasound or FibroScan the right next step for my liver?", "why": "ALT 97 with BMI 30 and TG 327 fits fatty liver; imaging confirms." }
  ],
  "functional_medicine_note": "The lab pattern frames a metabolic-syndrome precursor with hepatic involvement. Hydration, statin-driven supplementation (CoQ10, methylfolate), omega-3 for triglycerides, and vitamin D repletion address the modifiable drivers in parallel with the patient's existing UC and statin regimens."
}

OUTPUT FORMAT:
Use the submit_doctor_prep tool. Do not write text outside the tool call.`;

export interface DoctorPrepOutput {
  headline: string;
  executive_summary: string[];
  chief_complaint: string;
  hpi: string;
  tell_doctor: { emoji: string; headline: string; detail: string }[];
  questions_to_ask: { emoji: string; question: string; why: string }[];
  discussion_points: string[];
  patient_questions: string[];
  functional_medicine_note: string;
}

export function buildDoctorPrepUserMessage(facts: ClinicalFacts): string {
  const payload = {
    patient: facts.patient,
    lab_outliers: facts.labs.outliers,
    conditions: facts.conditions.map(c => ({
      key: c.key, name: c.name, confidence: c.confidence, evidence: c.evidence,
      icd10: c.icd10, what_to_ask_doctor: c.what_to_ask_doctor,
    })),
    depletions: facts.depletions,
    supplement_candidates: facts.supplementCandidates,
    tests: facts.tests.map(t => ({
      key: t.key, name: t.name, icd10: t.icd10, priority: t.priority,
      specialist: t.specialist, why_short: t.whyShort,
    })),
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,
    emergency_alerts: facts.emergencyAlerts,
    crisis_alert: facts.crisisAlert,
    prep_instructions: facts.prepInstructions,
    is_optimization_mode: facts.isOptimizationMode,
    canonical_prose: facts.canonicalProse,
  };

  return `FACTS (deterministic — do not invent or contradict):

${JSON.stringify(payload, null, 2)}

WRITE the doctor-facing prep document. Use the submit_doctor_prep tool.`;
}
