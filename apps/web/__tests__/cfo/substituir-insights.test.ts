/**
 * Cada execução do engine (cron diário e eventos como budget_changed) inseria
 * insights novos sem tocar nos anteriores, e a tela mostra todo insight não
 * vencido. Em 18/10/2026 a org e37a3049 tinha "Viagens", "Restaurantes" e
 * "Cuidados pessoais" em dobro: um do cron das 7h e outro do budget_changed
 * das 16h.
 *
 * A execução é a análise vigente das categorias que rodou: ao gravar, ela
 * expira os insights ativos anteriores dessas categorias — inclusive os que
 * não se repetiram, porque o problema deixou de existir.
 */
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { substituirInsights } from '@/lib/cfo/substituir-insights'
import type { InsightResult } from '@floow/core-finance'

const dialect = new PgDialect()

function dbFalso() {
  const passos: { op: string; set?: Record<string, unknown>; where?: { sql: string; params: unknown[] }; values?: unknown[] }[] = []
  let emTransacao = false
  const tx = {
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async (w: SQL) => {
          passos.push({ op: emTransacao ? 'update' : 'update-fora', set, where: dialect.sqlToQuery(w) })
        },
      }),
    }),
    insert: () => ({
      values: async (values: unknown[]) => {
        passos.push({ op: emTransacao ? 'insert' : 'insert-fora', values })
      },
    }),
  }
  const db = {
    ...tx,
    transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
      emTransacao = true
      try {
        return await fn(tx)
      } finally {
        emTransacao = false
      }
    },
  }
  return { db, passos }
}

const viagens: InsightResult = {
  type: 'budget_pacing_risk',
  category: 'budget',
  severity: 'warning',
  title: 'No ritmo atual, Viagens vai estourar',
  body: '...',
  metric: { projectedPct: 130 },
  suggestedAction: { type: 'adjust_budget', params: { categoryId: 'cat-viagens' } },
}

const agora = new Date('2026-10-18T19:14:14.478Z')

describe('substituirInsights', () => {
  it('expira os insights ativos das categorias analisadas antes de inserir os novos, na mesma transação', async () => {
    const { db, passos } = dbFalso()

    await substituirInsights(db as never, {
      orgId: 'org-1',
      categorias: ['budget'],
      insights: [viagens],
      source: 'budget_changed',
      agora,
      expiraEm: () => new Date('2026-10-19T19:14:14.478Z'),
    })

    expect(passos.map((p) => p.op)).toEqual(['update', 'insert'])

    const [expira, insere] = passos
    expect(expira.set).toMatchObject({ expiresAt: agora })
    // Só da org, só das categorias que esta execução analisou, só os ativos.
    expect(expira.where!.sql).toContain('"org_id" = $1')
    expect(expira.where!.sql).toMatch(/"category" in \(\$2\)/)
    expect(expira.where!.sql).toContain('"dismissed_at" is null')
    expect(expira.where!.sql).toContain('"expires_at" >')
    expect(expira.where!.params).toEqual(expect.arrayContaining(['org-1', 'budget']))

    expect(insere.values).toEqual([
      expect.objectContaining({
        orgId: 'org-1',
        type: 'budget_pacing_risk',
        category: 'budget',
        title: 'No ritmo atual, Viagens vai estourar',
        source: 'budget_changed',
        generatedAt: agora,
        suggestedActionType: 'adjust_budget',
        suggestedActionParams: { categoryId: 'cat-viagens' },
        expiresAt: new Date('2026-10-19T19:14:14.478Z'),
      }),
    ])
  })

  it('sem insight novo, ainda expira os anteriores: o problema deixou de existir', async () => {
    const { db, passos } = dbFalso()

    await substituirInsights(db as never, {
      orgId: 'org-1',
      categorias: ['cash_flow', 'budget'],
      insights: [],
      source: 'cron_daily',
      agora,
      expiraEm: () => agora,
    })

    expect(passos.map((p) => p.op)).toEqual(['update'])
    expect(passos[0].where!.params).toEqual(expect.arrayContaining(['cash_flow', 'budget']))
  })
})
