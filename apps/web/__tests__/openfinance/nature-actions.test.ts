import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * A ação de natureza reescreve doze meses de histórico. A coisa que não pode
 * acontecer nunca é mexer no saldo: `type` e `balance_cents` são independentes,
 * e um `UPDATE` na tabela `accounts` aqui significaria que alguém confundiu os
 * dois.
 *
 * A garantia de que a conta pertence à org é verificada aqui, via
 * `selectQueue` (rodada de correção 1, Importante 3). As outras duas — não
 * tocar lançamento manual, não tocar perna de transferência pareada — vivem na
 * cláusula WHERE, que este mock não consegue inspecionar. São verificadas
 * contra o banco no Step 6.
 */

/** UUID de verdade: `accountId` é validado na borda (`z.string().uuid()`). */
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'

interface Op {
  op: 'select' | 'insert' | 'update'
  table: string
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
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

// `any`: o mock precisa se referenciar dentro de `transaction` (o callback
// recebe o mesmo db), e anotar o tipo de retorno explicitamente aqui só para
// satisfazer TS7023 não vale o ruído — não é o formato de `getDb()` mesmo.
const mockDb: any = {
  select: () => {
    ops.push({ op: 'select', table: '?' })
    // Default: a conta existe e pertence à org — é o caminho feliz que a
    // maioria dos testes exercita. Quem quiser testar "conta de outra org"
    // empilha `[]` em `selectQueue` antes de chamar a action.
    return makeChain(selectQueue.shift() ?? [{ id: ACCOUNT_ID }])
  },
  insert: (t: never) => {
    ops.push({ op: 'insert', table: getTableName(t) })
    return makeChain(insertQueue.shift() ?? [{ id: 'regra-1' }])
  },
  update: (t: never) => {
    ops.push({ op: 'update', table: getTableName(t) })
    return makeChain(updateQueue.shift() ?? [{ id: 'tx-1' }])
  },
  // `createNatureRule` grava a regra e reclassifica dentro de uma transação
  // (Importante 2): o mock não simula rollback, só precisa repassar o mesmo
  // db para dentro do callback.
  transaction: async (fn: (tx: typeof mockDb) => unknown) => fn(mockDb),
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
  selectQueue.length = 0
  insertQueue.length = 0
  updateQueue.length = 0
})

describe('createNatureRule', () => {
  it('nunca toca a tabela accounts: natureza não move saldo', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await createNatureRule({
      accountId: ACCOUNT_ID,
      matchValue: 'DEBITO AUTOMATICO PERS BLACK',
      nature: 'transfer',
    })

    expect(ops.filter((o) => o.op !== 'select' && o.table === 'accounts')).toEqual([])
  })

  it('grava a regra e devolve quantas linhas reclassificou', async () => {
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }, { id: 'tx-3' }])
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    const result = await createNatureRule({
      accountId: ACCOUNT_ID,
      matchValue: 'APLICACAO CDB DI',
      nature: 'transfer',
    })

    expect(ops.some((o) => o.op === 'insert' && o.table === 'transaction_nature_rules')).toBe(true)
    expect(result.reclassified).toBe(3)
  })

  it('rejeita quando a conta não pertence à org: FK garante existência, não posse', async () => {
    // Importante 3 da rodada 1: sem esta checagem, o sucesso do insert vira
    // oráculo de existência de UUID de conta de qualquer org.
    selectQueue.push([]) // assertAccountOwnership não acha a conta nesta org
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    await expect(
      createNatureRule({
        accountId: ACCOUNT_ID,
        matchValue: 'APLICACAO CDB DI',
        nature: 'transfer',
      }),
    ).rejects.toThrow(/não encontrada|not found/i)

    expect(ops.some((o) => o.op === 'insert')).toBe(false)
    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('rejeita match_value vazio: casaria com o extrato inteiro', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    // toMatchObject em vez de toThrow() sem argumento: prova que é a
    // validação de `matchValue` que rejeita, e não um TypeError qualquer
    // vindo do mock (Importante 4).
    await expect(
      createNatureRule({ accountId: ACCOUNT_ID, matchValue: '   ', nature: 'transfer' }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['matchValue'] })],
    })
  })

  it('rejeita natureza fora do enum', async () => {
    const { createNatureRule } = await import('@/lib/openfinance/nature-actions')

    // matchValue válido de propósito: com 'X' (Importante 4), o teste passava
    // mesmo se a validação de `nature` fosse apagada por inteiro, porque
    // `matchValue` já falharia sozinho antes de chegar ao enum.
    await expect(
      createNatureRule({
        accountId: ACCOUNT_ID,
        matchValue: 'DESCRICAO VALIDA',
        nature: 'outra' as never,
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['nature'] })],
    })
  })
})
