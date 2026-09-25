import { describe, it, expect, vi } from 'vitest'
import { fakeTx } from './_fake-tx'

vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: vi.fn(async () => {}) }))
vi.mock('@/lib/openfinance/transfer-leg', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openfinance/transfer-leg')>('@/lib/openfinance/transfer-leg')
  return { ...actual, isOpenFinanceLinkedAccount: vi.fn(async () => false) }
})

import { applyTransferSingle, camposDaRegra, contaQueARegraGrava } from '@/lib/openfinance/aplicar-regra'

describe('contaQueARegraGrava', () => {
  it('transferência comum grava a conta escolhida', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: false })).toBe('c1')
  })
  it('CPF próprio nunca grava conta, mesmo se veio uma', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: true })).toBeNull()
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: true })).toBeNull()
  })
  it('transferência sem conta e sem CPF próprio é recusada', () => {
    expect(() => contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: false }))
      .toThrow('Transferência exige a outra conta')
  })
  it('receita/despesa nunca grava conta', () => {
    expect(contaQueARegraGrava({ nature: 'expense', transferAccountId: null, cpfProprio: false })).toBeNull()
  })
})

describe('applyTransferSingle — origem ignorada (achado 3)', () => {
  const origem = (o: Record<string, unknown> = {}) => ({ id: 'l1', accountId: 'itau', amountCents: 400100, date: '2026-07-08', externalId: 'e', balanceApplied: true, isIgnored: false, ...o })
  const input = { transactionId: 'l1', counterpartyId: 'cp', transferAccountId: 'corretora' }

  it('origem ignorada: a perna nasce ignorada e o saldo da conta nova não muda', async () => {
    const { tx, ops } = fakeTx([[origem({ isIgnored: true })]])
    expect(await applyTransferSingle(tx, 'org-1', input, new Set())).toBe(1)
    const insert = ops.find((o) => o.op === 'insert')!
    expect((insert.values as Record<string, unknown>).isIgnored).toBe(true)
    expect(ops.some((o) => o.table === 'accounts')).toBe(false)
  })

  it('origem não ignorada: perna aplicada move o saldo, como antes', async () => {
    const { tx, ops } = fakeTx([[origem()]])
    await applyTransferSingle(tx, 'org-1', input, new Set())
    const insert = ops.find((o) => o.op === 'insert')!
    expect((insert.values as Record<string, unknown>).isIgnored).toBeUndefined()
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['transactions', 'accounts'])
  })
})

describe('camposDaRegra — o que vai para counterparties (CHECK counterparties_nature_check)', () => {
  const agora = new Date('2026-09-25T00:00:00Z')

  it('regra comum: grava natureza, conta e confirmação', () => {
    expect(camposDaRegra({ nature: 'transfer', categoryId: null, transferAccountId: 'c1', cpfProprio: false }, 'u1', agora)).toEqual({
      nature: 'transfer', categoryId: null, transferAccountId: 'c1', confirmedAt: agora, confirmedBy: 'u1', updatedAt: agora,
    })
  })

  it('CPF próprio como transferência: desfaz a regra em vez de gravar transferência sem conta (o banco recusa)', () => {
    expect(camposDaRegra({ nature: 'transfer', categoryId: null, transferAccountId: null, cpfProprio: true }, 'u1', agora)).toEqual({
      nature: null, categoryId: null, transferAccountId: null, confirmedAt: null, confirmedBy: null, updatedAt: agora,
    })
  })

  it('CPF próprio como receita continua sendo regra normal', () => {
    expect(camposDaRegra({ nature: 'income', categoryId: 'cat', transferAccountId: null, cpfProprio: true }, 'u1', agora)).toMatchObject({
      nature: 'income', categoryId: 'cat', confirmedAt: agora,
    })
  })
})
