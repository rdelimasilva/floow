'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, Power, Pencil, Trash2, Plus } from 'lucide-react'
import {
  deleteRule,
  reorderRule,
  toggleEnabled,
  previewBulkRecategorize,
  bulkRecategorize,
} from '@/lib/finance/actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRuleDialog } from '@/components/finance/create-rule-dialog'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

interface CategoryOption {
  id: string
  name: string
  type: string
}

interface CategoryRuleRow {
  id: string
  orgId: string
  categoryId: string
  matchType: 'contains' | 'exact'
  matchValue: string
  priority: number
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

interface RuleListProps {
  rules: CategoryRuleRow[]
  categories: CategoryOption[]
}

export function RuleList({ rules, categories }: RuleListProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<CategoryRuleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryRuleRow | null>(null)
  const [applyPreview, setApplyPreview] = useState<{ rule: CategoryRuleRow; count: number } | null>(null)

  // Category name lookup map
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  async function handleReorder(rule: CategoryRuleRow, direction: 'up' | 'down') {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', rule.id)
      formData.append('direction', direction)
      await reorderRule(formData)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao reordenar regra', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(rule: CategoryRuleRow) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('id', rule.id)
      await toggleEnabled(formData)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao alterar status da regra', 'error')
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
      await deleteRule(formData)
      setDeleteTarget(null)
      toast('Regra removida')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao remover regra', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleApplyPreview(rule: CategoryRuleRow) {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('ruleId', rule.id)
      const { count } = await previewBulkRecategorize(formData)
      if (count === 0) {
        toast('Nenhuma transacao sem categoria corresponde a esta regra', 'info')
        return
      }
      setApplyPreview({ rule, count })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao calcular preview', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleApplyConfirm() {
    if (!applyPreview) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('ruleId', applyPreview.rule.id)
      const result = await bulkRecategorize(formData)
      toast(`${result.updated} transacoes categorizadas`)
      setApplyPreview(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar regra', 'error')
      setApplyPreview(null)
    } finally {
      setLoading(false)
    }
  }

  if (rules.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-600 font-medium">Nenhuma regra configurada.</p>
          <p className="mt-1 text-sm text-gray-400">
            Crie uma regra para categorizar transacoes automaticamente.
          </p>
          <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Criar Regra
          </Button>
        </div>

        <CreateRuleDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          categories={categories}
        />
      </>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Regra
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={rule.id}>
                  <TableCell className="text-sm text-gray-700">
                    {rule.matchType === 'contains' ? 'Contem' : 'Exato'}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-800">
                      {rule.matchValue}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">
                    {categoryMap.get(rule.categoryId) ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{rule.priority}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        rule.isEnabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {rule.isEnabled ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* Reorder buttons */}
                      <button
                        type="button"
                        title="Mover para cima"
                        disabled={idx === 0 || loading}
                        onClick={() => handleReorder(rule, 'up')}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Mover para baixo"
                        disabled={idx === rules.length - 1 || loading}
                        onClick={() => handleReorder(rule, 'down')}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>

                      {/* Toggle enable/disable */}
                      <button
                        type="button"
                        title={rule.isEnabled ? 'Desativar regra' : 'Ativar regra'}
                        disabled={loading}
                        onClick={() => handleToggle(rule)}
                        className={`rounded p-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed ${
                          rule.isEnabled ? 'text-green-600' : 'text-gray-400'
                        }`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        title="Editar regra"
                        disabled={loading}
                        onClick={() => setEditingRule(rule)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Aplicar */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() => handleApplyPreview(rule)}
                        className="h-7 text-xs px-2"
                      >
                        Aplicar
                      </Button>

                      {/* Delete */}
                      <button
                        type="button"
                        title="Remover regra"
                        disabled={loading}
                        onClick={() => setDeleteTarget(rule)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create dialog */}
      <CreateRuleDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        categories={categories}
      />

      {/* Edit dialog */}
      <CreateRuleDialog
        open={editingRule !== null}
        onClose={() => setEditingRule(null)}
        categories={categories}
        editRule={
          editingRule
            ? {
                id: editingRule.id,
                matchType: editingRule.matchType,
                matchValue: editingRule.matchValue,
                categoryId: editingRule.categoryId,
                priority: editingRule.priority,
              }
            : undefined
        }
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover regra"
        description={`Tem certeza que deseja remover a regra "${deleteTarget?.matchValue ?? ''}"? Esta acao nao pode ser desfeita.`}
        confirmLabel="Remover"
        loading={loading}
      />

      {/* Apply confirmation (from rule row) */}
      <ConfirmDialog
        open={applyPreview !== null}
        onClose={() => setApplyPreview(null)}
        onConfirm={handleApplyConfirm}
        title="Aplicar regra retroativamente"
        description={`${applyPreview?.count ?? 0} transacao(oes) sem categoria serao categorizadas como '${categoryMap.get(applyPreview?.rule.categoryId ?? '') ?? ''}'. Deseja continuar?`}
        confirmLabel="Aplicar"
        loading={loading}
      />
    </>
  )
}
