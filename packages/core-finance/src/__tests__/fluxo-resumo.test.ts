import { describe, it, expect } from 'vitest'
import { mesAnterior, resumirFluxo } from '../fluxo-resumo'

describe('mesAnterior', () => {
  it('volta o ano em janeiro', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesAnterior('2026-10', 3)).toBe('2026-07')
  })
})

describe('resumirFluxo', () => {
  const meses = [
    { month: '2026-09', income: 1000_00, expense: -900_00 },
    { month: '2026-08', income: 1000_00, expense: -700_00 },
    { month: '2026-07', income: 1000_00, expense: -700_00 },
    // fora da janela de 6 meses
    { month: '2025-01', income: 0, expense: -5000_00 },
  ]
  const gastos = [
    { month: '2026-09', categoria: 'Mercado', cents: 500_00 },
    { month: '2026-09', categoria: 'Lazer', cents: 300_00 },
    { month: '2026-09', categoria: 'Casa', cents: 100_00 },
    { month: '2026-08', categoria: 'Mercado', cents: 400_00 },
    { month: '2026-08', categoria: 'Casa', cents: 300_00 },
    { month: '2026-07', categoria: 'Mercado', cents: 400_00 },
    { month: '2026-07', categoria: 'Casa', cents: 300_00 },
  ]

  it('compara o mês fechado com a média dos meses com movimento e aponta as causas', () => {
    const r = resumirFluxo(meses, gastos, '2026-10')!
    expect(r.mes).toBe('2026-09')
    expect(r.sobra).toBe(100_00)
    expect(r.mediaSobra).toBe(300_00)
    expect(r.mesesNaMedia).toBe(2)
    expect(r.explicam).toEqual([
      { item: 'Lazer', impacto: -300_00 },
      { item: 'Mercado', impacto: -100_00 },
    ])
    expect(r.categorias.map((c) => c.categoria)).toEqual(['Mercado', 'Lazer', 'Casa'])
    expect(r.categorias[2]).toMatchObject({ cents: 100_00, media: 300_00, variacao: -200_00 })
  })

  it('quando sobrou mais, aponta o que ajudou, inclusive receita', () => {
    const r = resumirFluxo(
      [{ month: '2026-09', income: 2000_00, expense: -700_00 }, ...meses.slice(1)],
      gastos.filter((g) => g.month !== '2026-09').concat({ month: '2026-09', categoria: 'Mercado', cents: 700_00 }),
      '2026-10',
    )!
    expect(r.explicam[0]).toEqual({ item: 'Receitas', impacto: 1000_00 })
    expect(r.explicam[1]).toEqual({ item: 'Casa', impacto: 300_00 })
  })

  it('sem histórico não inventa média', () => {
    const r = resumirFluxo([meses[0]], gastos, '2026-10')!
    expect(r.mediaSobra).toBeNull()
    expect(r.explicam).toEqual([])
  })

  it('sem movimento no mês fechado devolve null', () => {
    expect(resumirFluxo(meses, gastos, '2026-12')).toBeNull()
  })
})
