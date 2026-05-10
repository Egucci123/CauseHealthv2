// supabase/functions/create-checkout-session/index.ts
//
// $19 one-time UNLOCK checkout.
//
// Grants the user pro-tier access + 1 lab-draw upload credit (their first
// upload). After unlock, additional draw uploads cost $5 each via the
// separate create-upload-checkout function.
//
// This was previously mode:'subscription' for a recurring $19/mo plan;
// flipped to mode:'payment' to match the marketed "$19 one-time / lifetime"
// pricing in the PaywallGate UI.
//
// Env: STRIPE_UNLOCK_PRICE_ID (preferred). Falls back to STRIPE_PRICE_ID
// for backwards-compat during the migration window.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    let origin: string | null = null
    try {
      const body = await req.json().catch(() => ({}))
      if (typeof body?.origin === 'string') origin = body.origin
    } catch { /* no body, that's fine */ }
    const APP_URL = origin || Deno.env.get('APP_URL') || 'https://causehealth.app'

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.warn('[checkout-unlock] auth failed:', authError?.message)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: profile } = await supabase.from('profiles').select('stripe_customer_id, first_name, last_name').eq('id', user.id).single()
    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const priceId = Deno.env.get('STRIPE_UNLOCK_PRICE_ID') ?? Deno.env.get('STRIPE_PRICE_ID')
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: STRIPE_UNLOCK_PRICE_ID not set' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      // client_reference_id ensures the webhook can resolve the user even if metadata gets dropped.
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the existing ?subscription=success handler in
      // SubscriptionManagement — it already does optimistic Pro flip + retry-fetch.
      // Include session_id so the success page can verify payment server-
      // side via verify-payment edge function. Belt-and-suspenders alongside
      // the webhook: even if the webhook is misconfigured / paused / lagging,
      // the user still gets unlocked the moment they land on the success URL.
      success_url: `${APP_URL}/settings?tab=subscription&subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/settings?tab=subscription&subscription=canceled`,
      // Tag the session so the webhook knows which product was purchased.
      metadata: {
        supabase_user_id: user.id,
        purchase_type: 'unlock',
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          purchase_type: 'unlock',
        },
      },
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[checkout-unlock] error:', err)
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? 'Checkout failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
