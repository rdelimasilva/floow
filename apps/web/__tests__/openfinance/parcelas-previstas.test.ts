// apps/web/__tests__/openfinance/parcelas-previstas.test.ts
import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { accounts, transactions } from '@floow/db'
import { acharPrevisao, camposDaOcupacao, dataFinalDaParcela, ocuparPrevisao } from '@/lib/openfinance/parcelas-previstas'

const dialect = new PgDialect()

/**
 * Fake de `db` sem banco: `update(table)` devolve uma cadeia thenable que
 * grava a tabela e o payload de cada `.set()` e resolve em `.returning()`
 * (ou direto no `await`, para o update de conta) com o array configurado.
 * `transaction(fn)` só chama `fn` com o mesmo fake — não há rollback real,
 * mas `ocuparPrevisao` não depende disso para o que os testes cobrem.
 */
function fakeDb(retornoDaPrevisao: { id: string }[]) {
  const chamadas: { table: 'transactions' | 'accounts'; payload: Record<string, unknown> }[] = []

  function chain(table: 'transactions' | 'accounts', resultado: unknown[]): any {
    const c: any = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado).then(resolve),
    }
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
      chain(table === transactions ? 'transactions' : 'accounts', table === transactions ? retornoDaPrevisao : []),
  }
  return { db, chamadas }
}

const paramsDoDelta = (payload: Record<string, unknown>) => dialect.sqlToQuery(payload.balanceCents as never).params

describe('dataFinalDaParcela', () => {
  it('à vista: mantém a data', () => {
    expect(dataFinalDaParcela({ date: '2026-09-12', purchaseDate: null, billPostDate: null, billForecastMonth: '2026-10' }, 16)).toBe('2026-09-12')
  })
  it('parcela sem fatura fechada: usa o dia de vencimento do cartão', () => {
    expect(dataFinalDaParcela({ date: '2027-03-01', purchaseDate: '2026-09-12', billPostDate: null, billForecastMonth: '2027-03' }, 16)).toBe('2027-03-16')
  })
  it('parcela com fatura: vencimento da fatura', () => {
    expect(dataFinalDaParcela({ date: '2026-12-16', purchaseDate: '2026-09-12', billPostDate: '2026-12-16', billForecastMonth: '2026-12' }, 10)).toBe('2026-12-16')
  })
})

describe('camposDaOcupacao', () => {
  const hoje = new Date('2026-10-20T15:00:00Z')

  it('parcela real já vencida ocupa a previsão entrando no saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: 'cat' }, hoje)
    expect(c.balanceApplied).toBe(true)
    expect(c.isInstallmentForecast).toBe(false)
    expect(c.externalId).toBe('polp-3')
    expect(c.date.toISOString().slice(0, 10)).toBe('2026-10-16')
  })

  it('parcela real futura ocupa a previsão fora do saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-4', amountCents: -45916, description: 'AIRBNB 04/06', date: '2026-11-16', categoryId: null }, hoje)
    expect(c.balanceApplied).toBe(false)
    expect('categoryId' in c).toBe(false) // categoria da previsão fica
  })
})

describe('ocuparPrevisao', () => {
  const hoje = new Date('2026-10-20T15:00:00Z')
  const input = { orgId: 'org-1', accountId: 'conta-1', previsaoId: 'previsao-1' }

  it('parcela real já vencida: ocupa a previsão e soma no saldo exatamente uma vez', async () => {
    const { db, chamadas } = fakeDb([{ id: 'previsao-1' }])
    const campos = camposDaOcupacao(
      { externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: null },
      hoje,
    )

    const ocupou = await ocuparPrevisao(db, { ...input, campos, extras: {} })

    expect(ocupou).toBe(true)
    const naConta = chamadas.filter((c) => c.table === 'accounts')
    expect(naConta).toHaveLength(1)
    expect(paramsDoDelta(naConta[0].payload)).toEqual([-45916])
  })

  it('parcela real futura: ocupa a previsão mas não soma no saldo', async () => {
    const { db, chamadas } = fakeDb([{ id: 'previsao-1' }])
    const campos = camposDaOcupacao(
      { externalId: 'polp-4', amountCents: -45916, description: 'AIRBNB 04/06', date: '2026-11-16', categoryId: null },
      hoje,
    )

    const ocupou = await ocuparPrevisao(db, { ...input, campos, extras: {} })

    expect(ocupou).toBe(true)
    expect(chamadas.filter((c) => c.table === 'accounts')).toHaveLength(0)
  })

  it('perdeu a corrida (outro sync já ocupou): returning vazio, não soma e devolve false', async () => {
    const { db, chamadas } = fakeDb([])
    const campos = camposDaOcupacao(
      { externalId: 'polp-5', amountCents: -45916, description: 'AIRBNB 05/06', date: '2026-10-16', categoryId: null },
      hoje,
    )

    const ocupou = await ocuparPrevisao(db, { ...input, campos, extras: {} })

    expect(ocupou).toBe(false)
    expect(chamadas.filter((c) => c.table === 'accounts')).toHaveLength(0)
  })

  it('categoria da real só entra por COALESCE — nunca sobrescreve a da previsão direto', async () => {
    const { db, chamadas } = fakeDb([{ id: 'previsao-1' }])
    const campos = camposDaOcupacao(
      { externalId: 'polp-6', amountCents: -45916, description: 'AIRBNB 06/06', date: '2026-10-16', categoryId: 'cat-real' },
      hoje,
    )

    await ocuparPrevisao(db, { ...input, campos, extras: {} })

    const naTransacao = chamadas.find((c) => c.table === 'transactions')!
    const { sql: sqlGerado, params } = dialect.sqlToQuery(naTransacao.payload.categoryId as never)
    expect(sqlGerado.toLowerCase()).toContain('coalesce')
    expect(params).toEqual(['cat-real'])
  })

  it('sem categoria na real: não mexe na categoria da previsão', async () => {
    const { db, chamadas } = fakeDb([{ id: 'previsao-1' }])
    const campos = camposDaOcupacao(
      { externalId: 'polp-7', amountCents: -45916, description: 'AIRBNB 07/06', date: '2026-10-16', categoryId: null },
      hoje,
    )

    await ocuparPrevisao(db, { ...input, campos, extras: {} })

    const naTransacao = chamadas.find((c) => c.table === 'transactions')!
    expect('categoryId' in naTransacao.payload).toBe(false)
  })
})

describe('acharPrevisao', () => {
  /**
   * Duas compras no mesmo dia, mesmo número de parcelas, valores diferentes:
   * as duas previsões têm a mesma chave. Sem ordenar pelo valor, a parcela
   * real de uma podia ocupar a previsão da outra e trocar os valores.
   */
  it('entre previsões de mesma chave, prefere a de valor mais próximo do real', async () => {
    let ordem: unknown = null
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: (o: unknown) => {
              ordem = o
              return { limit: async () => [{ id: 'previsao-b' }] }
            },
          }),
        }),
      }),
    }

    const id = await acharPrevisao(db, 'org-1', 'conta-1', {
      purchaseDate: '2026-07-27',
      installmentTotal: 2,
      installmentNumber: 2,
      amountCents: -28000,
    })

    expect(id).toBe('previsao-b')
    const { sql: sqlGerado, params } = dialect.sqlToQuery(ordem as never)
    expect(sqlGerado.toLowerCase()).toMatch(/abs\("transactions"\."amount_cents" - \$1\)/)
    expect(params).toEqual([-28000])
  })
})
