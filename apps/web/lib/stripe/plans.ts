export const PLANS = {
  free: {
    name: 'Free',
    description: 'Controle financeiro básico',
    features: [
      'Até 2 contas',
      'Lançamentos manuais',
      'Dashboard e fluxo de caixa',
    ],
    price: { monthly: 0, annual: 0 },
    stripePriceId: { monthly: null, annual: null },
  },
  pro: {
    name: 'Pro',
    description: 'Gestão financeira completa',
    features: [
      'Contas ilimitadas',
      'Open Finance e importação de OFX/CSV',
      'Investimentos',
      'Planejamento e independência financeira',
      'Suporte prioritário',
    ],
    // Prices in cents: R$19.90/mo = 1990, R$199/yr = 19900
    price: { monthly: 1990, annual: 19900 },
    stripePriceId: {
      monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
      annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
    },
  },
} as const

export type PlanTier = keyof typeof PLANS

/**
 * Look up which plan tier owns the given Stripe price ID.
 * Returns null if the price ID does not match any known plan.
 */
export function getPlanByPriceId(priceId: string): PlanTier | null {
  for (const [tier, plan] of Object.entries(PLANS)) {
    const ids = plan.stripePriceId as { monthly: string | null; annual: string | null }
    if (ids.monthly === priceId || ids.annual === priceId) {
      return tier as PlanTier
    }
  }
  return null
}

/**
 * Format a price in cents to a display string (BRL).
 * e.g. 1990 -> "R$19,90"
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}
