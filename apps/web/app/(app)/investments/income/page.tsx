import { getOrgId } from '@/lib/finance/queries'
import { getIncomeEvents } from '@/lib/investments/queries'
import { aggregateIncome, estimateMonthlyIncome } from '@floow/core-finance/src/income'
import { formatBRL } from '@floow/core-finance/src/balance'
import { IncomeChart } from '@/components/investments/income-chart'
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
          Dividendos, juros e amortizacoes dos seus investimentos
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
                  Media dos ultimos 12 meses
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Income chart */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>Historico de Renda Passiva por Mes</CardTitle>
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
                <CardTitle>Ultimos Recebimentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 font-medium">Ativo</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data</th>
                        <th className="pb-2 font-medium text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEvents.map((event) => (
                        <tr key={event.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{event.ticker}</td>
                          <td className="py-2 text-gray-600 capitalize">{event.eventType}</td>
                          <td className="py-2 text-gray-600">
                            {new Date(event.eventDate).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2 text-right text-green-700 font-medium">
                            {formatBRL(event.totalCents ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
