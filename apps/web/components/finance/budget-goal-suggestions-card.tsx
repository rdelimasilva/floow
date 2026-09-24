'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { BudgetGoalSuggestionRow } from '@/lib/finance/budget-goal-suggestion-queries'

interface Props {
  suggestions: BudgetGoalSuggestionRow[]
  onCreate: (categoryId: string, amountCents: number) => void
}

/** Categorias sem meta, com o valor que o histórico sugere. Some quando não há nenhuma. */
export function BudgetGoalSuggestionsCard({ suggestions, onCreate }: Props) {
  if (suggestions.length === 0) return null

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
              <p className="font-medium">{s.categoryName}</p>
              <p className="text-xs text-muted-foreground">
                Gasto típico {formatBRL(s.medianCents)}/mês · gastou em {s.monthsWithSpend} de {s.monthsConsidered} meses
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => onCreate(s.categoryId, s.suggestedCents)}>
              Criar meta de {formatBRL(s.suggestedCents)}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
