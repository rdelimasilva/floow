import { describe, it, expect } from 'vitest'
import { positionBadges } from '@/components/investments/position-badges'

describe('positionBadges', () => {
  it('ativo manual não tem selo', () => {
    expect(positionBadges({ source: 'manual', costIsPartial: false })).toEqual([])
  })
  it('ativo do banco tem selo de origem', () => {
    expect(positionBadges({ source: 'openfinance', costIsPartial: false }).map((b) => b.label)).toEqual(['Open Finance'])
  })
  it('custo parcial explica o porquê', () => {
    const b = positionBadges({ source: 'openfinance', costIsPartial: true })
    expect(b.map((x) => x.label)).toEqual(['Open Finance', 'Custo parcial'])
    expect(b[1].title).toMatch(/12 meses/)
  })
})
