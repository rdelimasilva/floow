'use client'

import { useEffect, useRef, useState } from 'react'
import { createRecurringTemplate, updateRecurringTemplate } from '@/lib/finance/recurring-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

function toDateInputValue(date: Date | string | undefined): string {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function CreateRecurringDialog({
  open,
  onClose,
  accounts,
  categories,
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
    editTemplate ? String(editTemplate.amountCents / 100) : '',
  )
  const [frequency, setFrequency] = useState(editTemplate?.frequency ?? 'monthly')
  const [nextDueDate, setNextDueDate] = useState(toDateInputValue(editTemplate?.nextDueDate))
  const [notes, setNotes] = useState(editTemplate?.notes ?? '')

  // Sync form values when editTemplate prop changes
  useEffect(() => {
    setDescription(editTemplate?.description ?? '')
    setAccountId(editTemplate?.accountId ?? '')
    setCategoryId(editTemplate?.categoryId ?? '')
    setType(editTemplate?.type === 'income' ? 'income' : 'expense')
    setAmount(editTemplate ? String(editTemplate.amountCents / 100) : '')
    setFrequency(editTemplate?.frequency ?? 'monthly')
    setNextDueDate(toDateInputValue(editTemplate?.nextDueDate))
    setNotes(editTemplate?.notes ?? '')
  }, [editTemplate])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const amountCents = Math.round(parseFloat(amount) * 100)
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
        toast('Recorrencia atualizada')
      } else {
        await createRecurringTemplate(formData)
        toast('Recorrencia criada')
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar recorrencia', 'error')
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
            {isEdit ? 'Editar Recorrencia' : 'Nova Recorrencia'}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Aluguel, Netflix, Salario..."
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Nenhuma</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'income' | 'expense')}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequencia</label>
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
                  {isEdit ? 'Proxima data' : 'Data de inicio'}
                </label>
                <Input
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observacoes adicionais..."
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
