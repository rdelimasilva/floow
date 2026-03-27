import { getDb, assets, assetPositionSnapshots, assetPrices, portfolioEvents } from '@floow/db'
import { computePosition } from '@floow/core-finance'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

type DbClient = ReturnType<typeof getDb>

function toPercentBps(unrealizedPnLCents: number, totalCostCents: number) {
  if (totalCostCents <= 0) return 0
  return Math.round((unrealizedPnLCents / totalCostCents) * 10000)
}

function toSnapshotRow(
  orgId: string,
  assetId: string,
  events: Array<{
    eventType: string
    eventDate: Date
    quantity: number | null
    priceCents: number | null
    totalCents: number | null
    splitRatio: string | null
  }>,
  currentPriceCents: number,
) {
  const result = computePosition(
    events.map((event) => ({
      eventType: event.eventType as 'buy' | 'sell' | 'dividend' | 'interest' | 'split' | 'amortization',
      quantity: event.quantity,
      priceCents: event.priceCents,
      totalCents: event.totalCents,
      splitRatio: event.splitRatio,
      eventDate: event.eventDate instanceof Date ? event.eventDate : new Date(event.eventDate as unknown as string),
    })),
    currentPriceCents,
  )

  if (result.quantityHeld === 0 && result.realizedPnLCents === 0 && result.totalDividendsCents === 0) {
    return null
  }

  const currentValueCents = result.quantityHeld * currentPriceCents
  const unrealizedPnLCents = currentValueCents - result.totalCostCents

  return {
    assetId,
    orgId,
    quantityHeld: result.quantityHeld,
    avgCostCents: result.avgCostCents,
    totalCostCents: result.totalCostCents,
    currentPriceCents,
    currentValueCents,
    unrealizedPnLCents,
    unrealizedPnLPercentBps: toPercentBps(unrealizedPnLCents, result.totalCostCents),
    realizedPnLCents: result.realizedPnLCents,
    totalDividendsCents: result.totalDividendsCents,
    updatedAt: new Date(),
  }
}

async function getLatestPriceCents(db: DbClient, orgId: string, assetId: string) {
  const [latestPrice] = await db
    .select({ priceCents: assetPrices.priceCents })
    .from(assetPrices)
    .where(and(eq(assetPrices.orgId, orgId), eq(assetPrices.assetId, assetId)))
    .orderBy(desc(assetPrices.priceDate))
    .limit(1)

  return latestPrice?.priceCents ?? 0
}

export async function recomputeAssetPositionSnapshot(db: DbClient, orgId: string, assetId: string) {
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), eq(assets.id, assetId)))
    .limit(1)

  if (!asset) {
    return
  }

  const [events, currentPriceCents] = await Promise.all([
    db
      .select({
        eventType: portfolioEvents.eventType,
        eventDate: portfolioEvents.eventDate,
        quantity: portfolioEvents.quantity,
        priceCents: portfolioEvents.priceCents,
        totalCents: portfolioEvents.totalCents,
        splitRatio: portfolioEvents.splitRatio,
      })
      .from(portfolioEvents)
      .where(and(eq(portfolioEvents.orgId, orgId), eq(portfolioEvents.assetId, assetId)))
      .orderBy(asc(portfolioEvents.eventDate)),
    getLatestPriceCents(db, orgId, assetId),
  ])

  const snapshotRow = toSnapshotRow(orgId, assetId, events, currentPriceCents)

  if (!snapshotRow) {
    await db
      .delete(assetPositionSnapshots)
      .where(and(eq(assetPositionSnapshots.orgId, orgId), eq(assetPositionSnapshots.assetId, assetId)))
    return
  }

  await db
    .insert(assetPositionSnapshots)
    .values(snapshotRow)
    .onConflictDoUpdate({
      target: assetPositionSnapshots.assetId,
      set: {
        quantityHeld: snapshotRow.quantityHeld,
        avgCostCents: snapshotRow.avgCostCents,
        totalCostCents: snapshotRow.totalCostCents,
        currentPriceCents: snapshotRow.currentPriceCents,
        currentValueCents: snapshotRow.currentValueCents,
        unrealizedPnLCents: snapshotRow.unrealizedPnLCents,
        unrealizedPnLPercentBps: snapshotRow.unrealizedPnLPercentBps,
        realizedPnLCents: snapshotRow.realizedPnLCents,
        totalDividendsCents: snapshotRow.totalDividendsCents,
        updatedAt: snapshotRow.updatedAt,
      },
    })
}

export async function recomputeOrgPositionSnapshots(orgId: string) {
  const db = getDb()

  const [allAssets, allEvents, latestPriceRows] = await Promise.all([
    db
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetClass: assets.assetClass,
      })
      .from(assets)
      .where(eq(assets.orgId, orgId))
      .orderBy(asc(assets.ticker)),
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
    db.execute<{ asset_id: string; price_cents: number }>(
      sql`SELECT DISTINCT ON (asset_id) asset_id, price_cents
          FROM asset_prices
          WHERE org_id = ${orgId}
          ORDER BY asset_id, price_date DESC`
    ),
  ])

  const latestPrices: Record<string, number> = {}
  for (const row of latestPriceRows) {
    latestPrices[row.asset_id] = row.price_cents
  }

  const eventsByAsset = new Map<string, typeof allEvents>()
  for (const event of allEvents) {
    const list = eventsByAsset.get(event.assetId) ?? []
    list.push(event)
    eventsByAsset.set(event.assetId, list)
  }

  const snapshotRows = allAssets
    .map((asset) => toSnapshotRow(orgId, asset.id, eventsByAsset.get(asset.id) ?? [], latestPrices[asset.id] ?? 0))
    .filter((row) => row !== null)

  await db.transaction(async (tx) => {
    await tx
      .delete(assetPositionSnapshots)
      .where(eq(assetPositionSnapshots.orgId, orgId))

    if (snapshotRows.length > 0) {
      await tx.insert(assetPositionSnapshots).values(snapshotRows)
    }
  })

  return snapshotRows
}
