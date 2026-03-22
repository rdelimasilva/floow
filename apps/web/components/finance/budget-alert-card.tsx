import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@floow/core-finance'

interface AlertItem {
  name: string
  currentCents: number
  limitCents: number
  href: string
}

interface BudgetAlertCardProps {
  alerts: AlertItem[]
}

export function BudgetAlertCard({ alerts }: BudgetAlertCardProps) {
  if (alerts.length === 0) return null

  return (
    <Card className="border-yellow-200 bg-yellow-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-4 w-4" />
          Metas em Risco
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => {
            const pct = alert.limitCents > 0 ? Math.round((alert.currentCents / alert.limitCents) * 100) : 0
            return (
              <Link
                key={alert.name}
                href={alert.href}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-yellow-100 transition-colors"
              >
                <span className="font-medium text-gray-800">{alert.name}</span>
                <span className="text-yellow-700">
                  {formatBRL(alert.currentCents)} de {formatBRL(alert.limitCents)} — {pct}%
                </span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
