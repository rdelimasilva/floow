import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/finance/queries-cash-flow', () => ({ getMonthlyCashFlowSummary: vi.fn() }))
vi.mock('@/lib/finance/budget-queries', () => ({ getSpendingByCategory: vi.fn() }))
vi.mock('@/lib/finance/queries-categories', () => ({ getCategories: vi.fn() }))

import { getMonthlyCashFlowSummary } from '@/lib/finance/queries-cash-flow'
import { getSpendingByCategory } from '@/lib/finance/budget-queries'
import { getCategories } from '@/lib/finance/queries-categories'
import { resumoDoMes } from '@/lib/consultor/ferramentas/resumo-do-mes'
import { gastosPorCategoria } from '@/lib/consultor/ferramentas/gastos-por-categoria'
import { reais } from '@/lib/consultor/ferramentas/utils'
import { ParametroInvalido } from '@/lib/consultor/ferramentas/tipos'

const ctx = { orgId: 'org-1', userId: 'u1', canal: 'web' as const }

beforeEach(() => vi.clearAllMocks())

describe('resumo_do_mes', () => {
  it('traz receita, despesa (positiva) e resultado do mês pedido', async () => {
    vi.mocked(getMonthlyCashFlowSummary).mockResolvedValue([
      { month: '2026-09', income: 1000000, expense: -600000, net: 400000 },
      { month: '2026-08', income: 1, expense: -1, net: 0 },
    ])
    const r = await resumoDoMes.executar!(ctx, { mes: '2026-09' })
    expect(getMonthlyCashFlowSummary).toHaveBeenCalledWith('org-1', 24)
    expect(r).toContain(`Receitas: ${reais(1000000)}`)
    expect(r).toContain(`Despesas: ${reais(600000)}`)
    expect(r).toContain(`Resultado: ${reais(400000)}`)
  })

  it('mês sem dado diz que não há', async () => {
    vi.mocked(getMonthlyCashFlowSummary).mockResolvedValue([])
    expect(await resumoDoMes.executar!(ctx, { mes: '2020-01' })).toContain('Sem lançamentos confirmados em 2020-01')
  })

  it('mês mal formatado é ParametroInvalido', async () => {
    await expect(resumoDoMes.executar!(ctx, { mes: '09/2026' })).rejects.toThrow(ParametroInvalido)
  })
})

describe('gastos_por_categoria', () => {
  beforeEach(() => {
    vi.mocked(getCategories).mockResolvedValue([
      { id: 'c1', name: 'Alimentação' },
      { id: 'c2', name: 'Supermercado' },
    ] as never)
    vi.mocked(getSpendingByCategory).mockResolvedValue([
      { categoryId: 'c2', spent: 50000 },
      { categoryId: 'c1', spent: 80000 },
      { categoryId: null, spent: 1000 },
    ])
  })

  it('ordena do maior para o menor, com total, e nomeia sem categoria', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30' })
    expect(getSpendingByCategory).toHaveBeenCalledWith('org-1', new Date(2026, 8, 1), new Date(2026, 8, 30))
    expect(r.indexOf('Alimentação')).toBeLessThan(r.indexOf('Supermercado'))
    expect(r).toContain(`Sem categoria: ${reais(1000)}`)
    expect(r).toContain(`Total: ${reais(131000)}`)
  })

  it('filtro de categoria ignora acento e caixa e casa por trecho', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'mercado' })
    expect(r).toContain(`Supermercado: ${reais(50000)}`)
    expect(r).not.toContain('Alimentação')
    const r2 = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'ALIMENTACAO' })
    expect(r2).toContain(`Alimentação: ${reais(80000)}`)
  })

  it('categoria sem gasto diz isso', async () => {
    const r = await gastosPorCategoria.executar!(ctx, { inicio: '2026-09-01', fim: '2026-09-30', categoria: 'viagem' })
    expect(r).toContain('Nenhum gasto em categoria parecida com "viagem"')
  })

  it('intervalo invertido é ParametroInvalido', async () => {
    await expect(gastosPorCategoria.executar!(ctx, { inicio: '2026-09-30', fim: '2026-09-01' })).rejects.toThrow(ParametroInvalido)
  })
})
