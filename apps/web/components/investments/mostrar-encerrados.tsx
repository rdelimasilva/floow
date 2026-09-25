'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

/**
 * A carteira abre só com o que tem saldo. Vencidos e resgatados ficam a um
 * clique (`?encerrados=1`) — somem da vista, não do histórico.
 */
export function MostrarEncerrados({ quantidade, ativo }: { quantidade: number; ativo: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function alternar() {
    const params = new URLSearchParams(searchParams.toString())
    if (ativo) params.delete('encerrados')
    else params.set('encerrados', '1')
    const query = params.toString()
    startTransition(() => router.replace(query ? `/investments?${query}` : '/investments', { scroll: false }))
  }

  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={alternar}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {ativo ? 'Ocultar encerrados' : `Mostrar encerrados (${quantidade})`}
    </button>
  )
}
