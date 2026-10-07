import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Conta conectada ao banco não aceita "Ajustar saldo".
 *
 * Os lançamentos vêm do extrato; se eles estão certos, o saldo bate. O ajuste
 * é um valor congelado: todo lançamento que o Open Finance traz depois, com
 * data anterior ao ajuste, passa a contar duas vezes. Foi assim que o Itaú
 * ficou R$ 159,99 abaixo do banco (TIM de 22/09 chegou em 27/09, depois do
 * ajuste do dia 22). Divergência numa conta conectada é lançamento errado a
 * achar, não saldo a forçar.
 */

const inseridos: unknown[] = []
const atualizados: unknown[] = []
let conectada = false

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([{ balanceCents: 100_000, orgId: 'org-1' }]) }),
    }),
  }),
  transaction: async (fn: (tx: unknown) => Promise<void>) =>
    fn({
      insert: () => ({ values: (v: unknown) => { inseridos.push(v); return Promise.resolve() } }),
      update: () => ({ set: (v: unknown) => { atualizados.push(v); return { where: () => Promise.resolve() } } }),
    }),
}

vi.mock('@floow/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@floow/db')>()),
  getDb: () => mockDb,
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/investments/queries', () => ({ getPositions: vi.fn() }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateTransactionData: vi.fn(),
}))
vi.mock('@/lib/openfinance/transfer-leg', () => ({
  isOpenFinanceLinkedAccount: () => Promise.resolve(conectada),
}))

const { adjustAccountBalance } = await import('@/lib/finance/account-actions')

function form() {
  const f = new FormData()
  f.set('accountId', 'conta-1')
  f.set('newBalanceCents', '250000')
  return f
}

beforeEach(() => {
  inseridos.length = 0
  atualizados.length = 0
})

describe('adjustAccountBalance em conta conectada ao banco', () => {
  it('recusa com mensagem e não grava nada', async () => {
    conectada = true

    const r = await adjustAccountBalance(form())

    expect(r).toMatchObject({ adjusted: false })
    expect('error' in r && r.error).toMatch(/conectada ao banco/i)
    expect(inseridos).toEqual([])
    expect(atualizados).toEqual([])
  })

  it('conta manual continua aceitando o ajuste', async () => {
    conectada = false

    const r = await adjustAccountBalance(form())

    expect(r).toMatchObject({ adjusted: true })
    expect(inseridos).toHaveLength(1)
  })
})
