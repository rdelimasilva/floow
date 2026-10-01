import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn(), withUserDbFor: vi.fn() }))
vi.mock('@/lib/finance/duplicata-queries', () => ({ lerDuplicatasPendentes: vi.fn() }))
vi.mock('@/lib/finance/forecast-match-queries', () => ({ lerPropostasPendentes: vi.fn() }))
vi.mock('@/lib/openfinance/counterparty-queries', () => ({ lerGruposPendentes: vi.fn() }))
const { contar } = await import('@/lib/finance/conciliacao/fila-db')

const item = (p: Record<string, unknown>) => ({ candidatas: [], repetido: null, classificacao: null, ...p }) as any

describe('contar', () => {
  it('total é de lançamentos distintos; cada tipo conta o seu', () => {
    const c = contar([
      item({ repetido: {}, classificacao: {} }),
      item({ candidatas: [{}] }),
      item({ classificacao: {}, candidatas: [{}] }),
    ])
    expect(c).toEqual({ repetidos: 1, classificar: 2, confirmar: 2, total: 3 })
  })
})
