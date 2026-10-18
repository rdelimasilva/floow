import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PgDialect } from 'drizzle-orm/pg-core'
import { somenteRealizado } from '@/lib/finance/realized-spending'

/**
 * Gasto de orçamento é só o que aconteceu. Previsão de recorrência
 * (`balance_applied = false`) não entra — nem a aberta, que ainda não
 * aconteceu, nem a já conciliada, cujo realizado do banco já está somado.
 *
 * Sem isto o aluguel contava duas vezes em julho e agosto de 2026: o boleto
 * da imobiliária e a parcela prevista casada com ele. Saldo e fluxo de caixa
 * já seguiam a regra desde 9ae90ed; as consultas de orçamento ficaram de fora.
 */
describe('somenteRealizado', () => {
  it('filtra por balance_applied verdadeiro', () => {
    const { sql, params } = new PgDialect().sqlToQuery(somenteRealizado)
    expect(sql).toBe('"transactions"."balance_applied" = $1')
    expect(params).toEqual([true])
  })

  // As quatro consultas que somam gasto contra teto precisam concordar entre
  // si — a tela de ritmo e o insight do CFO não podem contar o mês diferente.
  it.each([
    'lib/finance/budget-queries.ts',
    'lib/finance/budget-daily-queries.ts',
    'lib/finance/budget-pacing-actions.ts',
    'lib/cfo/budget-pacing-input.ts',
  ])('%s aplica a condição', (arquivo) => {
    const fonte = readFileSync(path.resolve(__dirname, '../..', arquivo), 'utf8')
    expect(fonte).toMatch(/somenteRealizado,/)
  })
})

// Investimento não é gasto, e a parcela a vencer entra na projeção: a tela do
// Ritmo, o insight do CFO e os alertas por e-mail/WhatsApp contam o mês igual.
describe('mesmo universo entre o Ritmo e o CFO', () => {
  it.each([
    'lib/finance/budget-queries.ts',
    'lib/finance/budget-daily-queries.ts',
    'lib/finance/budget-pacing-actions.ts',
    'lib/cfo/budget-pacing-input.ts',
  ])('%s exclui o que não afeta o fluxo de caixa', (arquivo) => {
    const fonte = readFileSync(path.resolve(__dirname, '../..', arquivo), 'utf8')
    expect(fonte).toMatch(/effectiveAffectsCashFlow,/)
  })

  it.each(['app/(app)/budgets/pacing/page.tsx', 'lib/cfo/budget-pacing-input.ts'])(
    '%s passa as parcelas a vencer para a projeção',
    (arquivo) => {
      const fonte = readFileSync(path.resolve(__dirname, '../..', arquivo), 'utf8')
      expect(fonte).toMatch(/committed/)
      expect(fonte).toMatch(/ParcelasAVencer/)
      expect(fonte).toMatch(/RecorrentesAVencer/)
    },
  )
})

it.each(['lib/finance/budget-daily-queries.ts', 'lib/cfo/budget-pacing-input.ts'])(
  '%s marca a conta fixa já paga, que o ritmo não estica',
  (arquivo) => {
    const fonte = readFileSync(path.resolve(__dirname, '../..', arquivo), 'utf8')
    expect(fonte).toMatch(/leftJoin\(previstoDaRecorrencia, condicaoDoPrevisto\)/)
    expect(fonte).toMatch(/fixed: ehGastoFixo/)
  },
)
