'use client'

import { useState } from 'react'
import { Pencil, Trash2, Zap, EyeOff, Eye } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import { deleteTransaction, updateTransaction, toggleIgnoreTransaction, createCategory } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRuleDialog } from '@/components/finance/create-rule-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

export function TransactionList({ transactions, accounts, categories }: TransactionListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [ruleShortcut, setRuleShortcut] = useState<{ matchValue: string; categoryId: string } | null>(null)

  // Inline category creation
  const [localCategories, setLocalCategories] = useState(categories)
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)

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
      toast(e instanceof Error ? e.message : 'Erro ao criar categoria', 'error')
    } finally {
      setCreatingCat(false)
    }
  }

  // Edit form state
  const [editDesc, setEditDesc] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editType, setEditType] = useState<'income' | 'expense'>('expense')
  const [editAccountId, setEditAccountId] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')

  function startEdit(tx: TransactionRow) {
    setEditingId(tx.id)
    setEditDesc(tx.description)
    setEditAmount(String(Math.abs(tx.amountCents)))
    setEditDate(toDateInputValue(tx.date))
    setEditType(tx.type === 'income' ? 'income' : 'expense')
    setEditAccountId(tx.accountId)
    setEditCategoryId(tx.categoryId ?? '')
  }

  async function handleUpdate(txId: string) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', txId)
      formData.append('accountId', editAccountId)
      if (editCategoryId) formData.append('categoryId', editCategoryId)
      formData.append('type', editType)
      formData.append('amountCents', editAmount)
      formData.append('description', editDesc)
      formData.append('date', editDate)
      await updateTransaction(formData)
      setEditingId(null)
      toast('Transação atualizada com sucesso')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar transação', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleIgnore(tx: TransactionRow) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', tx.id)
      await toggleIgnoreTransaction(formData)
      toast(tx.isIgnored ? 'Transação restaurada' : 'Transação ignorada')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao alterar transação', 'error')
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
      toast(e instanceof Error ? e.message : 'Erro ao remover transação', 'error')
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Descrição</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Categoria</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Valor</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((tx) => (
              editingId === tx.id && !tx.transferGroupId ? (
                <tr key={tx.id} className="bg-blue-50">
                  <td className="px-4 py-2">
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="px-4 py-2">
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 text-xs" />
                  </td>
                  <td className="px-4 py-2">
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
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as 'income' | 'expense')}
                      className="h-8 rounded border border-gray-300 text-xs"
                    >
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-xs text-right" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="primary" onClick={() => handleUpdate(tx.id)} disabled={loading} className="h-7 text-xs">
                        {loading ? '...' : 'Salvar'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-7 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${tx.isIgnored ? 'opacity-40 line-through' : ''}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.description}</td>
                  <td className="px-4 py-3">
                    {tx.categoryName ? (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: tx.categoryColor ? `${tx.categoryColor}20` : '#e5e7eb',
                            color: tx.categoryColor ?? '#6b7280',
                          }}
                        >
                          {tx.categoryIcon && <span>{tx.categoryIcon}</span>}
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
                  <td className="px-4 py-3 text-xs text-gray-500">{TYPE_LABELS[tx.type]}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${TYPE_STYLES[tx.type]}`}>
                    {tx.amountCents >= 0 ? '+' : ''}{formatBRL(tx.amountCents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
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
    </>
  )
}
