import { getOrgId, getCategories } from '@/lib/finance/queries'
import {
  getBudgetGoals,
  getCategoryLimits,
  getSpendingByCategory,
  getAdjustmentTotal,
  getCurrentPeriodRange,
} from '@/lib/finance/budget-queries'
import { SpendingGoalClient } from './client'

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export default async function SpendingGoalPage() {
  const orgId = await getOrgId()

  const [goals, categories] = await Promise.all([
    getBudgetGoals(orgId, 'spending'),
    getCategories(orgId),
  ])

  const goal = goals[0] ?? null

  if (!goal) {
    return (
      <SpendingGoalClient
        goal={null}
        categories={categories}
        globalSpent={0}
        categorySpending={[]}
        categoryLimits={[]}
        periodLabel=""
      />
    )
  }

  const { start, end } = getCurrentPeriodRange(goal.period)

  const [spending, limits, adjustmentTotal] = await Promise.all([
    getSpendingByCategory(orgId, start, end),
    getCategoryLimits(goal.id),
    getAdjustmentTotal(goal.id, start, end),
  ])

  const spendingSum = spending.reduce((s, r) => s + r.spent, 0)
  const globalSpent = spendingSum + adjustmentTotal

  return (
    <SpendingGoalClient
      goal={{
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        period: goal.period,
      }}
      categories={categories}
      globalSpent={globalSpent}
      categorySpending={spending}
      categoryLimits={limits.map((l) => ({
        categoryId: l.categoryId,
        limitCents: l.limitCents,
      }))}
      periodLabel={PERIOD_LABELS[goal.period] ?? goal.period}
    />
  )
}
