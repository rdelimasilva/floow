'use server'

import { revalidatePath } from 'next/cache'
import {
  getDb,
  assets,
  portfolioEvents,
  assetPrices,
  transactions,
  accounts,
} from '@floow/db'
import { createAssetSchema, createPortfolioEventSchema } from '@floow/shared'
import { eq, sql } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets } from './queries'

// ---------------------------------------------------------------------------
// Cash flow mapping for INV-07 integration
// buy: expense (cash leaves account), sell: income (cash enters account),
// dividend/interest/amortization: income (cash enters account), split: no cash flow
// ---------------------------------------------------------------------------

const CASH_FLOW_EVENT_TYPES: Record<string, { transactionType: 'income' | 'expense'; sign: 1 | -1 } | null> = {
  buy: { transactionType: 'expense', sign: -1 },
  sell: { transactionType: 'income', sign: 1 },
  dividend: { transactionType: 'income', sign: 1 },
  interest: { transactionType: 'income', sign: 1 },
  amortization: { transactionType: 'income', sign: 1 },
  split: null,
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

  revalidatePath('/investments')

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
 * Revalidates /investments, /dashboard, /transactions for cross-page consistency.
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

  // Fetch asset ticker for transaction description
  let assetTicker = input.assetId
  try {
    const assetList = await getAssets(orgId)
    const asset = assetList.find((a) => a.id === input.assetId)
    if (asset) assetTicker = asset.ticker
  } catch {
    // Non-critical — use assetId as fallback
  }

  await db.transaction(async (tx) => {
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

    // 2. INV-07: Insert cash flow transaction if this event moves cash
    if (cashFlowMapping && input.totalCents) {
      const signedAmount = cashFlowMapping.sign * Math.abs(input.totalCents)

      // Insert corresponding transaction row
      const [txRow] = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: input.accountId,
          type: cashFlowMapping.transactionType,
          amountCents: signedAmount,
          description: `${input.eventType}: ${assetTicker}`,
          date: input.eventDate,
        })
        .returning()

      // 3. Atomic balance update on linked account
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
        .where(eq(accounts.id, input.accountId))

      // 4. Link portfolio event back to transaction for audit trail
      await tx
        .update(portfolioEvents)
        .set({ transactionId: txRow.id })
        .where(eq(portfolioEvents.id, event.id))
    }
  })

  revalidatePath('/investments')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')
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

  await db.insert(assetPrices).values({
    orgId,
    assetId,
    priceDate,
    priceCents,
  })

  revalidatePath('/investments')
}
