import { z } from 'zod'

export const createAssetSchema = z.object({
  ticker: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  assetClass: z.enum(['br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international']),
  currency: z.string().default('BRL'),
  notes: z.string().optional(),
})

export const createPortfolioEventSchema = z.object({
  assetId: z.string().uuid(),
  accountId: z.string().uuid(),
  eventType: z.enum(['buy', 'sell', 'dividend', 'interest', 'split', 'amortization']),
  eventDate: z.coerce.date(),
  // null for dividend/interest events (no quantity change)
  quantity: z.number().int().optional(),
  // null for split events (no price)
  priceCents: z.number().int().optional(),
  totalCents: z.number().int().optional(),
  // string for numeric precision (e.g., '2.0000' for 2-for-1 split)
  splitRatio: z.string().optional(),
  notes: z.string().optional(),
})

export const updateAssetSchema = z.object({
  id: z.string().uuid(),
  ticker: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  assetClass: z.enum(['br_equity', 'fii', 'etf', 'crypto', 'fixed_income', 'international']),
  currency: z.string().default('BRL'),
  notes: z.string().optional(),
})

export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type CreatePortfolioEventInput = z.infer<typeof createPortfolioEventSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
