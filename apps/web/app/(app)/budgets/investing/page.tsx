import { getOrgId, getCategories } from '@/lib/finance/queries'
import {
  getBudgetEntriesForMonth,
  getAllBudgetEntries,
  getSpendingByCategory,
} from '@/lib/finance/budget-queries'
import { InvestingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function InvestingBudgetPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const selectedMonth = params.month ?? defaultMonth
  const [sy, sm] = selectedMonth.split('-').map(Number)
  const monthDate = new Date(sy, sm - 1, 1)
  const monthEnd = new Date(sy, sm, 0)

  const [categories, entriesForMonth, allEntries, spending] = await Promise.all([
    getCategories(orgId),
    getBudgetEntriesForMonth(orgId, monthDate, 'investing'),
    getAllBudgetEntries(orgId, 'investing'),
    getSpendingByCategory(orgId, monthDate, monthEnd),
  ])

  // All categories (expense type) for the category picker
  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon }))

  return (
    <InvestingClient
      categories={expenseCategories}
      entriesForMonth={entriesForMonth.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        name: e.name ?? 'Investimentos',
        plannedCents: e.plannedCents,
      }))}
      allEntries={allEntries.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        name: e.name ?? 'Investimentos',
        plannedCents: e.plannedCents,
        startMonth: e.startMonth.toISOString().split('T')[0],
        endMonth: e.endMonth ? e.endMonth.toISOString().split('T')[0] : null,
      }))}
      spending={spending}
      selectedMonth={selectedMonth}
    />
  )
}
