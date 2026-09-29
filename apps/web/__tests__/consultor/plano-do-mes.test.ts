import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/rls', () => ({ withUserDbFor: vi.fn((_u, fn) => fn('db')) }))
vi.mock('@/lib/finance/budget-queries', () => ({
  getBudgetEntriesForMonth: vi.fn(), getSpendingByCategory: vi.fn(), getInvestmentContributions: vi.fn(),
}))
vi.mock('@/lib/finance/recurring-budget-queries', () => ({ buscarOcorrenciasDeRecorrentes: vi.fn() }))
vi.mock('@/lib/finance/recurring-budget', () => ({
  somarRecorrentesPorCategoria: vi.fn(() => 'somadas'),
  combinarMetasDoMes: vi.fn(),
}))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))

import * as bq from '@/lib/finance/budget-queries'
import { withUserDbFor } from '@/lib/db/rls'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes } from '@/lib/finance/recurring-budget'
import { getCategories } from '@/lib/finance/queries-categories'
import { planoDoMes } from '@/lib/consultor/ferramentas/plano-do-mes'
import { reais } from '@/lib/consultor/ferramentas/utils'

const ctx = { orgId: 'org-1', userId: 'u1' }
const inicio = new Date(2026, 9, 1)
const fim = new Date(2026, 10, 0)

beforeEach(() => vi.clearAllMocks())

describe('plano_do_mes — gastos', () => {
  beforeEach(() => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([{ id: 'e1', categoryId: 'c1', plannedCents: 80000 }] as never)
    vi.mocked(buscarOcorrenciasDeRecorrentes).mockResolvedValue([] as never)
    vi.mocked(combinarMetasDoMes).mockReturnValue([
      { entryId: 'e1', categoryId: 'c1', plannedCents: 80000 },
      { entryId: null, categoryId: 'c2', plannedCents: 20000 },
    ] as never)
    vi.mocked(bq.getSpendingByCategory).mockResolvedValue([
      { categoryId: 'c1', spent: 90000 },
      { categoryId: 'c2', spent: 5000 },
      { categoryId: 'c3', spent: 7000 },
    ])
    vi.mocked(getCategories).mockResolvedValue([
      { id: 'c1', name: 'Mercado' }, { id: 'c2', name: 'Lazer' }, { id: 'c3', name: 'Presentes' },
    ] as never)
  })

  it('usa o mesmo caminho da tela (metas + recorrentes) para a org do contexto', async () => {
    await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })
    expect(bq.getBudgetEntriesForMonth).toHaveBeenCalledWith('org-1', inicio, 'spending')
    expect(withUserDbFor).toHaveBeenCalledWith('u1', expect.any(Function))
    expect(buscarOcorrenciasDeRecorrentes).toHaveBeenCalledWith('db', 'org-1', inicio, fim)
    expect(bq.getSpendingByCategory).toHaveBeenCalledWith('org-1', inicio, fim)
  })

  it('mostra planejado × gasto, estouro e gasto fora do plano', async () => {
    const r = await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })
    expect(r).toContain(`Mercado: planejado ${reais(80000)}, gasto ${reais(90000)}, estourou ${reais(10000)}`)
    expect(r).toContain(`Lazer: planejado ${reais(20000)}, gasto ${reais(5000)}, resta ${reais(15000)}`)
    expect(r).toContain(`Gasto fora do plano: ${reais(7000)}`)
  })

  it('sem plano diz isso', async () => {
    vi.mocked(combinarMetasDoMes).mockReturnValue([] as never)
    expect(await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'spending' })).toContain('Nenhum plano de gastos para 2026-10')
  })
})

describe('plano_do_mes — investimentos', () => {
  it('soma a meta do mês e compara com o aportado', async () => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([
      { id: 'i1', name: 'Aporte mensal', plannedCents: 100000 },
      { id: 'i2', name: null, plannedCents: 50000 },
    ] as never)
    vi.mocked(bq.getInvestmentContributions).mockResolvedValue(60000)
    const r = await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'investing' })
    expect(bq.getBudgetEntriesForMonth).toHaveBeenCalledWith('org-1', inicio, 'investing')
    expect(r).toContain(`Aporte mensal: ${reais(100000)}`)
    expect(r).toContain(`Aportes: ${reais(50000)}`)
    expect(r).toContain(`Aportado: ${reais(60000)}`)
    expect(r).toContain(`Falta: ${reais(90000)}`)
  })

  it('sem meta ainda informa o aportado', async () => {
    vi.mocked(bq.getBudgetEntriesForMonth).mockResolvedValue([] as never)
    vi.mocked(bq.getInvestmentContributions).mockResolvedValue(1000)
    expect(await planoDoMes.executar!(ctx, { mes: '2026-10', tipo: 'investing' }))
      .toBe(`Nenhuma meta de investimento para 2026-10. Aportado no mês: ${reais(1000)}.`)
  })
})
