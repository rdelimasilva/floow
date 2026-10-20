'use client'

import { X } from 'lucide-react'
import { PeriodFilter } from './period-filter'
import {
  PERIOD_GROUPS, PERIOD_LABELS, detectActivePeriod, getPeriodDates, type PeriodKey,
} from '@/lib/finance/filtros-lembrados'

interface CashFlowPeriodFilterProps {
  startDate: string
  endDate: string
  /** `key` vem preenchido quando a escolha foi um atalho. */
  onChange: (startDate: string, endDate: string, key: PeriodKey | null) => void
}

/** O mesmo filtro de período da tela de Transações: atalhos e datas à mão. */
export function CashFlowPeriodFilter({ startDate, endDate, onChange }: CashFlowPeriodFilterProps) {
  const active = detectActivePeriod(startDate, endDate)
  const custom = !active && Boolean(startDate || endDate)

  function escolher(key: PeriodKey | null) {
    const { startDate: s, endDate: e } = key ? getPeriodDates(key) : { startDate: '', endDate: '' }
    onChange(s, e, key)
  }

  const data = (valor: string, rotulo: string, mudar: (v: string) => void) => (
    <div className="flex min-w-0 flex-1 items-center gap-1 md:flex-none">
      <input
        type="date" min="1900-01-01" max="2100-12-31"
        aria-label={rotulo}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-base text-gray-600 md:h-8 md:flex-none md:px-3 md:text-xs"
      />
      {valor && (
        <button
          type="button"
          aria-label={`Limpar ${rotulo.toLowerCase()}`}
          title={`Limpar ${rotulo.toLowerCase()}`}
          onClick={() => mudar('')}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Celular: o seletor nativo abre a roleta do iPhone e cabe numa linha. */}
      <select
        aria-label="Período"
        value={active ?? (custom ? 'custom' : '')}
        onChange={(e) => escolher((e.target.value as PeriodKey) || null)}
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-700 md:hidden"
      >
        <option value="">Todo o período</option>
        {custom && <option value="custom" disabled>Datas personalizadas</option>}
        {PERIOD_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.keys.map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="hidden md:block">
        <PeriodFilter active={active} custom={custom} onChange={escolher} />
      </div>
      <div className="flex w-full items-center gap-2 md:contents">
        {data(startDate, 'Data inicial', (v) => onChange(v, endDate, null))}
        <span className="text-xs text-gray-400">até</span>
        {data(endDate, 'Data final', (v) => onChange(startDate, v, null))}
      </div>
    </div>
  )
}
