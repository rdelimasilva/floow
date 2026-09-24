import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * Editar e ignorar só mexem no saldo de linha que está (ou deve estar) nele.
 *
 * Os defeitos que estes testes prendem:
 *  - `updateTransaction` aplicava no saldo qualquer linha sem template: a
 *    previsão de parcela (`is_installment_forecast`) entrava no saldo ao ser
 *    editada, e a parcela futura do banco (`external_id`, `balance_applied =
 *    false`) entrava antes do vencimento, somando um valor que ainda não
 *    aconteceu.
 *  - `toggleIgnoreTransaction` movia o saldo em ±valor sem olhar
 *    `balance_applied`: ignorar uma parcela futura tirava do saldo um valor
 *    que nunca tinha entrado nele.
 */

interface Op {
  op: 'insert' | 'update'
  table: string
  payload?: Record<string, unknown>
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
const dialect = new PgDialect()

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
    return chain([{ id: 'nova' }], op)
  },
  update: (t: unknown) => {
    const op: Op = { op: 'update', table: tabela(t) }
    ops.push(op)
    return chain([], op)
  },
}

const mockDb = { ...api, transaction: async (fn: (tx: unknown) => unknown) => fn(api) }

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

const { updateTransaction, toggleIgnoreTransaction } = await import('@/lib/finance/actions')

const TX = '44444444-4444-4444-8444-444444444444'
const CONTA = '11111111-1111-4111-8111-111111111111'

const LINHA = {
  id: TX,
  orgId: 'org-1',
  accountId: CONTA,
  amountCents: -45916,
  balanceApplied: true,
  isIgnored: false,
  transferGroupId: null,
  recurringTemplateId: null,
  isInstallmentForecast: false,
  externalId: null as string | null,
}

function formEdicao(date: string) {
  const fd = new FormData()
  fd.append('id', TX)
  fd.append('accountId', CONTA)
  fd.append('type', 'expense')
  fd.append('amountCents', '50000')
  fd.append('description', 'AIRBNB 04/06')
  fd.append('date', date)
  return fd
}

const updatesEmContas = () => ops.filter((o) => o.op === 'update' && o.table === 'accounts')
const updateDaLinha = () => ops.find((o) => o.op === 'update' && o.table === 'transactions')!.payload!
const deltaDe = (o: Op) => dialect.sqlToQuery(o.payload!.balanceCents as never).params

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

async function editar(linha: typeof LINHA, date: string) {
  selectQueue.push([linha]) // oldTx
  selectQueue.push([{ id: CONTA }]) // posse da conta
  await updateTransaction(formEdicao(date))
}

describe('updateTransaction e o saldo', () => {
  it('previsão de parcela editada para data passada continua fora do saldo', async () => {
    await editar({ ...LINHA, isInstallmentForecast: true, balanceApplied: false }, '2026-01-10')

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha().balanceApplied).toBe(false)
  })

  it('parcela futura do banco editada para data futura continua fora do saldo', async () => {
    await editar({ ...LINHA, externalId: 'polp-4', balanceApplied: false }, '2099-01-10')

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha().balanceApplied).toBe(false)
  })

  it('parcela futura do banco editada para data que já chegou entra no saldo uma vez', async () => {
    await editar({ ...LINHA, externalId: 'polp-4', balanceApplied: false }, '2026-01-10')

    const contas = updatesEmContas()
    expect(contas).toHaveLength(1)
    expect(deltaDe(contas[0])).toEqual([-50000])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })

  it('lançamento do banco já aplicado: desfaz o valor antigo e aplica o novo (sem mudança)', async () => {
    await editar({ ...LINHA, externalId: 'polp-1', balanceApplied: true }, '2099-01-10')

    const contas = updatesEmContas()
    expect(contas.map(deltaDe)).toEqual([[45916], [-50000]])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })

  it('lançamento manual continua entrando no saldo mesmo com data futura (sem mudança)', async () => {
    await editar(LINHA, '2099-01-10')

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916], [-50000]])
    expect(updateDaLinha().balanceApplied).toBe(true)
  })
})

function formIgnorar() {
  const fd = new FormData()
  fd.append('id', TX)
  return fd
}

describe('toggleIgnoreTransaction e o saldo', () => {
  it('ignorar linha fora do saldo só marca, sem tirar do saldo o que nunca entrou', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-4', balanceApplied: false }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha()).toEqual({ isIgnored: true })
  })

  it('restaurar linha fora do saldo só desmarca — quem aplica é o vencimento', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-4', balanceApplied: false, isIgnored: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas()).toEqual([])
    expect(updateDaLinha()).toEqual({ isIgnored: false })
  })

  it('ignorar linha aplicada tira o valor do saldo', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-1', balanceApplied: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas().map(deltaDe)).toEqual([[45916]])
  })

  it('restaurar linha aplicada devolve o valor ao saldo', async () => {
    selectQueue.push([{ ...LINHA, externalId: 'polp-1', balanceApplied: true, isIgnored: true }])

    await toggleIgnoreTransaction(formIgnorar())

    expect(updatesEmContas().map(deltaDe)).toEqual([[-45916]])
  })
})
