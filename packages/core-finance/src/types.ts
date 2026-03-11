// Shared domain types for core-finance engine

/** A normalized transaction for internal processing (e.g., after CSV/OFX import) */
export interface NormalizedTransaction {
  externalId: string
  date: Date
  amountCents: number
  description: string
  type: 'income' | 'expense'
}

/** Aggregated cash flow data for a given month (YYYY-MM format) */
export interface CashFlowMonth {
  month: string
  income: number
  expense: number
  net: number
}

// Re-export DB types for convenience — consumers can import from @floow/core-finance instead of @floow/db
export type { Account, Transaction } from '@floow/db'
