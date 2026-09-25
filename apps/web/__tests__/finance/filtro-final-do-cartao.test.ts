import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions, buildBalanceScopeConditions } from '@/lib/finance/queries'

/**
 * Filtro por final do cartão. A fatura é uma só; o filtro recorta a lista
 * (titular, adicional, virtual) sem mexer no escopo do saldo, que continua
 * sendo o da conta inteira.
 */

const dialect = new PgDialect()
const sqlDe = (fn: typeof buildTransactionConditions | typeof buildBalanceScopeConditions, opts?: Parameters<typeof buildTransactionConditions>[1]) =>
  dialect.sqlToQuery(and(...fn('org-1', opts))!).sql.toLowerCase()

describe('filtro por final do cartão', () => {
  it('sem final, nenhuma condição sobre a coluna', () => {
    expect(sqlDe(buildTransactionConditions, {})).not.toContain('card_last_digits')
    expect(sqlDe(buildTransactionConditions, { cardDigits: '' })).not.toContain('card_last_digits')
  })

  it('um ou mais finais geram um IN', () => {
    expect(sqlDe(buildTransactionConditions, { cardDigits: '1035,2270' })).toContain('"card_last_digits" in ($3, $4)')
  })

  it('ignora o que não é final de quatro dígitos', () => {
    const gerado = sqlDe(buildTransactionConditions, { cardDigits: "1035,x'; drop,12345" })
    expect(gerado).toContain('"card_last_digits" in ($3)')
  })

  it('não mexe no escopo do saldo', () => {
    expect(sqlDe(buildBalanceScopeConditions, { cardDigits: '1035' })).not.toContain('card_last_digits')
  })
})
