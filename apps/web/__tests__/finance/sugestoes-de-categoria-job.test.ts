import { describe, it, expect, vi } from 'vitest'
import type { CategorySuggestion } from '@floow/core-finance'
import {
  planSuggestionSync, runCategorySuggestionsForOrg, type CategorySuggestionDeps,
} from '@/lib/finance/category-suggestions/job'

function sug(fingerprint: string, over: Partial<CategorySuggestion> = {}): CategorySuggestion {
  return {
    kind: 'uncategorized', fingerprint, suggestedName: 'X', parentCategoryId: null, sourceCategoryIds: [],
    merchantKey: 'x', matchValue: 'x', txCount: 6, totalCents: 1000, monthlyAvgCents: 83,
    targetCategoryId: null, samples: [], ...over,
  }
}

describe('planSuggestionSync', () => {
  it('insere novas, atualiza pendentes, apaga pendentes que sumiram', () => {
    const plan = planSuggestionSync(
      [
        { id: '1', fingerprint: 'a', status: 'pending' },
        { id: '2', fingerprint: 'b', status: 'pending' },
      ],
      [sug('a', { txCount: 9 }), sug('c')],
    )
    expect(plan.inserts.map((s) => s.fingerprint)).toEqual(['c'])
    expect(plan.updates).toEqual([{ id: '1', suggestion: sug('a', { txCount: 9 }) }])
    expect(plan.deleteIds).toEqual(['2'])
  })
  it('não toca em aceitas nem recusadas, mesmo que o motor as devolva', () => {
    const plan = planSuggestionSync(
      [
        { id: '1', fingerprint: 'a', status: 'accepted' },
        { id: '2', fingerprint: 'b', status: 'dismissed' },
      ],
      [sug('a'), sug('b')],
    )
    expect(plan).toEqual({ inserts: [], updates: [], deleteIds: [] })
  })
})

describe('runCategorySuggestionsForOrg', () => {
  it('passa aceitas e recusadas como excluídas para o motor', async () => {
    const txs = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`, description: 'IFOOD', amountCents: -4000, date: `2026-0${i + 1}-10`, categoryId: null,
    }))
    const apply = vi.fn(async () => {})
    const deps: CategorySuggestionDeps = {
      loadInput: async () => ({ transactions: txs, categories: [], categoriesWithGoal: new Set() }),
      loadExisting: async () => [{ id: '9', fingerprint: 'uncategorized:root:ifood', status: 'dismissed' }],
      apply,
    }
    const r = await runCategorySuggestionsForOrg('org-1', deps)
    expect(r.pending).toBe(0)
    expect(apply).toHaveBeenCalledWith('org-1', { inserts: [], updates: [], deleteIds: [] })
  })
})

describe('runCategorySuggestionsForOrg — classificador', () => {
  const txs = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`, description: 'PIX TRANSF Maraisa05 01', amountCents: -40000, date: `2026-0${i + 1}-10`, categoryId: null,
  }))
  const categories = [{ id: 'limpeza', name: 'Assistente de limpeza', parentId: null, polpRef: null }]
  function deps(over: Partial<CategorySuggestionDeps> = {}) {
    const apply = vi.fn(async () => {})
    const d: CategorySuggestionDeps = {
      loadInput: async () => ({ transactions: txs, categories, categoriesWithGoal: new Set() }),
      loadExisting: async () => [],
      apply,
      ...over,
    }
    return { d, apply }
  }

  it('sem classificador, sugestão sem destino não é gravada', async () => {
    const { d, apply } = deps()
    expect((await runCategorySuggestionsForOrg('org', d)).pending).toBe(0)
    expect(apply).toHaveBeenCalledWith('org', { inserts: [], updates: [], deleteIds: [] })
  })

  it('classificador manda para categoria existente', async () => {
    const classify = vi.fn(async () => [
      { fingerprint: 'uncategorized:root:maraisa', action: 'existing' as const, categoryId: 'limpeza' },
    ])
    const { d, apply } = deps({ classify })
    expect((await runCategorySuggestionsForOrg('org', d)).pending).toBe(1)
    expect(classify).toHaveBeenCalledWith([expect.objectContaining({ merchantKey: 'maraisa' })], categories)
    const plan = (apply.mock.calls[0] as unknown[])[1] as { inserts: CategorySuggestion[] }
    expect(plan.inserts[0]).toMatchObject({ targetCategoryId: 'limpeza', suggestedName: 'Assistente de limpeza' })
  })

  it('classificador que falha não derruba a rodada', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d, apply } = deps({ classify: async () => { throw new Error('timeout') } })
    expect((await runCategorySuggestionsForOrg('org', d)).pending).toBe(0)
    expect(apply).toHaveBeenCalled()
    err.mockRestore()
  })
})
