'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PaginationJumpProps {
  currentPage: number
  totalPages: number
  /** URL da página N, com os filtros atuais — montada pelo `Pagination`. */
  hrefBase: string
}

/** "Ir para [ n ] de N": número fora da faixa encosta no limite. */
export function PaginationJump({ currentPage, totalPages, hrefBase }: PaginationJumpProps) {
  const router = useRouter()
  const [value, setValue] = useState(String(currentPage))
  // A lista mostra a paginação em cima e embaixo: id fixo duplicaria.
  const inputId = useId()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseInt(value, 10)
    if (isNaN(n)) return
    const page = Math.min(Math.max(n, 1), totalPages)
    setValue(String(page))
    if (page === currentPage) return
    const url = new URL(hrefBase, 'http://x')
    url.searchParams.set('page', String(page))
    router.push(`${url.pathname}?${url.searchParams.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 text-sm text-gray-500">
      <label htmlFor={inputId} className="whitespace-nowrap">Ir para</label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ir para a página"
        className="h-8 w-16 rounded-md border border-gray-300 px-2 text-sm text-gray-700"
      />
      <span className="whitespace-nowrap">de {totalPages}</span>
      <button
        type="submit"
        className="h-8 rounded-md border border-gray-300 px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Ir
      </button>
    </form>
  )
}
