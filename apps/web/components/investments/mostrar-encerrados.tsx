'use client'

import { useFiltrosNaUrl } from '@/components/finance/filtros/use-filtros-na-url'
import { PILULA_BASE, PILULA_OFF, PILULA_ON } from '@/components/finance/filtros/pilula'

/**
 * A carteira abre só com o que tem saldo. Vencidos e resgatados ficam a um
 * clique (`?encerrados=1`) — somem da vista, não do histórico.
 */
export function MostrarEncerrados({ quantidade, ativo }: { quantidade: number; ativo: boolean }) {
  const { trocar } = useFiltrosNaUrl('/investments', { gravaRecorte: false })

  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={() => trocar({ encerrados: ativo ? '' : '1' })}
      className={`${PILULA_BASE} ${ativo ? PILULA_ON : PILULA_OFF}`}
    >
      {ativo ? 'Ocultar encerrados' : `Mostrar encerrados (${quantidade})`}
    </button>
  )
}
