'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, X, AlertTriangle, AlertCircle, Info, CheckCircle2, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dismissInsight, markInsightActedOn } from '@/lib/cfo/actions'
import { ChatPanel } from './chat-panel'
import type { CfoInsight } from '@floow/db'

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    border: 'border-l-4 border-l-red-500',
    badge: 'bg-red-100 text-red-700',
    label: 'Crítico',
  },
  warning: {
    icon: AlertCircle,
    border: 'border-l-4 border-l-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700',
    label: 'Atenção',
  },
  info: {
    icon: Info,
    border: 'border-l-4 border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    label: 'Info',
  },
  positive: {
    icon: CheckCircle2,
    border: 'border-l-4 border-l-green-500',
    badge: 'bg-green-100 text-green-700',
    label: 'Positivo',
  },
} as const

const ACTION_ROUTES: Record<string, (params: Record<string, unknown>) => string> = {
  view_transactions: (p) => `/transactions${p.period ? `?period=${p.period}` : ''}${p.category ? `&category=${p.category}` : ''}`,
  view_account: (p) => `/accounts/${p.accountId}`,
  view_debts: () => '/debts',
  view_investments: () => '/investments',
  view_planning: () => '/planning',
  create_budget: () => '/budgets/spending',
  adjust_budget: (p) => `/budgets/spending${p.category ? `?highlight=${p.category}` : ''}`,
}

interface InsightCardProps {
  insight: CfoInsight
  compact?: boolean
}

export function InsightCard({ insight, compact = false }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const router = useRouter()

  const config = SEVERITY_CONFIG[insight.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
  const Icon = config.icon

  if (dismissed) return null

  async function handleDismiss() {
    setDismissed(true)
    await dismissInsight(insight.id)
  }

  async function handleAction() {
    if (insight.suggestedActionType) {
      await markInsightActedOn(insight.id)
      const routeFn = ACTION_ROUTES[insight.suggestedActionType]
      if (routeFn) {
        const params = (insight.suggestedActionParams ?? {}) as Record<string, unknown>
        router.push(routeFn(params))
      }
    }
  }

  return (
    <Card className={cn(config.border, 'transition-all')}>
      <CardContent className={cn('pt-4', compact ? 'pb-3' : 'pb-4')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium text-sm leading-tight">{insight.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{insight.body}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!compact && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                aria-label={expanded ? 'Recolher' : 'Expandir'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              aria-label="Descartar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {expanded && insight.detailMarkdown && (
          <div className="mt-3 pt-3 border-t text-sm text-muted-foreground whitespace-pre-line">
            {insight.detailMarkdown}
          </div>
        )}

        {!compact && insight.suggestedActionType && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={handleAction}>
              {getActionLabel(insight.suggestedActionType)}
            </Button>
          </div>
        )}

        {!compact && (
          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => setChatOpen(!chatOpen)}>
              <MessageCircle className="h-3 w-3 mr-1" />
              {chatOpen ? 'Fechar chat' : 'Conversar'}
            </Button>
          </div>
        )}

        {compact && insight.suggestedActionType && (
          <Button
            size="sm"
            variant="link"
            className="mt-1 h-auto p-0 text-xs"
            onClick={handleAction}
          >
            {getActionLabel(insight.suggestedActionType)} &rarr;
          </Button>
        )}

        {compact && (
          <Button
            size="sm"
            variant="link"
            className="mt-1 h-auto p-0 text-xs"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageCircle className="h-3 w-3 mr-1" />
            {chatOpen ? 'Fechar' : 'Conversar'}
          </Button>
        )}

        {chatOpen && (
          <ChatPanel insightId={insight.id} className="mt-3 pt-3 border-t" />
        )}
      </CardContent>
    </Card>
  )
}

function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    view_transactions: 'Ver transações',
    view_account: 'Ver conta',
    view_debts: 'Ver dívidas',
    view_investments: 'Ver investimentos',
    view_planning: 'Ver planejamento',
    create_budget: 'Criar orçamento',
    adjust_budget: 'Ajustar orçamento',
  }
  return labels[actionType] ?? 'Ver detalhes'
}
