import { describe, it, expect } from 'vitest'
import { computeBankPosition } from '../bank-position'
import type { PortfolioEventInput } from '../portfolio'

const compra = (qty: number, total: number, d = '2026-01-10'): PortfolioEventInput => ({
  eventType: 'buy', quantity: qty, priceCents: null, totalCents: total, splitRatio: null, eventDate: new Date(d),
})

describe('computeBankPosition', () => {
  it('valor vem do banco (líquido) e custo do preço de compra informado', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 12000, netCents: 11500, purchaseUnitPrice: 100 }, [])
    expect(r.currentValueCents).toBe(11500)
    expect(r.totalCostCents).toBe(100000)
    expect(r.costIsPartial).toBe(false)
    expect(r.quantityHeld).toBe(10)
    expect(r.currentPriceCents).toBe(1150)
  })

  it('sem líquido usa o bruto', () => {
    expect(computeBankPosition({ quantity: 2, grossCents: 5000, netCents: null, purchaseUnitPrice: null }, []).currentValueCents).toBe(5000)
  })

  it('sem preço de compra, custo sai dos eventos e é parcial', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 12000, netCents: null, purchaseUnitPrice: null }, [compra(10, 10000)])
    expect(r.totalCostCents).toBe(10000)
    expect(r.costIsPartial).toBe(true)
  })

  it('proventos e realizado vêm dos eventos', () => {
    const r = computeBankPosition({ quantity: 10, grossCents: 1, netCents: null, purchaseUnitPrice: 1 }, [
      compra(10, 1000),
      { ...compra(0, 70), eventType: 'jcp', quantity: null },
    ])
    expect(r.totalDividendsCents).toBe(70)
  })

  it('sem posição do banco: tudo zero, custo parcial', () => {
    const r = computeBankPosition(null, [compra(10, 1000)])
    expect(r.currentValueCents).toBe(0)
    expect(r.quantityHeld).toBe(0)
    expect(r.costIsPartial).toBe(true)
  })

  it('resgatado por inteiro: quantidade 0 zera valor e preço, sem dividir por zero', () => {
    const r = computeBankPosition({ quantity: 0, grossCents: 0, netCents: 0, purchaseUnitPrice: 100 }, [])
    expect(r.currentValueCents).toBe(0)
    expect(r.currentPriceCents).toBe(0)
    expect(r.avgCostCents).toBe(0)
  })

  it('resgatado por inteiro com eventos: custo zera (sem -100% falso), realizado e proventos seguem', () => {
    const r = computeBankPosition({ quantity: 0, grossCents: 0, netCents: 0, purchaseUnitPrice: null }, [
      compra(10, 1000),
      { ...compra(0, 50), eventType: 'dividend', quantity: null },
    ])
    expect(r.totalCostCents).toBe(0)
    expect(r.avgCostCents).toBe(0)
    expect(r.currentValueCents - r.totalCostCents).toBe(0)
    expect(r.totalDividendsCents).toBe(50)
  })
})
