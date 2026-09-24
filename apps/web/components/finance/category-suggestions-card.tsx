'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance/src/balance'
import {
  acceptCategorySuggestion,
  analyzeCategorySuggestions,
  dismissCategorySuggestion,
} from '@/lib/finance/category-suggestion-actions'
import type { PendingSuggestion } from '@/lib/finance/category-suggestion-queries'
import type { AcceptResult } from '@/lib/finance/category-suggestions/accept'
import { AcceptSuggestionDialog } from './accept-suggestion-dialog'

interface Props {
  suggestions: PendingSuggestion[]
  parentOptions: { id: string; name: string }[]
  onAccepted: (result: AcceptResult) => void
}

export function CategorySuggestionsCard({ suggestions, parentOptions, onAccepted }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [accepting, setAccepting] = useState<PendingSuggestion | null>(null)
  const parentName = (id: string | null) => parentOptions.find((p) => p.id === id)?.name

  async function analisar() {
    setBusy(true)
    try {
      const r = await analyzeCategorySuggestions()
      toast(r.pending > 0 ? `${r.pending} sugestão(ões) encontrada(s)` : 'Nenhuma sugestão nova')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao analisar', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function recusar(id: string) {
    setBusy(true)
    try {
      await dismissCategorySuggestion(id)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao recusar', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmar(name: string, parentCategoryId: string | null) {
    if (!accepting) return
    setBusy(true)
    try {
      const r = await acceptCategorySuggestion({ suggestionId: accepting.id, name, parentCategoryId })
      toast(`Categoria "${r.name}" criada · ${r.moved} lançamento(s) movido(s)`)
      setAccepting(null)
      onAccepted(r)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao criar categoria', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Sugestões de categoria</CardTitle>
        <Button variant="ghost" size="sm" onClick={analisar} disabled={busy}>Analisar meus gastos</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão no momento.</p>
        )}
        {suggestions.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <p className="font-medium">{s.suggestedName}</p>
              <p className="text-xs text-muted-foreground">
                {s.txCount} lançamentos · {formatBRL(s.totalCents)} em 12 meses · ~{formatBRL(s.monthlyAvgCents)}/mês
                {s.kind === 'split' && parentName(s.parentCategoryId) ? ` · dentro de ${parentName(s.parentCategoryId)}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => recusar(s.id)} disabled={busy}>Recusar</Button>
              <Button variant="primary" size="sm" onClick={() => setAccepting(s)} disabled={busy}>Aceitar</Button>
            </div>
          </div>
        ))}
      </CardContent>
      <AcceptSuggestionDialog
        suggestion={accepting}
        parentOptions={parentOptions}
        loading={busy}
        onClose={() => setAccepting(null)}
        onConfirm={confirmar}
      />
    </Card>
  )
}
