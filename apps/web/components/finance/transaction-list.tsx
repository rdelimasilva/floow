'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { formatBRL } from '@floow/core-finance'
import { deleteTransaction, toggleIgnoreTransaction, cancelRecurring, bulkDeleteTransactions, bulkCategorizeTransactions } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRuleDialog } from '@/components/finance/create-rule-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { SortableHeader } from '@/components/finance/sortable-header'
import { TypeFilter, CategoryFilter, AmountFilter } from '@/components/finance/column-filter-dropdown'
import { TransactionMobileCard, TransactionDesktopRow } from './transaction-display-row'
import { TransactionEditRow } from './transaction-edit-row'
import type { TransactionRowData, AccountOption, CategoryOption } from './transaction-list-types'

interface TransactionListProps {
  transactions: TransactionRowData[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  startingBalance?: number
  activeTypes?: string[]
  activeCategoryIds?: string[]
  activeMinAmount?: string
  activeMaxAmount?: string
  onSort?: (sortKey: string) => void
  onFilterTypes?: (types: string[]) => void
  onFilterCategories?: (ids: string[]) => void
  onFilterAmount?: (min: string, max: string) => void
}

export function TransactionList({
  transactions, accounts, categories,
  sortBy = 'date', sortDir = 'desc',
  startingBalance = 0,
  activeTypes = [], activeCategoryIds = [],
  activeMinAmount = '', activeMaxAmount = '',
  onSort = () => {}, onFilterTypes = () => {}, onFilterCategories = () => {}, onFilterAmount = () => {},
}: TransactionListProps) {
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionRowData | null>(null)
  const [loading, setLoading] = useState(false)
  const [ruleShortcut, setRuleShortcut] = useState<{ matchValue: string; categoryId: string } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ templateId: string; description: string } | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkCatId, setBulkCatId] = useState<string>('')
  const [showBulkCat, setShowBulkCat] = useState(false)

  const allSelected = transactions.length > 0 && selected.size === transactions.length

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(transactions.map((t) => t.id)))
  }

  // Running balance
  const runningBalances = useMemo(() => {
    const balances: number[] = []
    let balance = startingBalance
    if (sortDir === 'desc') {
      for (let i = 0; i < transactions.length; i++) {
        balances.push(balance)
        balance -= transactions[i].amountCents
      }
    } else {
      for (let i = 0; i < transactions.length; i++) {
        balance += transactions[i].amountCents
        balances.push(balance)
      }
    }
    return balances
  }, [startingBalance, transactions, sortDir])

  // Stable action callbacks for memoized rows
  const handleEdit = useCallback((tx: TransactionRowData) => {
    setEditingId(tx.id)
  }, [])

  const handleDelete = useCallback((tx: TransactionRowData) => {
    setDeleteTarget(tx)
  }, [])

  const handleIgnore = useCallback(async (tx: TransactionRowData) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', tx.id)
      await toggleIgnoreTransaction(formData)
      toastRef.current(tx.isIgnored ? 'Transação restaurada' : 'Transação ignorada')
    } catch (e) {
      toastRef.current(e instanceof Error ? e.message : 'Não foi possível alterar a transação.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCancelRecurring = useCallback((templateId: string, description: string) => {
    setCancelTarget({ templateId, description })
  }, [])

  const handleCreateRule = useCallback((matchValue: string, categoryId: string) => {
    setRuleShortcut({ matchValue, categoryId })
  }, [])

  const closeEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const rowActions = useMemo(() => ({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onIgnore: handleIgnore,
    onCancelRecurring: handleCancelRecurring,
    onCreateRule: handleCreateRule,
    onToggleSelect: toggleSelect,
  }), [handleEdit, handleDelete, handleIgnore, handleCancelRecurring, handleCreateRule, toggleSelect])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const sync = () => setIsDesktop(media.matches)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  // Confirm dialog handlers
  async function confirmDelete() {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteTransaction(formData)
      setDeleteTarget(null)
      toast('Transação removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível remover a transação.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function confirmCancelRecurring() {
    if (!cancelTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('templateId', cancelTarget.templateId)
      await cancelRecurring(formData)
      setCancelTarget(null)
      toast('Recorrência cancelada — parcelas futuras removidas')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível cancelar a recorrência.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkDelete() {
    setBulkLoading(true)
    try {
      await bulkDeleteTransactions(Array.from(selected))
      toast(`${selected.size} transações removidas`)
      setSelected(new Set())
      setBulkDeleteOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível remover as transações.', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function handleBulkCategorize() {
    if (!bulkCatId) return
    setBulkLoading(true)
    try {
      await bulkCategorizeTransactions(Array.from(selected), bulkCatId)
      toast(`${selected.size} transações categorizadas`)
      setSelected(new Set())
      setShowBulkCat(false)
      setBulkCatId('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível categorizar as transações.', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-gray-500">Nenhuma transação encontrada.</p>
        <p className="mt-1 text-sm text-gray-400">Registre sua primeira transação para começar.</p>
      </div>
    )
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 mb-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} selecionadas</span>
          <div className="flex gap-2 ml-auto">
            {showBulkCat ? (
              <div className="flex items-center gap-1.5">
                <select value={bulkCatId} onChange={(e) => setBulkCatId(e.target.value)} className="h-8 rounded border border-gray-300 text-xs">
                  <option value="">Escolher categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button size="sm" variant="primary" onClick={handleBulkCategorize} disabled={bulkLoading || !bulkCatId}>Aplicar</Button>
                <Button size="sm" variant="outline" onClick={() => setShowBulkCat(false)}>Cancelar</Button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowBulkCat(true)} disabled={bulkLoading}>Categorizar</Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkLoading}>Remover</Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkLoading}>Limpar</Button>
          </div>
        </div>
      )}

      {isDesktop === false ? (
        <div className="space-y-2">
          {transactions.map((tx, idx) => (
            <TransactionMobileCard
              key={tx.id}
              tx={tx}
              balance={runningBalances[idx] ?? 0}
              isSelected={selected.has(tx.id)}
              loading={loading}
              actions={rowActions}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
                </th>
                <SortableHeader label="Data" sortKey="date" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort} />
                <SortableHeader label="Descrição" sortKey="description" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort} />
                <SortableHeader
                  label="Categoria" sortKey="categoryName" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={activeCategoryIds.length > 0} className="hidden md:table-cell"
                  filterContent={<CategoryFilter categories={categories} selected={activeCategoryIds} onChange={onFilterCategories} />}
                />
                <SortableHeader
                  label="Tipo" sortKey="type" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={activeTypes.length > 0} className="hidden md:table-cell"
                  filterContent={<TypeFilter selected={activeTypes} onChange={onFilterTypes} />}
                />
                <SortableHeader
                  label="Valor" sortKey="amountCents" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSort}
                  hasActiveFilter={!!activeMinAmount || !!activeMaxAmount} className="text-right"
                  filterContent={<AmountFilter minAmount={activeMinAmount} maxAmount={activeMaxAmount} onApply={onFilterAmount} />}
                />
                <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Saldo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx, idx) => (
                editingId === tx.id && !tx.transferGroupId ? (
                  <TransactionEditRow
                    key={tx.id}
                    tx={tx}
                    accounts={accounts}
                    categories={categories}
                    balance={runningBalances[idx] ?? 0}
                    isSelected={selected.has(tx.id)}
                    onToggleSelect={toggleSelect}
                    onClose={closeEdit}
                  />
                ) : (
                  <TransactionDesktopRow
                    key={tx.id}
                    tx={tx}
                    balance={runningBalances[idx] ?? 0}
                    isSelected={selected.has(tx.id)}
                    loading={loading}
                    actions={rowActions}
                  />
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remover transação"
        description={
          deleteTarget?.transferGroupId
            ? 'Tem certeza que deseja remover esta transferência? Ambas as pernas serão removidas e os saldos revertidos.'
            : `Tem certeza que deseja remover "${deleteTarget?.description ?? ''}"? O saldo da conta será revertido.`
        }
        confirmLabel="Remover"
        loading={loading}
      />

      <CreateRuleDialog
        open={ruleShortcut !== null}
        onClose={() => setRuleShortcut(null)}
        categories={categories}
        prefill={ruleShortcut ?? undefined}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancelRecurring}
        title="Cancelar recorrência"
        description={`Tem certeza que deseja cancelar a recorrência "${cancelTarget?.description ?? ''}"? Todas as parcelas futuras serão removidas. Parcelas já vencidas permanecem.`}
        confirmLabel="Cancelar recorrência"
        loading={loading}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Remover transações em lote"
        description={`Tem certeza que deseja remover ${selected.size} transações? Os saldos das contas serão revertidos. Esta ação não pode ser desfeita.`}
        confirmLabel="Remover todas"
        loading={bulkLoading}
      />
    </>
  )
}
