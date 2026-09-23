'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  label: string
  onShift: (delta: number) => void
  /** Informação extra ao lado do seletor (ex.: "dia 12 de 30"). */
  children?: ReactNode
}

export function MonthNavigator({ label, onShift, children }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onShift(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-44 text-center text-sm font-medium capitalize">{label}</span>
      <Button variant="outline" size="icon" onClick={() => onShift(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {children}
    </div>
  )
}
