'use client'

import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface QuickStatsRowProps {
  incomeCents: number
  expenseCents: number
  netCents: number
}

/**
 * QuickStatsRow — renders three stat cards for the current month:
 *   - Receitas do Mes (total income)
 *   - Despesas do Mes (total expenses, shown as absolute value)
 *   - Saldo do Mes (net)
 */
export function QuickStatsRow({ incomeCents, expenseCents, netCents }: QuickStatsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Receitas do Mes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-green-700">{formatBRL(incomeCents)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Despesas do Mes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-red-600">{formatBRL(Math.abs(expenseCents))}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Saldo do Mes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-xl font-bold ${netCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(netCents)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
