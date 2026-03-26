import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'
import { getTopInsights } from '@/lib/cfo/queries'
import { InsightCard } from './insight-card'

interface CfoDashboardStripProps {
  orgId: string
}

export async function CfoDashboardStrip({ orgId }: CfoDashboardStripProps) {
  const insights = await getTopInsights(orgId, 3)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Consultor Financeiro
        </h2>
        <Link
          href="/cfo"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ver tudo &rarr;
        </Link>
      </div>

      {insights.length === 0 ? (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-sm">Tudo sob controle hoje</p>
              <p className="text-sm text-muted-foreground">Nenhum alerta financeiro no momento.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} compact />
          ))}
        </div>
      )}
    </div>
  )
}
