import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Stripe webhook handler.
 *
 * CRITICAL: Read raw body with request.text() — NEVER request.json().
 * Stripe signature verification requires the unmodified raw body bytes.
 * Using request.json() re-serializes the body and breaks signature verification.
 *
 * This route is excluded from auth middleware (see middleware.ts matcher).
 * Uses service_role key to bypass RLS — webhook has no user session.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Stripe webhook signature verification failed: ${message}`)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  const supabase = getServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.client_reference_id
        const stripeCustomerId = session.customer as string
        const stripeSubscriptionId = session.subscription as string

        if (!orgId) {
          console.error('checkout.session.completed: missing client_reference_id')
          break
        }

        await supabase
          .from('subscriptions')
          .update({
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            plan_tier: 'pro',
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeCustomerId = subscription.customer as string

        const status = subscription.status as string
        const planTier =
          status === 'canceled' ? 'free' : undefined

        const updatePayload: Record<string, unknown> = {
          status: mapStripeStatus(status),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }

        if (planTier !== undefined) {
          updatePayload.plan_tier = planTier
        }

        await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_customer_id', stripeCustomerId)

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const stripeCustomerId = subscription.customer as string

        await supabase
          .from('subscriptions')
          .update({
            plan_tier: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', stripeCustomerId)

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeCustomerId = invoice.customer as string
        // Use period_end from the invoice lines or subscription
        const periodEnd = (invoice as unknown as { lines?: { data?: Array<{ period?: { end?: number } }> } }).lines?.data?.[0]?.period?.end

        const updatePayload: Record<string, unknown> = {
          status: 'active',
          updated_at: new Date().toISOString(),
        }

        if (periodEnd) {
          updatePayload.current_period_end = new Date(periodEnd * 1000).toISOString()
        }

        await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_customer_id', stripeCustomerId)

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeCustomerId = invoice.customer as string

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', stripeCustomerId)

        break
      }

      default:
        // Unhandled event type — return 200 to acknowledge receipt
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Webhook handler error for ${event.type}: ${message}`)
    // Return 200 anyway — Stripe will retry on 5xx but not 2xx
    // Log the error for investigation rather than triggering retries
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

/**
 * Map Stripe subscription status to our internal status enum.
 * Stripe statuses: active, past_due, canceled, unpaid, trialing, incomplete, incomplete_expired
 */
function mapStripeStatus(
  stripeStatus: string
): 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'trialing':
      return 'trialing'
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete'
    default:
      return 'active'
  }
}
