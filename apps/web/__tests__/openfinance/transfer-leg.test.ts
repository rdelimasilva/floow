import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTransferLegRow, isOpenFinanceLinkedAccount } from '@/lib/openfinance/transfer-leg'

describe('buildTransferLegRow', () => {
  it('inverte o valor e usa a conta de destino, confirmada, sem categoria', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: -50000, date, externalId: 'ext-1' },
      'conta-destino',
      'group-1',
    )

    expect(row).toMatchObject({
      orgId: 'org-1',
      accountId: 'conta-destino',
      categoryId: null,
      type: 'transfer',
      amountCents: 50000,
      date,
      transferGroupId: 'group-1',
      externalId: 'ext-1:transfer-dest',
      balanceApplied: true,
      reviewState: 'confirmed',
    })
  })

  it('externalId derivado é determinístico — mesma origem gera sempre a mesma chave', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const a = buildTransferLegRow({ orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x' }, 'conta-1', 'group-a')
    const b = buildTransferLegRow({ orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x' }, 'conta-1', 'group-b')
    expect(a.externalId).toBe(b.externalId)
  })
})

describe('isOpenFinanceLinkedAccount', () => {
  function makeDb(rows: unknown[]) {
    return {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(rows),
          }),
        }),
      })),
    } as any
  }

  it('verdadeiro quando a conta tem um recurso Open Finance vinculado', async () => {
    const db = makeDb([{ id: 'resource-1' }])
    const linked = await isOpenFinanceLinkedAccount(db, 'org-1', 'conta-1')
    expect(linked).toBe(true)
  })

  it('falso quando não há recurso vinculado (conta manual)', async () => {
    const db = makeDb([])
    const linked = await isOpenFinanceLinkedAccount(db, 'org-1', 'conta-1')
    expect(linked).toBe(false)
  })
})
