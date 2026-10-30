import { describe, it, expect } from 'vitest'
import { contraste, corDeTextoSobreTinta } from '@/lib/cor-legivel'

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function fundoDaTinta(hex: string): [number, number, number] {
  const a = 0x20 / 255
  return rgb(hex).map((c) => c * a + 255 * (1 - a)) as [number, number, number]
}

describe('corDeTextoSobreTinta', () => {
  it.each(['#eab308', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#06b6d4', '#ffffff'])(
    'passa de 4,5:1 sobre o fundo tingido de %s',
    (cor) => {
      expect(contraste(rgb(corDeTextoSobreTinta(cor)), fundoDaTinta(cor))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('mantém a cor quando ela já é escura o bastante', () => {
    expect(corDeTextoSobreTinta('#1e3a8a')).toBe('#1e3a8a')
  })

  it('volta cinza-700 para cor fora do formato #rrggbb', () => {
    expect(corDeTextoSobreTinta('blue')).toBe('#374151')
    expect(corDeTextoSobreTinta('')).toBe('#374151')
  })
})
