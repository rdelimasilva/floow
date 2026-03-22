import { getOrgId, getCategories } from '@/lib/finance/queries'
import {
  getBudgetEntriesForMonth,
  getAllBudgetEntries,
  getSpendingByCategory,
} from '@/lib/finance/budget-queries'
import { SpendingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function SpendingBudgetPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  // Determine selected month
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const selectedMonth = params.month ?? defaultMonth
  const monthDate = new Date(selectedMonth)
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

  const [categories, entriesForMonth, allEntries, spending] = await Promise.all([
    getCategories(orgId),
    getBudgetEntriesForMonth(orgId, monthDate),
    getAllBudgetEntries(orgId),
    getSpendingByCategory(orgId, monthDate, monthEnd),
  ])

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }))

  return (
    <SpendingClient
      categories={expenseCategories}
      entriesForMonth={entriesForMonth.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        plannedCents: e.plannedCents,
      }))}
      allEntries={allEntries.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        plannedCents: e.plannedCents,
        startMonth: e.startMonth.toISOString().split('T')[0],
        endMonth: e.endMonth ? e.endMonth.toISOString().split('T')[0] : null,
      }))}
      spending={spending}
      selectedMonth={selectedMonth}
    />
  )
}
