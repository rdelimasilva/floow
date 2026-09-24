import { describe, it, expect } from 'vitest'
import { snapshotRowFor } from '@/lib/investments/position-snapshots'

/**
 * `recomputeOrgPositionSnapshots` roda em toda ação manual e recalcula todos
 * os ativos da org. Ativo de origem `openfinance` tem de continuar usando a
 * posição do banco — nunca eventos+preço manual (Review Focus #1). Este
 * teste prende essa escolha na função pura, sem precisar de banco.
 */

const compra = (qty: number, total: number, d = '2026-01-10') => ({
  eventType: 'buy',
  quantity: qty,
  priceCents: null,
  totalCents: total,
  splitRatio: null,
  eventDate: new Date(d),
})

describe('snapshotRowFor', () => {
  it('ativo openfinance usa a posição do banco (líquido) e ignora preço manual', () => {
    const row = snapshotRowFor(
      'org-1',
      { id: 'asset-1', source: 'openfinance' },
      {
        events: [compra(10, 10000)],
        bank: { quantity: 10, grossCents: 15000, netCents: 14000, purchaseUnitPrice: null },
        // Preço manual bem diferente do banco — não pode vazar para o valor.
        latestPriceCents: 999999,
      }
    )

    expect(row).not.toBeNull()
    expect(row!.currentValueCents).toBe(14000)
    expect(row!.currentPriceCents).toBe(1400)
  })

  it('ativo openfinance sem posição do banco ainda gera linha, com valor 0', () => {
    const row = snapshotRowFor(
      'org-1',
      { id: 'asset-2', source: 'openfinance' },
      {
        events: [compra(10, 10000)],
        bank: null,
        latestPriceCents: 1500,
      }
    )

    expect(row).not.toBeNull()
    expect(row!.currentValueCents).toBe(0)
    expect(row!.quantityHeld).toBe(0)
    expect(row!.costIsPartial).toBe(true)
  })

  it('ativo manual usa eventos x preço manual, como antes', () => {
    const row = snapshotRowFor(
      'org-1',
      { id: 'asset-3', source: 'manual' },
      {
        events: [compra(10, 10000)],
        bank: { quantity: 10, grossCents: 99999, netCents: 99999, purchaseUnitPrice: null },
        latestPriceCents: 1500,
      }
    )

    expect(row).not.toBeNull()
    expect(row!.quantityHeld).toBe(10)
    expect(row!.currentPriceCents).toBe(1500)
    expect(row!.currentValueCents).toBe(15000)
    expect(row!.costIsPartial).toBe(false)
  })
})
