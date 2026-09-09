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
  /**
   * O bem que este lancamento adquiriu, quando ha vinculo em
   * `fixed_assets.acquisition_transaction_id`. Vem por subquery e nao por
   * join: dois bens podem apontar o mesmo lancamento, e a duplicacao de linha
   * corromperia o `count(*) over ()` e a soma acumulada da listagem.
   */
  /**
   * Excecao de fluxo de caixa deste lancamento. `null`/ausente = herda da
   * categoria. Ver `lib/finance/affects-cash-flow-cycle.ts`.
   */
  affectsCashFlow?: boolean | null
  acquiredAssetId?: string | null
  acquiredAssetName?: string | null
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

/**
 * A cor do valor segue o SINAL, não o tipo.
 *
 * Seguia o tipo antes — `income` verde, `expense` vermelho, `transfer` azul.
 * Com 806 despesas (todas negativas) e 66 transferências negativas, a coluna
 * mostrava o mesmo sinal em duas cores, vermelho e azul lado a lado: a cor
 * codificava tipo e o leitor lia sinal.
 *
 * Transferência que sai da conta é dinheiro saindo daquela conta, igual a
 * despesa, e o saldo trata as duas do mesmo jeito. Que seja transferência já
 * está dito na coluna de tipo.
 */
export function amountColorClass(amountCents: number): string {
  if (amountCents < 0) return 'text-red-600'
  if (amountCents > 0) return 'text-green-700'
  return 'text-gray-500'
}

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
