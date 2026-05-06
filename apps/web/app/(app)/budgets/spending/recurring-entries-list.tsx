'use client'

import { Pencil, Trash2, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatBRL } from '@floow/core-finance'

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

interface RecurringEntriesListProps {
  allEntries: AllEntry[]
  categories: CategoryOption[]
  editingId: string | null
  editValue: string
  editEndMonth: string
  saving: boolean
  onStartEdit: (entry: AllEntry) => void
  onChangeEditValue: (v: string) => void
  onChangeEditEndMonth: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  formatMonth: (m: string) => string
}

export function RecurringEntriesList({
  allEntries,
  categories,
  editingId,
  editValue,
  editEndMonth,
  saving,
  onStartEdit,
  onChangeEditValue,
  onChangeEditEndMonth,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  formatMonth,
}: RecurringEntriesListProps) {
  if (allEntries.length === 0) return null

  return (
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
                    {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
                    {cat?.name ?? '—'}
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => onChangeEditValue(e.target.value)}
                    className="h-7 w-28 text-sm"
                    placeholder="R$"
                  />
                  <span className="text-xs text-gray-500">/mês</span>
                  <span className="text-xs text-gray-500 ml-1">até:</span>
                  <Input
                    type="month"
                    value={editEndMonth}
                    onChange={(e) => onChangeEditEndMonth(e.target.value)}
                    className="h-7 w-36 text-sm"
                  />
                  <button type="button" onClick={onSaveEdit} disabled={saving} className="rounded p-1 text-green-600 hover:bg-green-50">
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={onCancelEdit} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            }

            return (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {cat?.color && <span className="inline-block h-2 w-2 rounded-full mr-2 align-middle" style={{ backgroundColor: cat.color }} />}
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
                    onClick={() => onStartEdit(entry)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
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
  )
}
