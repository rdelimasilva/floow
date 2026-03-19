'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PreviewItem, MatchStatus } from '@/lib/finance/import-actions'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

const STATUS_CONFIG: Record<MatchStatus, { label: string; color: string; defaultChecked: boolean }> = {
  new: { label: 'Nova', color: 'bg-green-100 text-green-800', defaultChecked: true },
  duplicate: { label: 'Duplicata', color: 'bg-gray-100 text-gray-600', defaultChecked: false },
  possible_match: { label: 'Possível match', color: 'bg-yellow-100 text-yellow-800', defaultChecked: true },
}

interface ImportPreviewProps {
  items: PreviewItem[]
  onConfirm: (selectedIndices: number[]) => void
  onCancel: () => void
  loading: boolean
}

export function ImportPreview({ items, onConfirm, onCancel, loading }: ImportPreviewProps) {
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>()
    for (const item of items) {
      if (STATUS_CONFIG[item.status].defaultChecked) {
        initial.add(item.index)
      }
    }
    return initial
  })

  const counts = useMemo(() => {
    const c = { new: 0, duplicate: 0, possible_match: 0 }
    for (const item of items) c[item.status]++
    return c
  }, [items])

  function toggleItem(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAllByStatus(status: MatchStatus) {
    const statusItems = items.filter((i) => i.status === status)
    const allSelected = statusItems.every((i) => selected.has(i.index))

    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of statusItems) {
        if (allSelected) next.delete(item.index)
        else next.add(item.index)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        {counts.new > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('new')}
            className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
          >
            <span>{counts.new} novas</span>
          </button>
        )}
        {counts.duplicate > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('duplicate')}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <span>{counts.duplicate} duplicatas</span>
          </button>
        )}
        {counts.possible_match > 0 && (
          <button
            type="button"
            onClick={() => toggleAllByStatus('possible_match')}
            className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100"
          >
            <span>{counts.possible_match} possíveis matches</span>
          </button>
        )}
      </div>

      {/* Preview table */}
      <div className="rounded-md border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.index}
                className={item.status === 'duplicate' ? 'opacity-50' : ''}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(item.index)}
                    onChange={() => toggleItem(item.index)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(item.parsed.date)}
                </TableCell>
                <TableCell className="max-w-xs text-sm">
                  <div className="truncate">{item.parsed.description || '—'}</div>
                  {item.status === 'possible_match' && item.matchedTransaction && (
                    <div className="mt-1 truncate text-xs text-yellow-700">
                      Match: {item.matchedTransaction.description} ({formatDate(item.matchedTransaction.date)})
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap text-sm">
                  <span className={item.parsed.amountCents >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatCents(item.parsed.amountCents)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[item.status].color}`}>
                    {STATUS_CONFIG[item.status].label}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{selected.size} selecionadas de {items.length}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onConfirm(Array.from(selected))} disabled={loading || selected.size === 0}>
            {loading ? 'Importando...' : `Importar ${selected.size} transação${selected.size !== 1 ? 'es' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
