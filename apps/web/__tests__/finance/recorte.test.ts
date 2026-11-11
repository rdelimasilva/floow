import { describe, it, expect } from 'vitest'
import { getPeriodDates } from '@/lib/finance/filtros-lembrados'
import {
  serializarRecorte, lerRecorte, recorteDaUrl, temRecorteNaUrl, contasValidas,
  mesParaTelaDeMes, destinoComRecorte, fundirRecorte, RECORTE_PADRAO,
} from '@/lib/finance/recorte'

describe('recorte', () => {
  it('relativo continua relativo', () => {
    const s = serializarRecorte({ ...getPeriodDates('last3Months', '2026-11-11'), accountIds: ['a'] }, '2026-11-11')
    expect(lerRecorte({ recorte: s }, '2027-01-05')).toEqual({ ...getPeriodDates('last3Months', '2027-01-05'), accountIds: ['a'] })
  })
  it('datas à mão voltam como estão, inclusive o recorte todo aberto', () => {
    const r = { startDate: '2026-03-01', endDate: '2026-03-15', accountIds: [] }
    expect(lerRecorte({ recorte: encodeURIComponent(serializarRecorte(r)) })).toEqual(r)
    const aberto = { startDate: '', endDate: '', accountIds: [] }
    expect(lerRecorte({ recorte: serializarRecorte(aberto), 'tx-accounts': 'z' })).toEqual(aberto)
  })
  it('sem cookie novo, herda tx-filters e tx-accounts', () => {
    expect(lerRecorte({ 'tx-filters': 'startDate=2026-03-01&endDate=2026-03-31&search=uber', 'tx-accounts': 'a,b' }))
      .toEqual({ startDate: '2026-03-01', endDate: '2026-03-31', accountIds: ['a', 'b'] })
  })
  it('sem nenhum cookie, null', () => expect(lerRecorte({})).toBeNull())
  it('month vira o mês inteiro', () => expect(recorteDaUrl({ month: '2026-02-01' })).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' }))
  it('recorteDaUrl devolve só o que veio', () => {
    expect(recorteDaUrl({ accountId: 'a,b' })).toEqual({ accountIds: ['a', 'b'] })
    expect(recorteDaUrl({})).toEqual({})
    expect(temRecorteNaUrl({ month: '2026-02-01' })).toBe(true)
    expect(temRecorteNaUrl({ pageSize: '50' })).toBe(false)
  })
  it('tela de mês sem fim usa o mês de hoje', () => {
    expect(mesParaTelaDeMes({ startDate: '2025-01-01', endDate: '', accountIds: [] }, '2026-11-11')).toBe('2026-11-01')
    expect(mesParaTelaDeMes(null, '2026-11-11')).toBe('2026-11-01')
  })
  it('conta desconhecida sai sem apagar as outras', () => expect(contasValidas(['x', 'a'], ['a', 'b'])).toEqual(['a']))
  it('não redireciona em laço', () => {
    expect(destinoComRecorte('/transactions', { startDate: '2026-01-01' }, RECORTE_PADRAO(), 'intervalo')).toBeNull()
    expect(destinoComRecorte('/transactions', {}, { startDate: '', endDate: '', accountIds: [] }, 'intervalo')).toBeNull()
    expect(destinoComRecorte('/transactions', {}, null, 'intervalo')).toBeNull()
  })
  it('tela de mês recebe month', () => {
    expect(destinoComRecorte('/budgets/spending', {}, { startDate: '2026-10-01', endDate: '2026-10-31', accountIds: ['a'] }, 'mes'))
      .toBe('/budgets/spending?month=2026-10-01')
  })
  it('preserva os outros parâmetros', () => {
    expect(destinoComRecorte('/transactions', { pageSize: '50' }, { startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] }, 'intervalo'))
      .toBe('/transactions?pageSize=50&startDate=2026-10-01&endDate=2026-10-31')
  })
  it('contas só vão quando a tela pede', () => {
    const r = { startDate: '', endDate: '', accountIds: ['a', 'b'] }
    expect(destinoComRecorte('/transactions', {}, r, 'intervalo', { contas: true })).toBe('/transactions?accountId=a%2Cb')
    expect(destinoComRecorte('/transactions', {}, r, 'intervalo')).toBeNull()
  })
  it('fundirRecorte troca só o que veio', () => {
    expect(fundirRecorte({ startDate: 'a', endDate: 'b', accountIds: ['x'] }, { accountIds: [] }, '2026-11-11'))
      .toEqual({ startDate: 'a', endDate: 'b', accountIds: [] })
    expect(fundirRecorte(null, { startDate: '2026-10-01' }, '2026-11-11'))
      .toEqual({ ...RECORTE_PADRAO('2026-11-11'), startDate: '2026-10-01' })
  })
})
