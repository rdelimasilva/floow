'use client'

import { useEffect, useRef, useState } from 'react'
import { getCategoryUsage, reassignAndDeleteCategory, deleteCategory } from '@/lib/finance/actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'

interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
}

interface DeleteCategoryDialogProps {
  target: CategoryOption | null
  allCategories: CategoryOption[]
  onClose: () => void
  onDeleted: () => void
}

interface Usage {
  type: 'income' | 'expense' | 'transfer'
  transactions: number
  recurring: number
  budgets: number
  debts: number
  rules: number
}

const USAGE_LABELS: Record<keyof Omit<Usage, 'type'>, string> = {
  transactions: 'transações',
  recurring: 'recorrências',
  budgets: 'metas de gastos',
  debts: 'dívidas',
  rules: 'regras',
}

export function DeleteCategoryDialog({
  target,
  allCategories,
  onClose,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [replacementId, setReplacementId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Show/hide dialog
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  // Fetch usage when target changes
  useEffect(() => {
    if (!target) {
      setUsage(null)
      setReplacementId('')
      return
    }
    setLoadingUsage(true)
    getCategoryUsage(target.id)
      .then((u) => setUsage(u as Usage))
      .catch((e) => {
        toast(e instanceof Error ? e.message : 'Erro ao carregar uso da categoria', 'error')
        onClose()
      })
      .finally(() => setLoadingUsage(false))
  }, [target, toast, onClose])

  if (!target) return null

  const totalUsage = usage
    ? usage.transactions + usage.recurring + usage.budgets + usage.debts + usage.rules
    : 0
  const hasReferences = totalUsage > 0

  // Available replacement: same type, different id
  const replacementOptions = allCategories.filter(
    (c) => c.type === target.type && c.id !== target.id,
  )

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  async function handleDelete() {
    if (!target) return
    setSubmitting(true)
    try {
      if (hasReferences) {
        if (!replacementId) {
          toast('Selecione uma categoria de destino', 'error')
          setSubmitting(false)
          return
        }
        const fd = new FormData()
        fd.append('oldId', target.id)
        fd.append('newId', replacementId)
        await reassignAndDeleteCategory(fd)
        toast('Categoria removida e itens reatribuídos')
      } else {
        const fd = new FormData()
        fd.append('id', target.id)
        await deleteCategory(fd)
        toast('Categoria removida')
      }
      onDeleted()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover categoria', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="w-[480px] p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Remover &ldquo;{target.name}&rdquo;
        </h2>

        {loadingUsage ? (
          <p className="text-sm text-gray-500 py-4">Verificando uso...</p>
        ) : !usage ? null : !hasReferences ? (
          <p className="text-sm text-gray-700 mt-2">
            Nenhum lançamento usa esta categoria. A exclusão é segura.
          </p>
        ) : (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-gray-700">
              Esta categoria está em uso. Antes de excluir, escolha uma categoria de destino — todos os
              itens abaixo serão reatribuídos:
            </p>
            <ul className="text-sm text-gray-700 space-y-1 rounded-md bg-gray-50 px-3 py-2">
              {(Object.keys(USAGE_LABELS) as Array<keyof typeof USAGE_LABELS>).map((key) => {
                const value = usage[key]
                if (value === 0) return null
                return (
                  <li key={key} className="flex justify-between">
                    <span>{USAGE_LABELS[key]}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </li>
                )
              })}
            </ul>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Reatribuir para
              </label>
              {replacementOptions.length === 0 ? (
                <p className="text-sm text-red-600">
                  Não existe outra categoria do tipo {target.type === 'income' ? 'receita' : target.type === 'expense' ? 'despesa' : 'transferência'}. Crie uma antes de excluir.
                </p>
              ) : (
                <select
                  value={replacementId}
                  onChange={(e) => setReplacementId(e.target.value)}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Selecione a categoria de destino...</option>
                  {replacementOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleDelete}
            disabled={
              submitting ||
              loadingUsage ||
              !usage ||
              (hasReferences && (replacementOptions.length === 0 || !replacementId))
            }
          >
            {submitting
              ? 'Removendo...'
              : hasReferences
                ? 'Reatribuir e excluir'
                : 'Excluir'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
