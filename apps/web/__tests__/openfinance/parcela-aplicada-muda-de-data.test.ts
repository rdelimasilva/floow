import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { transactions } from '@floow/db'
import { corrigirDataDaParcelaAplicada } from '@/lib/openfinance/parcela-aplicada'

/**
 * Parcela que já entrou no saldo e cuja data correta mudou no sync (a fatura
 * falsa da Polp punha as oito parcelas da Adidas no dia da compra, todas no
 * saldo). Antes o sync não mexia em linha aplicada e a correção exigia SQL à
 * mão. Agora:
 *   - nova data já passou: só a data muda, o saldo não;
 *   - nova data no futuro: a linha sai do saldo e o valor volta para a conta,
 *     uma vez só — `applyDueBankTransactions` a põe de volta no vencimento.
 */

const dialect = new PgDialect()

function fakeDb(retornoDaSaida: { amountCents: number }[]) {
  const chamadas: { table: 'transactions' | 'accounts'; payload: Record<string, unknown> }[] = []
  function chain(table: 'transactions' | 'accounts', resultado: unknown[]): any {
    const c: any = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolve) }
    c.where = () => chain(table, resultado)
    c.returning = () => chain(table, resultado)
    c.set = (payload: Record<string, unknown>) => {
      chamadas.push({ table, payload })
      return chain(table, resultado)
    }
    return c
  }
  const db: any = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    update: (table: unknown) =>
      chain(table === transactions ? 'transactions' : 'accounts', table === transactions ? retornoDaSaida : []),
  }
  return { db, chamadas }
}

const input = { orgId: 'org-1', accountId: 'cartao', transactionId: 'adidas-3', hoje: '2026-10-08' }

describe('corrigirDataDaParcelaAplicada', () => {
  it('nova data no futuro: sai do saldo e devolve o valor à conta uma vez', async () => {
    const { db, chamadas } = fakeDb([{ amountCents: -9999 }])
    expect(await corrigirDataDaParcelaAplicada(db, { ...input, dataFinal: '2026-12-16' })).toBe('saiu_do_saldo')
    const naTransacao = chamadas.filter((c) => c.table === 'transactions')
    expect(naTransacao[0].payload).toMatchObject({ balanceApplied: false })
    expect((naTransacao[0].payload.date as Date).toISOString().slice(0, 10)).toBe('2026-12-16')
    const naConta = chamadas.filter((c) => c.table === 'accounts')
    expect(naConta).toHaveLength(1)
    expect(dialect.sqlToQuery(naConta[0].payload.balanceCents as never).params).toEqual([-9999])
  })

  it('outro sync já tirou do saldo: não devolve de novo', async () => {
    const { db, chamadas } = fakeDb([])
    expect(await corrigirDataDaParcelaAplicada(db, { ...input, dataFinal: '2026-12-16' })).toBe('nada')
    expect(chamadas.filter((c) => c.table === 'accounts')).toHaveLength(0)
  })

  it('nova data já passou: só a data muda, o saldo fica', async () => {
    const { db, chamadas } = fakeDb([{ amountCents: -9999 }])
    expect(await corrigirDataDaParcelaAplicada(db, { ...input, dataFinal: '2026-10-08' })).toBe('so_a_data')
    expect(chamadas.filter((c) => c.table === 'accounts')).toHaveLength(0)
    const naTransacao = chamadas.filter((c) => c.table === 'transactions')
    expect(naTransacao).toHaveLength(1)
    expect(naTransacao[0].payload).not.toHaveProperty('balanceApplied')
  })
})
