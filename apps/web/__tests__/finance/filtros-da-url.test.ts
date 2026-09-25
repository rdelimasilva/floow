import { describe, it, expect } from 'vitest'
import { filtrosDaUrl } from '@/lib/finance/filtros-da-url'

/** Mesma leitura da URL na página e em "selecionar todas do filtro". */
describe('filtrosDaUrl', () => {
  it('lê os recortes e aplica os padrões da lista', () => {
    expect(filtrosDaUrl({ search: 'mercado', minAmount: '1000', future: '1' })).toMatchObject({
      search: 'mercado',
      minAmount: 1000,
      includeFuture: true,
      sortBy: 'date',
      sortDir: 'asc',
    })
  })

  it('sem parâmetros, só os padrões', () => {
    expect(filtrosDaUrl({})).toMatchObject({ includeFuture: false, minAmount: undefined })
  })
})
