import type React from 'react'
import Link from 'next/link'
import { Button } from './button'
import { PaginationJump } from './pagination-jump'

interface PaginationProps {
  currentPage: number
  totalPages: number
  baseUrl: string
  searchParams: Record<string, string>
}

export function Pagination({ currentPage, totalPages, baseUrl, searchParams }: PaginationProps) {
  if (totalPages <= 1) return null

  function buildUrl(page: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(page))
    return `${baseUrl}?${params.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-500">
        Página {currentPage} de {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* `key` reinicia o campo com a página nova a cada navegação */}
        <PaginationJump
          key={currentPage}
          currentPage={currentPage}
          totalPages={totalPages}
          hrefBase={buildUrl(currentPage)}
        />
        {/* Os quatro ficam sempre no lugar; sem destino, desativam. Sumir com
            "Próxima" na última página — onde a lista abre — parecia defeito. */}
        <NavButton href={buildUrl(1)} disabled={currentPage <= 1}>Primeira</NavButton>
        <NavButton href={buildUrl(currentPage - 1)} disabled={currentPage <= 1}>Anterior</NavButton>
        <NavButton href={buildUrl(currentPage + 1)} disabled={currentPage >= totalPages}>Próxima</NavButton>
        <NavButton href={buildUrl(totalPages)} disabled={currentPage >= totalPages}>Última</NavButton>
      </div>
    </div>
  )
}

function NavButton({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <Button variant="outline" size="sm" disabled>{children}</Button>
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  )
}
