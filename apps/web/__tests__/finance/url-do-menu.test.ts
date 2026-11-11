import { describe, it, expect } from 'vitest'
import { destinoDeTransacoes, urlDeAnalises, urlDeOrcamento, urlDeTransacoes } from '@/lib/finance/url-do-menu'
import { serializarRecorte } from '@/lib/finance/recorte'

const HOJE = '2026-11-11'
const OUT = { startDate: '2026-10-01', endDate: '2026-10-31' }
const jar = (accountIds: string[] = [], extra: Record<string, string> = {}) => ({
  recorte: encodeURIComponent(serializarRecorte({ ...OUT, accountIds }, HOJE)),
  ...extra,
})
const q = (url: string | null) => new URL(url!, 'https://x').searchParams

describe('Transações abre no recorte', () => {
  it('cookie de outubro com a conta a vira período + accountId', () => {
    expect(destinoDeTransacoes({}, jar(['a']), null, HOJE))
      .toBe('/transactions?startDate=2026-10-01&endDate=2026-10-31&accountId=a')
  })

  it('sem cookie nenhum abre em "Este mês"', () => {
    expect(destinoDeTransacoes({}, {}, null, HOJE))
      .toBe('/transactions?startDate=2026-11-01&endDate=2026-11-30')
  })

  it('URL que já escolheu o recorte não é mexida', () => {
    expect(destinoDeTransacoes({ startDate: '2026-01-01' }, jar(['a']), null, HOJE)).toBeNull()
  })

  it('conta de investimento do recorte não vai para a URL', () => {
    const url = destinoDeTransacoes({}, jar(['inv', 'a']), ['a', 'b'], HOJE)
    expect(q(url).get('accountId')).toBe('a')
    expect(q(destinoDeTransacoes({}, jar(['inv']), ['a'], HOJE)).has('accountId')).toBe(false)
  })

  it('busca lembrada volta, mas o período do tx-filters não vence o recorte', () => {
    const url = destinoDeTransacoes(
      { pageSize: '50' },
      jar([], { 'tx-filters': encodeURIComponent('search=mercado&startDate=2020-01-01&endDate=2020-01-31') }),
      null, HOJE,
    )
    expect(q(url).get('search')).toBe('mercado')
    expect(q(url).get('startDate')).toBe('2026-10-01')
    expect(q(url).get('pageSize')).toBe('50')
  })

  it('recorte aberto ainda restaura a busca lembrada', () => {
    const aberto = { recorte: encodeURIComponent('v=1'), 'tx-filters': encodeURIComponent('search=x') }
    expect(destinoDeTransacoes({}, aberto, null, HOJE)).toBe('/transactions?search=x')
  })
})

describe('links do menu', () => {
  it('Transações leva o tamanho de página', () => {
    expect(q(urlDeTransacoes({ ...jar(), 'tx-page-size': '50' }, HOJE)).get('pageSize')).toBe('50')
  })

  it('Gastos com recorte de outubro abre em outubro', () => {
    expect(urlDeOrcamento('/budgets/spending', jar(), HOJE)).toBe('/budgets/spending?month=2026-10-01')
  })

  it('sem recorte, Orçamentos e Análises ficam como estão', () => {
    expect(urlDeOrcamento('/budgets/spending', {}, HOJE)).toBe('/budgets/spending')
    expect(urlDeAnalises({}, HOJE)).toBe('/cash-flow')
  })

  it('Análises leva período e contas', () => {
    expect(urlDeAnalises(jar(['a']), HOJE))
      .toBe('/cash-flow?startDate=2026-10-01&endDate=2026-10-31&accountId=a')
  })
})

describe('menu sem nada lembrado', () => {
  it('Transações fica pura', () => {
    expect(urlDeTransacoes({}, HOJE)).toBe('/transactions')
  })
})
