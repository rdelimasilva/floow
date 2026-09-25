'use client'

import { useEffect, useRef, useState } from 'react'
import { createRecurringTemplate, updateRecurringTemplate } from '@/lib/finance/recurring-actions'
import { createCategory } from '@/lib/finance/category-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { currencyToCents } from '@floow/core-finance/src/balance'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { dataDeCalendario } from '@/lib/finance/recurring-dates'
import { RecurringDurationFields, type EndMode } from '@/components/finance/recurring-duration-fields'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface AccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
  parentId?: string | null
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
    // Próxima parcela em aberto ('YYYY-MM-DD'); é a data que a edição move
    proximaParcela?: string | null
    notes: string | null
    countsAsBudget?: boolean
  }
  // Optional — cria uma recorrência nova partindo dos dados de uma existente
  cloneFrom?: RecurringPrefill
}

type RecurringPrefill = Pick<
  NonNullable<CreateRecurringDialogProps['editTemplate']>,
  'accountId' | 'categoryId' | 'type' | 'amountCents' | 'description' | 'frequency' | 'notes' | 'countsAsBudget'
>

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

// Sem parcela em aberto, a data editável é a do próprio template.
function dataEditavel(t: CreateRecurringDialogProps['editTemplate']): string {
  return dataDeCalendario(t?.proximaParcela ?? t?.nextDueDate)
}

// A cópia é uma série nova: começa hoje, não continua as datas da original.
function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
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
  cloneFrom,
}: CreateRecurringDialogProps) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [loading, setLoading] = useState(false)

  // Form state — na edição vem do template; ao clonar, da recorrência copiada
  const base = editTemplate ?? cloneFrom
  const dataInicial = () => (editTemplate ? dataEditavel(editTemplate) : cloneFrom ? hojeEmSaoPaulo() : '')
  const [description, setDescription] = useState(base?.description ?? '')
  const [accountId, setAccountId] = useState(base?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(base?.categoryId ?? '')
  const [type, setType] = useState<'income' | 'expense'>(base?.type === 'income' ? 'income' : 'expense')
  const [amount, setAmount] = useState(base ? centsToInput(base.amountCents) : '')
  const [frequency, setFrequency] = useState(base?.frequency ?? 'monthly')
  const [nextDueDate, setNextDueDate] = useState(dataInicial)
  const [notes, setNotes] = useState(base?.notes ?? '')
  const [metaDeGasto, setMetaDeGasto] = useState(base?.countsAsBudget ?? false)

  // Duration controls
  const [endMode, setEndMode] = useState<EndMode>('count')
  const [installmentCount, setInstallmentCount] = useState('12')
  const [recurringEndDate, setRecurringEndDate] = useState('')

  // Inline category creation
  const [categories, setCategories] = useState(initialCategories)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Sync form values when editTemplate/cloneFrom props change
  useEffect(() => {
    setDescription(base?.description ?? '')
    setAccountId(base?.accountId ?? '')
    setCategoryId(base?.categoryId ?? '')
    setType(base?.type === 'income' ? 'income' : 'expense')
    setAmount(base ? centsToInput(base.amountCents) : '')
    setFrequency(base?.frequency ?? 'monthly')
    setNextDueDate(dataInicial())
    setNotes(base?.notes ?? '')
    setMetaDeGasto(base?.countsAsBudget ?? false)
    setShowNewCategory(false)
    setNewCategoryName('')
    // Duration controls only apply on create — keep defaults on edit
    if (!editTemplate) {
      setEndMode('count')
      setInstallmentCount('12')
      setRecurringEndDate('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base/dataInicial derivam destas duas props
  }, [editTemplate, cloneFrom])

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

  // Meta de gasto precisa de categoria onde entrar, e receita não é gasto.
  const podeSerMeta = type === 'expense' && !!categoryId

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
      toast(mensagemDeErro(e, 'Erro ao criar categoria. Tente novamente.'), 'error')
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
      formData.append('countsAsBudget', String(podeSerMeta && metaDeGasto))

      if (editTemplate) {
        formData.append('id', editTemplate.id)
        const { movidas } = await updateRecurringTemplate(formData)
        toast(movidas > 0 ? `Recorrência atualizada — ${movidas} parcela(s) mudaram de data` : 'Recorrência atualizada')
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
      toast(mensagemDeErro(err, 'Erro ao salvar recorrência'), 'error')
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
                {toCategoryOptions(filteredCategories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
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
              {podeSerMeta && (
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={metaDeGasto}
                    onChange={(e) => setMetaDeGasto(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Contar como meta de gasto
                </label>
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
                  {isEdit ? 'Próxima parcela' : 'Data de início'}
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
              <RecurringDurationFields
                endMode={endMode}
                onEndModeChange={setEndMode}
                installmentCount={installmentCount}
                onInstallmentCountChange={setInstallmentCount}
                endDate={recurringEndDate}
                onEndDateChange={setRecurringEndDate}
                startDate={nextDueDate}
                frequency={frequency}
                amount={amount}
              />
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
