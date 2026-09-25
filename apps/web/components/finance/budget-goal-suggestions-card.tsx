'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { useToast } from '@/components/ui/toast'
import { formatBRL } from '@floow/core-finance/src/balance'
import { dismissBudgetGoalSuggestion } from '@/lib/finance/budget-goal-suggestion-actions'
import type { BudgetGoalSuggestionRow } from '@/lib/finance/budget-goal-suggestion-queries'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'

interface Props {
  suggestions: BudgetGoalSuggestionRow[]
  onCreate: (categoryId: string, amountCents: number) => void
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function mesCurto(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return `${MESES[m - 1]}/${y}`
}

/** O critério da sugestão, com os números daquela categoria. */
export function explicacaoDaSugestao(s: BudgetGoalSuggestionRow): string {
  return (
    `Somamos o gasto em ${s.categoryName} (com as subcategorias) em cada mês fechado, ` +
    `de ${mesCurto(s.firstMonth)} a ${mesCurto(s.lastMonth)} (${s.monthsConsidered} meses). ` +
    `O valor do meio dessa lista (mediana) é ${formatBRL(s.medianCents)}; arredondado para cima, ` +
    `${formatBRL(s.suggestedCents)}. A mediana ignora um mês fora da curva, como uma compra grande isolada. ` +
    `Só sugerimos para categoria sem meta e com gasto na maior parte dos meses — aqui, ` +
    `${s.monthsWithSpend} de ${s.monthsConsidered}.`
  )
}

/** Categorias sem meta, com o valor que o histórico sugere. Some quando não há nenhuma. */
export function BudgetGoalSuggestionsCard({ suggestions, onCreate }: Props) {
  const { toast } = useToast()
  const [descartando, setDescartando] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  async function descartar(categoryId: string) {
    setDescartando(categoryId)
    try {
      await dismissBudgetGoalSuggestion(categoryId)
    } catch (err) {
      toast(mensagemDeErro(err, 'Erro ao descartar'), 'error')
    } finally {
      setDescartando(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sugestões de meta</CardTitle>
        <p className="text-xs text-muted-foreground">
          Categorias sem meta, com o gasto típico por mês (mediana dos meses fechados).
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.categoryId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-medium">
                {s.categoryName}
                <HelpTooltip text={explicacaoDaSugestao(s)} />
              </p>
              <p className="text-xs text-muted-foreground">
                Gasto típico {formatBRL(s.medianCents)}/mês · gastou em {s.monthsWithSpend} de {s.monthsConsidered} meses
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => descartar(s.categoryId)} disabled={descartando !== null}>
                Descartar
              </Button>
              <Button variant="primary" size="sm" onClick={() => onCreate(s.categoryId, s.suggestedCents)}>
                Criar meta de {formatBRL(s.suggestedCents)}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
