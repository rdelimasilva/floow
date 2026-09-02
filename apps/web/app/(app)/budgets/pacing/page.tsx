import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getBudgetEntriesForMonth } from '@/lib/finance/budget-queries'
import { getDailySpending } from '@/lib/finance/budget-daily-queries'
import { computeBudgetPacing } from '@floow/core-finance'
import { PacingClient } from './client'

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

/**
 * Dia-calendário do usuário em São Paulo, expresso como Date em UTC.
 *
 * computeBudgetPacing pede exatamente isso. Passar `new Date()` cru quebraria
 * em produção: Vercel e Netlify rodam em UTC, então entre 21h e 23h59 no Brasil
 * o servidor já está no dia seguinte — a contagem de dias decorridos ficaria um
 * a mais toda noite, e na última noite do mês o mês corrente seria tratado como
 * encerrado três horas antes da hora.
 */
function saoPauloToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 12, 0, 0))
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

  const result = computeBudgetPacing({
    daily,
    budgets: budgetEntries
      .filter((e): e is typeof e & { categoryId: string } => e.categoryId !== null)
      .map((e) => ({ categoryId: e.categoryId, plannedCents: e.plannedCents })),
    monthStart,
    today,
  })

  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  return (
    <PacingClient result={result} categoryNames={categoryNames} selectedMonth={selectedMonth} />
  )
}
