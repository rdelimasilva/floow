'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { createBudgetEntry, updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance'

interface CategoryOption {
  id: string
  name: string
  color: string | null
  icon: string | null
}

interface EntryForMonth {
  id: string
  categoryId: string
  plannedCents: number
}

interface AllEntry {
  id: string
  categoryId: string
  plannedCents: number
  startMonth: string
  endMonth: string | null
}

interface SpendingClientProps {
  categories: CategoryOption[]
  entriesForMonth: EntryForMonth[]
  allEntries: AllEntry[]
  spending: { categoryId: string | null; spent: number }[]
  selectedMonth: string
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function SpendingClient({
  categories,
  entriesForMonth,
  allEntries,
  spending,
  selectedMonth,
}: SpendingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editEndMonth, setEditEndMonth] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // New entry form state
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newPlannedCents, setNewPlannedCents] = useState('')
  const [newStartMonth, setNewStartMonth] = useState(selectedMonth)
  const [newEndMonth, setNewEndMonth] = useState('')

  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]))
  const totalPlanned = entriesForMonth.reduce((sum, e) => sum + e.plannedCents, 0)
  const totalSpent = spending.reduce((sum, s) => sum + s.spent, 0)

  // Categories that already have an active entry
  const usedCategoryIds = new Set(allEntries.map((e) => e.categoryId))
  const availableCategories = categories.filter((c) => !usedCategoryIds.has(c.id))

  function navigateMonth(delta: number) {
    router.push(`/budgets/spending?month=${shiftMonth(selectedMonth, delta)}`)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const cents = Math.round(parseFloat(newPlannedCents.replace(',', '.')) * 100)
      const fd = new FormData()
      fd.set('categoryId', newCategoryId)
      fd.set('plannedCents', String(cents))
      fd.set('startMonth', newStartMonth)
      if (newEndMonth) fd.set('endMonth', newEndMonth)
      await createBudgetEntry(fd)
      toast('Lançamento criado')
      setShowAdd(false)
      setNewCategoryId('')
      setNewPlannedCents('')
      setNewEndMonth('')
    } catch {
      toast('Erro ao criar lançamento', 'error')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry: AllEntry) {
    setEditingId(entry.id)
    setEditValue((entry.plannedCents / 100).toFixed(2).replace('.', ','))
    setEditEndMonth(entry.endMonth ? entry.endMonth.slice(0, 7) : '')
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setSaving(true)
    try {
      const cents = Math.round(parseFloat(editValue.replace(',', '.')) * 100)
      const fd = new FormData()
      fd.set('id', editingId)
      fd.set('plannedCents', String(cents))
      if (editEndMonth) fd.set('endMonth', editEndMonth + '-01')
      await updateBudgetEntry(fd)
      toast('Lançamento atualizado')
      setEditingId(null)
    } catch {
      toast('Erro ao atualizar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entryId: string) {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('id', entryId)
      await deleteBudgetEntry(fd)
      toast('Lançamento removido')
      setDeleteConfirm(null)
    } catch {
      toast('Erro ao remover', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meta de Gastos" description="Orçado vs Realizado por categoria">
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Novo lançamento
        </Button>
      </PageHeader>

      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">{formatMonth(selectedMonth)}</span>
        <Button variant="ghost" size="sm" onClick={() => navigateMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Add new recurring entry */}
      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Lançamento Recorrente</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Categoria</label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Selecione...</option>
                    {availableCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.icon ?? ''} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Valor mensal (R$)</label>
                  <Input type="text" inputMode="decimal" value={newPlannedCents} onChange={(e) => setNewPlannedCents(e.target.value)} required placeholder="Ex: 800,00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">A partir de</label>
                  <Input type="month" value={newStartMonth.slice(0, 7)} onChange={(e) => setNewStartMonth(e.target.value + '-01')} required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Até (vazio = para sempre)</label>
                  <Input type="month" value={newEndMonth ? newEndMonth.slice(0, 7) : ''} onChange={(e) => setNewEndMonth(e.target.value ? e.target.value + '-01' : '')} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Criar'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {entriesForMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo — {formatMonth(selectedMonth)}</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetProgressBar label="Total" currentCents={totalSpent} limitCents={totalPlanned} />
          </CardContent>
        </Card>
      )}

      {/* Orçado vs Realizado table */}
      {entriesForMonth.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orçado vs Realizado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Categoria</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Orçado</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Realizado</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Diferença</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entriesForMonth.map((entry) => {
                    const cat = categories.find((c) => c.id === entry.categoryId)
                    const actual = spendingMap.get(entry.categoryId) ?? 0
                    const diff = entry.plannedCents - actual
                    const pct = entry.plannedCents > 0 ? Math.round((actual / entry.plannedCents) * 100) : 0
                    const isOver = actual > entry.plannedCents

                    return (
                      <tr key={entry.categoryId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                          {cat?.icon && <span className="mr-1">{cat.icon}</span>}
                          {cat?.name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-600">{formatBRL(entry.plannedCents)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-medium">{formatBRL(actual)}</td>
                        <td className={`px-4 py-2.5 text-sm text-right font-medium ${isOver ? 'text-red-600' : 'text-green-700'}`}>
                          {isOver ? '-' : '+'}{formatBRL(Math.abs(diff))}
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-right font-medium ${pct > 100 ? 'text-red-600' : pct > 80 ? 'text-yellow-600' : 'text-green-700'}`}>
                          {pct}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-600">{formatBRL(totalPlanned)}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-900">{formatBRL(totalSpent)}</td>
                    <td className={`px-4 py-2.5 text-sm text-right font-semibold ${totalSpent > totalPlanned ? 'text-red-600' : 'text-green-700'}`}>
                      {totalSpent > totalPlanned ? '-' : '+'}{formatBRL(Math.abs(totalPlanned - totalSpent))}
                    </td>
                    <td className={`px-4 py-2.5 text-sm text-right font-semibold ${totalPlanned > 0 && Math.round((totalSpent / totalPlanned) * 100) > 100 ? 'text-red-600' : 'text-green-700'}`}>
                      {totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 text-sm">Nenhum orçamento ativo para {formatMonth(selectedMonth)}.</p>
            <Button variant="outline" className="mt-3" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Criar lançamento
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active recurring entries */}
      {allEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lançamentos Recorrentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allEntries.map((entry) => {
                const cat = categories.find((c) => c.id === entry.categoryId)
                const isEditing = editingId === entry.id

                if (isEditing) {
                  return (
                    <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                      <span className="text-sm font-medium text-gray-900 w-36 truncate">
                        {cat?.icon && <span className="mr-1">{cat.icon}</span>}
                        {cat?.name ?? '—'}
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 w-28 text-sm"
                        placeholder="R$"
                      />
                      <span className="text-xs text-gray-500">/mês</span>
                      <span className="text-xs text-gray-500 ml-1">até:</span>
                      <Input
                        type="month"
                        value={editEndMonth}
                        onChange={(e) => setEditEndMonth(e.target.value)}
                        className="h-7 w-36 text-sm"
                      />
                      <button type="button" onClick={handleSaveEdit} disabled={saving} className="rounded p-1 text-green-600 hover:bg-green-50">
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {cat?.icon && <span className="mr-1">{cat.icon}</span>}
                        {cat?.name ?? '—'}
                      </span>
                      <span className="ml-2 text-sm text-gray-600">{formatBRL(entry.plannedCents)}/mês</span>
                      <span className="ml-2 text-xs text-gray-400">
                        de {formatMonth(entry.startMonth)}
                        {entry.endMonth ? ` até ${formatMonth(entry.endMonth)}` : ' em diante'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(entry.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Remover lançamento"
        description="Tem certeza que deseja remover este lançamento recorrente? Ele deixará de aparecer no orçamento de todos os meses."
        confirmLabel="Remover"
        loading={saving}
      />
    </div>
  )
}
