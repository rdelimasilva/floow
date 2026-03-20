import { Suspense } from 'react'
import { getOrgId, getRecentTransactions } from '@/lib/finance/queries'
import { aggregateCashFlow, formatBRL } from '@floow/core-finance'
import { CashFlowChart } from '@/components/finance/cash-flow-chart'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function CashFlowContent({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 12)
  const cashFlowData = aggregateCashFlow(recentTransactions)

  // Current month stats
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentData = cashFlowData.find((d) => d.month === currentMonth)
  const totalIncome = cashFlowData.reduce((sum, d) => sum + d.income, 0)
  const totalExpense = cashFlowData.reduce((sum, d) => sum + Math.abs(d.expense), 0)
  const avgMonthlyNet = cashFlowData.length > 0
    ? cashFlowData.reduce((sum, d) => sum + d.net, 0) / cashFlowData.length
    : 0

  // Sort ascending for chart display
  const chartData = [...cashFlowData].reverse()

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas (mês atual)</p>
          <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(currentData?.income ?? 0)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas (mês atual)</p>
          <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(Math.abs(currentData?.expense ?? 0))}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo (mês atual)</p>
          <p className={`mt-2 text-xl font-bold ${(currentData?.net ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(currentData?.net ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Média Mensal (12m)</p>
          <p className={`mt-2 text-xl font-bold ${avgMonthlyNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(Math.round(avgMonthlyNet))}
          </p>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo de Caixa — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nenhuma transação encontrada. Importe ou registre transações para ver o fluxo de caixa.
            </div>
          ) : (
            <CashFlowChart data={chartData} />
          )}
        </CardContent>
      </Card>

      {/* Monthly breakdown table */}
      {cashFlowData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detalhamento Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Mês</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cashFlowData.map((d) => {
                    const [year, month] = d.month.split('-')
                    const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                    return (
                      <tr key={d.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-600 capitalize">{label}</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-green-700">{formatBRL(d.income)}</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-red-600">{formatBRL(Math.abs(d.expense))}</td>
                        <td className={`px-4 py-2 text-right text-sm font-bold ${d.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {formatBRL(d.net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Total</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-green-700">{formatBRL(totalIncome)}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-red-600">{formatBRL(totalExpense)}</td>
                    <td className={`px-4 py-2 text-right text-sm font-bold ${totalIncome - totalExpense >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatBRL(totalIncome - totalExpense)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
}

export default async function CashFlowPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Receitas, despesas e saldo mensal dos últimos 12 meses"
      />

      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /><SectionSkeleton /></>}>
        <CashFlowContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
