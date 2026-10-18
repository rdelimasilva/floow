/**
 * A tela do consultor lê insights e a última execução via unstable_cache
 * (revalidate 300, stale-while-revalidate). O cron grava no banco, mas sem
 * invalidar a tag a primeira visita depois de dias devolvia a análise de dias
 * atrás — "análises diárias" com a última de 16/10 em 18/10.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  // Encadeável: qualquer método devolve o próprio builder; `await` resolve no resultado.
  const builder = (resultado: () => unknown): unknown => {
    const alvo = function () {}
    const p: unknown = new Proxy(alvo, {
      get(_t, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
            Promise.resolve().then(resultado).then(ok, erro)
        }
        return () => p
      },
      apply: () => p,
    })
    return p
  }
  return {
    builder,
    invalidateTag: vi.fn(),
    runAnalyzers: vi.fn((): unknown[] => []),
  }
})

vi.mock('@floow/db', () => {
  const tabela = new Proxy({}, { get: (_t, prop) => String(prop) })
  return {
    getDb: () => ({
      select: () => h.builder(() => []),
      selectDistinct: () => h.builder(() => []),
      insert: () => h.builder(() => [{ id: 'run-1' }]),
      update: () => h.builder(() => []),
    }),
    accounts: tabela, transactions: tabela, debts: tabela, budgetGoals: tabela,
    budgetEntries: tabela, patrimonySnapshots: tabela, portfolioEvents: tabela,
    assets: tabela, assetPositionSnapshots: tabela, fixedAssets: tabela,
    cfoInsights: tabela, cfoRuns: tabela, categories: tabela,
  }
})

vi.mock('drizzle-orm', () => {
  const sql = Object.assign(() => ({ as: () => ({}) }), { raw: () => ({}) })
  return { eq: vi.fn(), and: vi.fn(), gte: vi.fn(), gt: vi.fn(), desc: vi.fn(), sql }
})

vi.mock('@/lib/finance/affects-cash-flow', () => ({ effectiveAffectsCashFlow: {} }))
vi.mock('@/lib/cfo/budget-pacing-input', () => ({ buildBudgetPacingInput: async () => undefined }))
vi.mock('@/lib/investments/asset-labels', () => ({ assetDisplayName: (a: { name: string }) => a.name }))
vi.mock('@floow/core-finance', () => ({
  aggregateCashFlow: () => [],
  runAnalyzers: h.runAnalyzers,
  createAnthropicProvider: vi.fn(),
  synthesizeInsights: vi.fn(),
}))
vi.mock('@/lib/cache-tags', () => ({
  invalidateTag: h.invalidateTag,
  cfoInsightsTag: (orgId: string) => `cfo-insights:${orgId}`,
}))

import { runCfoEngine } from '@/lib/cfo/engine'

describe('runCfoEngine invalida o cache da tela do consultor', () => {
  beforeEach(() => {
    h.invalidateTag.mockClear()
    h.runAnalyzers.mockReset()
    h.runAnalyzers.mockReturnValue([])
  })

  it('expira a tag dos insights ao terminar', async () => {
    await runCfoEngine('org-1')
    expect(h.invalidateTag).toHaveBeenCalledWith('cfo-insights:org-1')
  })

  it('expira também quando a análise falha (a execução com erro é a última)', async () => {
    h.runAnalyzers.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(runCfoEngine('org-2')).rejects.toThrow('boom')
    expect(h.invalidateTag).toHaveBeenCalledWith('cfo-insights:org-2')
  })
})
