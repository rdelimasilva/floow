import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCounterparty, type CounterpartyRecord } from '@/lib/openfinance/resolve-counterparty'

const ORG = 'org-1'
const CONTA = 'conta-1'

function normalizedTx(overrides: Partial<{
  type: 'income' | 'expense' | 'transfer'
  natureConfirmed: boolean
  counterpartyTaxId: string | null
  counterpartyName: string | null
  description: string
  amountCents: number
}> = {}) {
  return {
    externalId: 'ext-1',
    date: '2026-09-01',
    amountCents: -50000,
    type: 'expense' as const,
    natureConfirmed: false,
    counterpartyTaxId: null,
    counterpartyName: null,
    description: 'Débito automático PERS BLACK 12/08',
    categoryRef: null,
    polpType: null,
    payeeMcc: null,
    billPostDate: null,
    billForecastMonth: null,
    installmentNumber: null,
    installmentTotal: null,
    settlement: 'settled' as const,
    foreign: null,
    ...overrides,
  }
}

let inserted: any[] = []
let insertReturns: any[] = []

function makeDb() {
  return {
    insert: vi.fn(() => ({
      values: (v: any) => {
        inserted.push(v)
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve(insertReturns),
          }),
        }
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // sem raça no caminho feliz
        }),
      }),
    })),
  } as any
}

beforeEach(() => {
  inserted = []
  insertReturns = []
})

describe('resolveCounterparty', () => {
  it('Nível 1 confirmado não toca o índice nem o banco', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ natureConfirmed: true, type: 'transfer' })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('confirmed')
    expect(resolved.counterpartyId).toBeNull()
    expect(resolved.categoryId).toBeNull()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('contraparte já confirmada no índice aplica natureza e categoria', async () => {
    const db = makeDb()
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '999' })
    index.set('tax_id 999 out ', {
      id: 'cp-1',
      keyType: 'tax_id',
      keyValue: '999',
      direction: 'out',
      accountId: null,
      nature: 'transfer',
      categoryId: null,
      confirmedAt: new Date(),
    })

    const resolved = await resolveCounterparty(db, ORG, CONTA, tx, index)

    expect(resolved.reviewState).toBe('confirmed')
    expect(resolved.counterpartyId).toBe('cp-1')
    expect(resolved.type).toBe('transfer')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('contraparte nova é criada pendente e some do banco na segunda vez', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-novo', keyType: 'tax_id', keyValue: '111', direction: 'out',
      accountId: null, nature: null, categoryId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()
    const tx = normalizedTx({ counterpartyTaxId: '111' })

    const first = await resolveCounterparty(db, ORG, CONTA, tx, index)
    expect(first.reviewState).toBe('pending')
    expect(first.counterpartyId).toBe('cp-novo')
    expect(first.categoryId).toBeNull()
    expect(db.insert).toHaveBeenCalledTimes(1)

    // Segunda transação, mesma chave: já está no índice local, não insere de novo.
    const second = await resolveCounterparty(db, ORG, CONTA, normalizedTx({ counterpartyTaxId: '111' }), index)
    expect(second.counterpartyId).toBe('cp-novo')
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('sem tax_id, cai para descrição — pendente sem contraparte confirmada', async () => {
    const db = makeDb()
    insertReturns = [{
      id: 'cp-desc', keyType: 'description', keyValue: 'DEBITO AUTOMATICO PERS BLACK',
      direction: 'out', accountId: CONTA, nature: null, categoryId: null, confirmedAt: null,
    }]
    const index = new Map<string, CounterpartyRecord>()

    const resolved = await resolveCounterparty(db, ORG, CONTA, normalizedTx(), index)

    expect(resolved.reviewState).toBe('pending')
    expect(resolved.counterpartyId).toBe('cp-desc')
  })
})
