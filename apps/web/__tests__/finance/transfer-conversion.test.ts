import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * Converter um lançamento existente em transferência pela edição inline.
 *
 * O defeito que estes testes prendem: `updateTransaction` aceitava
 * `type = 'transfer'`, gravava a linha com valor negativo e nunca criava a
 * segunda perna nem `transferGroupId`. O `destAccountId` que o formulário
 * enviava era ignorado — não existia nem no zod. Resultado: o saldo da conta
 * caía sem contrapartida nenhuma, em silêncio.
 *
 * A cerca de posse da conta de destino é o outro ponto: sem ela um id de
 * outra org receberia crédito de saldo cross-tenant, exatamente o que
 * `assertAccountOwnership` impede no `createTransaction`.
 */

interface Op {
  op: 'insert' | 'update'
  table: string
  payload?: Record<string, unknown>
}

const ops: Op[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], current?: Op): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'where', 'limit', 'returning', 'orderBy']) c[m] = () => chain(result, current)
  for (const m of ['values', 'set']) {
    c[m] = (payload: Record<string, unknown>) => {
      if (current) current.payload = payload
      return chain(result, current)
    }
  }
  return c
}

/** As tabelas aqui sao as reais do drizzle (importActual), sem `_table`. */
function tabela(t: unknown): string {
  try {
    return getTableName(t as never)
  } catch {
    return '?'
  }
}

const api = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: (t: unknown) => {
    const op: Op = { op: 'insert', table: tabela(t) }
    ops.push(op)
    return chain([{ id: 'nova-perna' }], op)
  },
  update: (t: unknown) => {
    const op: Op = { op: 'update', table: tabela(t) }
    ops.push(op)
    return chain([], op)
  },
}

const mockDb = {
  ...api,
  transaction: async (fn: (tx: unknown) => unknown) => fn(api),
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

vi.mock('@/lib/finance/queries', () => ({
  getOrgId: () => Promise.resolve('org-1'),
  getCategoryRules: () => Promise.resolve([]),
}))
vi.mock('@/lib/investments/queries', () => ({ getPositions: () => Promise.resolve([]) }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { updateTransaction } = await import('@/lib/finance/actions')

const TX = '44444444-4444-4444-8444-444444444444'
const ORIGEM = '11111111-1111-4111-8111-111111111111'
const DESTINO = '22222222-2222-4222-8222-222222222222'

/** Lançamento existente: despesa de R$ 500 já aplicada no saldo. */
const DESPESA = {
  id: TX,
  orgId: 'org-1',
  accountId: ORIGEM,
  amountCents: -50000,
  balanceApplied: true,
  transferGroupId: null,
  recurringTemplateId: null,
}

function form(extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.append('id', TX)
  fd.append('accountId', ORIGEM)
  fd.append('type', 'transfer')
  fd.append('amountCents', '50000')
  fd.append('description', 'Aplicação na XP')
  fd.append('date', '2026-02-10')
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  return fd
}

function insertsEmTransactions() {
  return ops.filter((o) => o.op === 'insert' && o.table === 'transactions')
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('updateTransaction convertendo em transferência', () => {
  it('cria a segunda perna com valor invertido e o mesmo transferGroupId', async () => {
    selectQueue.push([DESPESA]) // oldTx
    selectQueue.push([{ id: ORIGEM }]) // posse da origem
    selectQueue.push([{ id: DESTINO }]) // posse do destino

    await updateTransaction(form({ destAccountId: DESTINO }))

    const pernas = insertsEmTransactions()
    expect(pernas).toHaveLength(1)

    const perna = pernas[0].payload!
    expect(perna.accountId).toBe(DESTINO)
    expect(perna.amountCents).toBe(50000)
    expect(perna.type).toBe('transfer')
    expect(perna.transferGroupId).toBeTruthy()

    // A linha de origem tem que receber o MESMO grupo, senão o par não casa.
    const origem = ops.find((o) => o.op === 'update' && o.table === 'transactions')!.payload!
    expect(origem.transferGroupId).toBe(perna.transferGroupId)
    expect(origem.amountCents).toBe(-50000)
    // Transferência não tem categoria.
    expect(origem.categoryId).toBeNull()
  })

  it('recusa sem conta de destino, em vez de gravar uma perna só', async () => {
    selectQueue.push([DESPESA])

    await expect(updateTransaction(form())).rejects.toThrow(/destino/i)
    expect(insertsEmTransactions()).toHaveLength(0)
  })

  it('recusa destino igual à origem', async () => {
    selectQueue.push([DESPESA])

    await expect(updateTransaction(form({ destAccountId: ORIGEM }))).rejects.toThrow(/mesma conta/i)
    expect(insertsEmTransactions()).toHaveLength(0)
  })

  it('recusa destino que não é desta org, sem gravar nada', async () => {
    selectQueue.push([DESPESA])
    selectQueue.push([{ id: ORIGEM }]) // posse da origem passa
    selectQueue.push([]) // posse do destino falha

    await expect(updateTransaction(form({ destAccountId: DESTINO }))).rejects.toThrow()
    expect(insertsEmTransactions()).toHaveLength(0)
  })
})
