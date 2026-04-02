'use client'

import { InsightCard } from '@/components/cfo/insight-card'
import { ChatPanel } from '@/components/cfo/chat-panel'
import type { CfoInsight, CfoRun } from '@floow/db'

type DateToString<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K]
}

interface CfoClientProps {
  insights: DateToString<CfoInsight>[]
  latestRun: DateToString<CfoRun> | null
}

export function CfoClient({ insights, latestRun }: CfoClientProps) {
  const critical = insights.filter((i) => i.severity === 'critical')
  const warning = insights.filter((i) => i.severity === 'warning')
  const info = insights.filter((i) => i.severity === 'info')
  const positive = insights.filter((i) => i.severity === 'positive')

  const lastUpdated = latestRun?.completedAt
    ? new Date(latestRun.completedAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-6">
      {/* Daily summary from LLM */}
      {latestRun?.dailySummary && (
        <div className="rounded-lg bg-muted/50 border p-4">
          <p className="text-sm italic text-foreground">{latestRun.dailySummary}</p>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          Última análise: {lastUpdated}
        </p>
      )}

      {insights.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhum insight no momento. Os insights são gerados diariamente com base nos seus dados financeiros.
        </div>
      )}

      {critical.length > 0 && (
        <InsightSection title="Crítico" insights={critical} />
      )}
      {warning.length > 0 && (
        <InsightSection title="Atenção" insights={warning} />
      )}
      {info.length > 0 && (
        <InsightSection title="Informativo" insights={info} />
      )}
      {positive.length > 0 && (
        <InsightSection title="Positivo" insights={positive} />
      )}

      {/* Chat Section */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Converse com seu Consultor
        </h3>
        <ChatPanel />
      </div>
    </div>
  )
}

function InsightSection({ title, insights }: { title: string; insights: DateToString<CfoInsight>[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title} ({insights.length})
      </h3>
      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  )
}
