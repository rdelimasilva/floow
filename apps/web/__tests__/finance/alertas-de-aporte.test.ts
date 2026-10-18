import { describe, it, expect } from 'vitest'
import { alertasDeAporte } from '@/lib/finance/alertas-de-aporte'

/**
 * O alerta de meta de aporte do Dashboard tem de falar da mesma meta que a
 * tela Meta de Investimentos mostra.
 *
 * Antes ele lia `budget_goals` — tabela antiga, sem tela que a crie ou edite
 * — e o usuário via "teste" em risco enquanto a tela de metas mostrava
 * "Aporte mensal" (que vem de `budget_entries`). A regra de ritmo continua a
 * mesma: alerta quando o aportado está abaixo de 80% do esperado para o dia.
 */
const inicio = new Date(2026, 9, 1)
const fim = new Date(2026, 9, 31)
const dia18 = new Date(2026, 9, 18)

describe('alertasDeAporte', () => {
  it('usa o nome da meta da tela Meta de Investimentos', () => {
    const alertas = alertasDeAporte([{ name: 'Aporte mensal', plannedCents: 50000 }], 0, inicio, fim, dia18)
    expect(alertas).toEqual([
      { name: 'Aporte mensal', currentCents: 0, limitCents: 50000, href: '/budgets/investing' },
    ])
  })

  it('meta sem nome vira "Aportes", como na tela de metas', () => {
    const alertas = alertasDeAporte([{ name: null, plannedCents: 50000 }], 0, inicio, fim, dia18)
    expect(alertas[0].name).toBe('Aportes')
  })

  it('aporte no ritmo não gera alerta', () => {
    // Dia 18 de 31: esperado ~55%; 80% disso ~44%. R$ 300 de R$ 500 = 60%.
    expect(alertasDeAporte([{ name: 'Aporte mensal', plannedCents: 50000 }], 30000, inicio, fim, dia18)).toEqual([])
  })

  it('com várias metas, divide o aportado na proporção do planejado', () => {
    const alertas = alertasDeAporte(
      [{ name: 'A', plannedCents: 30000 }, { name: 'B', plannedCents: 10000 }],
      4000, inicio, fim, dia18,
    )
    expect(alertas.map((a) => [a.name, a.currentCents])).toEqual([['A', 3000], ['B', 1000]])
  })

  it('sem meta, sem alerta', () => {
    expect(alertasDeAporte([], 0, inicio, fim, dia18)).toEqual([])
  })
})
