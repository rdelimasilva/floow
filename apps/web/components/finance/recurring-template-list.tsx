'use client'

import { useState } from 'react'
import { Pencil, Trash2, Pause, Play, RefreshCw } from 'lucide-react'
import {
  deleteRecurringTemplate,
  toggleRecurringActive,
  generateRecurringTransaction,
} from '@/lib/finance/recurring-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRecurringDialog } from '@/components/finance/create-recurring-dialog'
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
import { formatBRL } from '@floow/core-finance'

interface AccountOption {
  id: string
  name: string
}

interface CategoryOption {
  id: string
  name: string
  type: string
}

// Inlined type to avoid @floow/db import in client bundle (same pattern as RuleList)
// type includes 'transfer' to satisfy DB schema inference even though recurring templates
// are always created as income | expense only
interface RecurringTemplate {
  id: string
  orgId: string
  accountId: string
  categoryId: string | null
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  description: string
  frequency: string
  nextDueDate: Date | string
  isActive: boolean
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface RecurringTemplateListProps {
  templates: RecurringTemplate[]
  upcoming: RecurringTemplate[]
  accounts: AccountOption[]
  categories: CategoryOption[]
}

const frequencyLabels: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('pt-BR')
}

function isOverdue(date: Date | string): boolean {
  const d = date instanceof Date ? date : new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d <= today
}

export function RecurringTemplateList({
  templates,
  upcoming,
  accounts,
  categories,
}: RecurringTemplateListProps) {
  const { toast } = useToast()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTemplate | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  // Upcoming due: templates from upcoming prop that are due today or overdue
  const due = upcoming.filter((t) => isOverdue(t.nextDueDate))

  async function handleGenerate(template: RecurringTemplate) {
    setGenerating(template.id)
    try {
      const formData = new FormData()
      formData.append('templateId', template.id)
      const result = await generateRecurringTransaction(formData)
      if (result.generated === 0) {
        toast('Nenhuma transacao a gerar — proxima data no futuro.', 'info')
      } else {
        toast(`${result.generated} transacao(oes) gerada(s)`)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao gerar transacoes', 'error')
    } finally {
      setGenerating(null)
    }
  }

  async function handleToggleActive(template: RecurringTemplate) {
    setLoadingToggle(template.id)
    try {
      const formData = new FormData()
      formData.append('id', template.id)
      await toggleRecurringActive(formData)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao alterar status', 'error')
    } finally {
      setLoadingToggle(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const formData = new FormData()
      formData.append('id', deleteTarget.id)
      await deleteRecurringTemplate(formData)
      setDeleteTarget(null)
      toast('Recorrencia removida')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao remover recorrencia', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Upcoming Due Section */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Proximas a vencer</h2>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma transacao pendente.</p>
        ) : (
          <div className="space-y-2">
            {due.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {accountMap.get(t.accountId) ?? t.accountId} &bull; {formatDate(t.nextDueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={t.type === 'income' ? 'text-sm font-semibold text-green-700' : 'text-sm font-semibold text-red-600'}>
                    {formatBRL(t.amountCents)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerate(t)}
                    disabled={generating === t.id}
                  >
                    {generating === t.id ? 'Gerando...' : 'Gerar agora'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All Templates Table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Todas as recorrencias</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreateDialog(true)}>
            Nova Recorrencia
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <RefreshCw className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Nenhuma recorrencia configurada. Crie uma recorrencia para automatizar lancamentos repetitivos.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => setShowCreateDialog(true)}
            >
              Criar Recorrencia
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Frequencia</TableHead>
                  <TableHead>Proxima Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => {
                  const overdue = t.isActive && isOverdue(t.nextDueDate)
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.description}</TableCell>
                      <TableCell>{accountMap.get(t.accountId) ?? '—'}</TableCell>
                      <TableCell>{t.categoryId ? (categoryMap.get(t.categoryId) ?? '—') : '—'}</TableCell>
                      <TableCell>
                        {t.type === 'income' ? (
                          <span className="text-green-700 font-medium">Receita</span>
                        ) : (
                          <span className="text-red-600 font-medium">Despesa</span>
                        )}
                      </TableCell>
                      <TableCell>{formatBRL(t.amountCents)}</TableCell>
                      <TableCell>{frequencyLabels[t.frequency] ?? t.frequency}</TableCell>
                      <TableCell>
                        <span className={overdue ? 'text-amber-600 font-medium' : ''}>
                          {formatDate(t.nextDueDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t.isActive ? (
                          <span className="text-green-700 text-sm font-medium">Ativo</span>
                        ) : (
                          <span className="text-gray-400 text-sm font-medium">Pausado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {overdue && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerate(t)}
                              disabled={generating === t.id}
                              title="Gerar agora"
                            >
                              {generating === t.id ? '...' : 'Gerar'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(t)}
                            disabled={loadingToggle === t.id}
                            title={t.isActive ? 'Pausar' : 'Reativar'}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors disabled:opacity-50"
                          >
                            {t.isActive ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTemplate(t)}
                            title="Editar"
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(t)}
                            title="Excluir"
                            className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Create dialog */}
      <CreateRecurringDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        accounts={accounts}
        categories={categories}
      />

      {/* Edit dialog */}
      <CreateRecurringDialog
        open={editingTemplate !== null}
        onClose={() => setEditingTemplate(null)}
        accounts={accounts}
        categories={categories}
        editTemplate={editingTemplate ?? undefined}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir recorrencia"
        description="Tem certeza que deseja excluir esta recorrencia? As transacoes ja geradas serao mantidas."
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  )
}
