'use client'

import { useRouter } from 'next/navigation'
import { MonthNavigator } from '@/components/finance/month-navigator'
import { Card, CardContent } from '@/components/ui/card'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { formatBRL } from '@floow/core-finance/src/balance'
import { parcelaDoMes, type ParceladoNoCartao } from '@floow/core-finance'

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface Props {
  parcelados: ParceladoNoCartao[]
  /** Mês no formato "YYYY-MM-01", o mesmo `?month=` das telas de orçamento. */
  selectedMonth: string
}

/** Só leitura: a lista sai das faturas do cartão, não do cadastro de dívidas. */
export function ParceladosNoCartao({ parcelados, selectedMonth }: Props) {
  const router = useRouter()
  if (parcelados.length === 0) return null

  const mes = selectedMonth.slice(0, 7)
  const linhas = parcelados.flatMap((p) => {
    const parcela = parcelaDoMes(p, mes)
    return parcela ? [{ p, parcela }] : []
  })
  const totalDoMes = linhas.reduce((s, l) => s + l.parcela.amountCents, 0)
  const saldoDevedor = parcelados.reduce((s, p) => s + p.remainingCents, 0)
  const variosCartoes = new Set(parcelados.map((p) => p.accountId)).size > 1

  function navigateMonth(delta: number) {
    router.push(`/debts?month=${shiftMonth(selectedMonth, delta)}`, { scroll: false })
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Parcelados no cartão</h2>
        <p className="text-xs text-gray-500">
          Entram sozinhos a partir das faturas e saem quando a última parcela vence.
        </p>
      </div>

      <MonthNavigator month={selectedMonth} onShift={navigateMonth} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Comprometido em {formatMonth(selectedMonth)}</p>
            <p className="text-2xl font-semibold text-gray-900">{formatBRL(totalDoMes)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Saldo devedor no cartão</p>
            <p className="text-sm font-medium text-gray-900">
              {formatBRL(saldoDevedor)} · {parcelados.length} {parcelados.length === 1 ? 'compra' : 'compras'}
            </p>
          </div>
        </CardContent>
      </Card>

      {linhas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-500">Nenhuma parcela de cartão em {formatMonth(selectedMonth)}.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-3">
            {linhas.map(({ p, parcela }) => (
              <Card key={p.chave}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.description}</p>
                      {variosCartoes && <p className="text-[10px] text-gray-500">{p.accountName}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{formatBRL(parcela.amountCents)}</p>
                      <p className="text-[10px] text-gray-500">no mês</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Parcela</p>
                      <p className="font-medium">{parcela.installmentNumber}/{p.installmentTotal}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo devedor</p>
                      <p className="font-medium">{formatBRL(p.remainingCents)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Vencimento</p>
                      <p className="font-medium">{formatDateBR(parcela.date)}</p>
                    </div>
                  </div>
                  <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table layout */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Compra</th>
                      {variosCartoes && <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cartão</th>}
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Parcela</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Valor no Mês</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo Devedor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Vencimento</th>
                      <th className="min-w-[160px] px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Progresso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhas.map(({ p, parcela }) => (
                      <tr key={p.chave} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{p.description}</td>
                        {variosCartoes && <td className="px-4 py-2.5 text-sm text-gray-600">{p.accountName}</td>}
                        <td className="px-4 py-2.5 text-right text-sm text-gray-600">{parcela.installmentNumber}/{p.installmentTotal}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900">{formatBRL(parcela.amountCents)}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-gray-600">{formatBRL(p.remainingCents)}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateBR(parcela.date)}</td>
                        <td className="px-4 py-2.5">
                          <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={variosCartoes ? 3 : 2} className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total do mês</td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{formatBRL(totalDoMes)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
