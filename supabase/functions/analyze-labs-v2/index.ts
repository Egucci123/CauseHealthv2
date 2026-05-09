// supabase/functions/analyze-labs-v2/index.ts
//
// LAB ANALYSIS v2 — deterministic facts + AI prose
// =================================================
// Reads the SAME ClinicalFacts that wellness plan v2 and doctor prep v2
// consume (via clinical_facts_cache). Outputs the same shape as v1
// (priority_findings, patterns, missing_tests, immediate_actions, summary)
// so the existing frontend renders without changes.
//
// Universal coherence guarantee: if a wellness plan was generated with
// ClinicalFacts hash X, this function reads the SAME hash X and shows
// the SAME conditions, the SAME tests, the SAME goal targets. Mathematically
// impossible for the two surfaces to drift.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type PatientInput, type LabValue } from '../_shared/buildPlan.ts';
import { loadOrComputeFacts } from '../_shared/factsCache.ts';
import {
  LAB_ANALYSIS_SYSTEM_PROMPT,
  LAB_ANALYSIS_TOOL_SCHEMA,
  buildLabAnalysisUserMessage,
  type LabAnalysisOutput,
} from '../_shared/prompts/labAnalysis.ts';

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
    const { drawId, userId } = await req.json();
    if (!drawId || !userId) return json({ error: 'drawId and userId required' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Idempotency guard: return cached analysis if already done ────
    const { data: currentDraw } = await supabase
      .from('lab_draws')
      .select('id, analysis_result, processing_status, analysis_count, analysis_locked_until')
      .eq('id', drawId)
      .single();

    if (currentDraw?.analysis_result && currentDraw.processing_status === 'complete') {
      return json({ ...currentDraw.analysis_result, _idempotent: true });
    }

    // ── 2. Regen cap (same as v1) ──────────────────────────────────────
    const ANALYSIS_CAP = 2;
    const used = currentDraw?.analysis_count ?? 0;
    if (used >= ANALYSIS_CAP) {
      return json({
        error: `You've used all ${ANALYSIS_CAP} lab analyses for this dataset. Upload genuinely new labs to start fresh.`,
        code: 'REGEN_LIMIT_REACHED',
        limit: ANALYSIS_CAP,
        used,
        kind: 'analysis',
      }, 429);
    }

    // ── 3. Load patient data ───────────────────────────────────────────
    const [{ data: labValues }, { data: profile }, { data: meds }, { data: symptoms }, { data: conditionsData }, { data: suppsData }] = await Promise.all([
      supabase.from('lab_values').select('*').eq('draw_id', drawId),
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('name, icd10').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
    ]);

    if (!labValues?.length) return json({ error: 'No lab values found' }, 404);

    // ── 4. Normalize → PatientInput ────────────────────────────────────
    const input = normalizePatientInput({
      profile, meds: meds ?? [], symptoms: symptoms ?? [],
      conditions: conditionsData ?? [], supplements: suppsData ?? [],
      labValues,
    });

    // ── 5. Load or compute ClinicalFacts (single source of truth) ──────
    const { facts, hash: factsHash, fromCache } = await loadOrComputeFacts({
      userId, drawId, input,
    });
    console.log(`[analyze-labs-v2] facts ${fromCache ? 'cache HIT' : 'cache MISS'} (hash=${factsHash.slice(0, 8)}): ${facts.labs.outliers.length} outliers, ${facts.conditions.length} conditions`);

    // ── 6. Single AI prose call ────────────────────────────────────────
    const aiOutput = await callAnthropicTool<LabAnalysisOutput>({
      system: LAB_ANALYSIS_SYSTEM_PROMPT,
      user: buildLabAnalysisUserMessage(facts),
      tool: LAB_ANALYSIS_TOOL_SCHEMA,
    }).catch(e => {
      console.error('[analyze-labs-v2] AI call failed, using fallback:', e);
      return labAnalysisFallback(facts);
    });

    // ── 7. Merge facts + AI prose into v1-shape output ─────────────────
    const result = mergeIntoLabAnalysisOutput({ facts, ai: aiOutput, factsHash });

    // ── 8. Save to lab_draws (matches v1 contract) ─────────────────────
    await supabase
      .from('lab_draws')
      .update({
        analysis_result: result,
        processing_status: 'complete',
        analysis_count: used + 1,
        analysis_locked_until: null,
      })
      .eq('id', drawId);

    console.log(`[analyze-labs-v2] complete in ${Date.now() - startTime}ms`);
    return json(result);
  } catch (err) {
    console.error('[analyze-labs-v2] error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────
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
        max_tokens: 6000,
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
// MERGE → v1 output shape (so frontend renders without changes)
// ──────────────────────────────────────────────────────────────────────
function mergeIntoLabAnalysisOutput(args: {
  facts: any; ai: LabAnalysisOutput; factsHash: string;
}): any {
  const { facts, ai, factsHash } = args;

  // Map outlier severity → v1 flag
  const flagFor = (f: string) => {
    if (f === 'critical_high' || f === 'critical_low') return 'urgent';
    if (f === 'high' || f === 'low') return 'monitor';
    if (f === 'watch') return 'monitor';
    return 'optimal';
  };

  // priority_findings: deterministic outliers + AI explanation/what_to_do
  const expByMarker = new Map<string, LabAnalysisOutput['finding_explanations'][number]>();
  for (const e of ai.finding_explanations ?? []) expByMarker.set(String(e.marker).toLowerCase(), e);

  const priority_findings = facts.labs.outliers.map((o: any) => {
    const exp = expByMarker.get(String(o.marker).toLowerCase());
    return {
      emoji: '🔬',
      marker: o.marker,
      value: `${o.value} ${o.unit}`,
      flag: flagFor(o.flag),
      headline: o.interpretation?.split('—')[0]?.trim()?.slice(0, 80) ?? `${o.marker} ${o.value}`,
      explanation: exp?.explanation ?? `${o.marker} ${o.value} ${o.unit} is outside the normal range.`,
      what_to_do: exp?.what_to_do ?? 'Discuss with your PCP at your next visit.',
    };
  });

  // patterns: deterministic conditions + AI description/cause
  const descByName = new Map<string, LabAnalysisOutput['pattern_descriptions'][number]>();
  for (const p of ai.pattern_descriptions ?? []) descByName.set(String(p.name).toLowerCase(), p);

  const patterns = facts.conditions.map((c: any) => {
    const desc = descByName.get(String(c.name).toLowerCase());
    return {
      emoji: '🧬',
      pattern_name: c.name,
      severity: c.confidence === 'high' ? 'critical' : 'high',
      markers_involved: facts.labs.outliers.map((o: any) => o.marker).slice(0, 6),
      description: desc?.description ?? c.evidence,
      likely_cause: desc?.likely_cause ?? '',
      // v2 extras (frontend ignores unknown keys gracefully)
      _key: c.key,
      _icd10: c.icd10,
      _confirmatory_tests: c.confirmatory_tests,
      _what_to_ask_doctor: c.what_to_ask_doctor,
    };
  });

  // missing_tests: deterministic from facts.tests (the same list wellness shows)
  const missing_tests = facts.tests.slice(0, 14).map((t: any) => ({
    emoji: t.emoji ?? '🧪',
    test_name: t.name,
    why_needed: t.whyShort,
    icd10: t.icd10,
    priority: t.priority,
    _key: t.key,
  }));

  // medication_connections + supplement_connections from depletions
  const medication_connections = facts.depletions.map((d: any) => ({
    medication: d.medsMatched.join(' / '),
    lab_finding: d.monitoringTest ?? d.nutrient,
    connection: d.mechanism,
  }));
  const supplement_connections: any[] = []; // not used in v2 — depletions cover it

  return {
    score_headline: ai.score_headline,
    summary: ai.summary,
    priority_findings,
    patterns,
    medication_connections,
    supplement_connections,
    missing_tests,
    immediate_actions: ai.immediate_actions,

    // v2 extras
    _version: 'v2',
    _facts_hash: factsHash,
    _emergency_alerts: facts.emergencyAlerts,
    _crisis_alert: facts.crisisAlert,
    _goal_targets: facts.goalTargets,
    _risk_calculators: facts.riskCalculators,
    _canonical_prose: facts.canonicalProse,
  };
}

function labAnalysisFallback(facts: any): LabAnalysisOutput {
  const top = facts.labs.outliers[0];
  return {
    score_headline: top ? `${top.marker} ${top.value} stands out — review your plan.` : 'Your lab analysis is ready.',
    summary: `We found ${facts.labs.outliers.length} markers outside the normal range and ${facts.conditions.length} patterns worth discussing with your doctor. The wellness plan walks through what to do over 12 weeks.`,
    finding_explanations: facts.labs.outliers.map((o: any) => ({
      marker: o.marker,
      explanation: o.interpretation,
      what_to_do: 'Discuss with your PCP at your next visit.',
    })),
    pattern_descriptions: facts.conditions.map((c: any) => ({
      name: c.name,
      description: c.evidence,
      likely_cause: '',
    })),
    immediate_actions: [
      { emoji: '💧', action: 'Drink 2-3 L of water today and track urine color (pale = hydrated).' },
      { emoji: '🛏️', action: 'Set a bedtime alarm for 10:30 PM tonight.' },
      { emoji: '🚶', action: 'Walk outdoors 15 min between 6:30-8 AM tomorrow.' },
    ],
  };
}
