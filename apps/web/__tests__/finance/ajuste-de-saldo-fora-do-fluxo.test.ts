import { describe, it, expect, vi } from 'vitest'

/**
 * Um "Ajuste de saldo" de −R$ 140 mil no Nubank apareceu como despesa de
 * setembro no fluxo de caixa. Ajuste acerta o saldo da conta; não é dinheiro
 * entrando nem saindo, então nasce fora do fluxo.
 */

const inseridos: Record<string, unknown>[] = []

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([{ balanceCents: 100_000, orgId: 'org-1' }]) }),
    }),
  }),
  transaction: async (fn: (tx: unknown) => Promise<void>) =>
    fn({
      insert: () => ({ values: (v: Record<string, unknown>) => { inseridos.push(v); return Promise.resolve() } }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
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

const { adjustAccountBalance } = await import('@/lib/finance/account-actions')

function form(novoSaldo: number) {
  const f = new FormData()
  f.set('accountId', 'conta-1')
  f.set('newBalanceCents', String(novoSaldo))
  return f
}

describe('adjustAccountBalance', () => {
  it.each([
    ['para baixo', 0],
    ['para cima', 250_000],
  ])('grava o ajuste %s sem afetar o fluxo de caixa', async (_sentido, novoSaldo) => {
    inseridos.length = 0

    await adjustAccountBalance(form(novoSaldo))

    expect(inseridos).toHaveLength(1)
    expect(inseridos[0]).toMatchObject({ affectsCashFlow: false, origem: 'ajuste' })
  })
})
