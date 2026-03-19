import { formatBRL } from '@floow/core-finance'
import { Card } from '@/components/ui/card'

interface QuickStatsRowProps {
  incomeCents: number
  expenseCents: number
  netCents: number
}

export function QuickStatsRow({ incomeCents, expenseCents, netCents }: QuickStatsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Receitas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(incomeCents)}</p>
      </Card>
      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Despesas do Mês
        </p>
        <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(Math.abs(expenseCents))}</p>
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
