import { describe, it, expect, beforeEach } from 'vitest'
import { aceitarSugestao } from '@/lib/finance/category-suggestions/accept'

interface Op { op: 'select' | 'insert' | 'update'; table: string; payload?: unknown }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const insertQueue: unknown[][] = []

function chain(result: unknown[], op?: Op): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning', 'orderBy']) {
    c[m] = (arg?: unknown) => {
      if (op && (m === 'values' || m === 'set')) op.payload = arg
      return chain(result, op)
    }
  }
  return c
}
const tx: any = {
  select: () => { ops.push({ op: 'select', table: '?' }); return chain(selectQueue.shift() ?? []) },
  insert: (t: any) => { const op: Op = { op: 'insert', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain(insertQueue.shift() ?? [], op) },
  update: (t: any) => { const op: Op = { op: 'update', table: t[Symbol.for('drizzle:Name')] }; ops.push(op); return chain([], op) },
}

const SUG = {
  id: 's1', kind: 'uncategorized', merchantKey: 'ifood', matchValue: 'ifood',
  sourceCategoryIds: ['outros'], monthlyAvgCents: 2000, status: 'pending',
}

beforeEach(() => { ops.length = 0; selectQueue.length = 0; insertQueue.length = 0 })

describe('aceitarSugestao', () => {
  it('cria categoria e regra, move só os lançamentos do grupo que estão na origem', async () => {
    selectQueue.push(
      [SUG],   // sugestão
      [],      // nome livre
      [        // candidatos (já filtrados por origem na query)
        { id: 't1', description: 'IFOOD *REST' },
        { id: 't2', description: 'UBER TRIP' },
      ],
    )
    insertQueue.push([{ id: 'nova' }], [])
    const r = await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')

    expect(r).toEqual({ categoryId: 'nova', name: 'Delivery', monthlyAvgCents: 2000, moved: 1 })
    const inserts = ops.filter((o) => o.op === 'insert').map((o) => o.table)
    expect(inserts).toEqual(['categories', 'category_rules'])
    expect(ops.find((o) => o.table === 'category_rules')?.payload).toMatchObject({ matchType: 'contains', matchValue: 'ifood', categoryId: 'nova' })
    const updates = ops.filter((o) => o.op === 'update')
    expect(updates.map((o) => o.table)).toEqual(['transactions', 'category_suggestions'])
    expect(updates[0].payload).toEqual({ categoryId: 'nova' })
    expect(updates[1].payload).toMatchObject({ status: 'accepted' })
  })

  it('sem match_value não cria regra', async () => {
    selectQueue.push([{ ...SUG, matchValue: null }], [], [])
    insertQueue.push([{ id: 'nova' }])
    await aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Delivery', parentCategoryId: null }, '2026-09-24')
    expect(ops.filter((o) => o.op === 'insert').map((o) => o.table)).toEqual(['categories'])
  })

  it('nome já existente aborta antes de gravar', async () => {
    selectQueue.push([SUG], [{ id: 'outra' }])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'Mercado', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Já existe uma categoria com esse nome')
    expect(ops.some((o) => o.op !== 'select')).toBe(false)
  })

  it('sugestão que não está pendente é recusada', async () => {
    selectQueue.push([])
    await expect(
      aceitarSugestao(tx, 'org-1', { suggestionId: 's1', name: 'X', parentCategoryId: null }, '2026-09-24'),
    ).rejects.toThrow('Sugestão não encontrada')
  })
})
