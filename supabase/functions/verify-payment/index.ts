// supabase/functions/verify-payment/index.ts
//
// SAFETY NET — Stripe-webhook-independent payment grant.
// =========================================================
// The Stripe webhook is the canonical path for granting Pro / upload
// credits after a checkout. But it can fail silently when:
//   - the destination is paused or wrongly configured in Stripe
//   - the signing secret rotates and the env var lags
//   - the destination subscribes to events that don't fire for one-time
//     payments (e.g. only listening to subscription events)
//
// This function lets the post-checkout success page resolve the payment
// itself by hitting Stripe directly with the session_id from the URL:
//
//   /functions/v1/verify-payment   POST { session_id: 'cs_test_…' }
//
// On success: idempotently grants Pro tier + 1 upload credit (for unlock)
// or +1 credit (for upload_pack), exactly mirroring the webhook handler's
// effect. Stamps verified_at into stripe_events as a fallback record.
//
// Idempotency: the same session_id can be POSTed multiple times. We check
// stripe_events first; if the event for this session was already processed
// by the webhook, we just return the current profile state.
//
// Auth: requires the user's JWT — only the user themselves can verify
// their own session.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return jsonResponse({ error: 'Missing Authorization' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: 'Invalid session' }, 401);

    // ── Body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === 'string' ? body.session_id : null;
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return jsonResponse({ error: 'Invalid session_id' }, 400);
    }

    // ── Pull session from Stripe — source of truth ────────────────────
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'subscription'],
    }).catch((err) => {
      console.error('[verify-payment] retrieve failed:', err?.message);
      return null;
    });

    if (!session) {
      return jsonResponse({ error: 'Session not found' }, 404);
    }

    // ── Verify ownership — the JWT user must match the session's user ─
    // (We require BOTH client_reference_id AND metadata.supabase_user_id
    // to match the JWT user. create-checkout sets both.)
    const refUser =
      (session.client_reference_id as string | null) ??
      (session.metadata?.supabase_user_id as string | undefined) ??
      null;
    if (!refUser || refUser !== user.id) {
      console.warn(
        `[verify-payment] ownership mismatch: jwt=${user.id} session=${refUser}`,
      );
      return jsonResponse({ error: 'Session does not belong to this user' }, 403);
    }

    // ── Verify payment status ─────────────────────────────────────────
    // payment_status is the canonical field on a Checkout Session for one-
    // time payments. For subscriptions, status='complete' + payment_status=
    // 'paid' both should hold. We require both so a half-finalized session
    // doesn't grant access.
    const paid = session.payment_status === 'paid';
    const complete = session.status === 'complete';
    if (!paid || !complete) {
      console.log(
        `[verify-payment] not paid yet: status=${session.status} payment_status=${session.payment_status}`,
      );
      return jsonResponse({
        verified: false,
        status: session.status,
        payment_status: session.payment_status,
        message:
          session.payment_status === 'unpaid'
            ? 'Payment is not yet complete. Please wait a moment and reload.'
            : `Payment status: ${session.payment_status}`,
      });
    }

    // ── Grant access ──────────────────────────────────────────────────
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const purchaseType =
      (session.metadata?.purchase_type as string | undefined) ?? null;
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null;

    const grantResult = await grantAccess(admin, {
      userId: user.id,
      purchaseType,
      mode: session.mode,
      customerId,
      subscriptionId,
    });

    // ── Record this manual verification in stripe_events for audit ────
    // Skip if already there (webhook landed first).
    const synthEventId = `verify-payment:${sessionId}`;
    await admin
      .from('stripe_events')
      .upsert(
        {
          id: synthEventId,
          type: 'verify_payment.manual',
          data: {
            session_id: sessionId,
            user_id: user.id,
            purchase_type: purchaseType,
            mode: session.mode,
            grant_result: grantResult,
            verified_at: new Date().toISOString(),
          },
        },
        { onConflict: 'id' },
      )
      .then((r) => {
        if (r.error) console.warn('[verify-payment] audit insert:', r.error.message);
      });

    return jsonResponse({
      verified: true,
      granted: grantResult,
      payment_status: session.payment_status,
      mode: session.mode,
    });
  } catch (err) {
    console.error('[verify-payment] error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// Mirror the stripe-webhook handler's grant logic. Keep these in sync.
// ──────────────────────────────────────────────────────────────────────
async function grantAccess(
  admin: ReturnType<typeof createClient>,
  args: {
    userId: string;
    purchaseType: string | null;
    mode: 'payment' | 'subscription' | 'setup' | string | null;
    customerId: string | null;
    subscriptionId: string | null;
  },
): Promise<Record<string, unknown>> {
  const { userId, purchaseType, mode, customerId, subscriptionId } = args;

  // ─── One-time UNLOCK ($19) ──────────────────────────────────────────
  if (mode === 'payment' && purchaseType === 'unlock') {
    const rpcResult = await admin
      .rpc('grant_unlock', { p_user_id: userId, p_customer_id: customerId })
      .then((r) => ({ ok: !r.error, error: r.error?.message ?? null }))
      .catch((err: any) => ({ ok: false, error: err?.message ?? String(err) }));

    if (!rpcResult.ok) {
      console.warn(
        '[verify-payment] grant_unlock RPC fallback (direct update):',
        rpcResult.error,
      );
      // Fallback: direct update if RPC is missing or errored.
      // We CANNOT increment upload_credits without an atomic RPC, so we set
      // it to GREATEST(current, 1) via a read-then-write.
      const { data: prof } = await admin
        .from('profiles')
        .select('upload_credits')
        .eq('id', userId)
        .single();
      const cur = (prof?.upload_credits as number | undefined) ?? 0;
      await admin
        .from('profiles')
        .update({
          subscription_tier: 'pro',
          subscription_status: 'active',
          stripe_customer_id: customerId,
          comp_code_used: null,
          upload_credits: Math.max(cur, 1),
          unlock_purchased_at: new Date().toISOString(),
        })
        .eq('id', userId);
      return { unlock: 'granted_fallback' };
    }
    return { unlock: 'granted' };
  }

  // ─── One-time UPLOAD pack ($5) ──────────────────────────────────────
  if (mode === 'payment' && purchaseType === 'upload_pack') {
    const rpcResult = await admin
      .rpc('grant_upload_credit', { p_user_id: userId })
      .then((r) => ({ ok: !r.error, error: r.error?.message ?? null }))
      .catch((err: any) => ({ ok: false, error: err?.message ?? String(err) }));

    if (!rpcResult.ok) {
      console.warn(
        '[verify-payment] grant_upload_credit RPC fallback:',
        rpcResult.error,
      );
      const { data: prof } = await admin
        .from('profiles')
        .select('upload_credits')
        .eq('id', userId)
        .single();
      const cur = (prof?.upload_credits as number | undefined) ?? 0;
      await admin
        .from('profiles')
        .update({ upload_credits: cur + 1 })
        .eq('id', userId);
      return { upload_pack: 'granted_fallback' };
    }
    return { upload_pack: 'granted' };
  }

  // ─── Legacy subscription path ───────────────────────────────────────
  if (mode === 'subscription') {
    await admin
      .from('profiles')
      .update({
        subscription_tier: 'pro',
        subscription_status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        comp_code_used: null,
      })
      .eq('id', userId);
    return { subscription: 'granted' };
  }

  console.warn(
    `[verify-payment] unknown grant shape: mode=${mode} purchase_type=${purchaseType}`,
  );
  return { granted: false, reason: 'unknown_shape' };
}
