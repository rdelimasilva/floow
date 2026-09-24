import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  date,
  numeric,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { numericNumber } from './numeric-number'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const assetClassEnum = pgEnum('asset_class', [
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

export const eventTypeEnum = pgEnum('event_type', [
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

/** De onde vem o ativo. `openfinance` é somente leitura na tela. */
export const assetSourceEnum = pgEnum('asset_source', ['manual', 'openfinance'])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    ticker: text('ticker'),
    name: text('name').notNull(),
    assetClass: assetClassEnum('asset_class').notNull(),
    currency: text('currency').notNull().default('BRL'),
    notes: text('notes'),
    source: assetSourceEnum('source').notNull().default('manual'),
    /** `investment_type` da Polp: CDB, LCI, DEBENTURES, CRI... */
    assetSubtype: text('asset_subtype'),
    isin: text('isin'),
    /** CNPJ do fundo ou do emissor. */
    cnpj: text('cnpj'),
    issuerName: text('issuer_name'),
    /** CDI, IPCA, SELIC, PRE_FIXADO, OUTROS. */
    indexer: text('indexer'),
    /** Fração: 0.15 = 15% a.a. */
    preFixedRate: numericNumber('pre_fixed_rate'),
    /** Fração: 1.0 = 100% do indexador. */
    indexerPercentage: numericNumber('indexer_percentage'),
    dueDate: date('due_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAssetsOrgId: index('idx_assets_org_id').on(table.orgId),
    idxAssetsTicker: index('idx_assets_ticker').on(table.orgId, table.ticker),
  })
)

export const portfolioEvents = pgTable(
  'portfolio_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    // Application-level FK to accounts — not a DB FK to avoid cross-schema complications
    accountId: uuid('account_id').notNull(),
    eventType: eventTypeEnum('event_type').notNull(),
    eventDate: date('event_date', { mode: 'date' }).notNull(),
    // null for dividend/interest events (no quantity change)
    quantity: numericNumber('quantity'),
    // null for split events (no price)
    priceCents: integer('price_cents'),
    totalCents: integer('total_cents'),
    // decimal ratio for splits (e.g., 2.0000 for 2-for-1 split)
    splitRatio: numeric('split_ratio', { precision: 10, scale: 4 }),
    notes: text('notes'),
    // set after INV-07 integration with transaction engine
    transactionId: uuid('transaction_id'),
    /** Preço unitário cheio vindo do banco. `price_cents` segue arredondado para a tela. */
    unitPrice: numericNumber('unit_price'),
    /** `id` da movimentação na Polp — upsert idempotente. */
    polpTransactionId: text('polp_transaction_id'),
    grossCents: integer('gross_cents'),
    netCents: integer('net_cents'),
    incomeTaxCents: integer('income_tax_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxPortfolioEventsOrgId: index('idx_portfolio_events_org_id').on(table.orgId),
    idxPortfolioEventsAssetId: index('idx_portfolio_events_asset_id').on(table.assetId),
    idxPortfolioEventsDate: index('idx_portfolio_events_date').on(table.orgId, table.eventDate),
    uqPolpTransaction: uniqueIndex('uq_portfolio_events_polp_tx').on(table.polpTransactionId),
  })
)

export const assetPrices = pgTable(
  'asset_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    priceDate: date('price_date', { mode: 'date' }).notNull(),
    priceCents: integer('price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAssetPricesAssetDate: index('idx_asset_prices_asset_date').on(
      table.assetId,
      table.priceDate
    ),
    idxAssetPricesOrgAssetDate: index('idx_asset_prices_org_asset_date').on(
      table.orgId,
      table.assetId,
      table.priceDate
    ),
  })
)

export const assetPositionSnapshots = pgTable(
  'asset_position_snapshots',
  {
    assetId: uuid('asset_id')
      .primaryKey()
      .references(() => assets.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    quantityHeld: numericNumber('quantity_held').notNull(),
    avgCostCents: integer('avg_cost_cents').notNull(),
    totalCostCents: integer('total_cost_cents').notNull(),
    currentPriceCents: integer('current_price_cents').notNull(),
    currentValueCents: integer('current_value_cents').notNull(),
    unrealizedPnLCents: integer('unrealized_pnl_cents').notNull(),
    unrealizedPnLPercentBps: integer('unrealized_pnl_percent_bps').notNull(),
    realizedPnLCents: integer('realized_pnl_cents').notNull(),
    totalDividendsCents: integer('total_dividends_cents').notNull(),
    /** Selo "custo parcial": posição do banco sem histórico completo de compra. */
    costIsPartial: boolean('cost_is_partial').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAssetPositionSnapshotsOrgId: index('idx_asset_position_snapshots_org_id').on(table.orgId),
    idxAssetPositionSnapshotsOrgValue: index('idx_asset_position_snapshots_org_value').on(table.orgId, table.currentValueCents),
    uqAssetPositionSnapshotsAssetOrg: uniqueIndex('uq_asset_position_snapshots_asset_org').on(table.assetId, table.orgId),
  })
)

/**
 * Posição que o BANCO informou, uma linha por dia de referência.
 *
 * Para ativo do Open Finance é a fonte da verdade do valor: o histórico de
 * movimentações cobre ~12 meses, então reconstruir a posição pelos eventos
 * divergiria do banco em qualquer ativo mais antigo.
 */
export const assetBankPositions = pgTable(
  'asset_bank_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    referenceDate: date('reference_date', { mode: 'string' }).notNull(),
    quantity: numericNumber('quantity'),
    unitPrice: numericNumber('unit_price'),
    grossCents: integer('gross_cents'),
    netCents: integer('net_cents'),
    incomeTaxCents: integer('income_tax_cents'),
    iofCents: integer('iof_cents'),
    blockedCents: integer('blocked_cents'),
    purchaseUnitPrice: numericNumber('purchase_unit_price'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqAssetDate: uniqueIndex('uq_asset_bank_positions_asset_date').on(table.assetId, table.referenceDate),
    idxOrg: index('idx_asset_bank_positions_org').on(table.orgId),
  })
)

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert

// NOTE: PortfolioEventRow used (not PortfolioEvent) to avoid clash with the
// pure function interface PortfolioEventInput in core-finance/portfolio.ts
export type PortfolioEventRow = typeof portfolioEvents.$inferSelect
export type NewPortfolioEventRow = typeof portfolioEvents.$inferInsert

export type AssetPrice = typeof assetPrices.$inferSelect
export type NewAssetPrice = typeof assetPrices.$inferInsert
export type AssetPositionSnapshot = typeof assetPositionSnapshots.$inferSelect
export type NewAssetPositionSnapshot = typeof assetPositionSnapshots.$inferInsert

export type AssetBankPosition = typeof assetBankPositions.$inferSelect
export type NewAssetBankPosition = typeof assetBankPositions.$inferInsert
