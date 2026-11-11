/**
 * A fatura de Cartões abre em Transações os mesmos lançamentos que somou.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'

const linhas = vi.hoisted(() => ({ valor: [] as Record<string, unknown>[], where: null as unknown }))
vi.mock('@/lib/db/rls', () => ({
  withUserDb: (fn: (db: unknown) => unknown) => {
    const cadeia: Record<string, unknown> = {}
    for (const m of ['select', 'from', 'leftJoin']) cadeia[m] = () => cadeia
    cadeia.where = (w: unknown) => { linhas.where = w; return cadeia }
    cadeia.then = (r: (v: unknown[]) => void) => r(linhas.valor)
    return fn(cadeia)
  },
}))
vi.mock('@/lib/finance/queries-accounts', () => ({
  getAccounts: async () => [
    { id: 'c1', name: 'Itaú Black', type: 'credit_card', closingDay: 10, dueDay: 17, titular: null },
    { id: 'cc', name: 'Corrente', type: 'checking', closingDay: null, dueDay: null, titular: null },
  ],
}))
vi.mock('@/lib/finance/queries-categories', () => ({
  getCategories: async () => [
    { id: 'alim', name: 'Alimentação', parentId: null },
    { id: 'merc', name: 'Mercado', parentId: 'alim' },
    { id: 'lazer', name: 'Lazer', parentId: null },
  ],
}))
vi.mock('@/lib/finance/recurring-budget-queries', () => ({ getSpendingPlanForMonth: async () => [] }))

import { getGastosDosCartoes } from '@/lib/finance/queries-gastos-cartao'
import { comFatura, periodoDaBusca } from '@/lib/finance/fatura-do-filtro'
import { serializarFiltros } from '@/lib/finance/filtros-lembrados'
import { filtrosDaUrl } from '@/lib/finance/filtros-da-url'
import { idsComFilhas, linkDaFatura } from '@/lib/finance/link-do-total'
import { buildTransactionConditions } from '@/lib/finance/queries-transactions'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const nomes: Record<string, string> = { alim: 'Alimentação', merc: 'Mercado', lazer: 'Lazer' }
const linha = (id: string, date: string, amountCents: number, extra: Record<string, unknown> = {}) => {
  const l = {
    id, description: id, accountId: 'c1', date: d(date), amountCents, type: amountCents > 0 ? 'income' : 'expense',
    isIgnored: false, matchedTransactionId: null, purchaseDate: null, installmentTotal: null, billForecastMonth: null,
    billId: null, recurringTemplateId: null, isInstallmentForecast: false, balanceApplied: true, categoryId: 'lazer',
    ...extra,
  }
  return { ...l, categoryName: nomes[l.categoryId as string] ?? null }
}

// Fatura que fecha em 10/10/2026 (dia 10, vence 17).
const FIXTURES = [
  linha('compra', '2026-09-20', -10000, { categoryId: 'merc' }),
  // Parcela 7/10 de compra de março: a data é o vencimento, depois do fechamento.
  linha('parcela', '2026-10-17', -5000, { purchaseDate: d('2026-03-05'), installmentTotal: 10, categoryId: 'alim' }),
  // Pelo dia cairia na fatura de novembro; o bill_id a prende na de outubro.
  linha('presa', '2026-10-11', -3000, { billId: 'b1', categoryId: 'merc' }),
  linha('irma1', '2026-09-25', -1500, { billId: 'b1' }),
  linha('irma2', '2026-10-02', -500, { billId: 'b1' }),
  linha('estorno', '2026-10-01', 2000),
  linha('ignorada', '2026-09-22', -9900, { isIgnored: true }),
  linha('conciliada', '2026-09-23', -8800, { matchedTransactionId: 'compra', recurringTemplateId: 'r1' }),
  linha('pagamento', '2026-10-05', 50000, { type: 'transfer' }),
  linha('novembro', '2026-10-20', -7000),
]

const dialect = new PgDialect()
/** O que a lista mostra: os ids da fatura dentro das datas e categorias do link. */
async function somaDaLista(url: string) {
  const params = Object.fromEntries(new URL(url, 'http://x').searchParams.entries())
  const filtros = await comFatura('org-1', filtrosDaUrl(params))
  const sqlDaLista = dialect.sqlToQuery(and(...buildTransactionConditions('org-1', filtros))!)
  expect(sqlDaLista.sql).toContain('"transactions"."id" in')
  const cats = filtros.categoryIds?.split(',')
  const lista = FIXTURES.filter((l) => filtros.idsDaFatura!.includes(l.id)
    && l.date >= d(filtros.startDate!) && l.date <= d(filtros.endDate!)
    && l.matchedTransactionId == null
    && (!cats || cats.includes(l.categoryId as string)))
  return { soma: -lista.reduce((s, l) => s + l.amountCents, 0), ids: lista.map((l) => l.id).sort() }
}

describe('fatura do cartão abre os lançamentos dela', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T15:00:00Z')); linhas.valor = FIXTURES })
  afterAll(() => { vi.useRealTimers() })

  it('a soma da lista do link é o total da fatura', async () => {
    const [cartao] = await getGastosDosCartoes('org-1', { inicio: '2026-09-01', fim: '2026-11-30' })
    const fatura = cartao.faturas.find((f) => f.fechamento === '2026-10-10')!
    expect(fatura.totalCents).toBe(10000 + 5000 + 3000 + 1500 + 500 - 2000)
    const url = linkDaFatura({ cartaoId: 'c1', fechamento: fatura.fechamento, datas: fatura.lancamentos.map((l) => l.date) })!
    expect(url).toBe('/transactions?accountId=c1&startDate=2026-09-20&endDate=2026-10-17&fatura=2026-10-10')
    const { soma, ids } = await somaDaLista(url)
    expect(soma).toBe(fatura.totalCents)
    expect(ids).toEqual(['compra', 'estorno', 'irma1', 'irma2', 'parcela', 'presa'])
  })

  it('a linha da categoria soma o mesmo que o painel, com as filhas', async () => {
    const [cartao] = await getGastosDosCartoes('org-1', { inicio: '2026-09-01', fim: '2026-11-30' })
    const fatura = cartao.faturas.find((f) => f.fechamento === '2026-10-10')!
    const arvore = [{ id: 'alim', parentId: null }, { id: 'merc', parentId: 'alim' }, { id: 'lazer', parentId: null }]
    const url = linkDaFatura({
      cartaoId: 'c1', fechamento: fatura.fechamento, datas: fatura.lancamentos.map((l) => l.date), categoryIds: idsComFilhas('alim', arvore),
    })!
    expect((await somaDaLista(url)).soma).toBe(fatura.porCategoria['Alimentação'])
    expect(fatura.porCategoria['Alimentação']).toBe(18000)
  })

  it('sem exatamente um cartão em accountId, fatura= é ignorada', async () => {
    for (const accountId of [undefined, 'c1,cc', 'cc']) {
      const f = await comFatura('org-1', filtrosDaUrl({ accountId, fatura: '2026-10-10' }))
      expect(f.fatura).toBeUndefined()
      expect(f.idsDaFatura).toBeUndefined()
    }
    expect(filtrosDaUrl({ fatura: '10/10/2026' }).fatura).toBeUndefined()
  })

  it('busca com a janela da tela: padrão de 12 meses, ou desde o mês anterior para fatura antiga', async () => {
    const limiteInferior = () => dialect.sqlToQuery(linhas.where as never).params.find((p) => p instanceof Date || typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(p))
    await comFatura('org-1', filtrosDaUrl({ accountId: 'c1', fatura: '2026-10-10' }))
    expect(new Date(limiteInferior() as string).toISOString().slice(0, 10)).toBe('2025-10-01')
    await comFatura('org-1', filtrosDaUrl({ accountId: 'c1', fatura: '2025-03-10' }))
    expect(new Date(limiteInferior() as string).toISOString().slice(0, 10)).toBe('2025-01-01')
    expect(periodoDaBusca('2025-03-10', '2026-11-11')).toEqual({ inicio: '2025-02-01', fim: '2025-03-10' })
    expect(periodoDaBusca('2026-10-10', '2026-11-11')).toEqual({ inicio: '', fim: '' })
  })

  it('a fatura não fica lembrada no cookie', () => {
    const salvo = serializarFiltros(new URLSearchParams({ accountId: 'c1', fatura: '2026-10-10', search: 'x' }), '2026-11-11')
    expect(salvo).toBe('accountId=c1&search=x')
  })

  it('sem lançamento na fatura não há link', () => {
    expect(linkDaFatura({ cartaoId: 'c1', fechamento: '2026-10-10', datas: [] })).toBeNull()
  })
})
