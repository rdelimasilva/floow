import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Vincular recurso a conta é onde o dinheiro escolhe endereço. Dois erros aqui
 * produzem número errado sem nada acusar: cartão pendurado numa conta de caixa
 * (fatura virando saída de dinheiro que não saiu) e duas contas do banco na
 * mesma conta local (dois extratos somando no mesmo saldo).
 */

interface Op {
  op: 'select' | 'insert' | 'update'
  table: string
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy']) {
    chain[m] = () => makeChain(result)
  }
  return chain
}

const mockDb = {
  select: () => {
    ops.push({ op: 'select', table: '?' })
    return makeChain(selectQueue.shift() ?? [])
  },
  insert: (t: { _table: string }) => {
    ops.push({ op: 'insert', table: t._table })
    return makeChain(insertQueue.shift() ?? [])
  },
  update: (t: { _table: string }) => {
    ops.push({ op: 'update', table: t._table })
    return makeChain([])
  },
}

vi.mock('@floow/db', () => ({
  getDb: () => mockDb,
  accounts: { _table: 'accounts' },
  openfinanceResources: { _table: 'openfinance_resources' },
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/cache-tags', () => ({
  accountsTag: (o: string) => `accounts:${o}`,
  invalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { linkResourceToAccount } = await import('@/lib/openfinance/resource-actions')

const CARTAO = { id: 'res-card', orgId: 'org-1', resourceType: 'CREDIT_CARD_ACCOUNT', accountId: null }
const CONTA = { id: 'res-acc', orgId: 'org-1', resourceType: 'ACCOUNT', accountId: null }

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  insertQueue.length = 0
})

describe('linkResourceToAccount — compatibilidade de tipo', () => {
  it('recusa cartão de crédito vinculado a conta corrente', async () => {
    // A tela já filtra, mas server action é endpoint: a validação tem de estar
    // aqui também, senão a fatura entra como saída do saldo de caixa.
    selectQueue.push([CARTAO])
    selectQueue.push([{ id: 'acc-1', type: 'checking' }])

    await expect(
      linkResourceToAccount('res-card', { kind: 'existing', accountId: 'acc-1' }),
    ).rejects.toThrow(/cartão/i)

    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('aceita cartão de crédito em conta do tipo cartão', async () => {
    selectQueue.push([CARTAO])
    selectQueue.push([{ id: 'acc-cc', type: 'credit_card' }])
    selectQueue.push([]) // nenhum outro recurso usa a conta

    await linkResourceToAccount('res-card', { kind: 'existing', accountId: 'acc-cc' })

    expect(ops.some((o) => o.op === 'update' && o.table === 'openfinance_resources')).toBe(true)
  })

  it('aceita conta bancária em poupança', async () => {
    selectQueue.push([CONTA])
    selectQueue.push([{ id: 'acc-sav', type: 'savings' }])
    selectQueue.push([])

    await linkResourceToAccount('res-acc', { kind: 'existing', accountId: 'acc-sav' })

    expect(ops.some((o) => o.op === 'update' && o.table === 'openfinance_resources')).toBe(true)
  })

  it('recusa conta bancária vinculada a conta de cartão', async () => {
    selectQueue.push([CONTA])
    selectQueue.push([{ id: 'acc-cc', type: 'credit_card' }])

    await expect(
      linkResourceToAccount('res-acc', { kind: 'existing', accountId: 'acc-cc' }),
    ).rejects.toThrow()

    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })
})

describe('linkResourceToAccount — uma conta, um recurso', () => {
  it('recusa quando a conta já espelha outro recurso', async () => {
    // Dois extratos na mesma conta somam saldo de contas distintas, e o dedupe
    // por (external_id, account_id) não pega: os ids da Polp são diferentes.
    selectQueue.push([CONTA])
    selectQueue.push([{ id: 'acc-1', type: 'checking' }])
    selectQueue.push([{ id: 'outro-recurso' }])

    await expect(
      linkResourceToAccount('res-acc', { kind: 'existing', accountId: 'acc-1' }),
    ).rejects.toThrow(/já está vinculada/i)

    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('não recusa quando o recurso ocupando a conta é ele mesmo', async () => {
    // Revincular o mesmo recurso à mesma conta é idempotente, não conflito.
    selectQueue.push([{ ...CONTA, accountId: 'acc-1' }])
    selectQueue.push([{ id: 'acc-1', type: 'checking' }])
    selectQueue.push([]) // a consulta exclui o próprio recurso

    await linkResourceToAccount('res-acc', { kind: 'existing', accountId: 'acc-1' })

    expect(ops.some((o) => o.op === 'update' && o.table === 'openfinance_resources')).toBe(true)
  })
})
