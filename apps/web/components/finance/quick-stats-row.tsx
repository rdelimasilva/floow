import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { Card } from '@/components/ui/card'
import { limitesDoMes, linkDoTotal } from '@/lib/finance/link-do-total'

interface QuickStatsRowProps {
  incomeCents: number
  expenseCents: number
  netCents: number
  /** `YYYY-MM` do mês dos cards. Com ele, receitas e despesas abrem os lançamentos que as somam. */
  mes?: string
}

export function QuickStatsRow({ incomeCents, expenseCents, netCents, mes }: QuickStatsRowProps) {
  // Mesmos critérios de `getMonthlyCashFlowSummary`: realizado, confirmado, fora do ignorado, que afeta o caixa.
  const abrir = (tipo: 'income' | 'expense', rotulo: string, valor: string) => {
    if (!mes) return valor
    const [y, m] = mes.split('-').map(Number)
    const extenso = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return (
      <Link
        href={linkDoTotal({ ...limitesDoMes(mes), tipos: [tipo], caixa: true, situacao: 'realizado' })}
        aria-label={`Ver lançamentos de ${rotulo} em ${extenso}`}
        className="underline-offset-2 hover:underline"
      >
        {valor}
      </Link>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Receitas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-green-700">{abrir('income', 'receitas', formatBRL(incomeCents))}</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Despesas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-red-600">{abrir('expense', 'despesas', formatBRL(Math.abs(expenseCents)))}</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Saldo do Mês
        </p>
        <p className={`mt-2 text-xl font-bold ${netCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatBRL(netCents)}
        </p>
      </Card>
    </div>
  )
}
