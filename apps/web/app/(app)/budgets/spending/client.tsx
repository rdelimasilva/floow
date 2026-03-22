'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Copy, Save, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { saveBudgetEntries, replicateBudgetEntries } from '@/lib/finance/budget-actions'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance'

interface CategoryOption {
  id: string
  name: string
  color: string | null
  icon: string | null
}

interface SpendingClientProps {
  categories: CategoryOption[]
  entries: { categoryId: string; plannedCents: number }[]
  spending: { categoryId: string | null; spent: number }[]
  selectedMonth: string
  availableMonths: string[]
}

function formatMonth(monthStr: string): string {
  const d = new Date(monthStr)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function shiftMonth(monthStr: string, delta: number): string {
  const d = new Date(monthStr)
  d.setMonth(d.getMonth() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function SpendingClient({
  categories,
  entries,
  spending,
  selectedMonth,
  availableMonths,
}: SpendingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replicating, setReplicating] = useState(false)
  const [replicateMonths, setReplicateMonths] = useState(3)

  // Local state for editing planned values
  const [planned, setPlanned] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const e of entries) {
      map[e.categoryId] = String(e.plannedCents)
    }
    return map
  })

  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]))
  const entryMap = new Map(entries.map((e) => [e.categoryId, e.plannedCents]))

  const totalPlanned = entries.reduce((sum, e) => sum + e.plannedCents, 0)
  const totalSpent = spending.reduce((sum, s) => sum + s.spent, 0)

  const hasEntries = entries.length > 0
  const isPast = new Date(selectedMonth) < new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const isCurrent = selectedMonth === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  function navigateMonth(delta: number) {
    const newMonth = shiftMonth(selectedMonth, delta)
    router.push(`/budgets/spending?month=${newMonth}`)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const entryList = Object.entries(planned)
        .filter(([, v]) => v && parseInt(v, 10) > 0)
        .map(([categoryId, v]) => ({ categoryId, plannedCents: parseInt(v, 10) }))

      const fd = new FormData()
      fd.set('periodMonth', selectedMonth)
      fd.set('entries', JSON.stringify(entryList))
      await saveBudgetEntries(fd)
      toast('Orçamento salvo')
      setEditing(false)
    } catch {
      toast('Erro ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReplicate() {
    setReplicating(true)
    try {
      const targets: string[] = []
      for (let i = 1; i <= replicateMonths; i++) {
        targets.push(shiftMonth(selectedMonth, i))
      }
      const fd = new FormData()
      fd.set('sourceMonth', selectedMonth)
      fd.set('targetMonths', JSON.stringify(targets))
      await replicateBudgetEntries(fd)
      toast(`Orçamento replicado para ${replicateMonths} meses`)
    } catch {
      toast('Erro ao replicar', 'error')
    } finally {
      setReplicating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meta de Gastos" description="Orçado vs Realizado por categoria">
        {hasEntries && !editing && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Editar orçamento
            </Button>
          </>
        )}
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

      {/* Editing mode */}
      {(editing || !hasEntries) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {hasEntries ? 'Editar Orçamento' : 'Criar Orçamento'} — {formatMonth(selectedMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">Defina o valor orçado (em centavos) para cada categoria:</p>
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 w-44 truncate">
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                </span>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={planned[cat.id] ?? ''}
                  onChange={(e) => setPlanned((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  className="h-8 text-sm w-36"
                />
                <span className="text-xs text-gray-400">centavos</span>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              {hasEntries && (
                <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dashboard view */}
      {hasEntries && !editing && (
        <>
          {/* Global summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo — {formatMonth(selectedMonth)}</CardTitle>
            </CardHeader>
            <CardContent>
              <BudgetProgressBar
                label="Total"
                currentCents={totalSpent}
                limitCents={totalPlanned}
              />
            </CardContent>
          </Card>

          {/* Per-category table */}
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
                    {entries.map((entry) => {
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
                          <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                            {formatBRL(entry.plannedCents)}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-medium">
                            {formatBRL(actual)}
                          </td>
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

          {/* Replicate to future months */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700">Replicar este orçamento para os próximos</span>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={replicateMonths}
                  onChange={(e) => setReplicateMonths(parseInt(e.target.value, 10) || 1)}
                  className="h-8 w-16 text-sm"
                />
                <span className="text-sm text-gray-700">meses</span>
                <Button variant="outline" size="sm" onClick={handleReplicate} disabled={replicating}>
                  <Copy className="h-3.5 w-3.5" /> {replicating ? 'Replicando...' : 'Replicar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
