import { getOrgId } from '@/lib/finance/queries'
import {
  getBudgetGoals,
  getInvestmentContributions,
  getAdjustmentTotal,
  getCurrentPeriodRange,
} from '@/lib/finance/budget-queries'
import { getPositions } from '@/lib/investments/queries'
import { InvestingGoalClient } from './client'

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export default async function InvestingGoalPage() {
  const orgId = await getOrgId()

  const goals = await getBudgetGoals(orgId, 'investing')
  const goal = goals[0] ?? null

  if (!goal) {
    return (
      <InvestingGoalClient
        goal={null}
        contributed={0}
        patrimony={0}
        periodLabel=""
      />
    )
  }

  const { start, end } = getCurrentPeriodRange(goal.period)

  const [contributions, adjustmentTotal, positions] = await Promise.all([
    getInvestmentContributions(orgId, start, end),
    getAdjustmentTotal(goal.id, start, end),
    getPositions(orgId),
  ])

  const totalContributed = contributions + adjustmentTotal
  const patrimony = positions.reduce((sum, p) => sum + p.currentValueCents, 0)

  return (
    <InvestingGoalClient
      goal={{
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        period: goal.period,
        patrimonyTargetCents: goal.patrimonyTargetCents,
        patrimonyDeadline: goal.patrimonyDeadline,
      }}
      contributed={totalContributed}
      patrimony={patrimony}
      periodLabel={PERIOD_LABELS[goal.period] ?? goal.period}
    />
  )
}
