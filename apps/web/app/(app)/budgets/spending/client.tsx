'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Gauge, FlaskConical } from 'lucide-react'
import { MonthNavigator } from '@/components/finance/month-navigator'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatBRL, currencyToCents } from '@floow/core-finance/src/balance'
import { RecurringEntriesList } from './recurring-entries-list'
import { BudgetEntryDialog } from '@/components/finance/budget-entry-dialog'
import type { LinhaDeMeta } from '@/lib/finance/recurring-budget'
import { RecorrentesNaLinha } from './recorrentes-na-linha'
import type { ParcelasDaCategoria } from '@/lib/finance/parcelas-a-vencer'
import { ParcelasNaLinha } from './parcelas-na-linha'
import { BudgetGoalSuggestionsCard } from '@/components/finance/budget-goal-suggestions-card'
import type { BudgetGoalSuggestionRow } from '@/lib/finance/budget-goal-suggestion-queries'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface CategoryOption {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
  parentId?: string | null
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
  /** Parcelas de cartão do mês que ainda não venceram, por categoria. */
  parcelasAVencer: Record<string, ParcelasDaCategoria>
  /** Categorias sem meta com o valor que o histórico sugere. */
  goalSuggestions: BudgetGoalSuggestionRow[]
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
  parcelasAVencer,
  goalSuggestions,
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
  const [prefill, setPrefill] = useState<{ categoryId: string; amountCents: number } | null>(null)

  const [categories, setCategories] = useState(initialCategories)

  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]))
  const totalPlanned = entriesForMonth.reduce((sum, e) => sum + e.plannedCents, 0)

  // Realizado só como referência para calibrar a meta; a análise do mês
  // (ritmo, projeção, alertas) fica no Ritmo de Gastos.
  const totalSpent = entriesForMonth.reduce((sum, e) => sum + (spendingMap.get(e.categoryId) ?? 0), 0)

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
      toast(mensagemDeErro(err, 'Erro ao atualizar'), 'error')
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

  function handleCreateSuggestedGoal(categoryId: string, amountCents: number) {
    setPrefill({ categoryId, amountCents })
    setShowAdd(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Plano de Gastos" description="Defina quanto quer gastar em cada categoria no mês">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/budgets/spending/simulador?month=${selectedMonth}`}>
            <FlaskConical className="h-4 w-4" /> Simular
          </Link>
        </Button>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Novo Lançamento
        </Button>
      </PageHeader>

      <MonthNavigator month={selectedMonth} onShift={navigateMonth} />

      <BudgetGoalSuggestionsCard suggestions={goalSuggestions} onCreate={handleCreateSuggestedGoal} />

      {entriesForMonth.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm text-muted-foreground">Planejado para {formatMonth(selectedMonth)}</p>
              <p className="text-2xl font-semibold text-gray-900">{formatBRL(totalPlanned)}</p>
            </div>
            <Link
              href={`/budgets/pacing?month=${selectedMonth}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4A5899] hover:underline"
            >
              <Gauge className="h-4 w-4" aria-hidden /> Ver como está indo
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Metas do mês */}
      {entriesForMonth.length > 0 ? (
        <>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-2">
            {entriesForMonth.map((entry) => {
              const cat = categories.find((c) => c.id === entry.categoryId)
              const actual = spendingMap.get(entry.categoryId) ?? 0

              return (
                <Card key={entry.entryId ?? `rec-${entry.categoryId}`}>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                      {cat?.name ?? '—'}
                      <RecorrentesNaLinha linha={entry} />
                      <ParcelasNaLinha parcelas={entry.categoryId ? parcelasAVencer[entry.categoryId] : undefined} />
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-900">Meta: {formatBRL(entry.plannedCents)}</span>
                      <span className="text-gray-500">Realizado: {formatBRL(actual)}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-semibold text-gray-900">
                  {formatBRL(totalPlanned)} <span className="font-normal text-gray-500">· realizado {formatBRL(totalSpent)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Desktop: table layout */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle className="text-base">Metas do mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Categoria</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Meta</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Realizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entriesForMonth.map((entry) => {
                      const cat = categories.find((c) => c.id === entry.categoryId)
                      const actual = spendingMap.get(entry.categoryId) ?? 0

                      return (
                        <tr key={entry.entryId ?? `rec-${entry.categoryId}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                            {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                            {cat?.name ?? '—'}
                            <RecorrentesNaLinha linha={entry} />
                            <ParcelasNaLinha parcelas={entry.categoryId ? parcelasAVencer[entry.categoryId] : undefined} />
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right font-medium text-gray-900">{formatBRL(entry.plannedCents)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-gray-500">{formatBRL(actual)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-900">{formatBRL(totalPlanned)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-500">{formatBRL(totalSpent)}</td>
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
        onClose={() => { setShowAdd(false); setPrefill(null) }}
        availableCategories={availableCategories}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        initialCategoryId={prefill?.categoryId}
        initialAmountCents={prefill?.amountCents}
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
