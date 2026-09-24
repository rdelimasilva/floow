import { describe, it, expect } from 'vitest'
import { ASSET_CLASS_COLORS } from '@/components/investments/allocation-chart'
import { ASSET_CLASS_LABEL } from '@/lib/investments/asset-labels'

describe('ASSET_CLASS_COLORS', () => {
  it('toda classe tem cor própria (fundo, tesouro e crédito não caem no cinza)', () => {
    const classes = Object.keys(ASSET_CLASS_LABEL) as Array<keyof typeof ASSET_CLASS_LABEL>
    const cores = classes.map((c) => ASSET_CLASS_COLORS[c])
    expect(cores.every(Boolean)).toBe(true)
    expect(new Set(cores).size).toBe(classes.length)
  })
})
