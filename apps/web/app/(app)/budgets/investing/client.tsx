'use client'

import { useState } from 'react'
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { BudgetGoalForm } from '@/components/finance/budget-goal-form'
import { BudgetAdjustmentDialog } from '@/components/finance/budget-adjustment-dialog'

interface InvestingGoalClientProps {
  goal: {
    id: string
    name: string
    targetCents: number
    period: string
    patrimonyTargetCents?: number | null
    patrimonyDeadline?: Date | string | null
  } | null
  contributed: number
  patrimony: number
  periodLabel: string
}

export function InvestingGoalClient({
  goal,
  contributed,
  patrimony,
  periodLabel,
}: InvestingGoalClientProps) {
  const [showForm, setShowForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  // Empty state
  if (!goal && !showForm) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meta de Investimentos" />
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
          <p className="text-gray-500 text-sm">Nenhuma meta de investimentos configurada.</p>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Criar meta
          </Button>
        </div>
      </div>
    )
  }

  // Show form
  if (showForm || editMode) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meta de Investimentos" />
        <BudgetGoalForm
          type="investing"
          goal={editMode && goal ? goal : undefined}
          onClose={() => {
            setShowForm(false)
            setEditMode(false)
          }}
        />
      </div>
    )
  }

  // Patrimony projection
  let projectionText: string | null = null
  if (goal!.patrimonyTargetCents && goal!.patrimonyTargetCents > 0 && contributed > 0) {
    const remaining = goal!.patrimonyTargetCents - patrimony
    if (remaining > 0) {
      const monthsNeeded = Math.ceil(remaining / contributed)
      projectionText = `No ritmo atual, ~${monthsNeeded} meses`
    } else {
      projectionText = 'Meta patrimonial atingida!'
    }
  }

  const deadlineText = goal!.patrimonyDeadline
    ? typeof goal!.patrimonyDeadline === 'string'
      ? goal!.patrimonyDeadline.slice(0, 10)
      : goal!.patrimonyDeadline.toISOString().slice(0, 10)
    : null

  return (
    <div className="space-y-6">
      <PageHeader title="Meta de Investimentos" description={`Período: ${periodLabel}`}>
        <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
          <Pencil className="h-4 w-4" />
          Editar meta
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          Ajuste manual
        </Button>
      </PageHeader>

      {/* Contribution progress */}
      <Card>
        <CardHeader>
          <CardTitle>Aportes no Período</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetProgressBar
            label={goal!.name}
            currentCents={contributed}
            limitCents={goal!.targetCents}
            invertColors
          />
        </CardContent>
      </Card>

      {/* Patrimony target */}
      {goal!.patrimonyTargetCents != null && goal!.patrimonyTargetCents > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meta Patrimonial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BudgetProgressBar
              label="Patrimônio atual"
              currentCents={patrimony}
              limitCents={goal!.patrimonyTargetCents}
              invertColors
            />
            {deadlineText && (
              <p className="text-sm text-gray-500">
                Prazo: {deadlineText}
              </p>
            )}
            {projectionText && (
              <p className="text-sm font-medium text-gray-700">
                {projectionText}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <BudgetAdjustmentDialog
        goalId={goal!.id}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />
    </div>
  )
}
