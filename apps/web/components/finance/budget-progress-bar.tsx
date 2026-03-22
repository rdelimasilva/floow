'use client'

import { formatBRL } from '@floow/core-finance'

interface BudgetProgressBarProps {
  label: string
  currentCents: number
  limitCents: number
  invertColors?: boolean // true for investing (green=high), false for spending (green=low)
}

export function BudgetProgressBar({ label, currentCents, limitCents, invertColors = false }: BudgetProgressBarProps) {
  const pct = limitCents > 0 ? Math.min((currentCents / limitCents) * 100, 100) : 0
  const overflowPct = limitCents > 0 ? (currentCents / limitCents) * 100 : 0

  let color: string
  if (invertColors) {
    color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  } else {
    color = pct < 70 ? 'bg-green-500' : pct < 90 ? 'bg-yellow-500' : 'bg-red-500'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {formatBRL(currentCents)} / {formatBRL(limitCents)}
          <span className="ml-1 text-xs">({Math.round(overflowPct)}%)</span>
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
