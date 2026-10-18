import { describe, it, expect } from 'vitest'
import { totalMensalRecorrentes } from '@/lib/finance/total-mensal-recorrentes'

describe('totalMensalRecorrentes', () => {
  it('soma receitas e despesas mensais ativas', () => {
    const r = totalMensalRecorrentes([
      { type: 'income', amountCents: 500000, frequency: 'monthly', isActive: true },
      { type: 'expense', amountCents: 120000, frequency: 'monthly', isActive: true },
      { type: 'expense', amountCents: 30000, frequency: 'monthly', isActive: true },
    ])
    expect(r).toEqual({ receitasCents: 500000, despesasCents: 150000, saldoCents: 350000, quantidade: 3 })
  })

  it('ignora recorrências pausadas', () => {
    const r = totalMensalRecorrentes([
      { type: 'expense', amountCents: 10000, frequency: 'monthly', isActive: false },
    ])
    expect(r).toEqual({ receitasCents: 0, despesasCents: 0, saldoCents: 0, quantidade: 0 })
  })

  it('converte outras frequências para o equivalente mensal', () => {
    const r = totalMensalRecorrentes([
      { type: 'expense', amountCents: 120000, frequency: 'yearly', isActive: true }, // 10.000
      { type: 'expense', amountCents: 30000, frequency: 'quarterly', isActive: true }, // 10.000
      { type: 'expense', amountCents: 12000, frequency: 'weekly', isActive: true }, // 52.000
      { type: 'expense', amountCents: 12000, frequency: 'biweekly', isActive: true }, // 26.000
      { type: 'expense', amountCents: 1200, frequency: 'daily', isActive: true }, // 36.500
    ])
    expect(r.despesasCents).toBe(10000 + 10000 + 52000 + 26000 + 36500)
  })
})
