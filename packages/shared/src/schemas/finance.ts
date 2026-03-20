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
