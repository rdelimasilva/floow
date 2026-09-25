'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { FinalDoCartao } from '@/lib/finance/queries-final-do-cartao'

interface CardDigitsFilterProps {
  options: FinalDoCartao[]
  selected: string[]
  onChange: (digits: string[]) => void
}

function rotulo(selected: string[]): string {
  if (selected.length === 0) return 'Todos os finais'
  if (selected.length === 1) return `Final ${selected[0]}`
  return `${selected.length} finais`
}

/**
 * Filtro por final do cartão: titular, adicional e virtual na mesma fatura.
 *
 * Mesma mecânica do `AccountFilter` — lista de caixas, a marcada se desmarca
 * no clique. A contagem ao lado ajuda a reconhecer o cartão físico (o final
 * com mais compras) no meio dos virtuais de uma compra só.
 */
export function CardDigitsFilter({ options, selected, onChange }: CardDigitsFilterProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(digits: string) {
    onChange(selected.includes(digits) ? selected.filter((v) => v !== digits) : [...selected, digits])
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs ${
          selected.length > 0
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 bg-white text-gray-600'
        }`}
      >
        {rotulo(selected)}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
          >
            {selected.length === 0 && <Check className="h-3.5 w-3.5 text-gray-900" />}
            Todos os finais
          </button>
          <div className="my-1 h-px bg-gray-100" />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.map((opcao) => (
              <label
                key={opcao.digits}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opcao.digits)}
                  onChange={() => toggle(opcao.digits)}
                  className="rounded border-gray-300"
                />
                <span className="font-mono">•{opcao.digits}</span>
                <span className="ml-auto text-xs text-gray-400">{opcao.total}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
