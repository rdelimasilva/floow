import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertEnv } from '@floow/shared'

/**
 * Lazy Stripe client factory.
 *
 * Instantiated on first call, not at module evaluation time.
 * This follows the same pattern as the Supabase client — avoids
 * "Neither apiKey nor config.authenticator provided" during Next.js
 * static build when STRIPE_SECRET_KEY is not set in the build environment.
 */
let _stripe: Stripe | null = null

export function getStripeServer(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(assertEnv('STRIPE_SECRET_KEY'))
  }
  return _stripe
}

/**
 * Re-exported as `stripe` for backward-compatible usage in the webhook handler.
 * Callers should use getStripeServer() directly in new code.
 */
export const stripe = {
  webhooks: {
    constructEvent: (...args: Parameters<Stripe['webhooks']['constructEvent']>) =>
      getStripeServer().webhooks.constructEvent(...args),
  },
  checkout: {
    sessions: {
      create: (...args: Parameters<Stripe['checkout']['sessions']['create']>) =>
        getStripeServer().checkout.sessions.create(...args),
    },
  },
  billingPortal: {
    sessions: {
      create: (...args: Parameters<Stripe['billingPortal']['sessions']['create']>) =>
        getStripeServer().billingPortal.sessions.create(...args),
    },
  },
}

/**
 * Create a Stripe Checkout Session for upgrading to a paid plan.
 * Sets client_reference_id to orgId for webhook correlation.
 * If org already has a stripe_customer_id, reuses that customer.
 */
export async function createCheckoutSession(
  orgId: string,
  priceId: string,
  userEmail: string
): Promise<string> {
  // Look up existing stripe_customer_id from subscriptions table
  const cookieStore = await cookies()
  const supabase = createServerClient(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — middleware handles refresh
          }
        },
      },
    }
  )

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const stripeClient = getStripeServer()

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: orgId,
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing`,
    allow_promotion_codes: true,
  }

  // Reuse existing Stripe customer if available; otherwise let Stripe create one
  if (subscription?.stripe_customer_id) {
    sessionParams.customer = subscription.stripe_customer_id
  } else {
    sessionParams.customer_email = userEmail
  }

  const session = await stripeClient.checkout.sessions.create(sessionParams)
  return session.url!
}

/**
 * Create a Stripe Customer Portal session for self-service subscription management.
 */
export async function createPortalSession(
  stripeCustomerId: string
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await getStripeServer().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/billing`,
  })

  return session.url
}
