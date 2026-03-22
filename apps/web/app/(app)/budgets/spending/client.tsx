'use client'

import { useState } from 'react'
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { BudgetGoalForm } from '@/components/finance/budget-goal-form'
import { BudgetAdjustmentDialog } from '@/components/finance/budget-adjustment-dialog'

interface SpendingGoalClientProps {
  goal: {
    id: string
    name: string
    targetCents: number
    period: string
  } | null
  categories: { id: string; name: string }[]
  globalSpent: number
  categorySpending: { categoryId: string | null; spent: number }[]
  categoryLimits: { categoryId: string; limitCents: number }[]
  periodLabel: string
}

export function SpendingGoalClient({
  goal,
  categories,
  globalSpent,
  categorySpending,
  categoryLimits,
  periodLabel,
}: SpendingGoalClientProps) {
  const [showForm, setShowForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  // Empty state: no goal and form not shown
  if (!goal && !showForm) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meta de Gastos" />
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
          <p className="text-gray-500 text-sm">Nenhuma meta de gastos configurada.</p>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Criar meta
          </Button>
        </div>
      </div>
    )
  }

  // Show form for creating or editing
  if (showForm || editMode) {
    return (
      <div className="space-y-6">
        <PageHeader title="Meta de Gastos" />
        <BudgetGoalForm
          type="spending"
          goal={editMode && goal ? goal : undefined}
          onClose={() => {
            setShowForm(false)
            setEditMode(false)
          }}
        />
      </div>
    )
  }

  // Goal exists — show dashboard
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))
  const spendingMap = new Map(categorySpending.map((s) => [s.categoryId, s.spent]))

  return (
    <div className="space-y-6">
      <PageHeader title="Meta de Gastos" description={`Período: ${periodLabel}`}>
        <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
          <Pencil className="h-4 w-4" />
          Editar meta
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" />
          Ajuste manual
        </Button>
      </PageHeader>

      {/* Global progress */}
      <Card>
        <CardHeader>
          <CardTitle>Gasto Global</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetProgressBar
            label={goal!.name}
            currentCents={globalSpent}
            limitCents={goal!.targetCents}
          />
        </CardContent>
      </Card>

      {/* Per-category progress */}
      {categoryLimits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gastos por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryLimits.map((cl) => {
              const catName = categoryMap.get(cl.categoryId) ?? 'Sem categoria'
              const spent = spendingMap.get(cl.categoryId) ?? 0
              return (
                <BudgetProgressBar
                  key={cl.categoryId}
                  label={catName}
                  currentCents={spent}
                  limitCents={cl.limitCents}
                />
              )
            })}
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
