'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createTransaction, createCategory, createRecurringTransactions } from '@/lib/finance/actions'
import { formatBRL, currencyToCents, generateInstallmentDates } from '@floow/core-finance'
import type { RecurringFrequency } from '@floow/core-finance'
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

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

type EndMode = 'count' | 'end_date' | 'indefinite'

// ── Props ──────────────────────────────────────────────────────────────────────

interface TransactionFormProps {
  accounts: Account[]
  categories: Category[]
  onSuccess?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
}

export function TransactionForm({ accounts, categories: initialCategories, onSuccess }: TransactionFormProps) {
  const router = useRouter()
  const [txType, setTxType] = useState<TransactionType>('expense')
  const [categories, setCategories] = useState(initialCategories)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [endMode, setEndMode] = useState<EndMode>('count')
  const [installmentCount, setInstallmentCount] = useState('12')
  const [recurringEndDate, setRecurringEndDate] = useState('')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
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

  // Preview text for recurring transactions
  const watchDate = watch('date')
  const watchAmount = watch('amountRaw')
  const recurringPreview = (() => {
    if (!isRecurring) return null
    try {
      if (!watchDate) return null
      const startDate = new Date(watchDate)
      startDate.setHours(0, 0, 0, 0)
      const amountCents = watchAmount ? currencyToCents(watchAmount) : 0

      const dates = generateInstallmentDates({
        startDate,
        frequency,
        endMode,
        installmentCount: endMode === 'count' ? parseInt(installmentCount) || 1 : undefined,
        endDate: endMode === 'end_date' && recurringEndDate ? new Date(recurringEndDate) : undefined,
      })

      if (dates.length === 0) return null

      const firstDate = dates[0].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      const lastDate = dates[dates.length - 1].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      const amountStr = amountCents > 0 ? formatBRL(amountCents) : 'R$ 0,00'

      return `Serão geradas ${dates.length} transações de ${amountStr}, de ${firstDate} a ${lastDate}`
    } catch {
      return null
    }
  })()

  async function onSubmit(data: TransactionFormData) {
    const amountCents = currencyToCents(data.amountRaw)
    if (amountCents <= 0) return

    if (isRecurring) {
      const formData = new FormData()
      formData.append('type', data.type)
      formData.append('accountId', data.accountId)
      formData.append('amountCents', String(amountCents))
      formData.append('description', data.description)
      formData.append('startDate', data.date)
      formData.append('frequency', frequency)
      formData.append('endMode', endMode)

      if (data.categoryId) formData.append('categoryId', data.categoryId)
      if (data.type === 'transfer' && data.transferToAccountId) {
        formData.append('destinationAccountId', data.transferToAccountId)
      }

      if (endMode === 'count') {
        formData.append('installmentCount', installmentCount)
      }
      if (endMode === 'end_date' && recurringEndDate) {
        formData.append('endDate', recurringEndDate)
      }

      await createRecurringTransactions(formData)
    } else {
      const formData = new FormData()
      formData.append('type', data.type)
      formData.append('accountId', data.accountId)
      formData.append('amountCents', String(amountCents))
      formData.append('description', data.description)
      formData.append('date', data.date)

      if (data.categoryId) formData.append('categoryId', data.categoryId)
      if (data.type === 'transfer' && data.transferToAccountId) {
        formData.append('transferToAccountId', data.transferToAccountId)
      }

      await createTransaction(formData)
    }

    if (onSuccess) {
      onSuccess()
    } else {
      router.push('/transactions')
    }
  }

  function handleTypeChange(type: TransactionType) {
    setTxType(type)
    setValue('type', type)
    // Clear category when switching to transfer
    if (type === 'transfer') {
      setValue('categoryId', undefined)
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      const formData = new FormData()
      formData.append('name', newCategoryName.charAt(0).toUpperCase() + newCategoryName.slice(1))
      formData.append('type', txType === 'income' ? 'income' : 'expense')
      const created = await createCategory(formData)
      setCategories((prev) => [...prev, created])
      setValue('categoryId', created.id)
      setNewCategoryName('')
      setShowNewCategory(false)
    } catch {
      // toast would be nice but keeping it simple
    } finally {
      setCreatingCategory(false)
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
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {!showNewCategory ? (
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              + Criar nova categoria
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={`Nova categoria de ${txType === 'income' ? 'receita' : 'despesa'}`}
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleCreateCategory}
                disabled={creatingCategory || !newCategoryName.trim()}
                className="h-8"
              >
                {creatingCategory ? '...' : 'Criar'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { setShowNewCategory(false); setNewCategoryName('') }}
                className="h-8"
              >
                Cancelar
              </Button>
            </div>
          )}
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

      {/* Recurring toggle */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">Recorrente</span>
        </label>
      </div>

      {isRecurring && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {/* Frequency */}
          <div className="space-y-1.5">
            <Label>Frequência</Label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* End mode */}
          <div className="space-y-1.5">
            <Label>Término</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="count"
                  checked={endMode === 'count'}
                  onChange={() => setEndMode('count')}
                  className="border-gray-300"
                />
                <span className="text-sm">Número de parcelas</span>
              </label>
              {endMode === 'count' && (
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  placeholder="Ex: 24"
                  className="ml-6 w-32"
                />
              )}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="end_date"
                  checked={endMode === 'end_date'}
                  onChange={() => setEndMode('end_date')}
                  className="border-gray-300"
                />
                <span className="text-sm">Até uma data</span>
              </label>
              {endMode === 'end_date' && (
                <Input
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  className="ml-6 w-48"
                />
              )}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="indefinite"
                  checked={endMode === 'indefinite'}
                  onChange={() => setEndMode('indefinite')}
                  className="border-gray-300"
                />
                <span className="text-sm">Sem fim (máx. 60 meses)</span>
              </label>
            </div>
          </div>

          {/* Preview */}
          {recurringPreview && (
            <p className="text-xs text-gray-500 bg-white rounded px-3 py-2 border border-gray-100">
              {recurringPreview}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        {!onSuccess && (
          <Button type="button" variant="outline" onClick={() => router.push('/transactions')}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : isRecurring ? 'Criar Recorrência' : 'Registrar Transação'}
        </Button>
      </div>
    </form>
  )
}
