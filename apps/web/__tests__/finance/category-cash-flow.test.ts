import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O invariante que estes testes protegem: a categoria carrega o padrão de
 * "entra no fluxo de caixa", e esse padrão sobrevive aos três caminhos de
 * escrita — criar, editar categoria da org, e o copy-on-write de categoria de
 * sistema.
 *
 * Por que na categoria e não no lançamento: "Aplicação CDB" nunca é despesa
 * de fluxo de caixa, em nenhum lançamento. Marcar um por um transfere para o
 * usuário um trabalho que a categoria já responde.
 *
 * `isIgnored` NÃO serve para isso e não é tocado aqui: ele significa "este
 * lançamento é errado, não existe" e apaga a linha de fluxo de caixa,
 * orçamentos, dívidas e CFO. A aplicação aconteceu de verdade e precisa
 * continuar contando nos demais.
 *
 * Mesmo harness de mock de `category-actions.test.ts`, com uma diferença: aqui
 * o chain guarda o payload de `.values()`/`.set()`, porque o que está sob
 * teste é justamente o valor gravado.
 */

interface Op {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string
  payload?: Record<string, unknown>
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []

function makeChain(result: unknown[], current?: Op): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const method of [
    'from',
    'where',
    'limit',
    'returning',
    'onConflictDoNothing',
    'orderBy',
    'leftJoin',
    'innerJoin',
  ]) {
    chain[method] = () => makeChain(result, current)
  }
  // `values` e `set` sao os unicos que interessam capturar.
  for (const method of ['values', 'set']) {
    chain[method] = (payload: Record<string, unknown>) => {
      if (current) current.payload = payload
      return makeChain(result, current)
    }
  }
  return chain
}

function record(op: Op) {
  ops.push(op)
  return op
}

const mockDb = {
  select: () => makeChain(selectQueue.shift() ?? [], record({ op: 'select', table: '?' })),
  insert: (t: { _table: string }) =>
    makeChain(insertQueue.shift() ?? [], record({ op: 'insert', table: t._table })),
  update: (t: { _table: string }) => makeChain([], record({ op: 'update', table: t._table })),
  delete: (t: { _table: string }) => makeChain([], record({ op: 'delete', table: t._table })),
  execute: () => Promise.resolve([]),
}

vi.mock('@floow/db', () => ({
  getDb: () => mockDb,
  categories: { _table: 'categories' },
  categoryRules: { _table: 'category_rules' },
  budgetEntries: { _table: 'budget_entries' },
  debts: { _table: 'debts' },
  hiddenSystemCategories: { _table: 'hidden_system_categories' },
  recurringTemplates: { _table: 'recurring_templates' },
  transactions: { _table: 'transactions' },
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateCategoryData: vi.fn(),
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
}))

const { createCategory, updateCategory } = await import('@/lib/finance/category-actions')

const CATEGORIA_DE_SISTEMA = {
  id: 'sys-1',
  orgId: null,
  name: 'Transporte',
  type: 'expense',
  color: '#eab308',
  icon: 'car',
  isSystem: true,
  parentId: null,
  polpRef: 'TRANSPORTATION',
  affectsCashFlow: true,
}

const CATEGORIA_DA_ORG = { ...CATEGORIA_DE_SISTEMA, id: 'org-cat-1', orgId: 'org-1', isSystem: false }

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.append(k, v)
  return fd
}

function payloadDo(op: 'insert' | 'update', table: string) {
  return ops.find((o) => o.op === op && o.table === table)?.payload
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  insertQueue.length = 0
})

describe('createCategory e o padrão de fluxo de caixa', () => {
  it('grava affectsCashFlow false quando o form manda "false"', async () => {
    selectQueue.push([]) // assertNameIsFree
    insertQueue.push([{ id: 'nova-1' }])

    await createCategory(
      form({ name: 'Aplicação CDB', type: 'expense', affectsCashFlow: 'false' }),
    )

    expect(payloadDo('insert', 'categories')?.affectsCashFlow).toBe(false)
  })

  it('assume true quando o campo não vem, preservando o comportamento atual', async () => {
    // Categoria antiga e formulário que ainda não manda o campo continuam
    // contando no fluxo de caixa. O default seguro é o comportamento de hoje.
    selectQueue.push([])
    insertQueue.push([{ id: 'nova-2' }])

    await createCategory(form({ name: 'Mercado', type: 'expense' }))

    expect(payloadDo('insert', 'categories')?.affectsCashFlow).toBe(true)
  })
})

describe('updateCategory e o padrão de fluxo de caixa', () => {
  it('grava o flag numa categoria da própria org', async () => {
    selectQueue.push([CATEGORIA_DA_ORG]) // findVisibleCategory
    selectQueue.push([]) // assertNameIsFree

    await updateCategory(
      form({ id: 'org-cat-1', name: 'Aplicação CDB', type: 'expense', affectsCashFlow: 'false' }),
    )

    expect(payloadDo('update', 'categories')?.affectsCashFlow).toBe(false)
  })

  it('leva o flag para a cópia no copy-on-write de categoria de sistema', async () => {
    // Sem isso, desmarcar o checkbox numa categoria de sistema criaria a cópia
    // da org com o padrão errado e o usuário veria a mudança sumir.
    selectQueue.push([CATEGORIA_DE_SISTEMA])
    selectQueue.push([])
    insertQueue.push([{ id: 'copia-1' }])

    await updateCategory(
      form({ id: 'sys-1', name: 'Aplicação CDB', type: 'expense', affectsCashFlow: 'false' }),
    )

    expect(payloadDo('insert', 'categories')?.affectsCashFlow).toBe(false)
  })
})
