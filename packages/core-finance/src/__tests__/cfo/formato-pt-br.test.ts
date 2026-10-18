import { describe, it, expect } from 'vitest'
import { analyzeCashFlow } from '../../cfo/analyzers/cash-flow'
import { analyzeInvestment } from '../../cfo/analyzers/investment'
import { analyzeDebt } from '../../cfo/analyzers/debt'
import { analyzePatrimony } from '../../cfo/analyzers/patrimony'
import { analyzeBudgetPacing } from '../../cfo/analyzers/budget-pacing'
import { brl, pct } from '../../cfo/formato'
import { buildSynthesisPrompt } from '../../cfo/llm/prompts'

// O Intl separa "R$" do número com espaço não separável; para comparar, vira espaço comum.
const norm = (s: string) => s.replace(/ /g, ' ')

describe('formato pt-BR dos textos do consultor', () => {
  it('brl formata centavos com milhar e vírgula', () => {
    expect(norm(brl(1400403, 2))).toBe('R$ 14.004,03')
    expect(norm(brl(185098))).toBe('R$ 1.851')
  })

  it('pct arredonda e usa vírgula', () => {
    expect(pct(52.297685731749056)).toBe('52%')
    expect(pct(-65.12, 1)).toBe('-65,1%')
  })

  it('saldo negativo de conta sai em R$ brasileiro', () => {
    const [ins] = analyzeCashFlow({
      monthlyTotals: [],
      accountBalances: [{ accountId: 'a', name: 'Itaú', type: 'checking', balance: -185098 }],
    })
    expect(norm(ins.body)).toContain('R$ 1.850,98')
  })

  it('gastos acima da receita saem em R$ brasileiro', () => {
    const [ins] = analyzeCashFlow({
      monthlyTotals: [{ month: '2026-10', income: 1000000, expense: -1400403 }],
      accountBalances: [],
    })
    expect(norm(ins.body)).toContain('R$ 14.004')
    expect(norm(ins.body)).toContain('R$ 10.000')
  })

  it('concentração não mostra o percentual cru', () => {
    const out = analyzeInvestment({
      positions: [
        { asset: 'NTN-F', class: 'treasury', allocation: 52.297685731749056, pnlPercent: 2 },
        { asset: 'CDB', class: 'fixed_income', allocation: 47.702314268250944, pnlPercent: 1 },
      ],
      totalInvested: 100, dividendsReceived: 0, dividendsExpected: 0,
    })
    const ins = out.find((i) => i.type === 'investment_concentration' && i.title.includes('NTN-F'))!
    expect(ins.body).toContain('52%')
    expect(ins.body).not.toContain('52.29')
  })

  it('prejuízo sai com uma casa e vírgula', () => {
    const [ins] = analyzeInvestment({
      positions: [{ asset: 'CRA', class: 'credit_fixed_income', allocation: 0.2, pnlPercent: -65.12 }],
      totalInvested: 100, dividendsReceived: 0, dividendsExpected: 0,
    })
    expect(ins.title).toContain('-65,1%')
    expect(ins.body).toContain('-65,1%')
  })

  it('juros e cheque especial em R$ brasileiro', () => {
    const out = analyzeDebt({
      debts: [{ name: 'Cheque', balance: 1234567, monthlyPayment: 0, interestRate: 4, isOverdraft: true }],
      monthlyIncome: 100000,
    })
    expect(norm(out[0].body)).toContain('R$ 12.345,67')
    expect(norm(out[1].body)).toContain('R$ 4.115')
  })

  it('patrimônio em R$ brasileiro', () => {
    const [ins] = analyzePatrimony({
      snapshots: [
        { month: '2026-10', netWorth: 61333271, liquidAssets: 0 },
        { month: '2026-09', netWorth: 62135786, liquidAssets: 0 },
      ],
      fixedAssets: [],
    })
    expect(norm(ins.body)).toContain('R$ 8.025')
  })

  it('ritmo de gasto em R$ brasileiro', () => {
    const [ins] = analyzeBudgetPacing({
      month: '2026-10',
      categoryNames: { c: 'Lazer' },
      pacing: {
        total: {
          plannedCents: 9000, spentCents: 211280, unbudgetedCents: 0, committedCents: 0,
          projectedCents: 211280, confidence: 'baixa', daysElapsed: 18, daysInMonth: 31,
        },
        byCategory: [{ categoryId: 'c', plannedCents: 9000, spentCents: 211280, projectedCents: 363871, status: 'estourado' }],
      } as never,
    })
    expect(norm(ins.body)).toContain('R$ 2.113')
    expect(norm(ins.body)).toContain('R$ 90')
  })
})

describe('prompt de síntese', () => {
  it('avisa que metric e contexto estão em centavos e pede formato brasileiro', () => {
    const p = buildSynthesisPrompt('[]', '{}')
    expect(p).toContain('centavos')
    expect(p).toContain('R$ 1.234,56')
  })
})
