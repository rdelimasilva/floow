import { formatBRL } from '@floow/core-finance/src/balance'
import { totalMensalRecorrentes } from '@/lib/finance/total-mensal-recorrentes'

interface RecurringMonthlyTotalCardProps {
  templates: Parameters<typeof totalMensalRecorrentes>[0]
}

export function RecurringMonthlyTotalCard({ templates }: RecurringMonthlyTotalCardProps) {
  const total = totalMensalRecorrentes(templates)
  if (total.quantidade === 0) return null

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Total por mês</h2>
        <span className="text-xs text-muted-foreground">
          {total.quantidade} {total.quantidade === 1 ? 'recorrência ativa' : 'recorrências ativas'}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Receitas</dt>
          <dd className="text-lg font-semibold text-green-700">{formatBRL(total.receitasCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Despesas</dt>
          <dd className="text-lg font-semibold text-red-600">{formatBRL(total.despesasCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Saldo</dt>
          <dd className={total.saldoCents >= 0 ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-red-600'}>
            {formatBRL(total.saldoCents)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Frequências diferentes de mensal entram pelo equivalente mensal (ex.: anual ÷ 12, semanal × 52 ÷ 12).
      </p>
    </section>
  )
}
