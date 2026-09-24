import { describe, expect, it } from 'vitest'
import { completarParcelas, linhaDaPrevisao } from '@/lib/openfinance/completar-parcelas'
import type { Db } from '@/lib/openfinance/persist-page'

/**
 * Fake mínimo de `Db` — só o que `completarParcelas` usa: `transaction`,
 * `execute` (o lock), `select().from().where()` (linhas conhecidas) e
 * `insert().values().returning()` (as previsões novas). Registra a ordem das
 * chamadas para provar que o lock vem antes do select, e os valores inseridos
 * para checar o que foi planejado.
 */
function fakeDb(knownRows: unknown[]) {
  const callOrder: string[] = []
  const executedQueries: unknown[] = []
  let insertedValues: Record<string, unknown>[] | null = null

  type FakeTx = {
    execute: (query: unknown) => Promise<void>
    select: (cols: unknown) => { from: (table: unknown) => { where: (cond: unknown) => Promise<unknown[]> } }
    insert: (table: unknown) => {
      values: (values: Record<string, unknown>[]) => { returning: (cols: unknown) => Promise<{ id: string }[]> }
    }
  }

  const tx: FakeTx = {
    execute: async (query) => {
      callOrder.push('execute')
      executedQueries.push(query)
    },
    select: (_cols) => ({
      from: (_table) => ({
        where: async (_cond) => {
          callOrder.push('select')
          return knownRows
        },
      }),
    }),
    insert: (_table) => ({
      values: (values) => ({
        returning: async (_cols) => {
          callOrder.push('insert')
          insertedValues = values
          return values.map((_, i) => ({ id: `id-${i}` }))
        },
      }),
    }),
  }

  const db = {
    transaction: async (fn: (tx: FakeTx) => Promise<number>) => fn(tx),
  }

  return {
    db: db as unknown as Db,
    callOrder,
    executedQueries,
    getInsertedValues: () => insertedValues,
  }
}

/** Extrai o texto cru de um `sql\`...\`` do drizzle, pelos StringChunk de queryChunks. */
function textoDoSql(query: unknown): string {
  const chunks = (query as { queryChunks: { value?: string[] }[] }).queryChunks
  return chunks.map((c) => (c.value ? c.value.join('') : String(c))).join('')
}

describe('linhaDaPrevisao', () => {
  const linha = linhaDaPrevisao(
    { purchaseDate: '2026-07-27', installmentNumber: 3, installmentTotal: 6, amountCents: -45916, date: '2026-10-16', description: 'AIRBNB * HMR5PP9B9', categoryId: 'cat' },
    { orgId: 'org', accountId: 'acc' },
  )

  it('nunca entra no saldo e não parece lançamento do banco', () => {
    expect(linha.balanceApplied).toBe(false)
    expect(linha.externalId).toBeNull()
    expect(linha.recurringTemplateId).toBeNull()
    expect(linha.isInstallmentForecast).toBe(true)
  })

  it('carrega a chave de casamento e o número da parcela na descrição', () => {
    expect(linha.installmentNumber).toBe(3)
    expect(linha.installmentTotal).toBe(6)
    expect((linha.purchaseDate as Date).toISOString().slice(0, 10)).toBe('2026-07-27')
    expect(linha.description).toBe('AIRBNB * HMR5PP9B9 03/06')
    expect(linha.type).toBe('expense')
  })
})

describe('completarParcelas', () => {
  it('trava por conta antes de ler as parcelas conhecidas', async () => {
    const { db, callOrder, executedQueries } = fakeDb([])

    await completarParcelas(db, 'org-1', 'acc-1')

    expect(callOrder[0]).toBe('execute')
    expect(callOrder[1]).toBe('select')
    expect(textoDoSql(executedQueries[0])).toContain('pg_advisory_xact_lock')
    expect(textoDoSql(executedQueries[0])).toContain('completar-parcelas:acc-1')
  })

  it('com as parcelas 1 e 2 de 6 conhecidas, planeja e insere só 3 a 6', async () => {
    const conhecidas = [
      {
        purchaseDate: new Date('2026-07-27T12:00:00Z'),
        installmentNumber: 1,
        installmentTotal: 6,
        amountCents: -45916,
        date: new Date('2026-08-16T12:00:00Z'),
        description: 'AIRBNB * HMR5PP9B9 01/06',
        categoryId: 'cat',
      },
      {
        purchaseDate: new Date('2026-07-27T12:00:00Z'),
        installmentNumber: 2,
        installmentTotal: 6,
        amountCents: -45916,
        date: new Date('2026-09-16T12:00:00Z'),
        description: 'AIRBNB * HMR5PP9B9 02/06',
        categoryId: 'cat',
      },
    ]
    const { db, getInsertedValues } = fakeDb(conhecidas)

    const criadas = await completarParcelas(db, 'org-1', 'acc-1')

    expect(criadas).toBe(4)
    const inseridas = getInsertedValues()!
    expect(inseridas).toHaveLength(4)
    expect(inseridas.map((v) => v.installmentNumber)).toEqual([3, 4, 5, 6])
    for (const v of inseridas) {
      expect(v.installmentTotal).toBe(6)
      expect(v.isInstallmentForecast).toBe(true)
      expect(v.balanceApplied).toBe(false)
      expect(v.externalId).toBeNull()
      expect(v.accountId).toBe('acc-1')
      expect(v.orgId).toBe('org-1')
    }
  })

  it('com as 6 parcelas já conhecidas (reais + previsão), não insere nada', async () => {
    const datas = ['2026-08-16', '2026-09-16', '2026-10-16', '2026-11-16', '2026-12-16', '2027-01-16']
    const conhecidas = datas.map((data, i) => {
      const n = i + 1
      return {
        purchaseDate: new Date('2026-07-27T12:00:00Z'),
        installmentNumber: n,
        installmentTotal: 6,
        amountCents: -45916,
        date: new Date(`${data}T12:00:00Z`),
        description: `AIRBNB * HMR5PP9B9 ${String(n).padStart(2, '0')}/06`,
        categoryId: 'cat',
      }
    })
    const { db, callOrder, getInsertedValues } = fakeDb(conhecidas)

    const criadas = await completarParcelas(db, 'org-1', 'acc-1')

    expect(criadas).toBe(0)
    expect(getInsertedValues()).toBeNull()
    expect(callOrder).not.toContain('insert')
  })
})
