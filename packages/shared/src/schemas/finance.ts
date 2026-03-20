import { z } from 'zod'

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'savings', 'brokerage', 'credit_card', 'cash']),
  branch: z.string().max(20).optional(),
  accountNumber: z.string().max(30).optional(),
})

export const createTransactionSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  date: z.coerce.date(),
  transferToAccountId: z.string().uuid().optional(),
})

export const updateAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'savings', 'brokerage', 'credit_card', 'cash']),
  branch: z.string().max(20).optional(),
  accountNumber: z.string().max(30).optional(),
})

export const updateTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  date: z.coerce.date(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>

export const createRecurringTransactionSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  startDate: z.coerce.date(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  endMode: z.enum(['count', 'end_date', 'indefinite']),
  installmentCount: z.number().int().min(1).max(120).optional(),
  endDate: z.coerce.date().optional(),
  destinationAccountId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.endMode === 'count' && !data.installmentCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Número de parcelas é obrigatório', path: ['installmentCount'] })
  }
  if (data.endMode === 'end_date' && !data.endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data final é obrigatória', path: ['endDate'] })
  }
  if (data.endMode === 'end_date' && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data final deve ser após a data inicial', path: ['endDate'] })
  }
  if (data.type === 'transfer' && !data.destinationAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Conta de destino é obrigatória para transferências', path: ['destinationAccountId'] })
  }
  if (data.type === 'transfer' && data.destinationAccountId === data.accountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Conta de destino deve ser diferente da conta de origem', path: ['destinationAccountId'] })
  }
})

export type CreateRecurringTransactionInput = z.infer<typeof createRecurringTransactionSchema>
