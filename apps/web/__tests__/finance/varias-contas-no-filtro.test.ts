import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import {
  buildTransactionConditions,
  buildBalanceScopeConditions,
  contasDoFiltro,
} from '@/lib/finance/queries'

/**
 * O filtro de conta aceita mais de uma.
 *
 * Era um `select` de uma escolha só: ver Itaú + Nubank juntos, sem a corretora
 * no meio, não tinha como — ou uma conta, ou todas. O parâmetro continua se
 * chamando `accountId` para os links antigos não quebrarem; agora ele carrega
 * uma lista separada por vírgula.
 *
 * O escopo do saldo acompanha, porque a conta é justamente o que define de
 * quem é o saldo (ver `saldo-nao-muda-com-filtro`): com duas contas marcadas,
 * a coluna mostra o saldo somado das duas, e não o de uma só nem o de todas.
 */

const dialect = new PgDialect()
const sqlDe = (fn: typeof buildTransactionConditions | typeof buildBalanceScopeConditions, opts?: Parameters<typeof buildTransactionConditions>[1]) =>
  dialect.sqlToQuery(and(...fn('org-1', opts))!).sql.toLowerCase()

describe('contasDoFiltro', () => {
  it('sem conta, lista vazia', () => {
    expect(contasDoFiltro()).toEqual([])
    expect(contasDoFiltro({ accountId: '' })).toEqual([])
  })

  it('uma conta continua uma conta', () => {
    expect(contasDoFiltro({ accountId: 'conta-1' })).toEqual(['conta-1'])
  })

  it('várias vêm separadas por vírgula, sem vazios nem repetidas', () => {
    expect(contasDoFiltro({ accountId: 'conta-1,conta-2,,conta-1' })).toEqual(['conta-1', 'conta-2'])
  })
})

describe('recorte da listagem por conta', () => {
  it('uma conta gera igualdade', () => {
    const gerado = sqlDe(buildTransactionConditions, { accountId: 'conta-1' })
    expect(gerado).toContain('"account_id" =')
    expect(gerado).not.toContain('in (')
  })

  it('duas contas geram um IN com as duas', () => {
    const gerado = sqlDe(buildTransactionConditions, { accountId: 'conta-1,conta-2' })
    expect(gerado).toContain('"account_id" in ($2, $3)')
  })
})

describe('escopo do saldo com várias contas', () => {
  it('soma as contas marcadas, e não todas', () => {
    const gerado = sqlDe(buildBalanceScopeConditions, { accountId: 'conta-1,conta-2' })
    expect(gerado).toContain('"account_id" in ($2, $3)')
  })

  it('com uma conta só, segue igualdade', () => {
    expect(sqlDe(buildBalanceScopeConditions, { accountId: 'conta-1' })).toContain('"account_id" =')
  })
})
