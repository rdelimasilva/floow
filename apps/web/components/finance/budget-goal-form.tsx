'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { upsertBudgetGoal } from '@/lib/finance/budget-actions'

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

interface BudgetGoalFormProps {
  type: 'spending' | 'investing'
  goal?: {
    id: string
    name: string
    targetCents: number
    period: string
    patrimonyTargetCents?: number | null
    patrimonyDeadline?: Date | string | null
  }
  onClose: () => void
}

export function BudgetGoalForm({ type, goal, onClose }: BudgetGoalFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const deadlineDefault = goal?.patrimonyDeadline
    ? typeof goal.patrimonyDeadline === 'string'
      ? goal.patrimonyDeadline.slice(0, 10)
      : goal.patrimonyDeadline.toISOString().slice(0, 10)
    : ''

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const form = e.currentTarget
      const fd = new FormData(form)
      fd.set('type', type)
      if (goal?.id) fd.set('id', goal.id)
      await upsertBudgetGoal(fd)
      toast(goal ? 'Meta atualizada com sucesso' : 'Meta criada com sucesso')
      onClose()
    } catch {
      toast('Erro ao salvar meta', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">
        {goal ? 'Editar Meta' : 'Criar Meta'}
      </h3>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Nome</label>
        <Input name="name" required defaultValue={goal?.name ?? ''} placeholder="Ex: Gastos mensais" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Limite (centavos)</label>
        <Input
          name="targetCents"
          type="number"
          required
          min={1}
          defaultValue={goal?.targetCents ?? ''}
          placeholder="Ex: 500000 (R$ 5.000)"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Período</label>
        <select
          name="period"
          defaultValue={goal?.period ?? 'monthly'}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {Object.entries(PERIOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {type === 'investing' && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Meta patrimonial (centavos, opcional)
            </label>
            <Input
              name="patrimonyTargetCents"
              type="number"
              min={0}
              defaultValue={goal?.patrimonyTargetCents ?? ''}
              placeholder="Ex: 10000000 (R$ 100.000)"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Prazo da meta patrimonial (opcional)
            </label>
            <Input
              name="patrimonyDeadline"
              type="date"
              defaultValue={deadlineDefault}
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}
