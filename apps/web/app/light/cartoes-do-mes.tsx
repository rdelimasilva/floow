'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CashFlowLancamentoDialog } from '@/components/finance/cash-flow-lancamento-dialog'
import { SeletorDeCategoria } from '@/components/finance/seletor-de-categoria'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { bulkCategorizeTransactions } from '@/lib/finance/transaction-actions'
import { toCategoryOptions, type CategoryLike } from '@/lib/finance/category-options'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
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
  /** Categorias de despesa, para corrigir a do lançamento. */
  categorias: CategoryLike[]
}

export function CartoesDoMes({ meses, metas, categorias }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = useTransition()
  const opcoes = useMemo(() => toCategoryOptions(categorias), [categorias])
  const [mes, setMes] = useState(meses.at(-1)?.mes ?? '')
  const [aberta, setAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  function recategorizar(id: string, categoryId: string) {
    startTransition(async () => {
      try {
        await bulkCategorizeTransactions([id], categoryId)
        router.refresh()
      } catch (e) {
        toast(mensagemDeErro(e, 'Não foi possível trocar a categoria'), 'error')
      }
    })
  }

  const atual = meses.find((m) => m.mes === mes)
  const metasDoMes = metas[mes] ?? {}
  const linhas = useMemo(
    () => Object.entries(atual?.porCategoria ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
    [atual],
  )

  if (meses.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center text-sm text-gray-500">
          <p>Conecte seu cartão de crédito para ver o gasto de cada categoria contra a meta.</p>
          <Button asChild><Link href="/accounts/connect">Conectar cartão</Link></Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4 sm:p-6">
        <div>
          <CardTitle>Gasto nos cartões</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatBRL(atual?.totalCents ?? 0)}</p>
        </div>
        <Select value={mes} onValueChange={(v) => { setMes(v); setAberta(null) }}>
          <SelectTrigger className="h-11 w-40 sm:h-9 sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[...meses].reverse().map((m) => (
              <SelectItem key={m.mes} value={m.mes}>{nomeDoMes(m.mes)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <ul className="divide-y">
          {linhas.map(([cat, gasto]) => {
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
                  className="min-h-11 w-full py-3 text-left"
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
                      <li key={t.id} className="py-2">
                        <button
                          type="button"
                          onClick={() => setDetalhe(t.id)}
                          className="flex min-h-11 w-full items-center gap-3 text-left text-sm hover:underline sm:min-h-0"
                        >
                          <span className="w-12 shrink-0 text-xs tabular-nums text-gray-500">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>
                          <span className="min-w-0 flex-1 truncate">{t.description || 'Sem descrição'}</span>
                          <span className={cn('shrink-0 tabular-nums', t.amountCents > 0 && 'text-green-700')}>
                            {t.amountCents > 0 ? '−' : ''}{formatBRL(Math.abs(t.amountCents))}
                          </span>
                        </button>
                        {/* Sem value: o lançamento só traz o nome, e o nome vira o placeholder. */}
                        <SeletorDeCategoria
                          opcoes={opcoes}
                          value=""
                          onChange={(id) => id && recategorizar(t.id, id)}
                          placeholder={t.subcategoria ?? t.categoryName ?? SEM_CATEGORIA}
                          className="ml-[3.75rem] mt-1 h-11 w-[calc(100%-3.75rem)] sm:h-8 sm:w-64"
                        />
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
