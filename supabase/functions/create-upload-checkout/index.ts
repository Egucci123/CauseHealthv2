// supabase/functions/create-upload-checkout/index.ts
//
// $5 one-time UPLOAD-PACK checkout.
//
// Grants +1 lab-draw upload credit. Triggered when a user with
// upload_credits=0 attempts to upload a brand-new lab draw.
//
// Append-to-existing-draw is FREE (handled by useAppendToDraw — does not
// hit this function).
//
// Env: STRIPE_UPLOAD_PRICE_ID (required).

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
    } catch { /* no body */ }
    const APP_URL = origin || Deno.env.get('APP_URL') || 'https://causehealth.app'

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
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

    const priceId = Deno.env.get('STRIPE_UPLOAD_PRICE_ID')
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: STRIPE_UPLOAD_PRICE_ID not set' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/labs?upload=success`,
      cancel_url: `${APP_URL}/labs?upload=canceled`,
      metadata: {
        supabase_user_id: user.id,
        purchase_type: 'upload_pack',
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          purchase_type: 'upload_pack',
        },
      },
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[checkout-upload] error:', err)
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? 'Checkout failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
