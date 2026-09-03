import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * A ação de natureza reescreve doze meses de histórico. A coisa que não pode
 * acontecer nunca é mexer no saldo: `type` e `balance_cents` são independentes,
 * e um `UPDATE` na tabela `accounts` aqui significaria que alguém confundiu os
 * dois.
 *
 * As outras duas garantias — não tocar lançamento manual, não tocar perna de
 * transferência pareada — vivem na cláusula WHERE, que este mock não consegue
 * inspecionar. São verificadas contra o banco no Step 6.
 */

interface Op {
  op: 'select' | 'insert' | 'update'
  table: string
}

const ops: Op[] = []
const insertQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy', 'innerJoin']) {
    chain[m] = () => makeChain(result)
  }
  return chain
}

const mockDb = {
  select: () => {
    ops.push({ op: 'select', table: '?' })
    return makeChain([])
  },
  insert: (t: never) => {
    ops.push({ op: 'insert', table: getTableName(t) })
    return makeChain(insertQueue.shift() ?? [{ id: 'regra-1' }])
  },
  update: (t: never) => {
    ops.push({ op: 'update', table: getTableName(t) })
    return makeChain(updateQueue.shift() ?? [{ id: 'tx-1' }])
  },
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: () => {},
  revalidateSnapshotData: () => {},
}))
vi.mock('@/lib/cache-tags', () => ({ invalidateTag: () => {}, accountsTag: () => 'accounts' }))

beforeEach(() => {
  ops.length = 0
  insertQueue.length = 0
  updateQueue.length = 0
})

describe('createNatureRule', () => {
  it('nunca toca a tabela accounts: natureza não move saldo', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await createNatureRule({
      accountId: 'conta-1',
      matchValue: 'DEBITO AUTOMATICO PERS BLACK',
      nature: 'transfer',
    })

    expect(ops.filter((o) => o.table === 'accounts')).toEqual([])
  })

  it('grava a regra e devolve quantas linhas reclassificou', async () => {
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }, { id: 'tx-3' }])
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    const result = await createNatureRule({
      accountId: 'conta-1',
      matchValue: 'APLICACAO CDB DI',
      nature: 'transfer',
    })

    expect(ops.some((o) => o.op === 'insert' && o.table === 'transaction_nature_rules')).toBe(true)
    expect(result.reclassified).toBe(3)
  })

  it('rejeita match_value vazio: casaria com o extrato inteiro', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await expect(
      createNatureRule({ accountId: 'conta-1', matchValue: '   ', nature: 'transfer' }),
    ).rejects.toThrow()
  })

  it('rejeita natureza fora do enum', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await expect(
      createNatureRule({ accountId: 'conta-1', matchValue: 'X', nature: 'outra' as never }),
    ).rejects.toThrow()
  })
})
