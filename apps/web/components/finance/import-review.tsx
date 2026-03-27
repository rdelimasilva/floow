'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PreviewItem, TransactionOverride } from '@/lib/finance/import-actions'
import type { Account } from '@floow/db'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface ImportReviewProps {
  items: PreviewItem[]
  selectedIndices: number[]
  accounts: Account[]
  sourceAccountId: string
  categories: CategoryOption[]
  onConfirm: (selectedIndices: number[], overrides: TransactionOverride[]) => void
  onBack: () => void
  loading: boolean
}

type TxType = 'income' | 'expense' | 'transfer'

interface RowState {
  categoryId: string
  type: TxType
  transferToAccountId: string
}

export function ImportReview({
  items,
  selectedIndices,
  accounts,
  sourceAccountId,
  categories,
  onConfirm,
  onBack,
  loading,
}: ImportReviewProps) {
  const selectedItems = items.filter((item) => selectedIndices.includes(item.index))

  const [rowStates, setRowStates] = useState<Map<number, RowState>>(() => {
    const map = new Map<number, RowState>()
    for (const item of selectedItems) {
      map.set(item.index, {
        categoryId: item.suggestedCategoryId ?? '',
        type: item.parsed.type,
        transferToAccountId: '',
      })
    }
    return map
  })

  function updateRow(index: number, patch: Partial<RowState>) {
    setRowStates((prev) => {
      const next = new Map(prev)
      const current = next.get(index)!
      next.set(index, { ...current, ...patch })
      return next
    })
  }

  function handleConfirm() {
    const overrides: TransactionOverride[] = []
    for (const item of selectedItems) {
      const state = rowStates.get(item.index)!
      overrides.push({
        index: item.index,
        categoryId: state.categoryId || null,
        type: state.type,
        transferToAccountId: state.type === 'transfer' ? state.transferToAccountId : undefined,
      })
    }
    onConfirm(selectedIndices, overrides)
  }

  const otherAccounts = accounts.filter((a) => a.id !== sourceAccountId)
  const categorizedCount = selectedItems.filter((item) => rowStates.get(item.index)?.categoryId).length
  const transferCount = selectedItems.filter((item) => rowStates.get(item.index)?.type === 'transfer').length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Revisar e Categorizar</h2>
        <p className="text-sm text-gray-500 mt-1">
          {selectedItems.length} transações selecionadas.
          {categorizedCount > 0 && ` ${categorizedCount} categorizadas.`}
          {transferCount > 0 && ` ${transferCount} marcadas como transferência.`}
        </p>
      </div>

      <div className="rounded-md border overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Conta Destino</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedItems.map((item) => {
              const state = rowStates.get(item.index)!
              return (
                <TableRow key={item.index}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(item.parsed.date)}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-sm">
                    <div className="truncate">{item.parsed.description || '—'}</div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-sm">
                    <span className={item.parsed.amountCents >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCents(item.parsed.amountCents)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <select
                      value={state.categoryId}
                      onChange={(e) => updateRow(item.index, { categoryId: e.target.value })}
                      className="h-8 w-full min-w-[120px] rounded border border-gray-300 text-xs"
                    >
                      <option value="">Sem categoria</option>
                      {categories
                        .filter((c) => c.type === state.type || state.type === 'transfer')
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    {item.isAutoCategorized && state.categoryId === item.suggestedCategoryId && (
                      <span className="text-[9px] text-blue-500 font-medium uppercase tracking-wider ml-1">auto</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      value={state.type}
                      onChange={(e) => updateRow(item.index, {
                        type: e.target.value as TxType,
                        transferToAccountId: '',
                        categoryId: state.categoryId,
                      })}
                      className="h-8 rounded border border-gray-300 text-xs"
                    >
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                      <option value="transfer">Transferência</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    {state.type === 'transfer' ? (
                      <select
                        value={state.transferToAccountId}
                        onChange={(e) => updateRow(item.index, { transferToAccountId: e.target.value })}
                        className="h-8 w-full min-w-[120px] rounded border border-gray-300 text-xs"
                      >
                        <option value="">Selecione...</option>
                        {otherAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{selectedItems.length} transações para importar</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={loading}>
            Voltar
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || selectedItems.some((item) => {
              const s = rowStates.get(item.index)!
              return s.type === 'transfer' && !s.transferToAccountId
            })}
          >
            {loading ? 'Importando...' : `Importar ${selectedItems.length} transações`}
          </Button>
        </div>
      </div>
    </div>
  )
}
