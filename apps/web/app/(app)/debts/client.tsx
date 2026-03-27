'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { createDebt, updateDebt, deleteDebt } from '@/lib/finance/debt-actions'
import { formatBRL } from '@floow/core-finance'

interface DebtRow {
  id: string
  name: string
  type: string
  totalCents: number
  installments: number
  installmentCents: number
  interestRate: string | null
  startDate: string
  categoryId: string
  paidCount: number
  paidCents: number
  remainingCents: number
  progressPct: number
  nextDueDate: string
}

interface DebtsClientProps {
  debts: DebtRow[]
  categories: { id: string; name: string }[]
}

const TYPE_LABELS: Record<string, string> = {
  financing: 'Financiamento',
  loan: 'Emprestimo',
  installment: 'Parcelamento',
  consortium: 'Consorcio',
}

const TYPE_COLORS: Record<string, string> = {
  financing: 'bg-blue-100 text-blue-800',
  loan: 'bg-orange-100 text-orange-800',
  installment: 'bg-purple-100 text-purple-800',
  consortium: 'bg-teal-100 text-teal-800',
}

function parseCents(value: string): number {
  return Math.round(parseFloat(value.replace(',', '.')) * 100)
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('pt-BR')
}

function buildDebtRow(base: Omit<DebtRow, 'remainingCents' | 'progressPct' | 'nextDueDate'>): DebtRow {
  const remainingCents = Math.max(0, base.totalCents - base.paidCents)
  const progressPct = base.totalCents > 0 ? Math.round((base.paidCents / base.totalCents) * 100) : 0
  const nextDue = new Date(base.startDate)
  nextDue.setMonth(nextDue.getMonth() + base.paidCount)

  return {
    ...base,
    remainingCents,
    progressPct,
    nextDueDate: `${nextDue.getFullYear()}-${String(nextDue.getMonth() + 1).padStart(2, '0')}-${String(nextDue.getDate()).padStart(2, '0')}`,
  }
}

export function DebtsClient({ debts, categories }: DebtsClientProps) {
  const { toast } = useToast()
  const [debtRows, setDebtRows] = useState(debts)
  const [showForm, setShowForm] = useState(false)
  const [editingDebt, setEditingDebt] = useState<DebtRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('installment')
  const [formTotal, setFormTotal] = useState('')
  const [formInstallments, setFormInstallments] = useState('')
  const [formInstallmentValue, setFormInstallmentValue] = useState('')
  const [formInterestRate, setFormInterestRate] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formCategoryId, setFormCategoryId] = useState('')

  const totalRemaining = debtRows.reduce((sum, d) => sum + d.remainingCents, 0)

  function resetForm() {
    setFormName('')
    setFormType('installment')
    setFormTotal('')
    setFormInstallments('')
    setFormInstallmentValue('')
    setFormInterestRate('')
    setFormStartDate('')
    setFormCategoryId('')
  }

  function openAdd() {
    setEditingDebt(null)
    resetForm()
    setShowForm(true)
  }

  function openEdit(debt: DebtRow) {
    setEditingDebt(debt)
    setFormName(debt.name)
    setFormType(debt.type)
    setFormTotal(centsToDisplay(debt.totalCents))
    setFormInstallments(String(debt.installments))
    setFormInstallmentValue(centsToDisplay(debt.installmentCents))
    setFormInterestRate(debt.interestRate ?? '')
    setFormStartDate(debt.startDate)
    setFormCategoryId(debt.categoryId)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingDebt(null)
    resetForm()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('name', formName)
      fd.set('type', formType)
      fd.set('totalCents', String(parseCents(formTotal)))
      fd.set('installments', formInstallments)
      fd.set('installmentCents', String(parseCents(formInstallmentValue)))
      if (formInterestRate) fd.set('interestRate', formInterestRate)
      fd.set('startDate', formStartDate)
      fd.set('categoryId', formCategoryId)

      if (editingDebt) {
        fd.set('id', editingDebt.id)
        const updated = await updateDebt(fd)
        if (updated) {
          setDebtRows((prev) =>
            prev.map((debt) =>
              debt.id === editingDebt.id
                ? buildDebtRow({
                    ...debt,
                    name: updated.name,
                    type: updated.type,
                    totalCents: updated.totalCents,
                    installments: updated.installments,
                    installmentCents: updated.installmentCents,
                    interestRate: updated.interestRate,
                  })
                : debt
            )
          )
        }
        toast('Divida atualizada')
      } else {
        const created = await createDebt(fd)
        if (created) {
          setDebtRows((prev) => [
            ...prev,
            buildDebtRow({
              id: created.id,
              name: created.name,
              type: created.type,
              totalCents: created.totalCents,
              installments: created.installments,
              installmentCents: created.installmentCents,
              interestRate: created.interestRate,
              startDate: new Date(created.startDate).toISOString().split('T')[0],
              categoryId: created.categoryId,
              paidCount: 0,
              paidCents: 0,
            }),
          ])
        }
        toast('Dívida cadastrada')
      }

      closeForm()
    } catch {
      toast('Não foi possível salvar a dívida. Verifique os dados e tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('id', id)
      await deleteDebt(fd)
      setDebtRows((prev) => prev.filter((debt) => debt.id !== id))
      toast('Dívida removida')
      setDeleteConfirm(null)
    } catch {
      toast('Não foi possível remover a dívida. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Controle de Dividas">
        <Button variant="primary" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Nova dívida
        </Button>
      </PageHeader>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingDebt ? 'Editar Divida' : 'Nova Divida'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Nome</label>
                  <Input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Ex: Financiamento Imovel" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Tipo</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Valor total (R$)</label>
                  <Input type="text" inputMode="decimal" value={formTotal} onChange={(e) => setFormTotal(e.target.value)} required placeholder="Ex: 150.000,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Parcelas</label>
                  <Input type="number" value={formInstallments} onChange={(e) => setFormInstallments(e.target.value)} required min={1} placeholder="Ex: 360" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Valor da parcela (R$)</label>
                  <Input type="text" inputMode="decimal" value={formInstallmentValue} onChange={(e) => setFormInstallmentValue(e.target.value)} required placeholder="Ex: 1.200,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Taxa de juros (%)</label>
                  <Input type="text" inputMode="decimal" value={formInterestRate} onChange={(e) => setFormInterestRate(e.target.value)} placeholder="Ex: 0,99" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Data inicio</label>
                  <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Categoria</label>
                  <select value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                    <option value="">Selecione...</option>
                    <option value="__new__">+ Criar automaticamente</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingDebt ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {debtRows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-500">Nenhuma dívida cadastrada.</p>
            <Button variant="primary" className="mt-3" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Nova dívida
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Mobile: card layout */}
        <div className="md:hidden space-y-3">
          {debtRows.map((debt) => (
            <Card key={debt.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{debt.name}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium mt-1 ${TYPE_COLORS[debt.type] ?? 'bg-gray-100 text-gray-700'}`}>
                      {TYPE_LABELS[debt.type] ?? debt.type}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{formatBRL(debt.remainingCents)}</p>
                    <p className="text-[10px] text-gray-400">saldo devedor</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Parcelas</p>
                    <p className="font-medium">{debt.paidCount}/{debt.installments}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Pago</p>
                    <p className="font-medium">{formatBRL(debt.paidCents)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Próx. Venc.</p>
                    <p className="font-medium">{formatDateBR(debt.nextDueDate)}</p>
                  </div>
                </div>
                <BudgetProgressBar label="" currentCents={debt.paidCents} limitCents={debt.totalCents} invertColors />
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-100">
                  <button type="button" onClick={() => openEdit(debt)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setDeleteConfirm(debt.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Total Saldo Devedor</p>
            <p className="text-sm font-bold text-gray-900">{formatBRL(totalRemaining)}</p>
          </div>
        </div>

        {/* Desktop: table layout */}
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Nome</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Parcelas</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Valor Pago</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo Devedor</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Prox. Vencimento</th>
                    <th className="min-w-[160px] px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Progresso</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {debtRows.map((debt) => (
                    <tr key={debt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{debt.name}</td>
                      <td className="px-4 py-2.5 text-sm">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[debt.type] ?? 'bg-gray-100 text-gray-700'}`}>
                          {TYPE_LABELS[debt.type] ?? debt.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{debt.paidCount}/{debt.installments}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{formatBRL(debt.paidCents)}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900">{formatBRL(debt.remainingCents)}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateBR(debt.nextDueDate)}</td>
                      <td className="px-4 py-2.5">
                        <BudgetProgressBar label="" currentCents={debt.paidCents} limitCents={debt.totalCents} invertColors />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openEdit(debt)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setDeleteConfirm(debt.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900">{formatBRL(totalRemaining)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Remover divida"
        description="Tem certeza que deseja remover esta divida? Esta acao nao pode ser desfeita."
        confirmLabel="Remover"
        loading={saving}
      />
    </div>
  )
}
