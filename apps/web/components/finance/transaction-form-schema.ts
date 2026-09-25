import { z } from 'zod'
import { currencyToCents } from '@floow/core-finance/src/balance'
import { dataPlausivel } from '@/lib/finance/aviso-de-data'

export type TransactionType = 'income' | 'expense' | 'transfer'

export const transactionFormSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    accountId: z.string().uuid('Selecione uma conta'),
    transferToAccountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    amountRaw: z
      .string()
      .min(1, 'Valor é obrigatório')
      .refine((v) => {
        const cents = currencyToCents(v)
        return Number.isFinite(cents) && cents > 0
      }, 'Informe um valor maior que zero, como 150,75'),
    description: z.string().min(1, 'Descrição é obrigatória').max(500),
    date: z.string().min(1, 'Data é obrigatória').refine(dataPlausivel, 'Data inválida — confira o ano'),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'transfer' && !data.transferToAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione a conta de destino',
        path: ['transferToAccountId'],
      })
    }
    if (data.type === 'transfer' && data.transferToAccountId === data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Escolha uma conta diferente da conta de origem',
        path: ['transferToAccountId'],
      })
    }
  })

export type TransactionFormData = z.infer<typeof transactionFormSchema>

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

export type EndMode = 'count' | 'end_date' | 'indefinite'

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
}

/** O que `onSuccess` recebe: as transacoes que acabaram de ser criadas. */
export interface CreatedTransaction {
  id: string
  accountId: string
  categoryId?: string | null
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: string | Date
  transferGroupId?: string | null
  externalId?: string | null
  isAutoCategorized?: boolean
  isIgnored?: boolean
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  installmentNumber?: number | null
  installmentTotal?: number | null
}
