// supabase/functions/generate-doctor-prep-v2/index.ts
//
// DOCTOR PREP v2 — deterministic facts + AI prose
// =================================================
// Reads the SAME ClinicalFacts that wellness plan v2 and lab analysis v2
// consume (via clinical_facts_cache). Outputs the same shape as v1 so
// the existing frontend renders without changes.
//
// Universal coherence: tests, conditions, ICD-10s, calculator numbers,
// goal targets all come from the same cache row as the wellness plan.
// Cannot drift.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type PatientInput, type LabValue } from '../_shared/buildPlan.ts';
import { loadOrComputeFacts } from '../_shared/factsCache.ts';
import { acquireLock, releaseLock } from '../_shared/generationLock.ts';
import {
  DOCTOR_PREP_SYSTEM_PROMPT,
  DOCTOR_PREP_TOOL_SCHEMA,
  buildDoctorPrepUserMessage,
  type DoctorPrepOutput,
} from '../_shared/prompts/doctorPrep.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = 'claude-haiku-4-5-20251001';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    const { userId } = await req.json();
    if (!userId) return json({ error: 'userId required' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 0. Acquire lock — prevents concurrent doctor-prep generations ──
    const lock = await acquireLock(supabase, { userId, surface: 'doctor_prep', ttlMs: 90_000 });
    if (!lock.acquired) {
      console.log(`[doctor-prep-v2] lock held until ${lock.heldUntil} — refusing duplicate run`);
      return json({
        error: 'A doctor prep is already generating. Wait for it to finish.',
        code: 'GENERATION_IN_PROGRESS',
        held_until: lock.heldUntil,
      }, 409);
    }

    // Keep the isolate alive past client disconnect (user navigates away
    // mid-generation). Without waitUntil, the edge runtime can kill the
    // function before the AI call returns and the row is written.
    let resolveKeepAlive: () => void = () => {};
    const keepAlive = new Promise<void>((r) => { resolveKeepAlive = r; });
    // @ts-ignore EdgeRuntime is a Supabase Edge Runtime global.
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(keepAlive);
    }

    try {

    // ── 1. Load patient data ───────────────────────────────────────────
    const [profileRes, medsRes, symptomsRes, conditionsRes, suppsRes, drawRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const drawId = drawRes.data?.id ?? null;
    let labValues: any[] = [];
    if (drawId) {
      const { data } = await supabase.from('lab_values').select('*').eq('draw_id', drawId);
      labValues = data ?? [];
    }

    // ── 2. Normalize → PatientInput ────────────────────────────────────
    const input = normalizePatientInput({
      profile, meds: medsRes.data ?? [], symptoms: symptomsRes.data ?? [],
      conditions: conditionsRes.data ?? [], supplements: suppsRes.data ?? [],
      labValues,
    });

    // ── 3. Load or compute ClinicalFacts (single source of truth) ──────
    const { facts, hash: factsHash, fromCache } = await loadOrComputeFacts({
      userId, drawId, input,
    });
    console.log(`[doctor-prep-v2] facts ${fromCache ? 'cache HIT' : 'cache MISS'} (hash=${factsHash.slice(0, 8)}): ${facts.tests.length} tests, ${facts.conditions.length} conditions`);

    // ── 4. Single AI prose call ────────────────────────────────────────
    const aiOutput = await callAnthropicTool<DoctorPrepOutput>({
      system: DOCTOR_PREP_SYSTEM_PROMPT,
      user: buildDoctorPrepUserMessage(facts),
      tool: DOCTOR_PREP_TOOL_SCHEMA,
    }).catch(e => {
      console.error('[doctor-prep-v2] AI call failed, using fallback:', e);
      return doctorPrepFallback(facts);
    });

    // ── 5. Merge facts + AI prose → v1 shape ───────────────────────────
    const doc = mergeIntoDoctorPrepOutput({ facts, ai: aiOutput, factsHash });

    // ── 6. Save to doctor_prep_documents ───────────────────────────────
    // NOTE: `generated_at` is NOT a column on this table — that field
    // lives INSIDE document_data. The DB column `created_at` is auto-set.
    // Earlier versions inserted `generated_at` and the row save failed
    // silently, causing the "doc flashes then reverts to CTA" bug.
    const { error: insertErr } = await supabase
      .from('doctor_prep_documents')
      .insert({
        user_id: userId,
        document_data: doc,
        draw_id: drawId,
      });
    if (insertErr) {
      console.error('[doctor-prep-v2] insert failed:', insertErr);
      return json({
        error: `Failed to save doctor prep: ${insertErr.message ?? String(insertErr)}`,
      }, 500);
    }

    console.log(`[doctor-prep-v2] complete in ${Date.now() - startTime}ms`);
    return json(doc);
    } finally {
      try { await releaseLock(supabase, { userId, surface: 'doctor_prep' }); } catch {}
      resolveKeepAlive();
    }
  } catch (err) {
    console.error('[doctor-prep-v2] error:', err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePatientInput(args: {
  profile: any; meds: any[]; symptoms: any[]; conditions: any[]; supplements: any[]; labValues: any[];
}): PatientInput {
  const { profile, meds, symptoms, conditions, supplements, labValues } = args;
  const conditionsList = (conditions ?? []).map((c: any) => String(c?.name ?? '')).filter(Boolean);
  const medsList = (meds ?? []).map((m: any) => String(m?.name ?? '')).filter(Boolean);
  const supplementsList = (supplements ?? []).map((s: any) => String(s?.name ?? '')).filter(Boolean);
  const symptomsList = (symptoms ?? [])
    .map((s: any) => ({
      name: String(s?.symptom ?? s?.name ?? '').trim(),
      severity: typeof s?.severity === 'number' ? s.severity : 0,
    }))
    .filter((s: { name: string }) => s.name.length > 0);

  const labs: LabValue[] = (labValues ?? []).map((l: any) => ({
    marker: String(l?.marker_name ?? ''),
    value: l?.value ?? null,
    unit: String(l?.unit ?? ''),
    flag: (l?.optimal_flag ?? l?.standard_flag ?? 'normal') as LabValue['flag'],
    refLow: l?.reference_low ?? null,
    refHigh: l?.reference_high ?? null,
    drawnAt: l?.created_at ?? null,
  }));
  const labsLower = labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();

  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31_557_600_000)
    : null;
  const heightCm = typeof profile?.height_cm === 'number' && profile.height_cm > 0 ? profile.height_cm : null;
  const weightKg = typeof profile?.weight_kg === 'number' && profile.weight_kg > 0 ? profile.weight_kg : null;
  const bmi = (heightCm && weightKg) ? +(weightKg / Math.pow(heightCm / 100, 2)).toFixed(1) : null;

  return {
    age, sex: profile?.sex ?? null, heightCm, weightKg, bmi,
    conditionsList,
    conditionsLower: conditionsList.join(' ').toLowerCase(),
    medsList,
    medsLower: medsList.join(' ').toLowerCase(),
    symptomsList,
    symptomsLower: symptomsList.map(s => `${s.name} (${s.severity}/10)`).join(' ').toLowerCase(),
    supplementsList,
    supplementsLower: supplementsList.join(' ').toLowerCase(),
    labs, labsLower,
    isPregnant: !!profile?.is_pregnant,
    hasShellfishAllergy: /shellfish|fish/i.test(profile?.allergies ?? ''),
    hasSulfaAllergy: /sulfa/i.test(profile?.allergies ?? ''),
    freeText: String(profile?.free_text ?? ''),
  };
}

async function callAnthropicTool<T>(args: {
  system: string; user: string; tool: any;
}): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text: args.system }],
        messages: [{ role: 'user', content: args.user }],
        tools: [args.tool],
        tool_choice: { type: 'tool', name: args.tool.name },
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const block = (json?.content ?? []).find((c: any) => c?.type === 'tool_use' && c?.name === args.tool.name);
    if (!block) throw new Error(`No tool_use block (stop_reason=${json?.stop_reason})`);
    return block.input as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ──────────────────────────────────────────────────────────────────────
// MERGE — produce v1-shape doctor_prep_documents.document_data
// ──────────────────────────────────────────────────────────────────────
function mergeIntoDoctorPrepOutput(args: {
  facts: any; ai: DoctorPrepOutput; factsHash: string;
}): any {
  const { facts, ai, factsHash } = args;
  const today = new Date();

  // tests_to_request — deterministic, mirrors wellness retest_timeline.
  // `specialist` field is what the frontend's TestsToRequest component
  // groups by (PCP / GI / Cardiology / Imaging / etc.) — without it,
  // every test falls through to the PCP bucket (e.g., Fecal Calprotectin
  // ends up in PCP instead of GI).
  const tests_to_request = facts.tests.map((t: any) => ({
    emoji: t.emoji ?? '🧪',
    test_name: t.name,
    why_short: t.whyShort,
    clinical_justification: t.whyLong,
    icd10_primary: t.icd10,
    icd10_description: t.icd10Description,
    priority: t.priority,
    insurance_note: t.insuranceNote,
    specialist: t.specialist,    // frontend reads this for bucket routing
    _key: t.key,
    _specialist: t.specialist,   // legacy/debug field, kept for compatibility
  }));

  // possible_conditions — deterministic
  const possible_conditions = facts.conditions.map((c: any) => ({
    name: c.name,
    category: c.category,
    confidence: c.confidence,
    evidence: c.evidence,
    confirmatory_tests: c.confirmatory_tests,
    icd10: c.icd10,
    what_to_ask_doctor: c.what_to_ask_doctor,
    _key: c.key,
  }));

  // medications list with depletion notes — deterministic
  const medications = (facts.patient.meds ?? []).map((m: string) => {
    const dep = facts.depletions.find((d: any) =>
      d.medsMatched.some((mm: string) => mm.toLowerCase() === m.toLowerCase()),
    );
    return {
      name: m,
      dose: '',
      notable_depletion: dep ? `${dep.nutrient} (${dep.severity})` : '',
    };
  });

  // lab_summary — deterministic from outliers
  const lab_summary = {
    draw_date: today.toISOString().split('T')[0],
    lab_name: '',
    urgent_findings: facts.labs.outliers
      .filter((o: any) => o.flag === 'critical_high' || o.flag === 'critical_low')
      .map((o: any) => ({
        emoji: '🚨', marker: o.marker, value: `${o.value} ${o.unit}`,
        flag: o.flag, clinical_note: o.interpretation,
      })),
    other_abnormal: facts.labs.outliers
      .filter((o: any) => o.flag !== 'critical_high' && o.flag !== 'critical_low')
      .map((o: any) => ({
        emoji: '⚠️', marker: o.marker, value: `${o.value} ${o.unit}`, flag: o.flag,
      })),
  };

  return {
    generated_at: today.toISOString(),
    document_date: today.toISOString().split('T')[0],
    headline: ai.headline,
    executive_summary: ai.executive_summary,
    chief_complaint: ai.chief_complaint,
    hpi: ai.hpi,
    pmh: facts.patient.conditions.join('; '),
    medications,
    review_of_systems: {
      constitutional: '', cardiovascular: '', gastrointestinal: '', endocrine: '',
    },
    lab_summary,
    tell_doctor: ai.tell_doctor,
    tests_to_request,
    advanced_screening: [], // v2 keeps this empty — rare-disease tests hit only if backstop fires
    questions_to_ask: ai.questions_to_ask,
    discussion_points: ai.discussion_points,
    patient_questions: ai.patient_questions,
    functional_medicine_note: ai.functional_medicine_note,
    medication_alternatives: [], // future enhancement; v1 had this AI-driven, defer to AI later

    // Deterministic extras (v2 unique)
    possible_conditions,
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,
    prep_instructions: facts.prepInstructions,
    emergency_alerts: facts.emergencyAlerts,
    crisis_alert: facts.crisisAlert,
    canonical_prose: facts.canonicalProse,
    bmi: facts.patient.bmi,
    bmi_category: facts.patient.bmiCategory,

    // Coherence metadata
    _version: 'v2',
    _facts_hash: factsHash,
  };
}

function doctorPrepFallback(facts: any): DoctorPrepOutput {
  const top = facts.labs.outliers[0];
  const cond = facts.conditions[0];
  return {
    headline: cond ? `Follow-up for ${cond.name}` : 'Wellness check-in',
    executive_summary: facts.conditions.slice(0, 4).map((c: any) => `${c.name}: ${c.evidence}`).slice(0, 5),
    chief_complaint: 'Wellness follow-up with abnormal lab review.',
    hpi: `Patient with conditions: ${facts.patient.conditions.join(', ') || 'none'}; on medications: ${facts.patient.meds.join(', ') || 'none'}. Recent labs show ${facts.labs.outliers.slice(0, 3).map((o: any) => `${o.marker} ${o.value}`).join(', ')}.`,
    tell_doctor: facts.conditions.slice(0, 3).map((c: any) => ({
      emoji: '💬', headline: `Discuss ${c.name.split('(')[0].trim()}`, detail: c.what_to_ask_doctor,
    })),
    questions_to_ask: facts.conditions.slice(0, 5).map((c: any) => ({
      emoji: '❓', question: c.what_to_ask_doctor, why: c.evidence,
    })),
    discussion_points: facts.conditions.slice(0, 3).map((c: any) => `${c.name}: ${c.what_to_ask_doctor}`),
    patient_questions: facts.conditions.slice(0, 5).map((c: any) => c.what_to_ask_doctor),
    functional_medicine_note: 'See the wellness plan for the full 12-week protocol.',
  };
}
