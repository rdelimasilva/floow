import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

const ORG = 'org-1'
const COUNTERPARTY_ID = '11111111-1111-1111-1111-111111111111'
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222'
const TX2_ID = '33333333-3333-3333-3333-333333333333'
const TRANSFER_ACCOUNT_ID = '44444444-4444-4444-4444-444444444444'

interface Op { op: 'select' | 'update' | 'insert'; table: string }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'returning']) chain[m] = () => makeChain(result)
  return chain
}

// `revalidateTransactionData`/`revalidateSnapshotData`/`invalidateTag` chamam
// `revalidateTag` do Next por baixo, que fora de um request real lança
// "Invariant: static generation store missing" — mesmo mock de
// `__tests__/finance/actions.test.ts`, na mesma origem.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => ORG) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
  })),
}))
const insertQueue: unknown[][] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        select: (sel: any) => {
          ops.push({ op: 'select', table: getTableName(sel?.from ?? sel) })
          return { from: (table: any) => { ops[ops.length - 1].table = getTableName(table); return makeChain(selectQueue.shift() ?? []) } }
        },
        update: (table: any) => {
          ops.push({ op: 'update', table: getTableName(table) })
          return makeChain(updateQueue.shift() ?? [])
        },
        insert: (table: any) => {
          ops.push({ op: 'insert', table: getTableName(table) })
          return { values: () => makeChain(insertQueue.shift() ?? []) }
        },
      }),
    }),
  }
})

import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  updateQueue.length = 0
  insertQueue.length = 0
})

describe('confirmCounterparty', () => {
  it('rejeita categoria em transferência', async () => {
    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: CATEGORY_ID,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      }),
    ).rejects.toThrow()
  })

  it('rejeita despesa sem categoria', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: null, transferAccountId: null }),
    ).rejects.toThrow()
  })

  it('atualiza a contraparte e só as transações pendentes dela', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties não retorna nada relevante
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }]) // 2 transações reclassificadas
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org — não destrava o portão

    const result = await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('contraparte de outra org não é encontrada', async () => {
    selectQueue.push([]) // nenhuma linha — a cerca de org bloqueou

    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      }),
    ).rejects.toThrow(/não encontrada/)
  })

  it('zera a última pendência resolvível da org: grava reviewGateClearedAt em orgs', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties
    updateQueue.push([{ id: 'tx-1' }]) // 1 transação reclassificada
    selectQueue.push([]) // nenhuma pendência resolvível restante na org
    updateQueue.push([]) // update de orgs.reviewGateClearedAt

    await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions', 'orgs'])
  })

  it('ainda sobra pendência resolvível na org: não grava reviewGateClearedAt', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties
    updateQueue.push([{ id: 'tx-1' }]) // 1 transação reclassificada
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

    await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
    })

    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('aplica exceção a um lançamento específico, sem virar regra da contraparte', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties (regra do grupo)
    updateQueue.push([{ id: 'tx-1' }]) // lote, excluindo a exceção
    updateQueue.push([{ id: 'tx-2' }]) // update da exceção (tx-2)
    selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

    const result = await confirmCounterparty({
      counterpartyId: COUNTERPARTY_ID,
      nature: 'expense',
      categoryId: CATEGORY_ID,
      transferAccountId: null,
      // Nature diferente da do grupo (expense) só pra provar que a exceção
      // não segue o padrão — 'income', não 'transfer': com conta de destino
      // a exceção de transferência já tem cobertura própria, abaixo, com a
      // fila de mocks certa pro fork de `applyTransferSingle`.
      exceptions: [{ transactionId: TX2_ID, nature: 'income', categoryId: CATEGORY_ID, transferAccountId: null }],
    })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual([
      'counterparties',
      'transactions',
      'transactions',
    ])
  })

  it('rejeita exceção de despesa sem categoria', async () => {
    // Fila completa: se a validação da exceção não bloquear, a chamada
    // sucede normalmente — só rejeita se o schema realmente checar a exceção.
    selectQueue.push([{ id: COUNTERPARTY_ID }])
    updateQueue.push([])
    updateQueue.push([{ id: 'tx-1' }])
    updateQueue.push([{ id: 'tx-2' }])
    selectQueue.push([{ one: 1 }])

    await expect(
      confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
        exceptions: [{ transactionId: TX2_ID, nature: 'expense', categoryId: null, transferAccountId: null }],
      }),
    ).rejects.toThrow()
  })

  describe('transferência com conta de destino', () => {
    it('rejeita transferência sem transferAccountId', async () => {
      await expect(
        confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null, transferAccountId: null }),
      ).rejects.toThrow()
    })

    it('rejeita receita/despesa com transferAccountId preenchido', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow()
    })

    it('destino é conta manual: cria a segunda perna e atualiza o saldo dela', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([]) // update de counterparties
      selectQueue.push([{ id: 'tx-1' }]) // ids pendentes do grupo (applyTransferBatch)
      selectQueue.push([{ // lookup da transação de origem (applyTransferSingle)
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership: conta pertence à org
      selectQueue.push([]) // isOpenFinanceLinkedAccount: sem recurso -> conta manual
      updateQueue.push([]) // update da linha de origem (transferAccountId, transferGroupId)
      insertQueue.push([{ id: 'tx-1-dest' }]) // insert da segunda perna
      updateQueue.push([]) // update do saldo da conta de destino
      selectQueue.push([{ one: 1 }]) // ainda sobra pendência resolvível na org

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['transactions'])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual([
        'counterparties', 'transactions', 'accounts',
      ])
    })

    it('destino é conta Open Finance: só grava o metadado, sem segunda perna', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: 'conta-origem', amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership: conta pertence à org
      selectQueue.push([{ id: 'resource-1' }]) // isOpenFinanceLinkedAccount: achou recurso -> linked
      updateQueue.push([]) // update da linha de origem, sem segunda perna
      selectQueue.push([{ one: 1 }])

      const result = await confirmCounterparty({
        counterpartyId: COUNTERPARTY_ID,
        nature: 'transfer',
        categoryId: null,
        transferAccountId: TRANSFER_ACCOUNT_ID,
      })

      expect(result.reclassified).toBe(1)
      expect(ops.filter((o) => o.op === 'insert')).toEqual([])
      expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
    })

    it('transferência pra si mesma (conta de destino igual à do lançamento) rejeita', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }])
      selectQueue.push([{ id: TRANSFER_ACCOUNT_ID }]) // assertAccountOwnership incondicional em confirmCounterparty
      updateQueue.push([])
      selectQueue.push([{ id: 'tx-1' }])
      selectQueue.push([{
        id: 'tx-1', accountId: TRANSFER_ACCOUNT_ID, amountCents: -50000,
        date: new Date('2026-01-15T12:00:00Z'), externalId: 'ext-1', balanceApplied: true,
      }])

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/mesma conta/)
    })

    it('transferAccountId de outra org rejeita', async () => {
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([]) // assertAccountOwnership incondicional em confirmCounterparty: nenhuma linha -> conta de outra org

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/does not belong|not found/)
    })

    it('sem pendências (fila já zerada) e transferAccountId de outra org: ainda assim rejeita', async () => {
      // Cobre o gap da rodada 2 de revisão: se `applyTransferBatch` não
      // encontrasse nenhum lançamento pendente, o loop nunca chamava
      // `applyTransferSingle` e a checagem de posse nunca rodava —
      // `counterparties.transferAccountId` gravava com uma conta de outra
      // org sem nunca ter sido validada. Aqui a contraparte não tem nenhum
      // lançamento pendente (fila do applyTransferBatch retornaria []), e a
      // checagem incondicional em `confirmCounterparty` precisa rejeitar
      // antes mesmo de chegar lá.
      selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
      selectQueue.push([]) // assertAccountOwnership incondicional: conta de outra org
      selectQueue.push([]) // pending rows do applyTransferBatch (não deveria ser consumido: fila já zerada)

      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'transfer',
          categoryId: null,
          transferAccountId: TRANSFER_ACCOUNT_ID,
        }),
      ).rejects.toThrow(/does not belong|not found/)
    })

    it('exceção com natureza transferência exige sua própria transferAccountId', async () => {
      await expect(
        confirmCounterparty({
          counterpartyId: COUNTERPARTY_ID,
          nature: 'expense',
          categoryId: CATEGORY_ID,
          transferAccountId: null,
          exceptions: [{ transactionId: TX2_ID, nature: 'transfer', categoryId: null, transferAccountId: null }],
        }),
      ).rejects.toThrow()
    })
  })
})
