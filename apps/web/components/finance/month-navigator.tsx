'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  /** Mês no formato "YYYY-MM". */
  month: string
  onShift: (delta: number) => void
  /** Informação extra ao lado do seletor (ex.: "dia 12 de 30"). */
  children?: ReactNode
}

/** "2026-09" → "Setembro 2026" */
function formatLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

export function MonthNavigator({ month, onShift, children }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onShift(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-44 text-center text-sm font-medium">{formatLabel(month)}</span>
      <Button variant="outline" size="icon" onClick={() => onShift(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {children}
    </div>
  )
}
