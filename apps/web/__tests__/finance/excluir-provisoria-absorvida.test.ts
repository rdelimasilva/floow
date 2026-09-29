import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { fakeTx, type FakeOp } from '../openfinance/_fake-tx'

/**
 * Excluir a provisória que o extrato absorveu desfaz o efeito da absorção:
 * sem a perna (e a origem, que sai junto no grupo), o extrato não pode
 * continuar como transferência para uma conta cujo par não existe mais.
 * Manual/arquivo: volta a pendente de revisão mantendo a categoria (P10).
 */

let atual: ReturnType<typeof fakeTx>
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({ ...atual.tx, transaction: async (fn: (t: unknown) => unknown) => fn(atual.tx) }) }
})
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1'), getCategoryRules: () => Promise.resolve([]) }))
vi.mock('@/lib/investments/queries', () => ({ getPositions: () => Promise.resolve([]) }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { deleteTransaction } = await import('@/lib/finance/transaction-actions')

const dialect = new PgDialect()
const paramsDo = (o: FakeOp) => dialect.sqlToQuery(o.where as SQL).params
const form = (id: string) => { const fd = new FormData(); fd.append('id', id); return fd }

const ORIGEM_ITAU = {
  id: 'itau-1', accountId: 'itau', amountCents: -20000, transferGroupId: 'g1', balanceApplied: true,
  externalId: 'pluggy-itau-1', origem: 'extrato', aguardaExtrato: false, matchedTransactionId: null,
}
const PERNA_ABSORVIDA = {
  id: 'perna-18', accountId: 'nubank', amountCents: 20000, transferGroupId: 'g1', balanceApplied: false,
  externalId: 'pluggy-itau-1:transfer-dest', origem: 'perna', aguardaExtrato: true, matchedTransactionId: 'ext-18',
}

beforeEach(() => { atual = fakeTx([]) })

describe('deleteTransaction — provisória absorvida', () => {
  it('excluir a transferência cuja perna foi absorvida devolve o extrato a Classificar', async () => {
    atual = fakeTx([[ORIGEM_ITAU], [ORIGEM_ITAU, PERNA_ABSORVIDA]])
    await deleteTransaction(form('itau-1'))
    const devolucao = atual.ops.find((o) => o.op === 'update' && o.table === 'transactions')
    expect(devolucao?.set).toEqual({ reviewState: 'pending', transferAccountId: null })
    expect(paramsDo(devolucao!)).toContain('ext-18')
    // Só a origem estava no saldo; a perna aguardando nunca esteve.
    expect(atual.ops.filter((o) => o.table === 'accounts')).toHaveLength(1)
  })

  it('excluir o lançamento manual absorvido devolve o extrato a pendente', async () => {
    const manual = { id: 'm', accountId: 'nubank', amountCents: -500, transferGroupId: null, balanceApplied: false, externalId: null, origem: 'manual', aguardaExtrato: true, matchedTransactionId: 'ext' }
    atual = fakeTx([[manual]])
    await deleteTransaction(form('m'))
    const devolucao = atual.ops.find((o) => o.op === 'update' && o.table === 'transactions')
    expect(devolucao?.set).toEqual({ reviewState: 'pending' })
    expect(paramsDo(devolucao!)).toContain('ext')
    expect(atual.ops.some((o) => o.table === 'accounts')).toBe(false)
  })

  it('lançamento comum: nenhuma devolução', async () => {
    atual = fakeTx([[{ ...ORIGEM_ITAU, transferGroupId: null }]])
    await deleteTransaction(form('itau-1'))
    expect(atual.ops.some((o) => o.op === 'update' && o.table === 'transactions')).toBe(false)
  })
})
