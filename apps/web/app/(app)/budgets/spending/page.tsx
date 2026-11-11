import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getAllBudgetEntries, getSpendingByCategory } from '@/lib/finance/budget-queries'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import { getParcelasAVencerDoMes } from '@/lib/finance/parcelas-a-vencer-queries'
import { carregarDadosDaSugestao, montarSugestoesDeMeta } from '@/lib/finance/budget-goal-suggestion-queries'
import { rollUpSpendingToBudgeted } from '@/lib/finance/budgeted-spending'
import { mesDaTela } from '@/lib/finance/mes-da-tela'
import { SpendingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function SpendingBudgetPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const selectedMonth = await mesDaTela('/budgets/spending', params)
  const [sy, sm] = selectedMonth.split('-').map(Number)
  const monthDate = new Date(sy, sm - 1, 1)
  const monthEnd = new Date(sy, sm, 0)

  const [categories, entriesForMonth, allEntries, spending, parcelasAVencer, dadosDaSugestao] = await Promise.all([
    getCategories(orgId),
    getSpendingPlanForMonth(orgId, monthDate, monthEnd),
    getAllBudgetEntries(orgId, 'spending'),
    getSpendingByCategory(orgId, monthDate, monthEnd),
    getParcelasAVencerDoMes(orgId, monthDate, monthEnd),
    carregarDadosDaSugestao(orgId),
  ])

  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon, parentId: c.parentId }))

  // Com meta = qualquer lançamento de meta (o diálogo também só oferece
  // categoria sem nenhum) ou recorrente contando como meta neste mês.
  const categoriesWithGoal = new Set(
    [...allEntries.map((e) => e.categoryId), ...entriesForMonth.map((e) => e.categoryId)].filter(
      (id): id is string => !!id,
    ),
  )
  const goalSuggestions = montarSugestoesDeMeta(dadosDaSugestao, expenseCategories, categoriesWithGoal)

  return (
    <SpendingClient
      categories={expenseCategories}
      entriesForMonth={entriesForMonth}
      allEntries={allEntries.map((e) => ({
        id: e.id,
        categoryId: e.categoryId,
        plannedCents: e.plannedCents,
        startMonth: e.startMonth instanceof Date ? e.startMonth.toISOString().split('T')[0] : String(e.startMonth),
        endMonth: e.endMonth ? (e.endMonth instanceof Date ? e.endMonth.toISOString().split('T')[0] : String(e.endMonth)) : null,
      }))}
      // Gasto das subcategorias conta na meta da categoria-mãe
      spending={rollUpSpendingToBudgeted(spending, categories, entriesForMonth)}
      selectedMonth={selectedMonth}
      parcelasAVencer={parcelasAVencer}
      goalSuggestions={goalSuggestions}
    />
  )
}
