import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
  date,
  numeric,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'

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
])

export const eventTypeEnum = pgEnum('event_type', [
  'buy',
  'sell',
  'dividend',
  'interest',
  'split',
  'amortization',
])

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
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    assetClass: assetClassEnum('asset_class').notNull(),
    currency: text('currency').notNull().default('BRL'),
    notes: text('notes'),
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
    quantity: integer('quantity'),
    // null for split events (no price)
    priceCents: integer('price_cents'),
    totalCents: integer('total_cents'),
    // decimal ratio for splits (e.g., 2.0000 for 2-for-1 split)
    splitRatio: numeric('split_ratio', { precision: 10, scale: 4 }),
    notes: text('notes'),
    // set after INV-07 integration with transaction engine
    transactionId: uuid('transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxPortfolioEventsOrgId: index('idx_portfolio_events_org_id').on(table.orgId),
    idxPortfolioEventsAssetId: index('idx_portfolio_events_asset_id').on(table.assetId),
    idxPortfolioEventsDate: index('idx_portfolio_events_date').on(table.orgId, table.eventDate),
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
