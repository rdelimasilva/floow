export interface TransactionRowData {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: Date | string
  accountId: string
  categoryId?: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  transferGroupId?: string | null
  externalId?: string | null
  isAutoCategorized?: boolean
  isIgnored?: boolean
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  installmentNumber?: number | null
  installmentTotal?: number | null
}

export interface AccountOption {
  id: string
  name: string
}

export interface CategoryOption {
  id: string
  name: string
  type: string
}

export const TYPE_STYLES = {
  income: 'text-green-700',
  expense: 'text-red-600',
  transfer: 'text-blue-600',
} as const

export const TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
} as const

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function toDateInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}
