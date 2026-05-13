// supabase/functions/generate-wellness-plan-v2/index.ts
//
// CauseHealth Wellness Plan v2 — DETERMINISTIC + PARALLEL AI
// ==========================================================
// Architecture:
//   1. Load patient data (auth + DB).
//   2. Normalize labs / conditions / meds / symptoms into PatientInput.
//   3. buildPlan(input) → ClinicalFacts (deterministic, ~50ms).
//   4. Three PARALLEL AI calls (tool-use, length-capped):
//        Call A — narrative
//        Call B — supplement rationale + lifestyle
//        Call C — today actions + 3-phase plan
//   5. Merge ClinicalFacts + AI prose into the final plan shape (same
//      field names as v1 — frontend works without changes).
//   6. Save to wellness_plans table.
//
// Total wall-clock: ~10s (vs ~90s in v1). Cost: ~$0.04 (vs ~$0.40).
//
// The AI cannot invent tests, conditions, supplements, doses, or risk
// numbers — those are produced by the deterministic layer and the AI's
// tool-use schema does not contain those fields. Output regressions
// fixed once, by construction:
//   • CMP / CBC / Lipid Panel / etc. always present (rule-driven).
//   • No fake test names ("Fecal gut hs-CRP" is impossible).
//   • No standalone ALT/AST when CMP is in list (CMP wins; ALT not in registry as standalone).
//   • No "(b/c) Standard IBD monitoring" copy-paste why text.
//   • Voice consistency via 3 examples per prompt, not 50 rules.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPlan, type PatientInput, type ClinicalFacts, type LabValue } from '../_shared/buildPlan.ts';
import { recomputeFlag } from '../_shared/optimalRanges.ts';
import { loadOrComputeFacts } from '../_shared/factsCache.ts';
import { acquireLock, releaseLock } from '../_shared/generationLock.ts';
import {
  NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_TOOL_SCHEMA,
  buildNarrativeUserMessage,
  type NarrativeOutput,
} from '../_shared/prompts/narrative.ts';
import {
  STACK_SYSTEM_PROMPT,
  STACK_TOOL_SCHEMA,
  buildStackUserMessage,
  type StackOutput,
} from '../_shared/prompts/stack.ts';
import {
  // 2026-05-12-29: ACTION_PLAN_SYSTEM_PROMPT / TOOL_SCHEMA / buildActionPlanUserMessage
  // are no longer used — action plan is fully deterministic. Kept exported
  // for any legacy callers but not imported here.
  buildActionPlanDeterministic,
  type ActionPlanOutput,
} from '../_shared/prompts/actionPlan.ts';
import { applyAllergyFilters } from '../_shared/safetyNet.ts';
import { runMedicationAlternativesEngine } from '../_shared/medicationAlternativesEngine.ts';
import { SUPPLEMENT_BASE } from '../_shared/rules/supplementIndications.ts';
import { CAUSEHEALTH_CONSTITUTION, CAUSEHEALTH_CONSTITUTION_SHORT } from '../_shared/prompts/_constitution.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = 'claude-haiku-4-5-20251001';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ──────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  try {
    const { userId } = await req.json();
    if (!userId) {
      return json({ error: 'userId required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 0. Acquire lock — prevents concurrent wellness-plan generations for
    // the same user. Auto-expires after 90s; always released in finally.
    const lock = await acquireLock(supabase, { userId, surface: 'wellness', ttlMs: 90_000 });
    if (!lock.acquired) {
      console.log(`[wellness-v2] lock held until ${lock.heldUntil} — refusing duplicate run`);
      return json({
        error: 'A wellness plan is already generating. Wait for it to finish.',
        code: 'GENERATION_IN_PROGRESS',
        held_until: lock.heldUntil,
      }, 409);
    }

    // Detach from request lifecycle. Without this, if the user navigates
    // away mid-generation the edge runtime can tear down the isolate before
    // the AI call resolves and the row gets written. waitUntil holds the
    // isolate alive until we resolve the deferred promise in `finally`.
    let resolveKeepAlive: () => void = () => {};
    const keepAlive = new Promise<void>((r) => { resolveKeepAlive = r; });
    // @ts-ignore EdgeRuntime is a Supabase Edge Runtime global.
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(keepAlive);
    }

    try {

    // 1. Load patient data in parallel
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

    // 2. Normalize patient input
    const input = normalizePatientInput({
      profile,
      meds: medsRes.data ?? [],
      symptoms: symptomsRes.data ?? [],
      conditions: conditionsRes.data ?? [],
      supplements: suppsRes.data ?? [],
      labValues,
    });

    // 3. Run deterministic plan builder via the shared cache. Lab analysis
    // and doctor prep both use the same cache helper — same patient input
    // → same facts on every surface. Cache hit returns instantly; cache
    // miss computes + saves. Universal coherence guarantee.
    const { facts, hash: factsHash, fromCache } = await loadOrComputeFacts({
      userId,
      drawId,
      input,
    });
    console.log(`[v2] facts ${fromCache ? 'cache HIT' : 'cache MISS — computed'} (hash=${factsHash.slice(0, 8)}): ${facts.tests.length} tests, ${facts.conditions.length} conditions, ${facts.supplementCandidates.length} supps, ${facts.emergencyAlerts.length} alerts`);

    // 4. AI calls. 2026-05-12-36: action_plan AND workouts are now fully
    //    deterministic. The stack AI call fires ONLY when long-tail
    //    supplements need handwritten notes (no canned content in the
    //    registry). Most patients skip it entirely.
    const action = buildActionPlanDeterministic(facts);
    const suppsNeedingAI = facts.supplementCandidates.filter(s =>
      !(s as any).practicalNote || !(s as any).evidenceNote
    );
    const skipStackAI = suppsNeedingAI.length === 0;

    const stackPromise: Promise<StackOutput> = skipStackAI
      ? Promise.resolve(stackFallback(facts))
      : callAnthropicTool<StackOutput>({
          system: STACK_SYSTEM_PROMPT,
          user: buildStackUserMessage(facts),
          tool: STACK_TOOL_SCHEMA,
        });

    const [narrativeRes, stackRes] = await Promise.allSettled([
      callAnthropicTool<NarrativeOutput>({
        system: NARRATIVE_SYSTEM_PROMPT,
        user: buildNarrativeUserMessage(facts),
        tool: NARRATIVE_TOOL_SCHEMA,
      }),
      stackPromise,
    ]);

    const narrative = settledOrFallback(narrativeRes, narrativeFallback(facts));
    const stack = settledOrFallback(stackRes, stackFallback(facts));

    console.log(`[v2] AI calls finished in ${Date.now() - startTime}ms (narrative=${narrativeRes.status}, stack=${skipStackAI ? 'skipped(deterministic)' : stackRes.status}, action=deterministic)`);

    // 5. Merge into final plan (same shape as v1 for frontend compatibility)
    const plan = mergeIntoFinalPlan({ facts, narrative, stack, action, profile, factsHash });

    // 6. Save
    const { error: insertErr } = await supabase
      .from('wellness_plans')
      .insert({ user_id: userId, draw_id: drawId, plan_data: plan, generation_status: 'complete' });
    if (insertErr) {
      console.error('[v2] insert failed:', insertErr);
      return json({ error: `Failed to save plan: ${insertErr.message ?? String(insertErr)}` }, 500);
    }

    console.log(`[v2] complete in ${Date.now() - startTime}ms`);
    return json(plan, 200);
    } finally {
      // Release the wellness lock — always, even on errors.
      try { await releaseLock(supabase, { userId, surface: 'wellness' }); } catch {}
      // Release waitUntil — runtime can now tear down the isolate.
      resolveKeepAlive();
    }
  } catch (err) {
    console.error('[v2] error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/** See pickFlag in analyze-labs-v2/index.ts — universal flag
 *  recomputation that ignores the stale stored optimal_flag and
 *  re-derives from value + ranges + current rules. */
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
  profile: any;
  meds: any[];
  symptoms: any[];
  conditions: any[];
  supplements: any[];
  labValues: any[];
}): PatientInput {
  const { profile, meds, symptoms, conditions, supplements, labValues } = args;

  const conditionsList = (conditions ?? []).map((c: any) => String(c?.name ?? '')).filter(Boolean);
  const medsList = (meds ?? []).map((m: any) => String(m?.name ?? '')).filter(Boolean);
  const supplementsList = (supplements ?? []).map((s: any) => String(s?.name ?? '')).filter(Boolean);
  // DB column is `symptom` (per v1). Fall back to `name` for any future
  // schema change and filter empties so the rules engine never iterates
  // a blank-name entry.
  const symptomsList = (symptoms ?? [])
    .map((s: any) => ({
      name: String(s?.symptom ?? s?.name ?? '').trim(),
      severity: typeof s?.severity === 'number' ? s.severity : 0,
    }))
    .filter((s: { name: string }) => s.name.length > 0);

  // Compute age from date_of_birth — `profile.age` is not a column.
  // Needed BEFORE labs map for pickFlag's sex/age-stratified rules.
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

  // Build human-readable lab summary string used by regex matchers
  const labsLower = labs.map(l => `${l.marker}: ${l.value} ${l.unit} [${l.flag}]`).join('\n').toLowerCase();

  // Read height_cm + weight_kg directly. Compute BMI = kg / (m^2).
  // Universal adult formula. null if either missing or non-positive.
  const heightCm = typeof profile?.height_cm === 'number' && profile.height_cm > 0 ? profile.height_cm : null;
  const weightKg = typeof profile?.weight_kg === 'number' && profile.weight_kg > 0 ? profile.weight_kg : null;
  const bmi = (heightCm && weightKg)
    ? +(weightKg / Math.pow(heightCm / 100, 2)).toFixed(1)
    : null;

  return {
    age,
    sex: profile?.sex ?? null,
    heightCm,
    weightKg,
    bmi,
    conditionsList,
    conditionsLower: conditionsList.join(' ').toLowerCase(),
    medsList,
    medsLower: medsList.join(' ').toLowerCase(),
    symptomsList,
    symptomsLower: symptomsList.map(s => `${s.name} (${s.severity}/10)`).join(' ').toLowerCase(),
    supplementsList,
    supplementsLower: supplementsList.join(' ').toLowerCase(),
    labs,
    labsLower,
    isPregnant: !!profile?.is_pregnant,
    hasShellfishAllergy: /shellfish|fish/i.test(profile?.allergies ?? ''),
    hasSulfaAllergy: /sulfa/i.test(profile?.allergies ?? ''),
    freeText: String(profile?.free_text ?? ''),
  };
}

// ──────────────────────────────────────────────────────────────────────
// ANTHROPIC TOOL-USE WRAPPER
// ──────────────────────────────────────────────────────────────────────
async function callAnthropicTool<T>(args: {
  system: string;
  user: string;
  tool: any;
}): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 60_000); // 60s per call hard cap

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        // 1-hour prompt caching (beta) — keeps the constitution + tool
        // schema warm across a user's analysis → wellness → doctor-prep
        // reading session. Default 5-min TTL is too short.
        'anthropic-beta': 'extended-cache-ttl-2025-04-11',
      },
      body: JSON.stringify({
        model: MODEL,
        // 8000 covers the worst-case patient: 20 symptoms × 300 char cap +
        // 8 conditions × 300 char cap + headline + summary. v1's 4000 cap
        // was the reason symptoms_addressed silently truncated.
        max_tokens: 8000,
        // Split the system message at the constitution boundary so the
        // shared CAUSEHEALTH_CONSTITUTION becomes its own cache entry —
        // identical across analyze-labs, narrative, stack, doctor-prep.
        // First call writes it; subsequent calls (any surface) read at 10%.
        // The role-specific tail gets its own cache entry that hits on regens.
        system: splitForCache(args.system),
        messages: [{ role: 'user', content: args.user }],
        // Cache the tool schema too — it's identical across regens of
        // the same surface. 1-hour TTL applies to whichever block is
        // closest to the end and has cache_control marked.
        tools: [{ ...args.tool, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        tool_choice: { type: 'tool', name: args.tool.name },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 400)}`);
    }
    const json = await res.json();
    // Log token usage so cost is measurable. Anthropic returns:
    //   input_tokens (uncached), cache_creation_input_tokens (writes at +100%),
    //   cache_read_input_tokens (reads at 10%), output_tokens.
    // Haiku 4.5 pricing: $1/1M input, $5/1M output, cache write +100%, read -90%.
    const u = json?.usage ?? {};
    const inputTok = u.input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const outputTok = u.output_tokens ?? 0;
    const inCost  = (inputTok    / 1e6) * 1.0;
    const wrCost  = (cacheWrite  / 1e6) * 2.0; // 1h write = 2x normal
    const rdCost  = (cacheRead   / 1e6) * 0.1;
    const outCost = (outputTok   / 1e6) * 5.0;
    const totalCents = (inCost + wrCost + rdCost + outCost) * 100;
    console.log(`[wellness-v2 tokens ${args.tool.name}] in=${inputTok} wr=${cacheWrite} rd=${cacheRead} out=${outputTok} = ${totalCents.toFixed(3)}¢`);
    const block = (json?.content ?? []).find((c: any) => c?.type === 'tool_use' && c?.name === args.tool.name);
    if (!block) throw new Error(`No tool_use block in response (stop_reason=${json?.stop_reason})`);
    return block.input as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Split a full system prompt into 2 cached blocks at the constitution
 * boundary. If the prompt begins with the long or short constitution,
 * emit [constitution, tail] each with its own 1-hour cache_control —
 * the constitution becomes a SHARED cache entry across all 4 v2 AI
 * calls so analyze-labs writes it once, wellness + doctor-prep hit it
 * at 10% on read. If neither prefix matches, fall back to one block.
 */
function splitForCache(system: string): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral'; ttl: '1h' } }> {
  const cc = { type: 'ephemeral' as const, ttl: '1h' as const };
  if (system.startsWith(CAUSEHEALTH_CONSTITUTION)) {
    const tail = system.slice(CAUSEHEALTH_CONSTITUTION.length);
    if (tail.trim().length === 0) return [{ type: 'text', text: CAUSEHEALTH_CONSTITUTION, cache_control: cc }];
    return [
      { type: 'text', text: CAUSEHEALTH_CONSTITUTION, cache_control: cc },
      { type: 'text', text: tail, cache_control: cc },
    ];
  }
  if (system.startsWith(CAUSEHEALTH_CONSTITUTION_SHORT)) {
    const tail = system.slice(CAUSEHEALTH_CONSTITUTION_SHORT.length);
    if (tail.trim().length === 0) return [{ type: 'text', text: CAUSEHEALTH_CONSTITUTION_SHORT, cache_control: cc }];
    return [
      { type: 'text', text: CAUSEHEALTH_CONSTITUTION_SHORT, cache_control: cc },
      { type: 'text', text: tail, cache_control: cc },
    ];
  }
  return [{ type: 'text', text: system, cache_control: cc }];
}

function settledOrFallback<T>(res: PromiseSettledResult<T>, fallback: T): T {
  if (res.status === 'fulfilled') return res.value;
  console.error('[v2] AI call failed, using fallback:', res.reason);
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────
// SERVER-SIDE GUARDRAILS — last line of defense against AI drift.
// Universal across every patient.
// ──────────────────────────────────────────────────────────────────────

/**
 * Headline validation. Catches AI sentences that ran out of room and
 * ended mid-thought ("...are driving your.") or are otherwise incomplete.
 * If invalid, build a deterministic fallback from the top lab outlier.
 */
function validateHeadline(headline: string, facts: ClinicalFacts): string {
  const trimmed = String(headline ?? '').trim();
  if (!trimmed) return deterministicHeadline(facts);

  // Length check — the frontend truncates >70 chars with "..." which is
  // visually broken. Reject anything over 60 chars to give a safety
  // margin and force a deterministic fallback.
  if (trimmed.length > 60) {
    console.warn(`[v2] Headline rejected (${trimmed.length} chars > 60): "${trimmed}" — falling back`);
    return deterministicHeadline(facts);
  }

  // Word count — frontend caps at 9 words.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 9) {
    console.warn(`[v2] Headline rejected (${wordCount} words > 9): "${trimmed}" — falling back`);
    return deterministicHeadline(facts);
  }

  // Detect incomplete trailing patterns.
  const incompletePatterns = [
    /\b(and|or|the|your|driving|driven|causing|making|but|with|of|on|at|to|in|for|from|by|is|are|was|were|will|can|may|might|should|would)\.?\s*$/i,
    /,\s*$/,
    /:\s*$/,
    /\b\w+ing\.?$/i, // "...driving." / "...working." — usually incomplete
  ];
  // Allow common complete-sentence-ing endings (rare but valid)
  const looksComplete = /\b(matters|counts|fix|wins|begins|ends|works|recovers|improves|stabilizes|resolves|drops|lifts|clears|heals|repairs|rebalances)\.\s*$/i.test(trimmed);
  const isIncomplete = !looksComplete && incompletePatterns.some(p => p.test(trimmed));

  if (isIncomplete) {
    console.warn(`[v2] Headline rejected (incomplete): "${trimmed}" — falling back`);
    return deterministicHeadline(facts);
  }

  // Must end with terminal punctuation
  if (!/[.!?]$/.test(trimmed)) {
    return trimmed + '.';
  }
  return trimmed;
}

function deterministicHeadline(facts: ClinicalFacts): string {
  // Always ≤60 chars to fit the phone hero card without ellipsis truncation.
  // Lead with the top outlier (short, clinical) — fall back to a short
  // condition name if no outliers, never the full registry name.
  const top = facts.labs.outliers[0];
  if (top) {
    const candidate = `${top.marker} ${top.value} ${top.unit} needs attention.`.trim();
    if (candidate.length <= 60) return candidate;
    // Marker name might be long ("Comprehensive Metabolic Panel") — try a shorter form
    return `${top.marker.split(/[(,/]/)[0].trim()} needs attention.`.slice(0, 60);
  }
  const cond = facts.conditions[0];
  if (cond) {
    // Aggressively shorten the condition name — strip parens, slashes,
    // long suffixes. Most condition names have a usable short prefix.
    const shortName = cond.name.split(/[(/]/)[0].trim().split(/\bwith\b/i)[0].trim();
    const candidate = `${shortName} pattern needs attention.`.trim();
    if (candidate.length <= 60) return candidate;
    // Last-resort hard truncate
    return `${shortName.slice(0, 30)} needs attention.`.slice(0, 60);
  }
  return 'Your wellness plan is ready.';
}

/**
 * Phase-1 verb scrubber. Phase 1 is the START of the program — patient
 * has not begun anything yet. Replace "Continue" / "Maintain" / "Keep"
 * with appropriate start verbs. Universal — applies to any plan.
 */
function fixPhase1Verbs(actions: string[]): string[] {
  return actions.map(a => {
    const trimmed = String(a ?? '');
    // Match: emoji + space + Continue/Maintain/Keep + space + rest.
    // CRITICAL: when the next word IS the verb we want ("drinking",
    // "taking"), consume the gerund so we don't get "Drink drinking"
    // typos. Match `(Continue) drinking` → "Drink", not "Drink drinking".
    return trimmed
      // "Continue drinking water..." → "Drink water..."
      .replace(/^(\W*\s*)(Continue|Continuing|Maintain|Maintaining|Keep|Keeping)\s+(drinking|hydrating)\s+/i, '$1Drink ')
      // "Continue water/hydration ..." (no -ing verb) → "Drink water/hydration ..."
      .replace(/^(\W*\s*)(Continue|Continuing|Maintain|Maintaining|Keep|Keeping)\s+(?=water|hydrat)/i, '$1Drink ')
      // "Continue taking X..." → "Take X..."
      .replace(/^(\W*\s*)(Continue|Continuing|Maintain|Maintaining|Keep|Keeping)\s+(taking|using)\s+/i, '$1Take ')
      // "Continue with X..." → "Take X..."
      .replace(/^(\W*\s*)(Continue|Continuing|Maintain|Maintaining|Keep|Keeping)\s+with\s+(?=the supplement|omega|vitamin|magnesium|coq|iron|b12|folate|milk thistle|l-glutamine)/i, '$1Take ')
      // Generic fallback: Continue/Maintain/Keep → Start
      .replace(/^(\W*\s*)(Continue|Continuing|Maintain|Maintaining|Keep|Keeping)\s+/i, '$1Start ');
  });
}

/**
 * Phase-1 critical-supplement enforcer. Every CRITICAL or HIGH-priority
 * supplement that comes from a medication-depletion or lab-finding source
 * MUST appear in a Phase 1 Start action. The AI sometimes drops one when
 * it has 6+ supplements competing for ~8 slots — universally, the patient
 * loses the highest-leverage Day-1 intervention.
 *
 * If a supplement is missing, prepend a deterministic Start action so the
 * patient gets it on Day 1. Phase-2 "Continue all Phase 1 supplements"
 * statements then become accurate.
 */
/**
 * 2026-05-12-47: Phase 2 dedup against Phase 1.
 * After ensurePhase1CriticalSupplements injects critical/high supplements
 * into Phase 1, scan Phase 2 actions and drop any "Add [supplement]"
 * line whose supplement name appears in Phase 1. Prevents the duplicate
 * Omega-3 / Milk Thistle / Vit D3 in both phases bug.
 *
 * Match logic: extract the first lowercase word after "Add" / "Start"
 * in each Phase 2 line, then check if that token appears in Phase 1's
 * combined text. Loose enough to catch "Omega-3" matching either form.
 */
function dedupPhase2AgainstPhase1(phase2: string[], phase1: string[]): string[] {
  const p1Lower = phase1.join(' ').toLowerCase();
  return phase2.filter(line => {
    // Match the supplement name after "Add" or "Start" verb.
    const m = line.match(/^[^a-z]*(?:add|start)\s+([a-z][a-z0-9-]*)/i);
    if (!m) return true;                                  // not a supplement action — keep
    const supp = m[1].toLowerCase();
    if (supp.length < 3) return true;                     // too short to dedup safely
    // Skip generic verbs that follow Add (resistance / zone-2 / daily / etc).
    const generics = ['resistance', 'zone', 'daily', 'cardio', '2x', '3x', 'training', 'fiber'];
    if (generics.includes(supp)) return true;
    // If supp name appears in Phase 1 actions, drop from Phase 2.
    return !p1Lower.includes(supp);
  });
}

function ensurePhase1CriticalSupplements(
  phase1Actions: string[],
  candidates: Array<{ nutrient: string; dose: string; timing: string; priority: string; sourced_from?: string; sourcedFrom?: string; emoji: string }>,
): string[] {
  const out = [...phase1Actions];
  const phase1Lower = out.join(' ').toLowerCase();

  // Helper: read sourced_from (snake_case in merged plan) or sourcedFrom
  // (camelCase in raw facts.supplementCandidates). Tolerate both shapes
  // so the enforcer works regardless of where the candidates list came from.
  const sourceOf = (c: { sourced_from?: string; sourcedFrom?: string }) =>
    String(c.sourced_from ?? c.sourcedFrom ?? '');

  // Order: critical depletions first (CoQ10 for statin), then other criticals,
  // then high-priority lab findings, then high-priority depletions.
  const mustInclude = candidates
    .filter(c => (c.priority === 'critical' || c.priority === 'high'))
    .filter(c => {
      const s = sourceOf(c);
      return s === 'medication_depletion' || s === 'lab_finding';
    })
    .sort((a, b) => {
      // critical first, then high; depletion-driven before lab-driven within tier
      const pri = (p: string) => (p === 'critical' ? 0 : p === 'high' ? 1 : 2);
      const src = (s: string) => (s === 'medication_depletion' ? 0 : 1);
      return pri(a.priority) - pri(b.priority) || src(sourceOf(a)) - src(sourceOf(b));
    });

  for (const c of mustInclude) {
    // Check if any Phase 1 action references this supplement (loose match
    // on the first word of nutrient — "CoQ10" matches "CoQ10 (Ubiquinol)").
    const firstWord = c.nutrient.toLowerCase().split(/\s|\(/)[0];
    if (!firstWord) continue;
    const alreadyIn = phase1Lower.includes(firstWord);
    if (alreadyIn) continue;

    // Inject a deterministic Start action. Universal phrasing.
    const action = `${c.emoji} Start ${c.nutrient} ${c.dose} ${c.timing.toLowerCase()} — ${c.priority === 'critical' ? 'highest-priority Day-1 supplement' : 'priority Day-1 supplement'}.`;
    out.push(action);
    console.log(`[v2] Phase 1 enforcer: injected missing supplement "${c.nutrient}" (${c.priority} ${sourceOf(c)})`);
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────
// MERGE — combine ClinicalFacts + AI prose into the final plan shape
// ──────────────────────────────────────────────────────────────────────
function mergeIntoFinalPlan(args: {
  facts: ClinicalFacts;
  narrative: NarrativeOutput;
  stack: StackOutput;
  action: ActionPlanOutput;
  profile: any;
  factsHash: string;
}): any {
  const { facts, narrative, stack, action, profile, factsHash } = args;

  // Merge supplement_stack: deterministic candidate + AI rationale
  const stackByNutrient = new Map<string, StackOutput['supplement_notes'][number]>();
  for (const n of stack.supplement_notes) stackByNutrient.set(n.nutrient.toLowerCase(), n);

  const supplementStack = facts.supplementCandidates.map(c => {
    const note = stackByNutrient.get(c.nutrient.toLowerCase());
    return {
      key: c.key,                 // stable supplement key, used by Medications tab
      emoji: c.emoji,
      nutrient: c.nutrient,
      form: c.form,
      dose: c.dose,
      timing: c.timing,
      why_short: c.whyShort,
      why: c.why,
      // 2026-05-12-43: ENGINE WINS for practical + evidence notes.
      // The canned per-supplement notes in SUPPLEMENT_BASE (rich
      // clinical text — "Take with fattiest meal — CoQ10 is fat-soluble
      // absorption drops 50% on empty stomach…") were being overridden
      // by the AI-stack fallback's generic "Take as directed" text.
      // Engine string always wins; AI only fills in when engine is empty.
      practical_note: (c as any).practicalNote ?? note?.practical_note ?? '',
      evidence_note: (c as any).evidenceNote ?? note?.evidence_note ?? '',
      category: c.category,
      priority: c.priority,
      sourced_from: c.sourcedFrom,
      alternatives: c.alternatives,
    };
  });

  // Apply allergy + pregnancy filter (MUTATES supplementStack in place;
  // returns the list of REMOVED items — we discard that, the stack itself
  // is the filtered list).
  applyAllergyFilters(
    supplementStack,
    String(profile?.allergies ?? '').toLowerCase(),
    !!profile?.is_pregnant,
    /\b(warfarin|coumadin|eliquis|xarelto|apixaban|rivaroxaban)\b/i.test(facts.patient.meds.join(' ').toLowerCase()),
  );
  const filteredStack = supplementStack;

  // Merge suspected_conditions: deterministic fact + AI evidence/what_to_ask
  const proseByName = new Map<string, NarrativeOutput['condition_prose'][number]>();
  for (const p of narrative.condition_prose) proseByName.set(p.name.toLowerCase(), p);

  // For each condition's confirmatory_tests, append "(✓ on your test sheet)"
  // when the test is already in retest_timeline. Universal: alias-based
  // match catches "Hemoglobin A1c" / "HbA1c" / "A1c" variants. Avoids
  // confusing the user with apparent duplicate orders.
  const orderedTestKeys = new Set<string>();
  const orderedTestNames: string[] = [];
  for (const t of facts.tests) {
    orderedTestKeys.add(t.key);
    orderedTestNames.push(t.name.toLowerCase());
  }
  const isAlreadyOrdered = (testStr: string): boolean => {
    const lower = testStr.toLowerCase().trim();
    if (!lower) return false;
    if (orderedTestNames.some(n => n === lower || n.includes(lower) || lower.includes(n))) return true;
    // Cross-check via registry alias match against ordered keys
    for (const t of facts.tests) {
      // crude word-boundary match on canonical name
      const firstWord = t.name.toLowerCase().split(/[\s(]/)[0];
      if (firstWord && lower.includes(firstWord) && firstWord.length >= 3) return true;
    }
    return false;
  };

  const suspectedConditions = facts.conditions.map(c => {
    const prose = proseByName.get(c.name.toLowerCase());
    // confirmatory_tests is now { test, why }[] from enrichConfirmatoryTests.
    // Annotate each with "✓ already on your test sheet" when applicable;
    // preserve the why (what-this-test-catches) line.
    const annotatedConfirmatory = (c.confirmatory_tests ?? []).map((t: any) => {
      const test = String(t?.test ?? t ?? '').trim();
      if (!test) return null;
      const why = String(t?.why ?? '').trim();
      return {
        test: isAlreadyOrdered(test) ? `${test} (✓ already on your test sheet)` : test,
        why,
      };
    }).filter((x: any) => x !== null);
    return {
      // Stable cross-surface key — lets drift detector compare wellness ↔
      // analysis ↔ doctor prep on the same identifier. Without this, drift
      // detector reads the AI-rephrased name and falsely flags drift.
      key: c.key,
      _key: c.key,
      name: c.name,
      category: c.category,
      confidence: c.confidence,
      // 2026-05-12-35: ENGINE WINS. Previously we used the AI narrative's
      // condition_prose.evidence (maxLength 150 in the tool schema) which
      // was truncating engine strings mid-sentence ("All your blood numb",
      // "Pattern says you", "ALT" cut off). The engine produces full,
      // clinically complete strings. The AI version adds no value and
      // forces truncation. Use AI only if engine string is empty.
      evidence: (c.evidence && c.evidence.trim()) ? c.evidence : prose?.evidence,
      confirmatory_tests: annotatedConfirmatory,
      icd10: c.icd10,
      what_to_ask_doctor: (c.what_to_ask_doctor && c.what_to_ask_doctor.trim()) ? c.what_to_ask_doctor : prose?.what_to_ask_doctor,
    };
  });

  // retest_timeline = facts.tests, mapped to v1 shape
  const retestTimeline = facts.tests.map(t => ({
    marker: t.name,
    retest_at: '12 weeks',
    why: t.whyLong,
    why_short: t.whyShort,
    icd10: t.icd10,
    icd10_description: t.icd10Description,
    priority: t.priority,
    insurance_note: t.insuranceNote,
    specialist: t.specialist,
    emoji: t.emoji,
    _key: t.key,
  }));

  // Disclaimer — deterministic, never AI-written
  const disclaimer = "CauseHealth is a wellness and health-information service, not a medical provider. We do not diagnose, treat, prescribe, or replace professional medical care. The patterns and tests in this plan are general informational suggestions based on your data — they are not a diagnosis. Always consult your physician or pharmacist before starting any supplement, lifestyle change, or new medication, and before stopping or modifying any prescribed treatment. If you are experiencing a medical emergency, call 911 or your local emergency number.";

  return {
    // Hero / summary — server-side validates headline, never lets a
    // truncated / incomplete sentence reach the user.
    headline: validateHeadline(narrative.headline, facts),
    summary: narrative.summary,
    generated_at: new Date().toISOString(),

    // Action layer (defensive defaults — every array shape stays an array).
    // today_actions: when AI Call C returned empty (sometimes happens when
    // schema is restrictive), fall back to the deterministic actionFallback
    // so the Today tab always renders 3 cards. Never let an empty list
    // reach the frontend.
    today_actions: (Array.isArray(action.today_actions) && action.today_actions.length > 0)
      ? action.today_actions
      : actionFallback(facts).today_actions,
    // 2026-05-12: alternatives stripped from the wellness card. We
    // surface only ONE recommended supplement per finding — the top
    // engine pick. Alternatives are still computed internally and
    // available for the doctor-prep advanced view, but the patient-
    // facing supplement card stays clean: one supplement per signal,
    // the best fit for their markers + patterns.
    supplement_stack: Array.isArray(filteredStack) ? filteredStack.map(s => ({
      ...s,
      alternatives: [],
    })) : [],
    // eating_pattern + lifestyle_interventions are now deterministic
    // (facts.eatingPattern / facts.lifestyleInterventions). The AI is
    // instructed to pass them through verbatim, but if for any reason
    // it returns empty/garbled, fall back to the engine values directly.
    eating_pattern: (stack.eating_pattern && Array.isArray(stack.eating_pattern.emphasize) && stack.eating_pattern.emphasize.length > 0)
      ? {
          name: String(stack.eating_pattern.name ?? facts.eatingPattern.name),
          rationale: String(stack.eating_pattern.rationale ?? facts.eatingPattern.rationale),
          emphasize: stack.eating_pattern.emphasize,
          limit: Array.isArray(stack.eating_pattern.limit) ? stack.eating_pattern.limit : facts.eatingPattern.limit,
        }
      : facts.eatingPattern,
    // 2026-05-12-36: workouts deterministic from engine (proseTemplates).
    // Engine wins; AI workouts kept as a soft fallback only.
    workouts: (Array.isArray(facts.workouts) && facts.workouts.length > 0)
      ? facts.workouts
      : (Array.isArray(stack.workouts) ? stack.workouts : []),
    lifestyle_interventions: {
      diet: (Array.isArray(stack.lifestyle_interventions?.diet) && stack.lifestyle_interventions.diet.length > 0) ? stack.lifestyle_interventions.diet : facts.lifestyleInterventions.diet,
      sleep: (Array.isArray(stack.lifestyle_interventions?.sleep) && stack.lifestyle_interventions.sleep.length > 0) ? stack.lifestyle_interventions.sleep : facts.lifestyleInterventions.sleep,
      exercise: (Array.isArray(stack.lifestyle_interventions?.exercise) && stack.lifestyle_interventions.exercise.length > 0) ? stack.lifestyle_interventions.exercise : facts.lifestyleInterventions.exercise,
      stress: (Array.isArray(stack.lifestyle_interventions?.stress) && stack.lifestyle_interventions.stress.length > 0) ? stack.lifestyle_interventions.stress : facts.lifestyleInterventions.stress,
    },
    action_plan: action.action_plan && typeof action.action_plan === 'object'
      ? {
          // Phase 1: (1) verbs scrubbed (Continue → Drink/Start);
          // (2) critical/high depletion supplements enforced — the AI
          // sometimes drops the most important supplement when it has
          // 6+ candidates competing for slots. The enforcer guarantees
          // every depletion/lab-driven critical+high supplement gets a
          // Day-1 start action.
          phase_1: {
            ...action.action_plan.phase_1,
            actions: ensurePhase1CriticalSupplements(
              fixPhase1Verbs(Array.isArray(action.action_plan.phase_1?.actions) ? action.action_plan.phase_1.actions : []),
              filteredStack,
            ),
          },
          // 2026-05-12-47: Phase 2 dedup — drop any "Add [supplement]"
          // action when the same supplement was already injected into
          // Phase 1 by ensurePhase1CriticalSupplements. Prevents the
          // "Omega-3 appears in Phase 1 AND Phase 2" duplication bug.
          phase_2: {
            ...action.action_plan.phase_2,
            actions: dedupPhase2AgainstPhase1(
              Array.isArray(action.action_plan.phase_2?.actions) ? action.action_plan.phase_2.actions : [],
              ensurePhase1CriticalSupplements(
                fixPhase1Verbs(Array.isArray(action.action_plan.phase_1?.actions) ? action.action_plan.phase_1.actions : []),
                filteredStack,
              ),
            ),
          },
          phase_3: { ...action.action_plan.phase_3, actions: Array.isArray(action.action_plan.phase_3?.actions) ? action.action_plan.phase_3.actions : [] },
        }
      : { phase_1: { name: '', focus: '', actions: [] }, phase_2: { name: '', focus: '', actions: [] }, phase_3: { name: '', focus: '', actions: [] } },

    // Clinical layer
    retest_timeline: Array.isArray(retestTimeline) ? retestTimeline : [],
    suspected_conditions: Array.isArray(suspectedConditions) ? suspectedConditions : [],
    // Symptoms_addressed is now 100% deterministic (rules engine, no AI).
    // Every patient symptom is guaranteed to appear with specific drivers,
    // intervention, lifestyle hint, and timeline.
    symptoms_addressed: facts.symptomsAddressed,

    // v1-compatibility fields (frontend reads these — keep as empty arrays
    // / null so render code that doesn't guard against undefined works)
    interaction_warnings: [],
    progress_summary: null,
    plan_mode: facts.isOptimizationMode ? 'optimization' : 'treatment',
    // 2026-05-13-50: wire up deterministic patternDescriptions output. Previously
    // hardcoded to []. buildPatternDescriptions returns the multi-marker
    // cross-cluster patterns (anabolic profile, hepatic injury, stress leukogram,
    // etc.) that integrated lab interpretation is supposed to surface.
    multi_marker_patterns: Array.isArray(facts.patternDescriptions)
      ? facts.patternDescriptions.map((p: any) => ({
          name: p.name ?? p.pattern_name ?? '',
          markers: p.markers ?? [],
          description: p.description ?? p.explanation ?? '',
          severity: p.severity ?? 'moderate',
          category: p.category ?? 'general',
        }))
      : [],
    // 2026-05-12-35: enriched payload so the Medications tab can render
    // every drug the engine recognizes (314 names across 35 classes),
    // not just the 16 hardcoded in the client data file. Each entry
    // carries clinical_effects + a supplement_key the UI can resolve
    // against plan.supplement_stack for dose/form/timing details.
    medication_depletions: facts.depletions.map(d => {
      // 2026-05-12-38: embed the supplement details (dose/form/timing/
      // practical note) directly so the Medications tab UI doesn't have
      // to look them up in the per-user supplement_stack (which is
      // cap-filtered to top-N and may not include the depletion-repletion
      // supplement). The SUPPLEMENT_BASE registry is universal and has
      // canonical data for every supplement key.
      const base = d.recommendedSupplementKey ? (SUPPLEMENT_BASE as any)[d.recommendedSupplementKey] : undefined;
      return {
        medication: d.medsMatched.join(' / '),
        med_class: d.medClass,
        nutrient: d.nutrient,
        mechanism: d.mechanism,
        severity: d.severity,
        monitoring_test: d.monitoringTest,
        clinical_effects: d.clinicalEffects ?? [],
        recommended_supplement_key: d.recommendedSupplementKey,
        // Embedded supplement details — universal canonical values
        recommended_supplement: base ? {
          nutrient: base.nutrient,
          dose: base.dose,
          form: base.form,
          timing: base.timing,
          why_short: base.defaultWhyShort,
          practical_note: base.practicalNote ?? '',
        } : null,
      };
    }),
    // 2026-05-12-35: deterministic medication alternatives — engine output
    // (signal-driven, 11 rules). Frontend Medications tab consumes this
    // directly so the entire med UI is engine-sourced, not client-data.
    medication_alternatives: runMedicationAlternativesEngine({
      medsLower: facts.patient.meds.join(' ').toLowerCase(),
      conditionsLower: facts.patient.conditions.join(' ').toLowerCase(),
      labValues: facts.labs.raw.map((l: any) => ({
        marker_name: l.marker, value: l.value, unit: l.unit,
        optimal_flag: l.flag, standard_flag: l.flag,
      })),
      symptomsLower: facts.patient.symptoms.map((s: any) => s.name.toLowerCase()).join(' '),
    }),

    // Safety
    emergency_alerts: facts.emergencyAlerts,
    crisis_alert: facts.crisisAlert,
    prep_instructions: facts.prepInstructions,
    suboptimal_flags: facts.suboptimalFlags,

    // Numbers
    risk_calculators: facts.riskCalculators,
    goal_targets: facts.goalTargets,

    // Metadata
    citations: facts.citations,
    is_optimization_mode: facts.isOptimizationMode,
    disclaimer,

    // v2 flag (so the dashboard / debugger can see this came from v2)
    plan_version: 'v2',
    // Cross-surface coherence: this hash identifies the exact ClinicalFacts
    // row in clinical_facts_cache. Lab analysis and doctor prep generated
    // off the same hash are guaranteed to show identical clinical reasoning.
    facts_hash: factsHash,
  };
}

// ──────────────────────────────────────────────────────────────────────
// FALLBACKS — if an AI call fails, the plan still ships with defaults
// derived from FACTS so the user is never left with nothing.
// ──────────────────────────────────────────────────────────────────────
function narrativeFallback(facts: ClinicalFacts): NarrativeOutput {
  const topOutlier = facts.labs.outliers[0];
  return {
    headline: topOutlier ? `${topOutlier.marker} stands out — here is your plan.` : 'Your wellness plan is ready.',
    summary: `We pulled ${facts.tests.length} tests for your follow-up, ${facts.supplementCandidates.length} targeted supplements, and a 12-week structure. Bring the doctor-prep sheet to your PCP.`,
    condition_prose: facts.conditions.map(c => ({
      name: c.name,
      evidence: c.evidence,
      what_to_ask_doctor: c.what_to_ask_doctor,
    })),
  };
}

function stackFallback(facts: ClinicalFacts): StackOutput {
  return {
    // 2026-05-12-43: fallback now uses the engine's canned per-supplement
    // practicalNote + evidenceNote when present, ONLY falling back to a
    // generic message if the supplement has no canned content. Prevents
    // the rich engine notes from being silently overridden when the AI
    // stack call is skipped.
    supplement_notes: facts.supplementCandidates.map(c => ({
      nutrient: c.nutrient,
      practical_note: (c as any).practicalNote ?? 'Take as directed. Verify timing with your pharmacist if you take other meds.',
      evidence_note: (c as any).evidenceNote ?? 'Standard repletion dose with established efficacy.',
    })),
    eating_pattern: {
      name: 'Mediterranean',
      rationale: 'Default broadly applicable pattern — anti-inflammatory and cardio-protective.',
      emphasize: ['Leafy greens', 'Fatty fish 2x/week', 'Olive oil', 'Whole grains'],
      limit: ['Refined sugar', 'Processed meat', 'Refined grains'],
    },
    workouts: [],
    lifestyle_interventions: { diet: [], sleep: [], exercise: [], stress: [] },
  };
}

function actionFallback(facts: ClinicalFacts): ActionPlanOutput {
  return {
    today_actions: [
      { emoji: '💧', action: 'Drink 2-3 L of water today; track urine color (pale yellow = hydrated).', why: 'Hydration is the highest-leverage 24-hour change.', category: 'eat' },
      { emoji: '🛏️', action: 'Set a bedtime alarm for 10:30 PM tonight.', why: 'Sleep extension drives most lab improvements.', category: 'sleep' },
      { emoji: '☀️', action: 'Walk outdoors for 15 minutes between 6:30-8:00 AM.', why: 'Morning light resets circadian rhythm.', category: 'move' },
    ],
    action_plan: {
      phase_1: { name: 'Stabilize (Weeks 1-4)', focus: 'Lock in sleep, hydration, and the critical supplements.', actions: facts.supplementCandidates.slice(0, 5).map(s => `💊 Start ${s.nutrient} ${s.dose} ${s.timing.toLowerCase()}.`) },
      phase_2: { name: 'Optimize (Weeks 5-8)', focus: 'Add resistance training and refine nutrition.', actions: ['🏋️ Add bodyweight resistance training 2x/week.', '🥗 Add 2 leafy-green meals per week.'] },
      phase_3: {
        name: 'Maintain (Weeks 9-12)',
        focus: 'Retest at week 12 and bring results to your PCP.',
        actions: [
          `🧪 At week 12, order the retest panel: ${facts.tests.slice(0, 5).map(t => t.name).join(', ')}.`,
          '🩺 Schedule the PCP visit one week after the draw.',
        ],
      },
    },
  };
}
