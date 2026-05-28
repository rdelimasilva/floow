'use client'

import { useEffect, useRef, useState } from 'react'
import { createRecurringTemplate, updateRecurringTemplate } from '@/lib/finance/recurring-actions'
import { createCategory } from '@/lib/finance/actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { currencyToCents, generateInstallmentDates, formatBRL } from '@floow/core-finance'
import type { RecurringFrequency } from '@floow/core-finance'

interface AccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface CreateRecurringDialogProps {
  open: boolean
  onClose: () => void
  accounts: AccountOption[]
  categories: CategoryOption[]
  // Optional — for edit mode
  editTemplate?: {
    id: string
    accountId: string
    categoryId: string | null
    type: 'income' | 'expense' | 'transfer'
    amountCents: number
    description: string
    frequency: string
    nextDueDate: Date | string
    notes: string | null
  }
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const TYPE_LABELS: Record<'income' | 'expense', string> = {
  income: 'Receita',
  expense: 'Despesa',
}

function toDateInputValue(date: Date | string | undefined): string {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function CreateRecurringDialog({
  open,
  onClose,
  accounts,
  categories: initialCategories,
  editTemplate,
}: CreateRecurringDialogProps) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [loading, setLoading] = useState(false)

  // Form state
  const [description, setDescription] = useState(editTemplate?.description ?? '')
  const [accountId, setAccountId] = useState(editTemplate?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(editTemplate?.categoryId ?? '')
  const initType = editTemplate?.type === 'income' ? 'income' : 'expense'
  const [type, setType] = useState<'income' | 'expense'>(initType)
  const [amount, setAmount] = useState(
    editTemplate ? centsToInput(editTemplate.amountCents) : '',
  )
  const [frequency, setFrequency] = useState(editTemplate?.frequency ?? 'monthly')
  const [nextDueDate, setNextDueDate] = useState(toDateInputValue(editTemplate?.nextDueDate))
  const [notes, setNotes] = useState(editTemplate?.notes ?? '')

  // Duration controls
  type EndMode = 'count' | 'end_date' | 'indefinite'
  const [endMode, setEndMode] = useState<EndMode>('count')
  const [installmentCount, setInstallmentCount] = useState('12')
  const [recurringEndDate, setRecurringEndDate] = useState('')

  // Inline category creation
  const [categories, setCategories] = useState(initialCategories)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Sync form values when editTemplate prop changes
  useEffect(() => {
    setDescription(editTemplate?.description ?? '')
    setAccountId(editTemplate?.accountId ?? '')
    setCategoryId(editTemplate?.categoryId ?? '')
    setType(editTemplate?.type === 'income' ? 'income' : 'expense')
    setAmount(editTemplate ? centsToInput(editTemplate.amountCents) : '')
    setFrequency(editTemplate?.frequency ?? 'monthly')
    setNextDueDate(toDateInputValue(editTemplate?.nextDueDate))
    setNotes(editTemplate?.notes ?? '')
    setShowNewCategory(false)
    setNewCategoryName('')
    // Duration controls only apply on create — keep defaults on edit
    if (!editTemplate) {
      setEndMode('count')
      setInstallmentCount('12')
      setRecurringEndDate('')
    }
  }, [editTemplate])

  // Sync categories when prop changes
  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

  // Show/hide the dialog
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  // Filter categories by type (income categories for income, expense for expense)
  const filteredCategories = categories.filter((c) => c.type === type)

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  function handleTypeChange(t: 'income' | 'expense') {
    setType(t)
    // Reset category when switching type since list is filtered
    setCategoryId('')
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      const formData = new FormData()
      formData.append('name', newCategoryName.charAt(0).toUpperCase() + newCategoryName.slice(1))
      formData.append('type', type)
      const created = await createCategory(formData)
      setCategories((prev) => [...prev, created])
      setCategoryId(created.id)
      setNewCategoryName('')
      setShowNewCategory(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar categoria. Tente novamente.', 'error')
    } finally {
      setCreatingCategory(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountCents = currencyToCents(amount)
    if (!amountCents || isNaN(amountCents) || amountCents <= 0) {
      toast('Informe um valor válido', 'error')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('description', description)
      formData.append('accountId', accountId)
      formData.append('categoryId', categoryId)
      formData.append('type', type)
      formData.append('amountCents', String(amountCents))
      formData.append('frequency', frequency)
      formData.append('nextDueDate', nextDueDate)
      formData.append('notes', notes)

      if (editTemplate) {
        formData.append('id', editTemplate.id)
        await updateRecurringTemplate(formData)
        toast('Recorrência atualizada')
      } else {
        formData.append('endMode', endMode)
        if (endMode === 'count') {
          formData.append('installmentCount', installmentCount)
        }
        if (endMode === 'end_date' && recurringEndDate) {
          formData.append('endDate', recurringEndDate)
        }
        await createRecurringTemplate(formData)
        toast('Recorrência criada')
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar recorrência', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!editTemplate

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit}>
        <div className="w-[520px] p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {isEdit ? 'Editar Recorrência' : 'Nova Recorrência'}
          </h2>

          <div className="space-y-4">
            {/* Type segmented control */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
                {(['income', 'expense'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      type === t
                        ? 'bg-white shadow text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Aluguel, Netflix, Salário..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conta</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Ex: 150,75"
                  required
                />
              </div>
            </div>

            {/* Category — filtered by type, with inline creation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
              >
                <option value="">Selecione a categoria (opcional)</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!showNewCategory ? (
                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  + Criar nova categoria
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={`Nova categoria de ${type === 'income' ? 'receita' : 'despesa'}`}
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateCategory()
                      }
                    }}
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
                    onClick={() => {
                      setShowNewCategory(false)
                      setNewCategoryName('')
                    }}
                    className="h-8"
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequência</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isEdit ? 'Próxima data' : 'Data de início'}
                </label>
                <Input
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Duration controls — only on create */}
            {!isEdit && (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <label className="block text-sm font-medium text-gray-700">Duração</label>
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
                      placeholder="Ex: 12"
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

                {(() => {
                  if (!nextDueDate) return null
                  try {
                    const start = new Date(nextDueDate)
                    start.setHours(0, 0, 0, 0)
                    const cents = amount ? currencyToCents(amount) : 0
                    const dates = generateInstallmentDates({
                      startDate: start,
                      frequency: frequency as RecurringFrequency,
                      endMode,
                      installmentCount: endMode === 'count' ? parseInt(installmentCount) || 1 : undefined,
                      endDate: endMode === 'end_date' && recurringEndDate ? new Date(recurringEndDate) : undefined,
                    })
                    if (dates.length === 0) return null
                    const first = dates[0].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                    const last = dates[dates.length - 1].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                    const amountStr = cents > 0 ? formatBRL(cents) : 'R$ 0,00'
                    return (
                      <p className="text-xs text-gray-500 bg-white rounded px-3 py-2 border border-gray-100">
                        Serão geradas {dates.length} transações de {amountStr}, de {first} a {last}.
                      </p>
                    )
                  } catch {
                    return null
                  }
                })()}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações adicionais..."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !description || !accountId || !amount || !nextDueDate}
            >
              {loading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
