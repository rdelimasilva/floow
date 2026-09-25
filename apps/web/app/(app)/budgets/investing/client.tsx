'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { MonthNavigator } from '@/components/finance/month-navigator'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { updateBudgetEntry, deleteBudgetEntry } from '@/lib/finance/budget-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatBRL, currencyToCents } from '@floow/core-finance/src/balance'
import { BudgetEntryDialog } from '@/components/finance/budget-entry-dialog'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface EntryForMonth {
  id: string
  name: string
  plannedCents: number
}

interface AllEntry {
  id: string
  name: string
  plannedCents: number
  startMonth: string
  endMonth: string | null
}

interface InvestingClientProps {
  entriesForMonth: EntryForMonth[]
  allEntries: AllEntry[]
  totalContributed: number
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

export function InvestingClient({
  entriesForMonth,
  allEntries,
  totalContributed,
  selectedMonth,
}: InvestingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editStartMonth, setEditStartMonth] = useState('')
  const [editEndMonth, setEditEndMonth] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const totalPlanned = entriesForMonth.reduce((sum, e) => sum + e.plannedCents, 0)

  function navigateMonth(delta: number) {
    router.push(`/budgets/investing?month=${shiftMonth(selectedMonth, delta)}`)
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

  return (
    <div className="space-y-6">
      <PageHeader title="Meta de Investimentos" description="Orçado vs Realizado — Aportes para corretora">
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Novo Lançamento
        </Button>
      </PageHeader>

      <MonthNavigator month={selectedMonth} onShift={navigateMonth} />

      {/* Summary */}
      {entriesForMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo — {formatMonth(selectedMonth)}</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetProgressBar label="Aportes para corretora" currentCents={totalContributed} limitCents={totalPlanned} invertColors />
          </CardContent>
        </Card>
      )}

      {/* Orçado vs Realizado */}
      {entriesForMonth.length > 0 ? (
        <>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-2">
            {entriesForMonth.map((entry) => {
              const actual = entriesForMonth.length === 1
                ? totalContributed
                : Math.round(totalContributed * (entry.plannedCents / totalPlanned))
              const diff = actual - entry.plannedCents
              const pct = entry.plannedCents > 0 ? Math.round((actual / entry.plannedCents) * 100) : 0
              const isUnder = actual < entry.plannedCents

              return (
                <Card key={entry.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{entry.name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct < 80 ? 'bg-red-100 text-red-700' : pct < 100 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Meta: {formatBRL(entry.plannedCents)}</span>
                      <span className="font-medium text-gray-900">Aportado: {formatBRL(actual)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${pct < 80 ? 'bg-red-500' : pct < 100 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className={`text-xs font-medium text-right ${isUnder ? 'text-red-600' : 'text-green-700'}`}>
                      {diff >= 0 ? '+' : '-'}{formatBRL(Math.abs(diff))}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Total</span>
                <span className={`font-bold ${totalContributed < totalPlanned ? 'text-red-600' : 'text-green-700'}`}>
                  {formatBRL(totalContributed)} / {formatBRL(totalPlanned)} ({totalPlanned > 0 ? Math.round((totalContributed / totalPlanned) * 100) : 0}%)
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
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Descrição</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Orçado</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Realizado</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Diferença</th>
                      <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entriesForMonth.map((entry) => {
                      const actual = entriesForMonth.length === 1
                        ? totalContributed
                        : Math.round(totalContributed * (entry.plannedCents / totalPlanned))
                      const diff = actual - entry.plannedCents
                      const pct = entry.plannedCents > 0 ? Math.round((actual / entry.plannedCents) * 100) : 0
                      const isUnder = actual < entry.plannedCents

                      return (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{entry.name}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-gray-600">{formatBRL(entry.plannedCents)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-medium">{formatBRL(actual)}</td>
                          <td className={`px-4 py-2.5 text-sm text-right font-medium ${isUnder ? 'text-red-600' : 'text-green-700'}`}>
                            {diff >= 0 ? '+' : '-'}{formatBRL(Math.abs(diff))}
                          </td>
                          <td className={`px-4 py-2.5 text-sm text-right font-medium ${pct < 80 ? 'text-red-600' : pct < 100 ? 'text-yellow-600' : 'text-green-700'}`}>
                            {pct}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {entriesForMonth.length > 1 && (
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-600">{formatBRL(totalPlanned)}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-900">{formatBRL(totalContributed)}</td>
                        <td className={`px-4 py-2.5 text-sm text-right font-semibold ${totalContributed < totalPlanned ? 'text-red-600' : 'text-green-700'}`}>
                          {totalContributed >= totalPlanned ? '+' : '-'}{formatBRL(Math.abs(totalContributed - totalPlanned))}
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-right font-semibold ${totalPlanned > 0 && Math.round((totalContributed / totalPlanned) * 100) < 100 ? 'text-red-600' : 'text-green-700'}`}>
                          {totalPlanned > 0 ? Math.round((totalContributed / totalPlanned) * 100) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 text-sm">Nenhuma meta de investimento para {formatMonth(selectedMonth)}.</p>
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
                const isEditing = editingId === entry.id

                if (isEditing) {
                  return (
                    <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                      <span className="text-sm font-medium text-gray-900 w-36 truncate">{entry.name}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 w-28 text-sm"
                        placeholder="R$"
                      />
                      <span className="text-xs text-gray-500">/mês</span>
                      <span className="text-xs text-gray-500 ml-1">de:</span>
                      <Input
                        type="month"
                        value={editStartMonth}
                        onChange={(e) => setEditStartMonth(e.target.value)}
                        className="h-7 w-36 text-sm"
                      />
                      <span className="text-xs text-gray-500">até:</span>
                      <Input
                        type="month"
                        value={editEndMonth}
                        onChange={(e) => setEditEndMonth(e.target.value)}
                        className="h-7 w-36 text-sm"
                      />
                      <button type="button" onClick={handleSaveEdit} disabled={saving} className="rounded p-1 text-green-600 hover:bg-green-50" title="Salvar" aria-label="Salvar">
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Cancelar" aria-label="Cancelar">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{entry.name}</span>
                      <span className="ml-2 text-sm text-gray-600">{formatBRL(entry.plannedCents)}/mês</span>
                      <span className="ml-2 text-xs text-gray-400">
                        de {formatMonth(entry.startMonth)}
                        {entry.endMonth ? ` até ${formatMonth(entry.endMonth)}` : ' em diante'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => startEdit(entry)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar" aria-label="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(entry.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir" aria-label="Excluir">
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

      <BudgetEntryDialog
        type="investing"
        open={showAdd}
        onClose={() => setShowAdd(false)}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Remover lançamento"
        description="Tem certeza que deseja remover este lançamento recorrente?"
        confirmLabel="Remover"
        loading={saving}
      />
    </div>
  )
}
