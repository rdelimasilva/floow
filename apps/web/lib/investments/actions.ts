'use server'
import {
  getDb,
  assets,
  portfolioEvents,
  assetPrices,
  transactions,
  accounts,
} from '@floow/db'
import { createAssetSchema, createPortfolioEventSchema, updateAssetSchema, updatePortfolioEventSchema } from '@floow/shared'
import { eq, and, sql } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { recomputeAssetPositionSnapshot } from './position-snapshots'
import {
  accountsTag,
  incomeEventsTag,
  investmentsTag,
  patrimonyHistoryTag,
  priceHistoryTag,
  pricesTag,
  recentTransactionsTag,
  snapshotsTag,
  transactionsTag,
  invalidateTag,
} from '@/lib/cache-tags'
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'
import { assertAccountOwnership, assertAssetOwnership } from './ownership'
import { CASH_FLOW_EVENT_TYPES, inserirTransacaoDoEvento } from './transacao-do-evento'

type Db = ReturnType<typeof getDb>

function revalidateInvestmentData(orgId: string) {
  invalidateTag(investmentsTag(orgId))
}

function revalidatePriceData(orgId: string, assetId?: string) {
  invalidateTag(pricesTag(orgId))
  if (assetId) invalidateTag(priceHistoryTag(orgId, assetId))
}

function revalidateCrossModuleData(orgId: string) {
  invalidateTag(transactionsTag(orgId))
  invalidateTag(recentTransactionsTag(orgId, 6))
  invalidateTag(recentTransactionsTag(orgId, 24))
  invalidateTag(accountsTag(orgId))
  invalidateTag(snapshotsTag(orgId))
  invalidateTag(patrimonyHistoryTag(orgId, 12))
  invalidateTag(incomeEventsTag(orgId, 12))
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Server action: register a new investment asset.
 * Validates with createAssetSchema, inserts into assets table.
 */
export async function createAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = createAssetSchema.parse({
    ticker: formData.get('ticker'),
    name: formData.get('name'),
    assetClass: formData.get('assetClass'),
    currency: formData.get('currency') || 'BRL',
    notes: formData.get('notes') || undefined,
  })

  const [asset] = await db
    .insert(assets)
    .values({
      orgId,
      ticker: input.ticker.toUpperCase(),
      name: input.name,
      assetClass: input.assetClass,
      currency: input.currency,
      notes: input.notes ?? null,
    })
    .returning()

  revalidateInvestmentData(orgId)

  return asset
}

/**
 * Server action: log a portfolio event (buy, sell, dividend, interest, split, amortization).
 *
 * INV-07 Cash Flow Integration:
 *   - buy events: insert expense transaction + debit account balance
 *   - sell events: insert income transaction + credit account balance
 *   - dividend/interest/amortization: insert income transaction + credit account balance
 *   - split events: no cash flow
 *
 * Uses db.transaction() to atomically:
 *   1. Insert portfolio event
 *   2. Insert corresponding transaction row (if cash-moving event)
 *   3. Update account balance atomically (sql`balance_cents + ${signedAmount}`)
 *   4. Update portfolio event's transactionId to link back for audit trail
 *
 * Revalidates only the affected pages for cross-page consistency.
 */
export async function createPortfolioEvent(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawQuantity = formData.get('quantity')
  const rawPriceCents = formData.get('priceCents')
  const rawTotalCents = formData.get('totalCents')
  const rawSplitRatio = formData.get('splitRatio')

  const input = createPortfolioEventSchema.parse({
    assetId: formData.get('assetId'),
    accountId: formData.get('accountId'),
    eventType: formData.get('eventType'),
    eventDate: formData.get('eventDate'),
    quantity: rawQuantity ? parseInt(rawQuantity as string, 10) : undefined,
    priceCents: rawPriceCents ? parseInt(rawPriceCents as string, 10) : undefined,
    totalCents: rawTotalCents ? parseInt(rawTotalCents as string, 10) : undefined,
    splitRatio: rawSplitRatio ? String(rawSplitRatio) : undefined,
    notes: formData.get('notes') || undefined,
  })

  const cashFlowMapping = CASH_FLOW_EVENT_TYPES[input.eventType]

  await db.transaction(async (tx) => {
    // 0. Verify ownership of asset and account before any write
    await assertAssetOwnership(tx as unknown as Db, input.assetId, orgId)
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)

    // Fetch asset ticker for transaction description (inside tx, after ownership check)
    const [asset] = await tx
      .select({ ticker: assets.ticker })
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1)
    const assetTicker = asset?.ticker ?? input.assetId

    // 1. Insert the portfolio event
    const [event] = await tx
      .insert(portfolioEvents)
      .values({
        orgId,
        assetId: input.assetId,
        accountId: input.accountId,
        eventType: input.eventType,
        eventDate: input.eventDate,
        quantity: input.quantity ?? null,
        priceCents: input.priceCents ?? null,
        totalCents: input.totalCents ?? null,
        splitRatio: input.splitRatio ?? null,
        notes: input.notes ?? null,
      })
      .returning()

    // 2. INV-07: lançamento de caixa do evento, quando ele move caixa
    if (cashFlowMapping && input.totalCents) {
      await inserirTransacaoDoEvento(tx as unknown as Db, {
        orgId, accountId: input.accountId, eventId: event.id, eventType: input.eventType,
        eventDate: input.eventDate, totalCents: input.totalCents, assetTicker,
      })
    }

    await recomputeAssetPositionSnapshot(tx as unknown as Db, orgId, input.assetId)
  })

  revalidateInvestmentData(orgId)

  if (cashFlowMapping && input.totalCents) {
    revalidateCrossModuleData(orgId)
  }

  triggerCfoAnalysis(orgId, 'portfolio_event_created', ['investment'])
}

/**
 * Server action: manually update the current price for an asset.
 * Inserts a new entry into asset_prices table (price history is additive).
 */
export async function updateAssetPrice(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const assetId = formData.get('assetId') as string
  const priceCents = parseInt(formData.get('priceCents') as string, 10)
  const priceDateRaw = formData.get('priceDate') as string
  const priceDate = priceDateRaw ? new Date(priceDateRaw) : new Date()

  if (!assetId || isNaN(priceCents) || priceCents <= 0) {
    throw new Error('Invalid price update: assetId and positive priceCents are required')
  }

  // Verify the asset belongs to the user's org before writing
  await assertAssetOwnership(db, assetId, orgId)

  await db.transaction(async (tx) => {
    await tx.insert(assetPrices).values({
      orgId,
      assetId,
      priceDate,
      priceCents,
    })

    await recomputeAssetPositionSnapshot(tx as unknown as Db, orgId, assetId)
  })

  revalidateInvestmentData(orgId)
  revalidatePriceData(orgId, assetId)
}

/**
 * Server action: delete an investment asset and all related data.
 * Reverses balance impacts from linked cash-flow transactions, then cascades
 * deletion to portfolio_events and asset_prices.
 */
export async function deleteAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const assetId = formData.get('id') as string
  if (!assetId) throw new Error('Asset ID is required')

  await assertAssetOwnership(db, assetId, orgId)

  await db.transaction(async (tx) => {
    // Find all portfolio events that generated cash-flow transactions
    const events = await tx
      .select({ transactionId: portfolioEvents.transactionId })
      .from(portfolioEvents)
      .where(and(eq(portfolioEvents.assetId, assetId), eq(portfolioEvents.orgId, orgId)))

    // Reverse balance impacts for linked transactions
    for (const evt of events) {
      if (!evt.transactionId) continue
      const [linkedTx] = await tx
        .select({ accountId: transactions.accountId, amountCents: transactions.amountCents })
        .from(transactions)
        .where(eq(transactions.id, evt.transactionId))
        .limit(1)

      if (linkedTx) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-linkedTx.amountCents}` })
          .where(eq(accounts.id, linkedTx.accountId))

        await tx
          .delete(transactions)
          .where(eq(transactions.id, evt.transactionId))
      }
    }

    // Delete asset (cascades to portfolio_events and asset_prices)
    await tx
      .delete(assets)
      .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)))
  })

  revalidateInvestmentData(orgId)
  revalidatePriceData(orgId, assetId)
  revalidateCrossModuleData(orgId)
}

/**
 * Server action: update an existing investment asset's metadata.
 * Validates with updateAssetSchema, verifies ownership, then updates.
 */
export async function updateAsset(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateAssetSchema.parse({
    id: formData.get('id'),
    ticker: formData.get('ticker'),
    name: formData.get('name'),
    assetClass: formData.get('assetClass'),
    currency: formData.get('currency') || 'BRL',
    notes: formData.get('notes') || undefined,
  })

  await assertAssetOwnership(db, input.id, orgId)

  const [updated] = await db
    .update(assets)
    .set({
      ticker: input.ticker.toUpperCase(),
      name: input.name,
      assetClass: input.assetClass,
      currency: input.currency,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(assets.id, input.id), eq(assets.orgId, orgId)))
    .returning()

  revalidateInvestmentData(orgId)

  return updated
}

/**
 * Server action: delete a single portfolio event.
 * Reverses the linked cash-flow transaction (if any) and restores account balance.
 */
export async function deletePortfolioEvent(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const eventId = formData.get('id') as string
  if (!eventId) throw new Error('Event ID is required')

  const [event] = await db
    .select()
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, eventId), eq(portfolioEvents.orgId, orgId)))
    .limit(1)

  if (!event) throw new Error('Portfolio event not found')

  await db.transaction(async (tx) => {
    // Reverse cash-flow transaction if it exists
    if (event.transactionId) {
      const [linkedTx] = await tx
        .select({ accountId: transactions.accountId, amountCents: transactions.amountCents })
        .from(transactions)
        .where(eq(transactions.id, event.transactionId))
        .limit(1)

      if (linkedTx) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-linkedTx.amountCents}` })
          .where(eq(accounts.id, linkedTx.accountId))

        await tx
          .delete(transactions)
          .where(eq(transactions.id, event.transactionId))
      }
    }

    // Delete the portfolio event
    await tx
      .delete(portfolioEvents)
      .where(and(eq(portfolioEvents.id, eventId), eq(portfolioEvents.orgId, orgId)))

    await recomputeAssetPositionSnapshot(tx as unknown as Db, orgId, event.assetId)
  })

  revalidateInvestmentData(orgId)
  revalidateCrossModuleData(orgId)
}

/**
 * Server action: update an existing portfolio event.
 *
 * Atomically:
 *   1. Reverses the old cash-flow transaction (if any) and restores account balance
 *   2. Updates the portfolio event fields
 *   3. Creates a new cash-flow transaction if the updated event moves cash
 *   4. Links the new transactionId back to the portfolio event
 *
 * Revalidates all affected pages for cross-page consistency.
 */
export async function updatePortfolioEvent(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawQuantity = formData.get('quantity')
  const rawPriceCents = formData.get('priceCents')
  const rawTotalCents = formData.get('totalCents')
  const rawSplitRatio = formData.get('splitRatio')

  const input = updatePortfolioEventSchema.parse({
    id: formData.get('id'),
    assetId: formData.get('assetId'),
    accountId: formData.get('accountId'),
    eventType: formData.get('eventType'),
    eventDate: formData.get('eventDate'),
    quantity: rawQuantity ? parseInt(rawQuantity as string, 10) : undefined,
    priceCents: rawPriceCents ? parseInt(rawPriceCents as string, 10) : undefined,
    totalCents: rawTotalCents ? parseInt(rawTotalCents as string, 10) : undefined,
    splitRatio: rawSplitRatio ? String(rawSplitRatio) : undefined,
    notes: formData.get('notes') || undefined,
  })

  // Verify the existing event belongs to this org
  const [existing] = await db
    .select()
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, input.id), eq(portfolioEvents.orgId, orgId)))
    .limit(1)

  if (!existing) throw new Error('Portfolio event not found')

  const cashFlowMapping = CASH_FLOW_EVENT_TYPES[input.eventType]
  const oldAssetId = existing.assetId

  await db.transaction(async (tx) => {
    // 0. Verify ownership of asset and account before any write
    await assertAssetOwnership(tx as unknown as Db, input.assetId, orgId)
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)

    // 1. Reverse old cash-flow transaction if it exists
    if (existing.transactionId) {
      const [linkedTx] = await tx
        .select({ accountId: transactions.accountId, amountCents: transactions.amountCents })
        .from(transactions)
        .where(eq(transactions.id, existing.transactionId))
        .limit(1)

      if (linkedTx) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-linkedTx.amountCents}` })
          .where(eq(accounts.id, linkedTx.accountId))

        await tx
          .delete(transactions)
          .where(eq(transactions.id, existing.transactionId))
      }
    }

    // Fetch asset ticker for transaction description
    const [asset] = await tx
      .select({ ticker: assets.ticker })
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1)
    const assetTicker = asset?.ticker ?? input.assetId

    // 2. Update the portfolio event fields
    await tx
      .update(portfolioEvents)
      .set({
        assetId: input.assetId,
        accountId: input.accountId,
        eventType: input.eventType,
        eventDate: input.eventDate,
        quantity: input.quantity ?? null,
        priceCents: input.priceCents ?? null,
        totalCents: input.totalCents ?? null,
        splitRatio: input.splitRatio ?? null,
        notes: input.notes ?? null,
        transactionId: null, // Clear old link; will be re-set below if applicable
      })
      .where(and(eq(portfolioEvents.id, input.id), eq(portfolioEvents.orgId, orgId)))

    // 3. Novo lançamento de caixa, se o evento editado move caixa
    if (cashFlowMapping && input.totalCents) {
      await inserirTransacaoDoEvento(tx as unknown as Db, {
        orgId, accountId: input.accountId, eventId: input.id, eventType: input.eventType,
        eventDate: input.eventDate, totalCents: input.totalCents, assetTicker,
      })
    }

    await recomputeAssetPositionSnapshot(tx as unknown as Db, orgId, input.assetId)
    if (oldAssetId !== input.assetId) {
      await recomputeAssetPositionSnapshot(tx as unknown as Db, orgId, oldAssetId)
    }
  })

  revalidateInvestmentData(orgId)
  revalidatePriceData(orgId, input.assetId)
  revalidateCrossModuleData(orgId)
}
