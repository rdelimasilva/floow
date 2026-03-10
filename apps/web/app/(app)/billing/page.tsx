import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession, createPortalSession } from '@/lib/stripe/server'
import { PlanCard } from '@/components/billing/plan-card'
import { SubscriptionStatus } from '@/components/billing/subscription-status'
import type { PlanTier, SubscriptionStatus as SubscriptionStatusType } from '@floow/shared'

/**
 * Server action: create Stripe Checkout Session and redirect.
 * FormData contains priceId for the selected plan interval.
 */
async function createCheckout(priceId: string) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  // Resolve the org_id from org_members (user's personal org)
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    throw new Error('No organization found for user')
  }

  const checkoutUrl = await createCheckoutSession(
    membership.org_id,
    priceId,
    user.email ?? ''
  )

  redirect(checkoutUrl)
}

/**
 * Server action: open Stripe Customer Portal and redirect.
 */
async function openPortal() {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    throw new Error('No organization found for user')
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', membership.org_id)
    .single()

  if (!subscription?.stripe_customer_id) {
    throw new Error('No Stripe customer ID found')
  }

  const portalUrl = await createPortalSession(subscription.stripe_customer_id)
  redirect(portalUrl)
}

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  // Get user's org membership
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  // Get subscription record
  const { data: subscription } = membership
    ? await supabase
        .from('subscriptions')
        .select(
          'plan_tier, status, stripe_customer_id, current_period_end, cancel_at_period_end'
        )
        .eq('org_id', membership.org_id)
        .single()
    : { data: null }

  const planTier: PlanTier = (subscription?.plan_tier as PlanTier) ?? 'free'
  const status = (subscription?.status as SubscriptionStatusType) ?? null
  const stripeCustomerId = subscription?.stripe_customer_id ?? null
  const currentPeriodEnd = subscription?.current_period_end ?? null
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Plano e Cobrança
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie seu plano e informações de pagamento.
        </p>
      </div>

      {/* Current subscription status */}
      <SubscriptionStatus
        planTier={planTier}
        status={status}
        currentPeriodEnd={currentPeriodEnd}
        cancelAtPeriodEnd={cancelAtPeriodEnd}
        stripeCustomerId={stripeCustomerId}
        onManageSubscription={openPortal}
      />

      {/* Plan cards */}
      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Planos</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          <PlanCard
            plan="free"
            currentPlan={planTier}
            onUpgrade={createCheckout}
          />
          <PlanCard
            plan="pro"
            currentPlan={planTier}
            onUpgrade={createCheckout}
            recommended
          />
        </div>
      </div>
    </div>
  )
}
