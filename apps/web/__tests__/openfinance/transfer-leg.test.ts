import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTransferLegRow, isOpenFinanceLinkedAccount, buildForecastTransferLegRow, montarPernaDaTransferencia } from '@/lib/openfinance/transfer-leg'

describe('buildTransferLegRow', () => {
  it('inverte o valor e usa a conta de destino, confirmada, sem categoria', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: -50000, date, externalId: 'ext-1', balanceApplied: true },
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

  it('herda balanceApplied: false da origem — perna de destino de transferência agendada não pode creditar o saldo antes da hora', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: -50000, date, externalId: 'ext-1', balanceApplied: false },
      'conta-destino',
      'group-1',
    )

    expect(row.balanceApplied).toBe(false)
  })

  it('descreve a perna como enviada quando ela debita a conta escolhida', () => {
    // Resgate de CDB: o banco credita a conta corrente (+), então a perna vai
    // DEBITAR a conta escolhida — ela é a origem do dinheiro, não o destino.
    // Gravar "Transferência recebida" ali mente na lista de lançamentos.
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: 100000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-cdb', balanceApplied: true },
      'conta-cdb',
      'group-1',
    )

    expect(row.amountCents).toBe(-100000)
    expect(row.description).toBe('Transferência enviada')
  })

  it('descreve a perna como recebida quando ela credita a conta escolhida', () => {
    const row = buildTransferLegRow(
      { orgId: 'org-1', amountCents: -50000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true },
      'conta-destino',
      'group-1',
    )

    expect(row.amountCents).toBe(50000)
    expect(row.description).toBe('Transferência recebida')
  })

  it('externalId derivado é determinístico — mesma origem gera sempre a mesma chave', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    const a = buildTransferLegRow(
      { orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x', balanceApplied: true },
      'conta-1',
      'group-a',
    )
    const b = buildTransferLegRow(
      { orgId: 'org-1', amountCents: 1000, date, externalId: 'ext-x', balanceApplied: true },
      'conta-1',
      'group-b',
    )
    expect(a.externalId).toBe(b.externalId)
  })
})

describe('buildForecastTransferLegRow', () => {
  const source = { orgId: 'org-1', amountCents: -50000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true }

  it('é previsão: nunca aplicada, sufixo próprio, lembra a conta de origem', () => {
    const row = buildForecastTransferLegRow(source, 'conta-origem', 'conta-nubank', 'group-1')
    expect(row).toMatchObject({
      accountId: 'conta-nubank',
      amountCents: 50000,
      type: 'transfer',
      categoryId: null,
      transferGroupId: 'group-1',
      transferAccountId: 'conta-origem',
      externalId: 'ext-1:transfer-par',
      balanceApplied: false,
      reviewState: 'confirmed',
    })
  })
})

describe('montarPernaDaTransferencia', () => {
  const source = { orgId: 'org-1', amountCents: -50000, date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true }

  it('destino Open Finance: perna prevista', () => {
    const row = montarPernaDaTransferencia({ source, sourceAccountId: 'a', otherAccountId: 'b', transferGroupId: 'g', destinoOpenFinance: true })
    expect(row.externalId).toBe('ext-1:transfer-par')
    expect(row.balanceApplied).toBe(false)
  })

  it('destino manual: perna real, como antes', () => {
    const row = montarPernaDaTransferencia({ source, sourceAccountId: 'a', otherAccountId: 'b', transferGroupId: 'g', destinoOpenFinance: false })
    expect(row.externalId).toBe('ext-1:transfer-dest')
    expect(row.balanceApplied).toBe(true)
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
