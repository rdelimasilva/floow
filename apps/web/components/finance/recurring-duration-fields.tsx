'use client'

import { Input } from '@/components/ui/input'
import { currencyToCents, generateInstallmentDates, formatBRL } from '@floow/core-finance'
import type { RecurringFrequency } from '@floow/core-finance'

export type EndMode = 'count' | 'end_date' | 'indefinite'

interface RecurringDurationFieldsProps {
  endMode: EndMode
  onEndModeChange: (mode: EndMode) => void
  installmentCount: string
  onInstallmentCountChange: (value: string) => void
  endDate: string
  onEndDateChange: (value: string) => void
  // Usados só no resumo "Serão geradas N transações..."
  startDate: string
  frequency: string
  amount: string
}

// Controles de duração da recorrência — só existem na criação.
export function RecurringDurationFields({
  endMode,
  onEndModeChange,
  installmentCount,
  onInstallmentCountChange,
  endDate,
  onEndDateChange,
  startDate,
  frequency,
  amount,
}: RecurringDurationFieldsProps) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <label className="block text-sm font-medium text-gray-700">Duração</label>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endMode"
            value="count"
            checked={endMode === 'count'}
            onChange={() => onEndModeChange('count')}
            className="border-gray-300"
          />
          <span className="text-sm">Número de parcelas</span>
        </label>
        {endMode === 'count' && (
          <Input
            type="number"
            min={1}
            max={120}
            value={installmentCount}
            onChange={(e) => onInstallmentCountChange(e.target.value)}
            placeholder="Ex: 12"
            className="ml-6 w-32"
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endMode"
            value="end_date"
            checked={endMode === 'end_date'}
            onChange={() => onEndModeChange('end_date')}
            className="border-gray-300"
          />
          <span className="text-sm">Até uma data</span>
        </label>
        {endMode === 'end_date' && (
          <Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="ml-6 w-48"
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="endMode"
            value="indefinite"
            checked={endMode === 'indefinite'}
            onChange={() => onEndModeChange('indefinite')}
            className="border-gray-300"
          />
          <span className="text-sm">Sem fim (máx. 60 meses)</span>
        </label>
      </div>

      {(() => {
        if (!startDate) return null
        try {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          const cents = amount ? currencyToCents(amount) : 0
          const dates = generateInstallmentDates({
            startDate: start,
            frequency: frequency as RecurringFrequency,
            endMode,
            installmentCount: endMode === 'count' ? parseInt(installmentCount) || 1 : undefined,
            endDate: endMode === 'end_date' && endDate ? new Date(endDate) : undefined,
          })
          if (dates.length === 0) return null
          const first = dates[0].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
          const last = dates[dates.length - 1].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
          const amountStr = cents > 0 ? formatBRL(cents) : 'R$ 0,00'
          return (
            <p className="text-xs text-gray-500 bg-white rounded px-3 py-2 border border-gray-100">
              Serão geradas {dates.length} transações de {amountStr}, de {first} a {last}.
            </p>
          )
        } catch {
          return null
        }
      })()}
    </div>
  )
}
