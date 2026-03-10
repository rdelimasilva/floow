'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLANS, formatPrice } from '@/lib/stripe/plans'

type PlanKey = 'free' | 'pro'
type BillingInterval = 'monthly' | 'annual'

interface PlanCardProps {
  plan: PlanKey
  currentPlan: PlanKey
  onUpgrade: (priceId: string) => Promise<void>
  recommended?: boolean
}

export function PlanCard({ plan, currentPlan, onUpgrade, recommended }: PlanCardProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [isPending, startTransition] = useTransition()

  const planData = PLANS[plan]
  const isCurrent = plan === currentPlan
  const isFree = plan === 'free'

  const priceId = isFree
    ? null
    : (planData as typeof PLANS.pro).stripePriceId[interval]

  const priceDisplay = isFree
    ? 'Grátis'
    : formatPrice((planData as typeof PLANS.pro).price[interval])

  const periodLabel = isFree ? '' : interval === 'monthly' ? '/mês' : '/ano'

  function handleUpgrade() {
    if (!priceId) return
    startTransition(async () => {
      await onUpgrade(priceId)
    })
  }

  return (
    <Card
      className={cn(
        'relative flex flex-col',
        recommended && 'border-2 border-blue-600 shadow-md',
        isCurrent && !recommended && 'border-gray-300'
      )}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
            Recomendado
          </span>
        </div>
      )}

      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">{planData.name}</CardTitle>
        <CardDescription className="text-sm text-gray-500">
          {planData.description}
        </CardDescription>

        {/* Monthly / Annual toggle for Pro */}
        {!isFree && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                interval === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setInterval('annual')}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                interval === 'annual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Anual
              <span className="ml-1 text-green-600">(economize 17%)</span>
            </button>
          </div>
        )}

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900">{priceDisplay}</span>
          {periodLabel && (
            <span className="text-sm text-gray-500">{periodLabel}</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <ul className="space-y-2">
          {planData.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
              <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        {isCurrent ? (
          <Button variant="outline" className="w-full" disabled>
            Plano Atual
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={handleUpgrade}
            disabled={isPending || !priceId}
          >
            {isPending ? 'Redirecionando...' : 'Fazer Upgrade'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
