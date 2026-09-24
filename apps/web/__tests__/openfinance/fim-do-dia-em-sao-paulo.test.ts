import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { persistPage, type Db } from '@/lib/openfinance/persist-page'
import { camposDaOcupacao } from '@/lib/openfinance/parcelas-previstas'
import type { ResolvedTransaction } from '@/lib/openfinance/resolve-counterparty'

/**
 * "Já venceu" é o fim do dia em São Paulo, não no fuso do servidor.
 *
 * O servidor roda em UTC. Às 22h de 20/10 em São Paulo já é 21/10 em UTC, e
 * o `setHours(23, 59, 59, 999)` local dava a parcela de 21/10 como vencida —
 * dentro do saldo um dia antes. Este arquivo roda com o processo em UTC.
 */
const TZ_ORIGINAL = process.env.TZ
/** 20/10 às 22h em São Paulo; 21/10 à 01h em UTC. */
const AGORA = new Date('2026-10-21T01:00:00Z')

beforeAll(() => {
  process.env.TZ = 'UTC'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
})

afterAll(() => {
  vi.useRealTimers()
  process.env.TZ = TZ_ORIGINAL
})

describe('camposDaOcupacao em UTC', () => {
  it('parcela de amanhã em São Paulo não entra no saldo', () => {
    const c = camposDaOcupacao(
      { externalId: 'polp-4', amountCents: -45916, description: 'AIRBNB 04/06', date: '2026-10-21', categoryId: null },
      AGORA,
    )
    expect(c.balanceApplied).toBe(false)
  })

  it('parcela de hoje em São Paulo entra', () => {
    const c = camposDaOcupacao(
      { externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-20', categoryId: null },
      AGORA,
    )
    expect(c.balanceApplied).toBe(true)
  })
})

/** Fake de `Db` só com o caminho de insert de `persistPage`. */
function fakeDb() {
  const inseridas: Record<string, unknown>[] = []
  const deltas: unknown[] = []

  const vazio = { from: () => ({ where: async () => [] }) }
  const dbTx = {
    insert: () => ({
      values: (v: Record<string, unknown>[]) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            inseridas.push(...v)
            return v.map((row, i) => ({ id: `id-${i}`, amountCents: row.amountCents, applied: row.balanceApplied }))
          },
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => ({
        where: async () => {
          deltas.push(payload)
        },
      }),
    }),
  }
  const db = { select: () => vazio, transaction: async (fn: (tx: unknown) => unknown) => fn(dbTx) }
  return { db: db as unknown as Db, inseridas, deltas }
}

function lancamento(date: string): ResolvedTransaction {
  return {
    externalId: `polp-${date}`,
    type: 'expense',
    amountCents: -45916,
    description: 'Compra',
    date,
    purchaseDate: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    categoryRef: null,
    polpType: null,
    payeeMcc: null,
    settlement: 'posted',
    reviewState: 'pending',
    counterpartyId: null,
    counterpartyTaxId: null,
    counterpartyName: null,
    categoryId: null,
    transferAccountId: null,
  } as unknown as ResolvedTransaction
}

describe('persistPage em UTC', () => {
  it('lançamento de amanhã em São Paulo entra fora do saldo', async () => {
    const { db, inseridas, deltas } = fakeDb()

    await persistPage(db, {
      orgId: 'org-1',
      accountId: 'acc-1',
      normalized: [lancamento('2026-10-21')],
      categoryByRef: new Map(),
      rules: [],
    })

    expect(inseridas[0].balanceApplied).toBe(false)
    expect(deltas).toEqual([])
  })

  it('lançamento de hoje em São Paulo entra no saldo', async () => {
    const { db, inseridas, deltas } = fakeDb()

    await persistPage(db, {
      orgId: 'org-1',
      accountId: 'acc-1',
      normalized: [lancamento('2026-10-20')],
      categoryByRef: new Map(),
      rules: [],
    })

    expect(inseridas[0].balanceApplied).toBe(true)
    expect(deltas).toHaveLength(1)
  })
})
