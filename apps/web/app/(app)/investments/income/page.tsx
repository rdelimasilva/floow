import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getIncomeEvents } from '@/lib/investments/queries'
import { estimateMonthlyIncome, formatBRL, incomeAverageMonths, lastIncomeMonths } from '@floow/core-finance'
import dynamic from 'next/dynamic'

const IncomeChart = dynamic(() => import('@/components/investments/income-chart').then(m => ({ default: m.IncomeChart })), {
  loading: () => <div className="min-h-[200px] animate-pulse rounded-xl bg-gray-100" />,
})
import { IncomeEventTable } from '@/components/investments/income-event-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * IncomePage — React Server Component (DASH-04).
 *
 * Fetches income events (dividend, interest, amortization) for the last 12 months,
 * aggregates by month using core-finance pure functions, and renders:
 *   a. Estimated monthly passive income summary card
 *   b. IncomeChart — stacked bar chart by month (dividend / interest / amortization)
 *   c. Recent income events table (last 10)
 *
 * Empty state shown when no income events exist.
 */
export default async function IncomePage() {
  const orgId = await getOrgId()

  const events = await getIncomeEvents(orgId, 12)

  // Os 12 meses de calendário até o atual, com zero onde não houve renda: o
  // gráfico não pula mês vazio e a média não divide só pelos meses com provento.
  const incomeData = lastIncomeMonths(events, 12)
  const monthlyEstimate = estimateMonthlyIncome(events, 12)
  const mesesDaMedia = incomeAverageMonths(events, 12) || 12

  const hasIncome = events.length > 0

  // Recent events for table — last 10, already ordered desc from getIncomeEvents
  const recentEvents = events.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Renda Passiva"
        description="Dividendos, juros e amortizações dos seus investimentos"
      />

      {hasIncome ? (
        <>
          {/* Monthly estimate summary card */}
          <section>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  Renda Mensal Estimada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700">
                  {formatBRL(monthlyEstimate)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {mesesDaMedia === 1 ? 'Média do último mês' : `Média dos últimos ${mesesDaMedia} meses`}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Income chart */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Renda Passiva por Mês</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeChart incomeData={incomeData} />
              </CardContent>
            </Card>
          </section>

          {/* Recent income events table */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>Últimos Recebimentos</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeEventTable events={recentEvents.map((e) => ({
                  ...e,
                  eventDate: e.eventDate instanceof Date ? e.eventDate.toISOString() : e.eventDate,
                }))} />
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
          <p className="text-gray-500 text-sm">Nenhuma renda passiva registrada.</p>
          <Button asChild variant="primary">
            <Link href="/investments/new">Registrar Dividendo</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
