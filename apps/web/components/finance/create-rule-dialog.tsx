'use client'

import { useEffect, useRef, useState } from 'react'
import { createRule, updateRule, previewBulkRecategorize, bulkRecategorize } from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface CreateRuleDialogProps {
  open: boolean
  onClose: () => void
  categories: CategoryOption[]
  // Optional pre-fill (from transaction row "categorizar todas como esta" shortcut)
  prefill?: {
    matchValue: string
    categoryId: string
  }
  // Optional — for edit mode
  editRule?: {
    id: string
    matchType: 'contains' | 'exact'
    matchValue: string
    categoryId: string
  }
}

export function CreateRuleDialog({ open, onClose, categories, prefill, editRule }: CreateRuleDialogProps) {
  const { toast } = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [loading, setLoading] = useState(false)
  const [matchType, setMatchType] = useState<'contains' | 'exact'>(editRule?.matchType ?? 'contains')
  const [matchValue, setMatchValue] = useState(editRule?.matchValue ?? prefill?.matchValue ?? '')
  const [categoryId, setCategoryId] = useState(editRule?.categoryId ?? prefill?.categoryId ?? '')

  // Apply-in-modal state (edit mode only)
  const [applyPreview, setApplyPreview] = useState<{ count: number } | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  // Sync form values when editRule/prefill props change
  useEffect(() => {
    setMatchType(editRule?.matchType ?? 'contains')
    setMatchValue(editRule?.matchValue ?? prefill?.matchValue ?? '')
    setCategoryId(editRule?.categoryId ?? prefill?.categoryId ?? '')
    setApplyPreview(null)
  }, [editRule, prefill])

  // Show/hide the dialog
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('matchType', matchType)
      formData.append('matchValue', matchValue)
      formData.append('categoryId', categoryId)

      if (editRule) {
        formData.append('id', editRule.id)
        await updateRule(formData)
        toast('Regra atualizada')
      } else {
        await createRule(formData)
        toast('Regra criada')
      }
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar regra', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleApplyClick() {
    if (!editRule) return
    setIsApplying(true)
    try {
      const formData = new FormData()
      formData.append('ruleId', editRule.id)
      const { count } = await previewBulkRecategorize(formData)
      if (count === 0) {
        toast('Nenhuma transação sem categoria corresponde a esta regra', 'info')
        return
      }
      setApplyPreview({ count })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao calcular preview', 'error')
    } finally {
      setIsApplying(false)
    }
  }

  async function handleApplyConfirm() {
    if (!editRule) return
    setIsApplying(true)
    try {
      const formData = new FormData()
      formData.append('ruleId', editRule.id)
      const result = await bulkRecategorize(formData)
      toast(`${result.updated} transações categorizadas`)
      setApplyPreview(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar regra', 'error')
      setApplyPreview(null)
    } finally {
      setIsApplying(false)
    }
  }

  const categoryName = categories.find((c) => c.id === (editRule?.categoryId ?? categoryId))?.name ?? ''

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
        className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        <form onSubmit={handleSubmit}>
          <div className="w-[480px] p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editRule ? 'Editar Regra' : 'Nova Regra'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de correspondencia</label>
                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as 'contains' | 'exact')}
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="contains">Contem</option>
                  <option value="exact">Exato</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                <Input
                  value={matchValue}
                  onChange={(e) => setMatchValue(e.target.value)}
                  placeholder="Ex: Netflix, Spotify..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="w-full h-9 rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="">Selecione uma categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="mt-6 flex items-center justify-between">
              <div>
                {editRule && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyClick}
                    disabled={isApplying || loading}
                  >
                    {isApplying ? 'Calculando...' : 'Aplicar'}
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={loading || !matchValue || !categoryId}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={applyPreview !== null}
        onClose={() => setApplyPreview(null)}
        onConfirm={handleApplyConfirm}
        title="Aplicar regra retroativamente"
        description={`${applyPreview?.count ?? 0} transação(ões) sem categoria serão categorizadas como '${categoryName}'. Deseja continuar?`}
        confirmLabel="Aplicar"
        loading={isApplying}
      />
    </>
  )
}
