// supabase/functions/record-consent/index.ts
//
// Records a consent event into consent_log. Called from the frontend at
// each of the three consent moments (terms / ai_processing /
// health_data_authorization). The edge function captures the client's IP
// from request headers — clients can't spoof it.
//
// Auth: requires the user's JWT (must be authenticated to consent on
// their own behalf). Anonymous consent makes no sense — there's no user
// to attach it to.
//
// Body shape:
//   {
//     consent_type: 'terms' | 'ai_processing' | 'health_data_authorization',
//     presented_at: string (ISO timestamp when the screen was shown),
//     policy_version: string (e.g. "2.0" or "2026-05-06"),
//   }
//
// Response: 201 + { id, accepted_at } on success, 4xx/5xx on failure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TYPES = new Set(['terms', 'ai_processing', 'health_data_authorization']);

function clientIpFrom(req: Request): string | null {
  // Supabase runs behind a proxy. The real IP comes through these headers
  // in priority order. cf-connecting-ip is set when Cloudflare fronts.
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  ];
  for (const c of candidates) {
    if (c && c.length > 0 && c.length < 64) return c;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Authenticate caller ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse + validate body ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { consent_type, presented_at, policy_version } = body ?? {};
    if (!consent_type || !ALLOWED_TYPES.has(consent_type)) {
      return new Response(JSON.stringify({ error: 'Invalid consent_type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!policy_version || typeof policy_version !== 'string' || policy_version.length > 32) {
      return new Response(JSON.stringify({ error: 'Invalid policy_version' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const presentedAt = (typeof presented_at === 'string' && presented_at.length > 0)
      ? presented_at
      : new Date().toISOString();

    // ── Capture metadata ──────────────────────────────────────────────
    const ip = clientIpFrom(req);
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 500);

    // ── Insert (service role bypasses RLS — we already authenticated) ──
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error: insertErr } = await admin
      .from('consent_log')
      .insert({
        user_id: user.id,
        consent_type,
        presented_at: presentedAt,
        accepted_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        policy_version,
      })
      .select('id, accepted_at')
      .single();

    if (insertErr) {
      console.error('[record-consent] insert failed:', insertErr);
      return new Response(JSON.stringify({ error: `Failed to record consent: ${insertErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[record-consent] ${consent_type} recorded for ${user.id.slice(0, 8)}... (v=${policy_version})`);
    return new Response(JSON.stringify({ id: data.id, accepted_at: data.accepted_at }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[record-consent] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
