import { z } from 'zod'

export const planTierSchema = z.enum(['free', 'pro'])
export const subscriptionStatusSchema = z.enum([
  'active',
  'canceled',
  'past_due',
  'trialing',
  'incomplete',
])

export type PlanTier = z.infer<typeof planTierSchema>
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  planTier: planTierSchema,
  status: subscriptionStatusSchema,
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  stripePriceId: z.string().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
})

export type Subscription = z.infer<typeof subscriptionSchema>
