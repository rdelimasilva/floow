import { getOrgId } from '@/lib/finance/queries'
import { getIncomeEvents } from '@/lib/investments/queries'
import { aggregateIncome, estimateMonthlyIncome, formatBRL } from '@floow/core-finance'
import { IncomeChart } from '@/components/investments/income-chart'
import { IncomeEventTable } from '@/components/investments/income-event-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

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

  const incomeData = aggregateIncome(events)
  const monthlyEstimate = estimateMonthlyIncome(events, 12)

  const hasIncome = events.length > 0

  // Recent events for table — last 10, already ordered desc from getIncomeEvents
  const recentEvents = events.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Renda Passiva
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Dividendos, juros e amortizações dos seus investimentos
        </p>
      </div>

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
                <p className="text-xs text-gray-400 mt-1">
                  Média dos últimos 12 meses
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
                <IncomeEventTable events={recentEvents} />
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
          <p className="text-gray-500 text-sm">Nenhuma renda passiva registrada.</p>
          <Link
            href="/investments/new"
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Registrar Dividendo
          </Link>
        </div>
      )}
    </div>
  )
}
