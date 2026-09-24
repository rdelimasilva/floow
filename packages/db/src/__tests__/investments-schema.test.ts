import { describe, it, expect } from 'vitest'
import {
  assetClassEnum,
  eventTypeEnum,
  assetSourceEnum,
  assets,
  portfolioEvents,
  assetPrices,
  assetBankPositions,
  assetPositionSnapshots,
} from '../schema/investments'
import { openfinanceConnections, openfinanceResources } from '../schema/openfinance'

describe('investments schema: enums', () => {
  it('assetClassEnum exports with correct values', () => {
    expect(assetClassEnum.enumValues).toEqual([
      'br_equity',
      'fii',
      'etf',
      'crypto',
      'fixed_income',
      'international',
      'fund',
      'treasury',
      'credit_fixed_income',
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
      'come_cotas',
      'jcp',
      'maturity',
      'tax',
      'other',
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

describe('investments schema: Open Finance', () => {
  it('asset_class inclui as classes novas', () => {
    expect(assetClassEnum.enumValues).toEqual([
      'br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international',
      'fund', 'treasury', 'credit_fixed_income',
    ])
  })

  it('event_type inclui os tipos novos', () => {
    expect(eventTypeEnum.enumValues).toEqual([
      'buy', 'sell', 'dividend', 'interest', 'split', 'amortization',
      'come_cotas', 'jcp', 'maturity', 'tax', 'other',
    ])
  })

  it('asset_source separa manual de openfinance', () => {
    expect(assetSourceEnum.enumValues).toEqual(['manual', 'openfinance'])
  })

  it('assets tem os metadados do banco e ticker anulável', () => {
    for (const col of ['source', 'assetSubtype', 'isin', 'cnpj', 'issuerName', 'indexer', 'preFixedRate', 'indexerPercentage', 'dueDate']) {
      expect((assets as unknown as Record<string, unknown>)[col]).toBeDefined()
    }
    expect(assets.ticker.notNull).toBe(false)
  })

  it('portfolio_events guarda a movimentação da Polp', () => {
    for (const col of ['unitPrice', 'polpTransactionId', 'grossCents', 'netCents', 'incomeTaxCents']) {
      expect((portfolioEvents as unknown as Record<string, unknown>)[col]).toBeDefined()
    }
    expect(portfolioEvents.quantity.getSQLType()).toBe('numeric(28, 10)')
  })

  it('asset_bank_positions existe com dinheiro em centavos', () => {
    for (const col of ['assetId', 'orgId', 'referenceDate', 'quantity', 'unitPrice', 'grossCents', 'netCents', 'incomeTaxCents', 'iofCents', 'blockedCents', 'purchaseUnitPrice']) {
      expect((assetBankPositions as unknown as Record<string, unknown>)[col]).toBeDefined()
    }
  })

  it('snapshot marca custo parcial e openfinance_resources aponta para o ativo', () => {
    expect(assetPositionSnapshots.costIsPartial).toBeDefined()
    expect(openfinanceResources.assetId).toBeDefined()
    expect(openfinanceConnections.investmentAccountId).toBeDefined()
  })
})

describe('openfinance schema: conexão guiada', () => {
  it('guarda o destino escolhido antes da autorização', () => {
    expect(openfinanceConnections.targetAccountId.name).toBe('target_account_id')
    expect(openfinanceConnections.targetCardAccountId.name).toBe('target_card_account_id')
    expect(openfinanceConnections.targetAccountNewName.name).toBe('target_account_new_name')
    expect(openfinanceConnections.targetCardNewName.name).toBe('target_card_new_name')
    expect(openfinanceConnections.autoLinkDoneAt.name).toBe('auto_link_done_at')
  })
})
