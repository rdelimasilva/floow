import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * Lançamento manual numa conta Open Finance não mexe no saldo: quem move o
 * saldo é o extrato daquela conta, que absorve o manual quando chega (com a
 * categoria que o usuário deu). Em conta manual, tudo como antes.
 */
const inseridos: Record<string, unknown>[] = []
const updates: string[] = []
// O que cada `update(...).set(...)` gravou, para olhar a linha editada.
const sets: { tabela: string; valores: Record<string, unknown> }[] = []
// O que o `select` de fora da transação devolve (a linha antes da edição).
const selectQueue: unknown[][] = []
const aguarda = vi.fn(async (..._a: unknown[]) => false)
const conciliar = vi.fn(async (..._a: unknown[]) => undefined)

vi.mock('@/lib/finance/conciliacao/aguarda-extrato', () => ({ aguardaExtratoNaConta: (...a: unknown[]) => aguarda(...a) }))
vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({ conciliarContas: (...a: unknown[]) => conciliar(...a) }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1', getCategoryRules: async () => [] }))
vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: async () => undefined }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateAccountData: vi.fn(), revalidateTransactionData: vi.fn(), revalidateSnapshotData: vi.fn() }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))

function chain(result: unknown[], aoGravar?: (v: Record<string, unknown>) => void): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning']) c[m] = () => c
  c.set = (v: Record<string, unknown>) => { aoGravar?.(v); return c }
  return c
}
const tx: any = {
  insert: () => ({ values: (v: Record<string, unknown>) => { inseridos.push(v); return chain([{ id: 'nova' }]) } }),
  update: (t: any) => {
    const tabela = getTableName(t)
    if (tabela === 'accounts') updates.push(tabela)
    return chain([], (valores) => sets.push({ tabela, valores }))
  },
}
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => chain(selectQueue.shift() ?? []),
      transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    }),
  }
})

const { createTransaction } = await import('@/lib/finance/transaction-create-actions')
const { updateTransaction } = await import('@/lib/finance/transaction-actions')

function form(campos: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) f.set(k, v)
  return f
}
const DESPESA = { accountId: '00000000-0000-4000-8000-000000000001', type: 'expense', amountCents: '4321', description: 'Feira', date: '2026-09-20', categoryId: '00000000-0000-4000-8000-0000000000c1' }

beforeEach(() => {
  inseridos.length = 0; updates.length = 0; sets.length = 0; selectQueue.length = 0
  aguarda.mockReset(); conciliar.mockClear()
})

describe('createTransaction em conta Open Finance', () => {
  it('conta OF: nasce aguardando, fora do saldo, e chama o motor', async () => {
    aguarda.mockResolvedValue(true)
    await createTransaction(form(DESPESA))
    expect(inseridos[0]).toMatchObject({ origem: 'manual', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual([])
    expect(conciliar).toHaveBeenCalledWith(expect.anything(), 'org-1', [DESPESA.accountId], expect.any(String))
    // A data da linha vai junto: antes do início do extrato ela não aguarda.
    expect(aguarda).toHaveBeenCalledWith(expect.anything(), 'org-1', DESPESA.accountId, 'manual', '2026-09-20')
  })

  it('conta manual: soma no saldo como antes', async () => {
    aguarda.mockResolvedValue(false)
    await createTransaction(form(DESPESA))
    expect(inseridos[0]).toMatchObject({ origem: 'manual', aguardaExtrato: false, balanceApplied: true })
    expect(updates).toEqual(['accounts'])
  })

  it('transferência manual para conta OF: a perna de lá aguarda, a de cá soma', async () => {
    aguarda.mockImplementation(async (...a: unknown[]) => a[2] === '00000000-0000-4000-8000-000000000002')
    await createTransaction(form({ ...DESPESA, type: 'transfer', categoryId: '', transferToAccountId: '00000000-0000-4000-8000-000000000002' }))
    expect(inseridos[0]).toMatchObject({ origem: 'perna', aguardaExtrato: false, balanceApplied: true })
    expect(inseridos[1]).toMatchObject({ origem: 'perna', aguardaExtrato: true, balanceApplied: false })
    expect(updates).toEqual(['accounts'])
  })
})

/**
 * A edição decide de novo, pela conta de destino de cada linha: a que chega a
 * uma conta Open Finance passa a aguardar o extrato de lá — mesmo que antes
 * estivesse no saldo de uma conta manual.
 */
describe('updateTransaction e a conta Open Finance', () => {
  const ID = '00000000-0000-4000-8000-0000000000aa'
  const MANUAL_ = '00000000-0000-4000-8000-000000000001'
  const OF = '00000000-0000-4000-8000-000000000002'
  const NO_SALDO = {
    id: ID, orgId: 'org-1', accountId: MANUAL_, amountCents: -4321, balanceApplied: true, aguardaExtrato: false,
    origem: 'manual', transferGroupId: null, recurringTemplateId: null, isInstallmentForecast: false, externalId: null,
  }
  const linhaEditada = () => sets.find((s) => s.tabela === 'transactions')!.valores

  function edicao(campos: Record<string, string>) {
    return form({ id: ID, accountId: MANUAL_, type: 'expense', amountCents: '4321', description: 'Feira', date: '2026-09-20', ...campos })
  }

  beforeEach(() => {
    aguarda.mockImplementation(async (...a: unknown[]) => a[2] === OF)
    selectQueue.push([NO_SALDO])
  })

  it('convertida em transferência para conta OF: a perna de lá nasce aguardando, sem crédito', async () => {
    await updateTransaction(edicao({ type: 'transfer', destAccountId: OF }))
    expect(inseridos[0]).toMatchObject({ accountId: OF, origem: 'perna', aguardaExtrato: true, balanceApplied: false })
    // Só a origem (manual): desfaz o valor antigo e aplica o novo.
    expect(updates).toEqual(['accounts', 'accounts'])
    expect(conciliar).toHaveBeenCalledWith(expect.anything(), 'org-1', [MANUAL_, OF], expect.any(String))
  })

  it('movida de conta manual para conta OF: sai do saldo de lá, aguarda o extrato e chama o motor', async () => {
    await updateTransaction(edicao({ accountId: OF }))
    expect(updates).toEqual(['accounts']) // só o estorno na conta manual
    expect(linhaEditada()).toMatchObject({ accountId: OF, aguardaExtrato: true, balanceApplied: false })
    expect(conciliar).toHaveBeenCalledWith(expect.anything(), 'org-1', [OF], expect.any(String))
  })
})
