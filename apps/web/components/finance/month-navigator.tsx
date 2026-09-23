'use client'

import { useOptimistic, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Soma `delta` meses a um mês no formato YYYY-MM-01. */
export function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Navegação de mês otimista: o mês mostrado muda no clique, antes do servidor
 * responder, e cliques seguidos se acumulam em vez de repetirem o mesmo destino.
 * `isPending` fica true até os dados do mês novo chegarem.
 */
export function useMonthNavigation(selectedMonth: string, basePath: string) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [month, setMonth] = useOptimistic(selectedMonth)

  function shift(delta: number) {
    const next = shiftMonth(month, delta)
    startTransition(() => {
      setMonth(next)
      router.push(`${basePath}?month=${next}`, { scroll: false })
    })
  }

  return { month, shift, isPending }
}

/**
 * Esmaece o conteúdo da página, exceto o seletor, enquanto o mês novo carrega.
 * Vai no container cujos filhos diretos incluem o MonthNavigator.
 */
export function pendingDimClass(isPending: boolean): string {
  return isPending
    ? '[&>*:not([data-month-nav])]:opacity-50 [&>*]:transition-opacity'
    : '[&>*]:transition-opacity'
}

interface Props {
  label: string
  onShift: (delta: number) => void
  /** Informação extra ao lado do seletor (ex.: "dia 12 de 30"). */
  children?: ReactNode
}

export function MonthNavigator({ label, onShift, children }: Props) {
  return (
    <div data-month-nav className="flex items-center gap-2">
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
