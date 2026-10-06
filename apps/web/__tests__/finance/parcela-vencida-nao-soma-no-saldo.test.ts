import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * Lançamento recorrente criado com início no passado: a parcela vencida nasce
 * como previsão, igual ao `createRecurringTemplate` (ver
 * `previsao-nao-sensibiliza-saldo.test.ts`).
 *
 * `createRecurringTransactions` ficou para trás naquela correção: gravava
 * `balanceApplied = data <= hoje` e somava a parcela em `accounts.balance_cents`.
 * Em produção, duas recorrências criadas em 23/09 com início em 15/09 puseram
 * R$ 3.799,00 de estimativa no saldo do cartão, sem selo de "não confirmado"
 * e sem nada do banco que as conciliasse.
 */

const selectQueue: unknown[][] = []
const inseridos: { tabela: string; valores: unknown }[] = []
const atualizados: { tabela: string; set: unknown }[] = []

function chain(result: unknown[], registrar?: (m: string, arg: unknown) => void): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'where', 'limit', 'orderBy', 'onConflictDoNothing', 'returning']) {
    c[m] = () => chain(result, registrar)
  }
  for (const m of ['values', 'set']) {
    c[m] = (arg: unknown) => {
      registrar?.(m, arg)
      return chain(result, registrar)
    }
  }
  return c
}

const api = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: (tabela: unknown) =>
    chain([{ id: 'tpl-novo' }], (m, arg) => {
      if (m === 'values') inseridos.push({ tabela: getTableName(tabela as never), valores: arg })
    }),
  update: (tabela: unknown) =>
    chain([], (m, arg) => {
      if (m === 'set') atualizados.push({ tabela: getTableName(tabela as never), set: arg })
    }),
  delete: () => chain([]),
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
vi.mock('@/lib/finance/account-actions', () => ({
  assertAccountOwnership: () => Promise.resolve(),
}))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateAccountData: vi.fn(),
  revalidateTransactionData: vi.fn(),
}))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))

const { createRecurringTransactions } = await import('@/lib/finance/transaction-create-actions')

const CONTA = '11111111-1111-4111-8111-111111111111'
const DESTINO = '22222222-2222-4222-8222-222222222222'

/** Mensal, 12 parcelas, começando em maio de 2026: várias já vencidas. */
function formData(extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('accountId', CONTA)
  fd.set('type', 'expense')
  fd.set('amountCents', '79900')
  fd.set('description', 'Livelo - Compra Milhas')
  fd.set('startDate', '2026-05-15')
  fd.set('frequency', 'monthly')
  fd.set('endMode', 'count')
  fd.set('installmentCount', '12')
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

function parcelasInseridas() {
  return inseridos
    .filter((i) => i.tabela === 'transactions')
    .flatMap((l) => (Array.isArray(l.valores) ? l.valores : [l.valores])) as {
    date: Date
    balanceApplied: boolean
  }[]
}

beforeEach(() => {
  selectQueue.length = 0
  inseridos.length = 0
  atualizados.length = 0
  // Conta(s) ativa(s): origem e, na transferência, destino.
  selectQueue.push([{ isActive: true }], [{ isActive: true }])
})

describe('createRecurringTransactions com início no passado', () => {
  it('a parcela vencida nasce como previsão', async () => {
    await createRecurringTransactions(formData())

    const vencidas = parcelasInseridas().filter((p) => new Date(p.date) <= new Date())
    expect(vencidas.length).toBeGreaterThan(0)
    for (const p of vencidas) expect(p.balanceApplied).toBe(false)
  })

  it('não mexe no saldo da conta', async () => {
    await createRecurringTransactions(formData())

    expect(atualizados.filter((u) => u.tabela === 'accounts')).toEqual([])
  })

  it('transferência recorrente: nenhuma perna vencida soma, nenhuma conta muda', async () => {
    await createRecurringTransactions(formData({ type: 'transfer', destinationAccountId: DESTINO }))

    const vencidas = parcelasInseridas().filter((p) => new Date(p.date) <= new Date())
    expect(vencidas.length).toBeGreaterThan(0)
    for (const p of vencidas) expect(p.balanceApplied).toBe(false)
    expect(atualizados.filter((u) => u.tabela === 'accounts')).toEqual([])
  })
})
