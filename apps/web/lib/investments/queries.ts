import {
  getDb,
  assets,
  portfolioEvents,
  assetPrices,
  patrimonySnapshots,
} from '@floow/db'
import { cache } from 'react'
import { eq, and, desc, asc, inArray, gte, sql } from 'drizzle-orm'
import { computePosition } from '@floow/core-finance'
import { getOrgId } from '@/lib/finance/queries'

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface EnrichedPosition {
  // Asset metadata
  assetId: string
  ticker: string
  name: string
  assetClass: string
  // Computed position fields
  quantityHeld: number
  avgCostCents: number
  totalCostCents: number
  currentPriceCents: number
  currentValueCents: number
  unrealizedPnLCents: number
  unrealizedPnLPercent: number
  realizedPnLCents: number
  totalDividendsCents: number
}

export interface PriceHistoryEntry {
  priceDate: Date
  priceCents: number
  createdAt: Date
}

export interface IncomeEventWithAsset {
  id: string
  assetId: string
  eventType: string
  eventDate: Date
  totalCents: number | null
  notes: string | null
  ticker: string
  name: string
}

export interface PortfolioEventDetail {
  id: string
  assetId: string
  accountId: string
  eventType: string
  eventDate: Date
  quantity: number | null
  priceCents: number | null
  totalCents: number | null
  splitRatio: string | null
  notes: string | null
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Returns all assets for the given org, ordered by ticker.
 */
export async function getAssets(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(assets)
    .where(eq(assets.orgId, orgId))
    .orderBy(asc(assets.ticker))
}

/**
 * Returns a single portfolio event by ID, verifying org ownership.
 */
export async function getPortfolioEventById(orgId: string, eventId: string): Promise<PortfolioEventDetail | null> {
  const db = getDb()

  const [row] = await db
    .select({
      id: portfolioEvents.id,
      assetId: portfolioEvents.assetId,
      accountId: portfolioEvents.accountId,
      eventType: portfolioEvents.eventType,
      eventDate: portfolioEvents.eventDate,
      quantity: portfolioEvents.quantity,
      priceCents: portfolioEvents.priceCents,
      totalCents: portfolioEvents.totalCents,
      splitRatio: portfolioEvents.splitRatio,
      notes: portfolioEvents.notes,
    })
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, eventId), eq(portfolioEvents.orgId, orgId)))
    .limit(1)

  if (!row) return null

  return {
    ...row,
    eventDate: row.eventDate instanceof Date ? row.eventDate : new Date(row.eventDate as unknown as string),
    splitRatio: row.splitRatio ? String(row.splitRatio) : null,
  }
}

/**
 * Returns portfolio events for the given org, with optional asset filter.
 * Ordered by eventDate descending (most recent first).
 */
export async function getPortfolioEvents(orgId: string, assetId?: string) {
  const db = getDb()

  const where = assetId
    ? and(eq(portfolioEvents.orgId, orgId), eq(portfolioEvents.assetId, assetId))
    : eq(portfolioEvents.orgId, orgId)

  return db
    .select()
    .from(portfolioEvents)
    .where(where)
    .orderBy(desc(portfolioEvents.eventDate))
}

/**
 * Returns a Map of assetId -> most recent priceCents for all assets in the org.
 * Uses DISTINCT ON to efficiently fetch only the latest price per asset in SQL.
 */
export async function getLatestPrices(orgId: string): Promise<Map<string, number>> {
  const db = getDb()

  // Use raw SQL with DISTINCT ON to fetch only the latest price per asset
  // This is dramatically faster than fetching all prices and filtering in JS
  const rows = await db.execute<{ asset_id: string; price_cents: number }>(
    sql`SELECT DISTINCT ON (asset_id) asset_id, price_cents
        FROM asset_prices
        WHERE org_id = ${orgId}
        ORDER BY asset_id, price_date DESC`
  )

  const latestPrices = new Map<string, number>()
  for (const row of rows) {
    latestPrices.set(row.asset_id, row.price_cents)
  }

  return latestPrices
}

/**
 * Returns full price history for a given asset, ordered chronologically (oldest first).
 * Fulfills INV-06: view historical prices and asset evolution per asset.
 */
export async function getPriceHistory(orgId: string, assetId: string): Promise<PriceHistoryEntry[]> {
  const db = getDb()

  const rows = await db
    .select({
      priceDate: assetPrices.priceDate,
      priceCents: assetPrices.priceCents,
      createdAt: assetPrices.createdAt,
    })
    .from(assetPrices)
    .where(and(eq(assetPrices.orgId, orgId), eq(assetPrices.assetId, assetId)))
    .orderBy(asc(assetPrices.priceDate))

  return rows as PriceHistoryEntry[]
}

/**
 * Core query: fetch all assets, compute positions via computePosition(),
 * and return enriched position objects with PnL metrics.
 *
 * Filters out zero-quantity positions unless they have realized PnL
 * (fully sold positions with historical gains remain visible).
 */
export const getPositions = cache(async function getPositions(orgId: string): Promise<EnrichedPosition[]> {
  const db = getDb()

  // Fetch all assets and their events in parallel
  const [allAssets, allEvents, latestPrices] = await Promise.all([
    getAssets(orgId),
    db
      .select({
        assetId: portfolioEvents.assetId,
        eventType: portfolioEvents.eventType,
        eventDate: portfolioEvents.eventDate,
        quantity: portfolioEvents.quantity,
        priceCents: portfolioEvents.priceCents,
        totalCents: portfolioEvents.totalCents,
        splitRatio: portfolioEvents.splitRatio,
      })
      .from(portfolioEvents)
      .where(eq(portfolioEvents.orgId, orgId))
      .orderBy(asc(portfolioEvents.eventDate)),
    getLatestPrices(orgId),
  ])

  // Group events by assetId
  const eventsByAsset = new Map<string, typeof allEvents>()
  for (const event of allEvents) {
    const list = eventsByAsset.get(event.assetId) ?? []
    list.push(event)
    eventsByAsset.set(event.assetId, list)
  }

  const positions: EnrichedPosition[] = []

  for (const asset of allAssets) {
    const events = eventsByAsset.get(asset.id) ?? []
    const currentPriceCents = latestPrices.get(asset.id) ?? 0

    // Map DB rows to PortfolioEventInput for pure function
    const eventInputs = events.map((e) => ({
      eventType: e.eventType as 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization',
      quantity: e.quantity,
      priceCents: e.priceCents,
      totalCents: e.totalCents,
      splitRatio: e.splitRatio,
      eventDate: e.eventDate instanceof Date ? e.eventDate : new Date(e.eventDate as unknown as string),
    }))

    const result = computePosition(eventInputs, currentPriceCents)

    // Skip zero-quantity positions with no realized PnL and no dividends (never had activity)
    if (result.quantityHeld === 0 && result.realizedPnLCents === 0 && result.totalDividendsCents === 0) {
      continue
    }

    const currentValueCents = result.quantityHeld * currentPriceCents
    const unrealizedPnLCents = currentValueCents - result.totalCostCents
    const unrealizedPnLPercent = result.totalCostCents > 0
      ? Math.round((unrealizedPnLCents / result.totalCostCents) * 10000) / 100
      : 0

    positions.push({
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass,
      quantityHeld: result.quantityHeld,
      avgCostCents: result.avgCostCents,
      totalCostCents: result.totalCostCents,
      currentPriceCents,
      currentValueCents,
      unrealizedPnLCents,
      unrealizedPnLPercent,
      realizedPnLCents: result.realizedPnLCents,
      totalDividendsCents: result.totalDividendsCents,
    })
  }

  return positions
})

/**
 * Returns income events (dividend, interest, amortization) for the last N months.
 * Queries portfolio_events (NOT transactions) to avoid INV-07 double-counting.
 * Uses a single JOIN with assets and filters by date in SQL for efficiency.
 */
export async function getIncomeEvents(orgId: string, months: number = 12): Promise<IncomeEventWithAsset[]> {
  const db = getDb()

  const INCOME_TYPES: Array<'dividend' | 'interest' | 'amortization'> = ['dividend', 'interest', 'amortization']

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)

  // Single query with JOIN and date filter in SQL (no JS filtering or second query)
  const rows = await db
    .select({
      id: portfolioEvents.id,
      assetId: portfolioEvents.assetId,
      eventType: portfolioEvents.eventType,
      eventDate: portfolioEvents.eventDate,
      totalCents: portfolioEvents.totalCents,
      notes: portfolioEvents.notes,
      ticker: assets.ticker,
      name: assets.name,
    })
    .from(portfolioEvents)
    .innerJoin(assets, eq(portfolioEvents.assetId, assets.id))
    .where(
      and(
        eq(portfolioEvents.orgId, orgId),
        inArray(portfolioEvents.eventType, INCOME_TYPES),
        gte(portfolioEvents.eventDate, cutoff)
      )
    )
    .orderBy(desc(portfolioEvents.eventDate))

  return rows.map((e) => ({
    id: e.id,
    assetId: e.assetId,
    eventType: e.eventType,
    eventDate: e.eventDate instanceof Date ? e.eventDate : new Date(e.eventDate as unknown as string),
    totalCents: e.totalCents,
    notes: e.notes,
    ticker: e.ticker,
    name: e.name,
  }))
}

/**
 * Returns historical patrimony snapshots for the given org, ordered by snapshotDate ascending.
 * Used by the net worth evolution chart (DASH-03).
 *
 * @param orgId - Organization ID
 * @param months - Number of most recent months to include (default: 12)
 * @returns Array of PatrimonySnapshot rows ordered oldest-first for chronological chart display
 */
export async function getPatrimonySnapshots(orgId: string, months: number = 12) {
  const db = getDb()

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)

  return db
    .select()
    .from(patrimonySnapshots)
    .where(and(eq(patrimonySnapshots.orgId, orgId), gte(patrimonySnapshots.snapshotDate, cutoff)))
    .orderBy(asc(patrimonySnapshots.snapshotDate))
}
