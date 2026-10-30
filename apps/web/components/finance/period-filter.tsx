'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { PERIOD_LABELS, PERIOD_GROUPS, type PeriodKey } from '@/lib/finance/filtros-lembrados'

interface PeriodFilterProps {
  active: PeriodKey | null
  /** Há data escolhida à mão, que não bate com nenhum atalho. */
  custom: boolean
  onChange: (key: PeriodKey | null) => void
}

/**
 * Atalhos de período num só botão.
 *
 * Eram onze pílulas soltas numa linha: quebravam em duas e empurravam
 * "Lançamentos futuros" sozinho para a linha de baixo. Agora o botão diz o
 * período que está valendo e abre os atalhos nos três grupos. Clicar no atalho
 * marcado o solta, como nas outras pílulas do filtro.
 */
export function PeriodFilter({ active, custom, onChange }: PeriodFilterProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    function esc(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function escolher(key: PeriodKey | null) {
    onChange(key)
    setOpen(false)
  }

  const filtrado = active !== null || custom
  const rotulo = active ? PERIOD_LABELS[active] : custom ? 'Personalizado' : 'Todo o período'

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs ${
          filtrado ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'
        }`}
      >
        <span className={filtrado ? 'text-gray-300' : 'text-gray-500'}>Período:</span>
        {rotulo}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-[34rem] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            onClick={() => escolher(null)}
            disabled={!filtrado}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
          >
            {!filtrado && <Check className="h-3.5 w-3.5 text-gray-900" />}
            Todo o período
          </button>
          <div className="my-1 h-px bg-gray-100" />
          <div className="grid grid-cols-3 gap-2">
            {PERIOD_GROUPS.map((group) => (
              <div key={group.label} role="group" aria-label={group.label} className="min-w-0">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  {group.label}
                </p>
                {group.keys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active === key}
                    onClick={() => escolher(active === key ? null : key)}
                    title={active === key ? 'Clique para remover este período' : undefined}
                    className={`flex w-full items-center justify-between whitespace-nowrap rounded px-2 py-1.5 text-left text-sm ${
                      active === key ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {PERIOD_LABELS[key]}
                    {active === key && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
