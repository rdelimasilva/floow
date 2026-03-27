'use client'

import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { Pencil, Trash2, Zap, EyeOff, Eye, Repeat, XCircle } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import { deleteTransaction, updateTransaction, toggleIgnoreTransaction, createCategory, cancelRecurring, bulkDeleteTransactions, bulkCategorizeTransactions } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRuleDialog } from '@/components/finance/create-rule-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SortableHeader } from '@/components/finance/sortable-header'
import { TypeFilter, CategoryFilter, AmountFilter } from '@/components/finance/column-filter-dropdown'

interface TransactionRow {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  date: Date | string
  accountId: string
  categoryId?: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  transferGroupId?: string | null
  externalId?: string | null
  isAutoCategorized?: boolean
  isIgnored?: boolean
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  installmentNumber?: number | null
  installmentTotal?: number | null
}

interface AccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface TransactionListProps {
  transactions: TransactionRow[]
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

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toDateInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

const TYPE_STYLES = {
  income: 'text-green-700',
  expense: 'text-red-600',
  transfer: 'text-blue-600',
} as const

const TYPE_LABELS = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
} as const

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [ruleShortcut, setRuleShortcut] = useState<{ matchValue: string; categoryId: string } | null>(null)

  // Inline category creation
  const [localCategories, setLocalCategories] = useState(categories)
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<{ templateId: string; description: string } | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkCatId, setBulkCatId] = useState<string>('')
  const [showBulkCat, setShowBulkCat] = useState(false)

  const allSelected = transactions.length > 0 && selected.size === transactions.length
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(transactions.map((t) => t.id)))
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

  // Compute running balance for each row
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

  async function handleCancelRecurring() {
    if (!cancelTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('templateId', cancelTarget.templateId)
      await cancelRecurring(formData)
      setCancelTarget(null)
      toast('Recorrência cancelada — parcelas futuras removidas')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível cancelar a recorrência. Tente novamente.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateCategoryInline() {
    if (!newCatName.trim()) return
    setCreatingCat(true)
    try {
      const formData = new FormData()
      formData.append('name', newCatName.charAt(0).toUpperCase() + newCatName.slice(1))
      formData.append('type', editType)
      const created = await createCategory(formData)
      setLocalCategories((prev) => [...prev, { id: created.id, name: created.name, type: created.type }])
      setEditCategoryId(created.id)
      setNewCatName('')
      setShowNewCat(false)
      toast('Categoria criada')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível criar a categoria. Tente novamente.', 'error')
    } finally {
      setCreatingCat(false)
    }
  }

  // Edit form state
  const [editDesc, setEditDesc] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [editDestAccountId, setEditDestAccountId] = useState('')
  const [editAccountId, setEditAccountId] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')

  const editRowRef = useRef<HTMLTableRowElement>(null)
  const editStateRef = useRef({ id: '', desc: '', amount: '', date: '', type: '' as string, accountId: '', categoryId: '', destAccountId: '' })

  function startEdit(tx: TransactionRow) {
    // Auto-save previous edit if switching rows
    if (editingId && editingId !== tx.id) {
      saveEdit()
    }
    setEditingId(tx.id)
    setEditDesc(tx.description)
    setEditAmount(String(Math.abs(tx.amountCents)))
    setEditDate(toDateInputValue(tx.date))
    setEditType(tx.type)
    setEditAccountId(tx.accountId)
    setEditCategoryId(tx.categoryId ?? '')
    setEditDestAccountId('')
    setShowNewCat(false)
  }

  // Keep ref in sync for the click-outside handler
  useEffect(() => {
    editStateRef.current = { id: editingId ?? '', desc: editDesc, amount: editAmount, date: editDate, type: editType, accountId: editAccountId, categoryId: editCategoryId, destAccountId: editDestAccountId }
  }, [editingId, editDesc, editAmount, editDate, editType, editAccountId, editCategoryId, editDestAccountId])

  const saveEdit = useCallback(async () => {
    const s = editStateRef.current
    if (!s.id) return
    try {
      const formData = new FormData()
      formData.append('id', s.id)
      formData.append('accountId', s.accountId)
      if (s.categoryId) formData.append('categoryId', s.categoryId)
      formData.append('type', s.type)
      formData.append('amountCents', s.amount)
      formData.append('description', s.desc)
      formData.append('date', s.date)
      if (s.type === 'transfer' && s.destAccountId) formData.append('destAccountId', s.destAccountId)
      await updateTransaction(formData)
    } catch (e) {
      toastRef.current(
        e instanceof Error ? e.message : 'Não foi possível salvar a edição. Tente novamente.',
        'error',
      )
    }
  }, [])

  // Click outside auto-saves and closes edit. Escape discards.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (editRowRef.current && !editRowRef.current.contains(e.target as Node)) {
        saveEdit()
        setEditingId(null)
        setShowNewCat(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setEditingId(null)
        setShowNewCat(false)
      }
    }
    if (editingId) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [editingId, saveEdit])

  async function handleIgnore(tx: TransactionRow) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', tx.id)
      await toggleIgnoreTransaction(formData)
      toast(tx.isIgnored ? 'Transação restaurada' : 'Transação ignorada')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível alterar a transação. Tente novamente.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteTransaction(formData)
      setDeleteTarget(null)
      toast('Transação removida com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível remover a transação. Tente novamente.', 'error')
    } finally {
      setLoading(false)
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

      {/* Mobile: card layout */}
      <div className="md:hidden space-y-2">
        {transactions.map((tx, idx) => (
          <div
            key={tx.id}
            className={`rounded-lg border bg-white p-3 ${selected.has(tx.id) ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'} ${tx.isIgnored ? 'opacity-40' : ''} ${tx.balanceApplied === false ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} className="mt-1 h-4 w-4 rounded border-gray-300 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                  {tx.recurringTemplateId && <Repeat className="h-3 w-3 text-blue-400 shrink-0" />}
                  {tx.description}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{formatDate(tx.date)}</span>
                  {tx.categoryName && (
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                        color: tx.categoryColor ?? '#6b7280',
                      }}
                    >
                      {tx.categoryName}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
                  {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
                </p>
                <p className={`text-xs ${(runningBalances[idx] ?? 0) >= 0 ? 'text-gray-500' : 'text-red-500'}`}>
                  Saldo: {formatBRL(runningBalances[idx] ?? 0)}
                </p>
              </div>
            </div>
            {/* Actions row */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <span className="text-[10px] text-gray-400 uppercase">{TYPE_LABELS[tx.type]}</span>
              <div className="flex gap-1">
                {tx.recurringTemplateId && (
                  <button type="button" title="Cancelar recorrência" onClick={() => setCancelTarget({ templateId: tx.recurringTemplateId!, description: tx.description })} className="rounded p-1 text-gray-400 hover:text-orange-600">
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
                {!tx.transferGroupId && (
                  <button type="button" onClick={() => startEdit(tx)} className="rounded p-1 text-gray-400 hover:text-gray-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {tx.externalId ? (
                  <button type="button" onClick={() => handleIgnore(tx)} disabled={loading} className={`rounded p-1 ${tx.isIgnored ? 'text-blue-500' : 'text-gray-400'}`}>
                    {tx.isIgnored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                ) : (
                  <button type="button" onClick={() => setDeleteTarget(tx)} className="rounded p-1 text-gray-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
              </th>
              <SortableHeader
                label="Data"
                sortKey="date"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
              />
              <SortableHeader
                label="Descrição"
                sortKey="description"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
              />
              <SortableHeader
                label="Categoria"
                sortKey="categoryName"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={activeCategoryIds.length > 0}
                className="hidden md:table-cell"
                filterContent={
                  <CategoryFilter
                    categories={categories}
                    selected={activeCategoryIds}
                    onChange={onFilterCategories}
                  />
                }
              />
              <SortableHeader
                label="Tipo"
                sortKey="type"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={activeTypes.length > 0}
                className="hidden md:table-cell"
                filterContent={
                  <TypeFilter
                    selected={activeTypes}
                    onChange={onFilterTypes}
                  />
                }
              />
              <SortableHeader
                label="Valor"
                sortKey="amountCents"
                currentSortBy={sortBy}
                currentSortDir={sortDir}
                onSort={onSort}
                hasActiveFilter={!!activeMinAmount || !!activeMaxAmount}
                filterContent={
                  <AmountFilter
                    minAmount={activeMinAmount}
                    maxAmount={activeMaxAmount}
                    onApply={onFilterAmount}
                  />
                }
                className="text-right"
              />
              <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Saldo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((tx, idx) => (
              editingId === tx.id && !tx.transferGroupId ? (
                <tr key={tx.id} ref={editRowRef} className="bg-blue-50">
                  <td className="px-4 py-2"><input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} className="h-4 w-4 rounded border-gray-300" /></td>
                  <td className="px-4 py-2">
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="hidden md:table-cell px-4 py-2">
                    {editType === 'transfer' ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                    <>
                    <select
                      value={editCategoryId}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setShowNewCat(true)
                          setNewCatName('')
                        } else {
                          setShowNewCat(false)
                          setEditCategoryId(e.target.value)
                        }
                      }}
                      className="h-8 w-full rounded border border-gray-300 text-xs"
                    >
                      <option value="">Sem categoria</option>
                      {localCategories.filter((c) => c.type === editType).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__new__">+ Criar nova...</option>
                    </select>
                    {showNewCat && (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Nome da categoria"
                          className="h-7 text-xs flex-1"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategoryInline() } }}
                          autoFocus={newCatName === ''}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={handleCreateCategoryInline}
                          disabled={creatingCat || !newCatName.trim()}
                          className="h-7 text-[10px] px-2"
                        >
                          Criar
                        </Button>
                      </div>
                    )}
                    </>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-2">
                    <select
                      value={editType}
                      onChange={(e) => {
                        const newType = e.target.value as 'income' | 'expense' | 'transfer'
                        setEditType(newType)
                        if (newType !== 'transfer') setEditDestAccountId('')
                        if (newType === 'transfer') setEditCategoryId('')
                      }}
                      className="h-8 rounded border border-gray-300 text-xs"
                    >
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                      <option value="transfer">Transferência</option>
                    </select>
                    {editType === 'transfer' && (
                      <select
                        value={editDestAccountId}
                        onChange={(e) => setEditDestAccountId(e.target.value)}
                        className="h-8 w-full rounded border border-gray-300 text-xs mt-1"
                      >
                        <option value="">Conta destino...</option>
                        {accounts.filter((a) => a.id !== editAccountId).map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-xs text-right" />
                  </td>
                  <td className="hidden lg:table-cell whitespace-nowrap px-4 py-2 text-right text-sm text-gray-400">
                    {formatBRL(runningBalances[idx] ?? 0)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] text-gray-400">auto-salva ao sair</span>
                  </td>
                </tr>
              ) : (
                <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${selected.has(tx.id) ? 'bg-blue-50/50' : ''} ${tx.isIgnored ? 'opacity-40 line-through' : ''} ${tx.balanceApplied === false ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} className="h-4 w-4 rounded border-gray-300" /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <span className="flex items-center gap-1.5">
                      {tx.recurringTemplateId && (
                        <Repeat className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      )}
                      {tx.description}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    {tx.categoryName ? (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                            color: tx.categoryColor ?? '#6b7280',
                          }}
                        >
                          {tx.categoryName}
                        </span>
                        {tx.isAutoCategorized && (
                          <span className="text-[9px] text-blue-500 font-medium ml-0.5 uppercase tracking-wider">auto</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-xs text-gray-500">{TYPE_LABELS[tx.type]}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
                    {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
                  </td>
                  <td className={`hidden lg:table-cell whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${(runningBalances[idx] ?? 0) >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                    {formatBRL(runningBalances[idx] ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {tx.recurringTemplateId && (
                        <button
                          type="button"
                          title="Cancelar recorrência"
                          onClick={() => setCancelTarget({ templateId: tx.recurringTemplateId!, description: tx.description })}
                          className="rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-600"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {tx.categoryId && (
                        <button
                          type="button"
                          title="Categorizar todas como esta"
                          onClick={() =>
                            setRuleShortcut({
                              matchValue: tx.description,
                              categoryId: tx.categoryId!,
                            })
                          }
                          className="rounded p-1 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!tx.transferGroupId && (
                        <button
                          type="button"
                          onClick={() => startEdit(tx)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {tx.externalId ? (
                        <button
                          type="button"
                          title={tx.isIgnored ? 'Restaurar transação' : 'Ignorar transação'}
                          onClick={() => handleIgnore(tx)}
                          disabled={loading}
                          className={`rounded p-1 ${tx.isIgnored ? 'text-blue-500 hover:bg-blue-50 hover:text-blue-700' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-600'}`}
                        >
                          {tx.isIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(tx)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
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
        onConfirm={handleCancelRecurring}
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
