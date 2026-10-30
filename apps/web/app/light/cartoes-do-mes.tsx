'use client'

import { useMemo, useState } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CashFlowLancamentoDialog } from '@/components/finance/cash-flow-lancamento-dialog'
import { nomeDoMes } from '@/lib/finance/nome-do-mes'
import { cn } from '@/lib/utils'
import { SEM_CATEGORIA } from '@floow/core-finance/src/gastos-do-cartao'
import type { LancamentoDoGasto } from '@/lib/finance/queries-gastos-cartao'

export interface MesDosCartoes {
  mes: string
  totalCents: number
  porCategoria: Record<string, number>
  lancamentos: LancamentoDoGasto[]
}

interface Props {
  meses: MesDosCartoes[]
  /** Meta de cada mês ('YYYY-MM') por categoria de cima. */
  metas: Record<string, Record<string, number>>
}

export function CartoesDoMes({ meses, metas }: Props) {
  const [mes, setMes] = useState(meses.at(-1)?.mes ?? '')
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const atual = meses.find((m) => m.mes === mes)
  const metasDoMes = metas[mes] ?? {}
  const categorias = useMemo(
    () => Object.entries(atual?.porCategoria ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    [atual],
  )

  if (meses.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Nenhum cartão com dia de fechamento cadastrado.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Cartões</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatBRL(atual?.totalCents ?? 0)}</p>
        </div>
        <Select value={mes} onValueChange={(v) => { setMes(v); setAberta(null) }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...meses].reverse().map((m) => (
              <SelectItem key={m.mes} value={m.mes}>{nomeDoMes(m.mes)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {categorias.map(([cat, gasto]) => {
            const meta = metasDoMes[cat]
            const pct = meta ? Math.round((gasto / meta) * 100) : null
            const lancamentos = cat === aberta
              ? atual!.lancamentos
                .filter((l) => (l.categoryName ?? SEM_CATEGORIA) === cat)
                .sort((a, b) => b.date.localeCompare(a.date))
              : []
            return (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => setAberta(cat === aberta ? null : cat)}
                  className="w-full py-3 text-left"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium text-gray-800">{cat}</span>
                    <span className="tabular-nums text-gray-900">{formatBRL(gasto)}</span>
                  </div>
                  {pct != null && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-gray-800')}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-gray-500">{pct}% de {formatBRL(meta!)}</span>
                    </div>
                  )}
                </button>
                {cat === aberta && (
                  <ul className="mb-3 divide-y divide-gray-100 rounded-md bg-gray-50 px-3">
                    {lancamentos.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setDetalhe(t.id)}
                          className="flex w-full items-baseline gap-3 py-1.5 text-left text-sm hover:underline"
                        >
                          <span className="w-12 shrink-0 text-xs tabular-nums text-gray-500">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>
                          <span className="min-w-0 flex-1 truncate">{t.description || 'Sem descrição'}</span>
                          <span className={cn('shrink-0 tabular-nums', t.amountCents > 0 && 'text-green-700')}>
                            {t.amountCents > 0 ? '−' : ''}{formatBRL(Math.abs(t.amountCents))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
      <CashFlowLancamentoDialog id={detalhe} onClose={() => setDetalhe(null)} />
    </Card>
  )
}
