import { describe, it, expect } from 'vitest'
import { mediaMensalPorCategoria } from '@/lib/finance/simulador-orcamento'

describe('mediaMensalPorCategoria', () => {
  it('divide pelo total de meses da janela, contando mês sem gasto como zero', () => {
    const rows = [
      { categoryId: 'mercado', month: '2026-07', cents: 60_000 },
      { categoryId: 'mercado', month: '2026-08', cents: 30_000 },
      { categoryId: 'viagem', month: '2026-08', cents: 90_000 },
    ]
    const media = mediaMensalPorCategoria(rows, ['2026-07', '2026-08', '2026-09'])
    expect(media).toEqual([
      { categoryId: 'mercado', spent: 30_000 },
      { categoryId: 'viagem', spent: 30_000 },
    ])
  })

  it('sem meses fechados não há média', () => {
    expect(mediaMensalPorCategoria([{ categoryId: 'x', cents: 100 }], [])).toEqual([])
  })
})
