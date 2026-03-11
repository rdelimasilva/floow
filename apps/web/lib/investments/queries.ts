'use server'

import {
  createDb,
  assets,
  portfolioEvents,
  assetPrices,
} from '@floow/db'
import { eq, and, desc, asc, inArray } from 'drizzle-orm'
import { assertEnv } from '@floow/shared'
import { computePosition } from '@floow/core-finance/src/portfolio'
import { getOrgId } from '@/lib/finance/queries'

const DATABASE_URL = assertEnv('DATABASE_URL')

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

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Returns all assets for the given org, ordered by ticker.
 */
export async function getAssets(orgId: string) {
  const db = createDb(DATABASE_URL)
  return db
    .select()
    .from(assets)
    .where(eq(assets.orgId, orgId))
    .orderBy(asc(assets.ticker))
}

/**
 * Returns portfolio events for the given org, with optional asset filter.
 * Ordered by eventDate descending (most recent first).
 */
export async function getPortfolioEvents(orgId: string, assetId?: string) {
  const db = createDb(DATABASE_URL)

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
 * Uses a subquery approach: fetch all prices, group by assetId keeping the latest priceDate.
 */
export async function getLatestPrices(orgId: string): Promise<Map<string, number>> {
  const db = createDb(DATABASE_URL)

  // Fetch all prices for the org, ordered by priceDate descending
  const allPrices = await db
    .select({
      assetId: assetPrices.assetId,
      priceCents: assetPrices.priceCents,
      priceDate: assetPrices.priceDate,
    })
    .from(assetPrices)
    .where(eq(assetPrices.orgId, orgId))
    .orderBy(desc(assetPrices.priceDate))

  // Keep only the latest price per asset (first occurrence since ordered by priceDate desc)
  const latestPrices = new Map<string, number>()
  for (const row of allPrices) {
    if (!latestPrices.has(row.assetId)) {
      latestPrices.set(row.assetId, row.priceCents)
    }
  }

  return latestPrices
}

/**
 * Returns full price history for a given asset, ordered chronologically (oldest first).
 * Fulfills INV-06: view historical prices and asset evolution per asset.
 */
export async function getPriceHistory(orgId: string, assetId: string): Promise<PriceHistoryEntry[]> {
  const db = createDb(DATABASE_URL)

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
export async function getPositions(orgId: string): Promise<EnrichedPosition[]> {
  const db = createDb(DATABASE_URL)

  // Fetch all assets and their events in parallel
  const [allAssets, allEvents, latestPrices] = await Promise.all([
    getAssets(orgId),
    db
      .select()
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
}

/**
 * Returns income events (dividend, interest, amortization) for the last N months.
 * Queries portfolio_events (NOT transactions) to avoid INV-07 double-counting.
 * Joined with assets to include ticker/name.
 */
export async function getIncomeEvents(orgId: string, months: number = 12): Promise<IncomeEventWithAsset[]> {
  const db = createDb(DATABASE_URL)

  const INCOME_TYPES: Array<'dividend' | 'interest' | 'amortization'> = ['dividend', 'interest', 'amortization']

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffDate = cutoff.toISOString().split('T')[0]

  // Get income events in the date range
  const events = await db
    .select({
      id: portfolioEvents.id,
      assetId: portfolioEvents.assetId,
      eventType: portfolioEvents.eventType,
      eventDate: portfolioEvents.eventDate,
      totalCents: portfolioEvents.totalCents,
      notes: portfolioEvents.notes,
    })
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.orgId, orgId),
        inArray(portfolioEvents.eventType, INCOME_TYPES)
      )
    )
    .orderBy(desc(portfolioEvents.eventDate))

  // Filter by date in JS (simpler than SQL date comparison for Date type)
  const filteredEvents = events.filter((e) => {
    const eventDateStr = e.eventDate instanceof Date
      ? e.eventDate.toISOString().split('T')[0]
      : String(e.eventDate)
    return eventDateStr >= cutoffDate
  })

  if (filteredEvents.length === 0) {
    return []
  }

  // Fetch asset info for the relevant assets
  const assetIds = [...new Set(filteredEvents.map((e) => e.assetId))]
  const assetRows = await db
    .select({ id: assets.id, ticker: assets.ticker, name: assets.name })
    .from(assets)
    .where(inArray(assets.id, assetIds))

  const assetMap = new Map(assetRows.map((a) => [a.id, a]))

  return filteredEvents.map((e) => {
    const asset = assetMap.get(e.assetId)
    return {
      id: e.id,
      assetId: e.assetId,
      eventType: e.eventType,
      eventDate: e.eventDate instanceof Date ? e.eventDate : new Date(e.eventDate as unknown as string),
      totalCents: e.totalCents,
      notes: e.notes,
      ticker: asset?.ticker ?? '',
      name: asset?.name ?? '',
    }
  })
}
