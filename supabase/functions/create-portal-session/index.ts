// supabase/functions/create-portal-session/index.ts
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
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
    if (!profile?.stripe_customer_id) return new Response(JSON.stringify({ error: 'No active subscription found. Subscribe first to access the billing portal.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    })
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[portal] error:', err)
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? 'Portal session failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
