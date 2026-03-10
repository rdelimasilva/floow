'use client'

import { useTransition } from 'react'
import { CreditCard, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PlanTier, SubscriptionStatus } from '@floow/shared'

interface SubscriptionStatusProps {
  planTier: PlanTier
  status: SubscriptionStatus | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  onManageSubscription: () => Promise<void>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Ativo', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  trialing: { label: 'Trial', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: Clock },
  past_due: { label: 'Pagamento Pendente', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: AlertCircle },
  canceled: { label: 'Cancelado', color: 'text-red-700 bg-red-50 border-red-200', icon: AlertCircle },
  incomplete: { label: 'Incompleto', color: 'text-gray-700 bg-gray-50 border-gray-200', icon: AlertCircle },
}

export function SubscriptionStatus({
  planTier,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  stripeCustomerId,
  onManageSubscription,
}: SubscriptionStatusProps) {
  const [isPending, startTransition] = useTransition()

  const isPro = planTier === 'pro'
  const statusKey = status ?? 'active'
  const statusConfig = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.active
  const StatusIcon = statusConfig.icon

  const periodEndDate = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  function handleManage() {
    startTransition(async () => {
      await onManageSubscription()
    })
  }

  return (
    <Card className="border-gray-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <CreditCard className="h-4 w-4 text-gray-500" />
          Sua Assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-700">Plano Atual</p>
            <p className="text-lg font-semibold text-gray-900 capitalize">
              {isPro ? 'Pro' : 'Grátis'}
            </p>
          </div>

          {status && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                statusConfig.color
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusConfig.label}
            </div>
          )}
        </div>

        {isPro && periodEndDate && (
          <p className="text-sm text-gray-500">
            {cancelAtPeriodEnd
              ? `Cancela em ${periodEndDate}`
              : `Renova em ${periodEndDate}`}
          </p>
        )}

        {cancelAtPeriodEnd && isPro && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
            <p className="text-xs text-yellow-800">
              Sua assinatura foi cancelada e encerrará ao fim do período atual. Você pode reativar pelo Portal do Cliente.
            </p>
          </div>
        )}

        {isPro && stripeCustomerId && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManage}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? 'Redirecionando...' : 'Gerenciar Assinatura'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
