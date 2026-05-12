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
import { acquireLock, releaseLock } from '../_shared/generationLock.ts';
import { recomputeFlag } from '../_shared/optimalRanges.ts';
import {
  LAB_ANALYSIS_SYSTEM_PROMPT,
  LAB_ANALYSIS_TOOL_SCHEMA,
  buildLabAnalysisUserMessage,
  type LabAnalysisOutput,
} from '../_shared/prompts/labAnalysis.ts';
import { CAUSEHEALTH_CONSTITUTION, CAUSEHEALTH_CONSTITUTION_SHORT } from '../_shared/prompts/_constitution.ts';

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

    // ── 2b. Acquire generation lock (mutex) ────────────────────────────
    // Prevents two concurrent analyze-labs-v2 calls for the same draw —
    // protects against the "user hits retry while prior call is in flight"
    // race that double-runs the AI and double-increments the cap.
    // Auto-expires after 90s in case the function dies mid-run.
    const lock = await acquireLock(supabase, {
      userId, surface: `lab_analysis:${drawId}`, ttlMs: 90_000,
    });
    if (!lock.acquired) {
      console.log(`[analyze-labs-v2] lock held until ${lock.heldUntil} — refusing duplicate run`);
      return json({
        error: 'An analysis is already running for these labs. Wait for it to finish.',
        code: 'GENERATION_IN_PROGRESS',
        held_until: lock.heldUntil,
      }, 409);
    }

    // ── 2c. Detach from request lifecycle ──────────────────────────────
    // The browser tab may navigate away mid-analysis. If the work was
    // bound to the request, the edge runtime would kill it the moment the
    // client disconnects — and the user comes back to a stuck 'processing'
    // row. We use EdgeRuntime.waitUntil so the work keeps running past
    // response and past disconnect. Result is picked up by Realtime + the
    // page's 2s/3s polling loop. We return 202 immediately.
    const backgroundWork = (async () => {
      try {
        await runAnalysis({ supabase, drawId, userId, used, startTime });
      } catch (err) {
        console.error('[analyze-labs-v2] background error:', err);
        try {
          await supabase
            .from('lab_draws')
            .update({ processing_status: 'failed' })
            .eq('id', drawId);
        } catch {}
      } finally {
        try {
          await releaseLock(supabase, { userId, surface: `lab_analysis:${drawId}` });
        } catch {}
      }
    })();

    // @ts-ignore — EdgeRuntime is a Supabase Edge Runtime global. In local
    // dev (deno run) this will be undefined; fall back to awaiting.
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundWork);
      return json({ status: 'started', code: 'ANALYSIS_STARTED' }, 202);
    }
    // Fallback (local dev): await synchronously
    await backgroundWork;
    return json({ status: 'completed' });
  } catch (err) {
    console.error('[analyze-labs-v2] error:', err);
    return json({ error: String(err) }, 500);
  }
});

// Hoisted analysis routine — same logic, just lifted out of the request
// handler so it can run inside EdgeRuntime.waitUntil.
async function runAnalysis(args: {
  supabase: any; drawId: string; userId: string; used: number; startTime: number;
}) {
  const { supabase, drawId, userId, used, startTime } = args;
  // ── 3. Load patient data ───────────────────────────────────────────
    const [{ data: labValues }, { data: profile }, { data: meds }, { data: symptoms }, { data: conditionsData }, { data: suppsData }] = await Promise.all([
      supabase.from('lab_values').select('*').eq('draw_id', drawId),
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('name, icd10').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
    ]);

    if (!labValues?.length) {
      await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
      throw new Error('No lab values found');
    }

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
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────
/**
 * Compute the flag for a lab row from scratch using the lab's own
 * out-of-range determination + the current optimalRanges rules.
 * Ignores the stored optimal_flag entirely (it can go stale when rules
 * change — Evan's CRP 0.5 mg/L was stamped 'watch' under an older rule
 * and stayed that way after the threshold was raised to >1.0 mg/L).
 *
 * The recomputeFlag helper is the single source of truth — same call
 * here, in generate-wellness-plan-v2, and in generate-doctor-prep-v2.
 */
function pickFlag(l: any, ctx: { age: number; sex: 'male' | 'female' | string; isPregnant?: boolean }): string {
  return recomputeFlag(
    {
      marker_name: String(l?.marker_name ?? ''),
      value: l?.value,
      unit: l?.unit,
      standard_flag: l?.standard_flag,
      optimal_flag: l?.optimal_flag,
    },
    { age: ctx.age, sex: ctx.sex, isPregnant: ctx.isPregnant ?? false },
  );
}

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

  // Compute demographics first — pickFlag needs them for sex-stratified
  // rules (testosterone, ferritin, uric acid).
  const age = profile?.date_of_birth
    ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31_557_600_000)
    : null;
  const flagCtx = {
    age: age ?? 35,
    sex: (profile?.sex ?? 'unknown') as string,
    isPregnant: !!profile?.is_pregnant,
  };

  const labs: LabValue[] = (labValues ?? []).map((l: any) => ({
    marker: String(l?.marker_name ?? ''),
    value: l?.value ?? null,
    unit: String(l?.unit ?? ''),
    flag: pickFlag(l, flagCtx) as LabValue['flag'],
    refLow: l?.standard_low ?? l?.reference_low ?? null,
    refHigh: l?.standard_high ?? l?.reference_high ?? null,
    drawnAt: l?.created_at ?? null,
  }));
  const labsLower = labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();
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
        // 1-hour prompt caching (beta) — covers full analysis→wellness→prep
        // user reading sessions. Constitution + tool schema stay warm.
        'anthropic-beta': 'extended-cache-ttl-2025-04-11',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        // Split at constitution boundary — see splitForCache() below.
        system: splitForCache(args.system),
        messages: [{ role: 'user', content: args.user }],
        tools: [{ ...args.tool, cache_control: { type: 'ephemeral', ttl: '1h' } }],
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

/**
 * Split system prompt into 2 cached blocks at the CauseHealth constitution
 * boundary so the constitution becomes a SHARED cache entry across all v2
 * AI calls. First call writes; subsequent calls hit at 10% on read.
 */
function splitForCache(system: string): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral'; ttl: '1h' } }> {
  const cc = { type: 'ephemeral' as const, ttl: '1h' as const };
  for (const constitution of [CAUSEHEALTH_CONSTITUTION, CAUSEHEALTH_CONSTITUTION_SHORT]) {
    if (system.startsWith(constitution)) {
      const tail = system.slice(constitution.length);
      if (tail.trim().length === 0) return [{ type: 'text', text: constitution, cache_control: cc }];
      return [
        { type: 'text', text: constitution, cache_control: cc },
        { type: 'text', text: tail, cache_control: cc },
      ];
    }
  }
  return [{ type: 'text', text: system, cache_control: cc }];
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

  // priority_findings: deterministic outliers + deterministic prose
  // (2026-05-12-29: facts.findingExplanations preferred; AI is pass-through
  // only and used as fallback).
  const expByMarker = new Map<string, { marker: string; explanation: string; what_to_do: string }>();
  for (const e of (facts.findingExplanations ?? [])) expByMarker.set(String(e.marker).toLowerCase(), e);
  for (const e of ai.finding_explanations ?? []) {
    const k = String(e.marker).toLowerCase();
    if (!expByMarker.has(k)) expByMarker.set(k, e);
  }

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

  // patterns: deterministic conditions + deterministic prose
  // (2026-05-12-29: facts.patternDescriptions preferred over AI).
  const descByName = new Map<string, { name: string; description: string; likely_cause: string }>();
  for (const p of (facts.patternDescriptions ?? [])) descByName.set(String(p.name).toLowerCase(), p);
  for (const p of ai.pattern_descriptions ?? []) {
    const k = String(p.name).toLowerCase();
    if (!descByName.has(k)) descByName.set(k, p);
  }

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
    immediate_actions: (Array.isArray(facts.todayActions) && facts.todayActions.length > 0)
      ? facts.todayActions.map((a: any) => ({ emoji: a.emoji, action: a.action }))
      : ai.immediate_actions,

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
