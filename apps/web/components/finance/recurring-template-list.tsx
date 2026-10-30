'use client'

import { useState } from 'react'
import { Pencil, Copy, Trash2, Pause, Play, RefreshCw } from 'lucide-react'
import {
  deleteRecurringTemplate,
  toggleRecurringActive,
  generateRecurringTransaction,
} from '@/lib/finance/recurring-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateRecurringDialog } from '@/components/finance/create-recurring-dialog'
import { RecurringMonthlyTotalCard } from '@/components/finance/recurring-monthly-total-card'
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
import { formatBRL } from '@floow/core-finance/src/balance'
import { dataDeCalendario, formatarDataDeCalendario } from '@/lib/finance/recurring-dates'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { ordenarPorProximaParcela } from '@/lib/finance/ordenar-recorrencias'
import type { ParceladoNoCartao } from '@floow/core-finance'
import { ParceladosDoBancoRecorrentes } from '@/components/finance/parcelados-do-banco-recorrentes'

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
  countsAsBudget?: boolean
  createdAt: Date | string
  updatedAt: Date | string
  // 'YYYY-MM-DD' vindos das parcelas geradas (`getDatasDasParcelas`)
  proximaParcela?: string | null
  ultimaParcela?: string | null
}

interface RecurringTemplateListProps {
  templates: RecurringTemplate[]
  accounts: AccountOption[]
  categories: CategoryOption[]
  /** Parcelados do cartão vindos do banco (sem recorrência), de `getParceladosNoCartao`. */
  parcelados?: ParceladoNoCartao[]
}

const frequencyLabels: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

function isOverdue(date: Date | string): boolean {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return dataDeCalendario(date) <= hoje
}

export function RecurringTemplateList({
  templates,
  accounts,
  categories,
  parcelados = [],
}: RecurringTemplateListProps) {
  const { toast } = useToast()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null)
  const [cloningTemplate, setCloningTemplate] = useState<RecurringTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTemplate | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  const doBanco = parcelados.filter((p) => !p.deRecorrencia)
  // O que vence primeiro no topo (ver `ordenar-recorrencias.ts`).
  const ordenadas = ordenarPorProximaParcela(templates)

  async function handleGenerate(template: RecurringTemplate) {
    setGenerating(template.id)
    try {
      const formData = new FormData()
      formData.append('templateId', template.id)
      const result = await generateRecurringTransaction(formData)
      if (result.generated === 0) {
        toast('Nenhuma transação a gerar — próxima data no futuro.', 'info')
      } else {
        toast(`${result.generated} ${result.generated === 1 ? 'transação gerada' : 'transações geradas'}`)
      }
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao gerar transações'), 'error')
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
      toast(mensagemDeErro(err, 'Erro ao alterar status'), 'error')
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
      toast('Recorrência removida')
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao remover recorrência'), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      <RecurringMonthlyTotalCard templates={templates} />

      {/* All Templates Table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Todas as recorrências</h2>
          <Button variant="primary" size="sm" onClick={() => setShowCreateDialog(true)}>
            Nova Recorrência
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <RefreshCw className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Nenhuma recorrência configurada. Crie uma recorrência para automatizar lançamentos repetitivos.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => setShowCreateDialog(true)}
            >
              Criar Recorrência
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Próxima parcela</TableHead>
                  <TableHead>Última parcela</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((t) => {
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
                      <TableCell>{formatarDataDeCalendario(t.proximaParcela)}</TableCell>
                      <TableCell>{formatarDataDeCalendario(t.ultimaParcela)}</TableCell>
                      <TableCell>
                        {t.isActive ? (
                          <span className="text-green-700 text-sm font-medium">Ativo</span>
                        ) : (
                          <span className="text-gray-500 text-sm font-medium">Pausado</span>
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
                              title="Gerar agora" aria-label="Gerar agora"
                            >
                              {generating === t.id ? '...' : 'Gerar'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(t)}
                            disabled={loadingToggle === t.id}
                            title={t.isActive ? 'Pausar' : 'Reativar'} aria-label={t.isActive ? 'Pausar' : 'Reativar'}
                            className="rounded p-2 sm:p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors disabled:opacity-50"
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
                            title="Editar" aria-label="Editar"
                            className="rounded p-2 sm:p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCloningTemplate(t)}
                            title="Clonar" aria-label="Clonar"
                            className="rounded p-2 sm:p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(t)}
                            title="Excluir" aria-label="Excluir"
                            className="rounded p-2 sm:p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
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

      <ParceladosDoBancoRecorrentes parcelados={doBanco} />

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

      {/* Clone dialog — nova recorrência já preenchida com os dados da escolhida */}
      <CreateRecurringDialog
        open={cloningTemplate !== null}
        onClose={() => setCloningTemplate(null)}
        accounts={accounts}
        categories={categories}
        cloneFrom={cloningTemplate ?? undefined}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir recorrência"
        description="Tem certeza que deseja excluir esta recorrência? Todas as transações geradas serão removidas e o saldo da conta será revertido. Para preservar o histórico, use Pausar."
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  )
}
