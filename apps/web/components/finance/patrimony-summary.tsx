'use client'

import { useTransition } from 'react'
import { formatBRL } from '@floow/core-finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { PatrimonySnapshot } from '@floow/db'

interface PatrimonySummaryProps {
  snapshot: PatrimonySnapshot | null
  onRefresh: () => Promise<unknown>
}

/**
 * PatrimonySummary — client component.
 *
 * Displays net worth, liquid assets, liabilities, and a per-type breakdown
 * from the most recent patrimony snapshot. Provides a button to trigger a
 * snapshot refresh via the refreshSnapshot server action.
 *
 * Uses useTransition to call the server action without blocking the UI.
 */
export function PatrimonySummary({ snapshot, onRefresh }: PatrimonySummaryProps) {
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      await onRefresh()
    })
  }

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patrimonio Liquido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Nenhum snapshot disponivel. Clique em &quot;Atualizar Snapshot&quot; para calcular seu patrimonio atual.
          </p>
          <Button
            type="button"
            variant="default"
            onClick={handleRefresh}
            disabled={isPending}
          >
            {isPending ? 'Calculando...' : 'Atualizar Snapshot'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  let breakdown: Record<string, number> = {}
  try {
    breakdown = JSON.parse(snapshot.breakdown ?? '{}')
  } catch {
    breakdown = {}
  }

  const accountTypeLabels: Record<string, string> = {
    checking: 'Conta Corrente',
    savings: 'Poupanca',
    brokerage: 'Investimentos',
    credit_card: 'Cartao de Credito',
    cash: 'Dinheiro em Especie',
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrimonio Liquido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Net Worth — prominent display */}
        <div>
          <p className="text-sm text-gray-500">Patrimonio Liquido Total</p>
          <p className="text-3xl font-bold text-gray-900">
            {formatBRL(snapshot.netWorthCents)}
          </p>
        </div>

        {/* Liquid assets and liabilities */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Ativos Liquidos</p>
            <p className="text-lg font-semibold text-green-700">
              {formatBRL(snapshot.liquidAssetsCents)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Passivos</p>
            <p className="text-lg font-semibold text-red-600">
              {formatBRL(snapshot.liabilitiesCents)}
            </p>
          </div>
        </div>

        {/* Per-type breakdown */}
        {Object.keys(breakdown).length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Detalhamento por tipo</p>
            <div className="space-y-1">
              {Object.entries(breakdown).map(([type, amount]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {accountTypeLabels[type] ?? type}
                  </span>
                  <span className={amount < 0 ? 'text-red-600' : 'text-gray-900'}>
                    {formatBRL(amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Snapshot date */}
        <p className="text-xs text-gray-400">
          Ultima atualizacao:{' '}
          {snapshot.snapshotDate instanceof Date
            ? snapshot.snapshotDate.toLocaleDateString('pt-BR')
            : new Date(snapshot.snapshotDate).toLocaleDateString('pt-BR')}
        </p>

        {/* Refresh button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending ? 'Calculando...' : 'Atualizar Snapshot'}
        </Button>
      </CardContent>
    </Card>
  )
}
