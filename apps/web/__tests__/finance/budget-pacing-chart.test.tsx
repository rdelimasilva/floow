import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { BudgetPacingResult } from '@floow/core-finance'

// recharts de verdade: o bug era o gráfico ignorar a linha. Só o
// ResponsiveContainer vira tamanho fixo, porque no jsdom ele mede 0×0.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 300 } as Record<string, unknown>),
  }
})

import { BudgetPacingChart } from '@/components/finance/budget-pacing-chart'

function resultadoDoDia18(): BudgetPacingResult {
  const daysInMonth = 31
  const series = Array.from({ length: daysInMonth }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    byAccountTypeCum: {
      checking: (i + 1) * 1000,
      savings: 0,
      brokerage: 0,
      credit_card: (i + 1) * 2000,
      cash: 0,
    },
    budgetedCum: (i + 1) * 3000,
    unbudgetedCum: 0,
  }))
  return {
    series,
    total: {
      plannedCents: 150_000,
      spentCents: 54_000,
      unbudgetedCents: 0,
      committedCents: 0,
      projectedCents: 93_000,
      confidence: 'normal',
      daysElapsed: 18,
      daysInMonth,
    },
    byCategory: [],
  }
}

describe('BudgetPacingChart', () => {
  it('desenha a linha de projeção que a legenda anuncia', () => {
    const { container } = render(<BudgetPacingChart result={resultadoDoDia18()} />)

    const linha = container.querySelector('.recharts-line-curve')
    expect(linha).not.toBeNull()
    expect(linha?.getAttribute('stroke-dasharray')).toBe('5 5')
    expect(linha?.getAttribute('d')).toBeTruthy()
  })
})
