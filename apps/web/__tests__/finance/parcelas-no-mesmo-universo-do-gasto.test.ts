import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * `getParcelasAVencerDoMes` tem que enxergar o mesmo universo de
 * `getSpendingByCategory`: parcela ainda não vencida (balance_applied =
 * false, com purchase_date — o que distingue cartão de parcela manual) e
 * fora de categoria que não afeta o fluxo de caixa (investimento). Sem
 * `effectiveAffectsCashFlow` aqui, uma parcela de categoria de investimento
 * reduzia o "livre" como "a vencer" mas nunca virava "gasto" ao vencer.
 */
describe('getParcelasAVencerDoMes — mesmo universo do gasto', () => {
  it('aplica effectiveAffectsCashFlow, balance_applied = false e purchase_date', () => {
    const fonte = readFileSync(
      path.resolve(__dirname, '../..', 'lib/finance/parcelas-a-vencer-queries.ts'),
      'utf8',
    )
    expect(fonte).toMatch(/effectiveAffectsCashFlow,/)
    expect(fonte).toMatch(/eq\(transactions\.balanceApplied, false\)/)
    expect(fonte).toMatch(/isNotNull\(transactions\.purchaseDate\)/)
  })
})
