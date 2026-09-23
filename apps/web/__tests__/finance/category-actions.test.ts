import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O invariante que estes testes protegem: uma categoria de sistema
 * (`org_id IS NULL`) é compartilhada por TODAS as orgs, então nenhuma ação de
 * uma org pode alterá-la ou apagá-la. Foi assim que "Transporte" virou "Carro"
 * e "Saúde" sumiu para três orgs de uma vez.
 */

interface Op {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string
  /** O que foi para `.values()` / `.set()`. */
  payload?: unknown
}

const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []

/** Encadeável e thenable: cobre .from().where().limit(), .values().returning() etc. */
function makeChain(result: unknown[], op?: Op): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const method of [
    'from',
    'where',
    'limit',
    'set',
    'values',
    'returning',
    'onConflictDoNothing',
    'orderBy',
    'leftJoin',
    'innerJoin',
  ]) {
    chain[method] = (arg?: unknown) => {
      if (op && (method === 'values' || method === 'set')) op.payload = arg
      return makeChain(result, op)
    }
  }
  return chain
}

const mockDb = {
  select: () => {
    ops.push({ op: 'select', table: '?' })
    return makeChain(selectQueue.shift() ?? [])
  },
  insert: (t: { _table: string }) => {
    const op: Op = { op: 'insert', table: t._table }
    ops.push(op)
    return makeChain(insertQueue.shift() ?? [], op)
  },
  update: (t: { _table: string }) => {
    const op: Op = { op: 'update', table: t._table }
    ops.push(op)
    return makeChain([], op)
  },
  delete: (t: { _table: string }) => {
    ops.push({ op: 'delete', table: t._table })
    return makeChain([])
  },
  execute: () => Promise.resolve([]),
}

// `_table` e nao `name`: a tabela categories tem uma COLUNA chamada name, e usar
// a mesma chave para as duas coisas fazia o mock se identificar como 'name'.
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

const { updateCategory, deleteCategory, repararHierarquiaDeCategorias } = await import('@/lib/finance/category-actions')

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
}

const CATEGORIA_DA_ORG = { ...CATEGORIA_DE_SISTEMA, id: 'org-cat-1', orgId: 'org-1', isSystem: false }

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.append(k, v)
  return fd
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  insertQueue.length = 0
})

describe('updateCategory numa categoria de sistema', () => {
  it('cria a cópia da org em vez de alterar a linha compartilhada', async () => {
    selectQueue.push([CATEGORIA_DE_SISTEMA]) // findVisibleCategory
    selectQueue.push([]) // assertNameIsFree: nenhum nome em conflito
    insertQueue.push([{ ...CATEGORIA_DE_SISTEMA, id: 'copia-1', orgId: 'org-1', name: 'Carro' }])

    const result = await updateCategory(form({ id: 'sys-1', name: 'Carro', type: 'expense' }))

    expect(result?.id).toBe('copia-1')
    // O ponto de tudo: nenhum UPDATE em categories.
    expect(ops.filter((o) => o.op === 'update' && o.table === 'categories')).toEqual([])
    expect(ops.some((o) => o.op === 'insert' && o.table === 'categories')).toBe(true)
  })

  it('leva o histórico da org junto para a cópia', async () => {
    // Sem isso o usuário renomearia e veria as transações continuarem na
    // categoria antiga, como se tivesse criado uma categoria vazia.
    selectQueue.push([CATEGORIA_DE_SISTEMA])
    selectQueue.push([])
    insertQueue.push([{ id: 'copia-1' }])

    await updateCategory(form({ id: 'sys-1', name: 'Carro', type: 'expense' }))

    const atualizadas = ops.filter((o) => o.op === 'update').map((o) => o.table)
    expect(atualizadas).toEqual(
      expect.arrayContaining([
        'transactions',
        'recurring_templates',
        'budget_entries',
        'debts',
        'category_rules',
      ]),
    )
  })

  it('esconde a original para a org, senão ela veria as duas', async () => {
    selectQueue.push([CATEGORIA_DE_SISTEMA])
    selectQueue.push([])
    insertQueue.push([{ id: 'copia-1' }])

    await updateCategory(form({ id: 'sys-1', name: 'Carro', type: 'expense' }))

    expect(ops.some((o) => o.op === 'insert' && o.table === 'hidden_system_categories')).toBe(true)
  })
})

describe('filhas da mãe de sistema renomeada', () => {
  // Antes, as filhas ficavam apontando para a original escondida e, na árvore,
  // caíam recuadas debaixo de outra mãe — "mudou a mãe sozinho".
  const MAE = { ...CATEGORIA_DE_SISTEMA, id: 'sys-food', name: 'Alimentação', polpRef: 'FOOD_AND_DRINK' }
  const FILHA_SISTEMA = {
    ...CATEGORIA_DE_SISTEMA,
    id: 'sys-groceries',
    name: 'Mercado',
    parentId: 'sys-food',
    polpRef: 'FOOD_AND_DRINK_GROCERIES',
  }
  const COPIA_MAE = { ...MAE, id: 'org-comida', orgId: 'org-1', isSystem: false, name: 'Comida' }

  it('filha de sistema ganha cópia da org pendurada na mãe renomeada', async () => {
    selectQueue.push([MAE]) // findVisibleCategory
    selectQueue.push([]) // assertNameIsFree
    selectQueue.push([COPIA_MAE, FILHA_SISTEMA]) // visíveis
    selectQueue.push([]) // subconsulta notExists das visíveis (o mock também a conta)
    selectQueue.push([{ id: 'sys-food', orgId: null, parentId: null, polpRef: 'FOOD_AND_DRINK' }]) // escondidas
    insertQueue.push([COPIA_MAE]) // cópia da mãe
    insertQueue.push([]) // esconde a mãe
    insertQueue.push([{ ...FILHA_SISTEMA, id: 'org-mercado', orgId: 'org-1' }]) // cópia da filha

    await updateCategory(form({ id: 'sys-food', name: 'Comida', type: 'expense' }))

    const copias = ops.filter((o) => o.op === 'insert' && o.table === 'categories')
    expect(copias).toHaveLength(2)
    expect(copias[1].payload).toMatchObject({ name: 'Mercado', orgId: 'org-1', parentId: 'org-comida' })
    // A filha de sistema também sai de vista para a org, senão ela veria duas
    const escondidas = ops.filter((o) => o.op === 'insert' && o.table === 'hidden_system_categories')
    expect(escondidas.map((o) => o.payload)).toEqual([
      { orgId: 'org-1', categoryId: 'sys-food' },
      { orgId: 'org-1', categoryId: 'sys-groceries' },
    ])
    // E nenhuma linha de sistema foi alterada
    expect(ops.filter((o) => o.op === 'update' && o.table === 'categories')).toEqual([])
  })

  it('o reparo reaponta a filha da org que ficou órfã num rename antigo', async () => {
    const FILHA_DA_ORG = { ...FILHA_SISTEMA, id: 'org-mercado', orgId: 'org-1', isSystem: false }
    selectQueue.push([COPIA_MAE, FILHA_DA_ORG]) // visíveis
    selectQueue.push([]) // subconsulta notExists
    selectQueue.push([{ id: 'sys-food', orgId: null, parentId: null, polpRef: 'FOOD_AND_DRINK' }]) // escondidas

    const alteradas = await repararHierarquiaDeCategorias()

    expect(alteradas).toBe(1)
    const updates = ops.filter((o) => o.op === 'update' && o.table === 'categories')
    expect(updates.map((o) => o.payload)).toEqual([{ parentId: 'org-comida' }])
  })

  it('o reparo não grava nada quando a árvore está sã', async () => {
    selectQueue.push([MAE, FILHA_SISTEMA])
    selectQueue.push([]) // subconsulta notExists
    selectQueue.push([])

    expect(await repararHierarquiaDeCategorias()).toBe(0)
    expect(ops.filter((o) => o.op !== 'select')).toEqual([])
  })
})

describe('updateCategory numa categoria da própria org', () => {
  it('edita direto, sem duplicar nada', async () => {
    selectQueue.push([CATEGORIA_DA_ORG])
    selectQueue.push([])

    await updateCategory(form({ id: 'org-cat-1', name: 'Carro', type: 'expense' }))

    expect(ops.some((o) => o.op === 'update' && o.table === 'categories')).toBe(true)
    expect(ops.some((o) => o.op === 'insert' && o.table === 'categories')).toBe(false)
    expect(ops.some((o) => o.op === 'insert' && o.table === 'hidden_system_categories')).toBe(false)
  })
})

describe('deleteCategory', () => {
  it('numa de sistema, esconde para a org e não apaga a linha', async () => {
    selectQueue.push([CATEGORIA_DE_SISTEMA]) // findVisibleCategory
    selectQueue.push([]) // clearOrgReferences: nenhuma dívida usando

    await deleteCategory(form({ id: 'sys-1' }))

    expect(ops.filter((o) => o.op === 'delete' && o.table === 'categories')).toEqual([])
    expect(ops.some((o) => o.op === 'insert' && o.table === 'hidden_system_categories')).toBe(true)
  })

  it('recusa quando há dívida usando a categoria', async () => {
    // debts.category_id é NOT NULL com ON DELETE CASCADE: soltar a referência é
    // impossível e deixar cascatear apagaria a dívida do usuário.
    selectQueue.push([CATEGORIA_DE_SISTEMA])
    selectQueue.push([{ id: 'debt-1' }])

    await expect(deleteCategory(form({ id: 'sys-1' }))).rejects.toThrow(/dívidas/i)
    expect(ops.some((o) => o.op === 'insert' && o.table === 'hidden_system_categories')).toBe(false)
  })

  it('numa da própria org, apaga de verdade', async () => {
    selectQueue.push([CATEGORIA_DA_ORG])

    await deleteCategory(form({ id: 'org-cat-1' }))

    expect(ops.some((o) => o.op === 'delete' && o.table === 'categories')).toBe(true)
    expect(ops.some((o) => o.op === 'insert' && o.table === 'hidden_system_categories')).toBe(false)
  })
})

describe('categoria nao encontrada', () => {
  it('loga o id e a org antes de lancar, para o erro ser diagnosticavel', async () => {
    // Aconteceu duas vezes em 07/09 e nao deu para saber qual categoria era:
    // a mensagem nao carrega contexto nenhum. O id nao vai para o usuario,
    // vai para o log do servidor.
    const erros: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => { erros.push(args) }

    selectQueue.push([]) // findVisibleCategory nao acha

    try {
      await expect(
        updateCategory(form({ id: 'cat-fantasma', name: 'Qualquer', type: 'expense' })),
      ).rejects.toThrow('Categoria não encontrada')
    } finally {
      console.error = original
    }

    const linha = erros.map((a) => a.join(' ')).join(' | ')
    expect(linha).toContain('cat-fantasma')
    expect(linha).toContain('org-1')
  })
})
