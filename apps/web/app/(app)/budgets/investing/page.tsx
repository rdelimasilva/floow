import { getOrgId } from '@/lib/finance/queries'
import {
  getBudgetEntriesForMonth,
  getAllBudgetEntries,
  getInvestmentContributions,
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

  const [entriesForMonth, allEntries, contributions] = await Promise.all([
    getBudgetEntriesForMonth(orgId, monthDate, 'investing'),
    getAllBudgetEntries(orgId, 'investing'),
    getInvestmentContributions(orgId, monthDate, monthEnd),
  ])

  return (
    <InvestingClient
      entriesForMonth={entriesForMonth.map((e) => ({
        id: e.id,
        name: e.name ?? 'Investimentos',
        plannedCents: e.plannedCents,
      }))}
      allEntries={allEntries.map((e) => ({
        id: e.id,
        name: e.name ?? 'Investimentos',
        plannedCents: e.plannedCents,
        startMonth: e.startMonth.toISOString().split('T')[0],
        endMonth: e.endMonth ? e.endMonth.toISOString().split('T')[0] : null,
      }))}
      totalContributed={contributions}
      selectedMonth={selectedMonth}
    />
  )
}
