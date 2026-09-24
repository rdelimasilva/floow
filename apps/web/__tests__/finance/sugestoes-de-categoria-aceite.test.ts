import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { aceitarSugestao } from '@/lib/finance/category-suggestions/accept'

interface Op { op: 'select' | 'insert' | 'update'; table: string; payload?: unknown; where?: unknown }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []
/** Retorno do `update ... returning()`: o claim da sugestão vem daqui. */
const updateQueue: unknown[][] = []

function chain(result: unknown[], op: Op): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy']) {
    c[m] = (arg?: unknown) => {
      if (m === 'values' || m === 'set') op.payload = arg
      if (m === 'where') op.where = arg
      return chain(result, op)
    }
  }
  return c
}
const tx: any = {
  select: () => { const op: Op = { op: 'select', table: '?' }; ops.push(op); return chain(selectQueue.shift() ?? [], op) },
  insert: (t: any) => { const op: Op = { op: 'insert', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain(insertQueue.shift() ?? [], op) },
  update: (t: any) => { const op: Op = { op: 'update', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain(updateQueue.shift() ?? [], op) },
}
const sqlDe = (w: unknown) => new PgDialect().sqlToQuery(w as SQL).sql

const SUG = {
  id: 's1', kind: 'uncategorized', merchantKey: 'ifood', matchValue: 'ifood',
  sourceCategoryIds: ['outros'], monthlyAvgCents: 2000, status: 'accepted', targetCategoryId: null,
}
/** Escrita de verdade: o claim em category_suggestions é desfeito pelo rollback de withUserDb. */
const ESCRITAS = (o: Op) => o.op === 'insert' || (o.op === 'update' && o.table !== 'category_suggestions')

beforeEach(() => { ops.length = 0; selectQueue.length = 0; insertQueue.length = 0; updateQueue.length = 0 })

describe('aceitarSugestao', () => {
  it('reserva a sugestão, cria categoria e regra, move só os lançamentos do grupo que estão na origem', async () => {
    updateQueue.push([SUG]) // claim: pending -> accepted
    selectQueue.push(
      [],      // nome livre
      [        // candidatos (já filtrados por origem na query)
        { id: 't1', description: 'IFOOD *REST' },
        { id: 't2', description: 'UBER TRIP' },
      ],
    )
    insertQueue.push([{ id: 'nova' }], [])
    const r = await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')

    expect(r).toEqual({ categoryId: 'nova', name: 'Delivery', parentId: null, monthlyAvgCents: 2000, moved: 1, created: true })
    expect(ops[0]).toMatchObject({ op: 'update', table: 'category_suggestions', payload: { status: 'accepted' } })
    // claim só pega sugestão ainda pendente: de dois cliques simultâneos, um só vence
    expect(sqlDe(ops[0].where)).toContain('"status" = $')
    const inserts = ops.filter((o) => o.op === 'insert').map((o) => o.table)
    expect(inserts).toEqual(['categories', 'category_rules'])
    expect(ops.find((o) => o.table === 'category_rules')?.payload).toMatchObject({ matchType: 'contains', matchValue: 'ifood', categoryId: 'nova' })
    const updates = ops.filter((o) => o.op === 'update')
    expect(updates.map((o) => o.table)).toEqual(['category_suggestions', 'transactions'])
    expect(updates[1].payload).toEqual({ categoryId: 'nova' })
  })

  it('candidatos têm limite superior de data (até hoje)', async () => {
    updateQueue.push([SUG])
    selectQueue.push([], [])
    insertQueue.push([{ id: 'nova' }], [])
    await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')
    const candidatos = ops.filter((o) => o.op === 'select')[1]
    const q = sqlDe(candidatos.where)
    expect(q).toContain('"transactions"."date" >= $')
    expect(q).toContain('"transactions"."date" <= $')
  })

  it('sem match_value não cria regra', async () => {
    updateQueue.push([{ ...SUG, matchValue: null }])
    selectQueue.push([], [])
    insertQueue.push([{ id: 'nova' }])
    await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')
    expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['categories'])
  })

  it('nome já existente aborta antes de gravar', async () => {
    updateQueue.push([SUG])
    selectQueue.push([{ id: 'outra' }])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Mercado', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Já existe uma categoria com esse nome')
    expect(ops.some(ESCRITAS)).toBe(false)
  })

  it('sugestão que não está pendente (ou já aceita por outro clique) é recusada', async () => {
    updateQueue.push([])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'X', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Sugestão não encontrada')
    expect(ops.some(ESCRITAS)).toBe(false)
  })

  it('split sem origem aborta antes de gravar (não move o histórico todo do comerciante)', async () => {
    updateQueue.push([{ ...SUG, kind: 'split', sourceCategoryIds: [] }])
    selectQueue.push([], [{ id: 't1', description: 'IFOOD' }])
    insertQueue.push([{ id: 'nova' }], [])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Sugestão sem origem')
    expect(ops.some(ESCRITAS)).toBe(false)
  })

  it('aceita mãe raiz de despesa e herda cor e ícone', async () => {
    selectQueue.push([{ color: '#f00', icon: 'x', parentId: null, type: 'expense' }], [], [])
    updateQueue.push([{ ...SUG, kind: 'split', sourceCategoryIds: ['alim'] }])
    insertQueue.push([{ id: 'nova' }], [])
    const r = await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: 'alim' }, '2026-09-24')
    expect(r.parentId).toBe('alim')
    expect(ops.find((o) => o.table === 'categories')?.payload).toMatchObject({ parentId: 'alim', color: '#f00', icon: 'x' })
  })

  it.each([
    ['subcategoria (criaria neta)', { color: null, icon: null, parentId: 'raiz', type: 'expense' }],
    ['categoria de receita', { color: null, icon: null, parentId: null, type: 'income' }],
  ])('mãe inválida (%s) aborta antes de gravar', async (_nome, mae) => {
    selectQueue.push([mae], [], [])
    updateQueue.push([SUG])
    insertQueue.push([{ id: 'nova' }], [])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: 'x' }, '2026-09-24'),
    ).rejects.toThrow('Categoria mãe inválida')
    expect(ops.some((o) => o.op !== 'select')).toBe(false)
  })

  describe('sugestão que aponta para categoria existente', () => {
    const ALVO = { ...SUG, targetCategoryId: 'limpeza', merchantKey: 'jussara', matchValue: 'jussara' }

    it('não cria categoria: cria a regra e move para a existente', async () => {
      updateQueue.push([ALVO])
      selectQueue.push(
        [{ id: 'limpeza', name: 'Assistente de limpeza', parentId: 'casa', type: 'expense' }],
        [{ id: 't1', description: 'PIX TRANSF JUSSARA01 01' }, { id: 't2', description: 'PIX TRANSF MARAISA05' }],
      )
      insertQueue.push([])
      const r = await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'ignorado', parentCategoryId: null }, '2026-09-24')

      expect(r).toEqual({ categoryId: 'limpeza', name: 'Assistente de limpeza', parentId: 'casa', monthlyAvgCents: 2000, moved: 1, created: false })
      expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['category_rules'])
      expect(ops.find((o) => o.table === 'category_rules')?.payload).toMatchObject({ categoryId: 'limpeza', matchValue: 'jussara' })
      expect(ops.find((o) => o.op === 'update' && o.table === 'transactions')?.payload).toEqual({ categoryId: 'limpeza' })
    })

    it('categoria de destino que sumiu (ou não é de despesa) aborta antes de gravar', async () => {
      updateQueue.push([ALVO])
      selectQueue.push([{ id: 'limpeza', name: 'Salário', parentId: null, type: 'income' }])
      await expect(
        aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: '', parentCategoryId: null }, '2026-09-24'),
      ).rejects.toThrow('Categoria de destino não encontrada')
      expect(ops.some(ESCRITAS)).toBe(false)
    })
  })
})
