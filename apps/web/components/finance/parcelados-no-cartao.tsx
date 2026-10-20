'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { formatBRL } from '@floow/core-finance/src/balance'
import { comprometimentoPorMes, parcelaDoMes, type ParceladoNoCartao } from '@floow/core-finance'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function rotuloDoMes(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`
}

/** Linha da lista: no filtro de um mês, a parcela que cai nele; em "Todos", a próxima. */
interface Linha {
  p: ParceladoNoCartao
  numero: number
  valorCents: number
  vencimento: string
}

/** Só leitura: a lista sai das faturas do cartão, não do cadastro de dívidas. */
export function ParceladosNoCartao({ parcelados }: { parcelados: ParceladoNoCartao[] }) {
  const [mes, setMes] = useState<string | null>(null)
  const meses = useMemo(() => comprometimentoPorMes(parcelados), [parcelados])

  const linhas: Linha[] = useMemo(() => {
    if (!mes) {
      return parcelados.map((p) => ({
        p,
        numero: p.parcelasFuturas[0].installmentNumber,
        valorCents: p.installmentCents,
        vencimento: p.nextDueDate,
      }))
    }
    return parcelados.flatMap((p) => {
      const f = parcelaDoMes(p, mes)
      return f ? [{ p, numero: f.installmentNumber, valorCents: f.amountCents, vencimento: f.date }] : []
    })
  }, [parcelados, mes])

  if (parcelados.length === 0) return null
  const variosCartoes = new Set(parcelados.map((p) => p.accountId)).size > 1
  const total = mes
    ? linhas.reduce((s, l) => s + l.valorCents, 0)
    : parcelados.reduce((s, p) => s + p.remainingCents, 0)
  const rotuloDoTotal = mes ? `Total de ${rotuloDoMes(mes)}` : 'Total a vencer'

  const chip = (ativo: boolean) =>
    `shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors ${
      ativo ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parcelados no cartão</CardTitle>
        <p className="text-xs text-gray-500">
          Entram sozinhos a partir das faturas e saem quando a última parcela vence.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-3" role="group" aria-label="Comprometimento por mês">
          <button type="button" onClick={() => setMes(null)} className={chip(mes === null)} aria-pressed={mes === null}>
            <span className="block text-xs font-medium">Todos</span>
            <span className="block text-[11px] opacity-70">{parcelados.length} compras</span>
          </button>
          {meses.map((m) => (
            <button
              key={m.mes}
              type="button"
              onClick={() => setMes(m.mes)}
              className={chip(mes === m.mes)}
              aria-pressed={mes === m.mes}
            >
              <span className="block text-xs font-medium">{rotuloDoMes(m.mes)}</span>
              <span className="block text-[11px] opacity-70 whitespace-nowrap">{formatBRL(m.totalCents)}</span>
            </button>
          ))}
        </div>

        {/* Mobile: card layout */}
        <div className="md:hidden divide-y divide-gray-100 border-t border-gray-100">
          {linhas.map(({ p, numero, valorCents, vencimento }) => (
            <div key={p.chave} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.description}</p>
                  {variosCartoes && <p className="text-[10px] text-gray-400">{p.accountName}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatBRL(mes ? valorCents : p.remainingCents)}</p>
                  <p className="text-[10px] text-gray-400">{mes ? 'no mês' : 'saldo devedor'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-gray-400">Parcela</p>
                  <p className="font-medium">{numero}/{p.installmentTotal}</p>
                </div>
                <div>
                  <p className="text-gray-400">{mes ? 'Saldo devedor' : 'Valor'}</p>
                  <p className="font-medium">{formatBRL(mes ? p.remainingCents : valorCents)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Vencimento</p>
                  <p className="font-medium">{formatDateBR(vencimento)}</p>
                </div>
              </div>
              <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
            </div>
          ))}
          <div className="bg-gray-50 p-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">{rotuloDoTotal}</p>
            <p className="text-sm font-bold text-gray-900">{formatBRL(total)}</p>
          </div>
        </div>

        {/* Desktop: table layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Compra</th>
                {variosCartoes && <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cartão</th>}
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Parcela</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">{mes ? 'Valor no Mês' : 'Valor'}</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo Devedor</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Vencimento</th>
                <th className="min-w-[160px] px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Progresso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhas.map(({ p, numero, valorCents, vencimento }) => (
                <tr key={p.chave} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{p.description}</td>
                  {variosCartoes && <td className="px-4 py-2.5 text-sm text-gray-600">{p.accountName}</td>}
                  <td className="px-4 py-2.5 text-right text-sm text-gray-600">{numero}/{p.installmentTotal}</td>
                  <td className={`px-4 py-2.5 text-right text-sm ${mes ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{formatBRL(valorCents)}</td>
                  <td className={`px-4 py-2.5 text-right text-sm ${mes ? 'text-gray-600' : 'font-medium text-gray-900'}`}>{formatBRL(p.remainingCents)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateBR(vencimento)}</td>
                  <td className="px-4 py-2.5">
                    <BudgetProgressBar label="" currentCents={p.paidCents} limitCents={p.totalCents} invertColors />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={variosCartoes ? 3 : 2} className="px-4 py-2.5 text-sm font-semibold text-gray-900">{rotuloDoTotal}</td>
                <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{mes ? formatBRL(total) : ''}</td>
                <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{mes ? '' : formatBRL(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
