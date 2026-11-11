'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { PILULA_BASE, PILULA_OFF, PILULA_ON } from '@/components/finance/filtros/pilula'

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
      className={`${PILULA_BASE} ${ativo ? PILULA_ON : PILULA_OFF}`}
    >
      {ativo ? 'Ocultar encerrados' : `Mostrar encerrados (${quantidade})`}
    </button>
  )
}
