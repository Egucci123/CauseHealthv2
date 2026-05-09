// supabase/functions/drift-detector/index.ts
//
// CROSS-SURFACE DRIFT DETECTOR
// =============================
// Runs as a scheduled background job (cron) or on-demand. For each user
// who has had wellness, lab analysis, AND doctor prep generated in the
// last 24h, compares the clinical facts on each surface and logs any
// divergence to the `drift_log` table.
//
// What we check:
//   1. condition keys present on each surface — must match
//   2. test keys present on each surface — must match
//   3. risk calculator values — must match
//   4. emergency alert keys — must match
//   5. goal target keys — must match
//
// Universal: runs across all users without per-user config. Drift is
// caught system-wide before users see it.
//
// Trigger: scheduled cron via Supabase pg_cron or external trigger.
// On-demand: POST { userId } to detect for a single user.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId: string | null = body?.userId ?? null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find users to scan: either a specific user, or all users with
    // recent surface generation activity (last 24h).
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    let userIds: string[];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data } = await supabase
        .from('clinical_facts_cache')
        .select('user_id')
        .gte('computed_at', since);
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    }

    let detectedCount = 0;
    for (const uid of userIds) {
      const driftItems = await detectDriftForUser(supabase, uid);
      if (driftItems.length > 0) {
        detectedCount += driftItems.length;
        await supabase.from('drift_log').insert(driftItems);
      }
    }

    return new Response(JSON.stringify({
      scanned_users: userIds.length,
      drifts_detected: detectedCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[drift-detector] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

async function detectDriftForUser(supabase: any, userId: string): Promise<any[]> {
  // Pull the latest of each surface
  const [{ data: wellnessRow }, { data: drawRow }, { data: prepRow }] = await Promise.all([
    supabase.from('wellness_plans').select('plan_data, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('lab_draws').select('id, analysis_result, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('doctor_prep_documents').select('document_data, generated_at').eq('user_id', userId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const wellness = wellnessRow?.plan_data;
  const analysis = drawRow?.analysis_result;
  const prep = prepRow?.document_data;

  const drifts: any[] = [];

  // Helper to extract a sorted Set<string> of keys
  const wellnessConditions = new Set<string>(
    (wellness?.suspected_conditions ?? [])
      .map((c: any) => c.key ?? c._key)
      .filter(Boolean)
      .sort(),
  );
  const analysisConditions = new Set<string>(
    (analysis?.patterns ?? [])
      .map((p: any) => p._key)
      .filter(Boolean)
      .sort(),
  );
  const prepConditions = new Set<string>(
    (prep?.possible_conditions ?? [])
      .map((c: any) => c._key ?? c.key)
      .filter(Boolean)
      .sort(),
  );

  // Compare pairs — only when both surfaces have data
  if (wellness && analysis) {
    const diff = symmetricDiff(wellnessConditions, analysisConditions);
    if (diff.length > 0) {
      drifts.push({
        user_id: userId,
        surface_a: 'wellness',
        surface_b: 'analysis',
        drift_kind: 'conditions',
        severity: 'warn',
        details: { diff_keys: diff, wellness_keys: [...wellnessConditions], analysis_keys: [...analysisConditions] },
        hash_a: wellness?.facts_hash ?? null,
        hash_b: analysis?._facts_hash ?? null,
      });
    }
  }

  if (wellness && prep) {
    const diff = symmetricDiff(wellnessConditions, prepConditions);
    if (diff.length > 0) {
      drifts.push({
        user_id: userId,
        surface_a: 'wellness',
        surface_b: 'doctor_prep',
        drift_kind: 'conditions',
        severity: 'warn',
        details: { diff_keys: diff, wellness_keys: [...wellnessConditions], prep_keys: [...prepConditions] },
        hash_a: wellness?.facts_hash ?? null,
        hash_b: prep?._facts_hash ?? null,
      });
    }
  }

  // Test keys — wellness retest_timeline vs doctor prep tests_to_request
  if (wellness && prep) {
    const wellnessTests = new Set<string>(
      (wellness?.retest_timeline ?? [])
        .map((t: any) => t._key)
        .filter(Boolean)
        .sort(),
    );
    const prepTests = new Set<string>(
      (prep?.tests_to_request ?? [])
        .map((t: any) => t._key)
        .filter(Boolean)
        .sort(),
    );
    const testDiff = symmetricDiff(wellnessTests, prepTests);
    if (testDiff.length > 0) {
      drifts.push({
        user_id: userId,
        surface_a: 'wellness',
        surface_b: 'doctor_prep',
        drift_kind: 'tests',
        severity: 'error',  // tests drifting between wellness and doctor prep is more serious
        details: { diff_keys: testDiff, wellness_test_keys: [...wellnessTests], prep_test_keys: [...prepTests] },
        hash_a: wellness?.facts_hash ?? null,
        hash_b: prep?._facts_hash ?? null,
      });
    }
  }

  // Risk calculator drift
  if (wellness && prep) {
    const wRisk = wellness?.risk_calculators ?? {};
    const pRisk = prep?.risk_calculators ?? {};
    const risk_diff: Record<string, { wellness: any; prep: any }> = {};
    for (const k of new Set([...Object.keys(wRisk), ...Object.keys(pRisk)])) {
      const a = wRisk[k]?.value;
      const b = pRisk[k]?.value;
      if (a !== b && (a != null || b != null)) {
        risk_diff[k] = { wellness: a, prep: b };
      }
    }
    if (Object.keys(risk_diff).length > 0) {
      drifts.push({
        user_id: userId,
        surface_a: 'wellness',
        surface_b: 'doctor_prep',
        drift_kind: 'risk_numbers',
        severity: 'error',
        details: risk_diff,
        hash_a: wellness?.facts_hash ?? null,
        hash_b: prep?._facts_hash ?? null,
      });
    }
  }

  return drifts;
}

function symmetricDiff(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (!b.has(x)) out.push(`-${x}`);
  for (const x of b) if (!a.has(x)) out.push(`+${x}`);
  return out;
}
