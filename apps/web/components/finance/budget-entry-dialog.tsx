'use client'

import { useEffect, useRef, useState } from 'react'
import { createBudgetEntry } from '@/lib/finance/budget-actions'
import { createCategory } from '@/lib/finance/category-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { currencyToCents, formatBRL } from '@floow/core-finance/src/balance'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { ACCOUNT_TYPE_LABEL } from '@/lib/finance/account-types'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

export interface BudgetCategoryOption {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
}

interface BudgetEntryDialogProps {
  /** Gastos pedem categoria; investimentos pedem uma descrição livre. */
  type: 'spending' | 'investing'
  open: boolean
  onClose: () => void
  /** Só em gastos: categorias de despesa ainda sem teto ativo. */
  availableCategories?: BudgetCategoryOption[]
  onCategoryCreated?: (category: BudgetCategoryOption) => void
  /** Pré-preenchimento vindo do aceite de uma sugestão de categoria. */
  initialCategoryId?: string
  initialAmountCents?: number
}

type EndMode = 'indefinite' | 'end_month'

function formatMonthShort(monthInput: string): string {
  const [y, m] = monthInput.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}

export function BudgetEntryDialog({
  type,
  open,
  onClose,
  availableCategories = [],
  onCategoryCreated,
  initialCategoryId,
  initialAmountCents,
}: BudgetEntryDialogProps) {
  const isSpending = type === 'spending'
  const defaultName = isSpending ? '' : 'Aporte mensal'
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [loading, setLoading] = useState(false)

  // Form state — meses guardados como YYYY-MM, o formato do <input type="month">
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState(defaultName)
  const [amount, setAmount] = useState('')
  // O início é escolha do usuário: vinha preenchido com o mês aberto na tela e
  // a meta nascia num mês que ninguém escolheu.
  const [startMonth, setStartMonth] = useState('')
  const [endMode, setEndMode] = useState<EndMode>('indefinite')
  const [endMonth, setEndMonth] = useState('')

  // Inline category creation
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  // Cada abertura começa limpa (ou com o que veio da sugestão aceita)
  useEffect(() => {
    if (!open) return
    setCategoryId(initialCategoryId ?? '')
    setName(defaultName)
    setAmount(initialAmountCents ? (initialAmountCents / 100).toFixed(2).replace('.', ',') : '')
    setStartMonth('')
    setEndMode('indefinite')
    setEndMonth('')
    setShowNewCategory(false)
    setNewCategoryName('')
  }, [open, defaultName, initialCategoryId, initialAmountCents])

  // Show/hide the dialog
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      const fd = new FormData()
      fd.append('name', newCategoryName.charAt(0).toUpperCase() + newCategoryName.slice(1))
      fd.append('type', 'expense')
      const created = await createCategory(fd)
      onCategoryCreated?.({
        id: created.id,
        name: created.name,
        type: created.type,
        color: created.color,
        icon: created.icon,
      })
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
    const cents = currencyToCents(amount)
    if (!cents || isNaN(cents) || cents <= 0) {
      toast('Informe um valor válido', 'error')
      return
    }
    if (endMode === 'end_month' && endMonth && endMonth < startMonth) {
      toast('O mês final não pode ser anterior ao inicial', 'error')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.set('type', type)
      if (isSpending) fd.set('categoryId', categoryId)
      else fd.set('name', name)
      fd.set('plannedCents', String(cents))
      fd.set('startMonth', startMonth + '-01')
      if (endMode === 'end_month' && endMonth) fd.set('endMonth', endMonth + '-01')
      await createBudgetEntry(fd)
      toast('Lançamento criado')
      onClose()
    } catch {
      toast('Erro ao criar lançamento', 'error')
    } finally {
      setLoading(false)
    }
  }

  function renderSummary() {
    if (!startMonth) return null
    const cents = amount ? currencyToCents(amount) : 0
    const amountStr = cents > 0 ? formatBRL(cents) : 'R$ 0,00'
    const from = formatMonthShort(startMonth)
    const noun = isSpending ? 'Teto' : 'Meta'
    if (endMode === 'end_month') {
      if (!endMonth || endMonth < startMonth) return null
      const count = monthsBetween(startMonth, endMonth)
      return `${noun} de ${amountStr} por mês durante ${count} ${count === 1 ? 'mês' : 'meses'}, de ${from} a ${formatMonthShort(endMonth)}.`
    }
    return `${noun} de ${amountStr} por mês a partir de ${from}, sem data para acabar.`
  }

  const summary = renderSummary()

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit}>
        <div className="w-[520px] max-w-full p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Lançamento</h2>

          <div className="space-y-4">
            {!isSpending && (
              <>
                <p className="text-xs text-gray-500">
                  O realizado será calculado automaticamente pelas transferências para contas do tipo{' '}
                  {ACCOUNT_TYPE_LABEL.brokerage}.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Aporte mensal"
                    required
                  />
                </div>
              </>
            )}

            {/* Category — expense only, with inline creation */}
            {isSpending && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Selecione a categoria</option>
                  {toCategoryOptions(availableCategories).map((c) => (
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
                      placeholder="Nova categoria de despesa"
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
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor mensal (R$)</label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={isSpending ? 'Ex: 800,00' : 'Ex: 2.000,00'}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">A partir de</label>
                <Input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Duration controls */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block text-sm font-medium text-gray-700">Duração</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="spendingEndMode"
                    value="indefinite"
                    checked={endMode === 'indefinite'}
                    onChange={() => setEndMode('indefinite')}
                    className="border-gray-300"
                  />
                  <span className="text-sm">Sem fim</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="spendingEndMode"
                    value="end_month"
                    checked={endMode === 'end_month'}
                    onChange={() => setEndMode('end_month')}
                    className="border-gray-300"
                  />
                  <span className="text-sm">Até um mês</span>
                </label>
                {endMode === 'end_month' && (
                  <Input
                    type="month"
                    value={endMonth}
                    min={startMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    required
                    className="ml-6 w-48"
                  />
                )}
              </div>

              {summary && (
                <p className="text-xs text-gray-500 bg-white rounded px-3 py-2 border border-gray-100">
                  {summary}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                loading ||
                (isSpending ? !categoryId : !name.trim()) ||
                !amount ||
                !startMonth ||
                (endMode === 'end_month' && !endMonth)
              }
            >
              {loading ? 'Salvando...' : 'Criar'}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
