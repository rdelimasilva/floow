import { describe, it, expect } from 'vitest'
import {
  getPeriodDates,
  detectActivePeriod,
  PERIOD_GROUPS,
  serializarFiltros,
  restaurarFiltros,
  temFiltroNaUrl,
  urlDeTransacoes,
} from '@/lib/finance/filtros-lembrados'

/**
 * A tela de Transações reabre com os filtros do último uso.
 *
 * Período escolhido por pílula volta como período RELATIVO: quem deixou "Este
 * mês" em setembro e volta em outubro quer outubro, não setembro congelado.
 * Datas digitadas à mão voltam exatamente como estavam.
 */

describe('atalhos de período', () => {
  it('calcula a partir do dia de São Paulo, sem pular para amanhã à noite', () => {
    expect(getPeriodDates('today', '2026-09-23')).toEqual({ startDate: '2026-09-23', endDate: '2026-09-23' })
    expect(getPeriodDates('month', '2026-09-23')).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(getPeriodDates('month', '2026-02-10')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
    expect(getPeriodDates('year', '2026-09-23')).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' })
  })

  it('mês passado e ano passado são blocos de calendário inteiros', () => {
    expect(getPeriodDates('lastMonth', '2026-10-01')).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' })
    expect(getPeriodDates('lastMonth', '2026-01-15')).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31' })
    expect(getPeriodDates('lastYear', '2026-10-01')).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' })
  })

  it('últimos N meses contam o mês atual, até hoje', () => {
    expect(getPeriodDates('last3Months', '2026-10-13')).toEqual({ startDate: '2026-08-01', endDate: '2026-10-13' })
    expect(getPeriodDates('last3Months', '2026-02-10')).toEqual({ startDate: '2025-12-01', endDate: '2026-02-10' })
    expect(getPeriodDates('last12Months', '2026-10-13')).toEqual({ startDate: '2025-11-01', endDate: '2026-10-13' })
  })

  it('próximo mês e próximo ano são blocos de calendário inteiros', () => {
    expect(getPeriodDates('nextMonth', '2026-09-23')).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(getPeriodDates('nextMonth', '2026-12-05')).toEqual({ startDate: '2027-01-01', endDate: '2027-01-31' })
    expect(getPeriodDates('nextYear', '2026-09-23')).toEqual({ startDate: '2027-01-01', endDate: '2027-12-31' })
  })

  it('próximos N meses começam hoje e contam o mês atual', () => {
    expect(getPeriodDates('next3Months', '2026-10-13')).toEqual({ startDate: '2026-10-13', endDate: '2026-12-31' })
    expect(getPeriodDates('next3Months', '2026-12-05')).toEqual({ startDate: '2026-12-05', endDate: '2027-02-28' })
    expect(getPeriodDates('next6Months', '2026-10-13')).toEqual({ startDate: '2026-10-13', endDate: '2027-03-31' })
  })

  it('nenhum atalho tem as mesmas datas de outro — a pílula ativa é sempre a certa', () => {
    for (const hoje of ['2026-01-01', '2026-03-31', '2026-10-13', '2026-12-30']) {
      const datas = PERIOD_GROUPS.flatMap((g) => g.keys).map((k) => JSON.stringify(getPeriodDates(k, hoje)))
      expect(new Set(datas).size).toBe(datas.length)
    }
  })

  it('em 31/12, "Últimos 12 meses" coincide com "Este ano" — acende "Este ano"', () => {
    expect(getPeriodDates('last12Months', '2026-12-31')).toEqual(getPeriodDates('year', '2026-12-31'))
    expect(detectActivePeriod('2026-01-01', '2026-12-31', '2026-12-31')).toBe('year')
  })

  it('período lembrado volta relativo ao dia da volta', () => {
    const cookie = serializarFiltros(new URLSearchParams('startDate=2026-08-01&endDate=2026-10-13'), '2026-10-13')
    expect(cookie).toBe('period=last3Months')
    expect(restaurarFiltros(cookie, '2026-11-02').toString()).toBe('startDate=2026-09-01&endDate=2026-11-02')
  })

  it('reconhece a pílula ativa pelas datas', () => {
    expect(detectActivePeriod('2026-09-01', '2026-09-30', '2026-09-23')).toBe('month')
    expect(detectActivePeriod('2026-09-02', '2026-09-30', '2026-09-23')).toBeNull()
    expect(detectActivePeriod('2026-09-01', '2026-09-30', '2026-10-01')).toBe('lastMonth')
  })
})

describe('memória dos filtros', () => {
  const hoje = '2026-09-23'

  it('guarda só os filtros — nem página nem tamanho de página', () => {
    const url = new URLSearchParams(
      'accountId=a1,a2&search=mercado&types=expense&categoryIds=c1&minAmount=100&maxAmount=900&sortBy=amount&sortDir=desc&future=1&page=4&pageSize=50',
    )
    const salvo = new URLSearchParams(serializarFiltros(url, hoje))
    expect(salvo.get('accountId')).toBe('a1,a2')
    expect(salvo.get('search')).toBe('mercado')
    expect(salvo.get('types')).toBe('expense')
    expect(salvo.get('categoryIds')).toBe('c1')
    expect(salvo.get('minAmount')).toBe('100')
    expect(salvo.get('maxAmount')).toBe('900')
    expect(salvo.get('sortBy')).toBe('amount')
    expect(salvo.get('sortDir')).toBe('desc')
    expect(salvo.get('future')).toBe('1')
    expect(salvo.has('page')).toBe(false)
    expect(salvo.has('pageSize')).toBe(false)
  })

  it('pílula de período vira período relativo e volta com as datas do dia da volta', () => {
    const salvo = serializarFiltros(new URLSearchParams('startDate=2026-09-01&endDate=2026-09-30'), hoje)
    expect(new URLSearchParams(salvo).get('period')).toBe('month')

    const restaurado = restaurarFiltros(salvo, '2026-10-05')
    expect(restaurado.get('startDate')).toBe('2026-10-01')
    expect(restaurado.get('endDate')).toBe('2026-10-31')
    expect(restaurado.has('period')).toBe(false)
  })

  it('período passado lembrado também vira relativo e volta recalculado, com virada de ano', () => {
    // Relativo a `hoje` (2026-09-23), ago/2026 é "lastMonth".
    const salvo = serializarFiltros(new URLSearchParams('startDate=2026-08-01&endDate=2026-08-31'), hoje)
    expect(new URLSearchParams(salvo).get('period')).toBe('lastMonth')

    const restaurado = restaurarFiltros(salvo, '2026-01-15')
    expect(restaurado.get('startDate')).toBe('2025-12-01')
    expect(restaurado.get('endDate')).toBe('2025-12-31')
  })

  it('datas digitadas à mão voltam exatamente como estavam', () => {
    const salvo = serializarFiltros(new URLSearchParams('startDate=2026-03-05&endDate=2026-04-17'), hoje)
    const restaurado = restaurarFiltros(salvo, '2026-10-05')
    expect(restaurado.get('startDate')).toBe('2026-03-05')
    expect(restaurado.get('endDate')).toBe('2026-04-17')
  })

  it('só uma ponta da data também é lembrada', () => {
    const restaurado = restaurarFiltros(serializarFiltros(new URLSearchParams('startDate=2026-03-05'), hoje), hoje)
    expect(restaurado.get('startDate')).toBe('2026-03-05')
    expect(restaurado.has('endDate')).toBe(false)
  })

  it('sem filtro nenhum, não há o que restaurar', () => {
    expect(serializarFiltros(new URLSearchParams('page=2&pageSize=50'), hoje)).toBe('')
    expect(restaurarFiltros('', hoje).toString()).toBe('')
  })

  it('cookie adulterado não injeta chaves estranhas nem período inventado', () => {
    const restaurado = restaurarFiltros('page=9&foo=bar&period=decada&search=x', hoje)
    expect(restaurado.toString()).toBe('search=x')
  })

  it('só redireciona quando a URL chega sem nenhum filtro', () => {
    expect(temFiltroNaUrl({})).toBe(false)
    expect(temFiltroNaUrl({ page: '2', pageSize: '50' })).toBe(false)
    expect(temFiltroNaUrl({ search: 'x' })).toBe(true)
    // Filtro explicitamente vazio na URL também é escolha
    expect(temFiltroNaUrl({ accountId: '' })).toBe(true)
  })
})

// O menu aponta para a URL já filtrada: o cache do navegador (staleTimes)
// guarda a tela por URL, e um "/transactions" puro guardado antes de o filtro
// mudar reabriria o recorte antigo.
describe('urlDeTransacoes', () => {
  const HOJE = '2026-10-20'

  it('sem cookie nenhum, é a tela pura', () => {
    expect(urlDeTransacoes({}, HOJE)).toBe('/transactions')
  })

  it('cookie vazio é "limpou tudo": não restaura', () => {
    expect(urlDeTransacoes({ 'tx-filters': '', 'tx-accounts': '' }, HOJE)).toBe('/transactions')
  })

  it('restaura os filtros e a conta lembrada numa URL só', () => {
    const url = urlDeTransacoes(
      { 'tx-filters': encodeURIComponent('search=mercado&period=month'), 'tx-accounts': 'a1,a2' },
      HOJE,
    )
    const p = new URL(url, 'https://x').searchParams
    expect(p.get('search')).toBe('mercado')
    expect(p.get('startDate')).toBe('2026-10-01')
    expect(p.get('endDate')).toBe('2026-10-31')
    expect(p.get('accountId')).toBe('a1,a2')
  })

  it('a conta do filtro vence a do cookie de contas', () => {
    const url = urlDeTransacoes({ 'tx-filters': 'accountId=a9', 'tx-accounts': 'a1' }, HOJE)
    expect(new URL(url, 'https://x').searchParams.get('accountId')).toBe('a9')
  })

  it('leva o tamanho de página escolhido', () => {
    expect(urlDeTransacoes({ 'tx-page-size': '50' }, HOJE)).toBe('/transactions?pageSize=50')
  })
})
