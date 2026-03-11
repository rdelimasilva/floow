'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createTransaction } from '@/lib/finance/actions'
import { currencyToCents } from '@floow/core-finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Account, Category } from '@floow/db'

// ── Types ─────────────────────────────────────────────────────────────────────

type TransactionType = 'income' | 'expense' | 'transfer'

const transactionFormSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    accountId: z.string().uuid('Selecione uma conta'),
    transferToAccountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    amountRaw: z.string().min(1, 'Valor é obrigatório'),
    description: z.string().min(1, 'Descrição é obrigatória').max(500),
    date: z.string().min(1, 'Data é obrigatória'),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'transfer' && !data.transferToAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione a conta de destino',
        path: ['transferToAccountId'],
      })
    }
  })

type TransactionFormData = z.infer<typeof transactionFormSchema>

// ── Props ──────────────────────────────────────────────────────────────────────

interface TransactionFormProps {
  accounts: Account[]
  categories: Category[]
}

// ── Component ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
}

export function TransactionForm({ accounts, categories }: TransactionFormProps) {
  const router = useRouter()
  const [txType, setTxType] = useState<TransactionType>('expense')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: 'expense',
      date: new Date().toISOString().split('T')[0],
    },
  })

  // Filter categories by transaction type (income categories for income, expense categories for expense)
  const filteredCategories = categories.filter((cat) => {
    if (txType === 'income') return cat.type === 'income'
    if (txType === 'expense') return cat.type === 'expense'
    return false // no category for transfer
  })

  async function onSubmit(data: TransactionFormData) {
    const amountCents = currencyToCents(data.amountRaw)
    if (amountCents <= 0) return

    const formData = new FormData()
    formData.append('type', data.type)
    formData.append('accountId', data.accountId)
    formData.append('amountCents', String(amountCents))
    formData.append('description', data.description)
    formData.append('date', data.date)

    if (data.categoryId) {
      formData.append('categoryId', data.categoryId)
    }
    if (data.type === 'transfer' && data.transferToAccountId) {
      formData.append('transferToAccountId', data.transferToAccountId)
    }

    await createTransaction(formData)
    router.push('/transactions')
  }

  function handleTypeChange(type: TransactionType) {
    setTxType(type)
    setValue('type', type)
    // Clear category when switching to transfer
    if (type === 'transfer') {
      setValue('categoryId', undefined)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Transaction type toggle */}
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
          {(['income', 'expense', 'transfer'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                txType === type
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <input type="hidden" {...register('type')} value={txType} />
      </div>

      {/* Source account */}
      <div className="space-y-1.5">
        <Label htmlFor="accountId">
          {txType === 'transfer' ? 'Conta de Origem' : 'Conta'}
        </Label>
        <Controller
          name="accountId"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="accountId">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acct) => (
                  <SelectItem key={acct.id} value={acct.id}>
                    {acct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.accountId && (
          <p className="text-xs text-red-600">{errors.accountId.message}</p>
        )}
      </div>

      {/* Transfer destination account (only for transfers) */}
      {txType === 'transfer' && (
        <div className="space-y-1.5">
          <Label htmlFor="transferToAccountId">Conta de Destino</Label>
          <Controller
            name="transferToAccountId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="transferToAccountId">
                  <SelectValue placeholder="Selecione a conta de destino" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acct) => (
                    <SelectItem key={acct.id} value={acct.id}>
                      {acct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.transferToAccountId && (
            <p className="text-xs text-red-600">{errors.transferToAccountId.message}</p>
          )}
        </div>
      )}

      {/* Category (hidden for transfers) */}
      {txType !== 'transfer' && (
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Categoria</Label>
          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Selecione a categoria (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      {/* Amount */}
      <div className="space-y-1.5">
        <Label htmlFor="amountRaw">Valor (R$)</Label>
        <Input
          id="amountRaw"
          placeholder="Ex: 150,75"
          {...register('amountRaw')}
        />
        {errors.amountRaw && (
          <p className="text-xs text-red-600">{errors.amountRaw.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          placeholder="Ex: Mercado semanal"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-xs text-red-600">{errors.description.message}</p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="date">Data</Label>
        <Input
          id="date"
          type="date"
          {...register('date')}
        />
        {errors.date && (
          <p className="text-xs text-red-600">{errors.date.message}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push('/transactions')}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar Transação'}
        </Button>
      </div>
    </form>
  )
}
