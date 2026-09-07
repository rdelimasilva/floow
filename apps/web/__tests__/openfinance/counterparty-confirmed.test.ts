import { describe, it, expect, vi, beforeEach } from 'vitest'

let rows: unknown[] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows),
            }),
          }),
        }),
      }),
    }),
  }
})

import { getConfirmedCounterparties } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  rows = []
})

describe('getConfirmedCounterparties', () => {
  it('transferência confirmada traz o nome da conta de destino, via join', async () => {
    rows = [{
      id: 'cp-1',
      displayName: 'Maraisa Ramos',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      transferAccountName: 'Poupança',
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBe('conta-destino')
    expect(result.transferAccountName).toBe('Poupança')
  })

  it('receita/despesa confirmada não tem conta de destino', async () => {
    rows = [{
      id: 'cp-2',
      displayName: 'Aluguel',
      nature: 'expense',
      categoryId: 'cat-1',
      transferAccountId: null,
      transferAccountName: null,
      confirmedAt: new Date('2026-09-01T00:00:00Z'),
    }]

    const [result] = await getConfirmedCounterparties('org-1')

    expect(result.transferAccountId).toBeNull()
    expect(result.transferAccountName).toBeNull()
  })
})
