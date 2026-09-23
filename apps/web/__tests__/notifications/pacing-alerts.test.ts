import { describe, it, expect } from 'vitest'
import { selectPacingAlerts } from '@/lib/notifications/pacing-alerts'
import type { BudgetPacingResult, PacingStatus, Confidence } from '@floow/core-finance'

function pacing(
  cats: Array<{ id: string; status: PacingStatus }>,
  confidence: Confidence = 'normal',
  daysElapsed = 15,
): BudgetPacingResult {
  return {
    series: [],
    total: {
      plannedCents: 100_000,
      spentCents: 50_000,
      unbudgetedCents: 0,
      projectedCents: 100_000,
      confidence,
      daysElapsed,
      daysInMonth: 30,
    },
    byCategory: cats.map((c) => ({
      categoryId: c.id,
      plannedCents: 10_000,
      spentCents: 8_000,
      projectedCents: 16_000,
      status: c.status,
    })),
  }
}

describe('selectPacingAlerts', () => {
  it('não alerta categoria ok ou em atenção', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'ok' }, { id: 'b', status: 'atencao' }]), {})
    expect(r).toEqual([])
  })

  it('alerta estourado e risco quando nada foi enviado no mês', () => {
    const r = selectPacingAlerts(
      pacing([{ id: 'a', status: 'estourado' }, { id: 'b', status: 'risco' }]),
      {},
    )
    expect(r.map((x) => [x.categoryId, x.status])).toEqual([
      ['a', 'estourado'],
      ['b', 'risco'],
    ])
  })

  it('risco com projeção de baixa confiança não alerta (mesma regra do insight)', () => {
    const r = selectPacingAlerts(pacing([{ id: 'b', status: 'risco' }], 'low'), {})
    expect(r).toEqual([])
  })

  it('estourado alerta mesmo com baixa confiança — é fato, não previsão', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'estourado' }], 'low'), {})
    expect(r).toHaveLength(1)
  })

  it('não repete o alerta de um status já enviado', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'risco' }]), { a: 'risco' })
    expect(r).toEqual([])
  })

  it('alerta de novo quando o status piora de risco para estourado', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'estourado' }]), { a: 'risco' })
    expect(r.map((x) => x.status)).toEqual(['estourado'])
  })

  it('melhora não gera alerta', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'risco' }]), { a: 'estourado' })
    expect(r).toEqual([])
  })

  it('mês sem dia decorrido não gera nada', () => {
    const r = selectPacingAlerts(pacing([{ id: 'a', status: 'estourado' }], 'normal', 0), {})
    expect(r).toEqual([])
  })
})
