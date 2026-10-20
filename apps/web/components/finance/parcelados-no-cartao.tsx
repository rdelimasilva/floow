import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { ParceladoNoCartao } from '@floow/core-finance'

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

/** Só leitura: a lista sai das faturas do cartão, não do cadastro de dívidas. */
export function ParceladosNoCartao({ parcelados }: { parcelados: ParceladoNoCartao[] }) {
  if (parcelados.length === 0) return null
  const totalRemaining = parcelados.reduce((s, p) => s + p.remainingCents, 0)
  const variosCartoes = new Set(parcelados.map((p) => p.accountId)).size > 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parcelados no cartão</CardTitle>
        <p className="text-xs text-gray-500">
          Entram sozinhos a partir das faturas e saem quando a última parcela vence.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile: card layout */}
        <div className="md:hidden divide-y divide-gray-100">
          {parcelados.map((p) => (
            <div key={p.chave} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.description}</p>
                  {variosCartoes && <p className="text-[10px] text-gray-400">{p.accountName}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatBRL(p.remainingCents)}</p>
                  <p className="text-[10px] text-gray-400">saldo devedor</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-gray-400">Parcelas</p>
                  <p className="font-medium">{p.paidCount}/{p.installmentTotal}</p>
                </div>
                <div>
                  <p className="text-gray-400">Parcela</p>
                  <p className="font-medium">{formatBRL(p.installmentCents)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Próx. Venc.</p>
                  <p className="font-medium">{formatDateBR(p.nextDueDate)}</p>
                </div>
              </div>
              <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
            </div>
          ))}
          <div className="bg-gray-50 p-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Total a vencer</p>
            <p className="text-sm font-bold text-gray-900">{formatBRL(totalRemaining)}</p>
          </div>
        </div>

        {/* Desktop: table layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Compra</th>
                {variosCartoes && <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cartão</th>}
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Parcelas</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Parcela</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo Devedor</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Prox. Vencimento</th>
                <th className="min-w-[160px] px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Progresso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parcelados.map((p) => (
                <tr key={p.chave} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{p.description}</td>
                  {variosCartoes && <td className="px-4 py-2.5 text-sm text-gray-600">{p.accountName}</td>}
                  <td className="px-4 py-2.5 text-right text-sm text-gray-600">{p.paidCount}/{p.installmentTotal}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-600">{formatBRL(p.installmentCents)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900">{formatBRL(p.remainingCents)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateBR(p.nextDueDate)}</td>
                  <td className="px-4 py-2.5">
                    <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={variosCartoes ? 4 : 3} className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total a vencer</td>
                <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{formatBRL(totalRemaining)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
