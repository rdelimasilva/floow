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
        {currentPage > 1 && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl(1)}>Primeira</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl(currentPage - 1)}>Anterior</Link>
            </Button>
          </>
        )}
        {currentPage < totalPages && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl(currentPage + 1)}>Próxima</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={buildUrl(totalPages)}>Última</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
