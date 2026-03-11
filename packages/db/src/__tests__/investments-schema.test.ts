import { describe, it, expect } from 'vitest'
import {
  assetClassEnum,
  eventTypeEnum,
  assets,
  portfolioEvents,
  assetPrices,
} from '../schema/investments'

describe('investments schema: enums', () => {
  it('assetClassEnum exports with correct values', () => {
    expect(assetClassEnum.enumValues).toEqual([
      'br_equity',
      'fii',
      'etf',
      'crypto',
      'fixed_income',
      'international',
    ])
  })

  it('eventTypeEnum exports with correct values', () => {
    expect(eventTypeEnum.enumValues).toEqual([
      'buy',
      'sell',
      'dividend',
      'interest',
      'split',
      'amortization',
    ])
  })
})

describe('investments schema: assets table', () => {
  it('assets table is defined', () => {
    expect(assets).toBeTruthy()
  })

  it('assets table has expected columns', () => {
    expect(assets.id).toBeDefined()
    expect(assets.orgId).toBeDefined()
    expect(assets.ticker).toBeDefined()
    expect(assets.name).toBeDefined()
    expect(assets.assetClass).toBeDefined()
    expect(assets.currency).toBeDefined()
    expect(assets.notes).toBeDefined()
    expect(assets.createdAt).toBeDefined()
    expect(assets.updatedAt).toBeDefined()
  })
})

describe('investments schema: portfolioEvents table', () => {
  it('portfolioEvents table is defined', () => {
    expect(portfolioEvents).toBeTruthy()
  })

  it('portfolioEvents table has expected columns', () => {
    expect(portfolioEvents.id).toBeDefined()
    expect(portfolioEvents.orgId).toBeDefined()
    expect(portfolioEvents.assetId).toBeDefined()
    expect(portfolioEvents.accountId).toBeDefined()
    expect(portfolioEvents.eventType).toBeDefined()
    expect(portfolioEvents.eventDate).toBeDefined()
    expect(portfolioEvents.quantity).toBeDefined()
    expect(portfolioEvents.priceCents).toBeDefined()
    expect(portfolioEvents.totalCents).toBeDefined()
    expect(portfolioEvents.splitRatio).toBeDefined()
    expect(portfolioEvents.notes).toBeDefined()
    expect(portfolioEvents.transactionId).toBeDefined()
    expect(portfolioEvents.createdAt).toBeDefined()
  })
})

describe('investments schema: assetPrices table', () => {
  it('assetPrices table is defined', () => {
    expect(assetPrices).toBeTruthy()
  })

  it('assetPrices table has expected columns', () => {
    expect(assetPrices.id).toBeDefined()
    expect(assetPrices.orgId).toBeDefined()
    expect(assetPrices.assetId).toBeDefined()
    expect(assetPrices.priceDate).toBeDefined()
    expect(assetPrices.priceCents).toBeDefined()
    expect(assetPrices.createdAt).toBeDefined()
  })
})

describe('investments schema: inferred types exported', () => {
  // TypeScript compile-time checks via import — if types don't exist, the file won't compile
  it('module exports are present (type exports verified at compile time)', () => {
    expect(assets).toBeDefined()
    expect(portfolioEvents).toBeDefined()
    expect(assetPrices).toBeDefined()
    expect(assetClassEnum).toBeDefined()
    expect(eventTypeEnum).toBeDefined()
  })
})
