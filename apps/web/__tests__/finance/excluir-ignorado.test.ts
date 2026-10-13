import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { fakeTx, type FakeOp } from '../openfinance/_fake-tx'
import { TIPO_PELO_SINAL } from '@/lib/finance/conciliacao/desfazer-absorcao'

/**
 * Lançamento ignorado já saiu do saldo quando foi marcado
 * (`toggleIgnoreTransaction`). Excluí-lo não pode estornar de novo: em
 * 13/10 o par do pagamento de setembro do Master Black foi excluído com a
 * perna do cartão ignorada, e o cartão perdeu R$ 11.685,40 que nunca tinha.
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

const { deleteTransaction, bulkDeleteTransactions } = await import('@/lib/finance/transaction-actions')

const dialect = new PgDialect()
const paramsDo = (o: FakeOp) => dialect.sqlToQuery(o.where as SQL).params
const DEVOLUCAO_DA_PERNA = { type: TIPO_PELO_SINAL, reviewState: 'pending', transferAccountId: null }
const form = (id: string) => { const fd = new FormData(); fd.append('id', id); return fd }

const ORIGEM_ITAU = {
  id: 'itau', accountId: 'itau', amountCents: -1168540, transferGroupId: 'g1', balanceApplied: true, isIgnored: false,
  externalId: 'polp-itau', origem: 'extrato', aguardaExtrato: false, matchedTransactionId: null,
}
const PERNA_IGNORADA = {
  id: 'perna', accountId: 'master', amountCents: 1168540, transferGroupId: 'g1', balanceApplied: true, isIgnored: true,
  externalId: null, origem: 'perna', aguardaExtrato: false, matchedTransactionId: null,
}
const estornos = () => atual.ops.filter((o) => o.table === 'accounts')

beforeEach(() => { atual = fakeTx([]) })

describe('excluir lançamento ignorado', () => {
  it('par com uma perna ignorada: só a outra perna é estornada', async () => {
    atual = fakeTx([[ORIGEM_ITAU], [ORIGEM_ITAU, PERNA_IGNORADA]])
    await deleteTransaction(form('itau'))
    expect(estornos()).toHaveLength(1)
    expect(dialect.sqlToQuery(estornos()[0].where as SQL).params).toContain('itau')
  })

  it('lançamento avulso ignorado: nada a estornar', async () => {
    atual = fakeTx([[{ ...PERNA_IGNORADA, transferGroupId: null }]])
    await deleteTransaction(form('perna'))
    expect(estornos()).toHaveLength(0)
  })

  it('em lote, par com perna ignorada: só a outra perna', async () => {
    atual = fakeTx([[ORIGEM_ITAU], [ORIGEM_ITAU, PERNA_IGNORADA]])
    await bulkDeleteTransactions(['itau'])
    expect(estornos()).toHaveLength(1)
  })

  it('em lote, avulso ignorado: nada a estornar', async () => {
    atual = fakeTx([[{ ...PERNA_IGNORADA, transferGroupId: null }]])
    await bulkDeleteTransactions(['perna'])
    expect(estornos()).toHaveLength(0)
  })
})
