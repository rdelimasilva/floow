'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { aprovarDuplicata, recusarDuplicata } from '@/lib/finance/duplicata-actions'
import type { DuplicataPendente } from '@/lib/finance/duplicata-queries'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * A fila mostra os dois lançamentos e o intervalo entre as emissões.
 *
 * O intervalo é o porquê do par, e sem ele a tela mostraria dois lançamentos
 * de mesma data e valor sem razão nenhuma para desconfiar — que é exatamente
 * a cara de uma compra repetida legítima ("Westwing" cinco vezes no mesmo
 * dia). O que separa uma coisa da outra é a fonte ter reemitido o mesmo evento
 * horas depois, e é isso que o cartão precisa dizer.
 *
 * Sem "aprovar todas", pelo mesmo motivo da fila de conciliação: a decisão é
 * par por par por desenho, e um botão de varredura devolveria o problema que
 * este gate existe para resolver.
 */
export function DuplicateProposalQueue({ propostas: iniciais }: { propostas: DuplicataPendente[] }) {
  const { toast } = useToast()
  const [propostas, setPropostas] = useState(iniciais)
  const [decidindo, setDecidindo] = useState<string | null>(null)

  /**
   * A action devolve `false` por mais de um motivo: a proposta já não está
   * pendente (duas abas, dois cliques) ou a duplicata foi ignorada na janela
   * entre propor e aprovar. Não é erro, mas também não é o que o clique pediu
   * — dizer "removido" sem checar o retorno mentiria sobre qual decisão valeu.
   */
  async function decidir(proposta: DuplicataPendente, eDuplicata: boolean) {
    setDecidindo(proposta.id)
    try {
      const decidiuAgora = eDuplicata
        ? (await aprovarDuplicata(proposta.id)).efetivada
        : (await recusarDuplicata(proposta.id)).recusada

      setPropostas((prev) => prev.filter((p) => p.id !== proposta.id))

      if (!decidiuAgora) {
        toast('Essa proposta já não valia mais. Recarregue a fila.')
      } else if (eDuplicata) {
        toast('Lançamento removido das somas. Dá para desfazer pelo próprio lançamento.')
      } else {
        toast('Marcados como lançamentos diferentes.')
      }
    } finally {
      setDecidindo(null)
    }
  }

  if (propostas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
        <p className="text-gray-500">Nenhuma duplicata para decidir.</p>
        <p className="mt-1 text-sm text-gray-400">
          O floow avisa aqui quando o banco mandar o mesmo lançamento duas vezes.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {propostas.map((p) => (
        <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-900">{formatBRL(p.duplicata.amountCents)}</span>
            {p.contaNome !== null && <span className="text-sm text-gray-500">{p.contaNome}</span>}
          </div>

          <p className="mt-2 text-sm text-gray-600">
            O banco mandou este lançamento duas vezes, com{' '}
            <strong>
              {p.horasEntreEmissoes < 1
                ? `${Math.round(p.horasEntreEmissoes * 60)} minutos`
                : `${p.horasEntreEmissoes.toFixed(1)} horas`}
            </strong>{' '}
            entre uma e outra.
          </p>

          <div className="mt-3 space-y-2 text-sm">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Fica</span>
              <p className="text-gray-900">{p.manter.description}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-amber-700">Sai das somas</span>
              <p className="text-gray-900">{p.duplicata.description}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={decidindo === p.id} onClick={() => decidir(p, true)}>
              É o mesmo lançamento
            </Button>
            <Button variant="outline" disabled={decidindo === p.id} onClick={() => decidir(p, false)}>
              São lançamentos diferentes
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
