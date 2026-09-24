import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * Recorrente pausada sai da meta de gasto na hora.
 *
 * Pausar não apaga as parcelas futuras já geradas; sem filtro, elas seguiam
 * contando como meta nos meses seguintes. A consulta passa a exigir
 * `is_active`, e a pausa invalida o cache das telas de orçamento.
 */

const invalidados: string[] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  const semLinhas: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([{ id: 'tpl-1', isActive: true }]).then(r) }
  for (const m of ['from', 'where', 'limit', 'set']) semLinhas[m] = () => semLinhas
  return { ...actual, getDb: () => ({ select: () => semLinhas, update: () => semLinhas }) }
})
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1'), getCategoryRules: () => Promise.resolve([]) }))
vi.mock('@/lib/finance/actions', () => ({ assertAccountOwnership: () => Promise.resolve(), refreshSnapshot: () => Promise.resolve() }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requireIdentity: vi.fn() }))
vi.mock('@/lib/db/rls', () => ({ withUserDbFor: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({
  invalidateTag: (t: string) => invalidados.push(t),
  accountsTag: () => 'accounts', budgetInvestingTag: () => 'investing', budgetSpendingTag: () => 'budget-spending',
  budgetEntriesTag: () => 'budget-entries', cfoInsightsTag: () => 'cfo', futureTransactionsTag: () => 'future',
  patrimonyHistoryTag: () => 'patrimony', recentTransactionsTag: () => 'recent', snapshotsTag: () => 'snapshots',
  transactionsTag: () => 'transactions', categoriesTag: () => 'categories',
}))

const { buscarOcorrenciasDeRecorrentes } = await import('@/lib/finance/recurring-budget-queries')
const { toggleRecurringActive } = await import('@/lib/finance/recurring-actions')

describe('recorrente pausada e a meta de gasto', () => {
  it('a consulta da meta só conta recorrente ativa', async () => {
    let condicao: SQL | undefined
    const leitor: any = { select: () => leitor, from: () => leitor, innerJoin: () => leitor }
    leitor.where = (c: SQL) => {
      condicao = c
      return Promise.resolve([])
    }

    await buscarOcorrenciasDeRecorrentes(leitor, 'org-1', new Date('2026-10-01'), new Date('2026-10-31'))

    expect(new PgDialect().sqlToQuery(condicao!).sql).toContain('"recurring_templates"."is_active" = ')
  })

  it('pausar invalida o cache da Meta de Gastos', async () => {
    const fd = new FormData()
    fd.set('id', 'tpl-1')
    await toggleRecurringActive(fd)
    expect(invalidados).toContain('budget-spending')
  })
})
