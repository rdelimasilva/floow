import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getBudgetEntriesForMonth } from '@/lib/finance/budget-queries'
import { getDailySpending } from '@/lib/finance/budget-daily-queries'
import {
  computeBudgetPacing,
  buildParentIndex,
  rollUpToBudgetedCategories,
  resolveBudgetedCategory,
} from '@floow/core-finance'
import { saoPauloToday } from '@/lib/finance/sp-date'
import { PacingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function BudgetPacingPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()
  const today = saoPauloToday()

  // O mês analisado vem da query string; o padrão é o mês corrente em São Paulo.
  const defaultMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`
  const selectedMonth = params.month ?? defaultMonth
  const [sy, sm] = selectedMonth.split('-').map(Number)

  // Datas do mês também em UTC, para casar com a convenção da função pura.
  const monthStart = new Date(Date.UTC(sy, sm - 1, 1))
  const monthEnd = new Date(Date.UTC(sy, sm, 0))

  const [categories, budgetEntries, daily] = await Promise.all([
    getCategories(orgId),
    getBudgetEntriesForMonth(orgId, monthStart, 'spending'),
    getDailySpending(orgId, monthStart, monthEnd),
  ])

  const budgets = budgetEntries
    .filter((e): e is typeof e & { categoryId: string } => e.categoryId !== null)
    .map((e) => ({ categoryId: e.categoryId, plannedCents: e.plannedCents }))

  const parentIndex = buildParentIndex(categories)
  const budgetedIds = new Set(budgets.map((b) => b.categoryId))

  const result = computeBudgetPacing({
    // O gasto que cai numa categoria filha sobe para a raiz que tem o teto. O
    // mesmo rollup roda em buildBudgetPacingInput, para o insight do CFO e esta
    // tela nunca contarem o mesmo mês de formas diferentes.
    daily: rollUpToBudgetedCategories(
      daily,
      parentIndex,
      budgetedIds,
    ),
    budgets,
    monthStart,
    today,
  })

  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  // Quais categorias somam em cada teto — o popup de transações busca por elas,
  // com a mesma regra do rollup acima.
  const memberIds: Record<string, string[]> = {}
  for (const c of categories) {
    const target = resolveBudgetedCategory(c.id, parentIndex, budgetedIds)
    if (target && budgetedIds.has(target)) (memberIds[target] ??= []).push(c.id)
  }

  return (
    <PacingClient
      result={result}
      categoryNames={categoryNames}
      memberIds={memberIds}
      selectedMonth={selectedMonth}
    />
  )
}
