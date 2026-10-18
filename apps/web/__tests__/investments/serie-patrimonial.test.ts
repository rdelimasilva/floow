import { describe, it, expect } from 'vitest'
import { serieMensalDoPatrimonio, rotuloDoEixoY } from '@/lib/investments/serie-patrimonial'

// Revisão de 18/10/2026: um ponto por snapshot repetia "mar. de 26" 4× e
// "set. de 26" 4×, e maio–agosto sumiam do eixo.
const snap = (dia: string, netWorthCents: number, createdAt = `${dia}T12:00:00Z`) => ({
  snapshotDate: `${dia}T00:00:00.000Z`, createdAt, netWorthCents,
})

describe('série mensal da evolução patrimonial', () => {
  it('um ponto por mês, com o último snapshot do mês', () => {
    const serie = serieMensalDoPatrimonio([
      snap('2026-03-18', 0, '2026-03-18T00:22:00Z'),
      snap('2026-03-18', 287150, '2026-03-18T01:44:00Z'),
      snap('2026-03-24', 2421957),
      snap('2026-04-01', 3105825),
    ], new Date('2026-04-10T12:00:00Z'))
    expect(serie).toEqual([
      { mes: '2026-03', date: 'mar. de 26', netWorthCents: 2421957 },
      { mes: '2026-04', date: 'abr. de 26', netWorthCents: 3105825 },
    ])
  })

  it('mês sem snapshot aparece no eixo sem valor, até o mês atual', () => {
    const serie = serieMensalDoPatrimonio([
      snap('2026-04-01', 3105825),
      snap('2026-09-29', 62135786),
    ], new Date('2026-10-18T12:00:00Z'))
    expect(serie.map((p) => p.date)).toEqual([
      'abr. de 26', 'mai. de 26', 'jun. de 26', 'jul. de 26', 'ago. de 26', 'set. de 26', 'out. de 26',
    ])
    expect(serie.map((p) => p.netWorthCents)).toEqual([3105825, null, null, null, null, 62135786, null])
  })

  it('sem snapshot, série vazia', () => {
    expect(serieMensalDoPatrimonio([], new Date('2026-10-18T12:00:00Z'))).toEqual([])
  })
})

describe('rótulo do eixo Y', () => {
  it('abrevia em mil e milhão', () => {
    expect(rotuloDoEixoY(62135786)).toBe('R$ 621 mil')
    expect(rotuloDoEixoY(150000000)).toBe('R$ 1,5 mi')
    expect(rotuloDoEixoY(-1408263)).toBe('-R$ 14 mil')
    expect(rotuloDoEixoY(0)).toBe('R$ 0')
  })
})
