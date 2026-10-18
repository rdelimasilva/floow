'use client'

import { useTransition } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Patrimonio } from '@/lib/finance/patrimonio'

interface PatrimonySummaryProps {
  patrimonio: Patrimonio
  onRefresh: () => Promise<unknown>
}

/**
 * PatrimonySummary — client component.
 *
 * Mostra o patrimônio de agora, calculado com a mesma regra da tela Contas
 * (`calcularPatrimonio`). Antes lia o último snapshot gravado, que só era
 * refeito no clique e ficava semanas para trás.
 *
 * "Atualizar valores" grava o snapshot do dia (o histórico do gráfico de
 * evolução) e recarrega os números.
 */
export function PatrimonySummary({ patrimonio, onRefresh }: PatrimonySummaryProps) {
  const [isPending, startTransition] = useTransition()

  function handleRefresh() {
    startTransition(async () => {
      await onRefresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrimônio Líquido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Net Worth — prominent display */}
        <div>
          <p className="text-sm text-gray-500">Patrimônio Líquido Total</p>
          <p className={`text-3xl font-bold ${patrimonio.patrimonioLiquidoCents < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatBRL(patrimonio.patrimonioLiquidoCents)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Ativos</p>
            <p className="text-lg font-semibold text-green-700">
              {formatBRL(patrimonio.ativosCents)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Passivos</p>
            <p className="text-lg font-semibold text-red-600">
              {formatBRL(patrimonio.passivosCents)}
            </p>
          </div>
        </div>

        {/* Mesmos blocos da tela Contas */}
        {patrimonio.blocos.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Detalhamento por tipo</p>
            <div className="space-y-1">
              {patrimonio.blocos.map((bloco) => (
                <div key={bloco.key} className="flex justify-between text-sm">
                  <span className="text-gray-600">{bloco.titulo}</span>
                  <span className={bloco.valorCents < 0 ? 'text-red-600' : 'text-gray-900'}>
                    {formatBRL(bloco.valorCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending ? 'Calculando...' : 'Atualizar valores'}
        </Button>
      </CardContent>
    </Card>
  )
}
