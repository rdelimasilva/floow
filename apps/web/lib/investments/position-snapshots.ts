import { getDb, assets, assetPositionSnapshots, assetPrices, portfolioEvents } from '@floow/db'
import { computePosition, computeBankPosition, type PortfolioEventType, type BankPositionInput } from '@floow/core-finance'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

type DbClient = ReturnType<typeof getDb>

/** Formato bruto de evento como sai das queries — antes de virar PortfolioEventInput. */
type RawEvent = {
  eventType: string
  eventDate: Date
  quantity: number | null
  priceCents: number | null
  totalCents: number | null
  splitRatio: string | null
}

function toPercentBps(unrealizedPnLCents: number, totalCostCents: number) {
  if (totalCostCents <= 0) return 0
  return Math.round((unrealizedPnLCents / totalCostCents) * 10000)
}

/** Normaliza uma linha crua de evento para o input puro de `computePosition`/`computeBankPosition`. */
function toEventInput(event: RawEvent) {
  return {
    eventType: event.eventType as PortfolioEventType,
    quantity: event.quantity,
    priceCents: event.priceCents,
    totalCents: event.totalCents,
    splitRatio: event.splitRatio,
    eventDate: event.eventDate instanceof Date ? event.eventDate : new Date(event.eventDate as unknown as string),
  }
}

function toSnapshotRow(
  orgId: string,
  assetId: string,
  events: RawEvent[],
  currentPriceCents: number,
) {
  const result = computePosition(events.map(toEventInput), currentPriceCents)

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
    costIsPartial: false,
    updatedAt: new Date(),
  }
}

/**
 * Linha de snapshot para ativo do Open Finance: valor vem da posição do
 * banco, não dos eventos. Diferente de `toSnapshotRow`, nunca devolve null —
 * ativo resgatado por inteiro ainda aparece na tela, zerado.
 */
function toBankSnapshotRow(
  orgId: string,
  assetId: string,
  bank: BankPositionInput | null,
  events: RawEvent[],
) {
  const r = computeBankPosition(bank, events.map(toEventInput))
  const unrealizedPnLCents = r.currentValueCents - r.totalCostCents

  return {
    assetId,
    orgId,
    quantityHeld: r.quantityHeld,
    avgCostCents: r.avgCostCents,
    totalCostCents: r.totalCostCents,
    currentPriceCents: r.currentPriceCents,
    currentValueCents: r.currentValueCents,
    unrealizedPnLCents,
    unrealizedPnLPercentBps: toPercentBps(unrealizedPnLCents, r.totalCostCents),
    realizedPnLCents: r.realizedPnLCents,
    totalDividendsCents: r.totalDividendsCents,
    costIsPartial: r.costIsPartial,
    updatedAt: new Date(),
  }
}

/**
 * Escolhe a estratégia de cálculo pela origem do ativo. Ativo `openfinance`
 * SEMPRE usa a posição do banco — nunca eventos+preço manual, mesmo que o
 * ativo tenha preço manual cadastrado (Review Focus #1).
 */
export function snapshotRowFor(
  orgId: string,
  asset: { id: string; source: 'manual' | 'openfinance' },
  ctx: { events: RawEvent[]; bank: BankPositionInput | null; latestPriceCents: number },
) {
  return asset.source === 'openfinance'
    ? toBankSnapshotRow(orgId, asset.id, ctx.bank, ctx.events)
    : toSnapshotRow(orgId, asset.id, ctx.events, ctx.latestPriceCents)
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

/** Última posição do banco por ativo, direto do Open Finance. */
async function getLatestBankPositions(db: DbClient, orgId: string): Promise<Map<string, BankPositionInput>> {
  const rows = await db.execute<{
    asset_id: string
    quantity: string | null
    gross_cents: number | null
    net_cents: number | null
    purchase_unit_price: string | null
  }>(
    sql`SELECT DISTINCT ON (asset_id) asset_id, quantity, gross_cents, net_cents, purchase_unit_price
        FROM asset_bank_positions
        WHERE org_id = ${orgId}
        ORDER BY asset_id, reference_date DESC`
  )
  const num = (v: string | null) => (v === null ? null : Number(v))
  return new Map(
    rows.map((r) => [
      r.asset_id,
      {
        quantity: num(r.quantity),
        grossCents: r.gross_cents,
        netCents: r.net_cents,
        purchaseUnitPrice: num(r.purchase_unit_price),
      },
    ])
  )
}

export async function recomputeAssetPositionSnapshot(db: DbClient, orgId: string, assetId: string) {
  const [asset] = await db
    .select({ id: assets.id, source: assets.source })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), eq(assets.id, assetId)))
    .limit(1)

  if (!asset) {
    return
  }

  const [events, currentPriceCents, bank] = await Promise.all([
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
    asset.source === 'openfinance'
      ? getLatestBankPositions(db, orgId).then((m) => m.get(assetId) ?? null)
      : Promise.resolve(null),
  ])

  const snapshotRow = snapshotRowFor(orgId, asset, { events, bank, latestPriceCents: currentPriceCents })

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
        costIsPartial: snapshotRow.costIsPartial,
        updatedAt: snapshotRow.updatedAt,
      },
    })
}

export async function recomputeOrgPositionSnapshots(orgId: string, db: DbClient = getDb()) {
  const [allAssets, allEvents, latestPriceRows, bankPositions] = await Promise.all([
    db
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetClass: assets.assetClass,
        source: assets.source,
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
    getLatestBankPositions(db, orgId),
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
    .map((asset) =>
      snapshotRowFor(orgId, asset, {
        events: eventsByAsset.get(asset.id) ?? [],
        bank: bankPositions.get(asset.id) ?? null,
        latestPriceCents: latestPrices[asset.id] ?? 0,
      })
    )
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
