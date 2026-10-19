import { describe, it, expect } from 'vitest'
import { posicaoVigente, type LeituraDoBanco } from '@/lib/investments/posicao-vigente'

/**
 * Caso real (XP, 19/10/2026): o sync trouxe, com data de domingo 18/10, saldo
 * zero em todos os títulos do Tesouro — R$ 444 mil a menos na conta — sem
 * venda nem resgate. A posição de 15/10 continuava valendo na corretora.
 */

const leitura = (referenceDate: string, quantity: number, netCents: number, unitPrice: number | null = 900): LeituraDoBanco => ({
  referenceDate, quantity, grossCents: netCents, netCents, unitPrice, purchaseUnitPrice: 862.76,
})
const zeroDoBanco = (d: string) => leitura(d, 0, 0, 0)
/** O que `zerarAusentes` grava: decisão nossa, sem PU. */
const zeroDeAusencia = (d: string) => leitura(d, 0, 0, null)

describe('posicaoVigente', () => {
  it('zero isolado do banco não apaga a última posição com saldo', () => {
    const p = posicaoVigente([zeroDoBanco('2026-10-18'), leitura('2026-10-15', 384.44, 34016789)])
    expect(p?.netCents).toBe(34016789)
    expect(p?.quantity).toBe(384.44)
  })

  it('zero do banco confirmado por uma segunda leitura vale', () => {
    const p = posicaoVigente([zeroDoBanco('2026-10-19'), zeroDoBanco('2026-10-18'), leitura('2026-10-15', 384.44, 34016789)])
    expect(p?.netCents).toBe(0)
  })

  it('zero de ausência na listagem vale na hora', () => {
    const p = posicaoVigente([zeroDeAusencia('2026-10-19'), leitura('2026-10-15', 9, 982595)])
    expect(p?.netCents).toBe(0)
  })

  it('posição com saldo mais nova vale', () => {
    const p = posicaoVigente([leitura('2026-10-18', 10, 1368796), leitura('2026-10-15', 10, 1360000)])
    expect(p?.netCents).toBe(1368796)
  })

  it('primeira leitura zerada e sem histórico vale', () => {
    expect(posicaoVigente([zeroDoBanco('2026-10-18')])?.netCents).toBe(0)
  })

  it('sem leitura nenhuma devolve null', () => {
    expect(posicaoVigente([])).toBeNull()
  })
})
