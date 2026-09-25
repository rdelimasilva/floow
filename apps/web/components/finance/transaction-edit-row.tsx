'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { updateTransaction } from '@/lib/finance/transaction-actions'
import { createCategory } from '@/lib/finance/category-actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toDateInputValue, type TransactionRowData, type AccountOption, type CategoryOption } from './transaction-list-types'
import { toCategoryOptions } from '@/lib/finance/category-options'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface TransactionEditRowProps {
  tx: TransactionRowData
  accounts: AccountOption[]
  categories: CategoryOption[]
  balance: number
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onClose: () => void
}

export function TransactionEditRow({
  tx, accounts, categories, balance, isSelected, onToggleSelect, onClose,
}: TransactionEditRowProps) {
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [editDesc, setEditDesc] = useState(tx.description)
  const [editAmount, setEditAmount] = useState(String(Math.abs(tx.amountCents)))
  const [editDate, setEditDate] = useState(toDateInputValue(tx.date))
  const [editType, setEditType] = useState<'income' | 'expense' | 'transfer'>(tx.type)
  const [editAccountId, setEditAccountId] = useState(tx.accountId)
  const [editCategoryId, setEditCategoryId] = useState(tx.categoryId ?? '')
  const [editDestAccountId, setEditDestAccountId] = useState('')

  const [localCategories, setLocalCategories] = useState(categories)
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)

  const editRowRef = useRef<HTMLTableRowElement>(null)
  const editStateRef = useRef({
    desc: editDesc, amount: editAmount, date: editDate,
    type: editType as string, accountId: editAccountId,
    categoryId: editCategoryId, destAccountId: editDestAccountId,
  })

  useEffect(() => {
    editStateRef.current = {
      desc: editDesc, amount: editAmount, date: editDate,
      type: editType, accountId: editAccountId,
      categoryId: editCategoryId, destAccountId: editDestAccountId,
    }
  }, [editDesc, editAmount, editDate, editType, editAccountId, editCategoryId, editDestAccountId])

  const initialStateRef = useRef({
    desc: tx.description,
    amount: String(Math.abs(tx.amountCents)),
    date: toDateInputValue(tx.date),
    type: tx.type as string,
    accountId: tx.accountId,
    categoryId: tx.categoryId ?? '',
    destAccountId: '',
  })

  /** Resolve `true` quando a linha pode fechar: salvou, ou não havia o que salvar. */
  const saveEdit = useCallback(async (): Promise<boolean> => {
    const s = editStateRef.current
    const init = initialStateRef.current
    const isDirty =
      s.desc !== init.desc ||
      s.amount !== init.amount ||
      s.date !== init.date ||
      s.type !== init.type ||
      s.accountId !== init.accountId ||
      s.categoryId !== init.categoryId ||
      s.destAccountId !== init.destAccountId
    if (!isDirty) return true

    // Mesma invariante que `updateTransaction` cobra no servidor
    // (lib/finance/actions.ts): transferência sem destino não existe — ela
    // viraria perna órfã drenando saldo sem contrapartida. Aqui a checagem
    // existe por outro motivo: o seletor "Conta destino..." só aparece DEPOIS
    // de escolher o tipo e nasce vazio, então um clique fora nessa janela
    // submetia a conversão pela metade e fechava a linha, levando junto a
    // edição do usuário. O guard do servidor continua sendo a última cerca.
    if (s.type === 'transfer' && !s.destAccountId) {
      toastRef.current('Transferência exige a conta de destino.', 'error')
      return false
    }

    try {
      const formData = new FormData()
      formData.append('id', tx.id)
      formData.append('accountId', s.accountId)
      if (s.categoryId) formData.append('categoryId', s.categoryId)
      formData.append('type', s.type)
      formData.append('amountCents', s.amount)
      formData.append('description', s.desc)
      formData.append('date', s.date)
      if (s.type === 'transfer' && s.destAccountId) formData.append('destAccountId', s.destAccountId)
      await updateTransaction(formData)
      toastRef.current('Transação salva')
      return true
    } catch (e) {
      toastRef.current(
        mensagemDeErro(e, 'Não foi possível salvar a edição. Tente novamente.'),
        'error',
      )
      return false
    }
  }, [tx.id, tx.description, tx.amountCents, tx.date, tx.type, tx.accountId, tx.categoryId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (editRowRef.current && !editRowRef.current.contains(e.target as Node)) {
        // Fecha só depois de saber que salvou. Fechar de imediato — sem
        // esperar o `saveEdit()` — descartava a edição sempre que o save
        // falhava, e o toast de erro chegava com a linha já fora da tela.
        void saveEdit().then((saved) => {
          if (saved) onClose()
        })
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [saveEdit, onClose])

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
      toast(mensagemDeErro(e, 'Não foi possível criar a categoria. Tente novamente.'), 'error')
    } finally {
      setCreatingCat(false)
    }
  }

  return (
    <tr ref={editRowRef} className="bg-blue-50">
      <td className="px-4 py-2">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(tx.id)} className="h-4 w-4 rounded border-gray-300" />
      </td>
      <td className="px-4 py-2">
        <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8 text-xs" />
      </td>
      <td className="px-4 py-2">
        <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 text-xs" />
      </td>
      <td className="hidden md:table-cell px-4 py-2">
        {editType === 'transfer' ? (
          <span className="text-xs text-gray-400">&mdash;</span>
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
              {toCategoryOptions(localCategories.filter((c) => c.type === editType)).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
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
        {formatBRL(balance)}
      </td>
      <td className="px-4 py-2">
        <span className="text-[10px] text-gray-400">auto-salva ao sair</span>
      </td>
    </tr>
  )
}
