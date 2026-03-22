'use client'

import { useState } from 'react'

type PeriodKey = 'today' | 'month' | 'quarter' | 'semester' | 'year' | 'last3' | 'last6' | 'last12'

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  month: 'Este mês',
  quarter: 'Este trimestre',
  semester: 'Este semestre',
  year: 'Este ano',
  last3: 'Últimos 3m',
  last6: 'Últimos 6m',
  last12: 'Últimos 12m',
}

function getPeriodDates(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const endToday = fmt(now)

  switch (key) {
    case 'today':
      return { startDate: endToday, endDate: endToday }
    case 'month':
      return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return { startDate: fmt(new Date(y, q * 3, 1)), endDate: fmt(new Date(y, q * 3 + 3, 0)) }
    }
    case 'semester': {
      const s = m < 6 ? 0 : 1
      return { startDate: fmt(new Date(y, s * 6, 1)), endDate: fmt(new Date(y, s * 6 + 6, 0)) }
    }
    case 'year':
      return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(new Date(y, 11, 31)) }
    case 'last3': {
      const d = new Date(y, m - 3, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
    case 'last6': {
      const d = new Date(y, m - 6, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
    case 'last12': {
      const d = new Date(y, m - 12, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
  }
}

interface CashFlowPeriodFilterProps {
  activePeriod: PeriodKey
  onChange: (period: PeriodKey, startDate: string, endDate: string) => void
}

export type { PeriodKey }
export { getPeriodDates }

export function CashFlowPeriodFilter({ activePeriod, onChange }: CashFlowPeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            const { startDate, endDate } = getPeriodDates(key)
            onChange(key, startDate, endDate)
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activePeriod === key
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  )
}
