/**
 * Decide quais categorias merecem e-mail de ritmo de gasto hoje.
 *
 * Função pura. A regra de "o que é alerta" é a mesma do analyzer de insights
 * (analyzeBudgetPacing): `estourado` sempre, `risco` só com projeção confiável.
 * O que ela acrescenta é memória: só avisa quando o status PIORA em relação ao
 * último e-mail do mês. Sem isso, uma categoria estourada no dia 10 geraria o
 * mesmo e-mail por 20 dias seguidos, e o usuário aprenderia a ignorá-lo.
 */
import type { BudgetPacingResult, PacingStatus } from '@floow/core-finance'

export type AlertStatus = Extract<PacingStatus, 'risco' | 'estourado'>

const RANK: Record<PacingStatus, number> = { ok: 0, atencao: 1, risco: 2, estourado: 3 }

export interface PacingAlert {
  categoryId: string
  status: AlertStatus
  plannedCents: number
  spentCents: number
  projectedCents: number
}

/**
 * @param lastSent categoryId -> último status enviado por e-mail neste mês.
 */
export function selectPacingAlerts(
  pacing: BudgetPacingResult,
  lastSent: Record<string, PacingStatus>,
): PacingAlert[] {
  const { total, byCategory } = pacing
  if (total.daysElapsed === 0) return []

  const alerts: PacingAlert[] = []
  for (const cat of byCategory) {
    const alertable =
      cat.status === 'estourado' || (cat.status === 'risco' && total.confidence === 'normal')
    if (!alertable) continue

    const previous = lastSent[cat.categoryId]
    if (previous && RANK[previous] >= RANK[cat.status]) continue

    alerts.push({
      categoryId: cat.categoryId,
      status: cat.status as AlertStatus,
      plannedCents: cat.plannedCents,
      spentCents: cat.spentCents,
      projectedCents: cat.projectedCents,
    })
  }
  return alerts
}
