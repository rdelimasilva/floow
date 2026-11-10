import { describe, expect, it } from 'vitest'
import { gastoMensalDosMeses } from '@/lib/investments/diagnostico/gasto-mensal'

const hoje = '2026-11-10'

describe('gasto mensal para o diagnóstico', () => {
  it('faz a média dos 6 meses fechados', () => {
    const meses = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month, i) => ({
      month,
      expense: (i + 1) * 100_000,
    }))
    expect(gastoMensalDosMeses(meses, hoje)).toBe(350_000)
  })

  it('com 2 meses devolve null', () => {
    expect(gastoMensalDosMeses([{ month: '2026-09', expense: 1 }, { month: '2026-10', expense: 1 }], hoje)).toBeNull()
  })

  it('ignora o mês corrente e meses antes da janela', () => {
    const meses = [
      { month: '2026-11', expense: 9_999_999 },
      { month: '2026-04', expense: 9_999_999 },
      { month: '2026-08', expense: 300_000 },
      { month: '2026-09', expense: 300_000 },
      { month: '2026-10', expense: 300_000 },
    ]
    expect(gastoMensalDosMeses(meses, hoje)).toBe(300_000)
  })

  it('com 4 meses divide por 4, usando o valor absoluto', () => {
    const meses = ['2026-07', '2026-08', '2026-09', '2026-10'].map((month) => ({ month, expense: -200_000 }))
    meses[0].expense = -600_000
    expect(gastoMensalDosMeses(meses, hoje)).toBe(300_000)
  })

  it('janeiro olha para o ano anterior', () => {
    const meses = ['2025-10', '2025-11', '2025-12'].map((month) => ({ month, expense: 100_000 }))
    expect(gastoMensalDosMeses(meses, '2026-01-15')).toBe(100_000)
  })

  it('mês sem despesa não conta como histórico', () => {
    const meses = [
      { month: '2026-08', expense: 0 },
      { month: '2026-09', expense: 300_000 },
      { month: '2026-10', expense: 300_000 },
    ]
    expect(gastoMensalDosMeses(meses, hoje)).toBeNull()
  })
})
