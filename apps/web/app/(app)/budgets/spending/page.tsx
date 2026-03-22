import { getOrgId, getCategories } from '@/lib/finance/queries'
import {
  getBudgetEntries,
  getBudgetMonths,
  getSpendingByCategory,
} from '@/lib/finance/budget-queries'
import { SpendingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function SpendingBudgetPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const [categories, budgetMonths] = await Promise.all([
    getCategories(orgId),
    getBudgetMonths(orgId),
  ])

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }))

  // Determine which month to show
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const selectedMonth = params.month ?? defaultMonth

  const periodMonth = new Date(selectedMonth)
  const monthStart = new Date(periodMonth.getFullYear(), periodMonth.getMonth(), 1)
  const monthEnd = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 0)

  const [entries, spending] = await Promise.all([
    getBudgetEntries(orgId, monthStart),
    getSpendingByCategory(orgId, monthStart, monthEnd),
  ])

  const entryData = entries.map((e) => ({
    categoryId: e.categoryId,
    plannedCents: e.plannedCents,
  }))

  const spendingData = spending.map((s) => ({
    categoryId: s.categoryId,
    spent: s.spent,
  }))

  const availableMonths = budgetMonths.map((m) => {
    const d = new Date(m.periodMonth)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })

  return (
    <SpendingClient
      categories={expenseCategories}
      entries={entryData}
      spending={spendingData}
      selectedMonth={selectedMonth}
      availableMonths={availableMonths}
    />
  )
}
