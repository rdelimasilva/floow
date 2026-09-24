import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

/**
 * Previsão não sensibiliza `accounts.balance_cents`. Nunca.
 *
 * O defeito: `generateForTemplate` grava a ocorrência vencida SEM passar
 * `balanceApplied` — pega o default `true` da coluna — e soma o valor no
 * saldo da conta na mesma transação. `createRecurring` faz o mesmo com as
 * parcelas de data passada.
 *
 * Resultado em produção: R$ 126.746,00 de estimativa de template dentro do
 * saldo de uma conta cujo saldo real é R$ 190,84. Dessas linhas, 21 têm par
 * realizado vindo do banco — contam dobrado.
 *
 * A regra nova: o saldo da conta é só o que aconteceu de verdade. A previsão
 * fica `balance_applied = false` até o lançamento do banco casar com ela, e
 * quem soma é o realizado. Enquanto isso ela aparece no saldo PROJETADO da
 * lista, que é calculado na tela e não persiste nada.
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
    chain([{ id: 'tx-nova' }], (m, arg) => {
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
  refreshSnapshot: () => Promise.resolve(),
}))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({
  invalidateTag: vi.fn(),
  accountsTag: () => 'a', budgetInvestingTag: () => 'b', budgetSpendingTag: () => 'c',
  cfoInsightsTag: () => 'd', futureTransactionsTag: () => 'e', patrimonyHistoryTag: () => 'f',
  recentTransactionsTag: () => 'g', snapshotsTag: () => 'h', transactionsTag: () => 'i',
}))

const { generateRecurringTransaction, createRecurringTemplate } = await import('@/lib/finance/recurring-actions')

/** Template mensal vencido: última cobrança em 15/07, hoje já passou. */
const TEMPLATE_VENCIDO = {
  id: 'tpl-1',
  orgId: 'org-1',
  accountId: 'conta-1',
  categoryId: 'cat-1',
  type: 'income',
  amountCents: 3_250_000,
  description: 'Salário',
  frequency: 'monthly',
  nextDueDate: new Date('2026-07-15'),
  isActive: true,
}

function formData() {
  const fd = new FormData()
  fd.set('templateId', 'tpl-1')
  return fd
}

beforeEach(() => {
  selectQueue.length = 0
  inseridos.length = 0
  atualizados.length = 0
  selectQueue.push([TEMPLATE_VENCIDO])
})

describe('geração de ocorrência vencida de template', () => {
  it('grava a ocorrência como previsão, não como realizado', async () => {
    await generateRecurringTransaction(formData())

    const linhas = inseridos.filter((i) => i.tabela === 'transactions')
    expect(linhas.length).toBeGreaterThan(0)
    for (const linha of linhas) {
      expect(linha.valores).toMatchObject({ balanceApplied: false })
    }
  })

  it('não mexe no saldo da conta', async () => {
    await generateRecurringTransaction(formData())

    expect(atualizados.filter((u) => u.tabela === 'accounts')).toEqual([])
  })
})

describe('criacao de template com parcelas', () => {
  /** Parcelas mensais comecando no passado: 4 vencidas, o resto futuro. */
  function formDataParcelado() {
    const fd = new FormData()
    fd.set('accountId', 'conta-1')
    fd.set('type', 'expense')
    fd.set('amountCents', '15900')
    fd.set('description', 'TIM internet')
    fd.set('frequency', 'monthly')
    fd.set('nextDueDate', '2026-05-10')
    fd.set('endMode', 'count')
    fd.set('installmentCount', '12')
    return fd
  }

  it('parcela de data passada tambem nasce como previsao', async () => {
    selectQueue.length = 0
    selectQueue.push([{ id: 'conta-1', orgId: 'org-1' }])

    await createRecurringTemplate(formDataParcelado())

    const linhas = inseridos.filter((i) => i.tabela === 'transactions')
    expect(linhas.length).toBeGreaterThan(0)
    const parcelas = linhas.flatMap((l) => (Array.isArray(l.valores) ? l.valores : [l.valores]))
    const vencidas = parcelas.filter((p: any) => new Date(p.date) <= new Date())
    expect(vencidas.length).toBeGreaterThan(0)
    for (const p of vencidas as any[]) expect(p.balanceApplied).toBe(false)
  })

  it('nao mexe no saldo da conta ao criar o template', async () => {
    selectQueue.length = 0
    selectQueue.push([{ id: 'conta-1', orgId: 'org-1' }])

    await createRecurringTemplate(formDataParcelado())

    expect(atualizados.filter((u) => u.tabela === 'accounts')).toEqual([])
  })
})
