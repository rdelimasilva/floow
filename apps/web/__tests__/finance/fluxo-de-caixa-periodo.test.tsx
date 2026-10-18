/**
 * Tela Fluxo de Caixa: "Últimos Nm" cobre N meses.
 *
 * Revisão de 18/10/2026: com "Últimos 12m", os cards mostravam R$ 778k /
 * R$ 784k e o total da tabela R$ 738k / R$ 771k; parte da diferença vinha
 * daqui. "Últimos 12m" começava no mesmo dia de 12 meses atrás (18/10/2025),
 * o que atravessa 13 meses de calendário — o gráfico desenhava 13 barras.
 *
 * Regra: os últimos N meses são o mês corrente e os N-1 anteriores inteiros.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPeriodDates } from '@/components/finance/cash-flow-period-filter'

function mesesNoIntervalo(inicio: string, fim: string): number {
  const [y1, m1] = inicio.split('-').map(Number)
  const [y2, m2] = fim.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

describe('períodos "Últimos Nm"', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('"Últimos 12m" cobre 12 meses de calendário, do dia 1 até hoje', () => {
    const { startDate, endDate } = getPeriodDates('last12')
    expect(startDate).toBe('2025-11-01')
    expect(endDate).toBe('2026-10-18')
    expect(mesesNoIntervalo(startDate, endDate)).toBe(12)
  })

  it('"Últimos 6m" e "Últimos 3m" seguem a mesma regra', () => {
    expect(getPeriodDates('last6').startDate).toBe('2026-05-01')
    expect(getPeriodDates('last3').startDate).toBe('2026-08-01')
  })
})
