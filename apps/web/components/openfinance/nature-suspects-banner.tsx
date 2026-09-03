'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@floow/core-finance'
import type { SuspectGroup } from '@/lib/openfinance/nature-suspects'
import { NatureReviewPanel } from './nature-review-panel'

/**
 * O total em reais no banner é o ponto: "2 grupos para revisar" não move
 * ninguém, "R$ 231.640 de despesa que pode não ser gasto" move.
 */
export function NatureSuspectsBanner({ groups }: { groups: SuspectGroup[] }) {
  const [open, setOpen] = useState(false)
  if (groups.length === 0) return null

  // Módulo: a soma vem negativa (são despesas), e "R$ -231.640 de despesa"
  // faz o leitor parar para interpretar um sinal que não acrescenta nada.
  const total = Math.abs(groups.reduce((sum, group) => sum + group.totalCents, 0))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          <strong>{formatBRL(total)}</strong> em {groups.length}{' '}
          {groups.length === 1 ? 'grupo' : 'grupos'} de despesa que pode não ser gasto
        </span>
        <span className="ml-auto shrink-0 font-medium underline">revisar</span>
      </button>

      <NatureReviewPanel open={open} onClose={() => setOpen(false)} groups={groups} />
    </>
  )
}
