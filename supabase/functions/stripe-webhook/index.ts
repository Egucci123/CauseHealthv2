// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })
  const body = await req.text()
  let event: Stripe.Event
  try { event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!) }
  catch { return new Response('Webhook signature verification failed', { status: 400 }) }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: existing } = await admin.from('stripe_events').select('id').eq('id', event.id).single()
  if (existing) return new Response(JSON.stringify({ received: true }))
  await admin.from('stripe_events').insert({ id: event.id, type: event.type, data: event.data })

  const subscription = event.data.object as Stripe.Subscription
  const statusMap: Record<string, string> = {
    'customer.subscription.created': 'active', 'customer.subscription.updated': subscription.status,
    'customer.subscription.deleted': 'canceled', 'invoice.payment_failed': 'past_due', 'invoice.payment_succeeded': 'active',
  }

  if (event.type in statusMap) {
    const userId = subscription.metadata?.supabase_user_id
    if (userId) {
      await admin.from('profiles').update({
        subscription_status: statusMap[event.type], stripe_subscription_id: subscription.id,
        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      }).eq('id', userId)
    }
  }
  return new Response(JSON.stringify({ received: true }))
})
