'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { createBudgetEntry, updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { createCategory } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance'
import { RecurringEntriesList } from './recurring-entries-list'

interface CategoryOption {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
}

interface EntryForMonth {
  id: string
  categoryId: string | null
  plannedCents: number
}

interface AllEntry {
  id: string
  categoryId: string | null
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
  categories: initialCategories,
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

  // Inline category creation
  const [categories, setCategories] = useState(initialCategories)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]))
  const totalPlanned = entriesForMonth.reduce((sum, e) => sum + e.plannedCents, 0)
  const totalSpent = spending.reduce((sum, s) => sum + s.spent, 0)

  // Categories that already have an active entry
  const usedCategoryIds = new Set(allEntries.map((e) => e.categoryId))
  // Defensive: only expense categories are valid for spending budgets
  const availableCategories = categories.filter(
    (c) => c.type === 'expense' && !usedCategoryIds.has(c.id),
  )

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    try {
      const fd = new FormData()
      fd.append('name', newCategoryName.charAt(0).toUpperCase() + newCategoryName.slice(1))
      fd.append('type', 'expense')
      const created = await createCategory(fd)
      setCategories((prev) => [
        ...prev,
        { id: created.id, name: created.name, type: created.type, color: created.color, icon: created.icon },
      ])
      setNewCategoryId(created.id)
      setNewCategoryName('')
      setShowNewCategory(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar categoria. Tente novamente.', 'error')
    } finally {
      setCreatingCategory(false)
    }
  }

  function navigateMonth(delta: number) {
    router.push(`/budgets/spending?month=${shiftMonth(selectedMonth, delta)}`)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const cents = Math.round(parseFloat(newPlannedCents.replace(',', '.')) * 100)
      const fd = new FormData()
      fd.set('type', 'spending')
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
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
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
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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

      {/* Orçado vs Realizado */}
      {entriesForMonth.length > 0 ? (
        <>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-2">
            {entriesForMonth.map((entry) => {
              const cat = categories.find((c) => c.id === entry.categoryId)
              const actual = spendingMap.get(entry.categoryId) ?? 0
              const diff = entry.plannedCents - actual
              const pct = entry.plannedCents > 0 ? Math.round((actual / entry.plannedCents) * 100) : 0
              const isOver = actual > entry.plannedCents

              return (
                <Card key={entry.categoryId}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                        {cat?.name ?? '—'}
                      </p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct > 100 ? 'bg-red-100 text-red-700' : pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Orçado: {formatBRL(entry.plannedCents)}</span>
                      <span className="font-medium text-gray-900">Gasto: {formatBRL(actual)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className={`text-xs font-medium text-right ${isOver ? 'text-red-600' : 'text-green-700'}`}>
                      {isOver ? '-' : '+'}{formatBRL(Math.abs(diff))}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Total</span>
                <span className={`font-bold ${totalSpent > totalPlanned ? 'text-red-600' : 'text-green-700'}`}>
                  {formatBRL(totalSpent)} / {formatBRL(totalPlanned)} ({totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* Desktop: table layout */}
          <Card className="hidden md:block">
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
                            {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
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
        </>
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
      <RecurringEntriesList
        allEntries={allEntries}
        categories={categories}
        editingId={editingId}
        editValue={editValue}
        editEndMonth={editEndMonth}
        saving={saving}
        onStartEdit={startEdit}
        onChangeEditValue={setEditValue}
        onChangeEditEndMonth={setEditEndMonth}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingId(null)}
        onDelete={(id) => setDeleteConfirm(id)}
        formatMonth={formatMonth}
      />

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
