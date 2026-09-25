import { describe, it, expect, vi } from 'vitest'

const getTransactionsWithCount = vi.fn()
vi.mock('@/lib/finance/queries', () => ({
  getOrgId: vi.fn(async () => 'org-1'),
  getTransactionsWithCount: (...a: unknown[]) => getTransactionsWithCount(...a),
}))

const { idsDoFiltro } = await import('@/lib/finance/ids-do-filtro')
const { LIMITE_DA_SELECAO } = await import('@/lib/finance/filtros-da-url')

/** "Selecionar todas do filtro" pega os ids pelo mesmo recorte da tela. */
describe('idsDoFiltro', () => {
  it('consulta com os filtros da URL e devolve os ids', async () => {
    getTransactionsWithCount.mockResolvedValue({ transactions: [{ id: 'a' }, { id: 'b' }], totalCount: 2 })

    const r = await idsDoFiltro('search=mercado&page=3')

    expect(getTransactionsWithCount).toHaveBeenCalledWith('org-1', expect.objectContaining({
      search: 'mercado', offset: 0, limit: LIMITE_DA_SELECAO,
    }))
    expect(r).toEqual({ ids: ['a', 'b'], total: 2 })
  })
})
