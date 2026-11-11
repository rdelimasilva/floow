import { describe, it, expect } from 'vitest'
import { intervaloDoMes, rotaDaAcao, urlDeTransacoes } from '@/lib/cfo/rota-da-acao'

describe('rotaDaAcao', () => {
  it('leva o mês do insight para o intervalo que Transações lê', () => {
    expect(rotaDaAcao('view_transactions', { period: '2026-02' }))
      .toBe('/transactions?startDate=2026-02-01&endDate=2026-02-28')
  })

  it('leva a categoria por id', () => {
    expect(urlDeTransacoes({ period: '2024-02', categoryId: 'abc' }))
      .toBe('/transactions?startDate=2024-02-01&endDate=2024-02-29&categoryIds=abc')
  })

  it('sem parâmetros válidos abre Transações sem recorte, nunca com "&" solto', () => {
    expect(rotaDaAcao('view_transactions', {})).toBe('/transactions')
    expect(rotaDaAcao('view_transactions', { period: 'março' })).toBe('/transactions')
  })

  it('abre o Ritmo no mês do insight', () => {
    expect(rotaDaAcao('view_pacing', { month: '2026-11' })).toBe('/budgets/pacing?month=2026-11-01')
  })

  it('tipo desconhecido não navega', () => {
    expect(rotaDaAcao('xyz', {})).toBeNull()
  })

  it('rejeita mês fora do calendário', () => {
    expect(intervaloDoMes('2026-13')).toBeNull()
  })
})
