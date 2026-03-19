import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/finance/queries'
import { createCheckoutSession, createPortalSession } from '@/lib/stripe/server'
import { PlanCard } from '@/components/billing/plan-card'
import { SubscriptionStatus } from '@/components/billing/subscription-status'
import { PageHeader } from '@/components/ui/page-header'
import type { PlanTier, SubscriptionStatus as SubscriptionStatusType } from '@floow/shared'

/**
 * Helper: get subscription record for an org using Supabase client.
 */
async function getSubscription(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_tier, status, stripe_customer_id, current_period_end, cancel_at_period_end')
    .eq('org_id', orgId)
    .single()
  return data
}

/**
 * Server action: create Stripe Checkout Session and redirect.
 */
async function createCheckout(priceId: string) {
  'use server'
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth')

  const orgId = await getOrgId()

  const checkoutUrl = await createCheckoutSession(
    orgId,
    priceId,
    session.user.email ?? ''
  )

  redirect(checkoutUrl)
}

/**
 * Server action: open Stripe Customer Portal and redirect.
 */
async function openPortal() {
  'use server'
  const orgId = await getOrgId()

  const supabase = await createClient()
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .single()

  if (!subscription?.stripe_customer_id) {
    throw new Error('No Stripe customer ID found')
  }

  const portalUrl = await createPortalSession(subscription.stripe_customer_id)
  redirect(portalUrl)
}

export default async function BillingPage() {
  const orgId = await getOrgId()
  const subscription = await getSubscription(orgId)

  const planTier: PlanTier = (subscription?.plan_tier as PlanTier) ?? 'free'
  const status = (subscription?.status as SubscriptionStatusType) ?? null
  const stripeCustomerId = subscription?.stripe_customer_id ?? null
  const currentPeriodEnd = subscription?.current_period_end ?? null
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plano e Cobrança"
        description="Gerencie seu plano e informações de pagamento."
      />

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
