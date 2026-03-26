'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, Loader2 } from 'lucide-react'
import type { ToolCall } from '@floow/core-finance'

const TOOL_LABELS: Record<string, string> = {
  create_budget: 'Criar orçamento',
  adjust_budget: 'Ajustar orçamento',
  view_transactions: 'Ver transações',
  view_account: 'Ver conta',
}

interface ToolCallCardProps {
  toolCall: ToolCall
  onConfirm: (toolCall: ToolCall) => void
}

export function ToolCallCard({ toolCall, onConfirm }: ToolCallCardProps) {
  const [status, setStatus] = useState<'pending' | 'loading' | 'done'>('pending')

  async function handleConfirm() {
    setStatus('loading')
    await onConfirm(toolCall)
    setStatus('done')
  }

  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name
  const paramsStr = Object.entries(toolCall.params)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  if (status === 'done') return null

  return (
    <Card className="border-dashed">
      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Ação sugerida</p>
        <p className="text-sm font-medium">{label}</p>
        {paramsStr && <p className="text-xs text-muted-foreground mt-0.5">{paramsStr}</p>}

        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="default" onClick={handleConfirm} disabled={status === 'loading'}>
            {status === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus('done')} disabled={status === 'loading'}>
            <X className="h-3 w-3 mr-1" />
            Não
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
