import { describe, it, expect } from 'vitest'
import { aplicarRedirecionamentos } from '@/lib/finance/polp-redirect'

describe('aplicarRedirecionamentos', () => {
  it('o redirecionamento vence a categoria que carrega o código', () => {
    const index = new Map([['TRANSPORTATION', 'sys-1']])

    const final = aplicarRedirecionamentos(
      index,
      [{ polpRef: 'TRANSPORTATION', categoryId: 'destino-1' }],
      new Set(['sys-1', 'destino-1']),
    )

    expect(final.get('TRANSPORTATION')).toBe('destino-1')
  })

  it('cobre o código que ficou sem categoria nenhuma', () => {
    // O caso real: a categoria com o código foi escondida, então ele nem entra
    // no índice base.
    const final = aplicarRedirecionamentos(
      new Map(),
      [{ polpRef: 'TRANSPORTATION', categoryId: 'destino-1' }],
      new Set(['destino-1']),
    )

    expect(final.get('TRANSPORTATION')).toBe('destino-1')
  })

  it('ignora destino que a org não vê mais', () => {
    const index = new Map([['TRANSPORTATION', 'sys-1']])

    const final = aplicarRedirecionamentos(
      index,
      [{ polpRef: 'TRANSPORTATION', categoryId: 'escondida-1' }],
      new Set(['sys-1']),
    )

    expect(final.get('TRANSPORTATION')).toBe('sys-1')
  })
})
