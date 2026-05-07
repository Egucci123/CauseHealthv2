// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//
// Handles all Stripe lifecycle events for two pricing flavors:
//
//   ONE-TIME (current model):
//     - $19 unlock     → tier='pro', upload_credits += 1, unlock_purchased_at=NOW
//     - $5 upload pack → upload_credits += 1
//   Both detected via session.metadata.purchase_type from create-checkout-*
//   ('unlock' | 'upload_pack').
//
//   SUBSCRIPTION (legacy — kept so existing pro subscribers keep working):
//     - customer.subscription.created/updated → status + period sync
//     - customer.subscription.deleted         → cancellation
//     - invoice.payment_failed                → past_due
//     - invoice.payment_succeeded             → active
//
// Idempotent via stripe_events table. Routes by event.type, then for
// checkout.session.completed by session.mode + metadata.purchase_type.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!)
  } catch {
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Idempotency — drop duplicates from Stripe retries
  const { data: existing } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
  if (existing) {
    console.log(`[stripe-webhook] Duplicate event ${event.id} (${event.type}) — skipping`)
    return new Response(JSON.stringify({ received: true, duplicate: true }))
  }
  await admin.from('stripe_events').insert({ id: event.id, type: event.type, data: event.data as any })

  console.log(`[stripe-webhook] Processing ${event.type} (${event.id})`)

  try {
    switch (event.type) {
      // ── Checkout completed ─────────────────────────────────────────────────
      // Three shapes possible:
      //   mode=payment, purchase_type=unlock       → grant pro + 1 credit
      //   mode=payment, purchase_type=upload_pack  → grant +1 credit
      //   mode=subscription                        → legacy sub upgrade
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id
        if (!userId) {
          console.warn('[stripe-webhook] checkout.session.completed missing user id')
          break
        }
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id ?? null
        const purchaseType = session.metadata?.purchase_type ?? null

        if (session.mode === 'payment' && purchaseType === 'unlock') {
          // Atomically: tier=pro, +1 credit, stamp unlock_purchased_at, drop comp.
          // Use rpc for the credit increment so we don't clobber a balance the
          // user might have from a prior $5 purchase that happened to land before
          // this unlock (rare, but possible on retries / idempotency).
          await admin.rpc('grant_unlock', { p_user_id: userId, p_customer_id: customerId })
            .then((r) => { if (r.error) throw r.error })
            .catch(async (err) => {
              // If the RPC doesn't exist yet (migration not yet applied), fall
              // back to direct update so we never lose a payment record.
              console.warn('[stripe-webhook] grant_unlock RPC fallback:', err?.message)
              await admin.from('profiles').update({
                subscription_tier: 'pro',
                subscription_status: 'active',
                stripe_customer_id: customerId,
                comp_code_used: null,
              }).eq('id', userId)
            })
          console.log(`[stripe-webhook] User ${userId} unlocked (one-time $19)`)
        } else if (session.mode === 'payment' && purchaseType === 'upload_pack') {
          await admin.rpc('grant_upload_credit', { p_user_id: userId })
            .then((r) => { if (r.error) throw r.error })
            .catch((err) => {
              console.error('[stripe-webhook] grant_upload_credit failed:', err?.message)
            })
          console.log(`[stripe-webhook] User ${userId} +1 upload credit ($5)`)
        } else if (session.mode === 'subscription') {
          // Legacy subscription path
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null
          await admin.from('profiles').update({
            subscription_tier: 'pro',
            subscription_status: 'active',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            comp_code_used: null,
          }).eq('id', userId)
          console.log(`[stripe-webhook] User ${userId} upgraded to Pro via legacy subscription`)
        } else {
          console.warn(`[stripe-webhook] Unhandled checkout shape: mode=${session.mode} purchase_type=${purchaseType}`)
        }
        break
      }

      // ── Subscription lifecycle ─────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (!userId) {
          // Try lookup by customer id if metadata is missing (legacy)
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
          const { data: profile } = await admin.from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle()
          if (!profile) {
            console.warn(`[stripe-webhook] Could not resolve user for subscription ${subscription.id}`)
            break
          }
          await syncSubscription(admin, profile.id, subscription, event.type)
        } else {
          await syncSubscription(admin, userId, subscription, event.type)
        }
        break
      }

      // ── Payment success / failure ──────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break
        await admin.from('profiles').update({
          subscription_status: 'active',
          subscription_tier: 'pro',
        }).eq('stripe_customer_id', customerId)
        console.log(`[stripe-webhook] Payment succeeded for customer ${customerId}`)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break
        await admin.from('profiles').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', customerId)
        console.log(`[stripe-webhook] Payment failed for customer ${customerId}`)
        break
      }

      default:
        // Unhandled event type — already logged via stripe_events insert
        break
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error:', e)
    // Don't 500 — we've already idempotently logged the event. Returning 200
    // prevents Stripe from retrying forever; we can re-process from stripe_events if needed.
  }

  return new Response(JSON.stringify({ received: true }))
})

async function syncSubscription(
  admin: ReturnType<typeof createClient>,
  userId: string,
  subscription: Stripe.Subscription,
  eventType: string,
) {
  const isCanceled = eventType === 'customer.subscription.deleted' || subscription.status === 'canceled'
  const isPastDue = subscription.status === 'past_due' || subscription.status === 'unpaid'
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'

  const tier = isCanceled ? 'free' : (isActive || isPastDue ? 'pro' : 'free')
  const status = isCanceled ? 'canceled'
    : isPastDue ? 'past_due'
    : subscription.status === 'trialing' ? 'trialing'
    : isActive ? 'active'
    : 'inactive'

  const expiresAtIso = new Date(subscription.current_period_end * 1000).toISOString()

  await admin.from('profiles').update({
    subscription_tier: tier,
    subscription_status: status,
    subscription_expires_at: expiresAtIso,
    subscription_period_end: expiresAtIso, // legacy column kept in sync
    stripe_subscription_id: subscription.id,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
  }).eq('id', userId)

  console.log(`[stripe-webhook] Synced user ${userId}: tier=${tier} status=${status} expires=${expiresAtIso}`)
}
