import { memo } from 'react'
import { CreditCard } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { formatarDia } from '@/lib/formatar-dia'
import type { FaturaNoExtrato } from '@/lib/finance/intercalar-faturas'
import { amountColorClass } from './transaction-list-types'

/**
 * Linha do total da fatura no fechamento. Só leitura: não é lançamento, não
 * tem ação nem saldo, e não entra no fluxo de caixa.
 */
function Descricao({ fatura }: { fatura: FaturaNoExtrato }) {
  return (
    <>
      <span className="font-medium">Fatura {fatura.accountName}</span>
      <span className="text-gray-500">
        {' · fecha em '}{formatarDia(fatura.fechamento)}
        {fatura.vencimento && <>{' · vence em '}{formatarDia(fatura.vencimento)}</>}
      </span>
    </>
  )
}

export function chaveDaFatura(f: FaturaNoExtrato): string {
  return `fatura-${f.accountId}-${f.fechamento}`
}

const TITULO = 'Total da fatura no fechamento. Só leitura: não entra no saldo nem no fluxo de caixa.'

export const FaturaDesktopRow = memo(function FaturaDesktopRow({ fatura }: { fatura: FaturaNoExtrato }) {
  return (
    <tr className="bg-slate-50" title={TITULO}>
      <td className="w-10 px-4 py-3">
        <CreditCard className="h-4 w-4 text-slate-400" aria-hidden />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatarDia(fatura.fechamento)}</td>
      <td className="px-4 py-3 text-sm text-gray-800" colSpan={3}>
        <Descricao fatura={fatura} />
      </td>
      <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${amountColorClass(fatura.totalCents)}`}>
        {formatBRL(fatura.totalCents)}
      </td>
      <td className="hidden lg:table-cell" />
      <td />
    </tr>
  )
})

export const FaturaMobileCard = memo(function FaturaMobileCard({ fatura }: { fatura: FaturaNoExtrato }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" title={TITULO}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-800"><Descricao fatura={fatura} /></p>
        <p className={`whitespace-nowrap text-sm font-semibold ${amountColorClass(fatura.totalCents)}`}>
          {formatBRL(fatura.totalCents)}
        </p>
      </div>
    </div>
  )
})
