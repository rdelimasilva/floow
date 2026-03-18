import Link from 'next/link'
import { Button } from './button'

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
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500">
        Pagina {currentPage} de {totalPages}
      </p>
      <div className="flex gap-2">
        {currentPage > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildUrl(currentPage - 1)}>Anterior</Link>
          </Button>
        )}
        {currentPage < totalPages && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildUrl(currentPage + 1)}>Proxima</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
