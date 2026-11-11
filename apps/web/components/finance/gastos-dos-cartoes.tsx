'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GavetaDeFiltros } from './filtros/gaveta-de-filtros'
import { ListaComCaixas } from './filtros/lista-com-caixas'
import { SeletorDePeriodo } from './filtros/seletor-de-periodo'
import { useFiltrosNaUrl } from './filtros/use-filtros-na-url'
import { useGravarRecorteNaChegada } from './filtros/use-gravar-recorte-na-chegada'
import { cn } from '@/lib/utils'
import { SEM_CATEGORIA } from '@floow/core-finance/src/gastos-do-cartao'
import type { CartaoComGastos, LancamentoDoGasto } from '@/lib/finance/queries-gastos-cartao'
import dynamic from 'next/dynamic'
import { nomeDoMes } from '@/lib/finance/nome-do-mes'
import { idsComFilhas, linkDaFatura } from '@/lib/finance/link-do-total'
import { CashFlowLancamentoDialog } from './cash-flow-lancamento-dialog'

// recharts só chega depois da página, como nas outras telas com gráfico.
const GastosDosCartoesGrafico = dynamic(() => import('./gastos-dos-cartoes-grafico').then(m => ({ default: m.GastosDosCartoesGrafico })), {
  loading: () => <div className="min-h-[280px] animate-pulse rounded-xl bg-gray-100" />,
  ssr: false,
})

interface Mes {
  mes: string
  /** Fechamento da última fatura somada; com um cartão só, é o da fatura. */
  fechamento: string
  totalCents: number
  aberta: boolean
  porCategoria: Record<string, number>
  lancamentos: LancamentoDoGasto[]
}

/**
 * Soma as faturas dos cartões escolhidos pelo mês do fechamento: cartões com
 * dia de fechamento diferente caem no mesmo mês, como o usuário pensa a conta.
 */
function somarPorMes(cartoes: CartaoComGastos[], hoje: string): Mes[] {
  const meses = new Map<string, Mes>()
  for (const c of cartoes) {
    for (const f of c.faturas) {
      const chave = f.fechamento.slice(0, 7)
      const m = meses.get(chave) ?? { mes: chave, fechamento: f.fechamento, totalCents: 0, aberta: false, porCategoria: {}, lancamentos: [] as LancamentoDoGasto[] }
      m.fechamento = f.fechamento
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

interface Props {
  cartoes: CartaoComGastos[]
  metas: Record<string, Record<string, number>>
  hoje: string
  startDate: string
  endDate: string
  /** Cartões marcados no recorte; vazio é todos. */
  accountIds: string[]
  /** Categorias de cima marcadas; vazio é todas. Não vai para o recorte. */
  categoryIds: string[]
  categoriasDeCima: { id: string; name: string }[]
  /** Todas as categorias, para o link da categoria levar as filhas. */
  arvoreDeCategorias?: { id: string; parentId: string | null }[]
}

export function GastosDosCartoes({ cartoes, metas, hoje, startDate, endDate, accountIds, categoryIds, categoriasDeCima, arvoreDeCategorias = [] }: Props) {
  const { trocar } = useFiltrosNaUrl('/cash-flow/cartoes')
  // Contas do recorte que não são cartão ficam no cookie: a tela só lista cartões.
  useGravarRecorteNaChegada(cartoes)
  const visiveis = useMemo(() => (accountIds.length ? cartoes.filter((c) => accountIds.includes(c.id)) : cartoes), [cartoes, accountIds])
  const meses = useMemo(() => somarPorMes(visiveis, hoje), [visiveis, hoje])
  // A barra soma as faturas de todos os cartões do mês. Transações filtra a
  // fatura de um cartão só, então o link só existe com um cartão na tela.
  const cartaoDoLink = visiveis.length === 1 ? visiveis[0].id : null
  const fechadas = meses.filter((m) => !m.aberta)
  // Categorias do período, a de maior gasto primeiro, para o seletor.
  const opcoesDeCategoria = useMemo(() => {
    const totais = new Map<string, number>()
    for (const m of meses) for (const [cat, v] of Object.entries(m.porCategoria)) totais.set(cat, (totais.get(cat) ?? 0) + v)
    return categoriasDeCima
      .filter((c) => (totais.get(c.name) ?? 0) > 0)
      .sort((a, b) => totais.get(b.name)! - totais.get(a.name)!)
  }, [meses, categoriasDeCima])
  // Id da URL que não existe mais (ou sem gasto no período) não filtra nada.
  const nomesEscolhidos = opcoesDeCategoria.filter((c) => categoryIds.includes(c.id)).map((c) => c.name)
  const filtrando = nomesEscolhidos.length > 0
  const somar = (porCategoria: Record<string, number> | undefined) => nomesEscolhidos.reduce((s, n) => s + (porCategoria?.[n] ?? 0), 0)
  const rotuloDaSerie = nomesEscolhidos.join(', ')
  const [mostrarValores, setMostrarValores] = useState(false)
  // Gráfico e tabela mês a mês seguem a categoria escolhida; o painel por
  // categoria continua mostrando a fatura inteira.
  const serie = !filtrando
    ? meses
    : meses.map((m) => {
      const metasDoMes = nomesEscolhidos.filter((n) => metas[m.mes]?.[n] != null)
      return { ...m, totalCents: somar(m.porCategoria), metaCents: metasDoMes.length ? somar(metas[m.mes]) : undefined }
    })
  const temMeta = serie.some((m) => 'metaCents' in m && m.metaCents != null)
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
  const linkDoSelecionado = (categoryIds?: string[]) => (cartaoDoLink && selecionado
    ? linkDaFatura({ cartaoId: cartaoDoLink, fechamento: selecionado.fechamento, datas: selecionado.lancamentos.map((t) => t.date), categoryIds })
    : null)
  const linkDaFaturaSelecionada = linkDoSelecionado()

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

  // Os mesmos controles servem à linha do desktop e à gaveta do celular.
  const filtros = (naGaveta: boolean) => (
    <>
      {cartoes.length > 1 && (
        <ListaComCaixas
          naGaveta={naGaveta}
          rotulo="Cartão"
          rotuloTodos="Todos os cartões"
          opcoes={cartoes.map((c) => ({ valor: c.id, rotulo: c.titular ? `${c.name} · ${c.titular}` : c.name }))}
          marcados={accountIds}
          aoMudar={(ids) => { setEscolhido(null); trocar({ accountId: ids.join(',') }) }}
        />
      )}
      {opcoesDeCategoria.length > 1 && (
        <ListaComCaixas
          naGaveta={naGaveta}
          rotulo="Categoria"
          rotuloTodos="Todas as categorias"
          opcoes={opcoesDeCategoria.map((c) => ({ valor: c.id, rotulo: c.name }))}
          marcados={nomesEscolhidos.length ? categoryIds.filter((id) => opcoesDeCategoria.some((c) => c.id === id)) : []}
          aoMudar={(ids) => { setEscolhido(null); trocar({ categoryIds: ids.join(',') }) }}
        />
      )}
    </>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* Celular: período e setas à vista; cartões e categorias na gaveta. */}
        <SeletorDePeriodo
          modo="intervalo"
          startDate={startDate}
          endDate={endDate}
          aoMudar={(p) => { setEscolhido(null); trocar({ startDate: p.startDate, endDate: p.endDate }) }}
          acaoNoCelular={
            <GavetaDeFiltros contador={(cartoes.length > 1 && accountIds.length > 0 ? 1 : 0) + (opcoesDeCategoria.length > 1 && nomesEscolhidos.length > 0 ? 1 : 0)}>
              <div className="space-y-4">{filtros(true)}</div>
            </GavetaDeFiltros>
          }
        />
        <div className="hidden md:contents">{filtros(false)}</div>
      </div>

      {meses.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma fatura de cartão neste período.</Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Gasto por fatura{filtrando && <span className="font-normal text-muted-foreground"> · {rotuloDaSerie}</span>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Média das faturas fechadas: <span className="font-medium tabular-nums text-foreground">{formatBRL(mediaCents)}</span>.
                {temMeta && ' A linha verde é a meta da categoria, que vale para o gasto em todas as contas.'}
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
                <CardTitle className="text-base">Mês a mês{filtrando && <span className="font-normal text-muted-foreground"> · {rotuloDaSerie}</span>}</CardTitle>
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
                            <button type="button" className="focus-visible:underline focus-visible:outline-none" onClick={() => setEscolhido(m.mes)}>
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
                  Por categoria em {selecionado && nomeDoMes(selecionado.mes).toLowerCase()}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {anterior
                    ? `Variação contra ${nomeDoMes(anterior.mes).toLowerCase()}.`
                    : 'Sem mês anterior para comparar.'}
                  {selecionado?.aberta && ' A fatura ainda está aberta.'}
                  {linkDaFaturaSelecionada && (
                    <>
                      {' '}
                      <Link href={linkDaFaturaSelecionada} className="font-medium text-foreground underline-offset-2 hover:underline">
                        Ver os lançamentos da fatura
                      </Link>
                    </>
                  )}
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
                      // "Sem categoria" e categoria fora da lista de cima não têm id para filtrar.
                      const idDaCategoria = categoriasDeCima.find((k) => k.name === c.cat)?.id
                      const linkDaCategoria = aberta && idDaCategoria ? linkDoSelecionado(idsComFilhas(idDaCategoria, arvoreDeCategorias)) : null
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
                                <div className="h-full rounded-full bg-[#eb6834]" style={{ width: `${parte * 100}%` }} />
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
                          {linkDaCategoria && (
                            <Link href={linkDaCategoria} className="mb-2.5 ml-5 inline-block text-xs font-medium underline-offset-2 hover:underline">
                              Ver em Transações
                            </Link>
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
