// Tipos do fluxo de importação. Saíram de `import-actions.ts` (limite de 500 linhas).

/**
 * Result returned after an import operation.
 */
export interface ImportResult {
  imported: number
  skipped: number
  /** `importedAt` do lote — a chave para desfazer a importação. */
  lote?: string
}

/**
 * Match status for a parsed transaction during import preview.
 */
export type MatchStatus = 'new' | 'duplicate' | 'possible_match'

/**
 * A single item in the import preview — the parsed transaction plus its match status.
 */
export interface PreviewItem {
  index: number
  parsed: {
    date: string
    description: string
    amountCents: number
    type: 'income' | 'expense'
    externalId: string | null
  }
  status: MatchStatus
  suggestedCategoryId: string | null
  isAutoCategorized: boolean
  matchedTransaction?: {
    id: string
    date: string
    description: string
    amountCents: number
  }
}

/**
 * Per-transaction override applied during import review step.
 */
export interface TransactionOverride {
  index: number
  categoryId: string | null
  type: 'income' | 'expense' | 'transfer'
  transferToAccountId?: string
}
