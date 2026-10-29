'use client'

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { SEM_CATEGORIA } from '@floow/core-finance/src/gastos-do-cartao'
import type { CartaoComGastos, LancamentoDoGasto } from '@/lib/finance/queries-gastos-cartao'
import { GastosDosCartoesGrafico, nomeDoMes } from './gastos-dos-cartoes-grafico'
import { CashFlowLancamentoDialog } from './cash-flow-lancamento-dialog'

interface Mes {
  mes: string
  totalCents: number
  aberta: boolean
  porCategoria: Record<string, number>
  lancamentos: LancamentoDoGasto[]
}

const TODOS = 'todos'
const TODAS = 'todas'

/**
 * Soma as faturas dos cartões escolhidos pelo mês do fechamento: cartões com
 * dia de fechamento diferente caem no mesmo mês, como o usuário pensa a conta.
 */
function somarPorMes(cartoes: CartaoComGastos[], hoje: string): Mes[] {
  const meses = new Map<string, Mes>()
  for (const c of cartoes) {
    for (const f of c.faturas) {
      const chave = f.fechamento.slice(0, 7)
      const m = meses.get(chave) ?? { mes: chave, totalCents: 0, aberta: false, porCategoria: {}, lancamentos: [] as LancamentoDoGasto[] }
      m.totalCents += f.totalCents
      m.aberta ||= f.fechamento >= hoje
      for (const [cat, v] of Object.entries(f.porCategoria)) m.porCategoria[cat] = (m.porCategoria[cat] ?? 0) + v
      m.lancamentos.push(...f.lancamentos)
      meses.set(chave, m)
    }
  }
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes))
}

function Variacao({ atual, anterior }: { atual: number; anterior: number | undefined }) {
  if (anterior == null) return <span className="text-muted-foreground">—</span>
  const diff = atual - anterior
  if (diff === 0) return <span className="text-muted-foreground">igual</span>
  const pct = anterior > 0 ? Math.round((diff / anterior) * 100) : null
  // Gastar mais é o lado ruim: vermelho; gastar menos, verde.
  return (
    <span className={cn('tabular-nums', diff > 0 ? 'text-red-600' : 'text-green-700')}>
      {diff > 0 ? '+' : '−'}{formatBRL(Math.abs(diff))}
      {pct != null && <span className="ml-1 text-xs">({diff > 0 ? '+' : ''}{pct}%)</span>}
    </span>
  )
}

export function GastosDosCartoes({ cartoes, hoje }: { cartoes: CartaoComGastos[]; hoje: string }) {
  const [cartao, setCartao] = useState(TODOS)
  const meses = useMemo(
    () => somarPorMes(cartao === TODOS ? cartoes : cartoes.filter((c) => c.id === cartao), hoje),
    [cartoes, cartao, hoje],
  )
  const fechadas = meses.filter((m) => !m.aberta)
  // Categorias do período, a de maior gasto primeiro, para o seletor.
  const opcoesDeCategoria = useMemo(() => {
    const totais = new Map<string, number>()
    for (const m of meses) for (const [cat, v] of Object.entries(m.porCategoria)) totais.set(cat, (totais.get(cat) ?? 0) + v)
    return [...totais.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cat]) => cat)
  }, [meses])
  const [categoriaDaSerie, setCategoriaDaSerie] = useState(TODAS)
  const [mostrarValores, setMostrarValores] = useState(false)
  // Gráfico e tabela mês a mês seguem a categoria escolhida; o painel por
  // categoria continua mostrando a fatura inteira.
  const serie = categoriaDaSerie === TODAS
    ? meses
    : meses.map((m) => ({ ...m, totalCents: m.porCategoria[categoriaDaSerie] ?? 0 }))
  const serieFechada = serie.filter((m) => !m.aberta)
  const mediaCents = serieFechada.length ? Math.round(serieFechada.reduce((s, m) => s + m.totalCents, 0) / serieFechada.length) : 0
  const [escolhido, setEscolhidoBruto] = useState<string | null>(null)
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)
  // Trocar de fatura fecha a categoria aberta: a lista era da outra fatura.
  const setEscolhido = (mes: string | null) => { setEscolhidoBruto(mes); setCategoriaAberta(null) }
  const selecionado = meses.find((m) => m.mes === escolhido) ?? fechadas.at(-1) ?? meses.at(-1)
  const i = selecionado ? meses.indexOf(selecionado) : -1
  const anterior = i > 0 ? meses[i - 1] : undefined

  // Todas as categorias da fatura, a maior primeiro; a que sumiu no mês ainda
  // aparece, com zero, para a queda ficar visível.
  const categorias = useMemo(() => {
    if (!selecionado) return []
    const cats = new Set([...Object.keys(selecionado.porCategoria), ...Object.keys(anterior?.porCategoria ?? {})])
    return [...cats]
      .map((cat) => ({ cat, atual: selecionado.porCategoria[cat] ?? 0, antes: anterior ? (anterior.porCategoria[cat] ?? 0) : undefined }))
      .sort((a, b) => b.atual - a.atual || (b.antes ?? 0) - (a.antes ?? 0))
  }, [selecionado, anterior])

  const lancamentosDaCategoria = useMemo(
    () => (selecionado?.lancamentos ?? [])
      .filter((t) => (t.categoryName ?? SEM_CATEGORIA) === categoriaAberta)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [selecionado, categoriaAberta],
  )

  if (cartoes.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Nenhum cartão de crédito com dia de fechamento cadastrado. Cadastre o dia de fechamento em Contas para ver os gastos por fatura.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        {cartoes.length > 1 && (
          <Select value={cartao} onValueChange={(v) => { setCartao(v); setEscolhido(null); setCategoriaDaSerie(TODAS) }}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Cartão">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os cartões</SelectItem>
              {cartoes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.titular ? `${c.name} · ${c.titular}` : c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {opcoesDeCategoria.length > 1 && (
          <Select value={categoriaDaSerie} onValueChange={setCategoriaDaSerie}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as categorias</SelectItem>
              {opcoesDeCategoria.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {meses.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma compra no cartão nos últimos 12 meses.</Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Gasto por fatura{categoriaDaSerie !== TODAS && <span className="font-normal text-muted-foreground"> · {categoriaDaSerie}</span>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Média das faturas fechadas: <span className="font-medium tabular-nums text-foreground">{formatBRL(mediaCents)}</span>.
                {' '}Clique num mês para ver as categorias dele.
              </p>
              <label className="flex w-fit cursor-pointer items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={mostrarValores}
                  onChange={(e) => setMostrarValores(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Mostrar valores
              </label>
            </CardHeader>
            <CardContent>
              <GastosDosCartoesGrafico meses={serie} mediaCents={mediaCents} selecionado={selecionado?.mes ?? null} onSelecionar={setEscolhido} mostrarValores={mostrarValores} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mês a mês{categoriaDaSerie !== TODAS && <span className="font-normal text-muted-foreground"> · {categoriaDaSerie}</span>}</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2 font-medium">Fatura</th>
                      <th className="px-2 py-2 text-right font-medium">Gasto</th>
                      <th className="px-6 py-2 text-right font-medium">vs. mês anterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...serie].reverse().map((m) => {
                      const ant = serie[serie.indexOf(m) - 1]
                      const ativo = m.mes === selecionado?.mes
                      return (
                        <tr
                          key={m.mes}
                          onClick={() => setEscolhido(m.mes)}
                          className={cn('cursor-pointer border-b last:border-0 hover:bg-muted/50', ativo && 'bg-muted')}
                        >
                          <td className="px-6 py-2.5">
                            <button type="button" className="capitalize focus-visible:underline focus-visible:outline-none" onClick={() => setEscolhido(m.mes)}>
                              {nomeDoMes(m.mes)}
                            </button>
                            {m.aberta && <span className="ml-2 text-xs text-muted-foreground">aberta</span>}
                          </td>
                          <td className="px-2 py-2.5 text-right font-medium tabular-nums">{formatBRL(m.totalCents)}</td>
                          <td className="px-6 py-2.5 text-right"><Variacao atual={m.totalCents} anterior={ant?.totalCents} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Por categoria em <span className="capitalize">{selecionado && nomeDoMes(selecionado.mes)}</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {anterior
                    ? <>Variação contra <span className="capitalize">{nomeDoMes(anterior.mes)}</span>.</>
                    : 'Sem mês anterior para comparar.'}
                  {selecionado?.aberta && ' A fatura ainda está aberta.'}
                </p>
              </CardHeader>
              <CardContent>
                {categorias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma compra nesta fatura.</p>
                ) : (
                  <ul className="divide-y">
                    {categorias.map((c) => {
                      const parte = selecionado && selecionado.totalCents > 0 ? Math.max(0, c.atual) / selecionado.totalCents : 0
                      const aberta = categoriaAberta === c.cat
                      return (
                        <li key={c.cat} className="text-sm">
                          <button
                            type="button"
                            aria-expanded={aberta}
                            onClick={() => setCategoriaAberta(aberta ? null : c.cat)}
                            className="-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberta && 'rotate-90')} />
                                <span className="truncate">{c.cat}</span>
                              </span>
                              <div className="flex shrink-0 items-baseline gap-3">
                                <span className="font-medium tabular-nums">{formatBRL(c.atual)}</span>
                                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(parte * 100)}%</span>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-4">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-[#eb6834] dark:bg-[#d95926]" style={{ width: `${parte * 100}%` }} />
                              </div>
                              <span className="text-xs"><Variacao atual={c.atual} anterior={c.antes} /></span>
                            </div>
                          </button>
                          {aberta && (
                            lancamentosDaCategoria.length === 0 ? (
                              <p className="pb-2.5 pl-5 text-xs text-muted-foreground">Nenhum lançamento nesta fatura.</p>
                            ) : (
                              <ul className="mb-2 divide-y divide-border/60 rounded-md bg-muted/40 px-2">
                                {lancamentosDaCategoria.map((t) => (
                                  <li key={t.id}>
                                    <button
                                      type="button"
                                      onClick={() => setDetalhe(t.id)}
                                      className="flex w-full items-baseline gap-3 py-1.5 text-left hover:underline"
                                    >
                                      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>
                                      <span className="min-w-0 flex-1 truncate">{t.description || 'Sem descrição'}</span>
                                      {t.subcategoria && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{t.subcategoria}</span>}
                                      <span className={cn('shrink-0 font-medium tabular-nums', t.amountCents > 0 && 'text-green-700')}>
                                        {t.amountCents > 0 ? '−' : ''}{formatBRL(Math.abs(t.amountCents))}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <CashFlowLancamentoDialog id={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  )
}
