'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { MonthNavigator } from '@/components/finance/month-navigator'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatBRL, currencyToCents } from '@floow/core-finance/src/balance'
import { RecurringEntriesList } from './recurring-entries-list'
import { BudgetEntryDialog } from '@/components/finance/budget-entry-dialog'
import type { LinhaDeMeta } from '@/lib/finance/recurring-budget'
import { RecorrentesNaLinha } from './recorrentes-na-linha'

interface CategoryOption {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
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
  /** Metas manuais já combinadas com as recorrentes-meta do mês. */
  entriesForMonth: LinhaDeMeta[]
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
  const [editStartMonth, setEditStartMonth] = useState('')
  const [editEndMonth, setEditEndMonth] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [categories, setCategories] = useState(initialCategories)

  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]))
  const totalPlanned = entriesForMonth.reduce((sum, e) => sum + e.plannedCents, 0)

  // O total gasto conta apenas as categorias que TÊM teto neste mês, para
  // comparar com totalPlanned no mesmo universo. Somar todas as despesas
  // inflava o percentual com gasto que o usuário nunca se propôs a controlar.
  const budgetedCategoryIds = new Set(entriesForMonth.map((e) => e.categoryId))
  const totalSpent = spending
    .filter((s) => s.categoryId !== null && budgetedCategoryIds.has(s.categoryId))
    .reduce((sum, s) => sum + s.spent, 0)

  // O restante não some da tela: aparece como "não orçado", fora do denominador.
  const totalUnbudgeted = spending
    .filter((s) => s.categoryId === null || !budgetedCategoryIds.has(s.categoryId))
    .reduce((sum, s) => sum + s.spent, 0)

  // Categories that already have an active entry
  const usedCategoryIds = new Set(allEntries.map((e) => e.categoryId))
  // Defensive: only expense categories are valid for spending budgets
  const availableCategories = categories.filter(
    (c) => c.type === 'expense' && !usedCategoryIds.has(c.id),
  )

  function navigateMonth(delta: number) {
    router.push(`/budgets/spending?month=${shiftMonth(selectedMonth, delta)}`)
  }

  function startEdit(entry: AllEntry) {
    setEditingId(entry.id)
    setEditValue((entry.plannedCents / 100).toFixed(2).replace('.', ','))
    setEditStartMonth(entry.startMonth.slice(0, 7))
    setEditEndMonth(entry.endMonth ? entry.endMonth.slice(0, 7) : '')
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('id', editingId)
      fd.set('plannedCents', String(currencyToCents(editValue)))
      if (editStartMonth) fd.set('startMonth', editStartMonth + '-01')
      if (editEndMonth) fd.set('endMonth', editEndMonth + '-01')
      await updateBudgetEntry(fd)
      toast('Lançamento atualizado')
      setEditingId(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atualizar', 'error')
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

      <MonthNavigator month={selectedMonth} onShift={navigateMonth} />

      {/* Summary */}
      {entriesForMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo — {formatMonth(selectedMonth)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BudgetProgressBar label="Total" currentCents={totalSpent} limitCents={totalPlanned} />
            {totalUnbudgeted > 0 && (
              <p className="text-sm text-muted-foreground">
                Mais <strong className="text-gray-900">{formatBRL(totalUnbudgeted)}</strong> em
                categorias sem teto, fora do total acima.
              </p>
            )}
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
                <Card key={entry.entryId ?? `rec-${entry.categoryId}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                        {cat?.name ?? '—'}
                        <RecorrentesNaLinha linha={entry} />
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
                        <tr key={entry.entryId ?? `rec-${entry.categoryId}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                            {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                            {cat?.name ?? '—'}
                            <RecorrentesNaLinha linha={entry} />
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
        editStartMonth={editStartMonth}
        editEndMonth={editEndMonth}
        saving={saving}
        onStartEdit={startEdit}
        onChangeEditValue={setEditValue}
        onChangeEditStartMonth={setEditStartMonth}
        onChangeEditEndMonth={setEditEndMonth}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingId(null)}
        onDelete={(id) => setDeleteConfirm(id)}
        formatMonth={formatMonth}
      />

      <BudgetEntryDialog
        type="spending"
        open={showAdd}
        onClose={() => setShowAdd(false)}
        availableCategories={availableCategories}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
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
