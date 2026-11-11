'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { MonthNavigator } from '../month-navigator'
import { PeriodFilter } from '../period-filter'
import {
  PERIOD_GROUPS, PERIOD_LABELS, detectActivePeriod, getPeriodDates, mesDoRecorte, mesInteiro,
  type PeriodKey,
} from '@/lib/finance/filtros-lembrados'

interface Props {
  /** `mes`: só as setas, sempre com o mês inteiro. `intervalo`: atalhos, setas e datas. */
  modo: 'intervalo' | 'mes'
  startDate: string
  endDate: string
  /** `atalho` vem preenchido quando a escolha foi um atalho de período. */
  aoMudar: (p: { startDate: string; endDate: string }, atalho: PeriodKey | null) => void
  /** Celular: botão ao lado do seletor nativo (ex.: o "Filtros" de Transações). */
  acaoNoCelular?: ReactNode
  /** Celular: as datas ficam recolhidas até quem usa abrir. No desktop sempre aparecem. */
  datasNoCelular?: boolean
  /** Modo `mes`: informação ao lado das setas. */
  children?: ReactNode
}

/** O mesmo controle de período para todas as telas; só muda o quanto dele aparece. */
export function SeletorDePeriodo({
  modo, startDate, endDate, aoMudar, acaoNoCelular, datasNoCelular = true, children,
}: Props) {
  const mes = mesDoRecorte(startDate, endDate)
  const andar = (delta: number) => aoMudar(mesInteiro(mes, delta), null)

  if (modo === 'mes') return <MonthNavigator month={mes} onShift={andar}>{children}</MonthNavigator>

  const active = detectActivePeriod(startDate, endDate)
  const custom = !active && Boolean(startDate || endDate)

  function escolher(key: PeriodKey | null) {
    aoMudar(key ? getPeriodDates(key) : { startDate: '', endDate: '' }, key)
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
          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    // `contents` no desktop: os campos entram na linha de filtros de quem usa.
    <div className="flex w-full flex-col gap-2 md:contents">
      {/* Celular: o seletor nativo abre a roleta do iPhone e cabe numa linha. */}
      <div className="flex items-center gap-2 md:hidden">
        <select
          aria-label="Período"
          value={active ?? (custom ? 'custom' : '')}
          onChange={(e) => escolher((e.target.value as PeriodKey) || null)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-base text-gray-700"
        >
          <option value="">Todo o período</option>
          {custom && <option value="custom" disabled>Datas personalizadas</option>}
          {PERIOD_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.keys.map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
            </optgroup>
          ))}
        </select>
        {acaoNoCelular}
      </div>
      <div className="hidden md:block">
        <PeriodFilter active={active} custom={custom} onChange={escolher} />
      </div>
      <div className="flex justify-center md:block">
        <MonthNavigator month={mes} onShift={andar} />
      </div>
      <div className={datasNoCelular ? 'flex w-full items-center gap-2 md:contents' : 'hidden md:contents'}>
        {data(startDate, 'Data inicial', (v) => aoMudar({ startDate: v, endDate }, null))}
        <span className="text-xs text-gray-500">até</span>
        {data(endDate, 'Data final', (v) => aoMudar({ startDate, endDate: v }, null))}
      </div>
    </div>
  )
}
