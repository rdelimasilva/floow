import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import { carregarDadosDaSugestao } from '@/lib/finance/budget-goal-suggestion-queries'
import { mediaMensalPorCategoria } from '@/lib/finance/simulador-orcamento'
import { mesDaTela } from '@/lib/finance/mes-da-tela'
import { SimuladorClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function SimuladorOrcamentarioPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const selectedMonth = await mesDaTela('/budgets/spending/simulador', params)
  const [sy, sm] = selectedMonth.split('-').map(Number)

  const [categories, entriesForMonth, dadosDaSugestao] = await Promise.all([
    getCategories(orgId),
    getSpendingPlanForMonth(orgId, new Date(sy, sm - 1, 1), new Date(sy, sm, 0)),
    carregarDadosDaSugestao(orgId),
  ])

  return (
    <SimuladorClient
      categories={categories
        .filter((c) => c.type === 'expense')
        .map((c) => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId }))}
      planoVigente={entriesForMonth
        .filter((e): e is typeof e & { categoryId: string } => !!e.categoryId)
        .map((e) => ({ categoryId: e.categoryId, plannedCents: e.plannedCents, recorrentesCents: e.recorrentesCents }))}
      mediaPorCategoria={mediaMensalPorCategoria(dadosDaSugestao.rows, dadosDaSugestao.months)}
      mesesDaMedia={dadosDaSugestao.months.length}
      selectedMonth={selectedMonth}
    />
  )
}
