import { formatBRL } from '@floow/core-finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PortfolioSummaryRowProps {
  totalValueCents: number
  totalPnLCents: number
  totalDividendsCents: number
}

/**
 * PortfolioSummaryRow — renders three stat cards for the investment portfolio:
 *   - Valor Total (total current market value)
 *   - P&L Total (total unrealized PnL — green/red depending on sign)
 *   - Dividendos Totais (total dividends received)
 *
 * Follows the same layout pattern as QuickStatsRow in finance dashboard.
 */
export function PortfolioSummaryRow({
  totalValueCents,
  totalPnLCents,
  totalDividendsCents,
}: PortfolioSummaryRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Valor Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-gray-900">{formatBRL(totalValueCents)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">P&amp;L Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-xl font-bold ${totalPnLCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(totalPnLCents)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-500">Dividendos Totais</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold text-green-700">{formatBRL(totalDividendsCents)}</p>
        </CardContent>
      </Card>
    </div>
  )
}
